/**
 * 时间轴区间统计：按诗人出生年份累计诗人数与作品数，
 * 前缀和结构支持区间查询，供时间演化滑块实时展示。
 */

export interface TimelineStatInput {
  birthYear?: number | null;
  workCount?: number | null;
}

export interface TimelineStats {
  minYear: number;
  maxYear: number;
  /** 前缀和：poetPrefix[i] 表示年份 [minYear, minYear + i) 内的诗人总数 */
  poetPrefix: number[];
  /** 前缀和：workPrefix[i] 表示年份 [minYear, minYear + i) 内的作品总数 */
  workPrefix: number[];
}

export interface TimelineRangeCount {
  poetCount: number;
  workCount: number;
}

export function buildTimelineStats(items: Iterable<TimelineStatInput>): TimelineStats {
  const list = Array.from(items);
  if (list.length === 0) {
    return { minYear: 0, maxYear: 0, poetPrefix: [0], workPrefix: [0] };
  }

  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const item of list) {
    const year = item.birthYear ?? 0;
    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;
  }

  const size = maxYear - minYear + 1;
  const yearlyPoets = new Array<number>(size).fill(0);
  const yearlyWorks = new Array<number>(size).fill(0);

  for (const item of list) {
    const index = (item.birthYear ?? 0) - minYear;
    yearlyPoets[index]++;
    yearlyWorks[index] += Math.max(0, item.workCount ?? 0);
  }

  const poetPrefix = new Array<number>(size + 1).fill(0);
  const workPrefix = new Array<number>(size + 1).fill(0);
  for (let i = 0; i < size; i++) {
    poetPrefix[i + 1] = poetPrefix[i] + yearlyPoets[i];
    workPrefix[i + 1] = workPrefix[i] + yearlyWorks[i];
  }

  return { minYear, maxYear, poetPrefix, workPrefix };
}

/** 统计闭区间 [fromYear, toYear] 内的诗人数与作品数（越界自动裁剪） */
export function countTimelineRange(stats: TimelineStats, fromYear: number, toYear: number): TimelineRangeCount {
  if (stats.poetPrefix.length <= 1) return { poetCount: 0, workCount: 0 };

  const start = Math.max(stats.minYear, Math.min(fromYear, toYear));
  const end = Math.min(stats.maxYear, Math.max(fromYear, toYear));
  if (end < start) return { poetCount: 0, workCount: 0 };

  const startIndex = Math.floor(start) - stats.minYear;
  const endIndex = Math.floor(end) - stats.minYear + 1;
  return {
    poetCount: stats.poetPrefix[endIndex] - stats.poetPrefix[startIndex],
    workCount: stats.workPrefix[endIndex] - stats.workPrefix[startIndex],
  };
}
