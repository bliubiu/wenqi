'use client';

import { useState } from 'react';
import * as THREE from 'three';
import { useUIStore } from '@/presentation/store/uiStore';

interface ShareProps {
  getRenderer: () => THREE.WebGLRenderer | null;
  getCamera: () => THREE.PerspectiveCamera | null;
  focusedNodeId: string | null;
}

export function Share({ getRenderer, getCamera, focusedNodeId }: ShareProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [showCopied, setShowCopied] = useState(false);

  const sharePanelOpen = useUIStore((s) => s.sharePanelOpen);
  const toggleShare = useUIStore((s) => s.toggleShare);

  const captureScreenshot = async () => {
    const renderer = getRenderer();
    if (!renderer) {
      alert('渲染器未就绪');
      return;
    }

    setIsCapturing(true);

    try {
      const canvas = renderer.domElement;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const ctx = tempCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('无法创建 Canvas 上下文');
      }

      ctx.drawImage(canvas, 0, 0);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('文气 - 观文气之聚散，见千年之脉络', canvas.width - 20, canvas.height - 20);

      const dataUrl = tempCanvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.download = `wenqi-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('截图失败:', error);
      alert('截图失败');
    } finally {
      setIsCapturing(false);
    }
  };

  const generateShareLink = () => {
    const camera = getCamera();
    if (!camera) return;

    const params = new URLSearchParams();

    params.set('cx', camera.position.x.toFixed(1));
    params.set('cy', camera.position.y.toFixed(1));
    params.set('cz', camera.position.z.toFixed(1));

    if (focusedNodeId) {
      params.set('focus', focusedNodeId);
    }

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    setShareUrl(url);

    return url;
  };

  const copyShareLink = async () => {
    const url = generateShareLink();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
  };

  return (
    <div className="hidden sm:block absolute top-4 right-4 z-50">
      <button
        onClick={toggleShare}
        className="glass-panel text-white p-2.5 rounded-lg hover:bg-glass-heavy transition-all duration-200 active:scale-95"
        title="分享"
        data-nav-trigger="share"
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
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      </button>

      {sharePanelOpen && (
        <div className="absolute right-0 top-12 glass-panel-medium text-white p-5 w-72 animate-fade-in-scale shadow-xl">
          <h3 className="text-title text-white/90 mb-4">分享</h3>

          <button
            onClick={captureScreenshot}
            disabled={isCapturing}
            className="w-full mb-3 px-4 py-2.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5 rounded-lg transition-all duration-200 text-body flex items-center justify-center active:scale-[0.98]"
          >
            {isCapturing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/60 mr-2"></div>
                截图中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                截图保存
              </>
            )}
          </button>

          <div className="mb-3">
            <p className="text-caption text-white/40 mb-2">分享链接</p>
            <div className="flex">
              <input
                type="text"
                value={shareUrl || '点击生成分享链接'}
                readOnly
                className="flex-1 px-3 py-2 bg-white/5 rounded-l-lg text-caption text-white/50"
              />
              <button
                onClick={copyShareLink}
                className="px-3 py-2 bg-white/10 hover:bg-white/15 rounded-r-lg transition-colors text-caption"
              >
                {showCopied ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          <div className="text-caption text-white/20 leading-relaxed">
            <p>截图保存当前视角为 PNG 图片</p>
            <p>分享链接包含相机位置与焦点信息</p>
          </div>
        </div>
      )}
    </div>
  );
}
