import { describe, it, expect } from 'bun:test';
import { QiCluster } from '../QiCluster';
import { NodePosition } from '../../value-objects/ThreeQi';

describe('QiCluster', () => {
  it('应创建有效气团', () => {
    const center = new NodePosition(0, 50, 50);
    const cluster = new QiCluster(
      'DYNASTY_TANG',
      'DYNASTY',
      'TANG',
      ['n1', 'n2', 'n3'],
      center,
      15.5,
      '#D4A24C'
    );
    expect(cluster.id).toBe('DYNASTY_TANG');
    expect(cluster.getNodeCount()).toBe(3);
    expect(cluster.density).toBe(15.5);
  });

  it('空节点列表应抛出异常', () => {
    const center = new NodePosition(0, 0, 0);
    expect(() => new QiCluster('empty', 'DYNASTY', 'TANG', [], center, 0, '#000')).toThrow();
  });

  it('isDynastyCluster 应正确判断', () => {
    const center = new NodePosition(0, 0, 0);
    const dc = new QiCluster('d', 'DYNASTY', 'TANG', ['n1'], center, 1, '#D4A24C');
    expect(dc.isDynastyCluster()).toBe(true);
    expect(dc.isGenreCluster()).toBe(false);

    const gc = new QiCluster('g', 'GENRE', 'SHI', ['n1'], center, 1, '#D4A24C');
    expect(gc.isDynastyCluster()).toBe(false);
    expect(gc.isGenreCluster()).toBe(true);
  });
});
