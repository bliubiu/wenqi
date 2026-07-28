'use client';

function triggerClick(selector: string): void {
  const btn = document.querySelector(`[data-nav-trigger="${selector}"]`) as HTMLButtonElement | null;
  btn?.click();
}

export function MobileNav() {
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 glass-panel-heavy border-t border-white/10 rounded-t-xl">
      <div className="flex items-center justify-around py-2 px-4">
        <button
          onClick={() => triggerClick('dimension')}
          className="flex flex-col items-center gap-0.5 text-white/40 hover:text-white/80 active:text-white transition-colors duration-150 py-1 px-3 active:scale-95"
          title="维度调节"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
          </svg>
          <span className="text-caption">维度</span>
        </button>
        <button
          onClick={() => triggerClick('share')}
          className="flex flex-col items-center gap-0.5 text-white/40 hover:text-white/80 active:text-white transition-colors duration-150 py-1 px-3 active:scale-95"
          title="分享"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="text-caption">分享</span>
        </button>
        <button
          onClick={() => triggerClick('a11y')}
          className="flex flex-col items-center gap-0.5 text-white/40 hover:text-white/80 active:text-white transition-colors duration-150 py-1 px-3 active:scale-95"
          title="可访问性设置"
          aria-label="可访问性设置"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-caption">设置</span>
        </button>
      </div>
    </div>
  );
}
