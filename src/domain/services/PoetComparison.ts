/**
 * 双诗人对比：关系网络归并 + 三气雷达坐标计算
 *
 * 纯计算逻辑，供对比面板与场景叠加复用。
 */

export interface ComparisonEdge {
  otherPoetId: string;
  type: string;
  weight: number;
}

export interface ComparisonNetwork {
  /** 与双方均有关联的诗人（取主诗人侧边） */
  shared: ComparisonEdge[];
  /** 仅主诗人侧有关联 */
  primaryOnly: ComparisonEdge[];
  /** 仅对比诗人侧有关联 */
  secondaryOnly: ComparisonEdge[];
}

export interface QiScores {
  talent: number;
  popularity: number;
  luck: number;
}

export interface RadarPoint {
  x: number;
  y: number;
}

function dedupeByOther(edges: ComparisonEdge[]): Map<string, ComparisonEdge> {
  const map = new Map<string, ComparisonEdge>();
  for (const edge of edges) {
    const exist = map.get(edge.otherPoetId);
    if (!exist || edge.weight > exist.weight) map.set(edge.otherPoetId, edge);
  }
  return map;
}

const byWeightDesc = (a: ComparisonEdge, b: ComparisonEdge) => b.weight - a.weight;

/** 归并双方关系：共同关联优先，其余按权重降序 */
export function buildComparisonNetwork(
  primary: ComparisonEdge[],
  secondary: ComparisonEdge[]
): ComparisonNetwork {
  const a = dedupeByOther(primary);
  const b = dedupeByOther(secondary);
  const shared: ComparisonEdge[] = [];
  const primaryOnly: ComparisonEdge[] = [];
  const secondaryOnly: ComparisonEdge[] = [];
  for (const edge of a.values()) {
    (b.has(edge.otherPoetId) ? shared : primaryOnly).push(edge);
  }
  for (const edge of b.values()) {
    if (!a.has(edge.otherPoetId)) secondaryOnly.push(edge);
  }
  return {
    shared: shared.sort(byWeightDesc),
    primaryOnly: primaryOnly.sort(byWeightDesc),
    secondaryOnly: secondaryOnly.sort(byWeightDesc),
  };
}

/** 三气归一到 [0,1]：才气/人气按百分制，运气按 [-50,50] 映射 */
export function normalizeQi(scores: QiScores): [number, number, number] {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp01(scores.talent / 100),
    clamp01(scores.popularity / 100),
    clamp01((scores.luck + 50) / 100),
  ];
}

/** 雷达多边形顶点：三轴自正上方起均分 120°，数值决定半径 */
export function radarPoints(axes: number[], cx: number, cy: number, radius: number): RadarPoint[] {
  return axes.map((value, index) => {
    const angle = -Math.PI / 2 + (index / axes.length) * Math.PI * 2;
    const r = radius * Math.min(1, Math.max(0, value));
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
}
