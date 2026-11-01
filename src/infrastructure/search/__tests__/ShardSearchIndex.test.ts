import { describe, it, expect } from 'bun:test';
import { ShardSearchIndex } from '../ShardSearchIndex';

interface SearchShardLike {
  v: number;
  count: number;
  items: Array<[number, string, string]>;
  grams?: Record<string, string>;
}

function makeLoader(files: Record<string, unknown>) {
  return {
    loadJson: async (filename: string) => {
      const data = files[filename];
      if (data === undefined) throw new Error(`加载 ${filename} 失败`);
      return data;
    },
  } as any;
}

function makeFiles(shards: Record<number, SearchShardLike>): Record<string, unknown> {
  const files: Record<string, unknown> = {
    'search/dict-poets.json': { v: 1, poets: ['poet_1', 'poet_2', 'poet_3'] },
  };
  for (let i = 0; i < 16; i++) {
    files[`search/shard-${i}.json`] = shards[i] ?? { v: 2, count: 0, items: [] };
  }
  return files;
}

const shard0: SearchShardLike = {
  v: 2,
  count: 3,
  items: [
    [0, '静夜思', '床前明月光，疑是地上霜。'],
    [0, '将进酒', '君不见黄河之水天上来，明月照高楼。'],
    [1, '春望', '国破山河在，城春草木深。'],
  ],
};

describe('ShardSearchIndex（分片全文检索 v2）', () => {
  it('应加载诗人字典与全部分片后合并检索', async () => {
    const index = new ShardSearchIndex(makeLoader(makeFiles({ 0: shard0 })));

    const hits = await index.search('明月', 20);
    expect(hits).toHaveLength(2);
    expect(hits[0].poetId).toBe('poet_1');
    expect(hits[0].title).toBe('静夜思');
    expect(hits[0].snippet).toContain('床前明月光');
    expect(hits[1].workId).toBe('');
  });

  it('简体查询应经归一化匹配（索引为归一化简体）', async () => {
    const index = new ShardSearchIndex(makeLoader(makeFiles({ 0: shard0 })));

    // 用户输入繁体「靜夜」与简体「静夜」应命中同一结果
    const bySimplified = await index.search('静夜', 20);
    const byTraditional = await index.search('靜夜', 20);
    expect(bySimplified).toHaveLength(1);
    expect(byTraditional).toHaveLength(1);
    expect(byTraditional[0].title).toBe('静夜思');
  });

  it('标题命中应优先于文本命中', async () => {
    const index = new ShardSearchIndex(makeLoader(makeFiles({ 0: shard0 })));

    // 「明月」同时命中 w1 标题与 w2 文本，标题命中应排在前面
    const hits = await index.search('明月', 20);
    expect(hits[0].title).toBe('静夜思');
    expect(hits[0].poetId).toBe('poet_1');
  });

  it('命中数量应受 limit 截断', async () => {
    const index = new ShardSearchIndex(makeLoader(makeFiles({ 0: shard0 })));

    const hits = await index.search('黄河', 1);
    expect(hits).toHaveLength(1);
  });

  it('单字查询不触发全文检索', async () => {
    const index = new ShardSearchIndex(makeLoader(makeFiles({ 0: shard0 })));

    expect(await index.search('明', 20)).toEqual([]);
  });

  it('英文查询不区分大小写（索引构建期已小写化）', async () => {
    const shard: SearchShardLike = {
      v: 2,
      count: 1,
      items: [[2, 'water margin', 'never too late to learn.']],
    };
    const index = new ShardSearchIndex(makeLoader(makeFiles({ 0: shard })));

    const hits = await index.search('WATER', 20);
    expect(hits).toHaveLength(1);
    expect(hits[0].poetId).toBe('poet_3');
  });

  it('分片加载失败应向上抛出', async () => {
    const index = new ShardSearchIndex(makeLoader({}));
    await expect(index.search('明月', 20)).rejects.toThrow('加载 search/dict-poets.json 失败');
  });
});
