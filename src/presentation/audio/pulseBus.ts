/**
 * 朗诵脉动总线
 *
 * 朗诵组件把音频波形幅度发布到总线，星系场景订阅后驱动节点与星尘脉动。
 * 独立于 React 渲染，避免逐帧波形更新触发组件重渲染。
 */

type PulseListener = (level: number) => void;

export class RecitationPulseBus {
  private level = 0;
  private listeners = new Set<PulseListener>();

  /** 发布 [0,1] 的脉动幅度；越界值自动裁剪 */
  publish(level: number): void {
    const next = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    if (Math.abs(next - this.level) < 0.01) return;
    this.level = next;
    this.listeners.forEach((listener) => listener(next));
  }

  getLevel(): number {
    return this.level;
  }

  subscribe(listener: PulseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 停止朗诵时归零并通知订阅方 */
  reset(): void {
    this.level = 0;
    this.listeners.forEach((listener) => listener(0));
  }
}

export const recitationPulseBus = new RecitationPulseBus();
