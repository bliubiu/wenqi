# 文气（WenQi）

> "文以气为主，气之清浊有体，不可力强而致。" —— 曹丕《典论·论文》

**观文气之聚散，见千年之脉络。**

沉浸式古典文学知识探索应用，以三维星系可视化呈现千年文脉。

## 项目简介

文气是一个纯客户端离线应用，将古典文学知识以三维星系的形式呈现：

- **14,087 位诗人** - 从先秦到近现代
- **344,245 首作品** - 诗、词、曲、赋、文
- **三气评分** - 才气、人气、运气三维评价
- **实时交互** - 聚气、散气、搜索、分享

## 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| 计算层 | Rust → WASM | 高性能计算、空间索引、全文检索 |
| 前端框架 | Next.js 16.2.9 | 静态导出、路由 |
| UI 库 | React 19.2 | 组件化 |
| 3D 渲染 | Three.js | WebGL 星系可视化 |
| 状态管理 | Zustand | 轻量级状态 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 测试 | Vitest | 单元测试 |

## 快速开始

### 环境要求

- Node.js ≥ 18
- bun ≥ 1.0
- Rust stable

### 安装

```bash
# 安装前端依赖
bun install

# 编译 Rust WASM（可选，已有预编译数据）
cd crates/wenqi-core
wasm-pack build --target web
cd ../..
```

### 运行

```bash
# 开发模式
bun run dev

# 构建
bun run build

# 运行测试
bun run test:run
```

访问 http://localhost:3000

## 项目结构

```
wenqi/
├── docs/                        # 项目文档
│   ├── 01-项目规格说明书.md
│   ├── 02-产品需求文档PRD.md
│   ├── 03-架构设计文档.md
│   ├── 04-领域模型设计.md
│   ├── 05-API接口设计文档.md
│   └── 06-持久化设计文档.md
│
├── src/                         # 前端源码
│   ├── app/                     # Next.js 应用
│   ├── domain/                  # 领域层
│   ├── application/             # 应用层
│   ├── infrastructure/          # 基础设施层
│   └── presentation/            # 表现层
│       ├── components/          # React 组件
│       ├── scene/               # Three.js 场景
│       ├── hooks/               # React Hooks
│       └── store/               # Zustand 状态
│
├── crates/                      # Rust 源码
│   └── wenqi-core/              # WASM 核心模块
│       └── src/
│           ├── scoring.rs       # 三气评分
│           ├── index.rs         # 空间索引
│           ├── search.rs        # 全文检索
│           └── clustering.rs    # 气团聚类
│
├── data/                        # 数据文件
│   ├── raw/                     # 原始数据
│   └── processed/               # 处理后数据
│
├── scripts/                     # 数据处理脚本
│   ├── process-data.ts          # 数据清洗
│   ├── calculate-scores.ts      # 评分计算
│   ├── build-index.ts           # 空间索引
│   └── build-search-index.ts    # 搜索索引
│
├── public/                      # 静态资源
│   └── data/processed/          # 前端数据
│
├── tests/                       # 测试文件
├── application.yml              # 项目配置
├── package.json                 # Node.js 配置
├── Cargo.toml                   # Rust 配置
└── tsconfig.json                # TypeScript 配置
```

## 功能特性

### 核心功能

- ✅ **三维星系渲染** - Three.js InstancedMesh 批量渲染
- ✅ **节点呼吸动画** - sin 波脉动效果
- ✅ **聚气交互** - 点击节点，相关节点汇聚
- ✅ **散气模式** - 缩放拉远显示朝代气团
- ✅ **全文检索** - 搜索诗人，实时过滤
- ✅ **维度调节** - 调整三气权重
- ✅ **分享功能** - 截图保存 + 分享链接
- ✅ **WebGL 降级** - Canvas 2D / 文字模式
- ✅ **可访问性** - 键盘导航、高对比度

### 三气评分

| 维度 | 轴 | 含义 | 计算方法 |
|------|-----|------|---------|
| 才气 | Y | 创造力 | 用词独特性 + 意象新颖度 + 体裁创新 |
| 人气 | Z | 影响力 | 引用次数 + 教材入选 + 搜索热度 |
| 运气 | X | 历史机遇 | 政治环境 + 重评事件 |

## 数据来源

- [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) - 中华古诗词数据集 (MIT)

## 文档

详细设计文档见 `docs/` 目录：

1. **项目规格说明书** - 项目全局定义
2. **产品需求文档** - 功能与非功能需求
3. **架构设计文档** - DDD 分层架构
4. **领域模型设计** - 实体、值对象、聚合根
5. **API 接口设计** - 接口契约与 DTO
6. **持久化设计** - IndexedDB 存储方案

## 许可证

MIT License

## 致谢

- [shiyun](https://github.com/Cohenjikan/shiyun) - 项目灵感来源
- [meet-libai](https://github.com/BinNong/meet-libai) - 知识图谱参考
- [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) - 数据来源
