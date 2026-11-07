# 更新日志（CHANGELOG）

本项目遵循 [CalVer（日历版本）](https://calver.org/) 版本规范：`YYYY.MM.DD.MICRO`（年.月.日.迭代号）。

---

## [2026.11.05.2] - 0.5.9

### ✨ New Features  新增功能

- 【E2E 固化】新增 E2E 幂等验证脚本 `scripts/verify-e2e.ts`（入口 `bun run verify:e2e`）：环境预检（依赖 / 数据底座 / 系统 Chrome / 用例目录）→ 幂等清理（终止 3000 端口残留 dev server、清空 `e2e-report/` 与 `test-results/`）→ Playwright 全量 E2E（实时回显）→ 解析用例结果并生成 Markdown 验证报告（`e2e-report/verify-<时间戳>.md`），支持参数透传（`--project` / `--headed` / `-g`）

### 📚 Docs 文档更新

- 新增 `docs/11-E2E验证指南.md`：快速开始、前置条件、幂等性设计、四阶段流程、覆盖范围、报告与退出码解读、常见问题排查、新增用例的幂等约定
- `docs/08-测试策略文档.md` §9 补充已落地测试命令表并交叉引用 11 号指南，§11 变更记录更新

### 🧪 Tests  测试

- 幂等性实测：连续两轮全量验证均 5/5 通过（50 秒 / 48 秒）；第二轮预置「残留 dev server 占用 3000 端口」脏状态，脚本正确终止残留进程（PID 5224）并以最新代码重启服务后通过，验证幂等保障有效

---

## [2026.11.05.1] - 0.5.8

### ✨ New Features  新增功能

- 【站点图标】补齐网站图标，消除控制台唯一的 `/favicon.ico` 404：新增 `src/app/icon.svg`（矢量版：深空圆底 + 唐金星核 + 十字星芒 + 宋蓝轨道环与伴星点，呼应「文气星系」主题与王朝配色）；新增 `scripts/generate-favicon.ts` 确定性生成 `src/app/favicon.ico`（16/32 双层 Windows DIB，逐像素着色，与 SVG 同一视觉语言）
- 依托 Next.js App Router 图标文件约定自动注入 `<link rel="icon">`：现代浏览器使用 SVG，Safari 与旧环境回落 ICO，两条路径均返回 200

### 🧪 Tests  测试

- 验证：`/favicon.ico` 与 `/icon.svg` 均 200（`image/x-icon` / `image/svg+xml`）；ICO 经 Windows System.Drawing 加载解析合法
- 回归：galaxy e2e 用例通过（8.6s），控制台不再出现 404 异常

---

## [2026.11.05.0] - 0.5.7

### 🐛 Bug Fixes  问题修复

- 【移动端】修复底部导航依次打开「维度 / 分享 / 设置」后面板叠加显示、分享面板拦截搜索结果点击的问题：`uiStore` 四个面板开关原完全独立、无互斥逻辑，现改为打开任一面板时自动关闭其余面板（搜索 / 维度 / 分享 / 无障碍统一互斥，桌面端与移动端共同受益）

### 🧪 Tests  测试

- `uiStore` 单元测试新增 3 条互斥断言（打开无障碍关闭分享、打开维度关闭分享、打开分享关闭维度），9/9 通过
- 全量回归：Playwright E2E 5/5 通过（desktop-chrome 3 条 + mobile-chrome 1 条 + no-webgl 1 条，约 1.5 分钟）；Vitest 全量 51 个文件 346 条用例全部通过
- 修复前 mobile 用例因分享面板（`z-50`）叠加在搜索结果上方拦截点击，耗尽 300 秒超时失败；修复后该用例 7.8 秒通过

---

## [2026.11.04.5] - 0.5.6

### 🐛 Bug Fixes  问题修复

- 【移动端】修复底部导航「维度 / 分享 / 设置」按钮点击无效果：三个面板的触发按钮与面板本体原同处 `hidden sm:block` 容器，移动端整容器隐藏导致面板打开后仍不可见；现将响应式隐藏下沉到触发按钮，面板容器在移动端正常渲染

### 🧪 Tests  测试

- 新增 Playwright E2E 套件（`playwright.config.ts` + `e2e/`），按 docs/08 §7.5 关键场景组织；复用本机 Chrome（`channel: 'chrome'`，不下载浏览器），分 `desktop-chrome` / `mobile-chrome`（Pixel 5）/ `no-webgl` 三个 project
- 5 条用例覆盖：星系核心闭环（初始化 14,181 节点 / 搜索「李白」/ 三气评分与评分构成 / 关系图谱 / 行迹地图 / 收藏星单 / ESC 取消聚焦）、交互与视图（每日一诗跳转、双诗人对比雷达与关系叠加、分享链接参数与诗词卡片 PNG 下载、分享链接还原搜索与聚焦、时间轴播放/暂停/复位与区间统计、维度预设、地理模式覆盖率、无障碍字体与高对比度）、主题漫游（选剧本 / 播放 / 翻步 / 暂停继续 / 退出）、移动端（底部导航四项 + 维度·分享·设置面板 + 详情抽屉）、渲染降级（禁用 WebGL 与 Canvas 后降级文字模式）
- 新增 `test:e2e` 脚本（`playwright test`），`e2e-report/`、`test-results/` 纳入 `.gitignore`
- 全量 5/5 通过（约 1 分钟，满足 docs/08「E2E < 3 分钟」要求）
- 注：控制台唯一 404 为 `/favicon.ico` 缺失（项目未提供站点图标），不影响业务功能，记为已知问题待补


## [2026.11.04.4] - 0.5.5

### ✨ New Features  新增功能

- 【行迹地图】需求落地：在诗人详情面板新增「概览 / 行迹 / 关系图谱」三标签页（融入既有 3D 星系体系，不做独立路由）；行迹标签展示诗人一生游历 / 贬谪 / 任职等地理轨迹
- 【行迹地图】新增 `JourneyMap` 2D SVG 等距圆柱投影组件：复用中国轮廓底图（`geo/china.json`），渲染行迹折线（渐变）、按类型上色的编号停靠点（出生 / 卒地标色放大）、图例与阶段时间轴，hover 时间轴联动高亮
- 【行迹地图】新增代表性诗人精选数据集 `journeys.json`（19 位诗人、136 个行迹阶段，覆盖李白、杜甫、苏轼、王维、白居易、李清照、辛弃疾、陆游、李商隐、孟浩然、王昌龄、高适、岑参、韩愈、柳宗元、欧阳修、屈原、陶渊明、纳兰性德），由 `scripts/build-journeys.py` 离线确定性生成（schema 预留 `extensible` 位以便后续回填编年系地）
- 【关系体系】新增 `RelationGraph` 2D 径向布局图谱：中心为聚焦诗人（「我」），周边关联诗人按角度均布；关系按四类分组上色——师承 / 好友 / 社会关系（同乡·影响·同朝代）/ 其余——边宽随权重；hover 看详情、点击聚焦关联诗人
- 【关系体系】新增 `relationCategories` 共享分类模块（`TYPE_TO_CATEGORY` 映射与 `CATEGORY_META` 配色），统一关系四类上色口径
- 【数据接入】`DataLoader` 新增 `Journey` / `JourneyStage` 类型（自 `JourneyMap` 迁移，规范领域分层）与 `loadJourneys()`；详情面板按诗人姓名经 `toSimplified` 繁简归一匹配行迹数据（解决 `poets.json` 繁简混排问题，已核实 11 个相关繁体字形映射齐全）
- 【地理底图修复】修复 `public/data/geo/china.json` 缺失问题（此前被忽略且从未落地，导致既有 3D 地理模式轮廓也画不出）：新增 `scripts/fetch-china-geo.py` 从阿里云 DataV 公共端点拉取全国轮廓，按 `[71,136]×[17,54]` 裁剪（Sutherland–Hodgman），保留大陆 + 海南 + 台湾、剔除南海诸岛等远洋要素，行迹地图与地理模式共用该底图

### 🧪 Tests  测试

- 全量类型检查 `tsc --noEmit` 0 错误；`eslint src` 0 错误（剩余 warning 均为项目既有 `no-explicit-any`，与本改动无关）
- 数据坐标校验：行迹点与裁剪后中国轮廓均落于投影窗 `LNG[70,137] LAT[16,55]` 内
- ⚠️ `next build` 因沙箱拦截 `.next` 删除未执行，建议本地 `bun run dev` / `build` 做目视确认
- 注：`public/data/` 按既有约定被 `.gitignore` 忽略，为可复现生成产物；`journeys.json` 与 `china.json` 分别由 `scripts/build-journeys.py`、`scripts/fetch-china-geo.py` 复现，不随源码入库


## [2026.11.04.3] - 0.5.4

### 📈 Improvements 性能/体验优化

- 【渲染性能】docs/10 §7.11：新增 `NodeStarLayer` 把节点层与星空层合并为同一 `Points` 几何体与同一套 glow 着色器，draw call 由 2 降为 1；着色器新增 `aTemporal` / `aOpacity` / `uStarVisible`，合并后仍分别保留时间裁剪、LOD 透明度与地理模式星空隐藏
- 【渲染性能】节点属性更新按区间上传：悬停高亮只上传节点颜色区间，呼吸动画只上传节点位置/尺寸区间，星空漂移只上传星空区间，避免整块缓冲反复上传
- 【检索】docs/10 §7.11：新增 `search.worker` 与 `SearchWorkerClient`，全文 + 语义 + WASM 检索全链路移入 Web Worker，主线程仅接收结果；Worker 构造失败、异常或超时（8s）自动回退主线程并终止 Worker
- 【LOD】docs/10 §7.11：LOD 阈值接入 `application.yml`（`lodThresholds: [50, 200, 800]`），新增 `lod.ts` 按相机距离输出四档尺寸/透明度倍率，仅档位变化时写入 uniform；`divergenceThreshold` 同步改为配置读取

### 🧪 Tests  测试

- 新增 `lod` 5 例（档位边界与倍率映射）、`SearchWorkerClient` 3 例（正常返回、错误回退并终止、构造失败回退）
- 全量 51 文件 / 343 例通过；`tsc --noEmit` 无错误；eslint 0 error
- 浏览器验证：星系与地图模式切换时星空正确隐显；检索「李白」首条为诗人李白，检索分片与 WASM 均在 Worker 内加载；聚焦聚气、关系流粒子与时间轴统计正常；控制台无 shader 错误


## [2026.11.04.2] - 0.5.3

### ✨ New Features  新增功能

- 【时间轴统计】FR-WQ3-04：新增 `TimelineStats` 纯领域服务（`buildTimelineStats` / `countTimelineRange`），时间轴头部实时展示当前区间「诗人 N · 作品 N」
- 【朗诵节奏】docs/10 §7.4：新增 `pulseBus` 轻量发布订阅与 `WebAudioTrackPlayer` AnalyserNode RMS 采样，朗诵播放时按音频波形驱动星系节点与星尘呼吸脉动；`GlowMaterials` 新增 `uPulse`、`GalaxyScene.setRecitationPulse` 与 `ParticleSystem.setPulseLevel` 接收脉动
- 【WASM 算力下沉】docs/10 §7.10：Rust `wenqi-core` 新增 `philology` 模块（`extractGrams` / `rhymeFoot` / `groupByRhyme`），提供 5-gram 提取、韵脚尾字与韵部归组；新增 `infrastructure/wasm/philology` 懒加载封装，WASM 不可用时自动回退纯 JS 实现；`mine-relations` 管线改用该服务提取 n-gram
- 【双诗人对比】docs/10 §7.2：新增 `PoetComparison` 纯领域服务（关系网叠加分组、三气归一化、雷达顶点计算）；新增「双诗人对比」面板，展示主/对比诗人三气雷达、逐维数值与作品数，并按「共同关联 / 各自独有」分组罗列关系；星图同步叠加对比诗人关系流（金色表示共同关联），关闭后恢复主诗人关系网
- 【每日一诗】docs/10 §7.6：新增 `build-daily-poems` 构建脚本，按元旦与二十四节气标题锚点 + 人气候选池生成全年 366 天不重复的 `daily-poems.json`；新增 `DailyPoem` 领域取值逻辑（闰日回退 02-28）与首页左下「每日一诗」推荐卡，支持当日关闭与一键在星图中查看
- 【数据管线】新增 `data:daily` 脚本并接入 `data:all` 末端

### 🧪 Tests  测试

- 新增 `TimelineStats` 5 例、`pulseBus` 5 例、`PoetComparison` 5 例、`DailyPoem` 4 例、`build-daily-poems` 5 例、Rust `philology` 4 例与 `philology` 前端封装 4 例
- 全量 49 文件 / 335 例通过；`tsc --noEmit` 无错误；eslint 0 error
- 浏览器验证：时间轴头部显示「诗人 14,181 · 作品 345,562」；每日一诗卡片展示《種桂》/方岳·宋 并能跳转诗人详情；双诗人对比（方岳 / 杜甫）展示三气雷达与「共同 10 · 独有 327」关系分组；控制台无错误


## [2026.11.04.1] - 0.5.2

### ✨ New Features  新增功能

- 【地理模式】引入中国轮廓 GeoJSON 底图线条：新增 `public/data/geo/china.json` 静态资源与 `buildGeoOutlineVertices` 纯函数，首次进入地理模式时懒加载并缓存顶点，切回星系后再次进入无需重新请求；轮廓线条略高于网格平面绘制，避免共面闪烁
- 【地理模式】经纬网格透明度由 `0.22` 提升至 `0.45`，增强底图判读
- 【地理模式】弱化氛围干扰：隐藏星尘粒子、气流与雾气层，并隐藏三轴坐标；切回星系模式后自动恢复
- 【地理模式】新增籍贯覆盖率说明：信息面板显示「有籍贯坐标诗人 / 诗人总数（百分比）」，并注明未标注籍贯的诗人不参与地图投影（当前 1,682 / 14,181，11.9%）

### 🧪 Tests  测试

- 新增中国轮廓 GeoJSON 展平单测：覆盖 Polygon 环闭合、MultiPolygon、MultiLineString、非法输入与轮廓高度约束
- 全量 43 文件 / 307 例通过；`tsc --noEmit` 无错误；eslint 0 error
- 浏览器验证：地图模式可见中国轮廓与经纬网格，星尘与三轴坐标已隐藏；覆盖率文案正常展示；切回星系模式后星尘与坐标恢复；控制台无错误


## [2026.11.04.0] - 0.5.1

### 🐛 Bug Fixes  问题修复

- 【评分透明化】WQ-5 / §7.1：修复 `Galaxy` 向 `PoetDetailPanel` 仅传递基础诗人信息、未合并 `selectedPoet.score` 的问题，三气评分与「评分构成」卡现可正常展示
- 【检索排序】修复搜索诗人名时同名作品（如宋人诗作《李白》）占据首条的问题：诗人名全等命中现始终优先于同名作品，键盘选中第一条即打开诗人本体

### 🧪 Tests  测试

- 浏览器逐项验证：李白详情显示三气评分 26/100/40，展开评分构成可见全部因子与算法版本 `v1.1`；收藏切换、星单持久化与一键聚焦正常；分享链接包含相机位姿、`focus`、`q`，接收方还原搜索态、详情与相机；携带 `yr=618,907` 时时间轴正确还原；诗词卡片成功导出 1080×1440 PNG，控制台无错误
- 搜索「李白」首条结果为「李白 · 唐 · 诗人」，`ArrowDown + Enter` 打开李白详情而非徐鈞
- 全量 43 文件 / 303 例通过；`tsc --noEmit` 无错误；eslint 0 error


## [2026.11.03.7] - 0.5.0

### ✨ New Features  新增功能

- 【评分透明化】WQ-5 / docs/10 §7.1：`ScoreData`、`ScoreDTO`、`ScoreItem` 贯通三气评分 `factors` 明细；诗人详情面板新增可展开「评分构成」卡，按才气/人气/运气分组展示词汇独特性、意象新颖度、后世引用、时代机遇等因子原始分与算法版本
- 【分享增强】WQ-5 / §7.8：`GenerateShareLinkUseCase` 支持时间区间与搜索词，分享 URL 增补 `yr`、`q` 参数，`parseFromUrl` 同步解析；`Share` 改用组合根用例并补充相机注视点 `tx/ty/tz`；星系加载后按分享参数还原时间过滤、搜索态、聚焦与相机位姿
- 【个性化星单】WQ-5 / §7.5：新增 `FavoritePoetsUseCase`（localStorage 收藏、切换、移除、清空、订阅通知）并装配组合根；新增「我的星单」面板支持一键聚焦收藏诗人，诗人详情面板增加收藏星标
- 【诗词卡片海报】WQ-5 / §7.7：分享面板新增「诗词卡片」导出，Canvas 合成星系截图、作品标题、诗人朝代、诗句与复现该视图的二维码，输出 1080×1440 PNG；新增 `qrcode` 依赖并动态加载避免首屏体积增加

### 🧪 Tests  测试

- 新增 `FavoritePoetsUseCase` 5 例（空存储、收藏切换、移除清空、订阅通知、损坏数据回退）
- `GenerateShareLinkUseCase` 追加 2 例（时间区间与搜索态参数生成、URL 解析还原）；`GetPoetDetailUseCase` 追加 `factors` 透传断言
- 全量 43 文件 / 302 例通过；`tsc --noEmit` 无错误；eslint 0 error


## [2026.11.03.6] - 0.4.0

### ✨ New Features  新增功能

- 【语义检索】WQ-4 阶段一「意境标签倒排」落地（docs/10 扩展项 P3）：新增 `data/processed/semantics/labels.yaml` 人工维护词表（120 个标签，含同义词与特征词），`scripts/build-semantic-index.ts` 逐作品按特征词 TF 打分（标题命中 ×3），取 Top-3 且达阈值标签
- 【语义检索】构建产物 `public/data/processed/semantics/`：`labels.json`（查询入口）、16 个倒排分片、独立语义版本 manifest；分片与 `search/shard-k.json` 同分桶同顺序，只存增量作品序号，构建期逐条对齐校验，总体积 2.04MB（≤3MB 预算）
- 【语义检索】`SearchUseCase` 新增第四通道：全文命中优先、语义补齐，语义结果附 `matchedLabels`；索引异常时静默降级，不影响现有三通道
- 【语义检索】`Search.tsx` 语义命中展示「意境」徽标与命中标签；`ShardSemanticIndex` 首次搜索并行懒加载语义分片，检索分片按需回读并复用 DataLoader 缓存
- 【语义检索】新增 `data:semantic` 管线并接入 `data:all`（位于 `data:search` 之后）

### 🧪 Tests  测试

- 新增 `ShardSemanticIndex` 8 例（标签名/同义词命中、增量解码、多标签排序、limit、单字与未命中、分片异常抛出）与构建纯函数 11 例（词表校验、标题×3 加权、阈值与 Top-3、分桶与版本）
- `SearchUseCase` 追加 3 例（语义补齐带标签、全文去重优先、语义异常静默降级）
- 全量 42 文件 / 295 例通过；`tsc --noEmit` 无错误；eslint 无 error
- 浏览器验证：`localhost:3000` 搜索「孤寂」返回意境作品并显示「意境」徽标与命中标签，控制台无错误


## [2026.11.03.5] - 0.3.1

### 📈 Improvements  性能/体验优化

- 【朗读】`RecitationUseCase` 装配进 `CompositionRoot`（与 `SpeechSynthesisAdapter` 一并构造），`WorkRecitation` 改为从组合根获取实例，消除组件内重复装配

### 🧪 Tests  测试

- 全量 40 文件 / 273 例通过；`tsc --noEmit` 无错误；eslint 无 error
- 浏览器验证：诗人详情 → 作品 → 「朗读」可正常进入朗读态并显示「停止」，「暂停朗读」状态切换正常


## [2026.11.03.4] - 0.3.0

### ✨ New Features  新增功能

- 【时间演化】WQ-3 时间演化回放落地（docs/10 扩展项 P2）：新增 `TimeTravelUseCase` 状态机（选区/播放/暂停/倍速 1×2×4/退出）与 `timelineStore`，播放头按 `[fromYear, currentYear]` 驱动可见范围；`Timeline` 组件提供朝代色带 + 双手柄区间选择 + 播放控制
- 【时间演化】节点生年链路：`DynastyCode` 新增 `DYNASTY_YEAR_RANGES` 与 `getDynastyMedianYear`；`NodeDTO`/`DataLoader.Node` 新增 `birthYear`，由 `InitializeUseCase` 从诗人 `birthDeath.startYear` 补齐，缺失时回退朝代中值，不新增构建期数据产物
- 【时间演化】WebGL 主路径在 `GlowMaterials` 顶点着色器加入 `aYear` 属性与 `uYearFrom/uYearTo/uFadeYears` uniform，范围外节点裁出裁剪空间，渐入按 0.6 秒（reducedMotion 时直接切换）
- 【时间演化】交互约束：区间外节点不可拾取/不可聚焦、关系流与悬停同步过滤；回放中禁用散气自动触发，退出回放恢复全量节点；与主题漫游互斥
- 【时间演化】降级渲染器：`Canvas2DEngine`/`TextFallbackEngine` 走 CPU 年份过滤，canvas2d/text 模式下时间轴仍可用

### 🧪 Tests  测试

- 新增 `TimeTravelUseCase` 11 例（选区激活、倒置交换、1×/4× 播放时长、非法倍速忽略、暂停保持、播放中调整区间、退出复位、空区间不启动、订阅推送）与 `DynastyCode` 年份范围/中值 2 例
- 全量 40 文件 / 273 例通过；`tsc --noEmit` 无错误；eslint 无 error


## [2026.11.03.3] - 0.2.2

### ✨ New Features  新增功能

- 【主题漫游】WQ-2 分享直达（FR-WQ2-06）：`GenerateShareLinkUseCase` 新增 `generateTourLink` / `parseTourIdFromUrl`，URL 携带 `?tour=<漫游ID>` 打开后自动进入对应漫游（等星系数据就绪后启动），剧本不存在时回退打开漫游列表
- 【主题漫游】字幕卡片新增「分享」按钮，复制携带漫游 ID 的直达链接并给出「已复制」反馈；播放控制行改为可换行，窄屏下不再溢出

### 🧪 Tests  测试

- 新增分享直达 3 例单测（链接生成 / 解析 / 无参数返回 null）；全量 39 文件 / 260 例通过；`tsc --noEmit` 无错误；eslint 无 error
- 浏览器验证：`?tour=mid-autumn-moon` 自动进入漫游并显示 1/5 进度、分享按钮反馈正常；390×844 移动端视口下字幕卡片左右边界 16–374，无横向溢出，控制按钮单行可见


## [2026.11.03.2] - 0.2.1

### ✨ New Features  新增功能

- 【主题漫游】WQ-2 主题漫游落地（docs/10 扩展项 P1）：新增 `scripts/build-tours.ts`（`bun run data:tours`）按姓名繁简归一解析诗人 ID，生成 6 条预置剧本（中秋咏月 / 边塞风云 / 送别怀远 / 饮酒旷达 / 思乡望归 / 苏轼的朋友圈）与索引 `public/data/processed/tours/index.json`，剧本按需懒加载；`data:all` 管线同步接入
- 【主题漫游】新增 `Tour` 领域值对象（剧本结构校验 + 索引摘要）与 `TourRepository` 端口，`JsonTourRepository` 负责剧本 JSON 懒加载与内存缓存
- 【主题漫游】新增 `TourUseCase` 播放状态机（idle → loading → playing ⇄ paused → finished）：步骤自动推进，含 narration 时取 max(设定时长, 朗读时长)，支持上一步/下一步/暂停/继续/退出；TTS 复用 `RecitationSpeaker` 端口，不支持时静默降级为字幕
- 【主题漫游】新增 `TourOverlay` 字幕浮层（剧本选择列表、进度点、播放控制、Esc 退出）；`InfoPanel` 与 `MobileNav` 新增「主题漫游」入口
- 【主题漫游】漫游模式联动 `GalaxyScene`：focus 步骤复用聚气收敛动画、cluster 步骤复用星团镜头；漫游中隐藏搜索/维度/分享/图例/详情面板，并禁用散气自动触发，退出后星系恢复原状；reducedMotion 下镜头与收敛动画即时完成

### 🧪 Tests  测试

- 新增 `Tour` 值对象测试 6 例、`TourUseCase` 播放状态机测试 9 例（自动推进、朗读等待、暂停恢复、退出清理、朗读降级）
- 全量 39 文件 / 257 例通过；`tsc --noEmit` 无错误；eslint 无 error


## [2026.11.03.1] - 0.2.0

### ✨ New Features  新增功能

- 【关系网络】WQ-1 关系网络深化落地（docs/10 扩展项 P0）：新增构建期挖掘管线 `scripts/mine-relations.ts`——赠答友朋（标题动词模式 + 姓名/字/号索引）、并称流派（词表 + school 归组）、跨朝代化用影响（5-gram 朝代级滚动倒排 + 评注噪声过滤）、同朝代空间近邻（Top-20），共挖掘入库 **187556 条关系**（友朋 13319 / 师承 273 / 化用 2361 / 同门 55 / 同朝代 171548）
- 【关系网络】存储层新增 `relations` 表（证据 JSON 可溯源，`SCHEMA_VERSION 2` + v1 库就地迁移），`db:export` 按 source 诗人导出 16 关系分片（最大 372KB，懒加载），manifest 新增 `relationCount` / `relationVersion`
- 【关系网络】前端新增 `ShardedRelationRepository`（分片懒加载 + IndexedDB 缓存键含 relationVersion + 分片不可用回退即时生成）与 `GetPoetRelationsUseCase`，`composition-root` 完成装配
- 【关系网络】聚气交互类型化呈现：`EdgeRenderer.buildFromRelations` 按关系类型着色（师承赭石/友朋青碧/流派紫/化用银白/同朝代弱化）且粒子数随权重加权，关系懒加载到达后动态替换兜底气流（`GalaxyScene.setRelationFlows`，含聚焦动画竞态保护）
- 【关系网络】诗人详情面板新增「文脉关系」谱：类型徽标 + 权重排序 + 证据展开（赠答原题/共现片段）+ 点击对端诗人跳转聚焦；字号命中与算法推断关系统一标「推断」
- 【数据底座】籍贯数据入库：`poets` 表新增 `hometown` 列（schema v2 迁移），新增 `db.ts apply-hometowns` 子命令（`bun run db:hometown`）写回 cnkgraph 抓取的 30 位诗人籍贯，全链路（Poet 实体 → DTO → 详情面板）展示
- 【管线】`data:all` 管线插入 `data:relations` 阶段；`import_log` 新增 `relations_count` 审计字段（stage='relations' / 'hometowns'）

### 🧪 Tests  测试

- 新增 `tests/scripts/mine-relations.test.ts` 19 例：姓名索引/标题关系提取（含「姓+字」歧义与排行数字剔除）/gram 工具/化用挖掘（朝代级滚动、评注过滤、佚名与同名同朝代记录跳过）/空间近邻去重/合并稀疏化；vitest 新增 `bun:sqlite` 模块桩
- 全量 209 例通过；`tsc --noEmit` 无错误；eslint 无 error

### 📈 Improvements  性能/体验优化

- `EdgeRenderer`/`LabelRenderer` 动画随动改为按边目标节点 ID 匹配（支持每边粒子数不同与关系目标动态追加），取消聚焦回位逻辑覆盖动态追加节点
- `DataLoader` 新增 `loadVersionedJson`（独立于数据集版本的自定义版本缓存键）


## [2026.11.01.1] - 0.1.0

### ✨ New Features  新增功能

- 【检索服务】诗句全文检索落地（PRD F07）：`bun run data:search` 构建独立检索库 `data/search.db`（SQLite FTS5 trigram，BM25 排序 + 摘要高亮），并导出 16 个前端检索分片（约 29 MB，首搜懒加载 + IndexedDB 缓存）
- 【检索服务】新增 `scripts/db.ts search` 子命令，供 CLI 侧人工验证检索召回
- 【检索服务】前端新增 `ShardSearchIndex`（分片全文索引）与 `FullTextSearchPort` 端口，`SearchUseCase` 统一收口「WASM 通道 → 诗人名匹配 → 全文检索」三层组合，命中作品跳转所属诗人并触发聚气
- 【检索服务】简繁归一化：新增 `scripts/gen-t2s-table.ts`（OpenCC 权威数据 + 语料驱动映射子集 + 简体参照反向过滤），索引与查询词两侧同变换，简体查询可命中繁体古本语料（PRD F07-4 部分）
- 【文档】新增 docs/09-部署运行服务文档（运行形态、数据底座运维、构建部署、缓存策略、检索现状与决策记录、故障排查）

### 🐛 Bug Fixes  问题修复

- 【数据缓存】IndexedDB 数据缓存键加入数据集版本（读 manifest.json）：数据重新发布后旧缓存自动失效，修复检索索引等数据更新后前端解析旧格式缓存导致的功能失效

### 📈 Improvements  性能/体验优化

- 【检索服务】检索分片体积 61.8 MB → 28.8 MB（-53%：诗人 ID 字典化、去除无效字段、文本截断调参、构建期小写化）
- 【检索服务】34.5 万条最坏全量扫描 200ms → 65ms（构建期小写化，消除逐条大小写转换）；分片内倒排经实测（体积 +240%）后决策暂缓，依据记录于 docs/09

### 📚 Docs  文档更新

- docs/09 同步检索现状、管道阶段（含归一化映射生成）、实测性能与倒排决策记录

### 🔧 Dependencies  依赖更新

- 新增 devDependency `opencc-js`（繁简归一化权威数据源，仅构建期使用）

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
