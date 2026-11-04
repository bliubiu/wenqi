import { describe, it, expect } from 'vitest';
import { ShardSemanticIndex } from '../ShardSemanticIndex';

interface Files {
  [path: string]: unknown;
}

function makeLoader(files: Files) {
  const read = async (filename: string) => {
    if (files[filename] === undefined) throw new Error(`加载 ${filename} 失败`);
    return files[filename];
  };
  return {
    loadJson: read,
    loadVersionedJson: read,
  } as any;
}

/** 语义分片 k 默认空，仅 shard-0 有数据 */
function makeFiles(shard0Labels: Record<string, number[]>): Files {
  const files: Files = {
    'semantics/manifest.json': { version: 'semantic-v1-test' },
    'semantics/labels.json': {
      v: 1,
      labels: [
        { name: '孤寂', synonyms: ['孤独', '寂寥'] },
        { name: '悲秋', synonyms: ['寂寥'] },
        { name: '田园', synonyms: ['田家'] },
      ],
    },
    'search/dict-poets.json': { v: 1, poets: ['poet_1', 'poet_2', 'poet_3'] },
    'search/shard-0.json': {
      v: 2,
      count: 6,
      items: [
        [0, '静夜思', '床前明月光，疑是地上霜。'],
        [1, '登幽州台歌', '前不见古人，后不见来者。'],
        [2, '江雪', '千山鸟飞绝，万径人踪灭。'],
        [0, '将进酒', '君不见黄河之水天上来。'],
        [1, '过故人庄', '故人具鸡黍，邀我至田家。'],
        [2, '独坐敬亭山', '众鸟高飞尽，孤云独去闲。'],
      ],
    },
  };
  for (let i = 0; i < 16; i++) {
    files[`semantics/shard-${i}.json`] = { v: 1, count: 0, labels: {} };
  }
  files['semantics/shard-0.json'] = {
    v: 1,
    count: Object.values(shard0Labels).reduce((acc, arr) => acc + arr.length, 0),
    labels: shard0Labels,
  };
  return files;
}

// 标签 0「孤寂」命中作品 0 与 5；标签 1「悲秋」只命中作品 5；标签 2「田园」命中作品 4
// 分片内以增量编码：作品 0 → 5 记为 [0, 5]
const labelsByShard = { '0': [0, 5], '1': [5], '2': [4] };

describe('ShardSemanticIndex（意境标签倒排）', () => {
  it('标签名精确命中应召回作品并携带标题、摘句与标签', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    const hits = await index.search('孤寂', 20);
    expect(hits).toHaveLength(2);
    expect(hits[0].poetId).toBe('poet_1');
    expect(hits[0].title).toBe('静夜思');
    expect(hits[0].snippet).toContain('床前明月光');
    expect(hits[0].labels).toEqual(['孤寂']);
  });

  it('同义词查询应命中原标签', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    const hits = await index.search('孤独', 20);
    expect(hits).toHaveLength(2);
    expect(hits[0].labels).toEqual(['孤寂']);
  });

  it('增量编码应还原作品局部序号（第二条为差值累加）', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    const hits = await index.search('孤寂', 20);
    expect(hits[1].poetId).toBe('poet_3');
    expect(hits[1].title).toBe('独坐敬亭山');
  });

  it('命中多个标签的作品应排在前面并合并标签', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    const hits = await index.search('寂寥', 20);
    // 作品 5 同时命中「孤寂」（同义词）与「悲秋」
    expect(hits[0].title).toBe('独坐敬亭山');
    expect(hits[0].labels).toEqual(expect.arrayContaining(['孤寂', '悲秋']));
    expect(hits[1].labels).toEqual(['孤寂']);
  });

  it('命中数量应受 limit 截断', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    expect(await index.search('孤寂', 1)).toHaveLength(1);
  });

  it('单字查询不触发语义检索', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    expect(await index.search('孤', 20)).toEqual([]);
  });

  it('未命中任何标签时返回空数组', async () => {
    const index = new ShardSemanticIndex(makeLoader(makeFiles(labelsByShard)));

    expect(await index.search('黄河', 20)).toEqual([]);
  });

  it('分片加载失败应向上抛出（由用例层静默降级）', async () => {
    const index = new ShardSemanticIndex(makeLoader({}));

    await expect(index.search('孤寂', 20)).rejects.toThrow('加载 semantics/manifest.json 失败');
  });
});
