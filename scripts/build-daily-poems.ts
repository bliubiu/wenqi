/**
 * 每日一诗构建脚本
 *
 * 生成年度日历数据 `public/data/processed/daily-poems.json`：
 * 1. 节气/元旦锚点：标题命中节气名的作品，取人气最高者
 * 2. 其余日期：按诗人在世名声（人气评分）排序的候选池顺序填充，全年不重复
 *
 * 幂等可重跑：整文件覆盖写入。
 * 使用方式：bun run scripts/build-daily-poems.ts [--db data/wenqi.db] [--out public/data/processed]
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_DB, getMeta, loadScores, loadWorkTitles, openDatabase } from './db-core';
import { dynastyToTable } from '../src/infrastructure/data/shard';
import { toSimplified } from '../src/infrastructure/text/t2s';
import type { DailyPoemEntry, DailyPoemsData } from '../src/domain/value-objects/DailyPoem';

const DEFAULT_OUT = 'public/data/processed';

/** 节气与元旦锚点（公历近似日期，标题命中关键词即入选） */
export const CALENDAR_ANCHORS: Array<{ tag: string; monthDay: string; keywords: string[] }> = [
  { tag: '元旦', monthDay: '01-01', keywords: ['元日'] },
  { tag: '小寒', monthDay: '01-06', keywords: ['小寒'] },
  { tag: '大寒', monthDay: '01-20', keywords: ['大寒'] },
  { tag: '立春', monthDay: '02-04', keywords: ['立春'] },
  { tag: '雨水', monthDay: '02-19', keywords: ['雨水'] },
  { tag: '惊蛰', monthDay: '03-05', keywords: ['惊蛰'] },
  { tag: '春分', monthDay: '03-20', keywords: ['春分'] },
  { tag: '清明', monthDay: '04-05', keywords: ['清明'] },
  { tag: '谷雨', monthDay: '04-20', keywords: ['谷雨'] },
  { tag: '立夏', monthDay: '05-05', keywords: ['立夏'] },
  { tag: '小满', monthDay: '05-21', keywords: ['小满'] },
  { tag: '芒种', monthDay: '06-05', keywords: ['芒种'] },
  { tag: '夏至', monthDay: '06-21', keywords: ['夏至'] },
  { tag: '小暑', monthDay: '07-07', keywords: ['小暑'] },
  { tag: '大暑', monthDay: '07-23', keywords: ['大暑'] },
  { tag: '立秋', monthDay: '08-07', keywords: ['立秋'] },
  { tag: '处暑', monthDay: '08-23', keywords: ['处暑'] },
  { tag: '白露', monthDay: '09-07', keywords: ['白露'] },
  { tag: '秋分', monthDay: '09-23', keywords: ['秋分'] },
  { tag: '寒露', monthDay: '10-08', keywords: ['寒露'] },
  { tag: '霜降', monthDay: '10-23', keywords: ['霜降'] },
  { tag: '立冬', monthDay: '11-07', keywords: ['立冬'] },
  { tag: '小雪', monthDay: '11-22', keywords: ['小雪'] },
  { tag: '大雪', monthDay: '12-07', keywords: ['大雪'] },
  { tag: '冬至', monthDay: '12-21', keywords: ['冬至'] },
];

export interface DailyCandidate {
  id: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: string;
  popularity: number;
}

/** 标题归一：繁转简并去除空白分隔符 */
export function normalizeTitleKey(title: string): string {
  return toSimplified(title).replace(/[\s·・]/g, '');
}

/** 全年 366 个 MM-DD（含闰日 02-29） */
export function buildMonthDays(): string[] {
  const days: string[] = [];
  for (let month = 1; month <= 12; month++) {
    const count = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
    for (let day = 1; day <= count; day++) {
      days.push(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }
  return days;
}

/** 为每个节气/节日锚点挑选标题命中且人气最高的作品 */
export function selectAnchors(
  candidates: DailyCandidate[]
): Map<string, { candidate: DailyCandidate; tag: string }> {
  const anchors = new Map<string, { candidate: DailyCandidate; tag: string }>();
  for (const anchor of CALENDAR_ANCHORS) {
    let best: DailyCandidate | null = null;
    for (const candidate of candidates) {
      const title = normalizeTitleKey(candidate.title);
      if (!anchor.keywords.some((keyword) => title.includes(keyword))) continue;
      if (!best || candidate.popularity > best.popularity) best = candidate;
    }
    if (best) anchors.set(anchor.monthDay, { candidate: best, tag: anchor.tag });
  }
  return anchors;
}

/** 候选池排序：人气降序，同分按作品 ID 保证确定性 */
export function rankCandidates(candidates: DailyCandidate[]): DailyCandidate[] {
  return [...candidates].sort(
    (a, b) => b.popularity - a.popularity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** 逐日分配：锚点优先，其余按候选池顺序填充，全年作品不重复 */
export function assignDailyWorks(
  monthDays: string[],
  anchors: Map<string, { candidate: DailyCandidate; tag: string }>,
  pool: DailyCandidate[]
): Array<{ monthDay: string; tag?: string; candidate: DailyCandidate }> {
  const used = new Set<string>();
  const out: Array<{ monthDay: string; tag?: string; candidate: DailyCandidate }> = [];
  let cursor = 0;
  const pickFromPool = (): DailyCandidate | null => {
    while (cursor < pool.length && used.has(pool[cursor].id)) cursor++;
    return cursor < pool.length ? pool[cursor++] : null;
  };
  for (const monthDay of monthDays) {
    const anchor = anchors.get(monthDay);
    if (anchor && !used.has(anchor.candidate.id)) {
      used.add(anchor.candidate.id);
      out.push({ monthDay, tag: anchor.tag, candidate: anchor.candidate });
      continue;
    }
    const candidate = pickFromPool();
    if (!candidate) continue;
    used.add(candidate.id);
    out.push({ monthDay, candidate });
  }
  return out;
}

function parseArgs(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (key?.startsWith('--')) options[key.slice(2)] = argv[i + 1] ?? '';
  }
  return options;
}

/** 按分表批量读取选中作品的正文 */
function loadTextsByIds(
  db: ReturnType<typeof openDatabase>,
  entries: Array<{ monthDay: string; tag?: string; candidate: DailyCandidate }>
): Map<string, string> {
  const idsByTable = new Map<string, string[]>();
  for (const entry of entries) {
    const table = dynastyToTable(entry.candidate.dynasty);
    const list = idsByTable.get(table);
    if (list) list.push(entry.candidate.id);
    else idsByTable.set(table, [entry.candidate.id]);
  }
  const texts = new Map<string, string>();
  for (const [table, ids] of idsByTable) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db
        .query(`SELECT id, text FROM ${table} WHERE id IN (${placeholders})`)
        .all(...chunk) as Array<{ id: string; text: string | null }>;
      for (const row of rows) {
        if (row.text) texts.set(row.id, row.text);
      }
    }
  }
  return texts;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const dbPath = options.db ?? DEFAULT_DB;
  const outDir = options.out ?? DEFAULT_OUT;

  const db = openDatabase(dbPath, { readonly: true });
  try {
    const popularityByPoet = new Map(
      loadScores(db).map((s) => [s.poetId, s.threeQi.popularity.value])
    );
    const candidates: DailyCandidate[] = loadWorkTitles(db)
      .filter((w) => w.title && popularityByPoet.has(w.poetId))
      .map((w) => ({
        id: w.id,
        title: w.title,
        poetId: w.poetId,
        poetName: w.poetName ?? '佚名',
        dynasty: w.dynasty,
        popularity: popularityByPoet.get(w.poetId) ?? 0,
      }));

    const anchors = selectAnchors(candidates);
    const pool = rankCandidates(candidates.filter((c) => c.popularity > 0));
    const monthDays = buildMonthDays();
    const assigned = assignDailyWorks(monthDays, anchors, pool);

    const texts = loadTextsByIds(db, assigned);
    const entries: DailyPoemEntry[] = assigned.map((item) => ({
      monthDay: item.monthDay,
      ...(item.tag ? { tag: item.tag } : {}),
      workId: item.candidate.id,
      title: item.candidate.title,
      poetId: item.candidate.poetId,
      poetName: item.candidate.poetName,
      dynasty: item.candidate.dynasty,
      text: (texts.get(item.candidate.id) ?? '').slice(0, 240),
    }));

    const data: DailyPoemsData = {
      version: getMeta(db, 'dataset_version') ?? '',
      entries,
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'daily-poems.json'), JSON.stringify(data, null, 2), 'utf-8');
    console.log(
      `每日一诗构建完成: ${entries.length} 天（锚点 ${anchors.size} 个）→ ${path.join(outDir, 'daily-poems.json')}`
    );
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  main();
}
