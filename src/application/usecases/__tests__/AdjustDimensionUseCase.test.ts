import { describe, it, expect } from 'bun:test';
import { Galaxy } from '@/domain/aggregates/Galaxy';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodePosition } from '@/domain/value-objects/ThreeQi';
import { LayoutService } from '@/domain/services/LayoutService';
import { AdjustDimensionUseCase } from '../AdjustDimensionUseCase';

describe('AdjustDimensionUseCase', () => {
  it('应应用权重并返回受影响节点', () => {
    const node = new GalaxyNode(
      'n1', 'POET', 'p1',
      new NodePosition(10, 20, 30),
      new NodePosition(10, 20, 30),
      'TANG' as any, null, 3, 0.8, 0, 'n1'
    );
    const galaxy = new Galaxy([node]);
    const layoutService = new LayoutService();
    const useCase = new AdjustDimensionUseCase(galaxy, layoutService);

    const result = useCase.execute({
      weights: { talentWeight: 2, popularityWeight: 0.5, luckWeight: 0 },
    });

    expect(result.affectedNodeIds).toContain('n1');
    expect(result.durationMs).toBe(600);

    const updated = galaxy.findNode('n1')!;
    expect(updated.position.x).toBe(0);
    expect(updated.position.y).toBe(40);
    expect(updated.position.z).toBe(15);
  });

  it('权重超出范围应抛出异常', () => {
    const galaxy = new Galaxy();
    const layoutService = new LayoutService();
    const useCase = new AdjustDimensionUseCase(galaxy, layoutService);

    expect(() => useCase.execute({
      weights: { talentWeight: 3, popularityWeight: 1, luckWeight: 1 },
    })).toThrow('范围');
  });

  it('权重为 0 也应合法', () => {
    const galaxy = new Galaxy();
    const layoutService = new LayoutService();
    const useCase = new AdjustDimensionUseCase(galaxy, layoutService);

    expect(() => useCase.execute({
      weights: { talentWeight: 0, popularityWeight: 0, luckWeight: 0 },
    })).not.toThrow();
  });
});
