import { Poet } from '../entities/Poet';
import { Work } from '../entities/Work';
import { GalaxyNode } from '../entities/Node';
import { Relation, type RelationType } from '../entities/Relation';
import { Galaxy } from '../aggregates/Galaxy';

export interface ScoreData {
  poetId: string;
  poetName: string;
  dynasty: string;
  threeQi: {
    talent: { value: number };
    popularity: { value: number };
    luck: { value: number };
  };
}

export interface PoetRepository {
  loadAll(): Promise<Poet[]>;
  findById(id: string): Promise<Poet | null>;
}

export interface WorkRepository {
  loadAll(): Promise<Work[]>;
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

export interface LoggerPort {
  debug(module: string, message: string, context?: object): void;
  info(module: string, message: string, context?: object): void;
  error(module: string, message: string, error?: Error): void;
}
