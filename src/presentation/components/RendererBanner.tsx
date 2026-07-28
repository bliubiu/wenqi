'use client';

interface RendererBannerProps {
  rendererType: 'webgl' | 'canvas2d' | 'text';
  isLoading: boolean;
}

export function RendererBanner({ rendererType, isLoading }: RendererBannerProps) {
  if (rendererType === 'webgl' || isLoading) return null;

  const label = rendererType === 'canvas2d' ? 'Canvas 2D' : '文字';
  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm border border-yellow-400/30 animate-fade-in-up">
      当前使用{label}模式，建议使用支持 WebGL 的浏览器获得最佳体验
    </div>
  );
}
