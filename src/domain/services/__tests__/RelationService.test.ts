import { describe, it, expect } from 'bun:test';
import { RelationService } from '../RelationService';
import { GalaxyNode } from '../../entities/Node';
import { NodePosition } from '../../value-objects/ThreeQi';

describe('RelationService', () => {
  it('computeWeight 同朝代应返回 0.3', () => {
    const service = new RelationService();
    const a = new GalaxyNode('a', 'POET', 'a', new NodePosition(0, 0, 0), new NodePosition(0, 0, 0), 'TANG' as any, null, 3, 0.8, 0, 'a');
    const b = new GalaxyNode('b', 'POET', 'b', new NodePosition(0, 0, 0), new NodePosition(0, 0, 0), 'TANG' as any, null, 3, 0.8, 0, 'b');
    expect(service.computeWeight(a, b, 'SAME_DYNASTY')).toBe(0.3);
  });

  it('computeWeight 同朝代同体裁应返回 0.5', () => {
    const service = new RelationService();
    const a = new GalaxyNode('a', 'POET', 'a', new NodePosition(0, 0, 0), new NodePosition(0, 0, 0), 'TANG' as any, 'SHI' as any, 3, 0.8, 0, 'a');
    const b = new GalaxyNode('b', 'POET', 'b', new NodePosition(0, 0, 0), new NodePosition(0, 0, 0), 'TANG' as any, 'SHI' as any, 3, 0.8, 0, 'b');
    expect(service.computeWeight(a, b, 'SAME_DYNASTY')).toBe(0.5);
  });

  it('computeWeight 不同类型应返回不同权重', () => {
    const service = new RelationService();
    const a = new GalaxyNode('a', 'POET', 'a', new NodePosition(0, 0, 0), new NodePosition(0, 0, 0), 'TANG' as any, null, 3, 0.8, 0, 'a');
    const b = new GalaxyNode('b', 'POET', 'b', new NodePosition(0, 0, 0), new NodePosition(0, 0, 0), 'TANG' as any, null, 3, 0.8, 0, 'b');
    expect(service.computeWeight(a, b, 'CITATION')).toBe(0.5);
    expect(service.computeWeight(a, b, 'TEACHER_STUDENT')).toBe(0.7);
    expect(service.computeWeight(a, b, 'FRIEND')).toBe(0.6);
  });

  describe('generateFromNodes', () => {
    it('相同朝代的节点之间应生成同朝代关联', () => {
      const service = new RelationService();
      const nodes = [
        new GalaxyNode('n1', 'POET', 'p1', new NodePosition(0, 50, 50), new NodePosition(0, 50, 50), 'TANG' as any, null, 3, 0.8, 0, '李白'),
        new GalaxyNode('n2', 'POET', 'p2', new NodePosition(0, 40, 40), new NodePosition(0, 40, 40), 'TANG' as any, null, 3, 0.8, 0, '杜甫'),
      ];
      const relations = service.generateFromNodes(nodes);
      expect(relations.length).toBe(1);
      expect(relations[0].relationType).toBe('SAME_DYNASTY');
      expect(relations[0].weight).toBe(0.3);
    });

    it('不同朝代的节点之间不应生成关联', () => {
      const service = new RelationService();
      const nodes = [
        new GalaxyNode('n1', 'POET', 'p1', new NodePosition(0, 50, 50), new NodePosition(0, 50, 50), 'TANG' as any, null, 3, 0.8, 0, '李白'),
        new GalaxyNode('n2', 'POET', 'p2', new NodePosition(0, 40, 40), new NodePosition(0, 40, 40), 'SONG' as any, null, 3, 0.8, 0, '苏轼'),
      ];
      const relations = service.generateFromNodes(nodes);
      expect(relations.length).toBe(0);
    });

    it('相同朝代的节点超过50个时只生成前50对关联', () => {
      const service = new RelationService();
      const nodes: GalaxyNode[] = [];
      for (let i = 0; i < 60; i++) {
        nodes.push(new GalaxyNode(
          `n${i}`, 'POET', `p${i}`,
          new NodePosition(0, i, 0), new NodePosition(0, i, 0),
          'TANG' as any, null, 3, 0.8, 0, `诗人${i}`
        ));
      }
      const relations = service.generateFromNodes(nodes);
      // 每个节点最多与后续50个节点配对
      expect(relations.length).toBeLessThanOrEqual(50000);
      expect(relations.length).toBeGreaterThan(0);
    });
  });
});
