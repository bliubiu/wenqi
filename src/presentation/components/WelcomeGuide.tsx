'use client';

import { useState, useEffect } from 'react';

const GUIDE_KEY = 'wenqi_welcome_shown';

interface GuideItem {
  title: string;
  desc: string;
}

const GUIDES: GuideItem[] = [
  { title: '指星', desc: '点击星辰，观诗人平生与文脉流转' },
  { title: '观气', desc: '滚轮缩放，远看气团朝代，近看诗人聚落' },
  { title: '游目', desc: '拖拽旋转，从任意角度漫步文气星系' },
  { title: '归元', desc: '按 ESC 取消聚焦，重返星河全景' },
];

export function WelcomeGuide() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const shown = localStorage.getItem(GUIDE_KEY);
    if (!shown) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(GUIDE_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel-heavy p-8 max-w-md mx-4 shadow-2xl animate-fade-in-scale">
        {/* 装饰线 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <div className="w-1 h-1 bg-white/40 rotate-45"></div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
        </div>

        <h2 className="text-display text-white text-center mb-2">文气</h2>
        <p className="text-caption text-white/40 text-center mb-8 tracking-widest">观文气之聚散 · 见千年之脉络</p>

        <div className="flex flex-col gap-4 mb-8">
          {GUIDES.map((item, i) => (
            <div key={item.title} className="flex items-start gap-4">
              <span className="text-caption text-white/20 font-mono w-6 shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex-1">
                <div className="text-body text-white/80 font-medium">{item.title}</div>
                <div className="text-caption text-white/40">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleDismiss}
          className="w-full py-3 text-body font-medium text-black bg-white/90 hover:bg-white rounded-lg transition-all duration-200 active:scale-[0.98]"
        >
          踏入星海
        </button>
      </div>
    </div>
  );
}
