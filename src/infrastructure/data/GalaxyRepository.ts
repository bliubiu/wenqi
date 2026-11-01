import { Galaxy } from '@/domain/aggregates/Galaxy';
import { GalaxyNode } from '@/domain/entities/Node';
import { Relation } from '@/domain/entities/Relation';
import { type GalaxyRepository } from '@/domain/ports/DataPorts';
import { RelationService } from '@/domain/services/RelationService';
import { DataLoader } from './DataLoader';
import { JsonRelationRepository } from './RelationRepository';

const dataLoader = DataLoader.getInstance();

export class JsonGalaxyRepository implements GalaxyRepository {
  private relationRepo: JsonRelationRepository;

  constructor(relationService: RelationService) {
    this.relationRepo = new JsonRelationRepository(relationService);
  }

  async load(): Promise<Galaxy> {
    const raw = await dataLoader.loadNodes();
    const galaxy = new Galaxy();
    for (const n of raw as any[]) {
      galaxy.addNode(GalaxyNode.create(n));
    }
    return galaxy;
  }

  async getNodeById(nodeId: string): Promise<GalaxyNode | null> {
    const raw = await dataLoader.loadNodes();
    const found = (raw as any[]).find((n) => n.id === nodeId);
    return found ? GalaxyNode.create(found) : null;
  }

  async getRelationsOf(nodeId: string): Promise<Relation[]> {
    return this.relationRepo.findByNodeId(nodeId);
  }
}
