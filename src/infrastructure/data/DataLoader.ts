import type { WorkShardData } from './shard';
import { workShardRelPath } from './shard';
import type { DailyPoemsData } from '@/domain/value-objects/DailyPoem';

export interface BirthDeathInfo {
  startYear: number | null;
  endYear: number | null;
}

export interface Poet {
  id: string;
  name: string;
  dynasty: string;
  biography: string;
  workCount: number;
  courtesyName: string | null;
  pseudonym: string | null;
  birthDeath: BirthDeathInfo | null;
  school: string | null;
  hometown?: string | null;
  hometownLatitude?: number | null;
  hometownLongitude?: number | null;
}

export interface Work {
  id: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: string;
  genre: string;
  text: string;
}

export interface ScoreDimensionResult {
  value: number;
  factors?: Record<string, number>;
  algorithmVersion?: string;
}

export interface ScoreResult {
  poetId: string;
  poetName: string;
  dynasty: string;
  threeQi: {
    talent: ScoreDimensionResult;
    popularity: ScoreDimensionResult;
    luck: ScoreDimensionResult;
  };
}

export interface Node {
  id: string;
  refType: 'POET' | 'WORK';
  refId: string;
  position: { x: number; y: number; z: number };
  basePosition: { x: number; y: number; z: number };
  dynasty: string;
  genre: string | null;
  size: number;
  brightness: number;
  phase: number;
  state: string;
  label: string;
  /** 诗人生年（缺失时由初始化层回退朝代中值） */
  birthYear?: number | null;
}

/** 诗人行迹的一个阶段（与 public/data/processed/journeys.json 的 stages 对齐） */
export interface JourneyStage {
  seq: number;
  era: string;
  place: string;
  modern: string;
  lng: number;
  lat: number;
  kind: string;
  event: string;
  poem?: string | null;
}

/** 一位诗人的行迹（出生、游历、任职、贬谪、隐居、卒等编年系地） */
export interface Journey {
  key: string;
  name: string;
  dynasty: string;
  summary: string;
  stages: JourneyStage[];
}

export interface Dataset {
  poets: Poet[];
  works: Work[];
  scores: ScoreResult[];
  nodes: Node[];
}

export type { WorkShardData } from './shard';

export interface SpatialIndexNode {
  id: string;
  position: { x: number; y: number; z: number };
}

export interface SpatialIndex {
  kdTree: unknown;
  nodes: SpatialIndexNode[];
}

/**
 * 序列化格式标记
 * - JSON: 人类可读，适合调试（默认）
 * - BINCODE: 二进制紧凑格式，适合大量数据传输
 *
 * 当前实现全部使用 JSON 序列化。
 * bincode 通道仅在 WASM 高频接口中启用（searchBinary 等），
 * IndexedDB 持久化暂继续使用 JSON + 结构化克隆。
 */
export type SerializationFormat = 'json' | 'bincode';

const DB_NAME = 'WenQiDataCacheV1';
const STORE_NAME = 'data_cache';

let dbConnection: IDBDatabase | null = null;

async function openDataCacheDB(): Promise<IDBDatabase> {
  if (dbConnection) return dbConnection;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      dbConnection = request.result;
      resolve(dbConnection);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDataCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function saveToCache<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDataCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 缓存写入失败不阻塞主流程
  }
}

export class DataLoader {
  private cache: Map<string, unknown> = new Map();
  private basePath: string;
  private dataVersion: string | null = null;
  private static instance: DataLoader;

  private constructor(basePath: string = '/data/processed') {
    this.basePath = basePath;
  }  static getInstance(basePath?: string): DataLoader {
    if (!DataLoader.instance) {
      DataLoader.instance = new DataLoader(basePath);
    }
    return DataLoader.instance;
  }

  /** 数据集版本（来自 manifest.json）：用于 IndexedDB 缓存键，数据更新后旧缓存自然失效 */
  private async ensureVersion(): Promise<string> {
    if (this.dataVersion) return this.dataVersion;
    try {
      const res = await fetch(`${this.basePath}/manifest.json`);
      if (res.ok) {
        const manifest = await res.json();
        this.dataVersion = String(manifest.version ?? 'unknown');
        return this.dataVersion;
      }
    } catch {
      // manifest 不可达时退化为固定键（保留现有缓存）
    }
    this.dataVersion = 'unknown';
    return this.dataVersion;
  }

  async loadJson<T>(filename: string): Promise<T> {
    const version = await this.ensureVersion();
    return this.loadWithCacheKey<T>(filename, version);
  }

  /** 以额外版本号参与缓存键的加载（如关系数据 relationVersion，独立于数据集版本演进） */
  async loadVersionedJson<T>(filename: string, extraVersion: string): Promise<T> {
    const version = await this.ensureVersion();
    return this.loadWithCacheKey<T>(filename, `${version}:${extraVersion}`);
  }

  private async loadWithCacheKey<T>(filename: string, version: string): Promise<T> {
    const cacheKey = `${version}:${filename}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    const cached = await getFromCache<T>(cacheKey);
    if (cached) {
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const response = await fetch(`${this.basePath}/${filename}`);
    if (!response.ok) {
      throw new Error(`加载 ${filename} 失败: ${response.statusText}`);
    }

    const data = await response.json();
    this.cache.set(cacheKey, data);
    saveToCache(cacheKey, data);
    return data as T;
  }

  async loadPoets(): Promise<Poet[]> {
    return this.loadJson<Poet[]>('poets.json');
  }

  async loadWorks(): Promise<Work[]> {
    return this.loadJson<Work[]>('works.json');
  }

  /** 按诗人加载作品分片（由 SQLite 底座按诗人导出，路径可由 poetId 推导） */
  async loadWorkShard(poetId: string): Promise<WorkShardData> {
    return this.loadJson<WorkShardData>(workShardRelPath(poetId));
  }

  async loadScores(): Promise<ScoreResult[]> {
    return this.loadJson<ScoreResult[]>('scores.json');
  }

  /** 每日一诗年度日历（构建期生成，366 天） */
  async loadDailyPoems(): Promise<DailyPoemsData> {
    return this.loadJson<DailyPoemsData>('daily-poems.json');
  }

  async loadNodes(): Promise<Node[]> {
    return this.loadJson<Node[]>('nodes.json');
  }

  async loadSpatialIndex(): Promise<SpatialIndex> {
    return this.loadJson<SpatialIndex>('spatial-index.json');
  }

  /** 诗人行迹数据集（代表性诗人精选，由 scripts/build-journeys.py 生成） */
  async loadJourneys(): Promise<Journey[]> {
    const data = await this.loadJson<{ journeys: Journey[] }>('journeys.json');
    return data.journeys;
  }

  async loadDataset(): Promise<Dataset> {
    const [poets, works, scores, nodes] = await Promise.all([
      this.loadPoets(),
      this.loadWorks(),
      this.loadScores(),
      this.loadNodes(),
    ]);
    return { poets, works, scores, nodes };
  }

  clearCache(): void {
    this.cache.clear();
  }

  static async clearPersistentCache(): Promise<void> {
    try {
      const db = await openDataCacheDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // 忽略
    }
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}
