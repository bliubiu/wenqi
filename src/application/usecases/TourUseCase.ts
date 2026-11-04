/**
 * 主题漫游播放用例
 *
 * 状态机：idle → loading → playing ⇄ paused → finished
 * 步骤自动推进；含 narration 时等待朗读结束，取 max(设定时长, 朗读时长)。
 * 镜头与星团的实际动画由表现层根据步骤类型执行。
 */

import type { TourRepository } from '@/domain/ports/TourPorts';
import type { RecitationSpeaker } from '@/domain/ports/RecitationPorts';
import type { TourScript, TourStep, TourSummary } from '@/domain/value-objects/Tour';

export type TourStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'finished';

export interface TourState {
  status: TourStatus;
  tour: TourScript | null;
  stepIndex: number;
  step: TourStep | null;
  error: string | null;
}

type Listener = (state: TourState) => void;

export class TourUseCase {
  private status: TourStatus = 'idle';
  private tour: TourScript | null = null;
  private stepIndex = -1;
  private error: string | null = null;
  private readonly listeners = new Set<Listener>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private durationElapsed = false;
  private narrationDone = true;

  constructor(
    private readonly repository: TourRepository,
    private readonly speaker?: RecitationSpeaker,
    private readonly rate = 1
  ) {}

  getState(): TourState {
    return {
      status: this.status,
      tour: this.tour,
      stepIndex: this.stepIndex,
      step: this.tour?.steps[this.stepIndex] ?? null,
      error: this.error,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  listTours(): Promise<TourSummary[]> {
    return this.repository.listTours();
  }

  async start(tourId: string): Promise<void> {
    this.cleanupPlayback();
    this.status = 'loading';
    this.tour = null;
    this.stepIndex = -1;
    this.error = null;
    this.emit();

    try {
      const script = await this.repository.loadTour(tourId);
      if (!script || script.steps.length === 0) {
        this.status = 'idle';
        this.error = '漫游剧本不存在或为空';
        this.emit();
        return;
      }
      this.tour = script;
      this.stepIndex = 0;
      this.status = 'playing';
      this.emit();
      this.beginStep();
    } catch {
      this.status = 'idle';
      this.error = '漫游剧本加载失败';
      this.emit();
    }
  }

  next(): void {
    if (!this.tour || this.status === 'idle' || this.status === 'loading') return;
    if (this.stepIndex >= this.tour.steps.length - 1) {
      this.finish();
      return;
    }
    this.moveTo(this.stepIndex + 1);
  }

  prev(): void {
    if (!this.tour || this.status === 'idle' || this.status === 'loading') return;
    if (this.stepIndex <= 0) return;
    this.moveTo(this.stepIndex - 1);
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.clearTimer();
    this.speaker?.pause();
    this.status = 'paused';
    this.emit();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'playing';
    this.emit();
    this.beginStep();
  }

  exit(): void {
    this.cleanupPlayback();
    this.status = 'idle';
    this.tour = null;
    this.stepIndex = -1;
    this.error = null;
    this.emit();
  }

  private moveTo(index: number): void {
    this.clearTimer();
    this.speaker?.cancel();
    this.stepIndex = index;
    this.status = 'playing';
    this.emit();
    this.beginStep();
  }

  private beginStep(): void {
    this.clearTimer();
    const step = this.tour?.steps[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }

    this.durationElapsed = false;
    this.narrationDone = !step.narration;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.durationElapsed = true;
      this.tryAutoAdvance();
    }, step.durationMs);

    if (step.narration) this.speak(step.narration);
  }

  private speak(text: string): void {
    if (!this.speaker || !this.speaker.isSupported()) {
      this.narrationDone = true;
      return;
    }
    const done = () => {
      this.narrationDone = true;
      this.tryAutoAdvance();
    };
    this.speaker.speak(text, { rate: this.rate, onEnd: done, onError: done });
  }

  private tryAutoAdvance(): void {
    if (this.status !== 'playing' || !this.durationElapsed || !this.narrationDone) return;
    if (!this.tour || this.stepIndex >= this.tour.steps.length - 1) {
      this.finish();
      return;
    }
    this.moveTo(this.stepIndex + 1);
  }

  private finish(): void {
    this.clearTimer();
    this.speaker?.cancel();
    this.status = 'finished';
    this.emit();
  }

  private cleanupPlayback(): void {
    this.clearTimer();
    this.speaker?.cancel();
    this.durationElapsed = false;
    this.narrationDone = true;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
