/**
 * 时间演化回放用例
 *
 * 状态机：idle → playing ⇄ paused；区间选择即进入 active 状态。
 * 播放时播放头从区间起点推进到终点，默认全程 60 秒（可倍速），
 * 表现层按「区间起点 → 播放头」渲染可见节点。
 */

export type TimeTravelStatus = 'idle' | 'playing' | 'paused';

export interface TimeTravelState {
  status: TimeTravelStatus;
  /** 是否处于时间过滤状态（拖动区间或回放中） */
  active: boolean;
  fromYear: number;
  toYear: number;
  /** 播放头年份；未播放时等于区间终点 */
  currentYear: number;
  speed: number;
}

export interface VisibleYearRange {
  from: number;
  to: number;
}

type Listener = (state: TimeTravelState) => void;

/** 全程回放基准时长（1 倍速） */
export const DEFAULT_PLAY_DURATION_MS = 60000;
export const TIME_TRAVEL_SPEEDS = [1, 2, 4] as const;

const TICK_INTERVAL_MS = 16;

export class TimeTravelUseCase {
  private status: TimeTravelStatus = 'idle';
  private active = false;
  private fromYear = 0;
  private toYear = 0;
  private currentYear = 0;
  private speed = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private readonly listeners = new Set<Listener>();

  getState(): TimeTravelState {
    return {
      status: this.status,
      active: this.active,
      fromYear: this.fromYear,
      toYear: this.toYear,
      currentYear: this.currentYear,
      speed: this.speed,
    };
  }

  /** 当前应渲染的可见年份区间；未激活时返回 null（全量） */
  getVisibleRange(): VisibleYearRange | null {
    if (!this.active) return null;
    return { from: this.fromYear, to: this.currentYear };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 选择时间区间；播放中调整会中止播放并回到区间终点 */
  setRange(fromYear: number, toYear: number): void {
    const from = Math.min(fromYear, toYear);
    const to = Math.max(fromYear, toYear);
    this.clearTimer();
    this.active = true;
    this.status = 'paused';
    this.fromYear = from;
    this.toYear = to;
    this.currentYear = to;
    this.emit();
  }

  play(): void {
    if (!this.active || this.toYear <= this.fromYear) return;
    if (this.status === 'playing') return;

    this.status = 'playing';
    this.currentYear = this.fromYear;
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.emit();
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.clearTimer();
    this.status = 'paused';
    this.emit();
  }

  setSpeed(speed: number): void {
    if (!TIME_TRAVEL_SPEEDS.includes(speed as (typeof TIME_TRAVEL_SPEEDS)[number])) return;
    this.speed = speed;
    this.lastTickAt = Date.now();
    this.emit();
  }

  /** 退出回放：清除区间过滤，恢复全部节点 */
  exit(): void {
    this.clearTimer();
    this.status = 'idle';
    this.active = false;
    this.currentYear = this.toYear;
    this.emit();
  }

  private tick(): void {
    if (this.status !== 'playing') return;

    const now = Date.now();
    const delta = now - this.lastTickAt;
    this.lastTickAt = now;

    const span = this.toYear - this.fromYear;
    const yearsPerMs = span / (DEFAULT_PLAY_DURATION_MS / this.speed);
    this.currentYear = Math.min(this.toYear, this.currentYear + delta * yearsPerMs);

    if (this.currentYear >= this.toYear) {
      this.currentYear = this.toYear;
      this.status = 'paused';
      this.clearTimer();
    }
    this.emit();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
