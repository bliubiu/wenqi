import { describe, it, expect } from 'bun:test';
import { LayoutService } from '../LayoutService';
import { GalaxyNode } from '../../entities/Node';
import { Relation } from '../../entities/Relation';
import { QiCluster } from '../../entities/QiCluster';
import { NodePosition } from '../../value-objects/ThreeQi';

function makeNode(id: string, x: number, y: number, z: number): GalaxyNode {
  return new GalaxyNode(
    id, 'POET', id,
    new NodePosition(x, y, z),
    new NodePosition(x, y, z),
    'TANG' as any, null, 3, 0.8, 0, id
  );
}

describe('LayoutService', () => {
  it('computeInitialLayout 应返回节点初始位置', () => {
    const service = new LayoutService();
    const nodes = [makeNode('n1', 10, 20, 30), makeNode('n2', 5, 5, 5)];
    const layout = service.computeInitialLayout(nodes);
    expect(layout.get('n1')!.x).toBe(10);
    expect(layout.get('n2')!.z).toBe(5);
    expect(layout.size).toBe(2);
  });

  it('computeConvergence 应生成聚气结果', () => {
    const service = new LayoutService();
    const focus = makeNode('focus', 0, 0, 0);
    const r1 = makeNode('r1', 10, 10, 10);
    const r2 = makeNode('r2', -5, -5, -5);
    const allNodes = [focus, r1, r2];
    const relations = [
      new Relation('rel1', 'focus', 'r1', 'FRIEND', 0.8),
      new Relation('rel2', 'focus', 'r2', 'SAME_DYNASTY', 0.3),
    ];
    const result = service.computeConvergence(focus, allNodes, relations);
    expect(result.focusId).toBe('focus');
    expect(result.relatedCount).toBe(2);
    expect(result.movements.length).toBe(2);
    expect(result.movements[0].nodeId).toBeTruthy();
    expect(result.movements[0].durationMs).toBeGreaterThan(0);
  });

  it('computeClusters 应按朝代聚类', () => {
    const service = new LayoutService();
    const n1 = makeNode('n1', 0, 50, 50);
    const n2 = makeNode('n2', 0, 40, 40);
    const n3 = new GalaxyNode(
      'n3', 'POET', 'p3',
      new NodePosition(0, 60, 60), new NodePosition(0, 60, 60),
      'SONG' as any, null, 3, 0.8, 0, '苏轼'
    );
    const clusters = service.computeClusters([n1, n2, n3], 'DYNASTY');
    expect(clusters.length).toBe(2);
    const tang = clusters.find(c => c.key === 'TANG');
    expect(tang).toBeDefined();
    expect(tang!.getNodeCount()).toBe(2);
  });

  it('recomputePositions 应重新计算位置', () => {
    const service = new LayoutService();
    const nodes = [
      new GalaxyNode('n1', 'POET', 'p1',
        new NodePosition(10, 20, 30), new NodePosition(10, 20, 30),
        'TANG' as any, null, 3, 0.8, 0, 'n1'),
    ];
    const positions = service.recomputePositions(nodes, {
      talentWeight: 2,
      popularityWeight: 0.5,
      luckWeight: 0,
    });
    const pos = positions.get('n1')!;
    expect(pos.x).toBe(0);   // 10 * 0
    expect(pos.y).toBe(40);  // 20 * 2
    expect(pos.z).toBe(15);  // 30 * 0.5
  });
});
