import { Galaxy } from '@/domain/aggregates/Galaxy';
import { LayoutService } from '@/domain/services/LayoutService';
import { type DimensionWeights } from '@/domain/events/DomainEvent';

export interface AdjustDimensionRequest {
  weights: DimensionWeights;
  animationDurationMs?: number;
}

export interface AdjustDimensionResponse {
  affectedNodeIds: string[];
  durationMs: number;
}

const WEIGHT_MIN = 0;
const WEIGHT_MAX = 2;

export class AdjustDimensionUseCase {
  constructor(
    private galaxy: Galaxy,
    private layoutService: LayoutService
  ) {}

  execute(request: AdjustDimensionRequest): AdjustDimensionResponse {
    this.validateWeights(request.weights);

    const allNodes = this.galaxy.getAllNodes();
    const positions = this.layoutService.recomputePositions(allNodes, request.weights);

    for (const [id, pos] of positions) {
      this.galaxy.setNodePosition(id, pos);
    }
    this.galaxy.setCurrentWeights(request.weights);

    return {
      affectedNodeIds: allNodes.map(n => n.id),
      durationMs: request.animationDurationMs ?? 600,
    };
  }

  private validateWeights(weights: DimensionWeights): void {
    if (
      weights.talentWeight < WEIGHT_MIN || weights.talentWeight > WEIGHT_MAX ||
      weights.popularityWeight < WEIGHT_MIN || weights.popularityWeight > WEIGHT_MAX ||
      weights.luckWeight < WEIGHT_MIN || weights.luckWeight > WEIGHT_MAX
    ) {
      throw new Error(
        `维度权重超出范围 [${WEIGHT_MIN}, ${WEIGHT_MAX}]: talent=${weights.talentWeight}, pop=${weights.popularityWeight}, luck=${weights.luckWeight}`
      );
    }
  }
}
