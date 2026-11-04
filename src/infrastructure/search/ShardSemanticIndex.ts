/**
 * 分片语义（意境）检索索引（WQ-4 阶段一）
 *
 * 数据底座构建期按意境标签对作品打分，产出 16 个语义分片：
 * - semantics/labels.json：标签名与同义词（运行时查询入口）
 * - semantics/shard-{i}.json：{ labelIdx: [Δ作品局部序号, ...] } 紧凑倒排
 * - semantics/manifest.json：独立语义版本（参与缓存键）
 *
 * 作品局部序号与 search/shard-{i}.json 的 items 下标严格对齐（构建期已校验），
 * 因此命中后按需回读检索分片，取诗人、归一化标题与文本前缀；语义分片只存增量整数，
 * 不复制数据。检索分片经 DataLoader 缓存（与全文通道共享），懒加载不计首屏。
 *
 * 标签匹配：查询词归一化后与标签名/同义词精确匹配，查询 ≥2 字时允许标签词包含查询。
 * 结果按命中标签数降序，同分保持分片与桶内原序。
 */

import { type SemanticHit, type SemanticSearchPort } from '@/domain/ports/DataPorts';
import { DataLoader } from '@/infrastructure/data/DataLoader';
import { toSimplified } from '@/infrastructure/text/t2s';

const SHARD_COUNT = 16;

interface SemanticLabelsFile {
  v: number;
  labels: Array<{ name: string; synonyms: string[] }>;
}

interface SemanticShardFile {
  v: number;
  count: number;
  /** 标签序号 → [作品局部序号增量, ...]（首条为绝对序号，其后为与前一条的差值） */
  labels: Record<string, number[]>;
}

interface SemanticManifestFile {
  version?: string;
}

interface PoetDictFile {
  v: number;
  poets: string[];
}

interface SearchShardFile {
  v: number;
  count: number;
  /** [诗人字典序号, 归一化小写标题, 归一化小写文本前 16 字] */
  items: Array<[number, string, string]>;
}

interface RecallEntry {
  shard: number;
  localIdx: number;
  labels: string[];
}

export class ShardSemanticIndex implements SemanticSearchPort {
  private labels: SemanticLabelsFile['labels'] | null = null;
  private semanticShards: SemanticShardFile[] | null = null;
  private poetDict: string[] | null = null;
  private loading: Promise<void> | null = null;
  private loader: DataLoader;

  constructor(loader: DataLoader = DataLoader.getInstance()) {
    this.loader = loader;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.labels) return;
    if (!this.loading) {
      this.loading = this.loadAll().catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    await this.loading;
  }

  private async loadAll(): Promise<void> {
    const manifest = await this.loader.loadJson<SemanticManifestFile>('semantics/manifest.json');
    const version = manifest.version ?? 'v1';
    const [labelsFile, dict, ...shards] = await Promise.all([
      this.loader.loadVersionedJson<SemanticLabelsFile>('semantics/labels.json', version),
      this.loader.loadJson<PoetDictFile>('search/dict-poets.json'),
      ...Array.from({ length: SHARD_COUNT }, (_, i) =>
        this.loader.loadVersionedJson<SemanticShardFile>(`semantics/shard-${i}.json`, version)
      ),
    ]);
    this.labels = labelsFile.labels;
    this.poetDict = dict.poets;
    this.semanticShards = shards;
  }

  async search(query: string, limit: number): Promise<SemanticHit[]> {
    const q = toSimplified(query.trim()).toLowerCase();
    // 意境标签均为双字及以上，单字查询不触发语义通道
    if (q.length < 2 || limit <= 0) return [];

    await this.ensureLoaded();
    if (!this.labels || !this.semanticShards || !this.poetDict) return [];

    // 标签名/同义词精确匹配，查询 ≥2 字时允许标签词包含查询
    const matchedLabelIdxs: number[] = [];
    this.labels.forEach((label, idx) => {
      const terms = [label.name, ...label.synonyms]
        .map((t) => toSimplified(t.trim()).toLowerCase())
        .filter(Boolean);
      if (terms.some((term) => term === q || term.includes(q))) {
        matchedLabelIdxs.push(idx);
      }
    });
    if (matchedLabelIdxs.length === 0) return [];

    // 倒排召回：同一作品按命中的标签数聚合（分片内条目按作品顺序递增，用增量还原下标）
    const recall = new Map<string, RecallEntry>();
    for (const labelIdx of matchedLabelIdxs) {
      const labelName = this.labels[labelIdx].name;
      for (let shard = 0; shard < SHARD_COUNT; shard++) {
        const arr = this.semanticShards[shard].labels[String(labelIdx)];
        if (!arr) continue;
        let localIdx = 0;
        for (let i = 0; i < arr.length; i++) {
          localIdx = i === 0 ? arr[i] : localIdx + arr[i];
          const key = `${shard}:${localIdx}`;
          const entry = recall.get(key);
          if (entry) {
            entry.labels.push(labelName);
          } else {
            recall.set(key, { shard, localIdx, labels: [labelName] });
          }
        }
      }
    }

    // 命中标签数降序；同分保持分片/桶内原序
    const ranked = [...recall.values()]
      .map((entry, order) => ({ entry, order }))
      .sort((a, b) => b.entry.labels.length - a.entry.labels.length || a.order - b.order)
      .slice(0, limit)
      .map(({ entry }) => entry);

    // 按需回读涉及的检索分片（与全文通道共享 DataLoader 缓存）
    const neededShards = [...new Set(ranked.map((entry) => entry.shard))];
    const shardFiles = await Promise.all(
      neededShards.map((shard) =>
        this.loader.loadJson<SearchShardFile>(`search/shard-${shard}.json`)
      )
    );
    const shardMap = new Map(neededShards.map((shard, i) => [shard, shardFiles[i]]));

    const hits: SemanticHit[] = [];
    for (const entry of ranked) {
      const item = shardMap.get(entry.shard)?.items[entry.localIdx];
      const poetId = item ? this.poetDict[item[0]] : undefined;
      if (!item || !poetId) continue;
      hits.push({
        poetId,
        title: item[1],
        snippet: item[2],
        labels: entry.labels,
      });
    }
    return hits;
  }
}
