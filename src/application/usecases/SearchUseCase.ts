import { WasmComputePort, NodeRepository, FullTextSearchPort } from '@/domain/ports/DataPorts';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodeDTO } from '../dto/GalaxyDTO';

export const SEARCH_RESULT_LIMIT = 20;

export class SearchUseCase {
  constructor(
    private nodeRepo: NodeRepository,
    private wasm?: WasmComputePort,
    private fullText?: FullTextSearchPort
  ) {}

  async execute(query: string): Promise<NodeDTO[]> {
    if (!query.trim()) return [];

    const nodes = await this.nodeRepo.loadAll();
    const nodeByRefId = new Map<string, GalaxyNode>();
    nodes.forEach((n) => nodeByRefId.set(n.refId, n));

    const out: NodeDTO[] = [];
    const seen = new Set<string>();
    const push = (node: GalaxyNode | undefined, extra?: { matchedTitle?: string; snippet?: string }) => {
      if (!node || seen.has(node.refId) || out.length >= SEARCH_RESULT_LIMIT) return;
      seen.add(node.refId);
      out.push({ ...this.toNodeDTO(node), ...extra });
    };

    // ① WASM 检索通道（索引未喂入或初始化失败时静默降级）
    if (this.wasm?.initialized) {
      try {
        const results = await this.wasm.search(query, { limit: SEARCH_RESULT_LIMIT });
        results.forEach((r) => push(nodeByRefId.get(r.nodeId)));
      } catch {
        // 降级到纯前端匹配
      }
    }

    // ② 纯前端诗人名匹配
    if (out.length === 0) {
      const lowerQuery = query.toLowerCase();
      nodes
        .filter((node) => node.label.toLowerCase().includes(lowerQuery))
        .slice(0, SEARCH_RESULT_LIMIT)
        .forEach((node) => push(node));
    }

    // ③ 全文检索补充（标题 + 名句前缀，命中后跳转所属诗人）
    if (this.fullText && out.length < SEARCH_RESULT_LIMIT) {
      const hits = await this.fullText.search(query, SEARCH_RESULT_LIMIT - out.length);
      for (const hit of hits) {
        push(nodeByRefId.get(hit.poetId), { matchedTitle: hit.title, snippet: hit.snippet });
      }
    }

    return out;
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
