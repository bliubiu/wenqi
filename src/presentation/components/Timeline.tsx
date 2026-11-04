'use client';

import type { TimeTravelUseCase } from '@/application/usecases/TimeTravelUseCase';
import { TIME_TRAVEL_SPEEDS } from '@/application/usecases/TimeTravelUseCase';
import {
  DYNASTY_CODES,
  DYNASTY_COLOR_HEX,
  DYNASTY_LABELS,
  DYNASTY_YEAR_RANGES,
} from '@/domain/value-objects/DynastyCode';
import { useTimelineStore } from '@/presentation/store/timelineStore';
import { countTimelineRange, type TimelineStats } from '@/domain/services/TimelineStats';

interface TimelineProps {
  useCase: TimeTravelUseCase;
  minYear: number;
  maxYear: number;
  stats?: TimelineStats | null;
}

function formatYear(year: number): string {
  const rounded = Math.round(year);
  return rounded < 0 ? `前 ${-rounded}` : `${rounded}`;
}

const ACTION_BUTTON =
  'px-2.5 py-1 text-[11px] rounded border border-[#2A2820] text-[#E8E0D0]/60 hover:text-[#E8E0D0]/90 hover:border-[#B68B5C]/50 transition-colors';

const THUMB_CLASS =
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-[#B68B5C] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#0A0A12] ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 ' +
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#B68B5C] [&::-moz-range-thumb]:border-0';

export function Timeline({ useCase, minYear, maxYear, stats }: TimelineProps) {
  const state = useTimelineStore();

  const span = Math.max(1, maxYear - minYear);
  const toPercent = (year: number) =>
    Math.min(100, Math.max(0, ((year - minYear) / span) * 100));

  const fromYear = state.active ? state.fromYear : minYear;
  const toYear = state.active ? state.toYear : maxYear;
  const playhead = state.active ? state.currentYear : maxYear;
  const rangeCounts = stats
    ? countTimelineRange(stats, state.active ? fromYear : minYear, state.active ? playhead : toYear)
    : null;

  const handlePlay = () => {
    if (!state.active) useCase.setRange(minYear, maxYear);
    if (state.status === 'playing') {
      useCase.pause();
    } else {
      useCase.play();
    }
  };

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-40">
      <div
        className="rounded-xl border border-[#2A2820] text-[#E8E0D0] px-3 py-2.5 sm:px-4 sm:py-3 shadow-xl"
        style={{ background: 'rgba(10,10,18,0.9)', backdropFilter: 'blur(14px)' }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="text-[10px] font-mono tracking-widest text-[#B68B5C]/70">时间演化</div>
            <div className="text-[11px] text-[#E8E0D0]/50 font-mono mt-0.5 flex flex-wrap items-center gap-x-2">
              <span>{formatYear(fromYear)} — {formatYear(playhead)}</span>
              {rangeCounts && (
                <span className="text-[#B68B5C]/70">
                  诗人 {rangeCounts.poetCount.toLocaleString()} · 作品 {rangeCounts.workCount.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={handlePlay} className={ACTION_BUTTON}>
              {state.status === 'playing' ? '暂停' : '播放'}
            </button>
            <button
              onClick={() => {
                const index = TIME_TRAVEL_SPEEDS.indexOf(state.speed as 1 | 2 | 4);
                const next = TIME_TRAVEL_SPEEDS[(index + 1) % TIME_TRAVEL_SPEEDS.length];
                useCase.setSpeed(next);
              }}
              className={ACTION_BUTTON}
              title="切换回放倍速"
            >
              {state.speed}×
            </button>
            <button
              onClick={() => useCase.exit()}
              className={ACTION_BUTTON}
              disabled={!state.active}
            >
              复位
            </button>
          </div>
        </div>

        <div className="relative h-6 select-none">
          <div className="absolute inset-x-0 top-0 h-1.5 rounded overflow-hidden">
            {DYNASTY_CODES.map((code) => {
              const range = DYNASTY_YEAR_RANGES[code];
              const start = Math.max(range.start, minYear);
              const end = Math.min(range.end, maxYear);
              if (end <= start) return null;
              const left = toPercent(start);
              const width = toPercent(end) - left;
              return (
                <div
                  key={code}
                  className="absolute top-0 h-full opacity-40"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: DYNASTY_COLOR_HEX[code],
                  }}
                  title={DYNASTY_LABELS[code]}
                />
              );
            })}
          </div>

          {state.active && (
            <div
              className="absolute top-0 h-1.5 bg-[#E8E0D0]/60 rounded"
              style={{
                left: `${toPercent(fromYear)}%`,
                width: `${Math.max(0, toPercent(playhead) - toPercent(fromYear))}%`,
              }}
            />
          )}

          {state.active && (
            <div
              className="absolute top-0 h-1.5 w-px bg-[#FFF4E0]"
              style={{ left: `${toPercent(playhead)}%` }}
            />
          )}

          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={fromYear}
            aria-label="时间区间起点"
            onChange={(event) => useCase.setRange(Number(event.target.value), toYear)}
            className={`absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none ${THUMB_CLASS}`}
          />
          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={toYear}
            aria-label="时间区间终点"
            onChange={(event) => useCase.setRange(fromYear, Number(event.target.value))}
            className={`absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none ${THUMB_CLASS}`}
          />
        </div>

        <div className="flex justify-between mt-1 text-[10px] font-mono text-[#E8E0D0]/25">
          <span>{formatYear(minYear)}</span>
          <span>{formatYear(maxYear)}</span>
        </div>
      </div>
    </div>
  );
}
