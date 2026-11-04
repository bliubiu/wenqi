import { describe, it, expect } from 'vitest';
import { TalentScore, PopularityScore, LuckScore, NodePosition } from '../ThreeQi';

describe('TalentScore', () => {
  it('应在合法值时创建成功', () => {
    const score = new TalentScore(75, 'v1.0', {
      lexicalUniqueness: 80,
      imageryNovelty: 70,
      genreInnovation: 60,
    });
    expect(score.value).toBe(75);
    expect(score.algorithmVersion).toBe('v1.0');
  });

  it('值超出 [0, 100] 时应抛出异常', () => {
    expect(() => new TalentScore(-1, 'v1.0', {
      lexicalUniqueness: 0,
      imageryNovelty: 0,
      genreInnovation: 0,
    })).toThrow('才气评分超出范围');

    expect(() => new TalentScore(101, 'v1.0', {
      lexicalUniqueness: 100,
      imageryNovelty: 100,
      genreInnovation: 100,
    })).toThrow('才气评分超出范围');
  });

  it('边界值 0 和 100 应创建成功', () => {
    expect(() => new TalentScore(0, 'v1.0', {
      lexicalUniqueness: 0, imageryNovelty: 0, genreInnovation: 0,
    })).not.toThrow();

    expect(() => new TalentScore(100, 'v1.0', {
      lexicalUniqueness: 100, imageryNovelty: 100, genreInnovation: 100,
    })).not.toThrow();
  });
});

describe('PopularityScore', () => {
  it('应在合法值时创建成功', () => {
    const score = new PopularityScore(50, 'v1.0', {
      citationCount: 100,
      textbookCount: 10,
      searchHeat: 60,
    });
    expect(score.value).toBe(50);
  });
});

describe('LuckScore', () => {
  it('应在合法值时创建成功', () => {
    const score = new LuckScore(20, 'v1.0', {
      politicalEnvironment: 15,
      rediscoveryEvents: 5,
    });
    expect(score.value).toBe(20);
  });

  it('值超出 [-50, 50] 时应抛出异常', () => {
    expect(() => new LuckScore(-51, 'v1.0', {
      politicalEnvironment: -50,
      rediscoveryEvents: -1,
    })).toThrow('运气评分超出范围');

    expect(() => new LuckScore(51, 'v1.0', {
      politicalEnvironment: 50,
      rediscoveryEvents: 1,
    })).toThrow('运气评分超出范围');
  });
});

describe('NodePosition', () => {
  it('应正确计算两点距离', () => {
    const a = new NodePosition(0, 0, 0);
    const b = new NodePosition(3, 4, 0);
    expect(a.distanceTo(b)).toBe(5);
  });

  it('应正确转换为向量', () => {
    const pos = new NodePosition(10, 20, 30);
    expect(pos.toVector3()).toEqual({ x: 10, y: 20, z: 30 });
  });
});
