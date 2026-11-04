import { describe, it, expect, vi } from 'vitest';
import { SearchUseCase } from '../SearchUseCase';

describe('SearchUseCase', () => {
  it('空查询应返回空数组', async () => {
    const mockRepo = { loadAll: vi.fn() };
    const useCase = new SearchUseCase(mockRepo as any);

    const result = await useCase.execute('');
    expect(result).toEqual([]);
  });

  it('纯空格查询应返回空数组', async () => {
    const mockRepo = { loadAll: vi.fn() };
    const useCase = new SearchUseCase(mockRepo as any);

    const result = await useCase.execute('   ');
    expect(result).toEqual([]);
  });

  it('无 WASM 时使用纯前端搜索', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
      { id: '2', refType: 'POET' as const, refId: 'poet_2', label: '杜甫', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 1, y: 1, z: 1 }, genre: null, phase: 0, basePosition: { x: 1, y: 1, z: 1 }, state: 'IDLE' as const },
    ];

    const mockRepo = {
      loadAll: vi.fn().mockResolvedValue(nodes),
    };

    const useCase = new SearchUseCase(mockRepo as any);
    const result = await useCase.execute('李白');

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('李白');
    expect(result[0].refId).toBe('poet_1');
  });

  it('搜索不区分大小写', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'p1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
    ];

    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const useCase = new SearchUseCase(mockRepo as any);

    const result = await useCase.execute('李白');
    expect(result).toHaveLength(1);
  });

  it('结果数量不超过 20', async () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`, refType: 'POET' as const, refId: `p${i}`, label: `诗人${i}`,
      dynasty: 'TANG', size: 1, brightness: 1,
      position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0,
      basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const,
    }));

    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const useCase = new SearchUseCase(mockRepo as any);

    const result = await useCase.execute('诗人');
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('全文命中应跳转所属诗人并携带作品标题与摘句', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
    ];
    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const fullText = {
      search: vi.fn().mockResolvedValue([
        { workId: 'w1', poetId: 'poet_1', poetName: '', title: '静夜思', snippet: '床前明月光' },
      ]),
    };

    const useCase = new SearchUseCase(mockRepo as any, undefined, fullText as any);
    const result = await useCase.execute('床前明月光');

    // 诗人名不匹配「床前明月光」，结果完全来自全文检索
    expect(result).toHaveLength(1);
    expect(result[0].refId).toBe('poet_1');
    expect(result[0].matchedTitle).toBe('静夜思');
    expect(result[0].snippet).toBe('床前明月光');
  });

  it('全文检索的诗人命中不应与诗人名命中重复', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
    ];
    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const fullText = {
      search: vi.fn().mockResolvedValue([
        { workId: 'w1', poetId: 'poet_1', poetName: '', title: '静夜思', snippet: '床前明月光' },
      ]),
    };

    const useCase = new SearchUseCase(mockRepo as any, undefined, fullText as any);
    const result = await useCase.execute('李白');

    // 全文命中 poet_1 已由诗人名命中，去重后仍只有一条且无作品标题
    expect(result).toHaveLength(1);
    expect(result[0].matchedTitle).toBeUndefined();
    expect(fullText.search).toHaveBeenCalledWith('李白', 19);
  });

  it('语义通道命中应在全文之后补齐并附带意境标签', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
      { id: '2', refType: 'POET' as const, refId: 'poet_2', label: '陈子昂', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 1, y: 1, z: 1 }, genre: null, phase: 0, basePosition: { x: 1, y: 1, z: 1 }, state: 'IDLE' as const },
    ];
    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const semantic = {
      search: vi.fn().mockResolvedValue([
        { poetId: 'poet_2', poetName: '', title: '登幽州台歌', snippet: '前不见古人', labels: ['孤寂'] },
      ]),
    };

    const useCase = new SearchUseCase(mockRepo as any, undefined, undefined, semantic as any);
    const result = await useCase.execute('孤寂');

    // 诗人名不含「孤寂」，结果完全来自语义通道
    expect(result).toHaveLength(1);
    expect(result[0].refId).toBe('poet_2');
    expect(result[0].matchedTitle).toBe('登幽州台歌');
    expect(result[0].matchedLabels).toEqual(['孤寂']);
    expect(semantic.search).toHaveBeenCalledWith('孤寂', 20);
  });

  it('全文通道已命中的诗人不应重复出现在语义结果中', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
    ];
    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const fullText = {
      search: vi.fn().mockResolvedValue([
        { workId: 'w1', poetId: 'poet_1', poetName: '', title: '静夜思', snippet: '床前明月光' },
      ]),
    };
    const semantic = {
      search: vi.fn().mockResolvedValue([
        { poetId: 'poet_1', poetName: '', title: '将进酒', snippet: '君不见黄河之水天上来', labels: ['豪迈'] },
      ]),
    };

    const useCase = new SearchUseCase(mockRepo as any, undefined, fullText as any, semantic as any);
    const result = await useCase.execute('明月');

    expect(result).toHaveLength(1);
    expect(result[0].matchedTitle).toBe('静夜思');
    expect(result[0].matchedLabels).toBeUndefined();
    expect(semantic.search).toHaveBeenCalledWith('明月', 19);
  });

  it('诗人名全等命中应优先于同名作品排在首位', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
      { id: '2', refType: 'POET' as const, refId: 'poet_x', label: '徐鈞', dynasty: 'SONG', size: 1, brightness: 1, position: { x: 1, y: 1, z: 1 }, genre: null, phase: 0, basePosition: { x: 1, y: 1, z: 1 }, state: 'IDLE' as const },
    ];
    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const fullText = {
      search: vi.fn().mockResolvedValue([
        { workId: 'w1', poetId: 'poet_x', poetName: '徐鈞', title: '李白', snippet: '风骨神仙籍里人' },
      ]),
    };

    const useCase = new SearchUseCase(mockRepo as any, undefined, fullText as any);
    const result = await useCase.execute('李白');

    expect(result[0].refId).toBe('poet_1');
    expect(result[0].label).toBe('李白');
    expect(result.some((item) => item.refId === 'poet_x')).toBe(true);
  });

  it('语义通道异常应静默降级并保留现有通道结果', async () => {
    const nodes = [
      { id: '1', refType: 'POET' as const, refId: 'poet_1', label: '李白', dynasty: 'TANG', size: 1, brightness: 1, position: { x: 0, y: 0, z: 0 }, genre: null, phase: 0, basePosition: { x: 0, y: 0, z: 0 }, state: 'IDLE' as const },
    ];
    const mockRepo = { loadAll: vi.fn().mockResolvedValue(nodes) };
    const fullText = {
      search: vi.fn().mockResolvedValue([
        { workId: 'w1', poetId: 'poet_1', poetName: '', title: '静夜思', snippet: '床前明月光' },
      ]),
    };
    const semantic = {
      search: vi.fn().mockRejectedValue(new Error('语义索引不可用')),
    };

    const useCase = new SearchUseCase(mockRepo as any, undefined, fullText as any, semantic as any);
    const result = await useCase.execute('床前明月光');

    expect(result).toHaveLength(1);
    expect(result[0].matchedTitle).toBe('静夜思');
  });
});

