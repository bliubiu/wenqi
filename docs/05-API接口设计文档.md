# 文气（WenQi）API 接口设计文档

| 项目属性 | 内容 |
| --- | --- |
| 文档版本 | v1.1 |
| 项目代号 | WenQi（文气） |
| 项目阶段 | 完整版设计 |
| 文档读者 | 开发团队 |
| 关联文档 | 01-项目规格说明书、02-产品需求文档PRD、03-架构设计文档、04-领域模型设计、06-持久化设计文档 |

---

## 1. 接口总览

### 1.1 接口分类

文气项目为纯客户端应用，无后端 HTTP 服务。本文档定义三类接口：

| 接口类型 | 通信双方 | 通信方式 | 章节 |
| --- | --- | --- | --- |
| 应用层用例接口 | 表现层 ↔ 应用层 | TypeScript 函数调用 | 第 3 章 |
| WASM 计算接口 | 应用层 ↔ Rust WASM | `wasm-bindgen` 绑定 | 第 4 章 |
| 数据契约接口 | 基础设施层 ↔ 数据源 | JSON 文件 | 第 5 章 |

### 1.2 设计原则

1. **契约先行**：接口定义先于实现，作为模块间协作依据。
2. **类型安全**：所有接口使用 TypeScript 强类型定义。
3. **中文友好**：错误信息、字段说明统一中文。
4. **版本化**：接口与数据格式带版本号，便于演进。
5. **脱敏**：日志与错误信息遵循脱敏策略（见架构文档 6.4）。

### 1.3 通用约定

#### 数据编码

- JSON 编码，UTF-8。
- 时间戳：ISO 8601 字符串（如 `2026-06-23T14:30:15+08:00`）。
- 日期：`YYYY-MM-DD` 字符串。
- 年份：整数，公元前为负（如 `-551` 表示公元前 551 年）。

#### 命名规范

- 字段名：`camelCase`（JSON 与 TypeScript 一致）。
- 枚举值：`UPPER_SNAKE_CASE`。
- 接口名：`PascalCase`，以 `UseCase` / `Port` / `Service` 后缀区分。

---

## 2. 错误码体系

### 2.1 错误码格式

```
WQ-<层级>-<分类>-<编号>
```

| 层级 | 代码 | 含义 |
| --- | --- | --- |
| 领域层 | `DOM` | 领域逻辑错误 |
| 应用层 | `APP` | 用例编排错误 |
| 基础设施层 | `INF` | 技术设施错误 |
| 表现层 | `UI` | 界面交互错误 |
| WASM | `WASM` | Rust 计算层错误 |

### 2.2 错误码清单

| 错误码 | HTTP 等价 | 中文信息 | 触发场景 |
| --- | --- | --- | --- |
| `WQ-DOM-SCORE-001` | 400 | 评分数据无效 | 评分值越界 |
| `WQ-DOM-SCORE-002` | 400 | 评分算法版本不兼容 | 三气版本不一致 |
| `WQ-DOM-NODE-001` | 404 | 未找到指定节点 | 节点 ID 不存在 |
| `WQ-DOM-NODE-002` | 409 | 节点状态冲突 | 重复聚焦 |
| `WQ-DOM-REL-001` | 400 | 关联数据无效 | 关联自环或权重越界 |
| `WQ-DOM-CONV-001` | 400 | 聚气节点数超限 | 超过 50 个节点 |
| `WQ-DOM-CLUSTER-001` | 400 | 气团维度无效 | 未支持的聚类维度 |
| `WQ-APP-USECASE-001` | 500 | 用例执行失败 | 用例内部异常 |
| `WQ-APP-USECASE-002` | 400 | 用例参数无效 | 入参校验失败 |
| `WQ-INF-DATA-001` | 500 | 数据加载失败 | 数据文件读取失败 |
| `WQ-INF-DATA-002` | 400 | 数据版本不匹配 | 数据集版本与代码不兼容 |
| `WQ-INF-DATA-003` | 422 | 数据格式错误 | JSON 解析失败 |
| `WQ-INF-WASM-001` | 503 | WASM 模块加载失败 | 浏览器不支持或网络失败 |
| `WQ-INF-WASM-002` | 504 | WASM 初始化超时 | 超过 5 秒未就绪 |
| `WQ-INF-WASM-003` | 500 | WASM 计算异常 | Rust panic |
| `WQ-INF-PERSIST-001` | 500 | 本地存储失败 | IndexedDB 写入失败 |
| `WQ-INF-LOG-001` | 500 | 日志写入失败 | 文件系统不可用 |
| `WQ-UI-RENDER-001` | 500 | 渲染异常 | Three.js 渲染失败 |
| `WQ-UI-WEBGL-001` | 501 | WebGL 不支持 | 浏览器无 WebGL 能力 |
| `WQ-WASM-INDEX-001` | 500 | 空间索引查询失败 | 索引未初始化 |
| `WQ-WASM-SEARCH-001` | 500 | 检索引擎未就绪 | 倒排索引未构建 |

### 2.3 错误响应结构

```typescript
interface ErrorResponse {
  readonly code: string;          // 如 'WQ-DOM-NODE-001'
  readonly message: string;       // 面向用户的中文信息
  readonly detail?: string;       // 技术细节（仅日志，不下发用户）
  readonly timestamp: string;     // ISO 8601
  readonly requestId?: string;    // 请求追踪 ID
}
```

**示例**：

```json
{
  "code": "WQ-DOM-NODE-001",
  "message": "未找到指定节点",
  "timestamp": "2026-06-23T14:30:15+08:00",
  "requestId": "req-9f3a2b"
}
```

---

## 3. 应用层用例接口

### 3.1 用例接口规范

每个用例定义 `Request`（输入）与 `Response`（输出）类型，并通过 `execute` 方法调用。

```typescript
interface UseCase<Req, Res> {
  execute(request: Req): Promise<Res>;
}
```

### 3.2 初始化用例 `InitializeUseCase`

**职责**：加载应用所需数据与 WASM 模块，构建星系。

**Request**：

```typescript
interface InitializeRequest {
  readonly configPath?: string;    // 配置文件路径，默认 'application.yml'
}
```

**Response**：

```typescript
interface InitializeResponse {
  readonly galaxy: GalaxyDTO;
  readonly wasmReady: boolean;
  readonly dataVersion: string;
  readonly initDurationMs: number;
}
```

**错误**：

- `WQ-INF-DATA-001` 数据加载失败
- `WQ-INF-WASM-001` WASM 加载失败
- `WQ-INF-WASM-002` WASM 初始化超时

### 3.3 聚焦节点用例 `FocusNodeUseCase`

**Request**：

```typescript
interface FocusNodeRequest {
  readonly nodeId: string;
  readonly animationDurationMs?: number;  // 默认 1000，可配置范围 800–1200
}
```

**Response**：

```typescript
interface FocusNodeResponse {
  readonly focusNode: NodeDTO;
  readonly relatedNodes: NodeDTO[];
  readonly movements: MovementDTO[];
  readonly detail: PoetDetailDTO | WorkDetailDTO;
}
```

**错误**：

- `WQ-DOM-NODE-001` 未找到节点
- `WQ-DOM-CONV-001` 聚气节点数超限

### 3.4 取消聚焦用例 `UnfocusUseCase`

**Request**：

```typescript
interface UnfocusRequest {
  readonly animationDurationMs?: number;
}
```

**Response**：

```typescript
interface UnfocusResponse {
  readonly restoredNodeIds: string[];
}
```

### 3.5 搜索用例 `SearchUseCase`

**Request**：

```typescript
interface SearchRequest {
  readonly query: string;
  readonly limit?: number;         // 默认 20
  readonly scope?: 'POET' | 'WORK' | 'ALL';  // 默认 'ALL'
  readonly dynasty?: DynastyCode;
  readonly genre?: GenreCode;
}
```

**Response**：

```typescript
interface SearchResponse {
  readonly items: SearchResultItemDTO[];
  readonly total: number;
  readonly durationMs: number;
}

interface SearchResultItemDTO {
  readonly nodeId: string;
  readonly refType: 'POET' | 'WORK';
  readonly refId: string;
  readonly title: string;          // 诗人名或作品标题
  readonly subtitle: string;       // 朝代·体裁
  readonly highlight: string;      // 高亮片段（HTML）
  readonly score: number;          // 匹配度 0–1
}
```

**错误**：

- `WQ-WASM-SEARCH-001` 检索引擎未就绪

### 3.6 维度调节用例 `AdjustDimensionUseCase`

**Request**：

```typescript
interface AdjustDimensionRequest {
  readonly weights: DimensionWeights;
  readonly animationDurationMs?: number;
}

interface DimensionWeights {
  readonly talent: number;         // 0–2，默认 1
  readonly popularity: number;     // 0–2，默认 1
  readonly luck: number;           // 0–2，默认 1
}
```

**Response**：

```typescript
interface AdjustDimensionResponse {
  readonly affectedNodeIds: string[];
  readonly durationMs: number;
}
```

**错误**：

- `WQ-APP-USECASE-002` 参数无效（权重越界）

### 3.7 切换聚类维度用例 `SwitchClusterUseCase`

**Request**：

```typescript
interface SwitchClusterRequest {
  readonly dimension: 'DYNASTY' | 'GENRE';
}
```

**Response**：

```typescript
interface SwitchClusterResponse {
  readonly clusters: QiClusterDTO[];
}
```

### 3.8 获取诗人详情 `GetPoetDetailUseCase`

**Request**：

```typescript
interface GetPoetDetailRequest {
  readonly poetId: string;
}
```

**Response**：

```typescript
interface GetPoetDetailResponse {
  readonly poet: PoetDetailDTO;
  readonly works: WorkDTO[];
  readonly relations: RelationDTO[];
}
```

### 3.9 获取作品详情 `GetWorkDetailUseCase`

**Request**：

```typescript
interface GetWorkDetailRequest {
  readonly workId: string;
}
```

**Response**：

```typescript
interface GetWorkDetailResponse {
  readonly work: WorkDetailDTO;
  readonly poet: PoetDTO;
  readonly relatedWorks: WorkDTO[];
}
```

### 3.10 视图状态持久化用例 `PersistViewUseCase`

**Request**：

```typescript
interface PersistViewRequest {
  readonly cameraPosition: [number, number, number];
  readonly cameraTarget: [number, number, number];
  readonly focusedNodeId: string | null;
  readonly dimensionWeights: DimensionWeights;
  readonly clusterDimension: 'DYNASTY' | 'GENRE';
}
```

**Response**：

```typescript
interface PersistViewResponse {
  readonly savedAt: string;
}
```

**错误**：

- `WQ-INF-PERSIST-001` 本地存储失败

### 3.11 截图 `CaptureScreenshotUseCase`

纯前端实现，无需 WASM 参与。使用 Three.js `renderer.domElement.toDataURL()` 或 `canvas.toBlob()`，不引入 `html2canvas` 依赖。

**Request**：

```typescript
interface CaptureScreenshotRequest {
  readonly includeWatermark?: boolean;  // 默认 true，添加项目水印
  readonly format?: 'png' | 'jpeg';     // 默认 png
  readonly quality?: number;            // 0-1，默认 0.92（仅 jpeg 生效）
}
```

**Response**：

```typescript
interface CaptureScreenshotResponse {
  readonly dataUrl: string;             // base64 编码图片数据
  readonly blobSize: number;            // 图片字节数
  readonly format: string;
}
```

**错误**：

- `WQ-UI-RENDER-001` 渲染异常

### 3.12 分享链接生成 `GenerateShareLinkUseCase`

**Request**：

```typescript
interface GenerateShareLinkRequest {
  readonly cameraPosition: [number, number, number];
  readonly cameraTarget: [number, number, number];
  readonly focusedNodeId: string | null;
}
```

**Response**：

```typescript
interface GenerateShareLinkResponse {
  readonly url: string;            // 含查询参数的分享 URL
  readonly expiresAt?: string;     // 远期支持
}
```

---

## 4. WASM 计算接口

### 4.1 接口导出方式

通过 `wasm-bindgen` 导出 Rust 函数，TypeScript 侧通过绑定调用。

```rust
// wenqi-core/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WenqiCore { /* ... */ }

#[wasm_bindgen]
impl WenqiCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WenqiCore { /* ... */ }

    pub fn init(&mut self, dataset: &str) -> Result<(), JsValue> { /* ... */ }
    pub fn score_poet(&self, poet_json: &str) -> Result<String, JsValue> { /* ... */ }
    // ...
}
```

### 4.2 初始化接口

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `WenqiCore.new` | `() -> WenqiCore` | 构造核心实例 |
| `WenqiCore.init` | `(dataset: string) -> Promise<void>` | 加载数据集并构建索引 |
| `WenqiCore.version` | `() -> string` | 返回 WASM 模块版本 |
| `WenqiCore.algorithmVersion` | `() -> string` | 返回评分算法版本 |

**错误**：

- `WQ-INF-WASM-001` 加载失败
- `WQ-INF-WASM-002` 初始化超时
- `WQ-INF-DATA-003` 数据格式错误

### 4.3 检索接口

WASM 端提供全文检索引擎，JS 端通过 `WasmBridge` 双通道自动降级调用。

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `SearchEngine.buildIndex` | `(corpusJson: string) -> void` | 构建倒排索引 |
| `SearchEngine.search` | `(query: string, optionsJson: string) -> string` | 全文检索 JSON 接口 |
| `SearchEngine.searchBinary` | `(query: string, optionsBytes: Uint8Array) -> Uint8Array` | 全文检索 bincode 二进制接口 |
| `SearchEngine.fuzzyMatch` | `(query: string) -> string` | 拼音/简繁模糊匹配 |

**双通道自动降级策略**：

```
JS 调用方 → WasmBridge.search(query, opts)
  │
  ├─ bincode 优先通道
  │    opts → JSON.stringify → wasm.bincodeEncode → Uint8Array
  │    → SearchEngine.searchBinary(query, bytes) → Uint8Array
  │    → wasm.bincodeDecode → JSON.parse → 结果
  │
  └─ JSON 降级通道（bincode 不可用或失败时）
       opts → JSON.stringify
       → SearchEngine.search(query, jsonStr) → jsonStr
       → JSON.parse → 结果
```

**错误**：

- `WQ-WASM-SEARCH-001` 检索引擎未就绪

### 4.4 空间索引接口

空间索引（KD-Tree）在 JS 端 `WasmBridge` 中实现，不经过 WASM 调用。

**数据来源**：从 `spatial-index.json` 加载节点位置数据，`WasmBridge.ensureSpatialIndex()` 惰性构建 JS 端 KD-Tree。

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `WasmBridge.queryNearby` | `(x, y, z, radius) -> Promise<string[]>` | 查询半径内节点 ID 列表（JS KD-Tree） |

**注意**：`queryKnn` 未实现（当前业务无此需求）。

### 4.5 聚类接口

聚类计算在 JS 领域层 `LayoutService` 中完成，不经过 WASM 调用。

WASM 端暴露 `ClusterService.clusterByBinary` 供需要时使用：

| WASM 方法 | 签名 | 说明 |
|-----------|------|------|
| `ClusterService.clusterBy` | `(nodesJson: string, dimension: string) -> string` | 聚类，返回 `QiClusterDTO[]` JSON |
| `ClusterService.clusterByBinary` | `(nodesBytes: Uint8Array, dimension: string) -> Uint8Array` | 聚类，bincode 二进制接口 |

### 4.6 评分接口

三气评分在离线数据加工阶段完成（`scripts/calculate-scores.ts`），运行时不作为 WASM 接口暴露。

WASM 端保留 `ScoringService` 供离线脚本调用：

| WASM 方法 | 签名 | 说明 |
|-----------|------|------|
| `ScoringService.scorePoet` | `(poetJson: string, worksJson: string) -> string` | 单诗人评分（JSON） |
| `ScoringService.scorePoetBinary` | `(poetBytes: Uint8Array, worksBytes: Uint8Array) -> Uint8Array` | 单诗人评分（bincode） |
| `ScoringService.scoreBatch` | `(poetsJson: string, worksJson: string) -> string` | 批量评分（JSON） |
| `ScoringService.scoreBatchBinary` | `(poetsBytes: Uint8Array, worksBytes: Uint8Array) -> Uint8Array` | 批量评分（bincode） |

### 4.7 通用 bincode 编解码器

JS 与 WASM 之间通过通用 bincode 编解码器传递二进制数据，避免 JSON 序列化/反序列化开销。

**Rust 端（`codec.rs`）**：

| WASM 方法 | 签名 | 说明 |
|-----------|------|------|
| `bincodeEncode` | `(jsonStr: string) -> Uint8Array` | JSON 字符串 → bincode 字节 |
| `bincodeDecode` | `(bytes: Uint8Array) -> string` | bincode 字节 → JSON 字符串 |

**JS 端（`bincode-codec.ts`）**：

```typescript
// 将 JS 值序列化为 bincode 字节
async function bincodeEncode(data: unknown): Promise<Uint8Array>;

// 从 bincode 字节反序列化为 JS 值
async function bincodeDecode<T>(bytes: Uint8Array): Promise<T>;
```

**调用链路**：

```
JS 值 → JSON.stringify → wasm.bincodeEncode → Uint8Array (发送到 WASM)
Uint8Array (从 WASM 接收) → wasm.bincodeDecode → JSON.parse → JS 值
```

bincode 将 JSON 字符串视为不透明 `String` 处理（bincode 原生不支持 `serde_json::Value` 的 `deserialize_any`），因此编解码器的数据中转格式始终为 JSON 字符串。

### 4.8 布局接口

节点布局计算全部在 JS 端完成：

- 初始布局：`LayoutService.computeInitialLayout`（领域服务）
- 聚气布局：`LayoutService.computeConvergence` + `GalaxyScene.focusNode`（领域服务 + Three.js）
- 维度重新布局：`LayoutService.recomputePositions` + `GalaxyScene.updateDimensionWeights`
- 空间查询：`WasmBridge.queryNearby`（JS KD-Tree，不经过 WASM）

### 4.9 性能契约

| 操作 | 数据规模 | 延迟上限 |
| --- | --- | --- |
| 初始化（数据加载 + 渲染） | 14,087 节点 | < 3s |
| 全文检索（JSON 通道） | 344,245 作品 | < 200ms |
| 全文检索（bincode 通道） | 344,245 作品 | < 150ms |
| 空间查询（JS KD-Tree） | 14,087 节点 | < 10ms |
| 聚气布局计算 | 50 节点 | < 16ms |
| 聚类计算 | 14,087 节点 | < 50ms |

### 4.10 WASM 错误传递

WASM 调用采用双通道降级策略，错误处理分两层：

1. **bincode 通道失败**：静默降级到 JSON 通道，不向上层抛错。
2. **JSON 通道失败**：返回空结果（可降级场景，如搜索返回空数组），或抛出 `InfraError`（不可降级场景）。

```typescript
// infrastructure/wasm/bridge.ts 实际实现
async search(query: string, options?: SearchOptions): Promise<SearchResult> {
  if (!this.searchEngine) return [];

  // 优先通道：bincode
  if (isBincodeAvailable()) {
    try {
      const optBytes = this.wasmModule!.bincodeEncode(JSON.stringify(options));
      const resultBytes = this.searchEngine.searchBinary(query, optBytes);
      return parseResult(this.wasmModule!.bincodeDecode(resultBytes));
    } catch {
      // 降级：静默切换到 JSON
    }
  }

  // 降级通道：JSON
  try {
    const json = this.searchEngine.search(query, JSON.stringify(options));
    return parseResult(json);
  } catch {
    return [];  // 可降级场景返回空
  }
}
```

---

## 5. 数据契约接口

### 5.1 数据集文件结构

```
data/processed/
├── dataset.json              # 主数据集（元数据 + 索引）
├── poets.json                # 诗人列表
├── works.json                # 作品列表（可分片）
├── works-001.json            # 作品分片（按朝代）
├── works-002.json
├── relations.json            # 关联数据
├── references.json           # 引用数据
├── scores.json               # 预计算评分
└── manifest.json             # 数据集清单
```

### 5.2 `manifest.json` 结构

```typescript
interface DatasetManifest {
  readonly version: string;        // 数据集版本，如 '2026.06.01'
  readonly algorithmVersion: string; // 评分算法版本
  readonly generatedAt: string;    // 生成时间 ISO 8601
  readonly stats: {
    readonly poetCount: number;
    readonly workCount: number;
    readonly relationCount: number;
  };
  readonly files: Array<{
    readonly path: string;         // 相对路径
    readonly type: 'poets' | 'works' | 'relations' | 'references' | 'scores';
    readonly shardIndex?: number;  // 分片序号
    readonly size: number;         // 字节
    readonly hash: string;         // SHA-256
  }>;
}
```

### 5.3 `Dataset` 数据集结构

```typescript
interface Dataset {
  readonly manifest: DatasetManifest;
  readonly poets: PoetRaw[];
  readonly works: WorkRaw[];
  readonly relations: RelationRaw[];
  readonly references: ReferenceRaw[];
  readonly scores: ScoreRaw[];
}
```

**说明**：
- `Dataset` 是应用初始化时加载的完整数据集结构。
- 各子结构（`PoetRaw`、`WorkRaw` 等）定义见后续章节。
- 数据集可按朝代/体裁分片加载，分片策略详见持久化设计文档。

### 5.4 `PoetRaw` 数据结构

```typescript
interface PoetRaw {
  readonly id: string;              // 如 'poet_li_bai'
  readonly name: string;            // '李白'
  readonly courtesyName: string | null;  // '太白'
  readonly pseudonym: string | null;     // '青莲居士'
  readonly birthYear: number | null;     // 701
  readonly deathYear: number | null;     // 762
  readonly dynasty: DynastyCode;         // 'TANG'
  readonly school: string | null;        // '浪漫主义'
  readonly biography: string;            // 简介
}
```

### 5.5 `WorkRaw` 数据结构

```typescript
interface WorkRaw {
  readonly id: string;              // 如 'work_jing_ye_si'
  readonly title: string;           // '静夜思'
  readonly genre: GenreCode;        // 'SHI'
  readonly creationYear: number | null;
  readonly text: string;            // 原文（含换行）
  readonly annotation: string | null;
  readonly translation: string | null;
  readonly poetId: string;          // 关联诗人
}
```

### 5.6 `RelationRaw` 数据结构

```typescript
interface RelationRaw {
  readonly id: string;
  readonly sourceId: string;        // 节点 ID 或诗人 ID
  readonly targetId: string;
  readonly relationType: RelationType;
  readonly weight: number;          // 0–1
  readonly evidence?: string;       // 关系依据（如引用原文）
}
```

### 5.7 `ReferenceRaw` 数据结构

```typescript
interface ReferenceRaw {
  readonly id: string;
  readonly sourceWorkId: string;    // 引用方作品
  readonly targetWorkId: string;    // 被引用作品
  readonly sourceText: string;      // 引用片段
  readonly context?: string;        // 引用上下文
}
```

### 5.8 `ScoreRaw` 数据结构

```typescript
interface ScoreRaw {
  readonly refType: 'POET' | 'WORK';
  readonly refId: string;
  readonly talent: {
    readonly value: number;
    readonly factors: { /* ... */ };
  };
  readonly popularity: {
    readonly value: number;
    readonly factors: { /* ... */ };
  };
  readonly luck: {
    readonly value: number;
    readonly factors: { /* ... */ };
  };
  readonly algorithmVersion: string;
  readonly computedAt: string;
}
```

---

## 6. DTO 结构定义

### 6.1 `GalaxyDTO`

```typescript
interface GalaxyDTO {
  readonly nodes: NodeDTO[];
  readonly relations: RelationDTO[];
  readonly clusters: QiClusterDTO[];
  readonly dataVersion: string;
}
```

### 6.2 `NodeDTO`

```typescript
interface NodeDTO {
  readonly id: string;
  readonly refType: 'POET' | 'WORK';
  readonly refId: string;
  readonly position: PositionDTO;
  readonly basePosition: PositionDTO;
  readonly threeQi: ThreeQiDTO;
  readonly dynasty: DynastyCode;
  readonly genre: GenreCode | null;
  readonly size: number;
  readonly brightness: number;
  readonly phase: number;
  readonly state: 'IDLE' | 'CONVERGING' | 'DIVERGED';
  readonly label: string;           // 显示名称
}

interface PositionDTO {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
```

### 6.3 `ThreeQiDTO`

```typescript
interface ThreeQiDTO {
  readonly talent: number;          // 0–100
  readonly popularity: number;      // 0–100
  readonly luck: number;            // −50 ~ 50
  readonly algorithmVersion: string;
  readonly factors?: {
    readonly talent: { /* ... */ };
    readonly popularity: { /* ... */ };
    readonly luck: { /* ... */ };
  };
}
```

### 6.4 `RelationDTO`

```typescript
interface RelationDTO {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly relationType: RelationType;
  readonly weight: number;
}
```

### 6.5 `QiClusterDTO`

```typescript
interface QiClusterDTO {
  readonly id: string;
  readonly dimension: 'DYNASTY' | 'GENRE';
  readonly key: string;             // DynastyCode 或 GenreCode
  readonly label: string;           // 中文名
  readonly center: PositionDTO;
  readonly density: number;
  readonly color: string;
  readonly nodeCount: number;
}
```

### 6.6 `PoetDTO` / `PoetDetailDTO`

```typescript
interface PoetDTO {
  readonly id: string;
  readonly name: string;
  readonly courtesyName: string | null;
  readonly pseudonym: string | null;
  readonly dynasty: DynastyCode;
  readonly school: string | null;
  readonly threeQi: ThreeQiDTO;
}

interface PoetDetailDTO extends PoetDTO {
  readonly birthYear: number | null;
  readonly deathYear: number | null;
  readonly biography: string;
  readonly workCount: number;
}
```

### 6.7 `WorkDTO` / `WorkDetailDTO`

```typescript
interface WorkDTO {
  readonly id: string;
  readonly title: string;
  readonly genre: GenreCode;
  readonly poetId: string;
  readonly poetName: string;
  readonly threeQi: ThreeQiDTO | null;
}

interface WorkDetailDTO extends WorkDTO {
  readonly creationYear: number | null;
  readonly text: string;
  readonly annotation: string | null;
  readonly translation: string | null;
}
```

### 6.8 `MovementDTO`

```typescript
interface MovementDTO {
  readonly nodeId: string;
  readonly from: PositionDTO;
  readonly to: PositionDTO;
  readonly durationMs: number;
  readonly easing: 'ease-out' | 'ease-in-out';
}
```


---

## 8. 配置接口

### 8.1 配置加载用例 `LoadConfigUseCase`

**Request**：

```typescript
interface LoadConfigRequest {
  readonly path?: string;           // 默认 'application.yml'
  readonly envOverrides?: Partial<Config>;
}
```

**Response**：

```typescript
interface LoadConfigResponse {
  readonly config: Config;
  readonly source: 'file' | 'env' | 'default';
}
```

### 8.2 `Config` 结构

统一入口配置文件 `application.yml` 的 TypeScript 映射结构：

```typescript
interface Config {
  readonly version: string;
  readonly data: {
    readonly source: string;
    readonly version: string;
    readonly shards?: {
      readonly enabled: boolean;
      readonly by: 'dynasty' | 'genre';
    };
  };
  readonly wasm: {
    readonly modulePath: string;
    readonly initTimeoutMs: number;
  };
  readonly rendering: {
    readonly targetFps: number;
    readonly maxNodes: number;
    readonly maxEdges: number;
    readonly lodThresholds: number[];
  };
  readonly scoring: {
    readonly algorithmVersion: string;
    readonly weights: DimensionWeights;
  };
  readonly logging: {
    readonly level: 'DEBUG' | 'INFO' | 'ERROR';
    readonly fileOutput: boolean;
    readonly filePath: string;
    readonly retentionDays: number;
    readonly browserFallback: 'indexedDB' | 'memory';
    readonly exportEnabled: boolean;
  };
  readonly persistence: {
    readonly dataset: { readonly cache: string; readonly versionKey: string; readonly autoUpdate: boolean };
    readonly index: { readonly cache: string; readonly versionKey: string; readonly serialization: 'bincode' | 'json' };
    readonly scores: { readonly cache: string; readonly versionKey: string };
    readonly viewConfig: { readonly storage: 'localStorage' | 'jsonFile' };
    readonly quota: { readonly checkBeforeWrite: boolean; readonly requestPersist: boolean };
  };
  readonly font: {
    readonly primary: string;
    readonly fallback: string;
  };
}
```

> 持久化端口的完整接口定义见 [06-持久化设计文档](./06-持久化设计文档.md) 第 5 章。

---

## 9. 日志接口

### 9.1 `LoggerPort` 接口

```typescript
interface LoggerPort {
  debug(module: string, message: string, context?: object): void;
  info(module: string, message: string, context?: object): void;
  error(module: string, message: string, error?: Error): void;
  setLevel(level: 'DEBUG' | 'INFO' | 'ERROR'): void;
  flush(): Promise<void>;

  // 按日轮转，清理超过 retentionDays 的记录
  rotate(retentionDays: number): Promise<void>;

  // 导出日志（浏览器环境生成 wenqi-YYYYMMDD.log 文件下载）
  export(startDate: Date, endDate: Date): Promise<Blob>;
}
```

> 浏览器环境实现策略详见 [06-持久化设计文档](./06-持久化设计文档.md) 第 6 章。

### 9.2 调用约定

- `module`：模块命名空间（如 `WasmBridge`、`DataRepository`）。
- `message`：中文日志内容。
- `context`：结构化上下文（自动脱敏）。
- `error`：错误对象（自动提取堆栈）。

**示例**：

```typescript
logger.info('WasmBridge', 'WASM 模块初始化完成', { durationMs: 312 });
logger.error('DataRepository', '数据加载失败', err);
```

### 9.3 日志输出格式

```
[2026-06-23 14:30:15.123] [INFO] [1|1024] [WasmBridge:42] - WASM 模块初始化完成 | {"durationMs":312}
```

### 9.4 持久化端口接口

持久化在浏览器环境中使用 IndexedDB 实现，领域层定义端口，基础设施层提供实现。完整设计见 [06-持久化设计文档](./06-持久化设计文档.md) 第 4 章。

```typescript
// 数据集仓储
interface DatasetRepository {
  load(version: string): Promise<Dataset>;
  getCachedVersion(): Promise<string | null>;
  saveCache(dataset: Dataset, version: string): Promise<void>;
  clearCache(): Promise<void>;
  getManifest(): Promise<DatasetManifest>;
}

// 索引缓存仓储
interface IndexCacheRepository {
  read(algorithmVersion: string, indexType: IndexType): Promise<Blob | null>;
  write(algorithmVersion: string, indexType: IndexType, data: Blob): Promise<void>;
  isValid(algorithmVersion: string): Promise<boolean>;
  clear(): Promise<void>;
}

type IndexType = 'SPATIAL_KDTREE' | 'INVERTED_INDEX' | 'CLUSTER_INDEX';

// 评分缓存仓储
interface ScoreCacheRepository {
  readBatch(refIds: string[]): Promise<Map<string, ThreeQi>>;
  writeBatch(scores: Map<string, ThreeQi>, algorithmVersion: string): Promise<void>;
  clearByAlgorithm(version: string): Promise<void>;
}

// 视图配置仓储
interface ViewConfigRepository {
  load(): Promise<ViewConfig | null>;
  save(config: ViewConfig): Promise<void>;
  clear(): Promise<void>;
}
```

---

## 10. 事件订阅接口

### 10.1 `EventBusPort` 接口

```typescript
interface EventBusPort {
  publish<T extends DomainEvent>(event: T): void;
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => void
  ): Unsubscribe;

  type Unsubscribe = () => void;
}
```

### 10.2 事件类型常量

```typescript
const EventType = {
  NodeFocused: 'NodeFocused',
  NodeUnfocused: 'NodeUnfocused',
  DimensionAdjusted: 'DimensionAdjusted',
  DatasetUpdated: 'DatasetUpdated',
  ScoringUpgraded: 'ScoringUpgraded',
} as const;
```

### 10.3 订阅示例

```typescript
eventBus.subscribe('NodeFocused', (e: NodeFocusedEvent) => {
  logger.info('UseCase.Focus', '节点已聚焦', { nodeId: e.nodeId });
  loadDetailUseCase.execute({ nodeId: e.nodeId });
});
```

---

## 11. 接口版本管理

### 11.1 版本策略

- 接口版本号：`vMAJOR.MINOR`。
- MAJOR：破坏性变更（字段删除、类型变更）。
- MINOR：向后兼容的新增。
- 数据集版本独立于接口版本。

### 11.2 兼容性策略

- 客户端启动时校验 `manifest.algorithmVersion` 与代码版本。
- 不兼容时提示用户刷新或降级运行。
- 数据集升级通过迁移脚本完成，保留历史版本可回溯。

---

## 12. 安全与脱敏

### 12.1 接口安全

- 输入校验：所有入参在应用层校验后传入领域层。
- WASM 模块完整性校验（SRI）。
- 数据集完整性校验（哈希）。

### 12.2 日志脱敏清单

| 字段 | 脱敏方式 |
| --- | --- |
| 密码/令牌 | 完全禁止记录 |
| 身份证号 | `110101********1234` |
| 手机号 | `138****5678` |
| 邮箱 | `z***@example.com` |
| 用户输入文本 | 仅记录长度与哈希，不记录原文 |

### 12.3 错误信息脱敏

- 面向用户的 `message` 须为通用中文提示。
- 技术细节仅记录至日志，不下发用户。
- 堆栈信息仅在 DEBUG 级别输出。

---

## 13. 接口测试策略

### 13.1 测试分层

| 层 | 工具 | 重点 |
| --- | --- | --- |
| 用例接口 | Vitest | 入参校验、返回结构、错误码 |
| WASM 接口 | wasm-bindgen-test | 算法正确性、性能契约 |
| 数据契约 | Vitest | JSON 解析、版本校验 |

### 13.2 契约测试

- 使用接口定义生成 mock 数据。
- 表现层基于 mock 开发，不依赖真实数据。
- 数据格式变更须同步更新契约测试。

---

## 14. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
| --- | --- | --- | --- |
| v1.0 | 2026-06-23 | 初版创建，覆盖完整版接口设计 | 文气项目组 |
| v1.1 | 2026-06-24 | 简化为纯客户端方案，移除远期后端 API 设计 | 文气项目组 |
