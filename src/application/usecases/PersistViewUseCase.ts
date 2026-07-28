export interface PersistViewRequest {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  focusedNodeId: string | null;
  dimensionWeights: { talent: number; popularity: number; luck: number };
  clusterDimension: 'DYNASTY' | 'GENRE';
}

export interface PersistViewResponse {
  savedAt: string;
}

const STORAGE_KEY = 'wenqi_view_state';

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // localStorage 不可用（如 SSR/测试环境）
  }
  return null;
}

export class PersistViewUseCase {
  execute(request: PersistViewRequest): PersistViewResponse {
    const savedAt = new Date().toISOString();

    const state = {
      ...request,
      savedAt,
    };

    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        throw new Error(`视图持久化失败: ${err}`);
      }
    }

    return { savedAt };
  }

  load(): PersistViewRequest | null {
    const storage = getStorage();
    if (!storage) return null;

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PersistViewRequest;
    } catch {
      return null;
    }
  }

  clear(): void {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(STORAGE_KEY);
    }
  }
}
