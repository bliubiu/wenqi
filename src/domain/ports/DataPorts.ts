import { Poet } from '../entities/Poet';
import { Work } from '../entities/Work';
import { GalaxyNode } from '../entities/Node';
import { Relation, type RelationType } from '../entities/Relation';
import { Galaxy } from '../aggregates/Galaxy';

/** 评分因子明细：因子键 → 原始分值 */
export type ScoreFactors = Record<string, number>;

export interface ScoreDimension {
  value: number;
  factors?: ScoreFactors;
  algorithmVersion?: string;
}

export interface ScoreData {
  poetId: string;
  poetName: string;
  dynasty: string;
  threeQi: {
    talent: ScoreDimension;
    popularity: ScoreDimension;
    luck: ScoreDimension;
  };
}

export interface PoetRepository {
  loadAll(): Promise<Poet[]>;
  findById(id: string): Promise<Poet | null>;
}

export interface WorkRepository {
  findByPoetId(poetId: string): Promise<Work[]>;
}

export interface NodeRepository {
  loadAll(): Promise<GalaxyNode[]>;
}

export interface ScoreRepository {
  loadAll(): Promise<ScoreData[]>;
  findByPoetId(poetId: string): Promise<ScoreData | null>;
}

export interface RelationRepository {
  findByNodeId(nodeId: string): Promise<Relation[]>;
  findByNodeIds(nodeIds: string[]): Promise<Relation[]>;
  findByType(relationType: RelationType): Promise<Relation[]>;
  count(): Promise<number>;
}

export interface GalaxyRepository {
  load(): Promise<Galaxy>;
  getNodeById(nodeId: string): Promise<GalaxyNode | null>;
  getRelationsOf(nodeId: string): Promise<Relation[]>;
}

export interface WasmComputePort {
  initialized: boolean;
  init(): Promise<void>;
  search(query: string, options?: {
    limit?: number;
    dynasty?: string;
    genre?: string;
  }): Promise<Array<{ nodeId: string; score: number; highlight?: string }>>;
  queryNearby(x: number, y: number, z: number, radius: number): Promise<string[]>;
}

/** 全文检索命中（作品级，命中后跳转所属诗人节点） */
export interface FullTextHit {
  /** 作品 ID（部分索引实现按序号引用，可为空串） */
  workId?: string;
  poetId: string;
  poetName: string;
  title: string;
  snippet: string;
}

/** 全文检索端口：标题 + 名句前缀的轻量索引（由数据底座构建期导出） */
export interface FullTextSearchPort {
  search(query: string, limit: number): Promise<FullTextHit[]>;
}

/** 语义（意境）检索命中：作品级，命中后跳转所属诗人 */
export interface SemanticHit {
  poetId: string;
  /** 命中的意境标签名（同一诗人可能命中多个） */
  labels: string[];
  /** 代表作品标题（已归一化） */
  title: string;
  snippet: string;
}

/** 语义检索端口：意境标签倒排索引（由数据底座构建期导出） */
export interface SemanticSearchPort {
  search(query: string, limit: number): Promise<SemanticHit[]>;
}

export interface LoggerPort {
  debug(module: string, message: string, context?: object): void;
  info(module: string, message: string, context?: object): void;
  error(module: string, message: string, error?: Error): void;
}
