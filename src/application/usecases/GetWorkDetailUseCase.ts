import { PoetRepository, WorkRepository, ScoreRepository } from '@/domain/ports/DataPorts';
import { type WorkDetailDTO, type PoetDTO, type WorkDTO } from '../dto/GalaxyDTO';

export interface GetWorkDetailRequest {
  workId: string;
  /** 作品所属诗人 ID（分片加载按诗人组织，必填） */
  poetId: string;
}

export interface GetWorkDetailResponse {
  work: WorkDetailDTO;
  poet: PoetDTO;
  relatedWorks: WorkDTO[];
}

export class GetWorkDetailUseCase {
  constructor(
    private workRepo: WorkRepository,
    private poetRepo: PoetRepository,
    private scoreRepo: ScoreRepository
  ) {}

  async execute(request: GetWorkDetailRequest): Promise<GetWorkDetailResponse> {
    const poetWorks = await this.workRepo.findByPoetId(request.poetId);
    const work = poetWorks.find(w => w.id === request.workId);
    if (!work) {
      throw new Error(`未找到指定作品: ${request.workId}`);
    }

    const poet = await this.poetRepo.findById(work.poetId);
    if (!poet) {
      throw new Error(`未找到作品所属诗人: ${work.poetId}`);
    }

    const relatedWorks = poetWorks
      .filter(w => w.id !== work.id)
      .map(w => ({
        id: w.id,
        title: w.title,
        genre: w.genre,
        poetId: w.poetId,
        poetName: w.poetName,
        threeQi: null,
      }));

    const workDetail: WorkDetailDTO = {
      id: work.id,
      title: work.title,
      genre: work.genre,
      poetId: work.poetId,
      poetName: work.poetName,
      text: work.text,
      annotation: null,
      translation: null,
      threeQi: null,
    };

    const poetDTO: PoetDTO = {
      id: poet.id,
      name: poet.name,
      dynasty: poet.dynasty,
      biography: poet.biography,
      workCount: poet.workCount,
      courtesyName: poet.courtesyName,
      pseudonym: poet.pseudonym,
      school: poet.school,
    };

    return {
      work: workDetail,
      poet: poetDTO,
      relatedWorks,
    };
  }
}
