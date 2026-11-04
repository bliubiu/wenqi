# 文气（WenQi）业务能力扩展 PRD 与技术方案

> **文档定位**：在《02-产品需求文档PRD》确定的星系可视化核心功能之上，规划下一阶段业务能力扩展。将五个方面（知识与数据、分析能力、交互体验、分享传播、技术底座）按优先级细化为四个正式扩展项（WQ-1～WQ-4）与一个后备清单（WQ-5）。
>
> **撰写原则**：所有技术方案均基于当前代码实际状态（附代码位置引用），遵循项目 DDD 四层架构与 TDD 制度，方案取舍遵循「简单优先」。

| 项目属性 | 内容 |
| --- | --- |
| 文档版本 | v1.0（CalVer：2026.11.03.0） |
| 发布日期 | 2026-11-03 |
| 文档读者 | 开发团队、产品设计 |
| 关联文档 | 01-项目规格说明书 / 02-产品需求文档PRD / 03-架构设计文档 / 04-领域模型设计 / 06-持久化设计文档 |
| 数据基线 | manifest 2026.11.02.1012：诗人 14181、作品 345562、节点 14181、关系 0 |

---

## 1. 现状基线与差距

以下为本方案的事实出发点（调研于 2026-11-03，均经代码核实）：

1. **关系体系「有型无实」**：`RelationType` 已定义 7 种枚举（`src/domain/entities/Relation.ts:1-11`），但运行时仅 `SAME_DYNASTY` 一种即时生成（滑动窗口配对、上限 5 万条，`src/domain/services/RelationService.ts:54-94`），未持久化（manifest `relationCount: 0`），`RelationRepository` 端口已有（`src/domain/ports/DataPorts.ts:36-41`）但未接入 DI（`src/di/composition-root.ts`）。
2. **家乡数据已抓未入库**：`scripts/fetch-hometowns.ts` 产出 `data/processed/cnkgraph/poet-hometowns.json`（约 5KB），未写回 `wenqi.db`，前端无消费。
3. **检索三通道已成体系**：WASM SearchEngine → 诗人名 label 匹配 → FTS5 简繁归一分片全文检索（`src/application/usecases/SearchUseCase.ts:7-68`），前端 16 分片懒加载（`src/infrastructure/search/ShardSearchIndex.ts:33-86`）。支持按字面检索，不支持按意境检索。
4. **场景层聚焦/散气/星团机制完备**：聚焦收敛动画、散气模式、按朝代聚类均可复用（`src/presentation/scene/GalaxyScene.ts`）；但边渲染无静态边、无类型区分，聚焦时以「同朝代前 50 节点」模拟关系流向（`GalaxyScene.ts:489-491`、`EdgeRenderer.ts:11-14`）。
5. **三气评分有据但不可见**：`scores` 表已存各维度评分及 factors 明细 JSON（`scripts/db-core.ts:98-105`），算法版本 v1.1（`scripts/calculate-scores.ts:16`），前端未展示评分构成。
6. **技术债**：`application.yml` 已由 `next.config.js` 构建期注入、`ConfigLoader` 深合并生效（2026-11-03 接线完成）；`docs/06` 分片章节已与 256 桶作品分片 + 16 检索/关系分片实现对齐；`RecitationUseCase` 尚未装配进 `composition-root.ts`。

---

## 2. 扩展项总览与优先级路线图

### 2.1 总览

| 编号 | 名称 | 来源方面 | 优先级 | 一句话目标 | 前置依赖 |
| --- | --- | --- | --- | --- | --- |
| WQ-1 | 关系网络深化 | 一·知识与数据 | P0 | 关系从「运行时模拟」升级为「构建期挖掘 + 持久化 + 类型化呈现」 | 无 |
| WQ-2 | 主题漫游 | 三·交互体验 | P1 | 预置导览剧本，自动镜头飞行与解说串联星系叙事 | 弱依赖 WQ-1（关系让剧本更丰富，非硬依赖） |
| WQ-3 | 时间演化回放 | 二·分析能力 | P2 | 拖动时间轴，观星云自先秦至清代逐代生长 | 无（与 WQ-1/WQ-2 无耦合） |
| WQ-4 | 语义检索 | 五·技术底座 | P3 | 在 FTS5 全文之外支持「按意境搜索」 | 无 |
| WQ-5 | 后备能力清单 | 二/三/四/五 | P3+ | 评分透明化、对比模式、AI 导览、卡片海报等 | 随里程碑搭车 |

### 2.2 路线图

| 里程碑 | 周期 | 主项 | 搭车项 |
| --- | --- | --- | --- |
| M1 | 第 1–3 周 | WQ-1 关系网络深化 | 家乡数据入库（§7.9）、评分 factors 数据预备、配置接线（§7.12） |
| M2 | 第 4–5 周 | WQ-2 主题漫游 | RecitationUseCase 装配、每日一诗（§7.6） |
| M3 | 第 6–7 周 | WQ-3 时间演化回放 | 评分透明化（§7.1）、双诗人对比（§7.2） |
| M4 | 第 8–9 周 | WQ-4 语义检索 | 星图视图分享增强（§7.8） |

每个里程碑出口准则：测试全绿且覆盖率不低于现有阈值（`vitest.config.ts`：语句 70%/分支 65%/函数 60%/行 70%）；数据管线幂等可重跑；`CHANGELOG.md` 按 CalVer 记录；关联设计文档（04/06）同步更新。

---

## 3. WQ-1 关系网络深化（P0）

### 3.1 背景与目标

「聚气」是产品核心交互，但当前聚焦一位诗人时，气流粒子流向的是「同朝代前 50 个节点」——是视觉模拟而非真实文脉。本项将师承、友朋唱和、并称流派、化用影响等真实关系从 34.5 万作品语料中挖掘入库，让「气之流转」有据可依，直接服务于画像 B（研究者，关系可溯）与画像 A（爱好者，发现关联）。

**非目标**：不追求文学史级精确的关系考证（以算法推断 + 证据标注代替）；散气模式暂不渲染关系边。

### 3.2 用户故事

- 作为文学爱好者，我聚焦李白时，能看到不同颜色的气流分别流向杜甫（友朋）、孟浩然（友朋）、屈原（影响），直观感受「谁与谁有交集」。
- 作为研究者，我在李白详情面板展开「文脉关系」，看到每条关系的证据（赠答原题、化用片段），可点击跳转验证。
- 作为教育工作者，我按「师承」筛选关系讲解流派传承。

### 3.3 功能需求

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-WQ1-01 | 关系挖掘入库：构建期从现有语料挖掘师承（TEACHER_STUDENT）、友朋（FRIEND）、流派并称（SAME_SCHOOL）、化用影响（INFLUENCE）四类关系，连同空间近邻生成的同朝代关系（SAME_DYNASTY）写入 SQLite `relations` 表，构建完成后 `relationCount > 0` | P0 |
| FR-WQ1-02 | 关系分片导出：关系按诗人 16 分片导出为前端 JSON，单分片 ≤ 300KB，懒加载 + IndexedDB 缓存（缓存键纳入关系版本，遵循 06 文档版本契约） | P0 |
| FR-WQ1-03 | 聚气类型化呈现：聚焦时气流粒子按关系类型着色分流，粒子流量随 weight 加权 | P0 |
| FR-WQ1-04 | 关系谱列表：诗人详情面板新增「文脉关系」区，按类型分组列出，点击跳转聚焦（复用 `FocusNodeUseCase`） | P0 |
| FR-WQ1-05 | 证据溯源：关系条目可展开证据（赠答原题、并称原文、化用片段对照）；算法推断的关系标注「推断」徽标 | P1 |
| FR-WQ1-06 | 稀疏化：每诗人保留权重 Top-30 关系；同朝代改为空间近邻 Top-20；全库关系总量 ≤ 25 万条 | P0 |

### 3.4 非功能需求

- 聚焦动画不被关系懒加载阻塞：先动画后补边，粒子随数据到达渐入。
- 新增首屏资源体积 0（分片全部懒加载）。
- 挖掘管线幂等可重跑，沿用 `import_log` 审计（`scripts/db-core.ts:122-133`）。

### 3.5 验收标准

1. `bun run data:all` 后 `db:stats` 显示 relations 行数在 5 万–25 万区间，`import_log` 存在 `stage='relations'` 审计记录。
2. 聚焦李白：可见 ≥ 3 种类型粒子流；详情面板关系谱非空，证据可展开；点击关系对象可跳转聚焦。
3. 单诗人邻接分片懒加载 ≤ 100ms（本地），聚焦动画全程桌面 60fps。
4. 挖掘管线对 100 条人工标注样例（`data/processed/relation-eval.json`）准确率 ≥ 85%（赠答/并称类）。

### 3.6 技术方案

#### 3.6.1 总体架构

```
process-data（现状） → mine-relations（新增） → calculate-scores → build-index → build-search-index → db:export（扩展）
                                                        │
 SQLite wenqi.db ←─ relations 表（新增，SCHEMA_VERSION 1→2）
 public/data/processed/relations/shard-{0..15}.json（新增，懒加载）
 前端：ShardedRelationRepository（新增，实现 RelationRepository 端口）
        → RelationService（改造：持久化优先，即时生成兜底）
        → EdgeRenderer（类型化粒子流） + PoetDetailPanel（关系谱）
```

`package.json` 的 `data:all` 管线同步插入 `mine-relations` 步骤。

#### 3.6.2 挖掘管线（新增 `scripts/mine-relations.ts`）

五类挖掘器，统一接口 `{ mine(ctx): RawRelation[] }`：

1. **赠答友朋（FRIEND / TEACHER_STUDENT）**：标题模式 + 姓名索引。
   - 模式表（动词 → 类型、基础权重）：和/答/酬/次韵 → FRIEND 0.9（唱和强信号）；赠/呈/寄/上/简/示 → FRIEND 0.7；别/留别/送 → FRIEND 0.6；怀/忆/梦 → FRIEND 0.5；哭/悼/挽/吊 → FRIEND 0.6。
   - 候选人名（标题动词后 2–4 字）经姓名索引（poets 全量姓名 + 字 + 号，繁转简归一，复用 `src/infrastructure/text/t2s.ts`）匹配到诗人 ID；地名黑名单过滤（候选以 州/山/水/江/城/寺/宫/亭 等结尾则跳过，规避「送孟浩然之广陵」类地名误配）。
   - 证据存作品 ID 与标题；双向建边（受赠者侧回边权重 ×0.9）。当动词为 谒/上/师/从 且对象明显为尊长时归入 TEACHER_STUDENT，weight 0.6，标注「推断」。
2. **并称（SAME_SCHOOL）**：内置并称词表（李杜、元白、韩孟、三苏、建安七子、竹林七贤、初唐四杰、大历十才子、苏门四学士、温李、南施北宋等），在诗人简介与作品标题中匹配并称原文，成员两两建边，weight 0.8，证据存并称原文。
3. **流派（SAME_SCHOOL）**：`poets.school` 字段相同者建边 weight 0.5；另设流派补录表（江西诗派、花间派、婉约/豪放、公安派、桐城派等）弥补 school 字段缺失。
4. **化用影响（INFLUENCE）**：跨朝代 5-gram 倒排。
   - 按朝代顺序滚动构建前代 5-gram 倒排（gram → 诗人/作品列表）；当前朝代作品查询命中。
   - 高频公共语过滤：gram 出现在 ≥ 50 个不同诗人作品中视为常语剔除。
   - 同一对诗人累计命中 gram ≥ 3 且分布于 ≥ 2 个作品 → 建 INFLUENCE 边，weight = min(0.9, 0.3 + 0.1 × gram 数)，每对证据保留前 3 条（原句片段对照）。CITATION 类型待选本元数据具备后启用（开放问题 §10）。
5. **同朝代（SAME_DYNASTY）**：弃用运行时滑动窗口口径，构建期用已有序列化 KD-Tree（`spatial_index` 表，`scripts/build-index.ts:119-154`）取每节点空间近邻 Top-20，weight 0.3（保持现状权重口径 `RelationService.ts:12-14`）。

**稀疏化**：全图按节点取 Top-30 截断后写库；同对诗人同类型多证据只保留最高权重边（证据合并）。

#### 3.6.3 存储与迁移

```sql
CREATE TABLE relations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,          -- 节点 ID（poet:{id}）
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,               -- RelationType 枚举
  weight REAL NOT NULL,             -- [0,1]
  evidence TEXT,                    -- JSON：{kind, titles[], workIds[], quote?}
  UNIQUE(source_id, target_id, type)
);
CREATE INDEX idx_relations_source ON relations(source_id);
CREATE INDEX idx_relations_type ON relations(type);
```

- `SCHEMA_VERSION` 由 `'1'` 升至 `'2'`（`scripts/db-core.ts:14`），import 通道兼容重建。
- `db:export` 新增关系导出：按 `djb2(poetId) % 16` 分片（与检索分片同策略），manifest 增加 `relationCount` 与 `relationVersion`（现硬编码 0，`scripts/db.ts:250`）。
- 前端缓存键纳入 `relationVersion`（遵循 `docs/06` 数据集版本 + 算法版本契约）。

#### 3.6.4 领域与应用层改造

- `Relation` 实体增加可选 `evidence` 字段（`src/domain/entities/Relation.ts`）；7 种枚举沿用不改。
- 新增 `ShardedRelationRepository` 实现 `RelationRepository.findByNodeId`（懒加载 + 内存/IndexedDB 双层缓存，模式参照 `ShardSearchIndex.ts:33-86`）。
- `RelationService` 改造：优先返回持久化关系；分片未就绪或无数据时回退现有即时 `generateFromNodes`（保底体验）。
- `composition-root.ts` 装配 `ShardedRelationRepository` → `RelationService`（现状创建了 RelationService 但未接仓库）。

#### 3.6.5 渲染与交互

- `GalaxyScene.focusNode` 的「同朝代前 50 节点」改为：按关系边目标节点定位（关系懒加载到达后补绘，渐入动画 300ms）。
- `EdgeRenderer` 增加类型 → 视觉常量表：师承赭石、友朋青碧、流派紫、影响银白、同朝代弱化（α≈0.25）；每边粒子数 = 基数 8 × weight 加权（现状每边 8 粒，`EdgeRenderer.ts:43-75`）。
- `PoetDetailPanel` 新增「文脉关系」区：类型分组徽标 + 计数 + 跳转；FR-WQ1-05 的证据展开。
- 散气模式不触发关系加载（性能约束）。

#### 3.6.6 工作量估算

| 模块 | 估算 |
| --- | --- |
| 挖掘管线（五类挖掘器 + 稀疏化 + 幂等） | 5 人日 |
| 存储迁移 + 导出分片 | 2 人日 |
| 前端仓储（分片懒加载 + 缓存） | 2 人日 |
| 边渲染类型化 | 3 人日 |
| 详情面板关系谱 | 2 人日 |
| 测试（单测 + 标注样例集） | 2 人日 |
| **合计** | **16 人日** |

---

## 4. WQ-2 主题漫游（P1）

### 4.1 背景与目标

产品叙事「观文气之聚散」目前依赖用户自由探索，缺少内容化的叙事入口。本项提供预置主题漫游：自动镜头飞行 + 解说串联诗人与星团，形成「有人讲解的星系纪录片」。复用现有聚焦动画、星团切换与相机控制，开发集中在剧本数据与播放状态机。服务画像 A（低门槛入门）与画像 C（课堂演示）。

### 4.2 用户故事

- 作为爱好者，我点开「千里共婵娟：中秋咏月」，镜头自动从张若虚飞到苏轼，字幕讲解，8 分钟看完一个主题。
- 作为教师，我在课堂播放「边塞风云」漫游，按步骤暂停讲解。
- 作为关注无障碍的用户，我开启 reducedMotion 时漫游步骤直接切换、不做飞行动画。

### 4.3 功能需求

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-WQ2-01 | 预置漫游 ≥ 6 条：中秋咏月、边塞风云、送别怀远、饮酒旷达、思乡望归、苏轼的朋友圈 | P0 |
| FR-WQ2-02 | 播放控制：开始/上一步/下一步/退出；Esc 退出；步骤进度指示 | P0 |
| FR-WQ2-03 | 步骤呈现：focus 步骤复用聚气收敛动画；cluster 步骤复用星团切换；字幕浮层显示解说；含 narration 时 TTS 朗读（复用 `RecitationSpeaker` 端口） | P0 |
| FR-WQ2-04 | 漫游模式：进入漫游隐藏维度滑块、搜索等干扰面板；漫游中禁用散气自动触发 | P0 |
| FR-WQ2-05 | 移动端适配：TourOverlay 窄屏布局，MobileNav 提供入口 | P1 |
| FR-WQ2-06 | 分享直达：分享 URL 支持携带漫游 ID，打开后进入漫游 | P2 |

### 4.4 非功能需求

- 漫游全程桌面 60fps；narration 朗读失败静默降级为字幕（不中断漫游）。
- 剧本文件懒加载（进入漫游时才拉取对应 JSON）。

### 4.5 验收标准

1. 6 条漫游可在桌面/移动端完整播放，Esc 可退出且星系恢复漫游前状态。
2. 步骤切换动画流畅，字幕与朗读同步推进（步骤时长取 max(设定时长, 朗读时长)）。
3. reducedMotion 开启时无镜头飞行，步骤即时切换。

### 4.6 技术方案

#### 4.6.1 剧本数据

```jsonc
// public/data/processed/tours/{tourId}.json
{
  "id": "mid-autumn-moon",
  "title": "千里共婵娟：中秋咏月",
  "description": "循着明月意象，从张若虚到苏轼",
  "steps": [
    { "type": "focus",   "refId": "poet:xxx", "durationMs": 8000,
      "caption": "张若虚以《春江花月夜》孤篇盖全唐", "narration": "……（可空）" },
    { "type": "cluster", "clusterKey": "SONG", "durationMs": 6000, "caption": "……" }
  ]
}
```

索引文件 `tours/index.json`（列表页用）。剧本为构建期产物 + 人工审核：新增 `scripts/build-tours.ts`，按主题词表经 `search.db` FTS 召回名篇、串联作者聚焦步骤生成初稿，人工排序定稿后进入 `public/data/processed/tours/`。

#### 4.6.2 应用层与表现层

- 新增 `TourUseCase`：`start(tourId) / next / prev / stop / subscribe`，状态机 `idle → loading → playing ⇄ paused → finished`，订阅式状态推送（模式参照 `RecitationUseCase` 的逐句状态机）。
- 步骤执行映射：focus → `FocusNodeUseCase.execute(refId)`；cluster → `SwitchClusterUseCase`；narration → `RecitationSpeaker`（`src/domain/ports/RecitationPorts.ts:13-19`）；相机跟随沿用聚焦相机逻辑。
- 新增 `tourStore`（zustand）：currentTour / stepIndex / playing；`uiStore` 增加漫游面板状态。
- 新增 `TourOverlay` 组件（字幕、进度点、控制按钮）；漫游中置 `galaxyStore` 散气自动触发为关闭（相机距离由漫游控制，规避 >100 距离阈值冲突）。
- **搭车项**：`RecitationUseCase` 装配进 `composition-root.ts`（现状未装配），为 narration 提供语音通道。

#### 4.6.3 工作量估算

| 模块 | 估算 |
| --- | --- |
| 剧本 schema + 构建脚本 + 6 条剧本人工定稿 | 4 人日 |
| TourUseCase + tourStore | 2 人日 |
| TourOverlay + 面板联动 + 移动端 | 3 人日 |
| TTS 串联与降级 | 1 人日 |
| **合计** | **10 人日** |

---

## 5. WQ-3 时间演化回放（P2）

### 5.1 背景与目标

「运气」维度已把时间编码进 X 轴，但星云是静态全体呈现。本项提供时间轴回放：拖动或播放时间轴，节点按诗人生年逐个点亮，观星云自先秦至清代逐代生长——最贴合「观文气之聚散」叙事的招牌功能。服务画像 B（时代脉络分析）与画像 C（教学演示）。

### 5.2 用户故事

- 作为研究者，我把区间拖到公元 760 年，看盛唐星团成形的过程，对比 1120 年（北宋末）的密度。
- 作为教师，我播放全程回放（60 秒）让学生直观感受「唐诗为何是高峰」。

### 5.3 功能需求

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-WQ3-01 | 时间轴组件：朝代色带 + 双手柄区间选择 + 播放/暂停/速度（1×/2×/4×） | P0 |
| FR-WQ3-02 | 增量显现：节点按诗人生年（缺失取所在朝代中值）逐个点亮，亮度渐入 0.6s | P0 |
| FR-WQ3-03 | 区间过滤：区间外节点隐藏且不可拾取、不参与聚焦；区间变更响应 ≤ 100ms | P0 |
| FR-WQ3-04 | 统计随动：时间轴显示当前区间诗人数/作品数 | P1 |
| FR-WQ3-05 | 交互约束：回放中禁用散气自动触发；退出回放恢复全部节点 | P0 |
| FR-WQ3-06 | 无障碍：reducedMotion 时跳过渐入动画直接切换 | P0 |

### 5.4 非功能需求

- 不新增构建期数据产物（节点已有朝代属性，生年从 `poets.birth_death` 解析，缺失回退朝代中值）。
- 降级渲染器（canvas2d/text）下功能可用（CPU 过滤路径）。

### 5.5 验收标准

1. 全程回放默认 ≤ 60 秒，可调速；播放中拾取、悬停、聚焦均正确排除不可见节点。
2. 区间拖动响应 ≤ 100ms（桌面 14181 节点全量）。
3. 退出回放后节点状态完全复位（沿用 `Galaxy.resetAllToIdle` 口径）。

### 5.6 技术方案

- **GPU 剔除（主路径）**：渲染体 `THREE.Points` 注入自定义着色（ShaderMaterial 或 onBeforeCompile）：顶点 attribute `aBirthYear` 与 uniform `uFrom/uTo` 比较，区间外 alpha 置 0；拾取体 InstancedMesh 对区间外实例用零缩放矩阵隐藏。避免 CPU 重建 Buffer。
- **降级路径**：`rendererType` 为 canvas2d/text 时走 CPU 过滤重建 Buffer（1.4 万节点 CPU 可承受）。
- **领域与应用层**：`Galaxy` 聚合新增 `setVisibleRange(yearFrom, yearTo)`（沿用 `setNodeState` 批量状态模式）；新增 `TimeTravelUseCase`（setRange / play / pause / setSpeed）与 `timelineStore`（播放状态、当前区间、速度）。
- **联动**：ParticleSystem 星云粒子密度随可见节点数调节；回放中禁用散气自动触发（同 WQ-2 的冲突规避策略）。
- **UI**：时间轴组件复用 `DynastyLegend` 的朝代配色常量（`GalaxyScene.ts:13-17` 同源色表）。

#### 5.6.1 工作量估算

| 模块 | 估算 |
| --- | --- |
| 着色器剔除 + 降级路径 | 3 人日 |
| TimeTravelUseCase + timelineStore + Galaxy 扩展 | 2 人日 |
| 时间轴组件 + 统计随动 | 2 人日 |
| 测试与无障碍适配 | 1 人日 |
| **合计** | **8 人日** |

---

## 6. WQ-4 语义检索（P3）

### 6.1 背景与目标

现有检索三通道覆盖「记得字面」的场景；「只记得意境」（搜「孤寂」「豪迈」）无法命中。本项在 FTS5 之外增加意境标签检索通道，与现有结果融合。服务画像 A（模糊探索）。

### 6.2 用户故事

- 作为爱好者，我在搜索框输入「孤寂」，得到《登幽州台歌》《江雪》等意境匹配作品，结果带「意境」徽标。

### 6.3 功能需求

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-WQ4-01 | 意境标签检索：内置 ~120 个意境标签（孤寂/豪迈/田园/边塞/离别/思乡/咏物/节令……），搜索意境词返回标签匹配作品 | P0 |
| FR-WQ4-02 | 融合排序：全文通道命中优先，语义通道补齐；语义命中带「意境」徽标并展示命中标签 | P0 |
| FR-WQ4-03 | 降级：语义通道异常静默回退现有三通道（沿用 WASM 降级模式） | P0 |
| FR-WQ4-04 | 体积预算：新增语义分片 ≤ 3MB，懒加载不计首屏 | P0 |

### 6.4 非功能需求

- 标签词表为人工维护数据文件（可解释、可审核）；构建期打分确定性可复现。

### 6.5 验收标准

1. 搜「孤寂」返回意境匹配作品且带徽标；检索 P95 ≤ 200ms（分片已缓存时）。
2. 语义分片总体积 ≤ 3MB；语义通道人为置障后检索功能不中断。

### 6.6 技术方案（两阶段取舍）

**阶段一（本项实施）：意境标签倒排。**

- 标签词表 `data/processed/semantics/labels.yaml`：每标签含同义词（查询入口）与特征词表（打分依据），例：孤寂 → 特征词 [孤， 独， 寂， 寥， 霜， 寒， 客， 断肠…]。
- 新增 `scripts/build-semantic-index.ts`：逐作品按特征词 TF 打分（标题命中 ×3），取 Top-3 标签；产出按诗人 16 分片倒排（分片内 `{label: [[诗人字典序号, 作品局部序号]…]}`，复用检索字典与分桶策略）。
- 领域端口新增 `SemanticSearchPort`；`SearchUseCase` 增加第四通道：查询词归一（复用 `t2s`）→ 标签同义词命中 → 倒排召回 → 与全文结果融合（标题/正文命中优先，沿用现有优先级）。

**阶段二（开放问题，不在本项实施）：真向量方案。** 取舍说明：34.5 万作品 × 512 维 int8 ≈ 176MB 前端不可接受；若仅预计算标签质心向量做锚点召回，则实质退化为标签方案加权。故向量检索性价比低，待「服务端 PostgreSQL 模式」（AGENTS.md 预留选项，pgvector）立项后再评估。

#### 6.6.1 工作量估算

| 模块 | 估算 |
| --- | --- |
| 标签词表编制与审核 | 2 人日 |
| 构建脚本 + 分片导出 | 2 人日 |
| SemanticSearchPort + SearchUseCase 融合 | 3 人日 |
| 测试 | 1 人日 |
| **合计** | **8 人日** |

---

## 7. WQ-5 后备能力清单（P3+）

各后备项给出目标、方案要点与预估规模，随里程碑搭车或另行立项。除 7.3 外均已完成落地，下表补充状态与实现落点。

| 编号 | 名称 | 方面 | 方案要点 | 规模 | 状态与实现落点 |
| --- | --- | --- | --- | --- | --- |
| 7.1 | 评分透明化 | 二·分析 | 详情面板展开三气评分构成卡——`scores` 表已存 factors 明细 JSON（`db-core.ts:98-105`），纯前端展示 | 1 人日 | 已完成 · `PoetDetailPanel.tsx` 评分构成卡 |
| 7.2 | 双诗人对比 | 二·分析 | 同时聚焦两节点时叠加双方关系网络与三气雷达对比；依赖 WQ-1 关系数据 | 3 人日 | 已完成 · `PoetComparison.ts` + `ComparePanel.tsx` |
| 7.3 | AI 导览与对诗 | 三·交互 | LLM 服务端代理，与「诗人」对话、飞花令小游戏；需服务端与 API 成本预算，另行立项 | 未估 | 暂缓 · 待 LLM 预算与立项 |
| 7.4 | 朗诵节奏可视化 | 三·交互 | 音频波形数据驱动星辰脉动（ParticleSystem flow 层振幅调制）；依赖朗诵链路装配完成（M2） | 3 人日 | 已完成 · `WorkRecitation.tsx` + `pulseBus.ts` |
| 7.5 | 个性化星单 | 三·交互 | localStorage 收藏诗人组成自定义星团，一键聚焦星单成员；沿用 `PersistViewUseCase` 持久化模式 | 2 人日 | 已完成 · `FavoritePoetsUseCase.ts` + `StarList.tsx` |
| 7.6 | 每日一诗 | 三·交互 | 构建期生成年度日历数据（节气/节日联动名篇），首页推荐卡 | 2 人日 | 已完成 · `scripts/build-daily-poems.ts` + `DailyPoemCard.tsx` |
| 7.7 | 诗词卡片海报 | 四·传播 | Canvas 合成星系截图（`CaptureScreenshotUseCase`）+ 诗句 + 二维码，导出 PNG 适配社交分享 | 3 人日 | 已完成 · `Share.tsx` 1080×1440 PNG 导出 |
| 7.8 | 星图视图分享增强 | 四·传播 | 分享 URL 增补时间区间与语义搜索态（依赖 WQ-3/WQ-4），接收方复现完整视图 | 1 人日 | 已完成 · `GenerateShareLinkUseCase.ts` 增补 `yr`/`q` 参数 |
| 7.9 | 家乡地理入库 | 一·数据 | `poet-hometowns.json` 写回 `poets` 表新增 `hometown` 字段，详情面板展示；行迹地图为远期独立项 | 1 人日 | 已完成 · `hometown` 入库 + `geoLayout.ts` 地理投影 |
| 7.10 | WASM 算力下沉 | 五·底座 | 化用 5-gram 检测、韵部归组移入 `wenqi-core`（Rust 新增 philology 模块），管线经 Bun 调用提速 | 4 人日 | 已完成 · Rust `philology` + `infrastructure/wasm/philology.ts` |
| 7.11 | 性能与规模 | 五·底座 | 节点渲染体着色器合并、检索 Worker 化、LOD 阈值接入配置；持续项 | 未估 | 已完成 · `NodeStarLayer.ts`、`SearchWorkerClient.ts`、`lod.ts`（持续演进） |
| 7.12 | 配置接线与技术债 | 五·底座 | `ConfigLoader` 实际解析 `application.yml`（或删繁就简移除 yml）；`docs/06` 分片章节与实现对齐 | 1 人日 | 已完成 · `ConfigLoader` 解析 `application.yml` |

---

## 8. 里程碑依赖与实施顺序

```
M1: WQ-1 ────────────┐
                      ├─→ M3: WQ-3 ─→ M4: WQ-4
M2: WQ-2（可与 M3 并行）┘
```

- WQ-1 为 P0 且是 7.2（对比）、7.7（海报中的关系展示）等后续项的数据地基，必须先行。
- WQ-2 与 WQ-3 相互独立，M2/M3 可并行推进；WQ-2 内的 RecitationUseCase 装配是 7.4（朗诵节奏可视化）的前置。
- 全部扩展项不改变「SQLite 唯一真相源」架构；前端新增数据一律走「构建期导出 + 懒加载分片」既有模式。

## 9. 全局度量

| 类别 | 指标 | 目标 |
| --- | --- | --- |
| 内容 | 关系边数 / 关系覆盖率（有关系边的诗人占比） | 5 万–25 万条 / ≥ 60% |
| 内容 | 意境标签覆盖（有标签作品占比）/ 预置漫游数 | ≥ 90% / ≥ 6 条 |
| 体验 | 帧率（桌面 / 移动） | 60fps / 30fps 维持不回退 |
| 体验 | 聚焦动画 P95 / 检索 P95 | ≤ 1.1s / ≤ 200ms |
| 体积 | 新增懒加载分片总量 | ≤ 15MB（relations ≤12MB + semantics ≤3MB） |
| 质量 | 单测覆盖率 / 标注样例准确率 | 维持 70/65/60/70 阈值 / ≥ 85% |

## 10. 风险与开放问题

### 10.1 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 化用检测误报（常语重合） | INFLUENCE 边可信度低 | 高频 gram 过滤 + 阈值 + 100 条标注样例抽检；UI 标注「算法推断」 |
| 关系数据体量超预期 | 前端加载与内存压力 | Top-30 稀疏化硬上限 + 16 分片懒加载 + IndexedDB 缓存 |
| TTS 古诗文断句生硬 | 漫游体验打折 | narration 按短句切分 + 复用逐句朗读状态机；TTS 失败静默回退字幕 |
| GPU 剔除兼容性 | 低端设备渲染异常 | canvas2d/text 渲染器 CPU 过滤降级路径（rendererType 已有降级体系） |
| 标签词表主观性 | 语义检索结果偏差 | 词表独立数据文件可审核；结果徽标展示命中特征词，可解释 |
| cnkgraph 开放接口不稳定 | 家乡数据不完整 | 已有缓存与限流重试机制（并发 1、间隔 1200ms、重试 8 次）；入库动作离线进行，不阻塞构建 |

### 10.2 开放问题

1. **师承与社会关系数据源**：并称/流派依赖内置词表，覆盖率有限。`data/raw` 已有 `cbdb-sqlite-latest.zip`（CBDB 唐宋人物传记数据库），是否引入补充师承/社会关系？建议 WQ-1 上线后按关系覆盖率缺口评估。
2. **向量检索**：见 §6.6 阶段二取舍，待服务端 PostgreSQL 模式立项再评估（pgvector）。
3. **ANTHOLOGY 关系类型**：待选本元数据（部分数据源含集名）具备后启用，规则同并称挖掘。
4. **行迹地图**：家乡入库（7.9）后，诗人一生地理行迹需要轨迹类数据源，远期独立立项。

---

## 附录 A：术语表

| 术语 | 含义 |
| --- | --- |
| 聚气 | 聚焦诗人节点，相关节点与关系向其收敛的交互 |
| 散气 | 相机拉远后节点聚合为朝代气团的浏览模式 |
| 三气 | 才气（Y）、人气（Z）、运气（X）三维评分体系 |
| 关系谱 | 诗人详情面板中按类型分组的关系列表 |
| 漫游剧本 | 主题漫游的步骤化 JSON 剧本（步骤 = 聚焦/星团/文案/时长） |
| 意境标签 | 预置主题/情感标签体系，用于语义检索 |
