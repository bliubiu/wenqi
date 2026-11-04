import { describe, expect, it, vi } from 'vitest';
import { SearchWorkerClient } from '../SearchWorkerClient';
import type { NodeDTO } from '@/application/dto/GalaxyDTO';

function makeNode(id: string): NodeDTO {
  return {
    id,
    refType: 'POET',
    refId: `poet_${id}`,
    position: { x: 0, y: 0, z: 0 },
    dynasty: 'TANG',
    size: 1,
    brightness: 1,
    label: id,
  };
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor(
    private readonly respond: (message: { id: number; query: string }, reply: (data: unknown) => void) => void
  ) {}

  postMessage(message: unknown): void {
    this.respond(message as { id: number; query: string }, (data) => {
      this.onmessage?.({ data } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('SearchWorkerClient', () => {
  it('Worker 正常返回时使用 Worker 结果，不调用主线程回退', async () => {
    const fallback = { execute: vi.fn(async () => [makeNode('fallback')]) };
    const client = new SearchWorkerClient(fallback, () =>
      new FakeWorker((message, reply) => reply({ id: message.id, results: [makeNode(message.query)] }))
    );

    const results = await client.execute('李白');

    expect(results.map((r) => r.id)).toEqual(['李白']);
    expect(fallback.execute).not.toHaveBeenCalled();
  });

  it('Worker 返回错误时回退主线程并终止 Worker', async () => {
    const fallback = { execute: vi.fn(async () => [makeNode('fallback')]) };
    const worker = new FakeWorker((message, reply) => reply({ id: message.id, error: '索引加载失败' }));
    const client = new SearchWorkerClient(fallback, () => worker);

    const results = await client.execute('杜甫');

    expect(results.map((r) => r.id)).toEqual(['fallback']);
    expect(fallback.execute).toHaveBeenCalledWith('杜甫');
    expect(worker.terminated).toBe(true);
  });

  it('Worker 构造失败时直接使用主线程回退', async () => {
    const fallback = { execute: vi.fn(async () => [makeNode('fallback')]) };
    const client = new SearchWorkerClient(fallback, () => {
      throw new Error('Worker 不可用');
    });

    const results = await client.execute('苏轼');

    expect(results.map((r) => r.id)).toEqual(['fallback']);
    expect(fallback.execute).toHaveBeenCalledWith('苏轼');
  });
});
