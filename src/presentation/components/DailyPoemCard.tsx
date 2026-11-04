'use client';

import { useEffect, useState } from 'react';
import { DataLoader } from '@/infrastructure/data/DataLoader';
import { pickDailyPoem, monthDayOf, type DailyPoemEntry } from '@/domain/value-objects/DailyPoem';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';

const DISMISS_PREFIX = 'wenqi_daily_dismissed_';

interface DailyPoemCardProps {
  onFocusPoet: (poetId: string) => void;
}

/** 每日一诗：首页左下推荐卡，按当日日期取诗，可关闭至次日 */
export function DailyPoemCard({ onFocusPoet }: DailyPoemCardProps) {
  const [entry, setEntry] = useState<DailyPoemEntry | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    DataLoader.getInstance()
      .loadDailyPoems()
      .then((data) => {
        if (cancelled) return;
        const today = new Date();
        const picked = pickDailyPoem(data.entries, today);
        if (!picked) return;
        setEntry(picked);
        setDismissed(localStorage.getItem(DISMISS_PREFIX + monthDayOf(today)) === '1');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!entry || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_PREFIX + entry.monthDay, '1');
  };

  return (
    <div className="hidden sm:block absolute bottom-14 left-4 z-50 w-72">
      <div className="glass-panel-medium p-4 animate-fade-in-scale">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {entry.tag && (
              <span className="text-caption px-1.5 py-0.5 rounded bg-[#B68B5C]/20 text-[#D8B183]">
                {entry.tag}
              </span>
            )}
            <span className="text-caption text-white/30">每日一诗</span>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-white/25 hover:text-white/60 transition-colors"
            title="今日不再显示"
            aria-label="关闭每日一诗"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-body text-white/85 font-medium truncate">{entry.title}</div>
        <div className="text-caption text-white/40 mb-2">
          {entry.poetName} · {getDynastyName(entry.dynasty)}
        </div>
        <p className="text-caption text-white/55 leading-relaxed mb-3 line-clamp-3">
          {(entry.text || '原文暂缺').slice(0, 60)}
        </p>

        <button
          onClick={() => onFocusPoet(entry.poetId)}
          className="w-full py-1.5 text-caption text-white/70 border border-white/10 rounded hover:bg-white/5 transition-colors"
        >
          在星图中查看
        </button>
      </div>
    </div>
  );
}
