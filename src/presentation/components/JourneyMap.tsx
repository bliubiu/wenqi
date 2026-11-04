'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Journey } from '@/infrastructure/data/DataLoader';

/** 投影边界（经纬度），对齐裁剪后的中国轮廓与全部行迹点并留边距 */
const LNG_MIN = 70;
const LNG_MAX = 137;
const LAT_MIN = 16;
const LAT_MAX = 55;
const VIEW_W = 1000;
const VIEW_H = Math.round((VIEW_W * (LAT_MAX - LAT_MIN)) / (LNG_MAX - LNG_MIN));

/** 经纬度 → SVG 坐标（等距圆柱投影，北在上） */
function project(lng: number, lat: number): [number, number] {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VIEW_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VIEW_H;
  return [x, y];
}

/** 阶段类型 → 徽标色（与文气视觉一致） */
const KIND_COLORS: Record<string, string> = {
  出生: '#C23B22',
  成长: '#B68B5C',
  游历: '#5fb8a8',
  任职: '#a8bfd4',
  贬谪: '#c98a4b',
  隐居: '#9b7ede',
  卒: '#d9b45b',
  其他: '#8a8578',
};

interface ChinaGeoFeature {
  geometry?: { type?: string; coordinates?: unknown };
}

function ringToPath(ring: unknown): string | null {
  if (!Array.isArray(ring)) return null;
  const pts = (ring as unknown[])
    .filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
    .map(([lng, lat]) => project(lng, lat).map((v) => v.toFixed(1)).join(','));
  if (pts.length < 2) return null;
  return 'M' + pts.join('L') + 'Z';
}

/** 将中国轮廓 GeoJSON 转为 SVG path 集合 */
function geojsonToPaths(geojson: { features?: ChinaGeoFeature[] }): string[] {
  const paths: string[] = [];
  for (const f of geojson.features ?? []) {
    const g = f.geometry;
    if (!g || typeof g.type !== 'string') continue;
    const coords = g.coordinates as unknown;
    if (g.type === 'Polygon' && Array.isArray(coords)) {
      for (const ring of coords as unknown[]) {
        const d = ringToPath(ring);
        if (d) paths.push(d);
      }
    } else if (g.type === 'MultiPolygon' && Array.isArray(coords)) {
      for (const poly of coords as unknown[]) {
        if (!Array.isArray(poly)) continue;
        for (const ring of poly as unknown[]) {
          const d = ringToPath(ring);
          if (d) paths.push(d);
        }
      }
    }
  }
  return paths;
}

let geoCache: Promise<string[]> | null = null;
function loadChinaPaths(): Promise<string[]> {
  if (!geoCache) {
    geoCache = fetch('/data/geo/china.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('地图底图加载失败'))))
      .then((gj) => geojsonToPaths(gj as { features?: ChinaGeoFeature[] }))
      .catch(() => []);
  }
  return geoCache;
}

interface JourneyMapProps {
  journey: Journey | null;
}

export function JourneyMap({ journey }: JourneyMapProps) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [activeSeq, setActiveSeq] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadChinaPaths().then((p) => {
      if (alive) setPaths(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const stagePoints = useMemo(
    () => (journey ? journey.stages.map((s) => ({ stage: s, xy: project(s.lng, s.lat) })) : []),
    [journey]
  );

  const polyline = useMemo(
    () => (stagePoints.length > 1 ? stagePoints.map((p) => p.xy.map((v) => v.toFixed(1)).join(',')).join(' ') : ''),
    [stagePoints]
  );

  if (!journey) {
    return (
      <div className="text-xs text-[#E8E0D0]/35 leading-relaxed py-8 text-center">
        暂无该行迹数据
        <br />
        <span className="text-[#E8E0D0]/25">行迹数据集为代表性诗人精选（李白、杜甫、苏轼等 19 位），后续可扩展</span>
      </div>
    );
  }

  const birth = journey.stages[0];
  const death = journey.stages[journey.stages.length - 1];

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#E8E0D0]/45 leading-relaxed">{journey.summary}</p>

      <div className="rounded-lg overflow-hidden border border-[#2A2820] bg-[#0c0c14]">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto block" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          {/* 经纬网格（每 10°） */}
          <g stroke="#E8E0D0" strokeOpacity={0.05} strokeWidth={0.6}>
            {Array.from({ length: Math.floor((LNG_MAX - LNG_MIN) / 10) + 1 }, (_, i) => {
              const lng = LNG_MIN + i * 10;
              const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VIEW_W;
              return <line key={`v${i}`} x1={x} y1={0} x2={x} y2={VIEW_H} />;
            })}
            {Array.from({ length: Math.floor((LAT_MAX - LAT_MIN) / 10) + 1 }, (_, i) => {
              const lat = LAT_MAX - i * 10;
              const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VIEW_H;
              return <line key={`h${i}`} x1={0} y1={y} x2={VIEW_W} y2={y} />;
            })}
          </g>

          {/* 中国轮廓 */}
          {paths?.map((d, i) => (
            <path key={i} d={d} fill="#1b1b24" stroke="#3a3a48" strokeWidth={0.8} strokeLinejoin="round" />
          ))}

          {/* 行迹折线 */}
          {polyline && (
            <polyline
              points={polyline}
              fill="none"
              stroke="url(#wenqiJourneyGradient)"
              strokeWidth={1.6}
              strokeOpacity={0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          <defs>
            <linearGradient id="wenqiJourneyGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#C23B22" />
              <stop offset="100%" stopColor="#B68B5C" />
            </linearGradient>
          </defs>

          {/* 停靠点 */}
          {stagePoints.map(({ stage, xy }) => {
            const isBirth = stage.seq === birth.seq;
            const isDeath = stage.seq === death.seq;
            const active = activeSeq === stage.seq;
            const color = KIND_COLORS[stage.kind] ?? KIND_COLORS['其他'];
            const r = isBirth || isDeath ? 5 : 3.6;
            return (
              <g
                key={stage.seq}
                transform={`translate(${xy[0]},${xy[1]})`}
                className="cursor-pointer"
                onMouseEnter={() => setActiveSeq(stage.seq)}
                onMouseLeave={() => setActiveSeq(null)}
              >
                {(isBirth || isDeath) && (
                  <circle r={r + 3} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.5} />
                )}
                <circle r={r} fill={color} fillOpacity={active ? 1 : 0.85} stroke="#0c0c14" strokeWidth={0.8} />
                <text
                  x={0}
                  y={-r - 2}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#E8E0D0"
                  fillOpacity={0.7}
                  fontFamily="serif"
                >
                  {stage.seq + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#E8E0D0]/50">
        {Object.entries(KIND_COLORS)
          .filter(([k]) => journey.stages.some((s) => s.kind === k))
          .map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: c }} />
              {k}
            </span>
          ))}
      </div>

      {/* 阶段时间轴 */}
      <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-0.5 pr-1">
        {journey.stages.map((s) => {
          const active = activeSeq === s.seq;
          const color = KIND_COLORS[s.kind] ?? KIND_COLORS['其他'];
          return (
            <button
              key={s.seq}
              onMouseEnter={() => setActiveSeq(s.seq)}
              onMouseLeave={() => setActiveSeq(null)}
              className={`w-full text-left px-2 py-1.5 rounded flex items-start gap-2 transition-colors ${
                active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <span
                className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-[#0c0c14] font-serif"
                style={{ background: color }}
              >
                {s.seq + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-[10px] text-[#E8E0D0]/35 font-mono">{s.era}</span>
                  <span className="text-sm text-[#E8E0D0]/75 truncate">{s.place}</span>
                  <span className="text-[10px] text-[#E8E0D0]/30 shrink-0">{s.modern}</span>
                </span>
                <span className="block text-xs text-[#E8E0D0]/40 leading-snug mt-0.5">{s.event}</span>
                {s.poem && (
                  <span className="block text-[11px] text-[#B68B5C]/60 leading-snug mt-0.5 font-serif">
                    「{s.poem}」
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
