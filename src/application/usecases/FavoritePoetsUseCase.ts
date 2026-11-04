/**
 * 个性化星单用例
 *
 * 以 localStorage 保存收藏诗人，供星系面板一键聚焦。
 * 与 PersistViewUseCase 一样对 SSR 与存储异常做容错处理。
 */

export interface FavoritePoet {
  id: string;
  name: string;
  dynasty: string;
  addedAt: string;
}

export interface FavoritePoetInput {
  id: string;
  name: string;
  dynasty: string;
}

const STORAGE_KEY = 'wenqi_favorite_poets';

type Listener = (items: FavoritePoet[]) => void;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // localStorage 不可用（如 SSR/测试环境）
  }
  return null;
}

function isValidItem(value: unknown): value is FavoritePoet {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.dynasty === 'string';
}

export class FavoritePoetsUseCase {
  private readonly listeners = new Set<Listener>();

  list(): FavoritePoet[] {
    const storage = getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidItem);
    } catch {
      return [];
    }
  }

  isFavorite(poetId: string): boolean {
    return this.list().some((item) => item.id === poetId);
  }

  /** 切换收藏状态，返回切换后是否已收藏 */
  toggle(poet: FavoritePoetInput): boolean {
    const items = this.list();
    const exists = items.some((item) => item.id === poet.id);
    const next = exists
      ? items.filter((item) => item.id !== poet.id)
      : [...items, { ...poet, addedAt: new Date().toISOString() }];

    this.save(next);
    return !exists;
  }

  remove(poetId: string): void {
    this.save(this.list().filter((item) => item.id !== poetId));
  }

  clear(): void {
    this.save([]);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private save(items: FavoritePoet[]): void {
    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // 存储写入失败时保持内存态不抛错，避免中断交互
      }
    }
    this.emit();
  }

  private emit(): void {
    const items = this.list();
    this.listeners.forEach((listener) => listener(items));
  }
}
