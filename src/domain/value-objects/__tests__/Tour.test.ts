import { describe, it, expect } from 'vitest';
import { DEFAULT_STEP_DURATION_MS, parseTourScript, toTourSummary } from '../Tour';

describe('parseTourScript', () => {
  it('解析合法的 focus 与 cluster 步骤', () => {
    const script = parseTourScript({
      id: 'mid-autumn-moon',
      title: '千里共婵娟',
      description: '从张若虚到苏轼',
      steps: [
        { type: 'focus', refId: 'poet_x', durationMs: 6000, caption: '张若虚', narration: '朗读' },
        { type: 'cluster', clusterKey: 'SONG', durationMs: 4000, caption: '宋词星空' },
      ],
    });

    expect(script.steps).toHaveLength(2);
    expect(script.steps[0]).toMatchObject({ type: 'focus', refId: 'poet_x', durationMs: 6000, narration: '朗读' });
    expect(script.steps[1]).toMatchObject({ type: 'cluster', clusterKey: 'SONG', durationMs: 4000 });
    expect(script.steps[1].narration).toBeUndefined();
  });

  it('缺失时长时使用默认值', () => {
    const script = parseTourScript({
      id: 'x',
      title: '漫游',
      steps: [{ type: 'focus', refId: 'poet_x', caption: '解说' }],
    });
    expect(script.steps[0].durationMs).toBe(DEFAULT_STEP_DURATION_MS);
  });

  it('steps 为空或缺失时抛出中文错误', () => {
    expect(() => parseTourScript({ id: 'x', title: '漫游', steps: [] })).toThrow('steps 必须为非空数组');
    expect(() => parseTourScript({ id: 'x', title: '漫游' })).toThrow('steps 必须为非空数组');
  });

  it('focus 缺 refId 时抛出中文错误', () => {
    expect(() => parseTourScript({
      id: 'x', title: '漫游',
      steps: [{ type: 'focus', caption: '解说' }],
    })).toThrow('steps[0].refId');
  });

  it('步骤 type 非法时抛出中文错误', () => {
    expect(() => parseTourScript({
      id: 'x', title: '漫游',
      steps: [{ type: 'zoom', caption: '解说' }],
    })).toThrow('type 必须为 focus 或 cluster');
  });
});

describe('toTourSummary', () => {
  it('汇总步骤数与总时长', () => {
    const summary = toTourSummary({
      id: 'tour',
      title: '标题',
      description: '简介',
      steps: [
        { type: 'focus', refId: 'poet_x', durationMs: 3000, caption: 'a' },
        { type: 'cluster', clusterKey: 'TANG', durationMs: 2000, caption: 'b' },
      ],
    });
    expect(summary).toEqual({
      id: 'tour', title: '标题', description: '简介', stepCount: 2, durationMs: 5000,
    });
  });
});
