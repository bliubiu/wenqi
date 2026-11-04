import { Galaxy } from '@/domain/aggregates/Galaxy';

export interface UnfocusRequest {
  animationDurationMs?: number;
}

export interface UnfocusResponse {
  restoredNodeIds: string[];
}

export class UnfocusUseCase {
  constructor(private galaxy: Galaxy) {}

  execute(_request?: UnfocusRequest): UnfocusResponse {
    const focusedId = this.galaxy.getFocusedNodeId();
    if (!focusedId) return { restoredNodeIds: [] };

    const convergedIds = this.galaxy.getNodesByState('CONVERGING')
      .concat(this.galaxy.getNodesByState('DIVERGED'))
      .map(n => n.id);

    this.galaxy.resetAllToIdle();
    this.galaxy.setFocusedNode(null);

    return { restoredNodeIds: convergedIds };
  }
}
