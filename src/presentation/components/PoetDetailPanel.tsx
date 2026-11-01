'use client';

import { useEffect, useState, useRef } from 'react';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import { DataLoader } from '@/infrastructure/data/DataLoader';

interface WorkItem {
  id: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: string;
  genre: string;
  text: string;
}

interface PoetDetail {
  id: string;
  name: string;
  dynasty: string;
  biography: string;
  workCount: number;
  talent?: number;
  popularity?: number;
  luck?: number;
}

interface PoetDetailPanelProps {
  poet: PoetDetail;
  onClose: () => void;
}

function formatPoemText(text: string): string {
  return text
    .replace(/？/g, '？\n')
    .replace(/。/g, '。\n')
    .replace(/！/g, '！\n')
    .replace(/；/g, '；\n')
    .trim();
}

export function PoetDetailPanel({ poet, onClose }: PoetDetailPanelProps) {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const prevWorkRef = useRef<WorkItem | null>(null);

  useEffect(() => {
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
  }, [poet.id]);

  const isTransitioning = selectedWork && prevWorkRef.current?.id !== selectedWork.id;
  prevWorkRef.current = selectedWork;

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

          <div className="relative pl-4 border-l border-[#2A2820]">
            <div className="text-base sm:text-lg font-serif text-[#E8E0D0]/80 leading-[2.2] whitespace-pre-line tracking-wider">
              {formatPoemText(selectedWork.text)}
            </div>
          </div>

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
        <button onClick={onClose}
          className="text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60 transition-colors p-1 -mr-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8E0D0]/30 mb-1">朝代</p>
          <p className="text-[#E8E0D0]/70 font-medium">{getDynastyName(poet.dynasty)}</p>
        </div>

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
              <ScoreBar label="才气 Y" value={poet.talent} />
              <ScoreBar label="人气 Z" value={poet.popularity ?? 0} />
              <ScoreBar label="运气 X" value={poet.luck ?? 0} rangeMin={-50} rangeMax={50} />
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
                      {work.title}
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
    </div>
  );
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
