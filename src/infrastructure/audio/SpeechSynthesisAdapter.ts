import type { RecitationSpeaker, SpeechOptions } from '@/domain/ports/RecitationPorts';

/**
 * 浏览器语音合成适配器
 */
export class SpeechSynthesisAdapter implements RecitationSpeaker {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  speak(text: string, options: SpeechOptions): void {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = options.rate;
    utterance.pitch = 1;
    utterance.onend = () => options.onEnd();
    utterance.onerror = (event) => options.onError?.(event);
    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    window.speechSynthesis.pause();
  }

  resume(): void {
    window.speechSynthesis.resume();
  }

  cancel(): void {
    window.speechSynthesis.cancel();
  }
}
