'use client';

interface InfoPanelProps {
  nodeCount: number;
  rendererType: 'webgl' | 'canvas2d' | 'text';
  convergenceState: string;
  isDivergenceActive: boolean;
}

export function InfoPanel({ nodeCount, rendererType, convergenceState, isDivergenceActive }: InfoPanelProps) {
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
          </>
        )}
      </div>
    </div>
  );
}
