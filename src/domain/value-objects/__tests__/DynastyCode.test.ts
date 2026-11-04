import { describe, it, expect } from 'vitest';
import {
  DYNASTY_LABELS,
  DYNASTY_COLORS,
  DYNASTY_COLOR_HEX,
  DYNASTY_YEAR_RANGES,
  getDynastyName,
  getDynastyMedianYear,
} from '../DynastyCode';

describe('DynastyCode', () => {
  it('应包含所有朝代的中文标签', () => {
    expect(DYNASTY_LABELS['TANG']).toBe('唐');
    expect(DYNASTY_LABELS['SONG']).toBe('宋');
    expect(DYNASTY_LABELS['PRE_QIN']).toBe('先秦');
  });

  it('getDynastyName 应返回正确中文名', () => {
    expect(getDynastyName('TANG')).toBe('唐');
    expect(getDynastyName('UNKNOWN')).toBe('UNKNOWN');
  });

  it('朝代颜色应为合法数字', () => {
    Object.values(DYNASTY_COLORS).forEach((color) => {
      expect(typeof color).toBe('number');
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    });
  });

  it('朝代十六进制颜色应为合法字符串', () => {
    Object.values(DYNASTY_COLOR_HEX).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it('朝代年份范围应单调且起止有效', () => {
    Object.values(DYNASTY_YEAR_RANGES).forEach((range) => {
      expect(range.start).toBeLessThan(range.end);
    });
  });

  it('getDynastyMedianYear 应返回区间中值', () => {
    expect(getDynastyMedianYear('TANG')).toBe(763);
    expect(getDynastyMedianYear('SONG')).toBe(1120);
    expect(getDynastyMedianYear('UNKNOWN')).toBe(0);
  });
});
