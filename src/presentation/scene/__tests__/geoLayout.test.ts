import { describe, it, expect } from 'bun:test';
import {
  buildGeoGridVertices,
  buildGeoOutlineVertices,
  canCheckDivergence,
  computeGeoFrame,
  projectGeoX,
  projectGeoZ,
  GEO_GRID_LAT_MAX,
  GEO_GRID_LAT_MIN,
  GEO_GRID_LNG_MAX,
  GEO_GRID_LNG_MIN,
  GEO_GRID_STEP,
  GEO_LAT_ORIGIN,
  GEO_LNG_ORIGIN,
  GEO_OUTLINE_Y,
  GEO_X_SCALE,
  GEO_Z_SCALE,
} from '../geoLayout';

describe('经纬度投影', () => {
  it('投影原点 (104°E, 36°N) 应落在坐标原点', () => {
    expect(projectGeoX(GEO_LNG_ORIGIN)).toBe(0);
    // 纬度投影带负号，原点处为 -0，用 toBeCloseTo 规避 Object.is 差异
    expect(projectGeoZ(GEO_LAT_ORIGIN)).toBeCloseTo(0, 6);
  });

  it('经度增大时 X 按 2.3 倍线性放大', () => {
    expect(projectGeoX(GEO_LNG_ORIGIN + 10)).toBeCloseTo(10 * GEO_X_SCALE, 6);
    expect(projectGeoX(GEO_LNG_ORIGIN - 10)).toBeCloseTo(-10 * GEO_X_SCALE, 6);
  });

  it('纬度增大（向北）时 Z 取负值，符合北为 -Z 的约定', () => {
    expect(projectGeoZ(GEO_LAT_ORIGIN + 10)).toBeCloseTo(-10 * GEO_Z_SCALE, 6);
    expect(projectGeoZ(GEO_LAT_ORIGIN - 10)).toBeCloseTo(10 * GEO_Z_SCALE, 6);
  });
});

describe('经纬网格顶点', () => {
  const lngLineCount = Math.floor((GEO_GRID_LNG_MAX - GEO_GRID_LNG_MIN) / GEO_GRID_STEP) + 1;
  const latLineCount = Math.floor((GEO_GRID_LAT_MAX - GEO_GRID_LAT_MIN) / GEO_GRID_STEP) + 1;
  const vertices = buildGeoGridVertices();

  it('线条数量为经线 + 纬线之和，每条线两个顶点', () => {
    expect(lngLineCount).toBe(8);
    expect(latLineCount).toBe(5);
    expect(vertices.length).toBe((lngLineCount + latLineCount) * 2 * 3);
  });

  it('所有顶点都落在 y = 0 平面', () => {
    for (let i = 1; i < vertices.length; i += 3) {
      expect(vertices[i]).toBe(0);
    }
    for (let i = 0; i < vertices.length; i += 6) {
      expect(vertices[i + 1]).toBe(0);
      expect(vertices[i + 4]).toBe(0);
    }
  });

  it('首条经线位于最小经度，且沿纬度方向从南到北延伸', () => {
    expect(vertices[0]).toBeCloseTo(projectGeoX(GEO_GRID_LNG_MIN), 6);
    expect(vertices[2]).toBeCloseTo(projectGeoZ(GEO_GRID_LAT_MIN), 6);
    expect(vertices[3]).toBeCloseTo(projectGeoX(GEO_GRID_LNG_MIN), 6);
    expect(vertices[5]).toBeCloseTo(projectGeoZ(GEO_GRID_LAT_MAX), 6);
    // 北侧 Z 更小（更负）
    expect(vertices[5]).toBeLessThan(vertices[2]);
  });

  it('纬线覆盖经度范围两端，从最小纬度开始排列', () => {
    const firstLatLine = lngLineCount * 2 * 3;
    expect(vertices[firstLatLine]).toBeCloseTo(projectGeoX(GEO_GRID_LNG_MIN), 6);
    expect(vertices[firstLatLine + 2]).toBeCloseTo(projectGeoZ(GEO_GRID_LAT_MIN), 6);
    expect(vertices[firstLatLine + 3]).toBeCloseTo(projectGeoX(GEO_GRID_LNG_MAX), 6);
    expect(vertices[firstLatLine + 5]).toBeCloseTo(projectGeoZ(GEO_GRID_LAT_MIN), 6);
  });
});

describe('中国轮廓顶点', () => {
  it('非 FeatureCollection 输入返回空数组', () => {
    expect(buildGeoOutlineVertices(null)).toEqual([]);
    expect(buildGeoOutlineVertices({ type: 'Polygon' })).toEqual([]);
  });

  it('Polygon 环按边展平，每个顶点落在轮廓高度上', () => {
    const vertices = buildGeoOutlineVertices({
      type: 'FeatureCollection',
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[100, 30], [110, 30], [110, 40], [100, 40]]],
          },
        },
      ],
    });
    // 4 个点未闭合 → 4 段 × 2 顶点 × 3 分量
    expect(vertices.length).toBe(24);
    for (let i = 1; i < vertices.length; i += 3) {
      expect(vertices[i]).toBe(GEO_OUTLINE_Y);
    }
    expect(vertices[0]).toBeCloseTo(projectGeoX(100), 6);
    expect(vertices[2]).toBeCloseTo(projectGeoZ(30), 6);
  });

  it('首尾重复的环不再补零长度段', () => {
    const vertices = buildGeoOutlineVertices({
      type: 'FeatureCollection',
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[100, 30], [110, 30], [110, 40], [100, 30]]],
          },
        },
      ],
    });
    expect(vertices.length).toBe(18);
  });

  it('MultiPolygon 与 MultiLineString 均被展平', () => {
    const vertices = buildGeoOutlineVertices({
      type: 'FeatureCollection',
      features: [
        {
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[100, 30], [105, 30], [105, 35]]],
              [[[110, 30], [115, 30], [115, 35]]],
            ],
          },
        },
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [[120, 20], [121, 21], [122, 22]],
              [[123, 23], [124, 24]],
            ],
          },
        },
      ],
    });
    // 两个三角环各 3 段 + 折线 2 段 + 1 段
    expect(vertices.length).toBe((3 + 3 + 2 + 1) * 2 * 3);
  });
});

describe('地理布局相机取景', () => {
  it('无坐标时返回 null', () => {
    expect(computeGeoFrame([])).toBeNull();
  });

  it('取包围盒中心为注视点，相机高度不低于 40', () => {
    const frame = computeGeoFrame([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 4 },
    ]);
    expect(frame).not.toBeNull();
    expect(frame!.target).toEqual({ x: 2, y: 0, z: 2 });
    // 半径 2 → 1.6 倍 = 3.2，取下限 40
    expect(frame!.camera).toEqual({ x: 2, y: 40, z: 42 });
  });

  it('范围较大时相机高度按半径 1.6 倍抬升，并位于注视点后上方', () => {
    const frame = computeGeoFrame([
      { x: -100, y: 0, z: -50 },
      { x: 100, y: 0, z: 50 },
    ]);
    expect(frame!.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(frame!.camera.x).toBe(0);
    expect(frame!.camera.y).toBeCloseTo(160, 6);
    expect(frame!.camera.z).toBeCloseTo(160, 6);
  });

  it('仅 y 轴偏移不应影响水平取景范围', () => {
    const flat = computeGeoFrame([
      { x: -1, y: -1.5, z: 0 },
      { x: 1, y: 1.5, z: 0 },
    ]);
    expect(flat!.camera.y).toBe(40);
    expect(flat!.target).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('散气检测判定', () => {
  it('星系布局且相机静止时应允许检测', () => {
    expect(canCheckDivergence('spiral', false)).toBe(true);
  });

  it('地理布局下不允许检测', () => {
    expect(canCheckDivergence('geo', false)).toBe(false);
  });

  it('相机动画期间不允许检测，避免路过阈值误触发散气', () => {
    expect(canCheckDivergence('spiral', true)).toBe(false);
    expect(canCheckDivergence('geo', true)).toBe(false);
  });
});
