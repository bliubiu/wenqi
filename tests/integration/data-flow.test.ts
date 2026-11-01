import { describe, it, expect, vi } from 'vitest';

// 模拟数据在 vi.hoisted 中定义，确保 vi.mock 工厂函数可访问
const { mockPoets, mockScores, mockNodes, mockWorks, createMockLoader, mockLoaderRef } = vi.hoisted(() => {
  const mockPoets = [
    { id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '唐代伟大的浪漫主义诗人', workCount: 1010 },
    { id: 'poet_2', name: '杜甫', dynasty: 'TANG', biography: '唐代伟大的现实主义诗人', workCount: 1400 },
    { id: 'poet_3', name: '苏轼', dynasty: 'SONG', biography: '北宋文学家、书画家', workCount: 2000 },
  ];

  const mockScores = [
    { poetId: 'poet_1', poetName: '李白', dynasty: 'TANG', threeQi: { talent: { value: 95 }, popularity: { value: 90 }, luck: { value: 40 } } },
    { poetId: 'poet_2', poetName: '杜甫', dynasty: 'TANG', threeQi: { talent: { value: 93 }, popularity: { value: 88 }, luck: { value: 30 } } },
    { poetId: 'poet_3', poetName: '苏轼', dynasty: 'SONG', threeQi: { talent: { value: 90 }, popularity: { value: 85 }, luck: { value: 50 } } },
  ];

  const mockNodes = [
    { id: 'n1', refType: 'POET', refId: 'poet_1', position: { x: 10, y: 20, z: 30 }, basePosition: { x: 10, y: 20, z: 30 }, dynasty: 'TANG', genre: null, size: 3, brightness: 0.8, phase: 0, state: 'IDLE', label: '李白' },
    { id: 'n2', refType: 'POET', refId: 'poet_2', position: { x: 15, y: 25, z: 35 }, basePosition: { x: 15, y: 25, z: 35 }, dynasty: 'TANG', genre: null, size: 3, brightness: 0.8, phase: 0.5, state: 'IDLE', label: '杜甫' },
    { id: 'n3', refType: 'POET', refId: 'poet_3', position: { x: -10, y: -20, z: -30 }, basePosition: { x: -10, y: -20, z: -30 }, dynasty: 'SONG', genre: null, size: 3, brightness: 0.8, phase: 1, state: 'IDLE', label: '苏轼' },
  ];

  const mockWorks = [
    { id: 'w1', title: '静夜思', poetId: 'poet_1', poetName: '李白', dynasty: 'TANG', genre: 'SHI', text: '床前明月光' },
    { id: 'w2', title: '春望', poetId: 'poet_2', poetName: '杜甫', dynasty: 'TANG', genre: 'SHI', text: '国破山河在' },
  ];

  const mockLoaderRef: { current: Record<string, any> } = { current: {} as any };

  // 使用纯函数而非 vi.fn()，避免 vi.restoreAllMocks() 清除实现
  function createMockLoader() {
    return {
      loadPoets: () => Promise.resolve(mockPoets),
      loadScores: () => Promise.resolve(mockScores),
      loadNodes: () => Promise.resolve(mockNodes),
      loadWorks: () => Promise.resolve(mockWorks),
      loadWorkShard: (poetId: string) => {
        const works = mockWorks.filter((w) => w.poetId === poetId);
        return Promise.resolve({ poetId, dynasty: 'TANG', count: works.length, works });
      },
      loadSpatialIndex: () => Promise.resolve(undefined),
      clearCache: () => {},
      getCacheSize: () => 0,
    };
  }

  mockLoaderRef.current = createMockLoader();

  return { mockPoets, mockScores, mockNodes, mockWorks, createMockLoader, mockLoaderRef };
});

vi.mock('@/infrastructure/data/DataLoader', () => ({
  DataLoader: {
    getInstance: vi.fn(() => mockLoaderRef.current),
  },
}));

describe('数据流集成测试', () => {
  it('JsonPoetRepository 应加载并转换诗人为领域实体', async () => {
    const { JsonPoetRepository } = await import('@/infrastructure/data/PoetRepository');
    const repo = new JsonPoetRepository();
    const poets = await repo.loadAll();

    expect(poets).toHaveLength(3);
    expect(poets[0].name).toBe('李白');
    expect(poets[0].dynasty).toBe('TANG');
    expect(poets[0].workCount).toBe(1010);
    expect(poets[0].id).toBe('poet_1');
  });

  it('JsonScoreRepository 应加载评分数据', async () => {
    const { JsonScoreRepository } = await import('@/infrastructure/data/ScoreRepository');
    const repo = new JsonScoreRepository();
    const scores = await repo.loadAll();

    expect(scores).toHaveLength(3);
    expect(scores[0].poetId).toBe('poet_1');
    expect(scores[0].threeQi.talent.value).toBe(95);

    const found = await repo.findByPoetId('poet_2');
    expect(found).not.toBeNull();
    expect(found!.poetName).toBe('杜甫');
  });

  it('JsonNodeRepository 应加载并转换节点为 GalaxyNode', async () => {
    const { JsonNodeRepository } = await import('@/infrastructure/data/NodeRepository');
    const repo = new JsonNodeRepository();
    const nodes = await repo.loadAll();

    expect(nodes).toHaveLength(3);
    expect(nodes[0].label).toBe('李白');
    expect(nodes[0].position.x).toBe(10);
    expect(nodes[0].state).toBe('IDLE');
  });

  it('JsonWorkRepository 应按诗人分片加载并转换作品', async () => {
    const { JsonWorkRepository } = await import('@/infrastructure/data/WorkRepository');
    const repo = new JsonWorkRepository();
    const works = await repo.findByPoetId('poet_1');

    expect(works).toHaveLength(1);
    expect(works[0].title).toBe('静夜思');
    expect(works[0].poetId).toBe('poet_1');
  });

  it('InitializeUseCase 应加载全部数据并生成 DTO', async () => {
    const { InitializeUseCase } = await import('@/application/usecases/InitializeUseCase');
    const { JsonPoetRepository } = await import('@/infrastructure/data/PoetRepository');
    const { JsonNodeRepository } = await import('@/infrastructure/data/NodeRepository');
    const { JsonScoreRepository } = await import('@/infrastructure/data/ScoreRepository');

    const useCase = new InitializeUseCase(
      new JsonPoetRepository(),
      new JsonNodeRepository(),
      new JsonScoreRepository(),
    );

    const result = await useCase.execute();

    expect(result.nodes).toHaveLength(3);
    expect(result.poets).toHaveLength(3);
    expect(result.scores).toHaveLength(3);

    expect(result.nodes[0].label).toBe('李白');
    expect(result.poets[0].name).toBe('李白');
    expect(result.scores[0].talent).toBe(95);

    expect(result.poetMap.size).toBe(3);
    expect(result.poetMap.get('poet_1')?.name).toBe('李白');

    expect(result.scoreMap.size).toBe(3);
    expect(result.scoreMap.get('poet_1')?.talent).toBe(95);
  });

  it('错误数据路径应抛出异常', async () => {
    // 动态切换 mock 行为
    const originalLoad = mockLoaderRef.current.loadPoets;
    mockLoaderRef.current.loadPoets = () => Promise.reject(new Error('网络错误'));

    const { JsonPoetRepository } = await import('@/infrastructure/data/PoetRepository');
    const repo = new JsonPoetRepository();

    await expect(repo.loadAll()).rejects.toThrow('网络错误');

    // 恢复
    mockLoaderRef.current.loadPoets = originalLoad;
  });
});
