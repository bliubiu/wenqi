'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RecitationScript } from '@/domain/value-objects/Recitation';
import type { RecitationUseCase, RecitationState } from '@/application/usecases/RecitationUseCase';
import { SpeechSynthesisAdapter } from '@/infrastructure/audio/SpeechSynthesisAdapter';
import { WebAudioTrackPlayer } from '@/infrastructure/audio/WebAudioTrackPlayer';
import { findKnownRecitation } from '@/infrastructure/audio/knownRecitations';
import { recitationPulseBus } from '@/presentation/audio/pulseBus';
import { CompositionRoot } from '@/di/composition-root';

interface WorkRecitationProps {
  text: string;
  title: string;
}

const EMPTY_STATE: RecitationState = { status: 'idle', currentLine: -1, lineCount: 0 };

function formatSeconds(milliseconds: number): string {
  const total = Math.round(milliseconds / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function WorkRecitation({ text, title }: WorkRecitationProps) {
  const script = useMemo(() => RecitationScript.fromPoem(text), [text]);
  const known = useMemo(() => findKnownRecitation(title), [title]);

  const useCaseRef = useRef<RecitationUseCase | null>(null);
  const playerRef = useRef<WebAudioTrackPlayer | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tts, setTts] = useState<RecitationState>(EMPTY_STATE);
  const [ttsSupported] = useState(() => new SpeechSynthesisAdapter().isSupported());
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [audioLine, setAudioLine] = useState(-1);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioError, setAudioError] = useState('');

  useEffect(() => {
    const useCase = CompositionRoot.getInstance().recitationUseCase;
    useCaseRef.current = useCase;
    useCase.load(text);
    const unsubscribe = useCase.subscribe(setTts);

    return () => {
      unsubscribe();
      useCase.stop();
      useCaseRef.current = null;
      playerRef.current?.pause();
      setAudioState('idle');
    };
  }, [text]);

  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  const activeLine = audioState !== 'idle' ? audioLine : tts.currentLine;

  // —— 朗诵节奏可视化：真实音频取波形 RMS，TTS 无音频时用正弦包络模拟朗读节奏 ——
  useEffect(() => {
    const active = audioState === 'playing' || tts.status === 'playing';
    if (!active) {
      recitationPulseBus.reset();
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      if (audioState === 'playing') {
        recitationPulseBus.publish(playerRef.current?.getWaveformLevel() ?? 0);
      } else {
        const seconds = (now - startedAt) / 1000;
        // 低频呼吸叠加语速起伏，模拟朗读的抑扬顿挫
        const simulated = 0.32 + 0.22 * Math.sin(seconds * 4.2) + 0.12 * Math.sin(seconds * 9.1);
        recitationPulseBus.publish(Math.max(0, simulated));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      recitationPulseBus.reset();
    };
  }, [audioState, tts.status]);

  const toggleTts = () => {
    const useCase = useCaseRef.current;
    if (!useCase) return;

    if (audioState === 'playing') {
      playerRef.current?.pause();
      setAudioState('paused');
    }

    if (tts.status === 'playing') {
      useCase.pause();
    } else if (tts.status === 'paused') {
      useCase.resume();
    } else {
      useCase.play();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAudioError('');
    const player = new WebAudioTrackPlayer();

    try {
      const source = URL.createObjectURL(file);
      const duration = await player.load(source);
      const timeline = script.timelineForDuration(duration);

      player.onTimeUpdate((milliseconds) => {
        setAudioLine(script.lineAt(milliseconds, timeline));
        if (milliseconds >= duration - 100) setAudioState('idle');
      });

      playerRef.current?.dispose();
      playerRef.current = player;
      setAudioDuration(duration);
      setAudioLine(-1);
      setAudioState('idle');
    } catch {
      player.dispose();
      setAudioError('音频加载失败，请更换文件重试');
    }

    event.target.value = '';
  };

  const toggleAudio = () => {
    const player = playerRef.current;
    if (!player) return;

    if (audioState === 'playing') {
      player.pause();
      setAudioState('paused');
      return;
    }

    if (tts.status === 'playing') useCaseRef.current?.pause();
    player.play();
    setAudioState('playing');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {ttsSupported && (
          <button
            onClick={toggleTts}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-[#2A2820] text-[#E8E0D0]/60 hover:text-[#E8E0D0]/90 hover:border-[#B68B5C]/50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.5v13l-5-4H3v-5h3l5-4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />
            </svg>
            {tts.status === 'playing' ? '暂停朗读' : tts.status === 'paused' ? '继续朗读' : '朗读'}
          </button>
        )}

        {tts.status !== 'idle' && (
          <button
            onClick={() => useCaseRef.current?.stop()}
            className="px-2 py-1.5 text-xs rounded border border-[#2A2820] text-[#E8E0D0]/35 hover:text-[#E8E0D0]/70 transition-colors"
          >
            停止
          </button>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-[#2A2820] text-[#E8E0D0]/60 hover:text-[#E8E0D0]/90 hover:border-[#B68B5C]/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          导入演绎音频
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {audioDuration > 0 && (
          <button
            onClick={toggleAudio}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-[#B68B5C]/40 text-[#E8E0D0]/80 hover:border-[#B68B5C]/70 transition-colors"
          >
            {audioState === 'playing' ? '暂停演绎' : '播放演绎'}
            <span className="text-[10px] text-[#E8E0D0]/30 font-mono">{formatSeconds(audioDuration)}</span>
          </button>
        )}
      </div>

      {known && (
        <p className="mb-4 text-xs text-[#B68B5C]/60">
          演绎参考：{known.performer}《{known.songTitle}》
        </p>
      )}

      <div className="relative pl-4 border-l border-[#2A2820]">
        <div className="text-base sm:text-lg font-serif text-[#E8E0D0]/80 leading-[2.2] tracking-wider">
          {script.lines.map((line) => (
            <p
              key={line.index}
              className={`transition-colors duration-300 ${
                line.index === activeLine ? 'text-[#E8E0D0]' : 'text-[#E8E0D0]/45'
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>

      {audioError && <p className="mt-4 text-xs text-[#E8E0D0]/50">{audioError}</p>}

      {(known || audioDuration > 0) && (
        <p className="mt-4 text-[10px] leading-relaxed text-[#E8E0D0]/25">
          录音版权归表演者与录音制作者所有，本站不提供音频文件，请仅导入你合法持有的本地音频。
        </p>
      )}
    </div>
  );
}
