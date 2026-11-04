/**
 * 检索 Worker：在独立线程装配 SearchUseCase（全文分片 + 语义分片 + WASM），
 * 主线程只收发查询与结果，避免 16 个分片解码与排序阻塞渲染。
 */

import { SearchUseCase } from '@/application/usecases/SearchUseCase';
import { JsonNodeRepository } from '@/infrastructure/data/NodeRepository';
import { WasmBridge } from '@/infrastructure/wasm/bridge';
import { ShardSearchIndex } from './ShardSearchIndex';
import { ShardSemanticIndex } from './ShardSemanticIndex';

interface SearchRequest {
  id: number;
  query: string;
}

interface SearchResponse {
  id: number;
  results?: unknown[];
  error?: string;
}

let useCasePromise: Promise<SearchUseCase> | null = null;

/** WASM 初始化失败时静默降级为分片检索，保证检索可用 */
function createUseCase(): Promise<SearchUseCase> {
  if (!useCasePromise) {
    useCasePromise = (async () => {
      const wasm = new WasmBridge();
      await wasm.init().catch(() => {});
      return new SearchUseCase(new JsonNodeRepository(), wasm, new ShardSearchIndex(), new ShardSemanticIndex());
    })();
  }
  return useCasePromise;
}

self.addEventListener('message', (event: Event) => {
  const { id, query } = (event as MessageEvent<SearchRequest>).data;
  const post = (response: SearchResponse) =>
    (self as unknown as { postMessage(v: unknown): void }).postMessage(response);

  createUseCase()
    .then((useCase) => useCase.execute(query))
    .then((results) => post({ id, results }))
    .catch((err) => post({ id, error: String(err) }));
});
