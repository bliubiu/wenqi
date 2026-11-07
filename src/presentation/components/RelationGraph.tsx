'use client';

import { useMemo, useState } from 'react';
import { CATEGORY_META, categoryOf, type RelationCategory } from './relationCategories';

export interface RelationGraphEntry {
  otherPoetId: string;
  type: string;
  weight: number;
  evidence?: { kind?: string; titles?: string[]; quote?: string };
}

export interface RelationGraphProps {
  entries: RelationGraphEntry[];
  poetMap: Record<string, { name: string; dynasty: string }>;
  onFocusPoet?: (poetId: string) => void;
}

const VIEW = 320;
const CENTER = VIEW / 2;
const RADIUS = 122;
const MAX_NODES = 28;

interface PlacedNode extends RelationGraphEntry {
  x: number;
  y: number;
  name: string;
  category: RelationCategory;
}

function firstChar(name: string): string {
  return (name ?? '?').slice(0, 1);
}

export function RelationGraph({ entries, poetMap, onFocusPoet }: RelationGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const placed = useMemo<PlacedNode[]>(() => {
    const valid = entries
      .filter((e) => poetMap[e.otherPoetId])
      .slice(0, MAX_NODES);
    const n = valid.length;
    return valid.map((e, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
      return {
        ...e,
        name: poetMap[e.otherPoetId].name,
        category: categoryOf(e.type),
        x: CENTER + RADIUS * Math.cos(angle),
        y: CENTER + RADIUS * Math.sin(angle),
      };
    });
  }, [entries, poetMap]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of placed) {
      const c = categoryOf(e.type);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [placed]);

  if (entries.length === 0) {
    return (
      <div data-testid="relation-graph-empty" className="text-xs text-[#E8E0D0]/35 leading-relaxed py-8 text-center">
        暂无关系数据
        <br />
        <span className="text-[#E8E0D0]/25">可切换「概览」查看已挖掘的文脉关系</span>
      </div>
    );
  }

  const hoveredEntry = hovered ? placed.find((p) => p.otherPoetId === hovered) : null;

  return (
    <div data-testid="relation-graph" className="space-y-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#E8E0D0]/55">
        {(Object.keys(CATEGORY_META) as RelationCategory[])
          .filter((c) => (categoryCounts[c] ?? 0) > 0)
          .map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_META[c].color }} />
              {CATEGORY_META[c].label}
              <span className="text-[#E8E0D0]/35">{categoryCounts[c]}</span>
            </span>
          ))}
      </div>

      <div className="rounded-lg overflow-hidden border border-[#2A2820] bg-[#0c0c14]">
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="w-full h-auto block" style={{ aspectRatio: '1 / 1' }}>
          {/* 边 */}
          {placed.map((p) => {
            const color = CATEGORY_META[p.category].color;
            const isHot = hovered === p.otherPoetId;
            return (
              <line
                key={`e-${p.otherPoetId}-${p.type}`}
                x1={CENTER}
                y1={CENTER}
                x2={p.x}
                y2={p.y}
                stroke={color}
                strokeOpacity={hovered && !isHot ? 0.12 : 0.45}
                strokeWidth={0.6 + p.weight * 2}
              />
            );
          })}

          {/* 中心：聚焦诗人 */}
          <circle cx={CENTER} cy={CENTER} r={14} fill="#C23B22" fillOpacity={0.9} stroke="#0c0c14" strokeWidth={1} />
          <text x={CENTER} y={CENTER + 4} textAnchor="middle" fontSize={13} fill="#0c0c14" fontFamily="serif" fontWeight={600}>
            我
          </text>

          {/* 关联节点 */}
          {placed.map((p) => {
            const color = CATEGORY_META[p.category].color;
            const isHot = hovered === p.otherPoetId;
            return (
              <g
                key={p.otherPoetId}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(p.otherPoetId)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onFocusPoet?.(p.otherPoetId)}
              >
                <circle
                  r={isHot ? 11 : 9}
                  fill={color}
                  fillOpacity={hovered && !isHot ? 0.35 : 0.9}
                  stroke="#0c0c14"
                  strokeWidth={1}
                />
                <text x={0} y={4} textAnchor="middle" fontSize={10} fill="#0c0c14" fontFamily="serif" fontWeight={600}>
                  {firstChar(p.name)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 悬浮信息 / 提示 */}
      <div className="text-xs text-[#E8E0D0]/45 leading-snug min-h-[2.5rem]">
        {hoveredEntry ? (
          <span>
            与 <span className="text-[#E8E0D0]/75">{hoveredEntry.name}</span> 的
            <span style={{ color: CATEGORY_META[hoveredEntry.category].color }}>
              【{CATEGORY_META[hoveredEntry.category].label}】
            </span>
            {hoveredEntry.evidence?.kind ? ` · ${hoveredEntry.evidence.kind}` : ''}
            {hoveredEntry.evidence?.titles?.length
              ? ` · 「${hoveredEntry.evidence.titles[0]}」`
              : hoveredEntry.evidence?.quote
                ? ` · ${hoveredEntry.evidence.quote}`
                : ''}
          </span>
        ) : (
          <span className="text-[#E8E0D0]/30">点击任一节点可聚焦该诗人 · 共 {entries.length} 条关系</span>
        )}
      </div>
    </div>
  );
}
