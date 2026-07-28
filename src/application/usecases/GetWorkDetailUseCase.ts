import { PoetRepository, WorkRepository, ScoreRepository } from '@/domain/ports/DataPorts';
import { type WorkDetailDTO, type PoetDTO, type WorkDTO } from '../dto/GalaxyDTO';

export interface GetWorkDetailRequest {
  workId: string;
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
    const works = await this.workRepo.loadAll();
    const work = works.find(w => w.id === request.workId);
    if (!work) {
      throw new Error(`未找到指定作品: ${request.workId}`);
    }

    const poet = await this.poetRepo.findById(work.poetId);
    if (!poet) {
      throw new Error(`未找到作品所属诗人: ${work.poetId}`);
    }

    const poetWorks = works.filter(w => w.poetId === work.poetId && w.id !== work.id);

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

    const relatedWorks: WorkDTO[] = poetWorks.map(w => ({
      id: w.id,
      title: w.title,
      genre: w.genre,
      poetId: w.poetId,
      poetName: w.poetName,
      threeQi: null,
    }));

    return {
      work: workDetail,
      poet: poetDTO,
      relatedWorks,
    };
  }
}
