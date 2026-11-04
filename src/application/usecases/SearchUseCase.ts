import {
  WasmComputePort,
  NodeRepository,
  FullTextSearchPort,
  SemanticSearchPort,
} from '@/domain/ports/DataPorts';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodeDTO } from '../dto/GalaxyDTO';

export const SEARCH_RESULT_LIMIT = 20;

export class SearchUseCase {
  constructor(
    private nodeRepo: NodeRepository,
    private wasm?: WasmComputePort,
    private fullText?: FullTextSearchPort,
    private semantic?: SemanticSearchPort
  ) {}

  async execute(query: string): Promise<NodeDTO[]> {
    if (!query.trim()) return [];

    const nodes = await this.nodeRepo.loadAll();
    const nodeByRefId = new Map<string, GalaxyNode>();
    nodes.forEach((n) => nodeByRefId.set(n.refId, n));

    const out: NodeDTO[] = [];
    const seen = new Set<string>();
    const push = (node: GalaxyNode | undefined, extra?: { matchedTitle?: string; snippet?: string; matchedLabels?: string[] }) => {
      if (!node || seen.has(node.refId) || out.length >= SEARCH_RESULT_LIMIT) return;
      seen.add(node.refId);
      out.push({ ...this.toNodeDTO(node), ...extra });
    };

    const normalizedQuery = query.trim().toLowerCase();

    // ⓪ 诗人名全等命中优先：避免同名作品（如宋人诗作《李白》）占据首条
    const exactLabelRefIds = new Set(
      nodes
        .filter((node) => node.label.trim().toLowerCase() === normalizedQuery)
        .slice(0, SEARCH_RESULT_LIMIT)
        .map((node) => node.refId)
    );
    nodes
      .filter((node) => exactLabelRefIds.has(node.refId))
      .forEach((node) => push(node));

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
    const exactTitleNodes: NodeDTO[] = [];
    if (this.fullText && out.length < SEARCH_RESULT_LIMIT) {
      const hits = await this.fullText.search(query, SEARCH_RESULT_LIMIT - out.length);
      for (const hit of hits) {
        // 标题全等命中单独收集，避免被之前的模糊命中（如“苏东坡前赤壁赋图”）挤到后面
        if (hit.title === normalizedQuery && !seen.has(hit.poetId)) {
          const node = nodeByRefId.get(hit.poetId);
          if (node) {
            seen.add(node.refId);
            exactTitleNodes.push({ ...this.toNodeDTO(node), matchedTitle: hit.title, snippet: hit.snippet });
            continue;
          }
        }
        push(nodeByRefId.get(hit.poetId), { matchedTitle: hit.title, snippet: hit.snippet });
      }
    }

    // ④ 意境语义通道（全文命中优先，语义补齐；索引异常时静默降级）
    if (this.semantic && out.length < SEARCH_RESULT_LIMIT) {
      try {
        const hits = await this.semantic.search(query, SEARCH_RESULT_LIMIT - out.length);
        hits.forEach((hit) =>
          push(nodeByRefId.get(hit.poetId), {
            matchedTitle: hit.title,
            snippet: hit.snippet,
            matchedLabels: hit.labels,
          })
        );
      } catch {
        // 语义索引不可用时保留现有三通道结果
      }
    }

    // 诗人名全等命中始终排在同名作品之前
    const labelFirst = out.filter((item) => exactLabelRefIds.has(item.refId));
    const others = out.filter((item) => !exactLabelRefIds.has(item.refId));
    return [...labelFirst, ...exactTitleNodes, ...others].slice(0, SEARCH_RESULT_LIMIT);
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
