import { describe, expect, it } from 'vitest';
import { buildComparisonNetwork, normalizeQi, radarPoints } from '@/domain/services/PoetComparison';

describe('buildComparisonNetwork', () => {
  it('区分共同关联与单侧关联，并按权重降序', () => {
    const result = buildComparisonNetwork(
      [
        { otherPoetId: 'p1', type: 'FRIEND', weight: 0.5 },
        { otherPoetId: 'p2', type: 'INFLUENCE', weight: 0.9 },
        { otherPoetId: 'p1', type: 'FRIEND', weight: 0.7 },
      ],
      [
        { otherPoetId: 'p2', type: 'INFLUENCE', weight: 0.9 },
        { otherPoetId: 'p3', type: 'SAME_SCHOOL', weight: 0.6 },
      ]
    );
    expect(result.shared.map((e) => e.otherPoetId)).toEqual(['p2']);
    expect(result.primaryOnly.map((e) => e.otherPoetId)).toEqual(['p1']);
    expect(result.primaryOnly[0].weight).toBe(0.7);
    expect(result.secondaryOnly.map((e) => e.otherPoetId)).toEqual(['p3']);
  });

  it('空输入返回空分组', () => {
    expect(buildComparisonNetwork([], [])).toEqual({ shared: [], primaryOnly: [], secondaryOnly: [] });
  });
});

describe('normalizeQi', () => {
  it('才气/人气按百分制，运气按 [-50,50] 映射并裁剪', () => {
    expect(normalizeQi({ talent: 50, popularity: 100, luck: 0 })).toEqual([0.5, 1, 0.5]);
    expect(normalizeQi({ talent: 120, popularity: -10, luck: 50 })).toEqual([1, 0, 1]);
    expect(normalizeQi({ talent: 0, popularity: 0, luck: -50 })).toEqual([0, 0, 0]);
  });
});

describe('radarPoints', () => {
  it('三轴从正上方起均分，零值落在圆心', () => {
    const points = radarPoints([0, 0, 0], 0, 0, 10);
    expect(points).toHaveLength(3);
    expect(points.every((p) => p.x === 0 && p.y === 0)).toBe(true);
  });

  it('满值顶点位于对应轴方向', () => {
    const [top] = radarPoints([1, 0, 0], 0, 0, 10);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
  });
});
