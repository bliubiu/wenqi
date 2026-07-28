import { describe, it, expect } from 'bun:test';
import { Relation, RELATION_TYPES } from '../Relation';

describe('Relation', () => {
  it('应创建有效关联', () => {
    const rel = new Relation('r1', 'node_a', 'node_b', 'SAME_DYNASTY', 0.5);
    expect(rel.id).toBe('r1');
    expect(rel.sourceId).toBe('node_a');
    expect(rel.targetId).toBe('node_b');
    expect(rel.relationType).toBe('SAME_DYNASTY');
    expect(rel.weight).toBe(0.5);
  });

  it('自环应抛出异常', () => {
    expect(() => new Relation('r1', 'same', 'same', 'SAME_DYNASTY', 0.5)).toThrow('自环');
  });

  it('权重超出范围应抛出异常', () => {
    expect(() => new Relation('r1', 'a', 'b', 'FRIEND', -0.1)).toThrow();
    expect(() => new Relation('r1', 'a', 'b', 'FRIEND', 1.5)).toThrow();
  });

  it('边界权重应正常', () => {
    const rel = new Relation('r1', 'a', 'b', 'INFLUENCE', 0);
    expect(rel.weight).toBe(0);
    const rel2 = new Relation('r2', 'a', 'b', 'INFLUENCE', 1);
    expect(rel2.weight).toBe(1);
  });

  it('RELATION_TYPES 应包含所有类型', () => {
    expect(RELATION_TYPES).toContain('SAME_DYNASTY');
    expect(RELATION_TYPES).toContain('SAME_SCHOOL');
    expect(RELATION_TYPES).toContain('CITATION');
    expect(RELATION_TYPES).toContain('INFLUENCE');
    expect(RELATION_TYPES).toContain('TEACHER_STUDENT');
    expect(RELATION_TYPES).toContain('FRIEND');
    expect(RELATION_TYPES).toContain('ANTHOLOGY');
  });
});
