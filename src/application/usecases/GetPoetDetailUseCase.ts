import { PoetRepository, WorkRepository, ScoreRepository } from '@/domain/ports/DataPorts';
import { type PoetDetailDTO, type WorkDTO, type RelationDTO } from '../dto/GalaxyDTO';

export interface GetPoetDetailRequest {
  poetId: string;
}

export interface GetPoetDetailResponse {
  poet: PoetDetailDTO;
  works: WorkDTO[];
  relations: RelationDTO[];
}

export class GetPoetDetailUseCase {
  constructor(
    private poetRepo: PoetRepository,
    private workRepo: WorkRepository,
    private scoreRepo: ScoreRepository
  ) {}

  async execute(request: GetPoetDetailRequest): Promise<GetPoetDetailResponse> {
    const poet = await this.poetRepo.findById(request.poetId);
    if (!poet) {
      throw new Error(`未找到指定诗人: ${request.poetId}`);
    }

    const [works, score] = await Promise.all([
      this.workRepo.findByPoetId(request.poetId),
      this.scoreRepo.findByPoetId(request.poetId),
    ]);

    const worksDTO: WorkDTO[] = works.map(w => ({
      id: w.id,
      title: w.title,
      genre: w.genre,
      poetId: w.poetId,
      poetName: w.poetName,
      threeQi: null,
    }));

    const poetDTO = {
      id: poet.id,
      name: poet.name,
      dynasty: poet.dynasty,
      biography: poet.biography,
      workCount: poet.workCount,
      courtesyName: poet.courtesyName,
      pseudonym: poet.pseudonym,
      school: poet.school,
    };

    const response: GetPoetDetailResponse = {
      poet: {
        poet: poetDTO,
        score: score ? {
          poetId: score.poetId,
          poetName: score.poetName,
          dynasty: score.dynasty,
          talent: score.threeQi.talent.value,
          popularity: score.threeQi.popularity.value,
          luck: score.threeQi.luck.value,
        } : null,
        node: {
          id: request.poetId,
          refType: 'POET',
          refId: request.poetId,
          position: { x: 0, y: 0, z: 0 },
          dynasty: poet.dynasty,
          size: 1,
          brightness: 1,
          label: poet.name,
        },
      },
      works: worksDTO,
      relations: [],
    };

    return response;
  }
}
