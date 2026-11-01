import { describe, it, expect } from 'bun:test';
import { JsonWorkRepository } from '../WorkRepository';
import type { WorkShardData } from '../shard';

function makeShard(overrides: Partial<WorkShardData> = {}): WorkShardData {
  return {
    poetId: 'poet_1',
    dynasty: 'TANG',
    count: 2,
    works: [
      { id: 'w1', title: '静夜思', poetId: 'poet_1', poetName: '李白', dynasty: 'TANG', genre: 'SHI', text: '床前明月光' },
      { id: 'w2', title: '将进酒', poetId: 'poet_1', poetName: '李白', dynasty: 'TANG', genre: 'SHI', text: '君不见黄河之水天上来' },
    ],
    ...overrides,
  };
}

describe('JsonWorkRepository（按诗人分片加载）', () => {
  it('应加载诗人分片并转换为 Work 实体', async () => {
    const shard = makeShard();
    const loader = { loadWorkShard: async () => shard };
    const repo = new JsonWorkRepository(loader as any);

    const works = await repo.findByPoetId('poet_1');

    expect(works).toHaveLength(2);
    expect(works[0].id).toBe('w1');
    expect(works[0].title).toBe('静夜思');
    expect(works[0].poetId).toBe('poet_1');
    expect(works[0].text).toBe('床前明月光');
  });

  it('应将分片数据交给加载器按 poetId 请求', async () => {
    const requested: string[] = [];
    const loader = {
      loadWorkShard: async (poetId: string) => {
        requested.push(poetId);
        return makeShard({ poetId });
      },
    };
    const repo = new JsonWorkRepository(loader as any);

    await repo.findByPoetId('poet_9');
    expect(requested).toEqual(['poet_9']);
  });

  it('分片加载失败时应向上抛出异常', async () => {
    const loader = { loadWorkShard: async () => { throw new Error('分片不存在'); } };
    const repo = new JsonWorkRepository(loader as any);

    await expect(repo.findByPoetId('poet_missing')).rejects.toThrow('分片不存在');
  });
});
