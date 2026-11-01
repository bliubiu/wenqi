import { GalaxyNode } from '@/domain/entities/Node';
import { type NodeRepository } from '@/domain/ports/DataPorts';
import { DataLoader } from './DataLoader';

const dataLoader = DataLoader.getInstance();

export class JsonNodeRepository implements NodeRepository {
  async loadAll(): Promise<GalaxyNode[]> {
    const raw = await dataLoader.loadNodes();
    return (raw as any[]).map((n) => GalaxyNode.create(n));
  }
}
