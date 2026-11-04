import type { AudioTrackPlayer } from '@/domain/ports/RecitationPorts';

/**
 * 浏览器音频播放适配器
 *
 * 音频来源由用户提供，站点不分发受版权保护的录音。
 */
export class WebAudioTrackPlayer implements AudioTrackPlayer {
  private audio: HTMLAudioElement | null = null;
  private source = '';
  private listeners: Array<(milliseconds: number) => void> = [];
  private boundTimeUpdate: (() => void) | null = null;

  /** 波形分析（仅用于驱动可视化，不改变音频内容） */
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private waveform: Uint8Array<ArrayBuffer> | null = null;

  async load(source: string): Promise<number> {
    this.dispose();

    this.source = source;
    const audio = new Audio(source);
    this.audio = audio;

    this.boundTimeUpdate = () => {
      const time = audio.currentTime * 1000;
      this.listeners.forEach((listener) => listener(time));
    };
    audio.addEventListener('timeupdate', this.boundTimeUpdate);

    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error('音频加载失败'));
    });

    this.ensureAnalyser();

    return (audio.duration || 0) * 1000;
  }

  play(): void {
    void this.audio?.play();
    void this.audioContext?.resume();
  }

  pause(): void {
    this.audio?.pause();
  }

  seek(milliseconds: number): void {
    if (this.audio) this.audio.currentTime = milliseconds / 1000;
  }

  getCurrentTime(): number {
    return (this.audio?.currentTime ?? 0) * 1000;
  }

  onTimeUpdate(callback: (milliseconds: number) => void): void {
    this.listeners.push(callback);
  }

  /** 当前音频波形幅度（RMS，0–1），供星辰脉动可视化使用；不支持 Web Audio 时返回 0 */
  getWaveformLevel(): number {
    if (!this.analyser || !this.waveform) return 0;

    this.analyser.getByteTimeDomainData(this.waveform);
    let sumSquares = 0;
    for (let i = 0; i < this.waveform.length; i++) {
      const value = (this.waveform[i] - 128) / 128;
      sumSquares += value * value;
    }
    const rms = Math.sqrt(sumSquares / this.waveform.length);
    return Math.min(1, rms * 3.2);
  }

  private ensureAnalyser(): void {
    if (this.analyser || !this.audio) return;

    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(this.audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyser.connect(context.destination);

      this.audioContext = context;
      this.analyser = analyser;
      this.waveform = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      // 浏览器不支持 Web Audio 时静默降级，音频仍可正常播放
      this.audioContext = null;
      this.analyser = null;
      this.waveform = null;
    }
  }

  dispose(): void {
    if (this.audio) {
      this.audio.pause();
      if (this.boundTimeUpdate) {
        this.audio.removeEventListener('timeupdate', this.boundTimeUpdate);
      }
      this.audio = null;
    }
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.waveform = null;
    if (this.source.startsWith('blob:')) {
      URL.revokeObjectURL(this.source);
    }
    this.source = '';
    this.boundTimeUpdate = null;
    this.listeners = [];
  }
}
