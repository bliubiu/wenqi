/**
 * 文气 · 意境语义索引构建脚本（WQ-4 阶段一：意境标签倒排）
 *
 * 流程：
 * 1. 读取人工维护的标签词表 data/processed/semantics/labels.yaml
 * 2. 从数据底座（data/wenqi.db）按与 build-search-index 完全相同的顺序读取全部作品
 * 3. 逐作品按特征词词频打分（标题命中 ×3，正文按出现次数累加），取 Top-3 且达阈值标签
 * 4. 产出 public/data/processed/semantics/：
 *    - labels.json：标签名与同义词（运行时查询入口）
 *    - shard-{0..15}.json：{ labelIdx: [ΔworkLocalIdx, ...] } 紧凑倒排
 *    - manifest.json：独立语义版本（缓存键）、标签数、覆盖作品数、条目数、总体积
 *
 * 关键不变量：语义分片与 search 分片使用同一作品哈希分桶与同一遍历顺序，
 * 因此 workLocalIdx 即 search/shard-k.json 的 items 下标。构建期对全部条目做对齐校验，
 * 不一致即失败。分片只存增量的作品局部序号（首条为绝对序号，其后为差值），
 * 诗人序号可由检索分片同一位置的条目恢复，保证总体积 ≤ 3MB。
 *
 * 使用方式：
 *   bun run scripts/build-semantic-index.ts
 *   MIN_SCORE=3 bun run scripts/build-semantic-index.ts   # 体积超预算时提高阈值
 */

import * as fs from 'fs';
import * as path from 'path';
import * as OpenCC from 'opencc-js';
import * as YAML from 'yaml';
import { DEFAULT_DB, openDatabase, loadAllWorks } from './db-core';
import { toSimplified } from '../src/infrastructure/text/t2s';

const LABELS_SRC = path.join('data', 'processed', 'semantics', 'labels.yaml');
const SEARCH_DIR = path.join('public', 'data', 'processed', 'search');
const OUT_DIR = path.join('public', 'data', 'processed', 'semantics');
const SHARD_COUNT = 16;
/** 语义分片总体积预算：3MB */
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
/** 默认入选阈值（标题命中 ×3 后通常可达标） */
const DEFAULT_MIN_SCORE = 2;
/** 每作品最多保留的标签数 */
const TOP_N = 3;

export interface LabelDef {
  name: string;
  synonyms: string[];
  features: string[];
}

export type FeatureIndex = Map<string, Array<{ labelIdx: number; word: string }>>;

function log(message: string): void {
  console.log(`[文气语义] ${message}`);
}

function fail(message: string): never {
  console.error(`[文气语义] 错误: ${message}`);
  process.exit(1);
}

/** 作品哈希分桶（djb2），必须与 build-search-index 保持一致 */
export function shardOf(workId: string): number {
  let hash = 5381;
  for (let i = 0; i < workId.length; i++) {
    hash = ((hash << 5) + hash + workId.charCodeAt(i)) >>> 0;
  }
  return hash % SHARD_COUNT;
}

/** 解析并校验标签词表 */
export function parseLabels(raw: string): LabelDef[] {
  const doc = YAML.parse(raw) as { labels?: unknown } | null;
  if (!doc || !Array.isArray(doc.labels)) {
    throw new Error('标签词表格式错误：缺少 labels 数组');
  }
  const names = new Set<string>();
  return doc.labels.map((item, i) => {
    const entry = item as Partial<LabelDef>;
    const name = String(entry?.name ?? '').trim();
    if (!name) throw new Error(`第 ${i + 1} 个标签缺少 name`);
    if (names.has(name)) throw new Error(`标签名重复：${name}`);
    names.add(name);
    const features = (entry?.features ?? []).map((f) => String(f).trim()).filter(Boolean);
    if (features.length === 0) throw new Error(`标签「${name}」缺少特征词`);
    const synonyms = (entry?.synonyms ?? []).map((s) => String(s).trim()).filter(Boolean);
    return { name, synonyms, features };
  });
}

/** 按特征词首字建倒排，避免逐作品逐标签全量扫描 */
export function buildFeatureIndex(labels: LabelDef[], normalize: (s: string) => string = (s) => s): FeatureIndex {
  const index: FeatureIndex = new Map();
  labels.forEach((label, labelIdx) => {
    for (const feature of label.features) {
      const word = normalize(feature);
      if (!word) continue;
      const head = word[0];
      const list = index.get(head);
      if (list) list.push({ labelIdx, word });
      else index.set(head, [{ labelIdx, word }]);
    }
  });
  return index;
}

/** 单段文本按特征词出现次数累计得分（text 需已归一化小写） */
function accumulate(scores: number[], text: string, weight: number, index: FeatureIndex): void {
  for (let i = 0; i < text.length; i++) {
    const candidates = index.get(text[i]);
    if (!candidates) continue;
    for (const { labelIdx, word } of candidates) {
      if (text.startsWith(word, i)) scores[labelIdx] += weight;
    }
  }
}

/** 逐作品打分：标题命中 ×3 + 正文命中次数（入参需已归一化小写） */
export function scoreWork(
  title: string,
  text: string,
  labelCount: number,
  index: FeatureIndex
): number[] {
  const scores = new Array<number>(labelCount).fill(0);
  accumulate(scores, title, 3, index);
  accumulate(scores, text, 1, index);
  return scores;
}

/** 取达阈值的前 N 个标签（同分按标签序号稳定排序） */
export function pickTopLabels(scores: number[], minScore: number, topN: number = TOP_N): number[] {
  const candidates = scores
    .map((score, labelIdx) => ({ score, labelIdx }))
    .filter(({ score }) => score >= minScore);
  candidates.sort((a, b) => b.score - a.score || a.labelIdx - b.labelIdx);
  return candidates.slice(0, topN).map(({ labelIdx }) => labelIdx);
}

/** 内容哈希：保证语义版本随词表/阈值/产出变化，供前端 IndexedDB 缓存键使用 */
export function semanticVersionOf(rawLabels: string, minScore: number, entryCount: number, labeledWorkCount: number): string {
  const source = `${rawLabels}|${minScore}|${entryCount}|${labeledWorkCount}`;
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0;
  }
  return `semantic-v1-${hash.toString(16)}`;
}

interface SemanticShardFile {
  v: number;
  count: number;
  /** 标签序号 → [作品局部序号增量, ...]（首条为绝对序号，其后为与前一条的差值） */
  labels: Record<string, number[]>;
}

/* ──── 主流程 ──── */

function main(): void {
  console.log('=== 文气项目意境语义索引构建 ===\n');

  if (!fs.existsSync(LABELS_SRC)) {
    fail(`标签词表不存在：${LABELS_SRC}`);
  }
  if (!fs.existsSync(DEFAULT_DB)) {
    fail(`数据底座不存在，请先运行数据管道（bun run data:all）：${DEFAULT_DB}`);
  }

  const minScore = Number(process.env.MIN_SCORE ?? DEFAULT_MIN_SCORE);
  if (!Number.isFinite(minScore) || minScore <= 0) {
    fail(`MIN_SCORE 非法：${process.env.MIN_SCORE}`);
  }

  const rawLabels = fs.readFileSync(LABELS_SRC, 'utf-8');
  const labels = parseLabels(rawLabels);
  log(`标签词表加载完成：${labels.length} 个标签，入选阈值 ${minScore}`);

  const converter = OpenCC.Converter({ from: 't', to: 'cn' });
  const normalize = (s: string) => converter(s).toLowerCase();
  const featureIndex = buildFeatureIndex(labels, normalize);

  log('读取作品数据...');
  const db = openDatabase(DEFAULT_DB, { readonly: true });
  const works = loadAllWorks(db).map((w) => ({
    id: w.id,
    poetId: w.poetId,
    title: w.title,
    text: w.text,
  }));
  db.close();
  log(`作品数量: ${works.length}`);

  // 诗人字典必须与 search/dict-poets.json 完全一致
  const poetDict = [...new Set(works.map((w) => w.poetId))].sort();
  const searchDictFile = path.join(SEARCH_DIR, 'dict-poets.json');
  if (!fs.existsSync(searchDictFile)) {
    fail(`检索字典不存在，请先运行 bun run data:search：${searchDictFile}`);
  }
  const searchDict = JSON.parse(fs.readFileSync(searchDictFile, 'utf-8')) as { poets: string[] };
  if (searchDict.poets.length !== poetDict.length) {
    fail(`诗人字典与检索索引不一致：语义 ${poetDict.length} 条，检索 ${searchDict.poets.length} 条`);
  }

  const shardEntries: Array<Map<number, number[]>> = Array.from({ length: SHARD_COUNT }, () => new Map());
  const lastLocalIdx: Array<Map<number, number>> = Array.from({ length: SHARD_COUNT }, () => new Map());
  const builtTitles: string[][] = Array.from({ length: SHARD_COUNT }, () => []);
  let labeledWorkCount = 0;
  let entryCount = 0;

  log('逐作品打分并构建倒排...');
  const startedAt = Date.now();
  for (const work of works) {
    const title = normalize(work.title);
    const text = normalize(work.text ?? '');
    const shard = shardOf(work.id);
    const localIdx = builtTitles[shard].length;
    builtTitles[shard].push(title);

    const picked = pickTopLabels(scoreWork(title, text, labels.length, featureIndex), minScore);
    if (picked.length === 0) continue;

    labeledWorkCount++;
    for (const labelIdx of picked) {
      let arr = shardEntries[shard].get(labelIdx);
      if (!arr) {
        arr = [];
        shardEntries[shard].set(labelIdx, arr);
      }
      const last = lastLocalIdx[shard].get(labelIdx);
      arr.push(last === undefined ? localIdx : localIdx - last);
      lastLocalIdx[shard].set(labelIdx, localIdx);
      entryCount++;
    }
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const coverage = ((labeledWorkCount / works.length) * 100).toFixed(1);
  log(`打分完成：覆盖 ${labeledWorkCount} 首（${coverage}%），标签条目 ${entryCount} 条，耗时 ${elapsed}s`);
  if (Number(coverage) < 90) {
    console.warn(`[文气语义] 警告: 标签覆盖率 ${coverage}% 低于目标 90%，可下调 MIN_SCORE`);
  }

  /* ──── 写出 ──── */
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(OUT_DIR, 'labels.json'),
    JSON.stringify({ v: 1, labels: labels.map(({ name, synonyms }) => ({ name, synonyms })) }),
    'utf-8'
  );

  for (let i = 0; i < SHARD_COUNT; i++) {
    const labelsObj: Record<string, number[]> = {};
    let entries = 0;
    for (const [labelIdx, arr] of shardEntries[i]) {
      labelsObj[String(labelIdx)] = arr;
      entries += arr.length;
    }
    const shardFile: SemanticShardFile = { v: 1, count: entries, labels: labelsObj };
    fs.writeFileSync(path.join(OUT_DIR, `shard-${i}.json`), JSON.stringify(shardFile), 'utf-8');
  }

  /* ──── 对齐校验：workLocalIdx 必须与 search 分片逐条一致 ──── */
  log('校验语义分片与检索分片对齐...');
  for (let i = 0; i < SHARD_COUNT; i++) {
    const searchShardPath = path.join(SEARCH_DIR, `shard-${i}.json`);
    if (!fs.existsSync(searchShardPath)) {
      fail(`检索分片不存在，请先运行 bun run data:search：${searchShardPath}`);
    }
    const searchShard = JSON.parse(fs.readFileSync(searchShardPath, 'utf-8')) as {
      items: Array<[number, string, string]>;
    };
    if (searchShard.items.length !== builtTitles[i].length) {
      fail(`分片 ${i} 作品数量不一致：检索 ${searchShard.items.length}，语义 ${builtTitles[i].length}`);
    }
    const shardFile = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `shard-${i}.json`), 'utf-8')) as SemanticShardFile;
    for (const [labelKey, arr] of Object.entries(shardFile.labels)) {
      let localIdx = 0;
      for (let j = 0; j < arr.length; j++) {
        localIdx = j === 0 ? arr[j] : localIdx + arr[j];
        const item = searchShard.items[localIdx];
        if (!item) {
          fail(`分片 ${i} 标签 ${labelKey} 的作品局部序号越界：${localIdx}`);
        }
        if (item[1] !== builtTitles[i][localIdx]) {
          fail(`分片 ${i} 标签 ${labelKey} 标题不一致：局部序号 ${localIdx}`);
        }
      }
    }
  }
  log('对齐校验通过');

  const totalBytes = fs
    .readdirSync(OUT_DIR)
    .reduce((acc, f) => acc + fs.statSync(path.join(OUT_DIR, f)).size, 0);

  const manifest = {
    version: semanticVersionOf(rawLabels, minScore, entryCount, labeledWorkCount),
    strategy: 'label-tf-top3',
    encoding: 'delta-local-idx',
    minScore,
    topN: TOP_N,
    normalization: 't2s-opencc-corpus-subset',
    labelCount: labels.length,
    labeledWorkCount,
    workCount: works.length,
    entryCount,
    shardCount: SHARD_COUNT,
    totalBytes,
    exportedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  log(`语义索引导出完成: ${SHARD_COUNT} 片 / ${labels.length} 标签 / ${entryCount} 条 / ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  if (totalBytes > MAX_TOTAL_BYTES) {
    fail(
      `语义分片总体积 ${(totalBytes / 1024 / 1024).toFixed(2)} MB 超过 3MB 预算` +
        `（${entryCount} 条），请调高 MIN_SCORE（当前 ${minScore}）后重跑`
    );
  }

  console.log('\n=== 构建完成 ===');
}

if (import.meta.main) {
  main();
}
