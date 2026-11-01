# 更新日志（CHANGELOG）

本项目遵循 [CalVer（日历版本）](https://calver.org/) 版本规范：`YYYY.MM.DD.MICRO`（年.月.日.迭代号）。

---

## [2026.11.01.0] - 0.1.0

### ⚠️ Breaking Changes  破坏性变更

- 【数据底座】数据链路改造为 raw 数据直写 SQLite（`data/wenqi.db`，WAL 模式），数据库为项目唯一真相源；`poets.json` / `works.json` / `scores.json` 等中间产物退役，`data:sync` 命令移除
- 【数据底座】`build-search-index`（508MB search-index.json 全文索引链路）移出主管道，待 FTS5 方案决策后重构
- 【领域端口】`WorkRepository` 端口移除 `loadAll()`，作品数据仅支持按诗人分片加载
- 【应用层】`GetWorkDetailUseCase` 请求新增必填参数 `poetId`（按诗人分片定位作品）

### ✨ New Features  新增功能

- 【数据底座】新增 SQLite 数据底座 CLI（`scripts/db.ts`，基于 bun:sqlite）：`db:import`（JSON 快照恢复）、`db:export`（导出前端全部 JSON）、`db:dump`（调试快照）、`db:stats`（统计与管道审计）
- 【数据底座】作品数据按诗人朝代分表切片写入（`works_tang` / `works_song` 等 11 张分表，含 poet_id 索引）
- 【数据底座】新增 `spatial_index`（空间索引）、`meta`（版本元数据）、`import_log`（管道阶段审计）表
- 【前端数据】作品按诗人分片 JSON（256 桶，路径可由 poetId 推导），`DataLoader.loadWorkShard` 按需加载并复用内存 / IndexedDB 缓存
- 【管道脚本】新增 `scripts/db-core.ts` 共享核心（连接 / schema / 批量插入 / 读取 / meta），四个管道脚本共用同一份 schema 真相

### 🐛 Bug Fixes  问题修复

- 【数据管道】作品重复 ID（22 条跨诗集重复收录）去重前移至清洗源头（`deduplicateWorks` 增加 id 级去重）
- 【前端性能】消除三处 155MB 全量作品加载：诗人详情面板、搜索预加载、星系组件启动时的 workId 映射构建（死防御代码移除）

### 📈 Improvements  性能/体验优化

- 【前端性能】查看诗人详情由全量下载解析 155MB works.json 优化为按需拉取单个分片（平均约 11KB）
- 【搜索性能】作品匹配由启动全量扫描改为对搜索命中诗人按需加载分片匹配（每次仅数个小分片，重复搜索零开销）
- 【数据管道】`data:all` 管道全程直连数据库（process 25s / scores 21s / index 0.4s），postbuild 自动从 DB 刷新前端数据
- 【存储占用】清理旧 JSON 中间产物约 670MB（works.json 155MB + search-index.json 508MB 等）

### 📚 Docs  文档更新

- 新建 CHANGELOG.md，启用 CalVer 版本规范

### 🔧 Dependencies  依赖更新

- 新增 devDependency `@types/bun`（补全 `bun:test` / `bun:sqlite` 类型声明）

### 🗑 Deprecated  废弃功能

- 【数据管道】`scripts/build-search-index.ts` 已废弃（search-index.json 508MB 产物无消费方），全文检索将基于 SQLite FTS5 重新设计
