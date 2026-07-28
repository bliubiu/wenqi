import { describe, it, expect } from 'bun:test';
import { Galaxy } from '@/domain/aggregates/Galaxy';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodePosition } from '@/domain/value-objects/ThreeQi';
import { UnfocusUseCase } from '../UnfocusUseCase';

function makeNode(id: string): GalaxyNode {
  return new GalaxyNode(
    id, 'POET', id,
    new NodePosition(0, 50, 50),
    new NodePosition(0, 50, 50),
    'TANG' as any, null, 3, 0.8, 0, id
  );
}

describe('UnfocusUseCase', () => {
  it('unfocus 应返回所有已聚焦/散气的节点', () => {
    const galaxy = new Galaxy([makeNode('n1'), makeNode('n2'), makeNode('n3')]);
    galaxy.setFocusedNode('n1');
    galaxy.setNodeState('n1', 'CONVERGING');
    galaxy.setNodeState('n2', 'CONVERGING');
    galaxy.setNodeState('n3', 'DIVERGED');

    const useCase = new UnfocusUseCase(galaxy);
    const result = useCase.execute();

    expect(result.restoredNodeIds).toContain('n2');
    expect(result.restoredNodeIds).toContain('n3');
    expect(galaxy.isFocused()).toBe(false);
    expect(galaxy.findNode('n1')!.state).toBe('IDLE');
    expect(galaxy.findNode('n2')!.state).toBe('IDLE');
    expect(galaxy.findNode('n3')!.state).toBe('IDLE');
  });

  it('无聚焦时 unfocus 应返回空数组', () => {
    const galaxy = new Galaxy([makeNode('n1')]);
    const useCase = new UnfocusUseCase(galaxy);
    const result = useCase.execute();
    expect(result.restoredNodeIds).toEqual([]);
  });
});
