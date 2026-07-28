import { WasmComputePort, NodeRepository } from '@/domain/ports/DataPorts';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodeDTO } from '../dto/GalaxyDTO';

export class SearchUseCase {
  constructor(
    private nodeRepo: NodeRepository,
    private wasm?: WasmComputePort
  ) {}

  async execute(query: string): Promise<NodeDTO[]> {
    if (!query.trim()) return [];

    if (this.wasm?.initialized) {
      try {
        const results = await this.wasm.search(query, { limit: 20 });
        const allNodes = await this.nodeRepo.loadAll();
        const nodeMap = new Map<string, GalaxyNode>();
        allNodes.forEach((n) => nodeMap.set(n.id, n));

        return results
          .map((r) => nodeMap.get(r.nodeId))
          .filter((n): n is GalaxyNode => n !== undefined)
          .map(this.toNodeDTO);
      } catch {
        return this.fallbackSearch(query);
      }
    }

    return this.fallbackSearch(query);
  }

  private async fallbackSearch(query: string): Promise<NodeDTO[]> {
    const allNodes = await this.nodeRepo.loadAll();
    const lowerQuery = query.toLowerCase();

    return allNodes
      .filter((node) => node.label.toLowerCase().includes(lowerQuery))
      .slice(0, 20)
      .map(this.toNodeDTO);
  }

  private toNodeDTO(node: GalaxyNode): NodeDTO {
    return {
      id: node.id,
      refType: node.refType,
      refId: node.refId,
      position: 'toVector3' in node.position
        ? (node.position as any).toVector3()
        : node.position as { x: number; y: number; z: number },
      dynasty: node.dynasty,
      size: node.size,
      brightness: node.brightness,
      label: node.label,
    };
  }
}
