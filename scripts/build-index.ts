/**
 * 文气项目空间索引构建脚本
 *
 * 功能：
 * 1. 读取评分数据
 * 2. 构建 KD-Tree 空间索引
 * 3. 生成 nodes.json 和 spatial-index.json
 *
 * 使用方式：
 * bun run scripts/build-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 数据目录
const DATA_DIR = path.join(__dirname, '../data/processed');

// 接口定义
interface ScoreResult {
  poetId: string;
  poetName: string;
  dynasty: string;
  threeQi: {
    talent: { value: number };
    popularity: { value: number };
    luck: { value: number };
  };
}

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

  // 读取评分数据
  console.log('读取评分数据...');
  const scores: ScoreResult[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'scores.json'), 'utf-8')
  );
  console.log(`  诗人数量: ${scores.length}`);

  // 构建节点
  console.log('\n构建节点数据...');
  const nodes: Node[] = scores.map((score) => {
    const position: NodePosition = {
      x: score.threeQi.luck.value,        // 运气轴
      y: score.threeQi.talent.value,      // 才气轴
      z: score.threeQi.popularity.value,  // 人气轴
    };

    return {
      id: `node_${score.poetId}`,
      refType: 'POET',
      refId: score.poetId,
      position,
      basePosition: { ...position },
      dynasty: score.dynasty,
      genre: null,
      size: calculateSize(score.threeQi.popularity.value),
      brightness: calculateBrightness(score.threeQi.talent.value),
      phase: generatePhase(),
      state: 'IDLE',
      label: score.poetName,
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

  // 保存节点数据
  console.log('\n保存数据...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'nodes.json'),
    JSON.stringify(nodes, null, 2),
    'utf-8'
  );
  console.log('  已保存 nodes.json');

  // 保存空间索引
  fs.writeFileSync(
    path.join(DATA_DIR, 'spatial-index.json'),
    JSON.stringify(indexData, null, 2),
    'utf-8'
  );
  console.log('  已保存 spatial-index.json');

  // 更新 manifest（upsert 避免重复条目）
  const manifest = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf-8')
  );
  const existing = new Map(manifest.files.map((f: any) => [f.path, f] as const));
  const newEntries = [
    { path: 'nodes.json', type: 'nodes', size: fs.statSync(path.join(DATA_DIR, 'nodes.json')).size, hash: crypto.createHash('sha256').update(fs.readFileSync(path.join(DATA_DIR, 'nodes.json'))).digest('hex') },
    { path: 'spatial-index.json', type: 'index', size: fs.statSync(path.join(DATA_DIR, 'spatial-index.json')).size, hash: crypto.createHash('sha256').update(fs.readFileSync(path.join(DATA_DIR, 'spatial-index.json'))).digest('hex') },
  ];
  for (const entry of newEntries) existing.set(entry.path, entry);
  manifest.files = Array.from(existing.values());
  fs.writeFileSync(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
  console.log('  已更新 manifest.json');

  // 测试查询
  console.log('\n=== 测试查询 ===');

  // 测试半径查询
  console.log('\n测试半径查询 (中心点: x=10, y=50, z=30, 半径: 20):');
  const testCenter = { x: 10, y: 50, z: 30 };
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

  console.log('\n=== 构建完成 ===');
}

// 运行主函数
main();
