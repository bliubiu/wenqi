/**
 * 关系挖掘标注准确率评估
 *
 * 读取 data/processed/relation-eval.json 中人工标注的 label，
 * 按类型统计准确率并与阈值比较（默认 85%，对应文档 3.5 验收标准 4）。
 *
 * 使用方式：bun run scripts/evaluate-relations.ts [--file path] [--min 0.85]
 */

import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_FILE = 'data/processed/relation-eval.json';
const DEFAULT_MIN_ACCURACY = 0.85;

type RelationTypeName = 'FRIEND' | 'TEACHER_STUDENT' | 'SAME_SCHOOL' | string;

interface EvalSample {
  id: string;
  type: RelationTypeName;
  sourceName: string;
  targetName: string;
  label: boolean | null;
  note?: string;
}

export interface TypeAccuracy {
  type: string;
  labeled: number;
  correct: number;
  accuracy: number | null;
}

export interface EvalResult {
  total: number;
  pending: number;
  labeled: number;
  correct: number;
  accuracy: number | null;
  byType: TypeAccuracy[];
}

/** 统计准确率：仅计入 label 非空的条目，未标注条目计入 pending */
export function computeRelationEval(samples: EvalSample[]): EvalResult {
  const buckets = new Map<string, { labeled: number; correct: number }>();

  let labeled = 0;
  let correct = 0;
  for (const sample of samples) {
    if (sample.label === null) continue;
    labeled++;
    if (sample.label) correct++;
    const bucket = buckets.get(sample.type) ?? { labeled: 0, correct: 0 };
    bucket.labeled++;
    if (sample.label) bucket.correct++;
    buckets.set(sample.type, bucket);
  }

  const byType: TypeAccuracy[] = [...buckets.entries()]
    .map(([type, bucket]) => ({
      type,
      labeled: bucket.labeled,
      correct: bucket.correct,
      accuracy: bucket.labeled > 0 ? bucket.correct / bucket.labeled : null,
    }))
    .sort((a, b) => b.labeled - a.labeled);

  return {
    total: samples.length,
    pending: samples.length - labeled,
    labeled,
    correct,
    accuracy: labeled > 0 ? correct / labeled : null,
    byType,
  };
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function parseArgs(argv: string[]): { file: string; min: number } {
  let file = DEFAULT_FILE;
  let min = DEFAULT_MIN_ACCURACY;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) file = argv[++i];
    else if (argv[i] === '--min' && argv[i + 1]) min = Number(argv[++i]);
  }
  return { file, min };
}

function main(): void {
  const { file, min } = parseArgs(process.argv.slice(2));

  if (!existsSync(file)) {
    console.error(`[关系评估] 标注文件不存在：${file}，请先运行 bun run data:relation-eval`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(file, 'utf8')) as { samples?: EvalSample[] };
  const samples = raw.samples ?? [];
  if (samples.length === 0) {
    console.error('[关系评估] 标注文件无样例');
    process.exit(1);
  }

  const result = computeRelationEval(samples);

  console.log(`[关系评估] 样例总数 ${result.total}，已标注 ${result.labeled}，待标注 ${result.pending}`);
  for (const item of result.byType) {
    console.log(`[关系评估]   ${item.type}: ${item.correct}/${item.labeled} = ${formatRate(item.accuracy)}`);
  }
  console.log(`[关系评估] 总体准确率 ${formatRate(result.accuracy)}（阈值 ${(min * 100).toFixed(1)}%）`);

  if (result.labeled === 0) {
    console.log('[关系评估] 尚无人工标注，准确率未计算；请在 relation-eval.json 中填写 label');
    return;
  }
  if (result.accuracy !== null && result.accuracy < min) {
    console.error('[关系评估] 未达验收标准，请检查挖掘规则或标注口径');
    process.exit(1);
  }
  console.log('[关系评估] 已达验收标准');
}

if (import.meta.main) {
  main();
}
