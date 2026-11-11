import { describe, it, expect } from 'bun:test';
import { buildTimelineStats, countTimelineRange } from '../TimelineStats';

describe('时间轴区间统计', () => {
  it('空输入返回零值统计', () => {
    const stats = buildTimelineStats([]);
    expect(stats.minYear).toBe(0);
    expect(stats.maxYear).toBe(0);
    expect(countTimelineRange(stats, 0, 0)).toEqual({ poetCount: 0, workCount: 0 });
  });

  it('按出生年份累计诗人数与作品数', () => {
    const stats = buildTimelineStats([
      { birthYear: 701, workCount: 10 },
      { birthYear: 712, workCount: 20 },
      { birthYear: 712, workCount: 5 },
      { birthYear: 770, workCount: 3 },
    ]);
    expect(stats.minYear).toBe(701);
    expect(stats.maxYear).toBe(770);
    expect(countTimelineRange(stats, 701, 770)).toEqual({ poetCount: 4, workCount: 38 });
    expect(countTimelineRange(stats, 701, 711)).toEqual({ poetCount: 1, workCount: 10 });
    expect(countTimelineRange(stats, 712, 712)).toEqual({ poetCount: 2, workCount: 25 });
  });

  it('浮点年份（播放头推进的连续值）应取整统计而非返回 NaN', () => {
    const stats = buildTimelineStats([
      { birthYear: 701, workCount: 10 },
      { birthYear: 712, workCount: 20 },
      { birthYear: 770, workCount: 3 },
    ]);
    // 播放头 tick 推进产生小数年份，前缀和索引必须取整
    expect(countTimelineRange(stats, 701, 712.5)).toEqual({ poetCount: 2, workCount: 30 });
    expect(countTimelineRange(stats, 705.3, 711.7)).toEqual({ poetCount: 0, workCount: 0 });
    expect(countTimelineRange(stats, 700.9, 770.1)).toEqual({ poetCount: 3, workCount: 33 });
  });

  it('区间越界应自动裁剪到统计范围', () => {
    const stats = buildTimelineStats([
      { birthYear: 600, workCount: 1 },
      { birthYear: 900, workCount: 2 },
    ]);
    expect(countTimelineRange(stats, 0, 2000)).toEqual({ poetCount: 2, workCount: 3 });
    expect(countTimelineRange(stats, 950, 2000)).toEqual({ poetCount: 0, workCount: 0 });
  });

  it('传入反向区间时按升序处理', () => {
    const stats = buildTimelineStats([{ birthYear: 100, workCount: 1 }, { birthYear: 200, workCount: 2 }]);
    expect(countTimelineRange(stats, 200, 100)).toEqual({ poetCount: 2, workCount: 3 });
  });

  it('缺失出生年份按 0 年计入，作品数缺失按 0 计', () => {
    const stats = buildTimelineStats([{ birthYear: null, workCount: null }]);
    expect(countTimelineRange(stats, 0, 0)).toEqual({ poetCount: 1, workCount: 0 });
  });
});
