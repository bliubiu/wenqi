'use client';

import { useEffect, useRef, useState } from 'react';
import { CompositionRoot } from '@/di/composition-root';
import { TourUseCase } from '@/application/usecases/TourUseCase';
import { SpeechSynthesisAdapter } from '@/infrastructure/audio/SpeechSynthesisAdapter';
import { useGalaxyStore } from '@/presentation/store/galaxyStore';
import { useTourStore } from '@/presentation/store/tourStore';

function formatDuration(milliseconds: number): string {
  const total = Math.round(milliseconds / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

const ACTION_BUTTON = 'px-2.5 py-1.5 text-xs rounded border border-[#2A2820] text-[#E8E0D0]/60 hover:text-[#E8E0D0]/90 hover:border-[#B68B5C]/50 transition-colors disabled:opacity-30 disabled:hover:text-[#E8E0D0]/60 disabled:hover:border-[#2A2820]';

/** 复制文本，剪贴板不可用时回退到选区复制 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

export function TourOverlay() {
  const useCaseRef = useRef<TourUseCase | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const galaxyLoading = useGalaxyStore((s) => s.isLoading);

  const pickerOpen = useTourStore((s) => s.pickerOpen);
  const index = useTourStore((s) => s.index);
  const indexLoading = useTourStore((s) => s.indexLoading);
  const status = useTourStore((s) => s.status);
  const tour = useTourStore((s) => s.tour);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const step = useTourStore((s) => s.step);
  const error = useTourStore((s) => s.error);

  useEffect(() => {
    const root = CompositionRoot.getInstance();
    const useCase = new TourUseCase(root.tourRepository, new SpeechSynthesisAdapter());
    useCaseRef.current = useCase;

    const unsubscribe = useCase.subscribe((state) => {
      const store = useTourStore.getState();
      store.applyState(state);
      if (state.status === 'playing' || state.status === 'finished') {
        store.setPickerOpen(false);
      }
    });

    return () => {
      unsubscribe();
      useCase.exit();
      useCaseRef.current = null;
    };
  }, []);

  // 分享直达：URL 携带 ?tour=<id> 且星系数据就绪后自动进入漫游
  const deepLinkStartedRef = useRef(false);
  useEffect(() => {
    if (galaxyLoading || deepLinkStartedRef.current) return;
    const useCase = useCaseRef.current;
    if (!useCase) return;

    const tourId = CompositionRoot.getInstance().generateShareLinkUseCase.parseTourIdFromUrl();
    if (!tourId) return;

    deepLinkStartedRef.current = true;
    void useCase.start(tourId).then(() => {
      const state = useTourStore.getState();
      if (state.status === 'idle' && state.error) state.setPickerOpen(true);
    });
  }, [galaxyLoading]);

  const indexRequestedRef = useRef(false);
  useEffect(() => {
    if (!pickerOpen || index.length > 0 || indexRequestedRef.current) return;
    const useCase = useCaseRef.current;
    if (!useCase) return;

    indexRequestedRef.current = true;
    useTourStore.getState().setIndexLoading(true);
    useCase.listTours()
      .then((tours) => useTourStore.getState().setIndex(tours))
      .finally(() => useTourStore.getState().setIndexLoading(false));
  }, [pickerOpen, index.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const store = useTourStore.getState();
      if (store.status !== 'idle') {
        useCaseRef.current?.exit();
      } else if (store.pickerOpen) {
        store.setPickerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleShare = async () => {
    if (!tour) return;
    const url = CompositionRoot.getInstance().generateShareLinkUseCase.generateTourLink(tour.id);
    await copyText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const active = status === 'playing' || status === 'paused' || status === 'finished' || status === 'loading';

  if (!pickerOpen && !active) return null;

  return (
    <div className="absolute inset-0 z-[70] pointer-events-none">
      {pickerOpen && status === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            data-testid="tour-picker"
            className="pointer-events-auto w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-[#2A2820] text-[#E8E0D0] p-5 sm:p-6 shadow-xl animate-fade-in-scale"
            style={{ background: 'rgba(10,10,18,0.92)', backdropFilter: 'blur(14px)' }}
          >
            <div className="flex justify-between items-start mb-1">
              <h3 className="text-lg font-serif tracking-wider text-[#E8E0D0]/90">主题漫游</h3>
              <button
                onClick={() => useTourStore.getState().setPickerOpen(false)}
                className="text-[#E8E0D0]/30 hover:text-[#E8E0D0]/60 transition-colors p-1 -mr-1"
                aria-label="关闭漫游列表"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#E8E0D0]/40 mb-4">选一条线，让镜头替你说完一个主题。</p>

            {indexLoading && <p className="text-xs text-[#E8E0D0]/40">漫游剧本加载中…</p>}
            {!indexLoading && index.length === 0 && (
              <p className="text-xs text-[#E8E0D0]/40">暂无可播放的漫游剧本。</p>
            )}

            <div className="space-y-2">
              {index.map((item) => (
                <button
                  key={item.id}
                  onClick={() => useCaseRef.current?.start(item.id)}
                  className="w-full text-left px-3 py-3 rounded-lg border border-[#2A2820] hover:border-[#B68B5C]/50 hover:bg-white/5 transition-colors"
                >
                  <div className="text-sm font-serif text-[#E8E0D0]/85">{item.title}</div>
                  <div className="text-[11px] text-[#E8E0D0]/40 mt-1">{item.description}</div>
                  <div className="text-[10px] text-[#E8E0D0]/25 mt-1 font-mono">
                    {item.stepCount} 步 · 约 {formatDuration(item.durationMs)}
                  </div>
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-xs text-[#E8E0D0]/50">{error}</p>}
          </div>
        </div>
      )}

      {active && (
        <div className="absolute bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl pointer-events-auto">
          <div
            data-testid="tour-player"
            className="rounded-2xl border border-[#2A2820] text-[#E8E0D0] px-4 py-3 sm:px-5 sm:py-4 shadow-xl"
            style={{ background: 'rgba(10,10,18,0.9)', backdropFilter: 'blur(14px)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono tracking-widest text-[#B68B5C]/70">
                  {tour ? `${tour.title} · ${Math.max(stepIndex + 1, 0)}/${tour.steps.length}` : '漫游加载中'}
                </div>
                {tour && tour.steps.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    {tour.steps.map((s, i) => (
                      <span
                        key={i}
                        className={`h-1 rounded-full transition-all ${
                          i === stepIndex ? 'w-4 bg-[#B68B5C]/80' : i < stepIndex ? 'w-1.5 bg-[#E8E0D0]/35' : 'w-1.5 bg-[#E8E0D0]/10'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => useCaseRef.current?.prev()}
                  disabled={stepIndex <= 0}
                  className={ACTION_BUTTON}
                >
                  上一步
                </button>
                {status === 'paused' ? (
                  <button onClick={() => useCaseRef.current?.resume()} className={ACTION_BUTTON}>继续</button>
                ) : (
                  <button
                    onClick={() => useCaseRef.current?.pause()}
                    disabled={status !== 'playing'}
                    className={ACTION_BUTTON}
                  >
                    暂停
                  </button>
                )}
                <button
                  onClick={() => useCaseRef.current?.next()}
                  disabled={status === 'finished' || status === 'loading'}
                  className={ACTION_BUTTON}
                >
                  下一步
                </button>
                <button
                  onClick={handleShare}
                  disabled={!tour}
                  className={ACTION_BUTTON}
                  title="复制携带漫游 ID 的直达链接"
                >
                  {shareCopied ? '已复制' : '分享'}
                </button>
                <button onClick={() => useCaseRef.current?.exit()} className={ACTION_BUTTON}>退出</button>
              </div>
            </div>

            <p className="text-sm sm:text-base font-serif leading-relaxed text-[#E8E0D0]/80" aria-live="polite">
              {status === 'loading' ? '漫游剧本加载中…'
                : status === 'finished' ? '本次漫游结束，愿这片星空与你同在。'
                : step?.caption ?? ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
