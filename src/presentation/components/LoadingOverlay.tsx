'use client';

import { useState, useEffect } from 'react';

interface LoadingStep {
  key: string;
  label: string;
}

interface LoadingOverlayProps {
  isLoading: boolean;
  steps?: LoadingStep[];
  currentStep?: string;
}

const DEFAULT_STEPS: LoadingStep[] = [
  { key: 'wasm', label: '凝气 — 唤醒文脉引擎' },
  { key: 'data', label: '聚气 — 汇聚千年篇章' },
  { key: 'render', label: '化气 — 点墨成星' },
  { key: 'scene', label: '成象 — 星系初开' },
];

const POETRY_LINE = '观文气之聚散，见千年之脉络';

export function LoadingOverlay({ isLoading, steps, currentStep }: LoadingOverlayProps) {
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setCharIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setCharIndex((prev) => {
        if (prev >= POETRY_LINE.length) return prev;
        return prev + 1;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading) return null;

  const displaySteps = steps ?? DEFAULT_STEPS;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
      <div className="text-center max-w-xs">
        {/* 气旋动画 —— 三圈同心波纹 */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border border-white/10 animate-breathe"></div>
          <div className="absolute inset-2 rounded-full border border-white/20 animate-breathe" style={{ animationDelay: '0.5s' }}></div>
          <div className="absolute inset-4 rounded-full border border-white/30 animate-breathe" style={{ animationDelay: '1s' }}></div>
          <div className="absolute inset-6 flex items-center justify-center">
            <span className="text-white/60 text-xs tracking-[0.3em]">气</span>
          </div>
        </div>

        {/* 逐字浮现 */}
        <div className="text-sm text-white/60 mb-8 h-5 font-light tracking-widest">
          {POETRY_LINE.split('').slice(0, charIndex).map((char, i) => (
            <span
              key={i}
              className="inline-block animate-fade-in-up"
              style={{ animationDuration: '0.3s' }}
            >
              {char}
            </span>
          ))}
        </div>

        {/* 当前步骤 */}
        <p className="text-body text-white/80 mb-5">
          {displaySteps.find((s) => s.key === currentStep)?.label ?? '加载中...'}
        </p>

        {/* 步骤条 */}
        <div className="flex items-center justify-center gap-2">
          {displaySteps.map((step, index) => {
            const stepIndex = displaySteps.findIndex((s) => s.key === currentStep);
            const done = stepIndex > index;
            const active = step.key === currentStep;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div
                  className={`h-1 rounded-full transition-all duration-500 ${
                    done ? 'w-6 bg-white/50' : active ? 'w-8 bg-white/80' : 'w-4 bg-white/10'
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5 items-start mx-auto mt-3">
          {displaySteps.map((step) => {
            const stepIndex = displaySteps.findIndex((s) => s.key === currentStep);
            const done = stepIndex > displaySteps.findIndex((s) => s.key === step.key);
            const active = step.key === currentStep;
            return (
              <div key={step.key} className={`flex items-center gap-2 text-xs transition-opacity ${active || done ? 'opacity-100' : 'opacity-40'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-white/60' : active ? 'bg-white animate-pulse' : 'bg-white/20'}`}></span>
                <span className={done ? 'text-white/50' : active ? 'text-white/90' : 'text-white/30'}>{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
