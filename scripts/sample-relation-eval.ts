/**
 * 关系挖掘人工标注样例生成
 *
 * 从 SQLite relations 表按类型分层抽取 100 条赠答/并称类关系边，
 * 产出 data/processed/relation-eval.json 供人工标注（label: true/false）。
 * 重复运行时按稳定 id 继承已有标注，不覆盖人工结果。
 *
 * 使用方式：bun run scripts/sample-relation-eval.ts [--seed 20261103] [--total 100]
 */

import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_DB } from './db-core';

const OUTPUT_FILE = 'data/processed/relation-eval.json';
const DEFAULT_SEED = 20261103;
const DEFAULT_TOTAL = 100;

/** 各类型抽样配额（合计 100） */
const STRATA: Array<{ type: string; count: number }> = [
  { type: 'FRIEND', count: 55 },
  { type: 'TEACHER_STUDENT', count: 20 },
  { type: 'SAME_SCHOOL', count: 25 },
];

export interface EvalCandidate {
  type: string;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  sourceDynasty: string | null;
  targetDynasty: string | null;
  weight: number;
  evidence: unknown;
}

export interface EvalSample extends EvalCandidate {
  /** 稳定标识：类型 + 无序诗人对 */
  id: string;
  /** true 关系成立；false 误配；null 待人工标注 */
  label: boolean | null;
  note: string;
}

function log(message: string): void {
  console.log(`[关系标注] ${message}`);
}

/** mulberry32：确定性伪随机，保证同种子抽样可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 稳定 id：同一对诗人在同一类型下始终得到相同标识，便于继承标注 */
export function sampleId(type: string, sourceId: string, targetId: string): string {
  return `${type}:${[sourceId, targetId].sort().join('|')}`;
}

/**
 * 分层抽样：按 STRATA 配额选取，候选不足时从剩余候选补齐到 total。
 * 同类型同无序诗人对只保留一条；结果按类型 + 权重降序排列。
 */
export function stratifiedSample(
  candidates: EvalCandidate[],
  total: number,
  seed: number,
  strata: Array<{ type: string; count: number }> = STRATA
): EvalSample[] {
  const random = mulberry32(seed);
  const seen = new Set<string>();
  const buckets = new Map<string, EvalCandidate[]>();

  for (const candidate of candidates) {
    const id = sampleId(candidate.type, candidate.sourceId, candidate.targetId);
    if (seen.has(id)) continue;
    seen.add(id);
    const list = buckets.get(candidate.type);
    if (list) list.push(candidate);
    else buckets.set(candidate.type, [candidate]);
  }

  const toSample = (candidate: EvalCandidate): EvalSample => ({
    ...candidate,
    id: sampleId(candidate.type, candidate.sourceId, candidate.targetId),
    label: null,
    note: '',
  });

  const picked: EvalSample[] = [];
  const pickedIds = new Set<string>();
  const takeFrom = (list: EvalCandidate[], count: number) => {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const candidate of shuffled) {
      if (picked.length >= total || count <= 0) break;
      const sample = toSample(candidate);
      if (pickedIds.has(sample.id)) continue;
      picked.push(sample);
      pickedIds.add(sample.id);
      count--;
    }
  };

  for (const { type, count } of strata) {
    takeFrom(buckets.get(type) ?? [], count);
  }

  // 配额未满时用剩余候选补齐
  if (picked.length < total) {
    const remaining: EvalCandidate[] = [];
    for (const list of buckets.values()) {
      for (const candidate of list) {
        if (!pickedIds.has(sampleId(candidate.type, candidate.sourceId, candidate.targetId))) {
          remaining.push(candidate);
        }
      }
    }
    takeFrom(remaining, total - picked.length);
  }

  return picked;
}

/** 继承旧标注：按 id 合并 label 与 note */
export function mergeLabels(previous: EvalSample[], next: EvalSample[]): EvalSample[] {
  const previousById = new Map(previous.map((sample) => [sample.id, sample]));
  return next.map((sample) => {
    const old = previousById.get(sample.id);
    if (!old) return sample;
    return { ...sample, label: old.label ?? null, note: old.note ?? '' };
  });
}

function parseArgs(argv: string[]): { seed: number; total: number } {
  let seed = DEFAULT_SEED;
  let total = DEFAULT_TOTAL;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed' && argv[i + 1]) seed = Number(argv[++i]);
    else if (arg === '--total' && argv[i + 1]) total = Number(argv[++i]);
  }
  return { seed, total };
}

function loadCandidates(db: Database): EvalCandidate[] {
  const rows = db
    .query(
      `SELECT r.type, r.source_id AS sourceId, r.target_id AS targetId,
              s.name AS sourceName, t.name AS targetName,
              s.dynasty AS sourceDynasty, t.dynasty AS targetDynasty,
              r.weight, r.evidence
       FROM relations r
       JOIN poets s ON s.id = r.source_id
       JOIN poets t ON t.id = r.target_id
       WHERE r.type IN ('FRIEND', 'TEACHER_STUDENT', 'SAME_SCHOOL')`
    )
    .all() as Array<{
      type: string;
      sourceId: string;
      targetId: string;
      sourceName: string;
      targetName: string;
      sourceDynasty: string | null;
      targetDynasty: string | null;
      weight: number;
      evidence: string | null;
    }>;

  return rows.map((row) => ({
    type: row.type,
    sourceId: row.sourceId,
    targetId: row.targetId,
    sourceName: row.sourceName,
    targetName: row.targetName,
    sourceDynasty: row.sourceDynasty,
    targetDynasty: row.targetDynasty,
    weight: row.weight,
    evidence: row.evidence ? JSON.parse(row.evidence) : null,
  }));
}

function main(): void {
  const { seed, total } = parseArgs(process.argv.slice(2));

  if (!existsSync(DEFAULT_DB)) {
    log(`数据库不存在：${DEFAULT_DB}，请先运行数据管线`);
    process.exit(1);
  }

  const db = new Database(DEFAULT_DB, { readonly: true });
  const candidates = loadCandidates(db);
  db.close();

  if (candidates.length === 0) {
    log('relations 表无赠答/并称类数据，请先运行 bun run data:relations');
    process.exit(1);
  }

  const samples = stratifiedSample(candidates, total, seed);

  // 继承已有标注
  let previous: EvalSample[] = [];
  if (existsSync(OUTPUT_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8')) as { samples?: EvalSample[] };
      previous = raw.samples ?? [];
    } catch {
      log('已有标注文件解析失败，按全新文件生成');
    }
  }
  const merged = mergeLabels(previous, samples);
  const inherited = merged.filter((sample) => sample.label !== null).length;

  const byType: Record<string, number> = {};
  for (const sample of merged) byType[sample.type] = (byType[sample.type] ?? 0) + 1;

  mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(
    OUTPUT_FILE,
    `${JSON.stringify(
      {
        version: '2026.11.03.0',
        seed,
        criteria: 'label=true 表示关系成立；false 表示误配；null 表示待人工标注',
        generatedAt: new Date().toISOString(),
        stats: { total: merged.length, labeled: inherited, pending: merged.length - inherited, byType },
        samples: merged,
      },
      null,
      2
    )}\n`
  );

  log(`候选 ${candidates.length} 条，抽取 ${merged.length} 条（${JSON.stringify(byType)}）`);
  log(`继承已有标注 ${inherited} 条，待标注 ${merged.length - inherited} 条`);
  log(`输出：${OUTPUT_FILE}`);
}

if (import.meta.main) {
  main();
}
