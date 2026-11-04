import { describe, it, expect } from 'bun:test';
import {
  sampleId,
  stratifiedSample,
  mergeLabels,
  type EvalCandidate,
} from '../../scripts/sample-relation-eval';
import { computeRelationEval } from '../../scripts/evaluate-relations';

function candidate(type: string, sourceId: string, targetId: string, weight = 0.8): EvalCandidate {
  return {
    type,
    sourceId,
    targetId,
    sourceName: sourceId,
    targetName: targetId,
    sourceDynasty: null,
    targetDynasty: null,
    weight,
    evidence: null,
  };
}

describe('标注样例标识', () => {
  it('同一诗人对无论方向都得到相同 id', () => {
    expect(sampleId('FRIEND', 'a', 'b')).toBe(sampleId('FRIEND', 'b', 'a'));
  });

  it('不同类型使用不同 id', () => {
    expect(sampleId('FRIEND', 'a', 'b')).not.toBe(sampleId('SAME_SCHOOL', 'a', 'b'));
  });
});

describe('分层抽样', () => {
  const candidates: EvalCandidate[] = [
    ...Array.from({ length: 30 }, (_, i) => candidate('FRIEND', `f${i}`, `f${i + 1}`)),
    ...Array.from({ length: 10 }, (_, i) => candidate('TEACHER_STUDENT', `t${i}`, `t${i + 1}`)),
    ...Array.from({ length: 5 }, (_, i) => candidate('SAME_SCHOOL', `s${i}`, `s${i + 1}`)),
  ];

  const strata = [
    { type: 'FRIEND', count: 50 },
    { type: 'TEACHER_STUDENT', count: 10 },
    { type: 'SAME_SCHOOL', count: 5 },
  ];

  it('同种子抽样结果完全一致', () => {
    const first = stratifiedSample(candidates, 60, 42, strata);
    const second = stratifiedSample(candidates, 60, 42, strata);
    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
  });

  it('配额不足时用剩余候选补齐，最多取到候选上限', () => {
    // FRIEND 配额 50 超过可用 30；候选总量 45，故补到 45 为止
    const picked = stratifiedSample(candidates, 60, 42, strata);
    expect(picked.length).toBe(45);
    expect(new Set(picked.map((s) => s.type)).size).toBe(3);
  });

  it('同一无序诗人对不重复抽样', () => {
    const duplicated: EvalCandidate[] = [
      candidate('FRIEND', 'a', 'b'),
      candidate('FRIEND', 'b', 'a'),
      candidate('FRIEND', 'c', 'd'),
    ];
    const picked = stratifiedSample(duplicated, 2, 1, [{ type: 'FRIEND', count: 2 }]);
    expect(picked.length).toBe(2);
    const ids = new Set(picked.map((s) => s.id));
    expect(ids.size).toBe(2);
    expect(new Set(picked.map((s) => new Set([s.sourceId, s.targetId].sort().join('|')))).size).toBe(2);
  });

  it('新抽样默认未标注', () => {
    const picked = stratifiedSample(candidates, 3, 7, [{ type: 'FRIEND', count: 3 }]);
    for (const sample of picked) {
      expect(sample.label).toBeNull();
      expect(sample.note).toBe('');
    }
  });
});

describe('标注继承', () => {
  it('按 id 继承旧 label 与 note', () => {
    const previous = [
      { ...candidate('FRIEND', 'a', 'b'), id: sampleId('FRIEND', 'a', 'b'), label: true, note: '确有唱和' },
      { ...candidate('FRIEND', 'c', 'd'), id: sampleId('FRIEND', 'c', 'd'), label: false, note: '地名误配' },
    ];
    const next = [
      { ...candidate('FRIEND', 'a', 'b', 0.9), id: sampleId('FRIEND', 'a', 'b'), label: null, note: '' },
      { ...candidate('FRIEND', 'e', 'f'), id: sampleId('FRIEND', 'e', 'f'), label: null, note: '' },
    ];
    const merged = mergeLabels(previous, next);
    expect(merged[0].label).toBe(true);
    expect(merged[0].note).toBe('确有唱和');
    expect(merged[0].weight).toBe(0.9);
    expect(merged[1].label).toBeNull();
  });

  it('旧文件缺失时保留新样例的未标注状态', () => {
    const next = [{ ...candidate('FRIEND', 'a', 'b'), id: sampleId('FRIEND', 'a', 'b'), label: null, note: '' }];
    expect(mergeLabels([], next)[0].label).toBeNull();
  });
});

describe('准确率统计', () => {
  const base = (id: string, type: string, label: boolean | null) => ({
    id,
    type,
    sourceName: '甲',
    targetName: '乙',
    label,
  });

  it('仅统计已标注条目，未标注计入待标注', () => {
    const result = computeRelationEval([
      base('1', 'FRIEND', true),
      base('2', 'FRIEND', false),
      base('3', 'FRIEND', null),
    ]);
    expect(result.total).toBe(3);
    expect(result.labeled).toBe(2);
    expect(result.pending).toBe(1);
    expect(result.correct).toBe(1);
    expect(result.accuracy).toBeCloseTo(0.5, 6);
  });

  it('按类型分组统计', () => {
    const result = computeRelationEval([
      base('1', 'FRIEND', true),
      base('2', 'FRIEND', true),
      base('3', 'SAME_SCHOOL', false),
    ]);
    const friend = result.byType.find((item) => item.type === 'FRIEND');
    const school = result.byType.find((item) => item.type === 'SAME_SCHOOL');
    expect(friend?.accuracy).toBeCloseTo(1, 6);
    expect(school?.accuracy).toBeCloseTo(0, 6);
    expect(friend?.labeled).toBe(2);
  });

  it('全部未标注时准确率为 null', () => {
    const result = computeRelationEval([base('1', 'FRIEND', null)]);
    expect(result.labeled).toBe(0);
    expect(result.accuracy).toBeNull();
  });

  it('空样例集不抛错', () => {
    const result = computeRelationEval([]);
    expect(result.total).toBe(0);
    expect(result.accuracy).toBeNull();
  });
});
