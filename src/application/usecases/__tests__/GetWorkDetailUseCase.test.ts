import { describe, it, expect } from 'bun:test';
import { Poet } from '@/domain/entities/Poet';
import { Work } from '@/domain/entities/Work';
import { GetWorkDetailUseCase } from '../GetWorkDetailUseCase';
import { type PoetRepository, type WorkRepository, type ScoreRepository } from '@/domain/ports/DataPorts';

const mockWorkRepo: WorkRepository = {
  loadAll: async () => [
    new Work('w1', '静夜思', 'poet_1', '李白', 'TANG' as any, 'SHI', '床前明月光'),
    new Work('w2', '将进酒', 'poet_1', '李白', 'TANG' as any, 'SHI', '君不见黄河之水天上来'),
  ],
  findByPoetId: async () => [],
};

const mockPoetRepo: PoetRepository = {
  loadAll: async () => [],
  findById: async () => Poet.create({ id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '唐代诗人', workCount: 2 }),
};

const mockScoreRepo: ScoreRepository = {
  loadAll: async () => [],
  findByPoetId: async () => null,
};

describe('GetWorkDetailUseCase', () => {
  it('应返回作品详情和诗人信息', async () => {
    const useCase = new GetWorkDetailUseCase(mockWorkRepo, mockPoetRepo, mockScoreRepo);
    const result = await useCase.execute({ workId: 'w1' });

    expect(result.work.title).toBe('静夜思');
    expect(result.work.text).toBe('床前明月光');
    expect(result.work.genre).toBe('SHI');
    expect(result.poet.name).toBe('李白');
  });

  it('应返回同诗人类作品列表（排除自身）', async () => {
    const useCase = new GetWorkDetailUseCase(mockWorkRepo, mockPoetRepo, mockScoreRepo);
    const result = await useCase.execute({ workId: 'w1' });

    expect(result.relatedWorks.length).toBe(1);
    expect(result.relatedWorks[0].id).toBe('w2');
    expect(result.relatedWorks[0].title).toBe('将进酒');
  });

  it('不存在的作品应抛出异常', async () => {
    const useCase = new GetWorkDetailUseCase(mockWorkRepo, mockPoetRepo, mockScoreRepo);
    await expect(useCase.execute({ workId: 'unknown' })).rejects.toThrow('未找到');
  });
});
