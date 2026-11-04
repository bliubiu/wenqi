/**
 * 检索 Worker 客户端：优先走 Web Worker，构造/超时/报错时自动回退主线程用例。
 */

import type { NodeDTO } from '@/application/dto/GalaxyDTO';

interface SearchExecutor {
  execute(query: string): Promise<NodeDTO[]>;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

type WorkerFactory = () => WorkerLike;

const DEFAULT_TIMEOUT_MS = 8000;

function createWorker(): WorkerLike {
  return new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
}

interface Pending {
  resolve: (results: NodeDTO[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SearchWorkerClient implements SearchExecutor {
  private worker: WorkerLike | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(
    private readonly fallback: SearchExecutor,
    private readonly workerFactory: WorkerFactory = createWorker
  ) {
    try {
      const worker = workerFactory();
      worker.onmessage = (event: MessageEvent) => this.handleMessage(event);
      worker.onerror = () => this.failAll();
      this.worker = worker;
    } catch {
      this.worker = null;
    }
  }

  execute(query: string): Promise<NodeDTO[]> {
    if (!this.worker) return this.fallback.execute(query);

    const id = ++this.seq;
    const worker = this.worker;
    return new Promise<NodeDTO[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('检索 Worker 超时'));
      }, DEFAULT_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, query });
    }).catch(() => {
      this.failAll();
      return this.fallback.execute(query);
    });
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as { id?: number; results?: NodeDTO[]; error?: string };
    if (typeof data.id !== 'number') return;
    const entry = this.pending.get(data.id);
    if (!entry) return;

    this.pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.error || !data.results) {
      entry.reject(new Error(data.error ?? '检索 Worker 未返回结果'));
    } else {
      entry.resolve(data.results);
    }
  }

  /** 失败后终止 Worker 并清空挂起请求，由调用方回退主线程 */
  private failAll(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('检索 Worker 不可用'));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
