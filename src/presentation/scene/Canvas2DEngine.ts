/**
 * 文气项目 Canvas 2D 降级引擎
 *
 * 当 WebGL 不可用时使用 Canvas 2D 渲染平面化星系
 */

import { Node } from '@/infrastructure/data/DataLoader';

// 朝代色彩映射
const DYNASTY_COLORS: Record<string, string> = {
  PRE_QIN: '#3A4A5C',
  HAN: '#8B7355',
  WEI_JIN: '#6FAE8E',
  TANG: '#D4A24C',
  SONG: '#7BA7D9',
  YUAN: '#B5523E',
  MING: '#C9866B',
  QING: '#8C6FAE',
  MODERN: '#5A8C7A',
};

/**
 * Canvas 2D 引擎
 */
export class Canvas2DEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: Node[] = [];
  private animationId: number | null = null;
  /** 时间区间可见范围，null 表示全量 */
  private visibleYearFrom = -99999;
  private visibleYearTo = 99999;

  // 视图状态
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // 回调
  private onNodeSelect: ((node: Node | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // 创建 canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 Canvas 2D 上下文');
    }
    this.ctx = ctx;

    // 初始化视图
    this.offsetX = this.canvas.width / 2;
    this.offsetY = this.canvas.height / 2;
    this.scale = 3;

    this.addEventListeners();
    this.animate();
  }

  /**
   * 添加事件监听
   */
  private addEventListeners(): void {
    // 鼠标按下
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // 鼠标移动
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.offsetX += dx;
        this.offsetY += dy;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    // 鼠标释放
    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // 鼠标离开
    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    // 滚轮缩放
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.scale *= zoomFactor;
      this.scale = Math.max(0.5, Math.min(10, this.scale));
    });

    // 点击
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 检查是否点击了节点
      for (const node of this.nodes) {
        if (!this.isYearVisible(node)) continue;
        const x = node.position.x * this.scale + this.offsetX;
        const y = node.position.y * this.scale + this.offsetY;
        const radius = node.size * 2;

        const dx = mouseX - x;
        const dy = mouseY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < radius) {
          if (this.onNodeSelect) {
            this.onNodeSelect(node);
          }
          return;
        }
      }

      // 点击空白处
      if (this.onNodeSelect) {
        this.onNodeSelect(null);
      }
    });

    // 窗口大小变化
    window.addEventListener('resize', () => {
      this.canvas.width = this.container.clientWidth;
      this.canvas.height = this.container.clientHeight;
    });
  }

  /**
   * 设置节点选中回调
   */
  setOnNodeSelect(callback: (node: Node | null) => void): void {
    this.onNodeSelect = callback;
  }

  /**
   * 加载节点数据
   */
  async loadNodes(nodes: Node[]): Promise<void> {
    this.nodes = nodes;
  }

  /** 设置时间区间可见范围；null 表示全量（降级路径按 CPU 过滤绘制与拾取） */
  setVisibleRange(from: number | null, to: number | null): void {
    this.visibleYearFrom = from ?? -99999;
    this.visibleYearTo = to ?? 99999;
  }

  private isYearVisible(node: Node): boolean {
    const year = node.birthYear ?? 0;
    return year >= this.visibleYearFrom && year <= this.visibleYearTo;
  }

  /**
   * 动画循环
   */
  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    this.render();
  }

  /**
   * 渲染
   */
  private render(): void {
    const { ctx, canvas } = this;

    // 清空画布
    ctx.fillStyle = '#000011';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制星空背景
    this.drawStarfield();

    // 绘制坐标轴
    this.drawAxes();

    // 绘制节点
    this.drawNodes();
  }

  /**
   * 绘制星空背景
   */
  private drawStarfield(): void {
    const { ctx, canvas } = this;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 200; i++) {
      const x = (Math.sin(i * 123.456) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i * 789.012) * 0.5 + 0.5) * canvas.height;
      const size = Math.random() * 1.5;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 绘制坐标轴
   */
  private drawAxes(): void {
    const { ctx, offsetX, offsetY, scale } = this;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    // X 轴（运气）- 红色
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
    ctx.beginPath();
    ctx.moveTo(offsetX - 50 * scale, offsetY);
    ctx.lineTo(offsetX + 50 * scale, offsetY);
    ctx.stroke();

    // Y 轴（才气）- 绿色
    ctx.strokeStyle = 'rgba(100, 255, 100, 0.5)';
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY - 50 * scale);
    ctx.lineTo(offsetX, offsetY + 50 * scale);
    ctx.stroke();

    // 标签
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.fillText('运气 (X)', offsetX + 50 * scale + 5, offsetY + 15);
    ctx.fillText('才气 (Y)', offsetX + 5, offsetY - 50 * scale - 5);
  }

  /**
   * 绘制节点
   */
  private drawNodes(): void {
    const { ctx, nodes, offsetX, offsetY, scale } = this;

    for (const node of nodes) {
      if (!this.isYearVisible(node)) continue;
      const x = node.position.x * scale + offsetX;
      const y = node.position.y * scale + offsetY;
      const radius = node.size * 2;

      // 获取颜色
      const color = DYNASTY_COLORS[node.dynasty] || '#ffffff';

      // 绘制节点
      ctx.fillStyle = color;
      ctx.globalAlpha = node.brightness;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // 绘制标签（只在缩放较大时显示）
      if (scale > 2) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.font = '10px sans-serif';
        ctx.fillText(node.label, x + radius + 2, y + 3);
      }
    }

    ctx.globalAlpha = 1;
  }

  /**
   * 聚焦节点
   */
  focusNode(node: Node): void {
    // 移动视图到节点位置
    this.offsetX = this.canvas.width / 2 - node.position.x * this.scale;
    this.offsetY = this.canvas.height / 2 - node.position.y * this.scale;
  }

  /**
   * 销毁
   */
  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.canvas.remove();
  }
}
