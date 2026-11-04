/**
 * 文气数据底座 CLI
 *
 * 数据库（data/wenqi.db，WAL 模式）是项目数据的唯一真相源。
 * 主管道（raw → process-data → calculate-scores → build-index）全部直写数据库，
 * 前端消费的所有 JSON 由 export 命令从数据库导出。
 *
 * 子命令：
 *   import  从 JSON 快照恢复数据库（历史快照重建通道，主管道不使用）
 *   export  从数据库导出前端消费的全部 JSON（顶层清单 + 按诗人作品分片）
 *   dump    从数据库导出 poets.json / works.json（调试用）
 *   stats   输出数据库统计信息
 *
 * 使用方式：
 *   bun run scripts/db.ts import [--source data/processed] [--db data/wenqi.db]
 *   bun run scripts/db.ts export [--db data/wenqi.db] [--out public/data/processed]
 *   bun run scripts/db.ts dump   [--db data/wenqi.db] [--out data/processed]
 *   bun run scripts/db.ts stats  [--db data/wenqi.db]
 */

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  DEFAULT_DB, SCHEMA_VERSION,
  openDatabase, rebuildDatabase,
  ensureRelationsSchema,
  insertPoets, insertWorks, insertScores, insertNodes,
  loadPoets, loadAllWorks, loadScores, loadNodes, loadSpatialIndex, loadRelations,
  replaceRegions, loadRegions,
  setMeta, getMeta, logStage,
  type PoetRow, type WorkRow, type ScoreRow, type NodeRow, type RegionRow,
} from './db-core';
import { dynastyToTable, shardBucket } from '../src/infrastructure/data/shard';
import { RELATION_TYPES } from '../src/domain/entities/Relation';

const DEFAULT_SOURCE = 'data/processed';
const DEFAULT_OUT = 'public/data/processed';

function log(message: string): void {
  console.log(`[文气DB] ${message}`);
}

function fail(message: string): never {
  console.error(`[文气DB] 错误: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { cmd: string; options: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const options: Record<string, string> = {};
  let firstPositional = true;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      options[rest[i].slice(2)] = rest[i + 1] ?? '';
      i++;
    } else if (firstPositional) {
      options._query = rest[i];
      firstPositional = false;
    }
  }
  return { cmd, options };
}

/* ──── import：从 JSON 快照恢复数据库 ──── */

function cmdImport(options: Record<string, string>): void {
  const sourceDir = options.source ?? DEFAULT_SOURCE;
  const dbPath = options.db ?? DEFAULT_DB;
  const startedAt = Date.now();

  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`数据源不存在 manifest.json：${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const file of ['poets.json', 'works.json', 'scores.json', 'nodes.json']) {
    if (!fs.existsSync(path.join(sourceDir, file))) {
      fail(`数据源缺少 ${file}：${sourceDir}`);
    }
  }

  log(`重建数据库: ${dbPath}（WAL 模式）`);
  const db = rebuildDatabase(dbPath);

  log(`读取诗人数...`);
  const poets: PoetRow[] = JSON.parse(fs.readFileSync(path.join(sourceDir, 'poets.json'), 'utf8'));
  const poetsResult = insertPoets(db, poets);
  log(`诗人写入完成: ${poetsResult.inserted} 位${poetsResult.skipped > 0 ? `（跳过重复 ID ${poetsResult.skipped} 条）` : ''}`);

  log(`读取作品数据（按诗人朝代分表切片写入）...`);
  const works: WorkRow[] = JSON.parse(fs.readFileSync(path.join(sourceDir, 'works.json'), 'utf8'));
  const poetDynasty = new Map(poets.map((p) => [p.id, p.dynasty]));
  const counts = insertWorks(db, works, poetDynasty);
  const workTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const [table, count] of Object.entries(counts)) {
    log(`  分表 ${table}: ${count} 首`);
  }
  log(`作品写入完成: ${workTotal} 首（提交 ${works.length} 条${works.length - workTotal > 0 ? `，去重 ${works.length - workTotal} 条` : ''}）`);

  log(`读取三气评分...`);
  const scores: ScoreRow[] = JSON.parse(fs.readFileSync(path.join(sourceDir, 'scores.json'), 'utf8'));
  const scoresResult = insertScores(db, scores);
  log(`评分写入完成: ${scoresResult.inserted} 条`);

  log(`读取星系节点...`);
  const nodes: NodeRow[] = JSON.parse(fs.readFileSync(path.join(sourceDir, 'nodes.json'), 'utf8'));
  const nodesResult = insertNodes(db, nodes);
  log(`节点写入完成: ${nodesResult.inserted} 个`);

  setMeta(db, 'schema_version', SCHEMA_VERSION);
  setMeta(db, 'dataset_version', manifest.version);
  setMeta(db, 'algorithm_version', manifest.algorithmVersion);
  setMeta(db, 'imported_at', new Date().toISOString());
  logStage(db, {
    stage: 'import',
    datasetVersion: manifest.version,
    source: sourceDir,
    poetsCount: poetsResult.inserted,
    worksCount: workTotal,
    scoresCount: scoresResult.inserted,
    nodesCount: nodesResult.inserted,
    durationMs: Date.now() - startedAt,
  });

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();

  const sizeMB = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1);
  log(`导入完成: 诗人 ${poetsResult.inserted} 位 / 作品 ${workTotal} 首 / 评分 ${scoresResult.inserted} 条 / 节点 ${nodesResult.inserted} 个，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s，库文件 ${sizeMB} MB`);
}

/* ──── 关系分片导出 ──── */

const RELATION_SHARD_COUNT = 16;

function relationShardIndex(poetId: string): number {
  let hash = 5381;
  for (let i = 0; i < poetId.length; i++) {
    hash = ((hash << 5) + hash + poetId.charCodeAt(i)) >>> 0;
  }
  return hash % RELATION_SHARD_COUNT;
}

/**
 * 按 source 诗人 16 分片导出关系（前端 ShardedRelationRepository 懒加载消费）：
 * - relations/dict.json：诗人 ID 全集字典（下标即序号）
 * - relations/shard-{i}.json：edges 为 [sIdx, tIdx, typeIdx, wInt, evIdx] 紧凑元组
 */
function exportRelationShards(db: Database, outDir: string): { relationCount: number; shardSizes: number[] } {
  const relations = loadRelations(db);
  const shardRoot = path.join(outDir, 'relations');
  fs.rmSync(shardRoot, { recursive: true, force: true });
  fs.mkdirSync(shardRoot, { recursive: true });
  if (relations.length === 0) {
    log('  relations 表为空，跳过关系分片导出（请先运行 bun run data:relations）');
    return { relationCount: 0, shardSizes: [] };
  }

  const poets = loadPoets(db);
  const poetDict = poets.map((p) => p.id);
  const poetIdx = new Map(poetDict.map((id, i) => [id, i]));

  const shards = Array.from({ length: RELATION_SHARD_COUNT }, () => ({
    poets: new Set<number>(),
    edges: [] as Array<[number, number, number, number, number]>,
    ev: [] as Array<Record<string, unknown>>,
  }));
  // 证据下标为分片内局部下标，去重索引须按分片独立
  const evIndexes = shards.map(() => new Map<string, number>());

  for (const r of relations) {
    const sIdx = poetIdx.get(r.sourceId);
    const tIdx = poetIdx.get(r.targetId);
    if (sIdx === undefined || tIdx === undefined) continue;
    const shardIdx = relationShardIndex(r.sourceId);
    const shard = shards[shardIdx];
    const evIndex = evIndexes[shardIdx];
    // 证据按内容去重共享
    const evKey = r.evidence ? JSON.stringify(r.evidence) : '';
    let eIdx = -1;
    if (r.evidence && evKey) {
      const cached = evIndex.get(evKey);
      if (cached !== undefined) {
        eIdx = cached;
      } else {
        eIdx = shard.ev.length;
        shard.ev.push(r.evidence);
        evIndex.set(evKey, eIdx);
      }
    }
    shard.poets.add(sIdx);
    shard.poets.add(tIdx);
    const typeIdx = RELATION_TYPES.indexOf(r.type as (typeof RELATION_TYPES)[number]);
    shard.edges.push([sIdx, tIdx, typeIdx, Math.round(r.weight * 100), eIdx]);
  }

  fs.writeFileSync(path.join(shardRoot, 'dict.json'), JSON.stringify({ v: 1, poets: poetDict }));

  const shardSizes: number[] = [];
  for (let i = 0; i < RELATION_SHARD_COUNT; i++) {
    const shard = shards[i];
    const payload = { v: 1, count: shard.edges.length, poets: [...shard.poets].sort((a, b) => a - b), edges: shard.edges, ev: shard.ev };
    const file = path.join(shardRoot, `shard-${i}.json`);
    fs.writeFileSync(file, JSON.stringify(payload));
    shardSizes.push(fs.statSync(file).size);
  }

  const maxKB = (Math.max(...shardSizes) / 1024).toFixed(0);
  log(`  关系分片: ${RELATION_SHARD_COUNT} 片（最大 ${maxKB} KB）`);
  return { relationCount: relations.length, shardSizes };
}

/* ──── export：导出前端消费的全部 JSON ──── */

function exportTopLevelJson(db: Database, outDir: string): void {
  // poets.json
  const poets = loadPoets(db);
  fs.writeFileSync(path.join(outDir, 'poets.json'), JSON.stringify(poets, null, 2), 'utf-8');
  log(`  poets.json: ${poets.length} 位诗人`);

  // nodes.json
  const nodes = loadNodes(db);
  fs.writeFileSync(path.join(outDir, 'nodes.json'), JSON.stringify(nodes, null, 2), 'utf-8');
  log(`  nodes.json: ${nodes.length} 个节点`);

  // scores.json
  const scores = loadScores(db);
  fs.writeFileSync(path.join(outDir, 'scores.json'), JSON.stringify(scores, null, 2), 'utf-8');
  log(`  scores.json: ${scores.length} 条评分`);

  // regions.json（诗人籍贯区划，供地理视图与地图定位消费）
  const regions = loadRegions(db);
  if (regions.length > 0) {
    fs.writeFileSync(path.join(outDir, 'regions.json'), JSON.stringify(regions, null, 2), 'utf-8');
    log(`  regions.json: ${regions.length} 个区划`);
  } else {
    log(`  regions.json: regions 表为空，跳过（请先运行 db:regions）`);
  }

  // spatial-index.json
  const spatial = loadSpatialIndex(db);
  if (spatial !== null) {
    fs.writeFileSync(path.join(outDir, 'spatial-index.json'), JSON.stringify(spatial, null, 2), 'utf-8');
    log(`  spatial-index.json: 已导出`);
  } else {
    log(`  spatial-index.json: 数据库中未构建空间索引，跳过（请先运行 build-index）`);
  }
}

function exportWorkShards(db: Database, outDir: string): { poetShards: number; workCount: number } {
  const poets = loadPoets(db);
  const shardRoot = path.join(outDir, 'works', 'poet');
  fs.rmSync(shardRoot, { recursive: true, force: true });
  fs.mkdirSync(shardRoot, { recursive: true });

  const workStmts = new Map<string, ReturnType<Database['prepare']>>();
  let workTotal = 0;
  let mismatchCount = 0;

  for (let i = 0; i < poets.length; i++) {
    const poet = poets[i];
    const table = dynastyToTable(poet.dynasty);
    let stmt = workStmts.get(table);
    if (!stmt) {
      stmt = db.prepare(`SELECT id, title, poet_id AS poetId, poet_name AS poetName, dynasty, genre, text FROM ${table} WHERE poet_id = ?`);
      workStmts.set(table, stmt);
    }
    const works = stmt.all(poet.id) as any[];

    if (poet.workCount !== works.length) mismatchCount++;
    workTotal += works.length;

    const shard = {
      poetId: poet.id,
      dynasty: poet.dynasty,
      count: works.length,
      works,
    };
    const bucketDir = path.join(shardRoot, shardBucket(poet.id));
    fs.mkdirSync(bucketDir, { recursive: true });
    fs.writeFileSync(path.join(bucketDir, `${poet.id}.json`), JSON.stringify(shard));

    if ((i + 1) % 5000 === 0) {
      log(`  进度: ${i + 1}/${poets.length} 位诗人`);
    }
  }

  const manifest = {
    version: getMeta(db, 'dataset_version'),
    exportedAt: new Date().toISOString(),
    strategy: 'by-poet',
    bucketCount: 256,
    poetShards: poets.length,
    workCount: workTotal,
  };
  fs.writeFileSync(path.join(shardRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

  if (mismatchCount > 0) {
    log(`提示: ${mismatchCount} 位诗人的作品数与其元数据 workCount 不一致`);
  }
  return { poetShards: poets.length, workCount: workTotal };
}

function cmdExport(options: Record<string, string>): void {
  const dbPath = options.db ?? DEFAULT_DB;
  const outDir = options.out ?? DEFAULT_OUT;

  if (!fs.existsSync(dbPath)) {
    fail(`数据库不存在，请先运行数据管道（bun run data:all）：${dbPath}`);
  }

  const db = openDatabase(dbPath, { readonly: true });
  try {
    log(`导出顶层清单 JSON → ${outDir}`);
    fs.mkdirSync(outDir, { recursive: true });
    exportTopLevelJson(db, outDir);

    log(`按诗人分片导出作品...`);
    const { poetShards, workCount } = exportWorkShards(db, outDir);

    log(`导出关系分片...`);
    const { relationCount } = exportRelationShards(db, outDir);

    // manifest.json：数据集版本清单（对顶层导出文件记录哈希）
    const files = ['poets.json', 'scores.json', 'nodes.json', 'regions.json', 'spatial-index.json']
      .filter((f) => fs.existsSync(path.join(outDir, f)))
      .map((f) => {
        const p = path.join(outDir, f);
        return {
          path: f,
          size: fs.statSync(p).size,
          hash: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
        };
      });
    const manifest = {
      version: getMeta(db, 'dataset_version'),
      algorithmVersion: getMeta(db, 'algorithm_version'),
      relationVersion: getMeta(db, 'relation_version'),
      generatedAt: new Date().toISOString(),
      stats: {
        poetCount: poetsCount(db),
        workCount,
        nodeCount: nodeCount(db),
        relationCount,
      },
      files,
    };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    log(`导出完成: ${poetShards} 个诗人分片 / ${workCount} 首作品，输出目录 ${outDir}`);
  } finally {
    db.close();
  }
}

function poetsCount(db: Database): number {
  return (db.query('SELECT COUNT(*) AS c FROM poets').get() as { c: number }).c;
}

function nodeCount(db: Database): number {
  return (db.query('SELECT COUNT(*) AS c FROM nodes').get() as { c: number }).c;
}

/* ──── dump：导出旧格式中间产物（调试） ──── */

function cmdDump(options: Record<string, string>): void {
  const dbPath = options.db ?? DEFAULT_DB;
  const outDir = options.out ?? DEFAULT_SOURCE;

  if (!fs.existsSync(dbPath)) {
    fail(`数据库不存在：${dbPath}`);
  }
  const db = openDatabase(dbPath, { readonly: true });
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const poets = loadPoets(db);
    const works = loadAllWorks(db);
    fs.writeFileSync(path.join(outDir, 'poets.json'), JSON.stringify(poets, null, 2), 'utf-8');
    fs.writeFileSync(path.join(outDir, 'works.json'), JSON.stringify(works, null, 2), 'utf-8');
    log(`已导出调试快照: ${path.join(outDir, 'poets.json')}（${poets.length} 位）、works.json（${works.length} 首）`);
  } finally {
    db.close();
  }
}

/* ──── search：FTS5 召回验证 ──── */

const SEARCH_DB = 'data/search.db';

function cmdSearch(options: Record<string, string>): void {
  const query = options._query ?? '';
  const limit = Number(options.limit ?? 10);
  if (!query) {
    fail('用法: bun run scripts/db.ts search <关键词> [--limit 10]（≥3 字走 FTS5，更短走 LIKE）');
  }
  if (!fs.existsSync(SEARCH_DB)) {
    fail(`检索库不存在，请先运行 bun run data:search：${SEARCH_DB}`);
  }

  const db = new Database(SEARCH_DB, { readonly: true });
  try {
    let rows: any[];
    if (query.length >= 3) {
      // FTS5 trigram 子串检索（含 BM25 排序与摘要高亮）
      rows = db
        .query(
          `SELECT poet_name AS poetName, dynasty, title,
                  snippet(works_fts, 1, '「', '」', '…', 6) AS excerpt,
                  bm25(works_fts) AS rank
           FROM works_fts WHERE works_fts MATCH ?
           ORDER BY rank LIMIT ?`
        )
        .all(query, limit);
    } else {
      // trigram 最小 3 字符，更短的查询退化为 LIKE 全扫
      rows = db
        .query(
          `SELECT poet_name AS poetName, dynasty, title,
                  substr(text, max(1, instr(text, ?) - 4), 30) AS excerpt
           FROM works_fts WHERE title LIKE ? OR text LIKE ?
           LIMIT ?`
        )
        .all(query, `%${query}%`, `%${query}%`, limit);
    }

    console.log(`[文气检索] 「${query}」命中 ${rows.length} 条（FTS5 trigram / 检索库 ${SEARCH_DB}）:`);
    for (const r of rows) {
      console.log(`[文气检索]   ${r.title} —— ${r.poetName ?? '佚名'}（${r.dynasty ?? ''}）${r.excerpt ? ` ${r.excerpt}` : ''}`);
    }
  } finally {
    db.close();
  }
}

/* ──── apply-hometowns：籍贯数据写回 poets 表 ──── */

function cmdApplyHometowns(options: Record<string, string>): void {
  const sourceFile = options.source ?? 'data/processed/cnkgraph/poet-hometowns.json';
  const dbPath = options.db ?? DEFAULT_DB;
  const startedAt = Date.now();

  if (!fs.existsSync(sourceFile)) {
    fail(`籍贯数据不存在，请先运行 bun run data:hometown：${sourceFile}`);
  }
  if (!fs.existsSync(dbPath)) {
    fail(`数据库不存在，请先运行数据管道（bun run data:all）：${dbPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const items: Array<{ poetId: string; hometowns?: Array<{ Name?: string; RegionId?: string }> }> = raw.items ?? [];
  const db = openDatabase(dbPath);
  try {
    ensureRelationsSchema(db);
    const stmt = db.prepare('UPDATE poets SET hometown = ?, hometown_region_id = ? WHERE id = ?');
    let updated = 0;
    let withRegion = 0;
    const run = db.transaction(() => {
      for (const item of items) {
        const hometown = item.hometowns?.[0];
        if (!item.poetId || !hometown?.Name) continue;
        if (stmt.run(hometown.Name, hometown.RegionId ?? null, item.poetId).changes > 0) {
          updated++;
          if (hometown.RegionId) withRegion++;
        }
      }
    });
    run();
    // 数据内容已变化，更新数据集版本，使前端 IndexedDB 缓存失效
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setMeta(db, 'dataset_version', `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`);
    setMeta(db, 'hometowns_applied_at', new Date().toISOString());
    logStage(db, { stage: 'hometowns', poetsCount: updated, source: sourceFile, durationMs: Date.now() - startedAt });
    log(`籍贯写回完成: ${updated}/${items.length} 位诗人（含区划代码 ${withRegion} 位），耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } finally {
    db.close();
  }
}

/* ──── apply-regions：区划坐标写入 regions 表 ──── */

function cmdApplyRegions(options: Record<string, string>): void {
  const sourceFile = options.source ?? 'data/processed/cnkgraph/regions.json';
  const dbPath = options.db ?? DEFAULT_DB;
  const startedAt = Date.now();

  if (!fs.existsSync(sourceFile)) {
    fail(`区划数据不存在，请先运行 bun run data:regions：${sourceFile}`);
  }
  if (!fs.existsSync(dbPath)) {
    fail(`数据库不存在，请先运行数据管道（bun run data:all）：${dbPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const items: RegionRow[] = (raw.items ?? []).filter((item: RegionRow) => item.id && item.name);
  const db = openDatabase(dbPath);
  try {
    ensureRelationsSchema(db);
    const inserted = replaceRegions(db, items);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setMeta(db, 'dataset_version', `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`);
    setMeta(db, 'regions_applied_at', new Date().toISOString());
    logStage(db, { stage: 'regions', source: sourceFile, durationMs: Date.now() - startedAt });
    log(`区划写回完成: ${inserted}/${items.length} 个区划，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } finally {
    db.close();
  }
}

/* ──── stats ──── */

function cmdStats(options: Record<string, string>): void {
  const dbPath = options.db ?? DEFAULT_DB;
  if (!fs.existsSync(dbPath)) {
    fail(`数据库不存在，请先运行数据管道（bun run data:all）：${dbPath}`);
  }

  const db = openDatabase(dbPath, { readonly: true });
  const sizeMB = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1);
  const journalMode = (db.query('PRAGMA journal_mode').get() as any).journal_mode;

  console.log(`[文气DB] 数据库: ${dbPath}（${sizeMB} MB，journal_mode=${journalMode}）`);
  for (const key of ['schema_version', 'dataset_version', 'algorithm_version']) {
    const value = getMeta(db, key);
    if (value) console.log(`[文气DB] ${key}: ${value}`);
  }

  const tableNames = ['poets', 'relations', 'scores', 'nodes', 'spatial_index', 'import_log', 'works_pre_qin', 'works_han', 'works_wei_jin', 'works_tang', 'works_five_dynasties', 'works_song', 'works_yuan', 'works_ming', 'works_qing', 'works_modern', 'works_other'];
  for (const table of tableNames) {
    const row = db.query(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    if (row.c > 0) console.log(`[文气DB]   ${table}: ${row.c} 行`);
  }

  const stages = db.query('SELECT stage, imported_at, duration_ms FROM import_log ORDER BY id').all() as any[];
  if (stages.length > 0) {
    console.log('[文气DB] 管道阶段记录:');
    for (const s of stages) {
      console.log(`[文气DB]   ${s.stage}: ${s.imported_at}（耗时 ${(s.duration_ms / 1000).toFixed(1)}s）`);
    }
  }
  db.close();
}

function printUsage(): void {
  console.log(`
文气数据底座 CLI（SQLite / WAL / 作品按朝代分表 / DB 唯一真相源）

用法:
  bun run scripts/db.ts import [--source data/processed] [--db data/wenqi.db]
  bun run scripts/db.ts export [--db data/wenqi.db] [--out public/data/processed]
  bun run scripts/db.ts dump   [--db data/wenqi.db] [--out data/processed]
  bun run scripts/db.ts search <关键词> [--limit 10]
  bun run scripts/db.ts apply-hometowns [--source data/processed/cnkgraph/poet-hometowns.json] [--db data/wenqi.db]
  bun run scripts/db.ts apply-regions [--source data/processed/cnkgraph/regions.json] [--db data/wenqi.db]
  bun run scripts/db.ts stats  [--db data/wenqi.db]

快捷命令:
  bun run db:export    从数据库导出前端全部 JSON（清单 + 诗人分片 + 关系分片）
  bun run db:dump      导出 poets.json / works.json 调试快照
  bun run db:hometown  籍贯数据写回 poets 表
  bun run db:regions   区划坐标写回 regions 表
  bun run db:stats     查看数据库统计
`);
}

const { cmd, options } = parseArgs(process.argv.slice(2));
try {
  switch (cmd) {
    case 'import':
      cmdImport(options);
      break;
    case 'export':
      cmdExport(options);
      break;
    case 'dump':
      cmdDump(options);
      break;
    case 'search':
      cmdSearch(options);
      break;
    case 'apply-hometowns':
    case 'hometown':
      cmdApplyHometowns(options);
      break;
    case 'apply-regions':
    case 'regions':
      cmdApplyRegions(options);
      break;
    case 'stats':
      cmdStats(options);
      break;
    default:
      printUsage();
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
