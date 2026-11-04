'use client';

import { useEffect, useRef, useState } from 'react';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import { buildComparisonNetwork, normalizeQi, radarPoints, type ComparisonEdge } from '@/domain/services/PoetComparison';
import { DataLoader, type ScoreResult } from '@/infrastructure/data/DataLoader';
import { CompositionRoot } from '@/di/composition-root';
import { useGalaxyStore, type RelationItem } from '@/presentation/store/galaxyStore';

interface ComparePrimary {
  id: string;
  name: string;
  dynasty: string;
  workCount: number;
  talent?: number;
  popularity?: number;
  luck?: number;
}

interface ComparePanelProps {
  primary: ComparePrimary;
  relations?: RelationItem[] | null;
  onClose: () => void;
}

interface SecondaryDetail {
  name: string;
  dynasty: string;
  workCount: number;
  talent: number;
  popularity: number;
  luck: number;
}

const RELATION_TYPE_LABELS: Record<string, string> = {
  FRIEND: '友朋',
  TEACHER_STUDENT: '师承',
  INFLUENCE: '化用',
  SAME_SCHOOL: '同门',
  SAME_DYNASTY: '同代',
  CITATION: '引用',
  ANTHOLOGY: '选本',
  SAME_HOMETOWN: '同乡',
};

const CANDIDATE_LIMIT = 16;
const CHIP_LIMIT = 12;
const RADAR_SIZE = 200;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 72;

/** 把 node 关系条目归一到「对端诗人 + 类型 + 权重」 */
function toComparisonEdges(relations: RelationItem[], poetId: string): ComparisonEdge[] {
  const selfNodeId = `node_${poetId}`;
  return relations.flatMap((r) => {
    const otherNodeId = r.sourceId === selfNodeId ? r.targetId : r.sourceId;
    if (otherNodeId === selfNodeId) return [];
    const otherPoetId = otherNodeId.startsWith('node_') ? otherNodeId.slice(5) : otherNodeId;
    return [{ otherPoetId, type: r.type, weight: r.weight }];
  });
}

export function ComparePanel({ primary, relations, onClose }: ComparePanelProps) {
  const poetMap = useGalaxyStore((s) => s.poetMap);
  const [secondaryId, setSecondaryId] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<SecondaryDetail | null>(null);
  const [secondaryEdges, setSecondaryEdges] = useState<ComparisonEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const primaryEdges = toComparisonEdges(relations ?? [], primary.id);
  const candidates = [...new Map(primaryEdges.map((e) => [e.otherPoetId, e])).values()]
    .filter((e) => !!poetMap[e.otherPoetId])
    .sort((a, b) => b.weight - a.weight)
    .slice(0, CANDIDATE_LIMIT);

  useEffect(() => () => useGalaxyStore.getState().setComparePoetId(null), []);

  /** 选择对比诗人：同步星图叠加关系流，并加载其关系与三气数据 */
  const selectSecondary = (poetId: string) => {
    setSecondaryId(poetId);
    useGalaxyStore.getState().setComparePoetId(poetId);
    setLoading(true);
    const token = ++requestRef.current;
    const poet = poetMap[poetId];
    Promise.all([
      CompositionRoot.getInstance().getPoetRelationsUseCase.execute(`node_${poetId}`),
      DataLoader.getInstance().loadScores(),
    ])
      .then(([rels, scores]) => {
        if (token !== requestRef.current) return;
        setSecondaryEdges(
          toComparisonEdges(
            rels.map((r) => ({
              sourceId: r.sourceId, targetId: r.targetId, type: r.relationType,
              weight: r.weight, evidence: r.evidence,
            })),
            poetId
          )
        );
        const score = scores.find((s: ScoreResult) => s.poetId === poetId);
        setSecondary({
          name: poet?.name ?? '未知',
          dynasty: poet?.dynasty ?? '',
          workCount: poet?.workCount ?? 0,
          talent: score?.threeQi.talent.value ?? 0,
          popularity: score?.threeQi.popularity.value ?? 0,
          luck: score?.threeQi.luck.value ?? 0,
        });
      })
      .catch(() => {
        if (token === requestRef.current) setSecondaryEdges([]);
      })
      .finally(() => {
        if (token === requestRef.current) setLoading(false);
      });
  };

  const network = buildComparisonNetwork(primaryEdges, secondaryEdges);
  const primaryQi = [primary.talent ?? 0, primary.popularity ?? 0, primary.luck ?? 0] as const;
  const primaryRadar = radarPoints(normalizeQi({ talent: primaryQi[0], popularity: primaryQi[1], luck: primaryQi[2] }),
    RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS);
  const secondaryRadar = secondary
    ? radarPoints(normalizeQi(secondary), RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS)
    : null;

  const nameOf = (poetId: string) => poetMap[poetId]?.name ?? poetId;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-3 py-6 pointer-events-none">
      <div
        className="pointer-events-auto w-full sm:w-[42rem] max-h-[82vh] overflow-y-auto rounded-2xl border border-[#2A2820] text-[#E8E0D0] shadow-2xl"
        style={{ background: 'rgba(10,10,18,0.94)', backdropFilter: 'blur(16px)' }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#2A2820]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30">双诗人对比</p>
            <h3 className="mt-1 text-lg font-serif tracking-wider text-[#E8E0D0]/90">
              {primary.name}
              {secondary ? ` ／ ${secondary.name}` : ''}
            </h3>
          </div>
          <button onClick={onClose} className="text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60 transition-colors p-1" aria-label="关闭对比">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-2">选择对比诗人（主诗人的关联诗人）</p>
            {candidates.length === 0 ? (
              <p className="text-xs text-[#E8E0D0]/35">暂无可用关联诗人</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((edge) => (
                  <button
                    key={edge.otherPoetId}
                    onClick={() => selectSecondary(edge.otherPoetId)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      secondaryId === edge.otherPoetId
                        ? 'border-[#B68B5C]/70 text-[#E8E0D0]/90 bg-[#B68B5C]/10'
                        : 'border-[#2A2820] text-[#E8E0D0]/50 hover:text-[#E8E0D0]/80 hover:border-[#B68B5C]/40'
                    }`}
                  >
                    {nameOf(edge.otherPoetId)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && <p className="text-xs text-[#E8E0D0]/30">加载对比数据中...</p>}

          {secondary && !loading && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center pt-4 border-t border-[#2A2820]">
                <svg width={RADAR_SIZE} height={RADAR_SIZE} role="img" aria-label="三气雷达对比">
                  {[0.33, 0.66, 1].map((ratio) => (
                    <polygon
                      key={ratio}
                      points={radarPoints([ratio, ratio, ratio], RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS)
                        .map((p) => `${p.x},${p.y}`)
                        .join(' ')}
                      fill="none"
                      stroke="#2A2820"
                      strokeWidth={1}
                    />
                  ))}
                  <polygon
                    points={primaryRadar.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(182,139,92,0.22)"
                    stroke="#B68B5C"
                    strokeWidth={1.5}
                  />
                  {secondaryRadar && (
                    <polygon
                      points={secondaryRadar.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="rgba(95,184,168,0.2)"
                      stroke="#5fb8a8"
                      strokeWidth={1.5}
                    />
                  )}
                  {['才气', '人气', '运气'].map((label, index) => {
                    const angle = -Math.PI / 2 + (index / 3) * Math.PI * 2;
                    const x = RADAR_CENTER + Math.cos(angle) * (RADAR_RADIUS + 14);
                    const y = RADAR_CENTER + Math.sin(angle) * (RADAR_RADIUS + 14);
                    return (
                      <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                        fontSize={10} fill="rgba(232,224,208,0.45)">
                        {label}
                      </text>
                    );
                  })}
                </svg>

                <div className="space-y-2 text-xs">
                  <LegendRow color="#B68B5C" label={`${primary.name}（${getDynastyName(primary.dynasty)}）`} />
                  <LegendRow color="#5fb8a8" label={`${secondary.name}（${getDynastyName(secondary.dynasty)}）`} />
                  {(['才气', '人气', '运气'] as const).map((label, index) => {
                    const primaryValue = primaryQi[index];
                    const secondaryValue = [secondary.talent, secondary.popularity, secondary.luck][index];
                    return (
                      <div key={label} className="flex items-center justify-between gap-3 border-t border-[#2A2820] pt-1.5">
                        <span className="text-[#E8E0D0]/40">{label}</span>
                        <span className="font-mono text-[#E8E0D0]/70">
                          {primaryValue} <span className="text-[#E8E0D0]/20">vs</span> {secondaryValue}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-3 border-t border-[#2A2820] pt-1.5">
                    <span className="text-[#E8E0D0]/40">作品</span>
                    <span className="font-mono text-[#E8E0D0]/70">
                      {primary.workCount} <span className="text-[#E8E0D0]/20">vs</span> {secondary.workCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#2A2820] space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30">关系网叠加</p>
                  <p className="text-[10px] text-[#E8E0D0]/25">
                    共同 {network.shared.length} · 独有 {network.primaryOnly.length + network.secondaryOnly.length}
                  </p>
                </div>
                <RelationGroup title={`共同关联 ${network.shared.length}`} edges={network.shared}
                  nameOf={nameOf} tone="text-[#D9B45B]" />
                <RelationGroup title={`仅 ${primary.name} ${network.primaryOnly.length}`} edges={network.primaryOnly}
                  nameOf={nameOf} tone="text-[#B68B5C]" />
                <RelationGroup title={`仅 ${secondary.name} ${network.secondaryOnly.length}`} edges={network.secondaryOnly}
                  nameOf={nameOf} tone="text-[#5fb8a8]" />
                <p className="text-[10px] text-[#E8E0D0]/20">
                  叠加关系流已同步渲染于星图（金色表示共同关联）
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: color, background: `${color}33` }} />
      <span className="text-[#E8E0D0]/55">{label}</span>
    </div>
  );
}

function RelationGroup({ title, edges, nameOf, tone }: {
  title: string;
  edges: ComparisonEdge[];
  nameOf: (poetId: string) => string;
  tone: string;
}) {
  if (edges.length === 0) return null;
  return (
    <div>
      <p className={`text-[11px] mb-1 ${tone}`}>{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {edges.slice(0, CHIP_LIMIT).map((edge) => (
          <span key={`${edge.otherPoetId}-${edge.type}`}
            className="text-[11px] px-1.5 py-0.5 rounded border border-[#2A2820] text-[#E8E0D0]/55">
            {nameOf(edge.otherPoetId)}
            <span className="ml-1 text-[#E8E0D0]/25">{RELATION_TYPE_LABELS[edge.type] ?? edge.type}</span>
          </span>
        ))}
        {edges.length > CHIP_LIMIT && (
          <span className="text-[11px] text-[#E8E0D0]/25">+{edges.length - CHIP_LIMIT}</span>
        )}
      </div>
    </div>
  );
}
