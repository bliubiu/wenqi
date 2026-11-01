import { Work } from '@/domain/entities/Work';
import { type WorkRepository } from '@/domain/ports/DataPorts';
import { DataLoader } from './DataLoader';

export class JsonWorkRepository implements WorkRepository {
  private loader: DataLoader;

  constructor(loader: DataLoader = DataLoader.getInstance()) {
    this.loader = loader;
  }

  async findByPoetId(poetId: string): Promise<Work[]> {
    const shard = await this.loader.loadWorkShard(poetId);
    return shard.works.map((w) => Work.create(w));
  }
}
