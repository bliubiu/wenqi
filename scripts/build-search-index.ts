/**
 * 文气项目全文检索索引构建脚本（方案 B：构建期 FTS5 + 前端轻量检索分片）
 *
 * 功能：
 * 1. 从数据底座（data/wenqi.db）读取全部作品
 * 2. 构建独立检索库 data/search.db：works 表 + FTS5 虚表（trigram 中文子串检索），
 *    文本经简体归一化（OpenCC 语料子集），作为召回验证与 `db:search` CLI 的查询底座
 * 3. 导出前端检索分片 public/data/processed/search/shard-{0..15}.json（v2 格式）：
 *    - poetId 字典化（dict-poets.json + 序号引用）
 *    - 条目为 [诗人序号, 归一化小写标题, 归一化小写文本前 16 字]
 *    - 按作品 ID 哈希分桶，供前端懒加载匹配
 *
 * 使用方式：
 * bun run scripts/build-search-index.ts
 */

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as OpenCC from 'opencc-js';
import { openDatabase, loadAllWorks, DEFAULT_DB } from './db-core';
import { toSimplified } from '../src/infrastructure/text/t2s';

const SEARCH_DB = 'data/search.db';
const OUT_DIR = path.join('public', 'data', 'processed', 'search');
const SHARD_COUNT = 16;
/** 前端索引的文本截断长度（名句多在前 16 字内） */
const TEXT_PREFIX_LEN = 16;

function log(message: string): void {
  console.log(`[文气检索] ${message}`);
}

function fail(message: string): never {
  console.error(`[文气检索] 错误: ${message}`);
  process.exit(1);
}

/** 作品哈希分桶（djb2）：分片路径固定，前端无需索引查询 */
export function shardOf(workId: string): number {
  let hash = 5381;
  for (let i = 0; i < workId.length; i++) {
    hash = ((hash << 5) + hash + workId.charCodeAt(i)) >>> 0;
  }
  return hash % SHARD_COUNT;
}

/* ──── 阶段一：构建 FTS5 检索库（简体归一化） ──── */

function buildSearchDb(works: Array<{ id: string; poetId: string; poetName: string | null; title: string; text: string | null; dynasty: string }>, converter: (s: string) => string): void {
  const startedAt = Date.now();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = SEARCH_DB + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  fs.mkdirSync(path.dirname(SEARCH_DB), { recursive: true });

  const db = new Database(SEARCH_DB, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');

  // 检索库内容表 + FTS5 虚表（trigram：中文按字符三元组，支持 ≥3 字子串 MATCH）
  db.exec(`
    CREATE TABLE works (
      id TEXT PRIMARY KEY,
      poet_id TEXT NOT NULL,
      poet_name TEXT,
      title TEXT NOT NULL,
      text TEXT,
      dynasty TEXT
    );
    CREATE VIRTUAL TABLE works_fts USING fts5(
      title, text,
      poet_id UNINDEXED, poet_name UNINDEXED, dynasty UNINDEXED,
      tokenize = 'trigram'
    );
  `);

  const insertWork = db.prepare('INSERT INTO works (id, poet_id, poet_name, title, text, dynasty) VALUES (?, ?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO works_fts (title, text, poet_id, poet_name, dynasty) VALUES (?, ?, ?, ?, ?)');
  const run = db.transaction((rows: typeof works) => {
    for (const w of rows) {
      const title = converter(w.title);
      const text = converter(w.text ?? '');
      insertWork.run(w.id, w.poetId, converter(w.poetName ?? ''), title, text, w.dynasty ?? null);
      insertFts.run(title, text, w.poetId, converter(w.poetName ?? ''), w.dynasty ?? null);
    }
  });
  for (let i = 0; i < works.length; i += 5000) {
    run(works.slice(i, i + 5000));
  }

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const sizeMB = (fs.statSync(SEARCH_DB).size / 1024 / 1024).toFixed(1);
  log(`FTS5 检索库构建完成: ${SEARCH_DB}（${works.length} 首，简体归一化，${sizeMB} MB，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s）`);
}

/* ──── 阶段二：导出前端检索分片（v2：字典化 + 归一化） ──── */

function exportShards(works: Array<{ id: string; poetId: string; title: string; text: string | null }>, converter: (s: string) => string): void {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 诗人 ID 字典
  const poetDict = [...new Set(works.map((w) => w.poetId))].sort();
  const poetIdx = new Map(poetDict.map((id, i) => [id, i]));
  fs.writeFileSync(path.join(OUT_DIR, 'dict-poets.json'), JSON.stringify({ v: 1, poets: poetDict }), 'utf-8');

  const shards: Array<Array<[number, string, string]>> = Array.from({ length: SHARD_COUNT }, () => []);
  for (const w of works) {
    const item: [number, string, string] = [
      poetIdx.get(w.poetId)!,
      converter(w.title).toLowerCase(),
      converter(w.text ?? '').toLowerCase().slice(0, TEXT_PREFIX_LEN),
    ];
    shards[shardOf(w.id)].push(item);
  }

  let total = 0;
  for (let i = 0; i < SHARD_COUNT; i++) {
    fs.writeFileSync(
      path.join(OUT_DIR, `shard-${i}.json`),
      JSON.stringify({ v: 2, count: shards[i].length, items: shards[i] }),
      'utf-8'
    );
    total += shards[i].length;
  }

  const manifest = {
    version: 2,
    strategy: 'hash-16',
    normalization: 't2s-opencc-corpus-subset',
    textPrefixLen: TEXT_PREFIX_LEN,
    shardCount: SHARD_COUNT,
    poetDict: 'dict-poets.json',
    workCount: total,
    exportedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const sizeMB = (fs.readdirSync(OUT_DIR).reduce((acc, f) => acc + fs.statSync(path.join(OUT_DIR, f)).size, 0) / 1024 / 1024).toFixed(1);
  log(`前端检索分片导出完成（v2）: ${SHARD_COUNT} 片 / ${total} 首 / 诗人字典 ${poetDict.length} 条，输出目录 ${OUT_DIR}（合计 ${sizeMB} MB）`);
}

/* ──── 主流程 ──── */

function main(): void {
  console.log('=== 文气项目全文检索索引构建 ===\n');

  if (!fs.existsSync(DEFAULT_DB)) {
    fail(`数据底座不存在，请先运行数据管道（bun run data:all）：${DEFAULT_DB}`);
  }

  const converter = OpenCC.Converter({ from: 't', to: 'cn' });

  log(`读取作品数据...`);
  const db = openDatabase(DEFAULT_DB, { readonly: true });
  const works = loadAllWorks(db).map((w) => ({
    id: w.id,
    poetId: w.poetId,
    poetName: w.poetName,
    title: w.title,
    text: w.text,
    dynasty: w.dynasty,
  }));
  db.close();
  log(`作品数量: ${works.length}`);

  log(`构建 FTS5 检索库...`);
  buildSearchDb(works, converter);

  log(`导出前端检索分片...`);
  exportShards(works, converter);

  console.log('\n=== 构建完成 ===');
}

if (import.meta.main) {
  main();
}

