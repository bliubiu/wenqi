/**
 * 节点 LOD 分级：按相机到星系原点的距离切换近/中/远/极远四档视觉。
 * 阈值来自 application.yml 的 rendering.lodThresholds（升序）。
 */

export interface LodVisual {
  level: number;
  sizeScale: number;
  opacity: number;
}

/** 四档视觉：拉远时略微放大并降低透明度，避免远处星点消失或过曝 */
const LEVEL_VISUALS: Array<{ sizeScale: number; opacity: number }> = [
  { sizeScale: 1.0, opacity: 1.0 },
  { sizeScale: 1.05, opacity: 0.96 },
  { sizeScale: 1.12, opacity: 0.9 },
  { sizeScale: 1.2, opacity: 0.82 },
];

/** 返回 0–3 的档位；无有效阈值时固定为 0 */
export function lodLevel(distance: number, thresholds: number[]): number {
  if (!Number.isFinite(distance) || thresholds.length === 0) return 0;
  let level = 0;
  for (let i = 0; i < thresholds.length && i < LEVEL_VISUALS.length - 1; i++) {
    if (distance >= thresholds[i]) level = i + 1;
  }
  return level;
}

export function lodVisual(distance: number, thresholds: number[]): LodVisual {
  const level = lodLevel(distance, thresholds);
  return { level, ...LEVEL_VISUALS[level] };
}
