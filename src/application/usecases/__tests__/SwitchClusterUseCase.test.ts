import { describe, it, expect } from 'bun:test';
import { Galaxy } from '@/domain/aggregates/Galaxy';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodePosition } from '@/domain/value-objects/ThreeQi';
import { LayoutService } from '@/domain/services/LayoutService';
import { SwitchClusterUseCase } from '../SwitchClusterUseCase';

describe('SwitchClusterUseCase', () => {
  it('按朝代聚类应返回正确气团', () => {
    const n1 = new GalaxyNode('n1', 'POET', 'p1', new NodePosition(0, 50, 50), new NodePosition(0, 50, 50), 'TANG' as any, null, 3, 0.8, 0, '李白');
    const n2 = new GalaxyNode('n2', 'POET', 'p2', new NodePosition(0, 40, 40), new NodePosition(0, 40, 40), 'TANG' as any, null, 3, 0.8, 0, '杜甫');
    const n3 = new GalaxyNode('n3', 'POET', 'p3', new NodePosition(0, 60, 60), new NodePosition(0, 60, 60), 'SONG' as any, null, 3, 0.8, 0, '苏轼');

    const galaxy = new Galaxy([n1, n2, n3]);
    const layoutService = new LayoutService();
    const useCase = new SwitchClusterUseCase(galaxy, layoutService);
    const result = useCase.execute({ dimension: 'DYNASTY' });

    expect(result.clusters.length).toBe(2);
    const tang = result.clusters.find(c => c.key === 'TANG');
    expect(tang).toBeDefined();
    expect(tang!.nodeCount).toBe(2);
    expect(tang!.label).toBe('唐');
    expect(tang!.color).toBe('#D4A24C');
  });

  it('按体裁聚类应返回正确气团', () => {
    const n1 = new GalaxyNode('n1', 'WORK', 'w1', new NodePosition(0, 50, 50), new NodePosition(0, 50, 50), 'TANG' as any, 'SHI' as any, 3, 0.8, 0, '静夜思');
    const n2 = new GalaxyNode('n2', 'WORK', 'w2', new NodePosition(0, 40, 40), new NodePosition(0, 40, 40), 'SONG' as any, 'CI' as any, 3, 0.8, 0, '水调歌头');

    const galaxy = new Galaxy([n1, n2]);
    const layoutService = new LayoutService();
    const useCase = new SwitchClusterUseCase(galaxy, layoutService);
    const result = useCase.execute({ dimension: 'GENRE' });

    const shi = result.clusters.find(c => c.key === 'SHI');
    expect(shi).toBeDefined();
    expect(shi!.nodeCount).toBe(1);
    expect(shi!.label).toBe('诗');
  });
});
