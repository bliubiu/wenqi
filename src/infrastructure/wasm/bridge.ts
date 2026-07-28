import { WasmComputePort } from '@/domain/ports/DataPorts';
import { DataLoader } from '@/infrastructure/data/DataLoader';
import { setWasmModule, isBincodeAvailable } from './bincode-codec';

const dataLoader = DataLoader.getInstance();

export interface WasmModule {
  init(): Promise<void>;
  version(): string;
  algorithm_version(): string;
  SearchEngine: new () => {
    buildIndex(corpusJson: string): void;
    search(query: string, optionsJson: string): string;
    searchBinary(query: string, optionsBytes: Uint8Array): Uint8Array;
    fuzzyMatch(query: string): string;
    documentCount(): number;
    indexSize(): number;
  };
  bincodeEncode(jsonStr: string): Uint8Array;
  bincodeDecode(bytes: Uint8Array): string;
}

interface Position {
  x: number;
  y: number;
  z: number;
}

class KdTreeNode {
  constructor(
    public nodeId: string,
    public pos: Position,
    public axis: number,
    public left: KdTreeNode | null = null,
    public right: KdTreeNode | null = null
  ) {}
}

export class WasmBridge implements WasmComputePort {
  initialized = false;
  private wasmModule: WasmModule | null = null;
  private searchEngine: InstanceType<WasmModule['SearchEngine']> | null = null;

  private nodePositions: Map<string, Position> | null = null;
  private kdRoot: KdTreeNode | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const wasm = await import('@/../public/wasm/wenqi_core');
      this.wasmModule = wasm as unknown as WasmModule;
      await this.wasmModule.init();

      this.searchEngine = new this.wasmModule.SearchEngine();

      // 注册 WASM 模块到 bincode 编解码器
      setWasmModule(this.wasmModule);

      this.initialized = true;
    } catch {
      this.initialized = false;
    }
  }

  private async ensureSpatialIndex(): Promise<void> {
    if (this.nodePositions) return;
    try {
      const index = await dataLoader.loadSpatialIndex();
      const nodes: Array<{ id: string; position: Position }> = index.nodes || [];
      this.nodePositions = new Map(nodes.map((n) => [n.id, n.position]));
      this.kdRoot = this.buildKdTree(nodes.map((n) => ({ nodeId: n.id, pos: n.position })), 0);
    } catch {
      this.nodePositions = new Map();
      this.kdRoot = null;
    }
  }

  private buildKdTree(
    items: Array<{ nodeId: string; pos: Position }>,
    depth: number
  ): KdTreeNode | null {
    if (items.length === 0) return null;

    const axis = depth % 3;
    items.sort((a, b) => {
      const key = axis === 0 ? a.pos.x : axis === 1 ? a.pos.y : a.pos.z;
      const other = axis === 0 ? b.pos.x : axis === 1 ? b.pos.y : b.pos.z;
      return key - other;
    });

    const mid = Math.floor(items.length / 2);
    const node = new KdTreeNode(items[mid].nodeId, items[mid].pos, axis);

    node.left = this.buildKdTree(items.slice(0, mid), depth + 1);
    node.right = this.buildKdTree(items.slice(mid + 1), depth + 1);

    return node;
  }

  private kdRangeQuery(
    node: KdTreeNode | null,
    cx: number,
    cy: number,
    cz: number,
    radiusSq: number,
    results: string[]
  ): void {
    if (!node) return;

    const dx = node.pos.x - cx;
    const dy = node.pos.y - cy;
    const dz = node.pos.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq <= radiusSq) {
      results.push(node.nodeId);
    }

    const axisVal = node.axis === 0 ? node.pos.x : node.axis === 1 ? node.pos.y : node.pos.z;
    const queryVal = node.axis === 0 ? cx : node.axis === 1 ? cy : cz;
    const diff = queryVal - axisVal;

    const near = diff <= 0 ? node.left : node.right;
    const far = diff <= 0 ? node.right : node.left;

    this.kdRangeQuery(near, cx, cy, cz, radiusSq, results);

    if (diff * diff <= radiusSq) {
      this.kdRangeQuery(far, cx, cy, cz, radiusSq, results);
    }
  }

  async search(
    query: string,
    options?: { limit?: number; dynasty?: string; genre?: string }
  ): Promise<Array<{ nodeId: string; score: number; highlight?: string }>> {
    if (!this.searchEngine) return [];

    const opts = {
      limit: options?.limit ?? 20,
      scope: 'ALL',
      dynasty: options?.dynasty ?? null,
      genre: options?.genre ?? null,
    };

    // 双通道自动降级：优先使用 bincode，失败时降级到 JSON
    if (isBincodeAvailable() && typeof this.searchEngine.searchBinary === 'function') {
      try {
        const optBytes = this.wasmModule!.bincodeEncode(JSON.stringify(opts));
        const resultBytes = this.searchEngine.searchBinary(query, optBytes);
        const result = JSON.parse(this.wasmModule!.bincodeDecode(resultBytes));
        return (result.items || []).map(
          (item: { node_id: string; score: number; highlight?: string }) => ({
            nodeId: item.node_id,
            score: item.score,
            highlight: item.highlight,
          })
        );
      } catch {
        // bincode 失败，降级到 JSON
      }
    }

    // 降级通道：JSON 格式
    try {
      const resultJson = this.searchEngine.search(query, JSON.stringify(opts));
      const result = JSON.parse(resultJson);
      return (result.items || []).map(
        (item: { node_id: string; score: number; highlight?: string }) => ({
          nodeId: item.node_id,
          score: item.score,
          highlight: item.highlight,
        })
      );
    } catch {
      return [];
    }
  }

  async queryNearby(
    x: number,
    y: number,
    z: number,
    radius: number
  ): Promise<string[]> {
    await this.ensureSpatialIndex();

    if (!this.kdRoot) return [];

    const results: string[] = [];
    this.kdRangeQuery(this.kdRoot, x, y, z, radius * radius, results);
    return results;
  }
}
