/**
 * 分片检索索引（方案 B 前端侧）
 *
 * 数据底座构建期导出的 16 个检索分片：
 * - 诗人 ID 经字典序号引用（dict-poets.json）
 * - 条目为 [诗人字典序号, 归一化小写标题, 归一化小写文本前 16 字]
 *
 * 首次全文搜索并行懒加载并经 DataLoader 缓存（内存 + IndexedDB），此后零网络开销。
 * 查询词经同一映射表归一化，使简体查询可命中繁体古本语料。
 * 匹配策略：线性扫描（构建期已小写化，扫描零转换），标题命中优先于文本命中。
 * 已实测：34.5 万条最坏全量扫描约 70–100ms（见 docs/09）；分片内倒排因
 * JSON 键开销导致索引体积 +120%（100MB），实测收益不抵代价，暂缓（决策记录见 docs/09）。
 */

import { type FullTextHit, type FullTextSearchPort } from '@/domain/ports/DataPorts';
import { DataLoader } from '@/infrastructure/data/DataLoader';
import { toSimplified } from '@/infrastructure/text/t2s';

const SHARD_COUNT = 16;

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

export class ShardSearchIndex implements FullTextSearchPort {
  private items: SearchShardFile['items'] | null = null;
  private poetDict: string[] | null = null;
  private loading: Promise<void> | null = null;
  private loader: DataLoader;

  constructor(loader: DataLoader = DataLoader.getInstance()) {
    this.loader = loader;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.items) return;
    if (!this.loading) {
      this.loading = (async () => {
        const [dict, ...shards] = await Promise.all([
          this.loader.loadJson<PoetDictFile>('search/dict-poets.json'),
          ...Array.from({ length: SHARD_COUNT }, (_, i) =>
            this.loader.loadJson<SearchShardFile>(`search/shard-${i}.json`)
          ),
        ]);
        this.poetDict = dict.poets;
        this.items = shards.flatMap((s) => s.items);
      })();
    }
    await this.loading;
  }

  async search(query: string, limit: number): Promise<FullTextHit[]> {
    const q = toSimplified(query.trim()).toLowerCase();
    // 单字查询命中面过大，全文索引限定 ≥2 字
    if (q.length < 2 || limit <= 0) return [];

    await this.ensureLoaded();
    if (!this.items || !this.poetDict) return [];

    const titleHits: FullTextHit[] = [];
    const textHits: FullTextHit[] = [];

    for (const [poetIdx, title, text] of this.items) {
      if (title.includes(q)) {
        titleHits.push({ workId: '', poetId: this.poetDict[poetIdx], poetName: '', title, snippet: text });
      } else if (text.includes(q)) {
        textHits.push({ workId: '', poetId: this.poetDict[poetIdx], poetName: '', title, snippet: text });
      }
      if (titleHits.length >= limit) break;
    }

    return [...titleHits, ...textHits].slice(0, limit);
  }
}
