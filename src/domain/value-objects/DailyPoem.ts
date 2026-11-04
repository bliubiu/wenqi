/**
 * 每日一诗数据模型与选取逻辑
 *
 * 数据由构建期脚本 `scripts/build-daily-poems.ts` 生成，
 * 前端按当日日期（MM-DD）取用；闰日缺失时回退到 02-28。
 */

export interface DailyPoemEntry {
  monthDay: string;
  /** 节气/节日标签（锚点日才有） */
  tag?: string;
  workId: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: string;
  text: string;
}

export interface DailyPoemsData {
  version: string;
  entries: DailyPoemEntry[];
}

/** 日期 → MM-DD 键（本地时间） */
export function monthDayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/** 按日期取当日诗；闰日无数据时回退 02-28，仍无则返回 null */
export function pickDailyPoem(entries: DailyPoemEntry[], date: Date): DailyPoemEntry | null {
  const key = monthDayOf(date);
  const direct = entries.find((e) => e.monthDay === key);
  if (direct) return direct;
  if (key === '02-29') {
    return entries.find((e) => e.monthDay === '02-28') ?? null;
  }
  return null;
}
