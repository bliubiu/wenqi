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
  insertPoets, insertWorks, insertScores, insertNodes,
  loadPoets, loadAllWorks, loadScores, loadNodes, loadSpatialIndex,
  setMeta, getMeta, logStage,
  type PoetRow, type WorkRow, type ScoreRow, type NodeRow,
} from './db-core';
import { dynastyToTable, shardBucket } from '../src/infrastructure/data/shard';

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

    // manifest.json：数据集版本清单（对顶层导出文件记录哈希）
    const files = ['poets.json', 'scores.json', 'nodes.json', 'spatial-index.json']
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
      generatedAt: new Date().toISOString(),
      stats: {
        poetCount: poetsCount(db),
        workCount,
        nodeCount: nodeCount(db),
        relationCount: 0,
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

  const tableNames = ['poets', 'scores', 'nodes', 'spatial_index', 'import_log', 'works_pre_qin', 'works_han', 'works_wei_jin', 'works_tang', 'works_five_dynasties', 'works_song', 'works_yuan', 'works_ming', 'works_qing', 'works_modern', 'works_other'];
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
  bun run scripts/db.ts stats  [--db data/wenqi.db]

快捷命令:
  bun run db:export    从数据库导出前端全部 JSON（清单 + 诗人分片）
  bun run db:dump      导出 poets.json / works.json 调试快照
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
    case 'stats':
      cmdStats(options);
      break;
    default:
      printUsage();
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
