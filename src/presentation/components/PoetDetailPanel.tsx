'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import { DataLoader, type Journey } from '@/infrastructure/data/DataLoader';
import { toSimplified } from '@/infrastructure/text/t2s';
import { CompositionRoot } from '@/di/composition-root';
import { useGalaxyStore, type RelationItem } from '@/presentation/store/galaxyStore';
import { WorkRecitation } from './WorkRecitation';
import { JourneyMap } from './JourneyMap';
import { RelationGraph, type RelationGraphEntry } from './RelationGraph';

interface WorkItem {
  id: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: string;
  genre: string;
  text: string;
}

interface PoetScoreFactors {
  talent?: Record<string, number>;
  popularity?: Record<string, number>;
  luck?: Record<string, number>;
  algorithmVersion?: string;
}

interface PoetDetail {
  id: string;
  name: string;
  dynasty: string;
  biography: string;
  workCount: number;
  hometown?: string | null;
  hometownLatitude?: number | null;
  hometownLongitude?: number | null;
  talent?: number;
  popularity?: number;
  luck?: number;
  factors?: PoetScoreFactors;
}

interface PoetDetailPanelProps {
  poet: PoetDetail;
  relations?: RelationItem[] | null;
  onFocusPoet?: (poetId: string) => void;
  onCompare?: () => void;
  onClose: () => void;
}

/** 关系类型 → 中文标签与徽标色 */
const RELATION_LABELS: Record<string, { label: string; className: string }> = {
  FRIEND: { label: '友朋', className: 'text-[#5fb8a8] border-[#5fb8a8]/40' },
  TEACHER_STUDENT: { label: '师承', className: 'text-[#c98a4b] border-[#c98a4b]/40' },
  INFLUENCE: { label: '化用', className: 'text-[#a8bfd4] border-[#a8bfd4]/40' },
  SAME_SCHOOL: { label: '同门', className: 'text-[#9b7ede] border-[#9b7ede]/40' },
  SAME_DYNASTY: { label: '同代', className: 'text-[#8a8578] border-[#8a8578]/40' },
  CITATION: { label: '引用', className: 'text-[#d9b45b] border-[#d9b45b]/40' },
  ANTHOLOGY: { label: '选本', className: 'text-[#b08fb0] border-[#b08fb0]/40' },
  SAME_HOMETOWN: { label: '同乡', className: 'text-[#7fa87f] border-[#7fa87f]/40' },
};

const RELATION_LIST_LIMIT = 12;

/** 评分因子中文名（算法未收录的因子直接显示原键名） */
const SCORE_FACTOR_LABELS: Record<string, string> = {
  lexicalUniqueness: '词汇独特性',
  imageryNovelty: '意象新颖度',
  genreInnovation: '体裁创新',
  citationCount: '后世引用',
  textbookCount: '教材收录',
  searchHeat: '搜索热度',
  politicalEnvironment: '时代机遇',
  rediscoveryEvents: '重被发现',
};

const SCORE_DIMENSION_LABELS: Record<'talent' | 'popularity' | 'luck', string> = {
  talent: '才气',
  popularity: '人气',
  luck: '运气',
};

function formatFactorValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function PoetDetailPanel({ poet, relations, onFocusPoet, onCompare, onClose }: PoetDetailPanelProps) {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [settledWorkId, setSettledWorkId] = useState<string | null>(null);
  const [expandedRelation, setExpandedRelation] = useState<string | null>(null);
  const [showScoreFactors, setShowScoreFactors] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const favoriteUseCase = useRef(CompositionRoot.getInstance().favoritePoetsUseCase);
  const poetMap = useGalaxyStore((s) => s.poetMap);

  // 详情面板标签页：概览 / 行迹 / 关系图谱
  // 切换诗人时由父组件以 key={poet.id} 重挂载，状态自然归位为「概览」
  const [tab, setTab] = useState<'overview' | 'journey' | 'relation'>('overview');

  // 行迹数据集（代表性诗人精选）；按诗人姓名（繁简归一）匹配
  const [journeyMap, setJourneyMap] = useState<Record<string, Journey>>({});
  useEffect(() => {
    let alive = true;
    DataLoader.getInstance()
      .loadJourneys()
      .then((js) => {
        if (!alive) return;
        const m: Record<string, Journey> = {};
        for (const j of js) m[toSimplified(j.name)] = j;
        setJourneyMap(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const journey = useMemo<Journey | null>(
    () => journeyMap[toSimplified(poet.name)] ?? null,
    [journeyMap, poet.name]
  );

  useEffect(() => {
    setIsFavorite(favoriteUseCase.current.isFavorite(poet.id));
  }, [poet.id]);

  // 当前聚焦的对端诗人解析（sourceId/targetId 均为节点 ID：node_poet_xxx）
  const focusNodeId = `node_${poet.id}`;
  type RelationEntry = { pairKey: string; otherPoetId: string } & RelationItem;
  const relationEntries: RelationEntry[] = (relations ?? []).map((r) => {
    const otherNodeId = r.sourceId === focusNodeId ? r.targetId : r.sourceId;
    const otherPoetId = otherNodeId.startsWith('node_') ? otherNodeId.slice(5) : otherNodeId;
    return {
      pairKey: [r.sourceId, r.targetId].sort().join('|') + `|${r.type}`,
      otherPoetId,
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.type,
      weight: r.weight,
      evidence: r.evidence,
    };
  });
  const relationEntriesList = relationEntries
    .filter((e) => e.otherPoetId !== poet.id && !!poetMap[e.otherPoetId])
    // 同对诗人同类型可能存在双向两条边，保留权重高者
    .reduce<Map<string, RelationEntry>>((acc, e) => {
      const exist = acc.get(e.pairKey);
      if (!exist || e.weight > exist.weight) acc.set(e.pairKey, e);
      return acc;
    }, new Map());
  const sortedRelations = [...relationEntriesList.values()].sort((a, b) => b.weight - a.weight);
  const visibleRelations = sortedRelations.slice(0, RELATION_LIST_LIMIT);

  /** 关系图谱所需的扁平条目（已去重、按权重排序，且对端诗人存在于 poetMap） */
  const relationGraphEntries: RelationGraphEntry[] = sortedRelations.map((e) => ({
    otherPoetId: e.otherPoetId,
    type: e.type,
    weight: e.weight,
    evidence: e.evidence,
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      setWorks([]);
      setSelectedWork(null);
      if (!poet.id) return;
      setLoadingWorks(true);
      DataLoader.getInstance().loadWorkShard(poet.id)
        .then((shard) => {
          setWorks(shard.works);
        })
        .catch(() => {})
        .finally(() => setLoadingWorks(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [poet.id]);

  useEffect(() => {
    if (!selectedWork) return;
    const raf = requestAnimationFrame(() => setSettledWorkId(selectedWork.id));
    return () => cancelAnimationFrame(raf);
  }, [selectedWork]);

  const isTransitioning = !!selectedWork && settledWorkId !== selectedWork.id;

  // 同名作品较多时（词牌作标题），用首句作副标题区分
  const titleCounts = new Map<string, number>();
  for (const work of works) {
    titleCounts.set(work.title, (titleCounts.get(work.title) ?? 0) + 1);
  }

  if (selectedWork) {
    return (
      <div className="absolute inset-x-0 bottom-0 sm:right-4 sm:top-4 sm:inset-x-auto text-[#E8E0D0] p-5 sm:p-7 rounded-t-2xl sm:rounded-2xl w-full sm:w-[36rem] max-h-[75vh] sm:max-h-[85vh] overflow-y-auto border border-[#2A2820] shadow-xl"
        style={{ background: 'rgba(10,10,18,0.92)', backdropFilter: 'blur(16px)' }}>
        <div className="sm:hidden flex justify-center mb-4 pt-1">
          <div className="w-8 h-1 rounded-full bg-white/10"></div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedWork(null)}
            className="flex items-center gap-1.5 text-[#E8E0D0]/40 hover:text-[#E8E0D0]/70 transition-colors text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <button onClick={onClose}
            className="text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60 transition-colors p-1 ml-auto">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`transition-opacity duration-400 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
          <h3 className="text-lg sm:text-xl font-serif tracking-wider text-[#E8E0D0]/90 leading-snug">
            {selectedWork.title}
          </h3>

          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-[#C23B22]/60 to-transparent"></div>
            <span className="text-xs text-[#E8E0D0]/30 font-mono tracking-widest">●</span>
            <div className="h-px flex-1 bg-gradient-to-l from-[#B68B5C]/40 to-transparent"></div>
          </div>

          <p className="text-xs text-[#E8E0D0]/40 mb-6 tracking-wider">
            {selectedWork.poetName} · {getDynastyName(selectedWork.dynasty)}
          </p>

          <WorkRecitation text={selectedWork.text} title={selectedWork.title} />

          <div className="mt-8 flex justify-end">
            <span className="inline-block w-6 h-6 border border-[#C23B22]/50 text-[#C23B22]/60 text-[10px] flex items-center justify-center font-serif tracking-widest"
              style={{ fontFamily: 'serif' }}>文</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 sm:right-4 sm:top-4 sm:inset-x-auto text-[#E8E0D0] p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl w-full sm:w-80 max-h-[65vh] sm:max-h-[80vh] overflow-y-auto border border-[#2A2820] shadow-xl"
      style={{ background: 'rgba(10,10,18,0.88)', backdropFilter: 'blur(14px)' }}>
      <div className="sm:hidden flex justify-center mb-3 pt-1">
        <div className="w-8 h-1 rounded-full bg-white/10"></div>
      </div>

      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="text-xl font-serif tracking-wider text-[#E8E0D0]/90">{poet.name}</h3>
          <div className="mt-2 w-8 h-0.5 bg-gradient-to-r from-[#C23B22]/70 to-transparent"></div>
        </div>
        <div className="flex items-center gap-1 -mr-1">
          <button
            onClick={onCompare}
            disabled={!onCompare || sortedRelations.length === 0}
            className="p-1 text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            title="与关联诗人对比（三气雷达 + 关系网叠加）"
            aria-label="与关联诗人对比"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7h9M8 7a3 3 0 100 6 3 3 0 000-6zm-1 9c-2.2 0-4 1.3-4 3v2h9v-2c0-1.7-1.8-3-4-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 4h4v4" />
            </svg>
          </button>
          <button
            onClick={() => {
              const added = favoriteUseCase.current.toggle({ id: poet.id, name: poet.name, dynasty: poet.dynasty });
              setIsFavorite(added);
            }}
            className={`p-1 transition-colors ${isFavorite ? 'text-[#B68B5C]' : 'text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60'}`}
            title={isFavorite ? '取消收藏' : '收藏到我的星单'}
            aria-label={isFavorite ? '取消收藏' : '收藏到我的星单'}
          >
            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <button onClick={onClose}
            className="text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60 transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 标签页：概览 / 行迹 / 关系图谱 */}
      <div className="flex gap-1 mb-4 rounded-lg border border-[#2A2820] bg-white/[0.02] p-1">
        {(
          [
            { key: 'overview', label: '概览' },
            { key: 'journey', label: '行迹' },
            { key: 'relation', label: '关系图谱' },
          ] as const
        ).map((t) => {
          const activeTab = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                activeTab
                  ? 'bg-[#C23B22]/15 text-[#E8E0D0]/90'
                  : 'text-[#E8E0D0]/40 hover:text-[#E8E0D0]/70'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-1">朝代</p>
          <p className="text-[#E8E0D0]/70 font-medium">{getDynastyName(poet.dynasty)}</p>
        </div>

        {poet.hometown && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-1">籍贯</p>
            <p className="text-[#E8E0D0]/70 font-medium">{poet.hometown}</p>
            {poet.hometownLatitude != null && poet.hometownLongitude != null && (
              <a
                href={`https://uri.amap.com/marker?position=${poet.hometownLongitude},${poet.hometownLatitude}&name=${encodeURIComponent(poet.hometown)}&coordinate=gps&callnative=0`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[10px] text-[#a8bfd4]/70 hover:text-[#a8bfd4] transition-colors"
                title="在高德地图中查看该籍贯位置（WGS84 坐标）"
              >
                在地图查看 · {poet.hometownLatitude.toFixed(3)}, {poet.hometownLongitude.toFixed(3)}
              </a>
            )}
          </div>
        )}

        {poet.biography && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-1">简介</p>
            <p className="text-xs text-[#E8E0D0]/50 leading-relaxed">
              {poet.biography.substring(0, 200)}
              {poet.biography.length > 200 ? '...' : ''}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-1">作品</p>
          <p className="text-[#E8E0D0]/70 font-medium">{poet.workCount} 首</p>
        </div>

        {poet.talent !== undefined && (
          <div className="pt-4 border-t border-[#2A2820]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-3">三气评分</p>
            <div className="space-y-3">
              <ScoreBar label="才气" value={poet.talent} />
              <ScoreBar label="人气" value={poet.popularity ?? 0} />
              <ScoreBar label="运气" value={poet.luck ?? 0} rangeMin={-50} rangeMax={50} />
            </div>

            {poet.factors && (
              <div className="mt-3">
                <button
                  onClick={() => setShowScoreFactors((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-[#B68B5C]/70 hover:text-[#B68B5C] transition-colors"
                >
                  {showScoreFactors ? '收起评分构成' : '查看评分构成'}
                  <svg
                    className={`w-3 h-3 transition-transform ${showScoreFactors ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showScoreFactors && (
                  <div className="mt-2 space-y-3 rounded border border-[#2A2820] bg-white/[0.02] p-2.5">
                    {(Object.keys(SCORE_DIMENSION_LABELS) as Array<keyof typeof SCORE_DIMENSION_LABELS>).map((dimension) => {
                      const factors = poet.factors?.[dimension];
                      if (!factors || Object.keys(factors).length === 0) return null;
                      return (
                        <div key={dimension}>
                          <p className="text-[10px] text-[#E8E0D0]/35 mb-1">{SCORE_DIMENSION_LABELS[dimension]}</p>
                          <div className="space-y-1">
                            {Object.entries(factors).map(([key, value]) => (
                              <div key={key} className="flex items-baseline justify-between gap-2 text-[11px]">
                                <span className="text-[#E8E0D0]/45">{SCORE_FACTOR_LABELS[key] ?? key}</span>
                                <span className="font-mono text-[#E8E0D0]/60">{formatFactorValue(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {poet.factors.algorithmVersion && (
                      <p className="text-[10px] text-[#E8E0D0]/20">算法版本 {poet.factors.algorithmVersion}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {sortedRelations.length > 0 && (
          <div className="pt-4 border-t border-[#2A2820]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-3">
              文脉关系 {sortedRelations.length > RELATION_LIST_LIMIT ? `· 共 ${sortedRelations.length} 条` : ''}
            </p>
            <div className="space-y-0.5 max-h-44 overflow-y-auto scrollbar-thin">
              {visibleRelations.map((entry) => {
                const meta = RELATION_LABELS[entry.type];
                const other = poetMap[entry.otherPoetId];
                const expanded = expandedRelation === entry.pairKey;
                const evidenceText = entry.evidence?.titles?.[0] ?? entry.evidence?.quote ?? '';
                return (
                  <div key={entry.pairKey}>
                    <div
                      onClick={() => setExpandedRelation(expanded ? null : entry.pairKey)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] cursor-pointer transition-all"
                    >
                      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 border rounded ${meta?.className ?? 'text-[#E8E0D0]/40 border-white/10'}`}>
                        {meta?.label ?? entry.type}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFocusPoet?.(entry.otherPoetId);
                        }}
                        className="min-w-0 flex-1 text-left text-sm text-[#E8E0D0]/70 truncate hover:text-[#E8E0D0]/90 transition-colors"
                      >
                        {other.name}
                      </button>
                      <span className="shrink-0 text-[10px] text-[#E8E0D0]/25">{getDynastyName(other.dynasty)}</span>
                    </div>
                    {expanded && (evidenceText || entry.evidence?.kind) && (
                      <p className="px-2 pb-2 text-xs text-[#E8E0D0]/35 leading-relaxed">
                        {entry.evidence?.kind}
                        {evidenceText ? ` · 「${evidenceText}」` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
              {sortedRelations.length > RELATION_LIST_LIMIT && (
                <p className="text-xs text-[#E8E0D0]/20 text-center pt-2">...尚有 {sortedRelations.length - RELATION_LIST_LIMIT} 条</p>
              )}
            </div>
          </div>
        )}

        {loadingWorks && (
          <div className="pt-4 border-t border-[#2A2820]">
            <p className="text-xs text-[#E8E0D0]/30">加载作品中...</p>
          </div>
        )}

        {!loadingWorks && works.length > 0 && (
          <div className="pt-4 border-t border-[#2A2820]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-3">作品列表</p>
            <div className="space-y-0.5 max-h-36 overflow-y-auto scrollbar-thin">
              {works.slice(0, 30).map((work) => (
                <div
                  key={work.id}
                  onClick={() => setSelectedWork(work)}
                  className="flex items-start gap-2.5 px-2 py-2 rounded hover:bg-white/[0.03] cursor-pointer transition-all group"
                >
                  <span className="mt-[5px] w-1.5 h-1.5 shrink-0 bg-[#C23B22]/50 group-hover:bg-[#C23B22]/80 transition-colors"></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#E8E0D0]/70 truncate group-hover:text-[#E8E0D0]/90 transition-colors">
                      {formatWorkTitle(work, titleCounts)}
                    </p>
                    <p className="text-xs text-[#E8E0D0]/25 truncate mt-0.5">
                      {work.text ? work.text.substring(0, 50).replace(/[？。！；，、\n]/g, ' ') : ''}
                    </p>
                  </div>
                </div>
              ))}
              {works.length > 30 && (
                <p className="text-xs text-[#E8E0D0]/20 text-center pt-2">...尚有 {works.length - 30} 首</p>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {tab === 'journey' && <JourneyMap journey={journey} />}
      {tab === 'relation' && (
        <RelationGraph
          entries={relationGraphEntries}
          poetMap={poetMap}
          onFocusPoet={onFocusPoet}
        />
      )}
    </div>
  );
}

/** 取正文首句片段，用于区分同名作品 */
function firstPhrase(text: string): string {
  const phrase = (text.split(/[，。、；？！：\s]/)[0] ?? '').trim();
  return phrase.length > 8 ? phrase.slice(0, 8) : phrase;
}

/** 同名作品追加首句副标题（标题已带题目时不再追加） */
function formatWorkTitle(work: WorkItem, counts: Map<string, number>): string {
  const title = work.title;
  const duplicated = (counts.get(title) ?? 0) > 1;
  const first = firstPhrase(work.text ?? '');
  if (!duplicated || !first || title.includes('·') || title.includes('・')) return title;
  return `${title} · ${first}`;
}

function ScoreBar({ label, value, rangeMin = 0, rangeMax = 100 }: {
  label: string; value: number; rangeMin?: number; rangeMax?: number;
}) {
  const width = ((value - rangeMin) / (rangeMax - rangeMin)) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#E8E0D0]/40">{label}</span>
        <span className="text-[#E8E0D0]/50 font-mono text-[11px]">{value}</span>
      </div>
      <div className="w-full bg-white/5 h-px overflow-hidden">
        <div className="bg-gradient-to-r from-[#B68B5C]/60 to-[#B68B5C]/20 h-px transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, width))}%` }}></div>
      </div>
    </div>
  );
}
