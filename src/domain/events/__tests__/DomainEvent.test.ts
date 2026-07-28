import { describe, it, expect } from 'bun:test';
import {
  NodeFocusedEvent,
  NodeUnfocusedEvent,
  DimensionAdjustedEvent,
  DatasetUpdatedEvent,
  ScoringUpgradedEvent,
} from '../DomainEvent';
import { NodeId } from '../../value-objects/Ids';

describe('DomainEvent', () => {
  it('NodeFocusedEvent 应包含正确信息', () => {
    const nodeId = new NodeId('poet_1');
    const related = [new NodeId('poet_2')];
    const event = new NodeFocusedEvent(nodeId, related);
    expect(event.eventType).toBe('NodeFocused');
    expect(event.nodeId.value).toBe('poet_1');
    expect(event.relatedNodeIds.length).toBe(1);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('NodeUnfocusedEvent 应包含前聚焦节点', () => {
    const prev = new NodeId('poet_1');
    const event = new NodeUnfocusedEvent(prev);
    expect(event.eventType).toBe('NodeUnfocused');
    expect(event.previousFocusedId!.value).toBe('poet_1');

    const event2 = new NodeUnfocusedEvent(null);
    expect(event2.previousFocusedId).toBeNull();
  });

  it('DimensionAdjustedEvent 应包含权重信息', () => {
    const event = new DimensionAdjustedEvent({
      talentWeight: 2,
      popularityWeight: 1,
      luckWeight: 0.5,
    });
    expect(event.eventType).toBe('DimensionAdjusted');
    expect(event.weights.talentWeight).toBe(2);
  });

  it('DatasetUpdatedEvent 应包含版本信息', () => {
    const event = new DatasetUpdatedEvent('v1.0', 100);
    expect(event.eventType).toBe('DatasetUpdated');
    expect(event.version).toBe('v1.0');
    expect(event.changedNodeCount).toBe(100);
  });

  it('ScoringUpgradedEvent 应包含版本变更', () => {
    const event = new ScoringUpgradedEvent('v1.0', 'v2.0');
    expect(event.eventType).toBe('ScoringUpgraded');
    expect(event.fromVersion).toBe('v1.0');
    expect(event.toVersion).toBe('v2.0');
  });
});
