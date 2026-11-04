import { describe, it, expect } from 'bun:test';
import { Poet } from '@/domain/entities/Poet';
import { Work } from '@/domain/entities/Work';
import { GetPoetDetailUseCase } from '../GetPoetDetailUseCase';
import { type PoetRepository, type WorkRepository, type ScoreRepository } from '@/domain/ports/DataPorts';

const mockPoetRepo: PoetRepository = {
  loadAll: async () => [],
  findById: async (id: string) => {
    if (id === 'poet_1') {
      return Poet.create({ id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '唐代诗人', workCount: 1, courtesyName: '太白' });
    }
    return null;
  },
};

const mockWorkRepo: WorkRepository = {
  findByPoetId: async () => [
    new Work('w1', '静夜思', 'poet_1', '李白', 'TANG' as any, 'SHI', '床前明月光'),
  ],
};

const mockScoreRepo: ScoreRepository = {
  loadAll: async () => [],
  findByPoetId: async () => ({
    poetId: 'poet_1',
    poetName: '李白',
    dynasty: 'TANG',
    threeQi: {
      talent: { value: 85, factors: { lexicalUniqueness: 72.5, imageryNovelty: 88 } },
      popularity: { value: 90, factors: { citationCount: 120, textbookCount: 3 } },
      luck: { value: 10, factors: { politicalEnvironment: 8, rediscoveryEvents: 2 } },
    },
  }),
};

describe('GetPoetDetailUseCase', () => {
  it('应返回诗人详情、作品列表和评分', async () => {
    const useCase = new GetPoetDetailUseCase(mockPoetRepo, mockWorkRepo, mockScoreRepo);
    const result = await useCase.execute({ poetId: 'poet_1' });

    expect(result.poet.poet.name).toBe('李白');
    expect(result.poet.poet.courtesyName).toBe('太白');
    expect(result.poet.score).not.toBeNull();
    expect(result.poet.score!.talent).toBe(85);
    expect(result.poet.score!.factors?.talent?.lexicalUniqueness).toBe(72.5);
    expect(result.poet.score!.factors?.popularity?.citationCount).toBe(120);
    expect(result.poet.score!.factors?.luck?.rediscoveryEvents).toBe(2);
    expect(result.works.length).toBe(1);
    expect(result.works[0].title).toBe('静夜思');
  });

  it('不存在的诗人应抛出异常', async () => {
    const useCase = new GetPoetDetailUseCase(mockPoetRepo, mockWorkRepo, mockScoreRepo);
    await expect(useCase.execute({ poetId: 'unknown' })).rejects.toThrow('未找到');
  });
});
