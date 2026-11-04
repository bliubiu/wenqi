'use client';

import { useState } from 'react';
import * as THREE from 'three';
import { CompositionRoot } from '@/di/composition-root';
import { useUIStore } from '@/presentation/store/uiStore';

/** 诗词卡片内容（聚焦诗人时由星系组件提供） */
export interface CardContent {
  title: string;
  poetName: string;
  dynasty: string;
  lines: string;
}

interface ShareProps {
  getRenderer: () => THREE.WebGLRenderer | null;
  getCamera: () => THREE.PerspectiveCamera | null;
  getCameraTarget: () => THREE.Vector3 | null;
  focusedNodeId: string | null;
  /** 当前时间区间（WQ-3 回放态） */
  timeRange?: { fromYear: number; toYear: number } | null;
  /** 当前搜索词 */
  searchQuery?: string | null;
  /** 诗词卡片内容；为空时禁用卡片导出 */
  cardContent?: CardContent | null;
}

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;
const POSTER_VISUAL_HEIGHT = 900;

const BG_COLOR = '#0A0A12';
const TEXT_PRIMARY = '#E8E0D0';
const TEXT_MUTED = 'rgba(232, 224, 208, 0.55)';
const ACCENT = '#B68B5C';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

/** 中文按字符折行，返回不超过 maxLines 行 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    if (char === '\n') {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export function Share({
  getRenderer,
  getCamera,
  getCameraTarget,
  focusedNodeId,
  timeRange,
  searchQuery,
  cardContent,
}: ShareProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [showCopied, setShowCopied] = useState(false);

  const sharePanelOpen = useUIStore((s) => s.sharePanelOpen);
  const toggleShare = useUIStore((s) => s.toggleShare);
  const rootRef = useState(() => CompositionRoot.getInstance())[0];

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

  const buildShareUrl = (): string | null => {
    const camera = getCamera();
    if (!camera) return null;

    const target = getCameraTarget() ?? camera.position.clone();
    const result = rootRef.generateShareLinkUseCase.execute({
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      cameraTarget: [target.x, target.y, target.z],
      focusedNodeId,
      timeRange,
      searchQuery,
    });
    setShareUrl(result.url);
    return result.url;
  };

  const generateShareLink = () => buildShareUrl() ?? '';

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

  const exportPoster = async () => {
    if (!cardContent) return;

    setIsExporting(true);

    try {
      const poster = document.createElement('canvas');
      poster.width = POSTER_WIDTH;
      poster.height = POSTER_HEIGHT;
      const ctx = poster.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

      const renderer = getRenderer();
      if (renderer) {
        const source = renderer.domElement;
        const scale = Math.max(POSTER_WIDTH / source.width, POSTER_VISUAL_HEIGHT / source.height);
        const drawWidth = source.width * scale;
        const drawHeight = source.height * scale;
        const drawX = (POSTER_WIDTH - drawWidth) / 2;
        const drawY = (POSTER_VISUAL_HEIGHT - drawHeight) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, POSTER_WIDTH, POSTER_VISUAL_HEIGHT);
        ctx.clip();
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
      }

      const fade = ctx.createLinearGradient(0, POSTER_VISUAL_HEIGHT * 0.6, 0, POSTER_VISUAL_HEIGHT + 120);
      fade.addColorStop(0, 'rgba(10, 10, 18, 0)');
      fade.addColorStop(1, BG_COLOR);
      ctx.fillStyle = fade;
      ctx.fillRect(0, POSTER_VISUAL_HEIGHT * 0.6, POSTER_WIDTH, POSTER_VISUAL_HEIGHT * 0.4 + 120);

      ctx.textAlign = 'left';
      ctx.fillStyle = ACCENT;
      ctx.font = '24px "Noto Serif SC", serif';
      ctx.fillText('文气 · 观文气之聚散，见千年之脉络', 80, 1010);

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = '64px "Noto Serif SC", serif';
      ctx.fillText(cardContent.title, 80, 1100);

      ctx.fillStyle = TEXT_MUTED;
      ctx.font = '30px "Noto Sans SC", sans-serif';
      ctx.fillText(`${cardContent.poetName} · ${cardContent.dynasty}`, 80, 1155);

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = '32px "Noto Serif SC", serif';
      const lines = wrapText(ctx, cardContent.lines, POSTER_WIDTH - 160, 4);
      lines.forEach((line, index) => {
        ctx.fillText(line, 80, 1230 + index * 52);
      });

      const qrUrl = generateShareLink() || (typeof window !== 'undefined' ? window.location.href : '');
      if (qrUrl) {
        const { default: QRCode } = await import('qrcode');
        const qrDataUrl = await QRCode.toDataURL(qrUrl, {
          width: 200,
          margin: 0,
          color: { dark: TEXT_PRIMARY, light: BG_COLOR },
        });
        const qrImage = await loadImage(qrDataUrl);
        ctx.drawImage(qrImage, POSTER_WIDTH - 280, POSTER_HEIGHT - 260, 200, 200);

        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '22px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('扫码复现此视图', POSTER_WIDTH - 80, POSTER_HEIGHT - 90);
      }

      const link = document.createElement('a');
      link.download = `wenqi-card-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = poster.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('海报导出失败:', error);
      alert('海报导出失败');
    } finally {
      setIsExporting(false);
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

          <button
            onClick={exportPoster}
            disabled={isExporting || !cardContent}
            className="w-full mb-3 px-4 py-2.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 rounded-lg transition-all duration-200 text-body flex items-center justify-center active:scale-[0.98]"
            title={cardContent ? '导出含诗句与二维码的诗词卡片' : '聚焦一位诗人后可导出诗词卡片'}
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/60 mr-2"></div>
                生成中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9h8M8 13h5" />
                </svg>
                诗词卡片
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
            <p>分享链接包含相机、时间区间与搜索态</p>
          </div>
        </div>
      )}
    </div>
  );
}
