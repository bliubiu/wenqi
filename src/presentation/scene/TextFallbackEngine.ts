/**
 * 文气项目文字兜底引擎
 *
 * 当 Canvas 2D 也不可用时使用纯文字列表展示
 */

import { Node } from '@/infrastructure/data/DataLoader';

// 朝代中文名
const DYNASTY_NAMES: Record<string, string> = {
  PRE_QIN: '先秦',
  HAN: '汉',
  WEI_JIN: '魏晋南北朝',
  TANG: '唐',
  SONG: '宋',
  YUAN: '元',
  MING: '明',
  QING: '清',
  MODERN: '近现代',
};

/**
 * 文字兜底引擎
 */
export class TextFallbackEngine {
  private container: HTMLElement;
  private nodes: Node[] = [];
  private selectedNode: Node | null = null;
  /** 时间区间可见范围，null 表示全量 */
  private visibleYearFrom = -99999;
  private visibleYearTo = 99999;

  // 回调
  private onNodeSelect: ((node: Node | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
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
    this.render();
  }

  /** 设置时间区间可见范围；null 表示全量（文字模式按 CPU 过滤列表） */
  setVisibleRange(from: number | null, to: number | null): void {
    this.visibleYearFrom = from ?? -99999;
    this.visibleYearTo = to ?? 99999;
    this.render();
  }

  private visibleNodes(): Node[] {
    return this.nodes.filter((node) => {
      const year = node.birthYear ?? 0;
      return year >= this.visibleYearFrom && year <= this.visibleYearTo;
    });
  }

  /**
   * 渲染
   */
  private render(): void {
    this.container.innerHTML = '';

    // 创建主容器
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      background: linear-gradient(135deg, #0c0c1d 0%, #1a1a2e 100%);
      color: white;
      font-family: sans-serif;
      overflow: hidden;
    `;

    // 左侧：诗人列表
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `
      width: 300px;
      height: 100%;
      overflow-y: auto;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      padding: 20px;
    `;

    const title = document.createElement('h2');
    title.textContent = '文气星系（文字模式）';
    title.style.cssText = 'margin-bottom: 20px; font-size: 20px;';
    leftPanel.appendChild(title);

    const info = document.createElement('p');
    info.textContent = `共 ${this.visibleNodes().length} 位诗人`;
    info.style.cssText = 'color: rgba(255, 255, 255, 0.6); margin-bottom: 20px;';
    leftPanel.appendChild(info);

    // 按朝代分组
    const groups = this.groupByDynasty();
    for (const [dynasty, nodes] of groups) {
      const groupTitle = document.createElement('h3');
      groupTitle.textContent = `${DYNASTY_NAMES[dynasty] || dynasty} (${nodes.length})`;
      groupTitle.style.cssText = 'margin: 15px 0 10px; font-size: 16px; color: rgba(255, 255, 255, 0.8);';
      leftPanel.appendChild(groupTitle);

      const list = document.createElement('ul');
      list.style.cssText = 'list-style: none; padding: 0; margin: 0;';

      for (const node of nodes.slice(0, 50)) {
        const item = document.createElement('li');
        item.textContent = node.label;
        item.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 4px;
          margin-bottom: 2px;
          transition: background 0.2s;
        `;
        item.addEventListener('mouseover', () => {
          item.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        item.addEventListener('mouseout', () => {
          item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
          this.selectNode(node);
        });
        list.appendChild(item);
      }

      leftPanel.appendChild(list);
    }

    wrapper.appendChild(leftPanel);

    // 右侧：详情面板
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `
      flex: 1;
      height: 100%;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    if (this.selectedNode) {
      const details = this.createDetailsPanel(this.selectedNode);
      rightPanel.appendChild(details);
    } else {
      const placeholder = document.createElement('div');
      placeholder.innerHTML = `
        <div style="text-align: center; color: rgba(255, 255, 255, 0.5);">
          <p style="font-size: 24px; margin-bottom: 10px;">← 选择一位诗人</p>
          <p>点击左侧列表中的诗人名称查看详情</p>
        </div>
      `;
      rightPanel.appendChild(placeholder);
    }

    wrapper.appendChild(rightPanel);
    this.container.appendChild(wrapper);
  }

  /**
   * 按朝代分组
   */
  private groupByDynasty(): Map<string, Node[]> {
    const groups = new Map<string, Node[]>();

    for (const node of this.visibleNodes()) {
      if (!groups.has(node.dynasty)) {
        groups.set(node.dynasty, []);
      }
      groups.get(node.dynasty)!.push(node);
    }

    return groups;
  }

  /**
   * 选择节点
   */
  private selectNode(node: Node): void {
    this.selectedNode = node;
    this.render();

    if (this.onNodeSelect) {
      this.onNodeSelect(node);
    }
  }

  /**
   * 创建详情面板
   */
  private createDetailsPanel(node: Node): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 30px;
      max-width: 400px;
      width: 100%;
    `;

    panel.innerHTML = `
      <h2 style="font-size: 28px; margin-bottom: 20px;">${node.label}</h2>
      <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 15px;">
        朝代：${DYNASTY_NAMES[node.dynasty] || node.dynasty}
      </p>
      <div style="margin-top: 20px;">
        <h3 style="font-size: 16px; margin-bottom: 10px;">三气坐标</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background: rgba(255, 255, 255, 0.05); padding: 10px; border-radius: 8px; text-align: center;">
            <div style="color: rgba(255, 255, 255, 0.5); font-size: 12px;">X (运气)</div>
            <div style="font-size: 18px; margin-top: 5px;">${node.position.x.toFixed(1)}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.05); padding: 10px; border-radius: 8px; text-align: center;">
            <div style="color: rgba(255, 255, 255, 0.5); font-size: 12px;">Y (才气)</div>
            <div style="font-size: 18px; margin-top: 5px;">${node.position.y.toFixed(1)}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.05); padding: 10px; border-radius: 8px; text-align: center;">
            <div style="color: rgba(255, 255, 255, 0.5); font-size: 12px;">Z (人气)</div>
            <div style="font-size: 18px; margin-top: 5px;">${node.position.z.toFixed(1)}</div>
          </div>
        </div>
      </div>
    `;

    return panel;
  }

  /**
   * 聚焦节点
   */
  focusNode(node: Node): void {
    this.selectNode(node);
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.container.innerHTML = '';
  }
}
