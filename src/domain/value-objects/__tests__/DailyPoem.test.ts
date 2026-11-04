import { describe, expect, it } from 'vitest';
import { monthDayOf, pickDailyPoem, type DailyPoemEntry } from '@/domain/value-objects/DailyPoem';

const entry = (monthDay: string, workId = monthDay): DailyPoemEntry => ({
  monthDay,
  workId,
  title: `作品 ${monthDay}`,
  poetId: 'poet_x',
  poetName: '某诗人',
  dynasty: 'TANG',
  text: '床前明月光',
});

describe('monthDayOf', () => {
  it('格式化为 MM-DD 并补零', () => {
    expect(monthDayOf(new Date(2026, 0, 5))).toBe('01-05');
    expect(monthDayOf(new Date(2026, 10, 21))).toBe('11-21');
  });
});

describe('pickDailyPoem', () => {
  it('按日期取当日诗', () => {
    const entries = [entry('01-05'), entry('11-21')];
    expect(pickDailyPoem(entries, new Date(2026, 0, 5))?.workId).toBe('01-05');
  });

  it('闰日缺失时回退到 02-28', () => {
    const entries = [entry('02-28')];
    expect(pickDailyPoem(entries, new Date(2024, 1, 29))?.workId).toBe('02-28');
  });

  it('无匹配返回 null', () => {
    expect(pickDailyPoem([entry('01-01')], new Date(2026, 5, 1))).toBeNull();
  });
});
