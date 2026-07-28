'use client';

import { useState } from 'react';
import { useUIStore } from '@/presentation/store/uiStore';

interface DimensionWeights {
  talent: number;
  popularity: number;
  luck: number;
}

interface DimensionSliderProps {
  onWeightsChange: (weights: DimensionWeights) => void;
}

const PRESETS: Record<string, DimensionWeights> = {
  classic: { talent: 1, popularity: 1, luck: 1 },
  talentFirst: { talent: 2, popularity: 1, luck: 1 },
  popularityFirst: { talent: 1, popularity: 2, luck: 1 },
  luckFirst: { talent: 1, popularity: 1, luck: 2 },
};

export function DimensionSlider({ onWeightsChange }: DimensionSliderProps) {
  const [weights, setWeights] = useState<DimensionWeights>({
    talent: 1,
    popularity: 1,
    luck: 1,
  });

  const [activePreset, setActivePreset] = useState<string>('classic');

  const dimensionPanelOpen = useUIStore((s) => s.dimensionPanelOpen);
  const toggleDimension = useUIStore((s) => s.toggleDimension);

  const handleSliderChange = (dimension: keyof DimensionWeights, value: number) => {
    const newWeights = { ...weights, [dimension]: value };
    setWeights(newWeights);
    setActivePreset('');
    onWeightsChange(newWeights);
  };

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName];
    if (preset) {
      setWeights(preset);
      setActivePreset(presetName);
      onWeightsChange(preset);
    }
  };

  const resetToDefault = () => {
    applyPreset('classic');
  };

  return (
    <div className="hidden sm:block absolute left-4 top-1/2 transform -translate-y-1/2">
      <button
        onClick={toggleDimension}
        className="glass-panel text-white p-2.5 rounded-lg hover:bg-glass-heavy transition-all duration-200 active:scale-95"
        title="维度调节"
        data-nav-trigger="dimension"
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
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      </button>

      {dimensionPanelOpen && (
        <div className="absolute left-14 top-0 glass-panel-medium text-white p-5 w-64 animate-fade-in-scale shadow-xl">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-title text-white/90">维度调节</h3>
            <button
              onClick={resetToDefault}
              className="text-caption text-white/30 hover:text-white/70 transition-colors"
            >
              重置
            </button>
          </div>

          <div className="mb-5">
            <p className="text-caption text-white/40 mb-2.5">预设视图</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => applyPreset('classic')}
                className={`px-3 py-2 text-caption rounded-lg transition-colors ${
                  activePreset === 'classic'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                均衡
              </button>
              <button
                onClick={() => applyPreset('talentFirst')}
                className={`px-3 py-2 text-caption rounded-lg transition-colors ${
                  activePreset === 'talentFirst'
                    ? 'bg-white/15 text-yellow-300'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                才气优先
              </button>
              <button
                onClick={() => applyPreset('popularityFirst')}
                className={`px-3 py-2 text-caption rounded-lg transition-colors ${
                  activePreset === 'popularityFirst'
                    ? 'bg-white/15 text-blue-300'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                人气优先
              </button>
              <button
                onClick={() => applyPreset('luckFirst')}
                className={`px-3 py-2 text-caption rounded-lg transition-colors ${
                  activePreset === 'luckFirst'
                    ? 'bg-white/15 text-green-300'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                运气优先
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-caption mb-1.5">
                <span className="text-yellow-300/80">才气 Y</span>
                <span className="text-white/40">{weights.talent.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={weights.talent}
                onChange={(e) => handleSliderChange('talent', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-caption mb-1.5">
                <span className="text-blue-300/80">人气 Z</span>
                <span className="text-white/40">{weights.popularity.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={weights.popularity}
                onChange={(e) => handleSliderChange('popularity', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-caption mb-1.5">
                <span className="text-green-300/80">运气 X</span>
                <span className="text-white/40">{weights.luck.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={weights.luck}
                onChange={(e) => handleSliderChange('luck', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-green-400"
              />
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-white/5 text-caption text-white/20 leading-relaxed">
            权重越大，该维度对星系分布的影响越显著
          </div>
        </div>
      )}
    </div>
  );
}
