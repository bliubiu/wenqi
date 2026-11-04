import { describe, expect, it } from 'vitest';
import { lodLevel, lodVisual } from '../lod';

const THRESHOLDS = [50, 200, 800];

describe('lodLevel', () => {
  it('近距离（小于第一档）为 0 级', () => {
    expect(lodLevel(30, THRESHOLDS)).toBe(0);
  });

  it('依次跨过三档阈值', () => {
    expect(lodLevel(120, THRESHOLDS)).toBe(1);
    expect(lodLevel(300, THRESHOLDS)).toBe(2);
    expect(lodLevel(900, THRESHOLDS)).toBe(3);
  });

  it('阈值边界归入更高一档', () => {
    expect(lodLevel(50, THRESHOLDS)).toBe(1);
    expect(lodLevel(200, THRESHOLDS)).toBe(2);
    expect(lodLevel(800, THRESHOLDS)).toBe(3);
  });

  it('无阈值或非法距离固定为 0 级', () => {
    expect(lodLevel(999, [])).toBe(0);
    expect(lodLevel(Number.NaN, THRESHOLDS)).toBe(0);
  });
});

describe('lodVisual', () => {
  it('各档视觉随距离递减透明度并略微放大', () => {
    expect(lodVisual(30, THRESHOLDS)).toEqual({ level: 0, sizeScale: 1.0, opacity: 1.0 });
    const far = lodVisual(900, THRESHOLDS);
    expect(far.level).toBe(3);
    expect(far.sizeScale).toBeGreaterThan(1);
    expect(far.opacity).toBeLessThan(1);
  });
});
