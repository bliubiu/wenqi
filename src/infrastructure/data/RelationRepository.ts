import { GalaxyNode } from '@/domain/entities/Node';
import { Relation, type RelationType } from '@/domain/entities/Relation';
import { type RelationRepository } from '@/domain/ports/DataPorts';
import { RelationService } from '@/domain/services/RelationService';
import { DataLoader } from './DataLoader';

const dataLoader = DataLoader.getInstance();

export class JsonRelationRepository implements RelationRepository {
  private relations: Relation[] | null = null;

  constructor(private relationService: RelationService) {}

  private async ensureLoaded(): Promise<Relation[]> {
    if (this.relations) return this.relations;

    const rawNodes = await dataLoader.loadNodes();
    const nodes = (rawNodes as any[]).map((n) => GalaxyNode.create(n));
    this.relations = this.relationService.generateFromNodes(nodes);

    return this.relations;
  }

  async findByNodeId(nodeId: string): Promise<Relation[]> {
    const relations = await this.ensureLoaded();
    return relations.filter((r) => r.sourceId === nodeId || r.targetId === nodeId);
  }

  async findByNodeIds(nodeIds: string[]): Promise<Relation[]> {
    const relations = await this.ensureLoaded();
    const idSet = new Set(nodeIds);
    return relations.filter((r) => idSet.has(r.sourceId) || idSet.has(r.targetId));
  }

  async findByType(relationType: RelationType): Promise<Relation[]> {
    const relations = await this.ensureLoaded();
    return relations.filter((r) => r.relationType === relationType);
  }

  async count(): Promise<number> {
    const relations = await this.ensureLoaded();
    return relations.length;
  }
}
