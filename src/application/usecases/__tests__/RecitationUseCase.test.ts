import { describe, it, expect, vi } from 'vitest';
import { RecitationUseCase } from '../RecitationUseCase';
import type { RecitationSpeaker } from '@/domain/ports/RecitationPorts';

function createSpeaker(overrides: Partial<RecitationSpeaker> = {}) {
  const pending: Array<{ text: string; onEnd: () => void }> = [];
  const speaker: RecitationSpeaker = {
    isSupported: () => true,
    speak: vi.fn((text: string, options: { onEnd: () => void }) => {
      pending.push({ text, onEnd: options.onEnd });
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };

  return {
    speaker,
    pending,
    finishCurrent: () => {
      const current = pending.shift();
      current?.onEnd();
    },
  };
}

describe('RecitationUseCase', () => {
  it('装载文本后按行推进朗读', () => {
    const { speaker, finishCurrent } = createSpeaker();
    const useCase = new RecitationUseCase(speaker);

    useCase.load('一。二。');
    useCase.play();

    expect(useCase.getState()).toEqual({ status: 'playing', currentLine: 0, lineCount: 2 });

    finishCurrent();
    expect(useCase.getState().currentLine).toBe(1);

    finishCurrent();
    expect(useCase.getState()).toEqual({ status: 'idle', currentLine: -1, lineCount: 2 });
  });

  it('暂停与继续切换状态', () => {
    const { speaker } = createSpeaker();
    const useCase = new RecitationUseCase(speaker);

    useCase.load('一。');
    useCase.play();
    useCase.pause();
    expect(useCase.getState().status).toBe('paused');
    expect(speaker.pause).toHaveBeenCalled();

    useCase.resume();
    expect(useCase.getState().status).toBe('playing');
    expect(speaker.resume).toHaveBeenCalled();
  });

  it('停止后清空当前行并取消语音', () => {
    const { speaker } = createSpeaker();
    const useCase = new RecitationUseCase(speaker);

    useCase.load('一。二。');
    useCase.play(1);
    useCase.stop();

    expect(useCase.getState()).toEqual({ status: 'idle', currentLine: -1, lineCount: 2 });
    expect(speaker.cancel).toHaveBeenCalled();
  });

  it('不支持语音合成时不启动朗读', () => {
    const speaker: RecitationSpeaker = {
      isSupported: () => false,
      speak: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    };
    const useCase = new RecitationUseCase(speaker);

    useCase.load('一。');
    useCase.play();

    expect(useCase.getState().status).toBe('idle');
    expect(speaker.speak).not.toHaveBeenCalled();
  });

  it('状态变化通知订阅者', () => {
    const { speaker, finishCurrent } = createSpeaker();
    const useCase = new RecitationUseCase(speaker);
    const listener = vi.fn();
    useCase.subscribe(listener);

    useCase.load('一。二。');
    useCase.play();
    finishCurrent();

    expect(listener).toHaveBeenCalled();
    expect(listener).toHaveBeenLastCalledWith({ status: 'playing', currentLine: 1, lineCount: 2 });
  });
});
