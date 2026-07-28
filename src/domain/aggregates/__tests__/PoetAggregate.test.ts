import { describe, it, expect } from 'bun:test';
import { Poet } from '../../entities/Poet';
import { Work } from '../../entities/Work';
import { PoetAggregate } from '../PoetAggregate';

describe('PoetAggregate', () => {
  it('应创建有效的诗人聚合', () => {
    const poet = Poet.create({
      id: 'poet_1',
      name: '李白',
      dynasty: 'TANG',
      biography: '唐代诗人',
      workCount: 1,
    });
    const work = new Work('w1', '静夜思', 'poet_1', '李白', 'TANG' as any, 'SHI', '床前明月光');
    const aggregate = PoetAggregate.create(poet, [work]);
    expect(aggregate.poet.name).toBe('李白');
    expect(aggregate.getWorkCount()).toBe(1);
  });

  it('addWork 时作品诗人ID不匹配应抛出异常', () => {
    const poet = Poet.create({ id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '', workCount: 0 });
    const aggregate = PoetAggregate.create(poet);
    const work = new Work('w1', '静夜思', 'poet_2', '杜甫', 'TANG' as any, 'SHI', '国破山河在');
    expect(() => aggregate.addWork(work)).toThrow();
  });

  it('addWork 应添加作品', () => {
    const poet = Poet.create({ id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '', workCount: 0 });
    const aggregate = PoetAggregate.create(poet);
    const work = new Work('w1', '静夜思', 'poet_1', '李白', 'TANG' as any, 'SHI', '床前明月光');
    aggregate.addWork(work);
    expect(aggregate.getWorkCount()).toBe(1);
    expect(aggregate.findWorkById('w1')).toBeDefined();
  });

  it('removeWork 应移除作品', () => {
    const poet = Poet.create({ id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '', workCount: 0 });
    const work = new Work('w1', '静夜思', 'poet_1', '李白', 'TANG' as any, 'SHI', '床前明月光');
    const aggregate = PoetAggregate.create(poet, [work]);
    aggregate.removeWork('w1');
    expect(aggregate.getWorkCount()).toBe(0);
  });

  it('getWorks 应返回所有作品', () => {
    const poet = Poet.create({ id: 'poet_1', name: '李白', dynasty: 'TANG', biography: '', workCount: 0 });
    const w1 = new Work('w1', '静夜思', 'poet_1', '李白', 'TANG' as any, 'SHI', '床前明月光');
    const w2 = new Work('w2', '将进酒', 'poet_1', '李白', 'TANG' as any, 'SHI', '君不见');
    const aggregate = PoetAggregate.create(poet, [w1, w2]);
    expect(aggregate.getWorks().length).toBe(2);
  });
});
