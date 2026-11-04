import { describe, it, expect, beforeEach } from 'bun:test';
import { FavoritePoetsUseCase } from '../FavoritePoetsUseCase';

const STORAGE_KEY = 'wenqi_favorite_poets';

function hasStorage(): boolean {
  try { return typeof localStorage !== 'undefined'; } catch { return false; }
}

describe('FavoritePoetsUseCase', () => {
  beforeEach(() => {
    if (hasStorage()) localStorage.removeItem(STORAGE_KEY);
  });

  it('无存储时应返回空列表', () => {
    const useCase = new FavoritePoetsUseCase();
    expect(useCase.list()).toEqual([]);
    expect(useCase.isFavorite('poet_1')).toBe(false);
  });

  it('toggle 应收藏并在再次调用时取消收藏', () => {
    if (!hasStorage()) return;

    const useCase = new FavoritePoetsUseCase();
    const poet = { id: 'poet_1', name: '李白', dynasty: 'TANG' };

    expect(useCase.toggle(poet)).toBe(true);
    expect(useCase.isFavorite('poet_1')).toBe(true);
    expect(useCase.list()).toHaveLength(1);
    expect(useCase.list()[0].name).toBe('李白');

    expect(useCase.toggle(poet)).toBe(false);
    expect(useCase.isFavorite('poet_1')).toBe(false);
    expect(useCase.list()).toHaveLength(0);
  });

  it('remove 与 clear 应移除收藏', () => {
    if (!hasStorage()) return;

    const useCase = new FavoritePoetsUseCase();
    useCase.toggle({ id: 'poet_1', name: '李白', dynasty: 'TANG' });
    useCase.toggle({ id: 'poet_2', name: '杜甫', dynasty: 'TANG' });
    expect(useCase.list()).toHaveLength(2);

    useCase.remove('poet_1');
    expect(useCase.list().map((item) => item.id)).toEqual(['poet_2']);

    useCase.clear();
    expect(useCase.list()).toEqual([]);
  });

  it('变更后应通知订阅者', () => {
    if (!hasStorage()) return;

    const useCase = new FavoritePoetsUseCase();
    const received: number[] = [];
    const unsubscribe = useCase.subscribe((items) => received.push(items.length));

    useCase.toggle({ id: 'poet_1', name: '李白', dynasty: 'TANG' });
    useCase.toggle({ id: 'poet_1', name: '李白', dynasty: 'TANG' });
    unsubscribe();
    useCase.toggle({ id: 'poet_1', name: '李白', dynasty: 'TANG' });

    expect(received).toEqual([1, 0]);
  });

  it('遇到损坏的存储内容应回退为空列表', () => {
    if (!hasStorage()) return;

    localStorage.setItem(STORAGE_KEY, '不是合法 JSON');
    const useCase = new FavoritePoetsUseCase();
    expect(useCase.list()).toEqual([]);
  });
});
