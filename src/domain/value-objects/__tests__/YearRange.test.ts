import { describe, it, expect } from 'bun:test';
import { YearRange } from '../YearRange';

describe('YearRange', () => {
  it('应创建有效的年份范围', () => {
    const range = new YearRange(701, 762);
    expect(range.startYear).toBe(701);
    expect(range.endYear).toBe(762);
  });

  it('允许 startYear 为 null', () => {
    const range = new YearRange(null, 762);
    expect(range.startYear).toBeNull();
  });

  it('允许 endYear 为 null', () => {
    const range = new YearRange(701, null);
    expect(range.endYear).toBeNull();
  });

  it('startYear > endYear 应抛出异常', () => {
    expect(() => new YearRange(800, 700)).toThrow();
  });

  it('contains 应正确判断年份是否在范围内', () => {
    const range = new YearRange(701, 762);
    expect(range.contains(720)).toBe(true);
    expect(range.contains(700)).toBe(false);
    expect(range.contains(763)).toBe(false);
    expect(range.contains(701)).toBe(true);
    expect(range.contains(762)).toBe(true);
  });

  it('范围含 null 时 contains 应正确工作', () => {
    const range = new YearRange(701, null);
    expect(range.contains(701)).toBe(true);
    expect(range.contains(2000)).toBe(true);
    expect(range.contains(700)).toBe(false);
  });

  it('overlaps 应正确判断重叠', () => {
    const a = new YearRange(701, 762);
    const b = new YearRange(750, 800);
    const c = new YearRange(800, 900);
    expect(a.overlaps(b)).toBe(true);
    expect(a.overlaps(c)).toBe(false);
  });

  it('toString 应返回中文格式', () => {
    const range = new YearRange(701, 762);
    expect(range.toString()).toBe('701 — 762');
  });
});
