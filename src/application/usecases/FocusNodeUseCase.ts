import { PoetRepository, ScoreRepository } from '@/domain/ports/DataPorts';
import { PoetDetailDTO } from '../dto/GalaxyDTO';

export class FocusNodeUseCase {
  constructor(
    private poetRepo: PoetRepository,
    private scoreRepo: ScoreRepository
  ) {}

  async execute(refId: string): Promise<PoetDetailDTO | null> {
    const poet = await this.poetRepo.findById(refId);
    if (!poet) return null;

    const score = await this.scoreRepo.findByPoetId(refId);

    return {
      poet: {
        id: poet.id,
        name: poet.name,
        dynasty: poet.dynasty,
        biography: poet.biography,
        workCount: poet.workCount,
      },
      score: score ? {
        poetId: score.poetId,
        poetName: score.poetName,
        dynasty: score.dynasty,
        talent: score.threeQi.talent.value,
        popularity: score.threeQi.popularity.value,
        luck: score.threeQi.luck.value,
      } : null,
      node: {
        id: refId,
        refType: 'POET',
        refId,
        position: { x: 0, y: 0, z: 0 },
        dynasty: poet.dynasty,
        size: 1,
        brightness: 1,
        label: poet.name,
      },
    };
  }
}
