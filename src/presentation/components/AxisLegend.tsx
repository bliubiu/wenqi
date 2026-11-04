'use client';

export function AxisLegend() {
  return (
    <div className="absolute bottom-16 sm:bottom-4 left-4 glass-panel text-white p-3 animate-fade-in-up">
      <h3 className="text-caption text-white/50 mb-2 font-medium">星系映射</h3>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-400/70"></div>
          <span className="text-caption text-white/60">人气 — 盘面半径</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-400/70"></div>
          <span className="text-caption text-white/60">运气 — 盘面高度</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-green-400/70"></div>
          <span className="text-caption text-white/60">才气 — 臂上散布</span>
        </div>
      </div>
    </div>
  );
}
