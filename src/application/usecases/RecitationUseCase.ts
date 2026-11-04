import { RecitationScript } from '@/domain/value-objects/Recitation';
import type { RecitationSpeaker } from '@/domain/ports/RecitationPorts';

export type RecitationStatus = 'idle' | 'playing' | 'paused';

export interface RecitationState {
  status: RecitationStatus;
  currentLine: number;
  lineCount: number;
}

type Listener = (state: RecitationState) => void;

/**
 * 朗读用例
 *
 * 逐句调用语音合成端口，推进当前朗读行。
 */
export class RecitationUseCase {
  private script = RecitationScript.fromPoem('');
  private status: RecitationStatus = 'idle';
  private currentLine = -1;
  private listeners = new Set<Listener>();

  constructor(
    private readonly speaker: RecitationSpeaker,
    private readonly rate: number = 1
  ) {}

  getState(): RecitationState {
    return {
      status: this.status,
      currentLine: this.currentLine,
      lineCount: this.script.lines.length,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(text: string): void {
    this.speaker.cancel();
    this.script = RecitationScript.fromPoem(text);
    this.status = 'idle';
    this.currentLine = -1;
    this.emit();
  }

  play(fromLine = 0): void {
    if (this.script.lines.length === 0 || !this.speaker.isSupported()) return;

    this.currentLine = Math.min(Math.max(fromLine, 0), this.script.lines.length - 1);
    this.status = 'playing';
    this.emit();
    this.speakCurrent();
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.speaker.pause();
    this.status = 'paused';
    this.emit();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.speaker.resume();
    this.status = 'playing';
    this.emit();
  }

  stop(): void {
    this.speaker.cancel();
    this.status = 'idle';
    this.currentLine = -1;
    this.emit();
  }

  private speakCurrent(): void {
    const line = this.script.lines[this.currentLine];
    if (!line) {
      this.finish();
      return;
    }

    this.speaker.speak(line.text, {
      rate: this.rate,
      onEnd: () => {
        if (this.status !== 'playing') return;

        const next = this.currentLine + 1;
        if (next >= this.script.lines.length) {
          this.finish();
          return;
        }

        this.currentLine = next;
        this.emit();
        this.speakCurrent();
      },
      onError: () => this.finish(),
    });
  }

  private finish(): void {
    this.status = 'idle';
    this.currentLine = -1;
    this.emit();
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
