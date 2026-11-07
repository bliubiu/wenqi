'use client';

import { useAccessibility } from '@/presentation/hooks/useAccessibility';
import { useUIStore } from '@/presentation/store/uiStore';

export function AccessibilityPanel() {
  const { preferences, toggleHighContrast, toggleReducedMotion, setFontSize } = useAccessibility();

  const accessibilityPanelOpen = useUIStore((s) => s.accessibilityPanelOpen);
  const toggleAccessibility = useUIStore((s) => s.toggleAccessibility);

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
      <button
        onClick={toggleAccessibility}
        className="hidden sm:block glass-panel text-white p-2.5 rounded-lg hover:bg-glass-heavy transition-all duration-200 active:scale-95"
        title="可访问性设置"
        aria-label="可访问性设置"
        data-nav-trigger="a11y"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
          />
        </svg>
      </button>

      {accessibilityPanelOpen && (
        <div data-testid="a11y-panel" className="absolute bottom-14 left-1/2 transform -translate-x-1/2 glass-panel-heavy text-white p-5 w-72 animate-fade-in-scale shadow-xl">
          <h3 className="text-title text-white/90 mb-4">可访问性设置</h3>

          <div className="mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-body text-white/70">高对比度</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={preferences.highContrast}
                  onChange={toggleHighContrast}
                  className="sr-only"
                />
                <div
                  className={`w-10 h-6 rounded-full transition-colors ${
                    preferences.highContrast ? 'bg-white/30' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      preferences.highContrast ? 'translate-x-4' : ''
                    }`}
                  />
                </div>
              </div>
            </label>
            <p className="text-caption text-white/30 mt-1">增强颜色对比度，提高可读性</p>
          </div>

          <div className="mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-body text-white/70">减少动效</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={preferences.reducedMotion}
                  onChange={toggleReducedMotion}
                  className="sr-only"
                />
                <div
                  className={`w-10 h-6 rounded-full transition-colors ${
                    preferences.reducedMotion ? 'bg-white/30' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      preferences.reducedMotion ? 'translate-x-4' : ''
                    }`}
                  />
                </div>
              </div>
            </label>
            <p className="text-caption text-white/30 mt-1">关闭动画和过渡效果</p>
          </div>

          <div className="mb-4">
            <p className="text-caption text-white/50 mb-2">字体大小</p>
            <div className="flex gap-2">
              <button
                onClick={() => setFontSize('small')}
                className={`flex-1 px-3 py-2 rounded-lg text-caption transition-all ${
                  preferences.fontSize === 'small'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                小
              </button>
              <button
                onClick={() => setFontSize('medium')}
                className={`flex-1 px-3 py-2 rounded-lg text-caption transition-all ${
                  preferences.fontSize === 'medium'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                中
              </button>
              <button
                onClick={() => setFontSize('large')}
                className={`flex-1 px-3 py-2 rounded-lg text-caption transition-all ${
                  preferences.fontSize === 'large'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                大
              </button>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <h4 className="text-caption text-white/50 font-medium mb-2">键盘快捷键</h4>
            <div className="space-y-1">
              <p className="text-caption text-white/30"><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/40">Ctrl+K</kbd> 搜索</p>
              <p className="text-caption text-white/30"><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/40">Esc</kbd> 取消聚焦</p>
              <p className="text-caption text-white/30"><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/40">Tab</kbd> 切换焦点</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
