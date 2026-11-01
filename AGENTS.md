## 文气(WenQi | The Literati Aura)

> “文以气为主，气之清浊有体，不可力强而致。” —— 曹丕《典论·论文》

“文气”既是**知识的本体**（文脉之气），又是**知识的形态**（如星云般弥漫、流动的气体）。它暗示你的三维星系不是冰冷的数据库，而是一个**有生命、有气息、在呼吸的活体宇宙**。



来源shiyun项目点子，基于古诗词曲等文学经典（知识星球）以流动星系、韵律、节奏传播古典美学。



### 项目构想

**1. 核心隐喻：文脉如气，流动不居**

- 每颗星（知识节点）不是静止的，而是带有轻微的“呼吸”动画——脉动、闪烁，如同活着的“气点”。
- 知识之间的关联（边）不再是僵硬的线条，而是**流动的光粒**或**氤氲的雾带**，模拟“气”在文脉中的流转。

**2. 交互体验：感受“气”的聚散**

- **“聚气”**：点击一位诗人，他的“文气”会凝聚，周围相关的意象、作品、评论家会如云气般向他汇聚。
- **“散气”**：缩放拉远视角，看到的是整片“文气”弥漫的星云，不同朝代、体裁的气团呈现出不同的色彩和密度（如唐诗的黄金气团、宋词的银蓝气团）。

**3. 扩展概念：三气合一**
你可以将“文气”分解为三个子维度，对应三维空间的XYZ轴，让每一次漫游都成为一次“观气”之旅：

- **才气（Y轴）**：作品的创造力、独特性评分。
- **人气（Z轴）**：影响力、被引用次数、知名度。
- **运气（X轴）**：时间轴上的偶然性与历史机遇（如某位诗人在某个朝代突然被重新发现）。

**4. 文案与叙事**

- **项目标语**：“**观文气之聚散，见千年之脉络**。”
- **引导语**：“欢迎进入‘文气’宇宙。这里每颗星都是一缕文脉，你的每一次凝视，都在扰动这片知识的星云。”



### 技术栈

- 4层**DDD 架构（领域驱动设计）**和**TDD（测试驱动开发）**设计思想

- Rust (WASM)
- bun  + TypeScript 7.0 + Tailwind CSS + Next.js 16.2.9 + React 19.2 + Three.js 

- 中文字体内嵌（SIL 协议，无版权风险）：Noto Sans SC + 系统默认字体（保底策略）

- 统一入口运行配置文件：`application.yml`（详见 03-架构设计文档 配置管理章节）



### 数据集

#### 1. [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) 数据集

已下载本地目录： `data\raw\chinese-poetry`



#### 2. 将诗词物料入库

使用sqlite(wal模式) 【可选postgresql】存储诗词，默认存储到`项目根目录\data`目录，提供import命令CLI工具写入数据库表存储。DB作为项目运行时唯一真相源。




### 日志系统

支持多日志级别（DEBUG、INFO、ERROR），并提供文件输出和日志轮转功能。

- 日志级别：支持 DEBUG、INFO、ERROR 三个级别，可通过配置文件指定日志级别，默认 INFO 级别
- 日志格式：`[YYYY-MM-DD HH:MM:SS.SSS] [级别] [线程ID 或 进程ID] [模块:行号] - 日志内容`
- 日志输出：支持文件输出和终端输出，文件输出路径默认 `logs/`，日志文件按日期轮转（每日一个文件），保留 32 天日志，自动清理过期日志
- 日志内容：统一使用中文，清晰记录操作行为、执行结果、错误信息，便于问题排查和审计
- 日志内容不能记录敏感信息，必须严格遵循脱敏策略，禁止记录：密码、完整身份证号、手机号
- 文件命名格式：`wenqi-YYYYMMDD.log`，例如 `wenqi-20231225.log`

- 时间戳格式：YYYY-MM-DD HH:MM:SS.SSS  本地时间，不含时区



### 文档和注释

- 项目文档统一存储 `docs/` 目录，按顺序标号命名中文文档
- 注释、日志内容统一使用中文
- 统一错误处理，所有错误信息都必须使用中文，禁止打印明文密码等敏感信息
- git@github.com:bliubiu/wenqi.git 



#### CHANGELOG 规范

> 版本号类型说明：**CalVer（日历版本）**/**SemVer（语义化版本）**
>
> - CalVer 版本号格式：YY.MM.DD.MICRO
> - SemVer 格式：`主版本号Major.次版本号Minor.补丁号Patch[-可选标签 alpha|beta|rc]`

- 使用CalVer（日历版本）版本号
- **统一版本规范格式**：`YYYY.MM.DD.MICRO`（年.月.日.迭代号）
- 项目根目建立 CHANGELOG.md 文档
- 根据迭代内容，严格按照 SemVer/CalVer 规则确定新版本号
- 在稳定分支打 Tag，Tag 名称与版本号一致
- Tag 仅允许正式发布时创建，禁止随意打测试 Tag



##### 格式模板

```
## [2026.08.17.0] - 0.1.0
### ⚠️ Breaking Changes  破坏性变更
- 【用户模块】废弃旧版登录接口 /api/v1/login，请迁移至 /api/v2/login

### ✨ New Features 新增功能
- 【权限模块】新增角色批量授权功能 #123

### 🐛 Bug Fixes  问题修复
- 【订单模块】修复极端场景下订单状态同步异常问题 #121

### 📈 Improvements 性能/体验优化
- 【接口服务】优化列表查询性能，响应速度提升40%

### 📚 Docs 文档更新
- 更新权限模块使用文档与接口说明

### 🔧 Dependencies 依赖更新
- 

### 🗑 Deprecated 废弃功能
- 
```



### 约束与制约

- 禁用 npm 包管理，可用pnpm，bun
- 禁用Maven，可用gradle

- 必须编译配置优化，从源头减小体积



### 参考

- https://github.com/Cohenjikan/shiyun
- https://github.com/BinNong/meet-libai
- https://github.com/chinese-poetry/chinese-poetry  #（古诗词曲数据集）



---

# AI Assistant Guidelines (Karpathy Standard)

## Core Principles

1. **Clarify first, don't assume**
   If the request is ambiguous, unclear, or underspecified, ask brief clarifying questions before writing code or proceeding. Do not guess intent.

2. **Simplicity over cleverness**
   Prefer simple, readable, minimal code. Avoid over-engineering, unnecessary abstractions, fancy patterns, or premature optimization. Keep solutions straightforward.

3. **Minimal changes only**
   Make only the smallest necessary edits to solve the problem. Do not refactor unrelated code, do not reformat entire files, do not change coding style arbitrarily. Stay within the scope of the request.

4. **Goal-driven work**
   Stay focused on the immediate task. Do not add extra features, improvements, or "helpful" additions that were not requested. Solve exactly what is asked.

## Code Style

- Write clean, standard, idiomatic code for the language.
- No overly verbose comments; code should speak for itself.
- Keep functions and logic concise.



## 语言强制规则（必须严格遵守）

1. 所有回复、解释、对话、说明必须**全程使用中文**，禁止出现任何英文。
2. 不允许切换语言，全程保持纯中文交互。
3. 解释、说明、思考过程、总结、步骤描述，全部使用中文。