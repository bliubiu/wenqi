import { type ScoreRepository, type ScoreData } from '@/domain/ports/DataPorts';
import { DataLoader } from './DataLoader';

const dataLoader = DataLoader.getInstance();

export class JsonScoreRepository implements ScoreRepository {
  async loadAll(): Promise<ScoreData[]> {
    return dataLoader.loadScores() as Promise<ScoreData[]>;
  }

  async findByPoetId(poetId: string): Promise<ScoreData | null> {
    const scores = await dataLoader.loadScores();
    return (scores as any[]).find((s) => s.poetId === poetId) || null;
  }
}
