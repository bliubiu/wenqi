import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TourUseCase } from '../TourUseCase';
import type { TourRepository } from '@/domain/ports/TourPorts';
import type { RecitationSpeaker, SpeechOptions } from '@/domain/ports/RecitationPorts';
import type { TourScript } from '@/domain/value-objects/Tour';

const SCRIPT: TourScript = {
  id: 'mid-autumn-moon',
  title: '千里共婵娟',
  description: '中秋咏月',
  steps: [
    { type: 'focus', refId: 'poet_zhang', durationMs: 3000, caption: '张若虚' },
    { type: 'cluster', clusterKey: 'SONG', durationMs: 2000, caption: '宋词星空', narration: '宋人把月亮写进词里' },
    { type: 'focus', refId: 'poet_su', durationMs: 3000, caption: '苏轼' },
  ],
};

function createRepository(script: TourScript | null = SCRIPT): TourRepository {
  return {
    listTours: async () => [],
    loadTour: async () => script,
  };
}

class FakeSpeaker implements RecitationSpeaker {
  spoken: string[] = [];
  options: SpeechOptions[] = [];
  paused = false;
  cancelled = false;

  isSupported(): boolean {
    return true;
  }

  speak(text: string, options: SpeechOptions): void {
    this.spoken.push(text);
    this.options.push(options);
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  cancel(): void { this.cancelled = true; }
}

describe('TourUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 加载剧本后进入 playing 并停在第 0 步', async () => {
    const useCase = new TourUseCase(createRepository());
    const states: string[] = [];
    useCase.subscribe((s) => states.push(`${s.status}:${s.stepIndex}`));

    const pending = useCase.start('mid-autumn-moon');
    expect(useCase.getState().status).toBe('loading');
    await pending;

    expect(states[0]).toBe('loading:-1');
    expect(states[states.length - 1]).toBe('playing:0');
    expect(useCase.getState().step?.caption).toBe('张若虚');
  });

  it('剧本不存在时回到 idle 并给出错误', async () => {
    const useCase = new TourUseCase(createRepository(null));
    await useCase.start('missing');
    expect(useCase.getState().status).toBe('idle');
    expect(useCase.getState().error).toBe('漫游剧本不存在或为空');
  });

  it('到达末步再下一步时结束漫游', async () => {
    const useCase = new TourUseCase(createRepository());
    await useCase.start('mid-autumn-moon');

    useCase.next();
    expect(useCase.getState().stepIndex).toBe(1);
    useCase.next();
    expect(useCase.getState().stepIndex).toBe(2);
    useCase.next();
    expect(useCase.getState().status).toBe('finished');
  });

  it('上一步在第 0 步时不越界', async () => {
    const useCase = new TourUseCase(createRepository());
    await useCase.start('mid-autumn-moon');
    useCase.prev();
    expect(useCase.getState().stepIndex).toBe(0);
    expect(useCase.getState().status).toBe('playing');
  });

  it('无朗读步骤到时自动推进', async () => {
    const useCase = new TourUseCase(createRepository());
    await useCase.start('mid-autumn-moon');

    vi.advanceTimersByTime(3000);
    expect(useCase.getState().stepIndex).toBe(1);
  });

  it('有朗读步骤需等待朗读结束才推进', async () => {
    const speaker = new FakeSpeaker();
    const useCase = new TourUseCase(createRepository(), speaker);
    await useCase.start('mid-autumn-moon');
    useCase.next();

    vi.advanceTimersByTime(2000);
    expect(useCase.getState().stepIndex).toBe(1);

    speaker.options[speaker.options.length - 1].onEnd();
    expect(useCase.getState().stepIndex).toBe(2);
  });

  it('pause 后不再自动推进，resume 重新开始计时', async () => {
    const useCase = new TourUseCase(createRepository());
    await useCase.start('mid-autumn-moon');

    useCase.pause();
    vi.advanceTimersByTime(5000);
    expect(useCase.getState().status).toBe('paused');
    expect(useCase.getState().stepIndex).toBe(0);

    useCase.resume();
    vi.advanceTimersByTime(3000);
    expect(useCase.getState().stepIndex).toBe(1);
  });

  it('exit 清空状态并取消朗读', async () => {
    const speaker = new FakeSpeaker();
    const useCase = new TourUseCase(createRepository(), speaker);
    await useCase.start('mid-autumn-moon');
    useCase.next();
    useCase.exit();

    expect(useCase.getState().status).toBe('idle');
    expect(useCase.getState().tour).toBeNull();
    expect(useCase.getState().stepIndex).toBe(-1);
    expect(speaker.cancelled).toBe(true);
  });

  it('朗读不受支持时静默降级为字幕', async () => {
    const speaker = new FakeSpeaker();
    speaker.isSupported = () => false;
    const useCase = new TourUseCase(createRepository(), speaker);
    await useCase.start('mid-autumn-moon');
    useCase.next();

    vi.advanceTimersByTime(2000);
    expect(useCase.getState().stepIndex).toBe(2);
  });
});
