import { describe, it, expect } from 'vitest';
import {
  parseLabels,
  buildFeatureIndex,
  scoreWork,
  pickTopLabels,
  shardOf,
  semanticVersionOf,
} from '../../scripts/build-semantic-index';

describe('意境标签词表解析', () => {
  it('应解析标签名、同义词与特征词', () => {
    const labels = parseLabels(`
labels:
  - { name: 孤寂, synonyms: [孤独], features: [孤舟, 独酌] }
  - { name: 豪迈, synonyms: [], features: [长风, 万里] }
`);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toEqual({ name: '孤寂', synonyms: ['孤独'], features: ['孤舟', '独酌'] });
    expect(labels[1].synonyms).toEqual([]);
  });

  it('标签名重复应报错', () => {
    expect(() =>
      parseLabels(`
labels:
  - { name: 孤寂, features: [孤舟] }
  - { name: 孤寂, features: [独酌] }
`)
    ).toThrow('标签名重复：孤寂');
  });

  it('缺少特征词应报错', () => {
    expect(() => parseLabels('labels:\n  - { name: 孤寂, synonyms: [孤独] }')).toThrow(
      '标签「孤寂」缺少特征词'
    );
  });

  it('缺少 labels 数组应报错', () => {
    expect(() => parseLabels('foo: bar')).toThrow('标签词表格式错误');
  });
});

describe('意境打分', () => {
  const labels = [
    { name: '孤寂', synonyms: [], features: ['孤舟', '独酌'] },
    { name: '豪迈', synonyms: [], features: ['长风'] },
  ];
  const index = buildFeatureIndex(labels);

  it('标题命中权重为正文的 3 倍', () => {
    const scores = scoreWork('孤舟', '孤舟孤舟长风', labels.length, index);
    // 标题 +3，正文「孤舟」出现 2 次 +2；「长风」1 次
    expect(scores).toEqual([5, 1]);
  });

  it('未命中任何特征词时全为 0', () => {
    expect(scoreWork('静夜思', '床前明月光', labels.length, index)).toEqual([0, 0]);
  });
});

describe('标签选取', () => {
  it('低于阈值不入选', () => {
    expect(pickTopLabels([5, 1, 0], 2)).toEqual([0]);
  });

  it('同分按标签序号稳定排序', () => {
    expect(pickTopLabels([3, 3, 2], 2)).toEqual([0, 1, 2]);
  });

  it('每作品最多取 Top-3', () => {
    expect(pickTopLabels([5, 4, 3, 2], 2)).toEqual([0, 1, 2]);
  });
});

describe('分桶与版本', () => {
  it('作品分桶稳定且落在 16 片内', () => {
    expect(shardOf('w_001')).toBe(shardOf('w_001'));
    expect(shardOf('w_001')).toBeGreaterThanOrEqual(0);
    expect(shardOf('w_001')).toBeLessThan(16);
  });

  it('词表或产出变化应改变语义版本', () => {
    const base = semanticVersionOf('labels-a', 2, 100, 50);
    expect(base).toBe(semanticVersionOf('labels-a', 2, 100, 50));
    expect(base).not.toBe(semanticVersionOf('labels-a', 3, 100, 50));
    expect(base).not.toBe(semanticVersionOf('labels-b', 2, 100, 50));
  });
});
