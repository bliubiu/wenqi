import { describe, it, expect } from 'bun:test';
import { Galaxy } from '../Galaxy';
import { GalaxyNode } from '../../entities/Node';
import { QiCluster } from '../../entities/QiCluster';
import { NodePosition } from '../../value-objects/ThreeQi';

function makeNode(id: string): GalaxyNode {
  return new GalaxyNode(
    id, 'POET', id,
    new NodePosition(0, 50, 50),
    new NodePosition(0, 50, 50),
    'TANG' as any, null, 3, 0.8, 0, id
  );
}

describe('Galaxy', () => {
  it('应创建空星系', () => {
    const galaxy = new Galaxy();
    expect(galaxy.getNodeCount()).toBe(0);
  });

  it('addNode 应添加节点', () => {
    const galaxy = new Galaxy();
    galaxy.addNode(makeNode('n1'));
    expect(galaxy.getNodeCount()).toBe(1);
  });

  it('findNode 应返回节点', () => {
    const galaxy = new Galaxy([makeNode('n1')]);
    expect(galaxy.findNode('n1')).not.toBeNull();
    expect(galaxy.findNode('n2')).toBeNull();
  });

  it('removeNode 应移除节点', () => {
    const galaxy = new Galaxy([makeNode('n1')]);
    galaxy.removeNode('n1');
    expect(galaxy.getNodeCount()).toBe(0);
  });

  it('setFocusedNode/isFocused 应管理聚焦状态', () => {
    const galaxy = new Galaxy();
    expect(galaxy.isFocused()).toBe(false);
    galaxy.setFocusedNode('n1');
    expect(galaxy.isFocused()).toBe(true);
    expect(galaxy.getFocusedNodeId()).toBe('n1');
  });

  it('setNodeState 应改变节点状态', () => {
    const galaxy = new Galaxy([makeNode('n1')]);
    galaxy.setNodeState('n1', 'CONVERGING');
    expect(galaxy.findNode('n1')!.state).toBe('CONVERGING');
  });

  it('resetAllToIdle 应重置所有节点', () => {
    const n1 = makeNode('n1');
    const n2 = makeNode('n2');
    const galaxy = new Galaxy([n1, n2]);
    galaxy.setNodeState('n1', 'CONVERGING');
    galaxy.setNodeState('n2', 'DIVERGED');
    galaxy.setFocusedNode('n1');

    galaxy.resetAllToIdle();
    galaxy.setFocusedNode(null);

    expect(galaxy.isFocused()).toBe(false);
    expect(galaxy.findNode('n1')!.state).toBe('IDLE');
    expect(galaxy.findNode('n2')!.state).toBe('IDLE');
  });

  it('storeClusters/getClusters 应管理聚类', () => {
    const galaxy = new Galaxy();
    const clusters = [new QiCluster('c1', 'DYNASTY', 'TANG', ['n1', 'n2'], new NodePosition(0, 0, 0), 10, '#D4A24C')];
    galaxy.storeClusters(clusters);
    expect(galaxy.getClusters().length).toBe(1);
  });

  it('setNodePosition 应更新节点位置', () => {
    const node = new GalaxyNode(
      'n1', 'POET', 'n1',
      new NodePosition(10, 20, 30),
      new NodePosition(10, 20, 30),
      'TANG' as any, null, 3, 0.8, 0, 'n1'
    );
    const galaxy = new Galaxy([node]);
    galaxy.setNodePosition('n1', new NodePosition(0, 40, 15));
    const updated = galaxy.findNode('n1')!;
    expect(updated.position.x).toBe(0);
    expect(updated.position.y).toBe(40);
    expect(updated.position.z).toBe(15);
  });

  it('getNodesByState 应过滤节点状态', () => {
    const n1 = makeNode('n1');
    const n2 = makeNode('n2');
    const galaxy = new Galaxy([n1, n2]);
    galaxy.setNodeState('n1', 'CONVERGING');
    const converged = galaxy.getNodesByState('CONVERGING');
    expect(converged.length).toBe(1);
    expect(converged[0].id).toBe('n1');
  });

  it('getAllNodes 应返回所有节点', () => {
    const galaxy = new Galaxy([makeNode('n1'), makeNode('n2')]);
    expect(galaxy.getAllNodes().length).toBe(2);
  });
});
