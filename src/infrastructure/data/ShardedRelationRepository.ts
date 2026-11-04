/**
 * 分片关系仓储（构建期挖掘 + 16 分片懒加载）
 *
 * 数据底座 mine-relations 管线写库、db:export 按来源诗人 16 分片导出：
 * - relations/dict.json：诗人 ID 全集字典（下标即序号）
 * - relations/shard-{i}.json：edges 为 [sIdx, tIdx, typeIdx, wInt, evIdx] 紧凑元组
 *
 * 首次查询并行懒加载全部分片并经 DataLoader 缓存（内存 + IndexedDB，键含 relationVersion）；
 * 分片不可用时回退运行时即时生成（同朝代兜底口径）。
 */

import {
  Relation,
  RELATION_TYPES,
  type RelationEvidence,
  type RelationType,
} from '@/domain/entities/Relation';
import { GalaxyNode } from '@/domain/entities/Node';
import { type RelationRepository } from '@/domain/ports/DataPorts';
import { RelationService } from '@/domain/services/RelationService';
import { DataLoader } from './DataLoader';

const SHARD_COUNT = 16;
const NODE_ID_PREFIX = 'node_';

interface RelationDictFile {
  v: number;
  poets: string[];
}

interface RelationShardFile {
  v: number;
  count: number;
  /** 本片涉及的诗人字典下标 */
  poets: number[];
  /** [sIdx, tIdx, typeIdx, wInt(权重×100), evIdx(-1 无证据)] */
  edges: Array<[number, number, number, number, number]>;
  /** 证据对象（与库表 evidence 同构：{kind, titles?, quote?}） */
  ev: Array<Record<string, unknown>>;
}

interface EdgeRecord {
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  weight: number;
  evidence?: RelationEvidence;
}

export class ShardedRelationRepository implements RelationRepository {
  /** poetId → 与该诗人相连的边（双向索引） */
  private edgeIndex: Map<string, EdgeRecord[]> | null = null;
  private totalEdges = 0;
  private allEdges: EdgeRecord[] = [];
  private loading: Promise<void> | null = null;
  private fallbackUsed = false;

  constructor(
    private relationService: RelationService,
    private loader: DataLoader = DataLoader.getInstance()
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.edgeIndex) return;
    if (!this.loading) {
      this.loading = this.loadShards().catch(() => this.loadFallback());
    }
    await this.loading;
  }

  private async loadShards(): Promise<void> {
    const manifest = await this.loader.loadJson<{ relationVersion?: string }>('manifest.json');
    const version = manifest.relationVersion ?? 'v1';
    const [dict, ...shards] = await Promise.all([
      this.loader.loadVersionedJson<RelationDictFile>('relations/dict.json', version),
      ...Array.from({ length: SHARD_COUNT }, (_, i) =>
        this.loader.loadVersionedJson<RelationShardFile>(`relations/shard-${i}.json`, version)
      ),
    ]);

    const index = new Map<string, EdgeRecord[]>();
    const allEdges: EdgeRecord[] = [];
    const pushEdge = (poetId: string, edge: EdgeRecord) => {
      const list = index.get(poetId);
      if (list) list.push(edge);
      else index.set(poetId, [edge]);
    };

    for (const shard of shards) {
      for (const [sIdx, tIdx, typeIdx, wInt, evIdx] of shard.edges) {
        const sourceId = dict.poets[sIdx];
        const targetId = dict.poets[tIdx];
        if (!sourceId || !targetId) continue;
        const rawEv = evIdx >= 0 ? shard.ev[evIdx] : undefined;
        const edge: EdgeRecord = {
          sourceId,
          targetId,
          relationType: RELATION_TYPES[typeIdx] ?? 'SAME_DYNASTY',
          weight: wInt / 100,
          evidence: rawEv ? (rawEv as unknown as RelationEvidence) : undefined,
        };
        pushEdge(sourceId, edge);
        pushEdge(targetId, edge);
        allEdges.push(edge);
      }
    }

    this.edgeIndex = index;
    this.allEdges = allEdges;
    this.totalEdges = allEdges.length;
  }

  /** 分片不可用时的兜底：运行时按同朝代规则即时生成（与构建期口径一致的低配版） */
  private async loadFallback(): Promise<void> {
    this.fallbackUsed = true;
    const rawNodes = await this.loader.loadNodes();
    const nodes = rawNodes.map((n) => GalaxyNode.create(n as never));
    const relations = this.relationService.generateFromNodes(nodes);
    const index = new Map<string, EdgeRecord[]>();
    const allEdges: EdgeRecord[] = [];
    const pushEdge = (poetId: string, edge: EdgeRecord) => {
      const list = index.get(poetId);
      if (list) list.push(edge);
      else index.set(poetId, [edge]);
    };
    for (const r of relations) {
      const sourceId = stripNodePrefix(r.sourceId);
      const targetId = stripNodePrefix(r.targetId);
      const edge: EdgeRecord = {
        sourceId, targetId, relationType: r.relationType, weight: r.weight,
      };
      pushEdge(sourceId, edge);
      pushEdge(targetId, edge);
      allEdges.push(edge);
    }
    this.edgeIndex = index;
    this.allEdges = allEdges;
    this.totalEdges = allEdges.length;
  }

  /** 节点 ID（node_poet_xxx）→ 诗人 ID（poet_xxx） */
  private toPoetId(nodeId: string): string {
    return nodeId.startsWith(NODE_ID_PREFIX) ? nodeId.slice(NODE_ID_PREFIX.length) : nodeId;
  }

  private toEntity(edge: EdgeRecord, index: number): Relation {
    return new Relation(
      `rel_loaded_${index}`,
      `${NODE_ID_PREFIX}${edge.sourceId}`,
      `${NODE_ID_PREFIX}${edge.targetId}`,
      edge.relationType,
      edge.weight,
      edge.evidence
    );
  }

  async findByNodeId(nodeId: string): Promise<Relation[]> {
    await this.ensureLoaded();
    const poetId = this.toPoetId(nodeId);
    const edges = this.edgeIndex?.get(poetId) ?? [];
    return edges.map((edge, i) => this.toEntity(edge, i));
  }

  async findByNodeIds(nodeIds: string[]): Promise<Relation[]> {
    await this.ensureLoaded();
    const poetIds = new Set(nodeIds.map((id) => this.toPoetId(id)));
    const seen = new Set<string>();
    const out: Relation[] = [];
    for (const edge of this.allEdges) {
      if (!poetIds.has(edge.sourceId) && !poetIds.has(edge.targetId)) continue;
      const key = `${edge.sourceId}|${edge.targetId}|${edge.relationType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(this.toEntity(edge, out.length));
    }
    return out;
  }

  async findByType(relationType: RelationType): Promise<Relation[]> {
    await this.ensureLoaded();
    return this.allEdges
      .filter((edge) => edge.relationType === relationType)
      .map((edge, i) => this.toEntity(edge, i));
  }

  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.totalEdges;
  }

  /** 是否处于兜底模式（分片不可用），供诊断 */
  isFallbackUsed(): boolean {
    return this.fallbackUsed;
  }
}

function stripNodePrefix(nodeId: string): string {
  return nodeId.startsWith(NODE_ID_PREFIX) ? nodeId.slice(NODE_ID_PREFIX.length) : nodeId;
}
