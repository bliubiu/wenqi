'use client';

import { useEffect, useState } from 'react';
import { CompositionRoot } from '@/di/composition-root';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import type { FavoritePoet } from '@/application/usecases/FavoritePoetsUseCase';

interface StarListProps {
  onFocusPoet: (poetId: string) => void;
}

/** 个性化星单：收藏诗人列表，一键聚焦 */
export function StarList({ onFocusPoet }: StarListProps) {
  const [open, setOpen] = useState(false);
  const [useCase] = useState(() => CompositionRoot.getInstance().favoritePoetsUseCase);
  const [items, setItems] = useState<FavoritePoet[]>(() => useCase.list());

  useEffect(() => useCase.subscribe(setItems), [useCase]);

  return (
    <div className="hidden sm:block absolute top-16 right-4 z-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-panel text-white p-2.5 rounded-lg hover:bg-glass-heavy transition-all duration-200 active:scale-95 relative"
        title="我的星单"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#B68B5C] text-[10px] leading-4 text-[#0A0A12] text-center font-mono">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 glass-panel-medium text-white p-4 w-64 animate-fade-in-scale shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-title text-white/90">我的星单</h3>
            {items.length > 0 && (
              <button
                onClick={() => useCase.clear()}
                className="text-caption text-white/30 hover:text-white/60 transition-colors"
              >
                清空
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-caption text-white/30 leading-relaxed">
              在诗人详情中点击星标收藏，这里会汇集你的专属星团。
            </p>
          ) : (
            <div className="space-y-0.5 max-h-72 overflow-y-auto scrollbar-thin">
              {items.map((poet) => (
                <button
                  key={poet.id}
                  onClick={() => {
                    onFocusPoet(poet.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-white/5 transition-colors"
                >
                  <span className="shrink-0 w-1 h-1 bg-[#B68B5C]/70 rounded-full" />
                  <span className="min-w-0 flex-1 text-body text-white/70 truncate">{poet.name}</span>
                  <span className="shrink-0 text-caption text-white/25">{getDynastyName(poet.dynasty)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
