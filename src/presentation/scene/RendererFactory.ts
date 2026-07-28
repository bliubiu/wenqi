/**
 * 文气项目渲染器工厂
 *
 * 检测 WebGL 支持并创建合适的渲染引擎
 */

import { GalaxyScene } from './GalaxyScene';
import { Canvas2DEngine } from './Canvas2DEngine';
import { TextFallbackEngine } from './TextFallbackEngine';
import { Node } from '@/infrastructure/data/DataLoader';

// 渲染引擎接口
export interface RenderEngine {
  loadNodes(nodes: Node[]): Promise<void>;
  setOnNodeSelect(callback: (node: Node | null) => void): void;
  focusNode(node: Node): void;
  dispose(): void;
}

// 渲染器类型
export type RendererType = 'webgl' | 'canvas2d' | 'text';

/**
 * 检测 WebGL 支持
 */
export function detectWebGLSupport(): RendererType {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (gl) {
      return 'webgl';
    }
  } catch (error) {
    console.warn('WebGL 检测失败:', error);
  }

  // 检测 Canvas 2D 支持
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (ctx) {
      return 'canvas2d';
    }
  } catch (error) {
    console.warn('Canvas 2D 检测失败:', error);
  }

  return 'text';
}

/**
 * 创建渲染引擎
 */
export function createRenderEngine(
  container: HTMLElement,
  type?: RendererType
): { engine: RenderEngine; type: RendererType } {
  const rendererType = type || detectWebGLSupport();

  console.log(`使用渲染引擎: ${rendererType}`);

  switch (rendererType) {
    case 'webgl':
      return {
        engine: new GalaxyScene(container) as unknown as RenderEngine,
        type: 'webgl',
      };

    case 'canvas2d':
      return {
        engine: new Canvas2DEngine(container) as unknown as RenderEngine,
        type: 'canvas2d',
      };

    case 'text':
    default:
      return {
        engine: new TextFallbackEngine(container) as unknown as RenderEngine,
        type: 'text',
      };
  }
}
