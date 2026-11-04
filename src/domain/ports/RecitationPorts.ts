/**
 * 朗读端口
 *
 * 语音合成与音频播放通过端口抽象，便于应用层测试与替换实现。
 */

export interface SpeechOptions {
  rate: number;
  onEnd: () => void;
  onError?: (error: unknown) => void;
}

export interface RecitationSpeaker {
  isSupported(): boolean;
  speak(text: string, options: SpeechOptions): void;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface AudioTrackPlayer {
  load(source: string): Promise<number>;
  play(): void;
  pause(): void;
  seek(milliseconds: number): void;
  getCurrentTime(): number;
  onTimeUpdate(callback: (milliseconds: number) => void): void;
  dispose(): void;
}
