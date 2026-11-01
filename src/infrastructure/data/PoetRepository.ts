import { Poet } from '@/domain/entities/Poet';
import { type PoetRepository } from '@/domain/ports/DataPorts';
import { DataLoader } from './DataLoader';

const dataLoader = DataLoader.getInstance();

export class JsonPoetRepository implements PoetRepository {
  async loadAll(): Promise<Poet[]> {
    const raw = await dataLoader.loadPoets();
    return raw.map((p: any) => Poet.create(p));
  }

  async findById(id: string): Promise<Poet | null> {
    const raw = await dataLoader.loadPoets();
    const found = (raw as any[]).find((p: any) => p.id === id);
    return found ? Poet.create(found) : null;
  }
}
