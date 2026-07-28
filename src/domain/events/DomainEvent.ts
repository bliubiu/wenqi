import { NodeId } from '../value-objects/Ids';

export interface DomainEvent {
  readonly occurredAt: Date;
  readonly eventType: string;
}

export class NodeFocusedEvent implements DomainEvent {
  readonly occurredAt: Date;
  readonly eventType = 'NodeFocused';

  constructor(
    public readonly nodeId: NodeId,
    public readonly relatedNodeIds: NodeId[]
  ) {
    this.occurredAt = new Date();
  }
}

export class NodeUnfocusedEvent implements DomainEvent {
  readonly occurredAt: Date;
  readonly eventType = 'NodeUnfocused';

  constructor(
    public readonly previousFocusedId: NodeId | null
  ) {
    this.occurredAt = new Date();
  }
}

export interface DimensionWeights {
  talentWeight: number;
  popularityWeight: number;
  luckWeight: number;
}

export class DimensionAdjustedEvent implements DomainEvent {
  readonly occurredAt: Date;
  readonly eventType = 'DimensionAdjusted';

  constructor(
    public readonly weights: DimensionWeights
  ) {
    this.occurredAt = new Date();
  }
}

export class DatasetUpdatedEvent implements DomainEvent {
  readonly occurredAt: Date;
  readonly eventType = 'DatasetUpdated';

  constructor(
    public readonly version: string,
    public readonly changedNodeCount: number
  ) {
    this.occurredAt = new Date();
  }
}

export class ScoringUpgradedEvent implements DomainEvent {
  readonly occurredAt: Date;
  readonly eventType = 'ScoringUpgraded';

  constructor(
    public readonly fromVersion: string,
    public readonly toVersion: string
  ) {
    this.occurredAt = new Date();
  }
}
