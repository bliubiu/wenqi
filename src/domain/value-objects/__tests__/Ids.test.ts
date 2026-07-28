import { describe, it, expect } from 'bun:test';
import { NodeId, PoetId, WorkId, RelationId, ClusterId } from '../Ids';

describe('NodeId', () => {
  it('应创建有效 ID', () => {
    const id = new NodeId('poet_1');
    expect(id.value).toBe('poet_1');
  });

  it('空值应抛出异常', () => {
    expect(() => new NodeId('')).toThrow();
    expect(() => new NodeId('   ')).toThrow();
  });

  it('equals 应正确比较', () => {
    const a = new NodeId('x');
    const b = new NodeId('x');
    const c = new NodeId('y');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('PoetId', () => {
  it('应创建有效 ID', () => {
    const id = new PoetId('poet_1');
    expect(id.value).toBe('poet_1');
  });

  it('空值应抛出异常', () => {
    expect(() => new PoetId('')).toThrow();
  });
});

describe('WorkId', () => {
  it('应创建有效 ID', () => {
    const id = new WorkId('work_1');
    expect(id.value).toBe('work_1');
  });

  it('空值应抛出异常', () => {
    expect(() => new WorkId('')).toThrow();
  });
});

describe('RelationId', () => {
  it('应创建有效 ID', () => {
    const id = new RelationId('rel_1');
    expect(id.value).toBe('rel_1');
  });
});

describe('ClusterId', () => {
  it('应创建有效 ID', () => {
    const id = new ClusterId('cluster_1');
    expect(id.value).toBe('cluster_1');
  });
});
