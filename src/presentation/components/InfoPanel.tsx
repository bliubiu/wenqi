'use client';

import type { LayoutMode } from '@/presentation/store/galaxyStore';

interface InfoPanelProps {
  nodeCount: number;
  rendererType: 'webgl' | 'canvas2d' | 'text';
  convergenceState: string;
  isDivergenceActive: boolean;
  layoutMode?: LayoutMode;
  /** 地理模式下的籍贯覆盖率（有坐标诗人 / 诗人总数） */
  geoCoverage?: { mapped: number; total: number } | null;
  onLayoutChange?: (mode: LayoutMode) => void;
  onOpenTour?: () => void;
}

export function InfoPanel({
  nodeCount,
  rendererType,
  convergenceState,
  isDivergenceActive,
  layoutMode = 'spiral',
  geoCoverage,
  onLayoutChange,
  onOpenTour,
}: InfoPanelProps) {
  const rendererLabel = rendererType === 'webgl' ? 'WebGL 3D' : rendererType === 'canvas2d' ? 'Canvas 2D' : '文字';

  const statusLabel = isDivergenceActive
    ? '散气'
    : convergenceState === 'focused'
      ? '聚气'
      : convergenceState === 'converging'
        ? '流转'
        : '漫游';

  return (
    <div className="absolute top-4 left-4 glass-panel text-white p-3 sm:p-4 animate-fade-in-up max-w-[160px] sm:max-w-none">
      <h2 className="text-title mb-2 text-white/90">文气星系</h2>
      <div className="space-y-0.5 text-caption text-white/60">
        <p><span className="text-white/40">星河 </span>{nodeCount.toLocaleString()} 星</p>
        <p><span className="text-white/40">渲染 </span>{rendererLabel}</p>
        {rendererType === 'webgl' && (
          <>
            <p><span className="text-white/40">状态 </span>{statusLabel}</p>
            <p className="text-white/30 mt-1">拖拽 · 滚轮 · 探索</p>
            {onLayoutChange && (
              <div className="mt-2 flex gap-1">
                {(['spiral', 'geo'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onLayoutChange(mode)}
                    className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                      layoutMode === mode
                        ? 'border-white/40 text-white/90 bg-white/10'
                        : 'border-white/10 text-white/40 hover:text-white/70'
                    }`}
                    title={mode === 'spiral' ? '按三气投影的螺旋星系布局' : '按诗人籍贯经纬度投影的地图布局'}
                  >
                    {mode === 'spiral' ? '星系' : '地图'}
                  </button>
                ))}
              </div>
            )}
            {layoutMode === 'geo' && geoCoverage && geoCoverage.total > 0 && (
              <div className="mt-2 pt-1.5 border-t border-white/10 space-y-0.5">
                <p>
                  <span className="text-white/40">籍贯 </span>
                  {geoCoverage.mapped.toLocaleString()} / {geoCoverage.total.toLocaleString()}
                  <span className="text-white/40">（{((geoCoverage.mapped / geoCoverage.total) * 100).toFixed(1)}%）</span>
                </p>
                <p className="text-white/30 leading-relaxed">未标注籍贯的诗人不参与地图投影</p>
              </div>
            )}
            {onOpenTour && (
              <button
                data-nav-trigger="tour"
                onClick={onOpenTour}
                className="mt-2 w-full px-2 py-1 rounded border border-[#B68B5C]/40 text-[#B68B5C]/80 text-[10px] tracking-wider hover:border-[#B68B5C]/70 hover:text-[#B68B5C] transition-colors"
                title="播放预置的主题漫游剧本"
              >
                主题漫游
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
