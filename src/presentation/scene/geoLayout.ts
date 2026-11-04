/**
 * 地理布局纯计算：籍贯经纬度投影、经纬网格顶点、相机取景与散气检测判定。
 *
 * 与 GalaxyScene 的三维渲染解耦，便于单元测试。
 */

/** 籍贯投影原点与缩放：经度→X、纬度→Z（北为 -Z） */
export const GEO_LNG_ORIGIN = 104;
export const GEO_LAT_ORIGIN = 36;
export const GEO_X_SCALE = 2.3;
export const GEO_Z_SCALE = 2.6;

/** 经纬网格范围与步长（10° 一格） */
export const GEO_GRID_LNG_MIN = 70;
export const GEO_GRID_LNG_MAX = 140;
export const GEO_GRID_LAT_MIN = 15;
export const GEO_GRID_LAT_MAX = 55;
export const GEO_GRID_STEP = 10;

/** 中国轮廓线条的绘制高度（略高于网格，避免共面闪烁） */
export const GEO_OUTLINE_Y = 0.05;

/** 相机取景结果（世界坐标） */
export interface GeoFrame {
  camera: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/** 经度 → 星系盘 X 坐标 */
export function projectGeoX(lng: number): number {
  return (lng - GEO_LNG_ORIGIN) * GEO_X_SCALE;
}

/** 纬度 → 星系盘 Z 坐标 */
export function projectGeoZ(lat: number): number {
  return -(lat - GEO_LAT_ORIGIN) * GEO_Z_SCALE;
}

/**
 * 生成经纬网格线段顶点（每两个点一条线，顺序为 x,y,z）。
 * 经线沿纬度方向延伸，纬线沿经度方向延伸，全部落在 y=0 平面。
 */
export function buildGeoGridVertices(): number[] {
  const vertices: number[] = [];

  for (let lng = GEO_GRID_LNG_MIN; lng <= GEO_GRID_LNG_MAX; lng += GEO_GRID_STEP) {
    vertices.push(projectGeoX(lng), 0, projectGeoZ(GEO_GRID_LAT_MIN));
    vertices.push(projectGeoX(lng), 0, projectGeoZ(GEO_GRID_LAT_MAX));
  }
  for (let lat = GEO_GRID_LAT_MIN; lat <= GEO_GRID_LAT_MAX; lat += GEO_GRID_STEP) {
    vertices.push(projectGeoX(GEO_GRID_LNG_MIN), 0, projectGeoZ(lat));
    vertices.push(projectGeoX(GEO_GRID_LNG_MAX), 0, projectGeoZ(lat));
  }

  return vertices;
}

type GeoPosition = [number, number];

interface GeoJsonGeometry {
  type?: unknown;
  coordinates?: unknown;
}

interface GeoJsonFeature {
  geometry?: GeoJsonGeometry | null;
}

interface GeoJsonFeatureCollection {
  features?: unknown;
}

function isGeoPosition(value: unknown): value is GeoPosition {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

function pushPoint(vertices: number[], point: GeoPosition): void {
  vertices.push(projectGeoX(point[0]), GEO_OUTLINE_Y, projectGeoZ(point[1]));
}

/** 多边形环：首尾闭合（数据自带重复末点时不再补一段） */
function pushRing(ring: unknown, vertices: number[]): void {
  if (!Array.isArray(ring)) return;
  const points = ring.filter(isGeoPosition);
  if (points.length < 2) return;

  const last = points[points.length - 1];
  const first = points[0];
  const closed = last[0] === first[0] && last[1] === first[1];
  const segmentCount = closed ? points.length - 1 : points.length;

  for (let i = 0; i < segmentCount; i++) {
    pushPoint(vertices, points[i]);
    pushPoint(vertices, points[(i + 1) % points.length]);
  }
}

/** 折线：仅连接相邻点，不闭合 */
function pushPolyline(line: unknown, vertices: number[]): void {
  if (!Array.isArray(line)) return;
  const points = line.filter(isGeoPosition);
  for (let i = 0; i + 1 < points.length; i++) {
    pushPoint(vertices, points[i]);
    pushPoint(vertices, points[i + 1]);
  }
}

function pushPolygonRings(value: unknown, vertices: number[]): void {
  if (!Array.isArray(value)) return;
  for (const ring of value) pushRing(ring, vertices);
}

/**
 * 将中国轮廓 GeoJSON（Polygon / MultiPolygon / LineString / MultiLineString）
 * 展平为 LineSegments 顶点数组（每两个点一段，顺序 x,y,z）。
 */
export function buildGeoOutlineVertices(geojson: unknown): number[] {
  const vertices: number[] = [];
  const features = (geojson as GeoJsonFeatureCollection | null)?.features;
  if (!Array.isArray(features)) return vertices;

  for (const item of features) {
    const geometry = (item as GeoJsonFeature | null)?.geometry;
    if (!geometry || typeof geometry.type !== 'string') continue;

    switch (geometry.type) {
      case 'Polygon':
        pushPolygonRings(geometry.coordinates, vertices);
        break;
      case 'MultiPolygon':
        if (Array.isArray(geometry.coordinates)) {
          for (const polygon of geometry.coordinates) pushPolygonRings(polygon, vertices);
        }
        break;
      case 'LineString':
        pushPolyline(geometry.coordinates, vertices);
        break;
      case 'MultiLineString':
        if (Array.isArray(geometry.coordinates)) {
          for (const line of geometry.coordinates) pushPolyline(line, vertices);
        }
        break;
      default:
        break;
    }
  }

  return vertices;
}

/**
 * 按可见籍贯坐标计算相机取景：取包围盒中心为注视点，
 * 相机抬高到最大半径 1.6 倍（下限 40）的后上方，便于俯瞰整幅地图。
 * 无有效坐标时返回 null。
 */
export function computeGeoFrame(positions: Iterable<{ x: number; y: number; z: number }>): GeoFrame | null {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let count = 0;

  for (const p of positions) {
    count++;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (count === 0) return null;

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
  const height = Math.max(radius * 1.6, 40);

  return {
    camera: { x: centerX, y: height, z: centerZ + height },
    target: { x: centerX, y: 0, z: centerZ },
  };
}

/**
 * 是否允许散气（聚类）检测：
 * 地理布局相机固定在远景，相机动画期间会穿过距离阈值，均需跳过。
 */
export function canCheckDivergence(layoutMode: 'spiral' | 'geo', cameraAnimating: boolean): boolean {
  return layoutMode !== 'geo' && !cameraAnimating;
}
