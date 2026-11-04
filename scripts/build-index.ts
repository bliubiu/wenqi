/**
 * 文气项目空间索引构建脚本
 *
 * 功能：
 * 1. 从 SQLite 底座读取评分数据
 * 2. 构建 KD-Tree 空间索引
 * 3. 节点与空间索引写回数据库（nodes / spatial_index 表），前端 JSON 由 db:export 导出
 *
 * 使用方式：
 * bun run scripts/build-index.ts
 */

import { openDatabase, loadScores, insertNodes, setMeta, logStage, DEFAULT_DB, type ScoreRow } from './db-core';

// 接口定义
interface NodePosition {
  x: number; // 运气轴
  y: number; // 才气轴
  z: number; // 人气轴
}

interface Node {
  id: string;
  refType: 'POET';
  refId: string;
  position: NodePosition;
  basePosition: NodePosition;
  dynasty: string;
  genre: null;
  size: number;
  brightness: number;
  phase: number;
  state: 'IDLE';
  label: string;
}

interface KdNode {
  node: Node;
  left: KdNode | null;
  right: KdNode | null;
  axis: number;
}

interface SpatialIndexData {
  nodes: Node[];
  kdTree: any; // 序列化的 KD-Tree
  metadata: {
    nodeCount: number;
    bounds: {
      min: NodePosition;
      max: NodePosition;
    };
    buildTime: number;
  };
}

/** 星系旋臂参数 */
const SPIRAL_ARMS = 4;
const DISK_INNER = 8;
const DISK_OUTER = 58;

/** FNV-1a 哈希，用于确定性扰动，保证重建数据后坐标稳定 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashRandom(seed: string, salt: number): number {
  return hashString(`${seed}:${salt}`) / 4294967295;
}

/**
 * 将三气评分投影到旋臂星系
 * - 人气决定半径：越高越靠近明亮核心
 * - 才气决定偏离旋臂轴的幅度：才气越高越贴近旋臂
 * - 运气决定盘面高度
 */
function projectToSpiral(
  poetId: string,
  qi: { talent: number; popularity: number; luck: number }
): NodePosition {
  const popularity = Math.max(0, Math.min(100, qi.popularity ?? 0)) / 100;
  const talent = Math.max(0, Math.min(100, qi.talent ?? 0)) / 100;
  const luck = Math.max(-50, Math.min(50, qi.luck ?? 0)) / 50;

  // 人气主导径向，近半由噪声决定，避免同分诗人挤成同心环
  const radialScore = 0.55 * (1 - Math.pow(popularity, 0.8)) + 0.45 * hashRandom(poetId, 7);
  const baseRadius = DISK_INNER + radialScore * (DISK_OUTER - DISK_INNER);
  const arm = hashString(poetId) % SPIRAL_ARMS;
  const spiralAngle = (arm / SPIRAL_ARMS) * Math.PI * 2 + Math.log(baseRadius / DISK_INNER) * 2.2
    + Math.sin(baseRadius * 0.18 + arm * 1.7) * 0.45;
  const scatter = ((1 - talent) * 0.9 + 0.25) * (0.8 + 0.4 * hashRandom(poetId, 11));
  const angle = spiralAngle + (hashRandom(poetId, 1) - 0.5) * scatter;

  // 连续噪声扰动半径，形成云絮状团块而非同心环
  const clump = Math.sin(baseRadius * 0.42 + angle * 2.2) * 2.5;
  const coreSpread = popularity > 0.85 ? hashRandom(poetId, 6) * 8 : 0;
  const radius = Math.max(12,
    baseRadius + clump + (hashRandom(poetId, 5) - 0.5) * 8 + coreSpread);

  const thickness = 2 + (1 - popularity) * 6;
  const gaussian = (hashRandom(poetId, 2) + hashRandom(poetId, 3) + hashRandom(poetId, 4) - 1.5) / 1.5;
  const height = luck * 10 + gaussian * thickness + (hashRandom(poetId, 8) - 0.5) * 4;

  return {
    x: Math.cos(angle) * radius,
    y: height,
    z: Math.sin(angle) * radius,
  };
}

/**
 * 构建 KD-Tree
 */
function buildKdTree(nodes: Node[], depth: number = 0): KdNode | null {
  if (nodes.length === 0) return null;

  const axis = depth % 3; // 0=x, 1=y, 2=z

  // 按当前轴排序
  const sorted = [...nodes].sort((a, b) => {
    const valA = axis === 0 ? a.position.x : axis === 1 ? a.position.y : a.position.z;
    const valB = axis === 0 ? b.position.x : axis === 1 ? b.position.y : b.position.z;
    return valA - valB;
  });

  const mid = Math.floor(sorted.length / 2);
  const median = sorted[mid];

  return {
    node: median,
    left: buildKdTree(sorted.slice(0, mid), depth + 1),
    right: buildKdTree(sorted.slice(mid + 1), depth + 1),
    axis,
  };
}

/**
 * 序列化 KD-Tree
 */
function serializeKdTree(node: KdNode | null): any {
  if (!node) return null;

  return {
    nodeId: node.node.id,
    axis: node.axis,
    left: serializeKdTree(node.left),
    right: serializeKdTree(node.right),
  };
}

/**
 * 计算节点大小（基于人气）
 */
function calculateSize(popularity: number): number {
  // 人气 0-100 映射到大小 2-8
  return 2 + (popularity / 100) * 6;
}

/**
 * 计算节点亮度（基于才气）
 */
function calculateBrightness(talent: number): number {
  // 才气 0-100 映射到亮度 0.4-1.0
  return 0.4 + (talent / 100) * 0.6;
}

/**
 * 生成随机相位
 */
function generatePhase(): number {
  return Math.random() * Math.PI * 2;
}

/**
 * 主函数
 */
function main() {
  console.log('=== 文气项目空间索引构建 ===\n');
  const startedAt = Date.now();

  // 读取评分数据（SQLite 底座为唯一真相源）
  console.log('读取评分数据...');
  const db = openDatabase(DEFAULT_DB);
  const scores = loadScores(db);
  console.log(`  诗人数量: ${scores.length}`);

  // 构建节点
  console.log('\n构建节点数据...');
  const nodes: Node[] = scores.map((score) => {
    const position: NodePosition = projectToSpiral(score.poetId, {
      talent: score.threeQi.talent.value ?? 0,
      popularity: score.threeQi.popularity.value ?? 0,
      luck: score.threeQi.luck.value ?? 0,
    });

    return {
      id: `node_${score.poetId}`,
      refType: 'POET',
      refId: score.poetId,
      position,
      basePosition: { ...position },
      dynasty: score.dynasty ?? '',
      genre: null,
      size: calculateSize(score.threeQi.popularity.value ?? 0),
      brightness: calculateBrightness(score.threeQi.talent.value ?? 0),
      phase: generatePhase(),
      state: 'IDLE',
      label: score.poetName ?? '',
    };
  });

  console.log(`  生成节点数量: ${nodes.length}`);

  // 计算边界
  console.log('\n计算空间边界...');
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  for (const node of nodes) {
    bounds.min.x = Math.min(bounds.min.x, node.position.x);
    bounds.min.y = Math.min(bounds.min.y, node.position.y);
    bounds.min.z = Math.min(bounds.min.z, node.position.z);
    bounds.max.x = Math.max(bounds.max.x, node.position.x);
    bounds.max.y = Math.max(bounds.max.y, node.position.y);
    bounds.max.z = Math.max(bounds.max.z, node.position.z);
  }

  console.log(`  X 轴 (运气): [${bounds.min.x}, ${bounds.max.x}]`);
  console.log(`  Y 轴 (才气): [${bounds.min.y}, ${bounds.max.y}]`);
  console.log(`  Z 轴 (人气): [${bounds.min.z}, ${bounds.max.z}]`);

  // 构建 KD-Tree
  console.log('\n构建 KD-Tree...');
  const startTime = Date.now();
  const kdTree = buildKdTree(nodes);
  const buildTime = Date.now() - startTime;
  console.log(`  构建耗时: ${buildTime}ms`);

  // 序列化 KD-Tree
  const serializedKdTree = serializeKdTree(kdTree);

  // 构建索引数据
  const indexData: SpatialIndexData = {
    nodes,
    kdTree: serializedKdTree,
    metadata: {
      nodeCount: nodes.length,
      bounds,
      buildTime,
    },
  };

  // 保存节点与空间索引（写回数据库，幂等覆盖）
  console.log('\n保存数据...');
  db.exec('DELETE FROM nodes');
  const { inserted } = insertNodes(db, nodes as any);
  db.exec('DELETE FROM spatial_index');
  db.query('INSERT INTO spatial_index (id, data) VALUES (1, ?)').run(JSON.stringify(indexData));
  setMeta(db, 'nodes_updated_at', new Date().toISOString());
  setMeta(db, 'nodes_count', inserted);
  logStage(db, {
    stage: 'index',
    nodesCount: inserted,
    durationMs: Date.now() - startedAt,
  });
  console.log(`  已写入数据库 nodes 表: ${inserted} 个节点`);
  console.log(`  已写入数据库 spatial_index 表`);

  // 测试查询
  console.log('\n=== 测试查询 ===');

  // 测试半径查询
  console.log('\n测试半径查询 (中心点: x=0, y=0, z=0, 半径: 20):');
  const testCenter = { x: 0, y: 0, z: 0 };
  const testRadius = 20;

  const nearbyNodes = nodes.filter((node) => {
    const dx = node.position.x - testCenter.x;
    const dy = node.position.y - testCenter.y;
    const dz = node.position.z - testCenter.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance <= testRadius;
  });

  console.log(`  找到 ${nearbyNodes.length} 个节点`);
  if (nearbyNodes.length > 0) {
    console.log('  前5个节点:');
    nearbyNodes.slice(0, 5).forEach((node, i) => {
      console.log(`    ${i + 1}. ${node.label} (${node.dynasty})`);
    });
  }

  // 统计信息
  console.log('\n=== 统计信息 ===');
  console.log(`总节点数: ${nodes.length}`);
  console.log(`KD-Tree 构建时间: ${buildTime}ms`);

  // 按朝代统计
  const dynastyCounts = new Map<string, number>();
  for (const node of nodes) {
    dynastyCounts.set(node.dynasty, (dynastyCounts.get(node.dynasty) || 0) + 1);
  }

  console.log('\n按朝代分布:');
  for (const [dynasty, count] of dynastyCounts) {
    console.log(`  ${dynasty}: ${count} 个节点`);
  }

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();

  console.log('\n=== 构建完成 ===');
}

// 运行主函数
main();
