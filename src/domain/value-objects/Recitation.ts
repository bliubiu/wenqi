/**
 * 朗读脚本
 *
 * 负责把作品原文切分为朗读句子，并按音频时长估算逐句时间轴。
 */

export interface RecitationLine {
  index: number;
  text: string;
}

export interface RecitationTimelineEntry {
  index: number;
  startMs: number;
  endMs: number;
}

const SENTENCE_END = /[。！？；\n]/;

export class RecitationScript {
  private constructor(
    readonly lines: RecitationLine[],
    readonly totalChars: number
  ) {}

  static fromPoem(text: string): RecitationScript {
    const source = (text ?? '').replace(/\r\n?/g, '\n');
    const pieces: string[] = [];
    let buffer = '';

    for (const char of source) {
      if (SENTENCE_END.test(char)) {
        const body = buffer.trim();
        if (body) pieces.push(body + char.trim());
        buffer = '';
      } else {
        buffer += char;
      }
    }

    const tail = buffer.trim();
    if (tail) pieces.push(tail);

    const lines = pieces.map((lineText, index) => ({ index, text: lineText }));
    const totalChars = lines.reduce((sum, line) => sum + line.text.length, 0);
    return new RecitationScript(lines, totalChars);
  }

  /**
   * 按每句字数比例分配时间轴，用于没有逐句时间戳的演绎音频
   */
  timelineForDuration(durationMs: number): RecitationTimelineEntry[] {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || this.lines.length === 0) {
      return [];
    }

    const total = Math.max(this.totalChars, 1);
    let cursor = 0;
    const timeline = this.lines.map((line) => {
      const span = Math.max(1, Math.round((durationMs * Math.max(1, line.text.length)) / total));
      const startMs = cursor;
      cursor += span;
      return { index: line.index, startMs, endMs: cursor };
    });

    timeline[timeline.length - 1].endMs = Math.round(durationMs);
    return timeline;
  }

  lineAt(elapsedMs: number, timeline: RecitationTimelineEntry[]): number {
    if (timeline.length === 0) return -1;

    const time = Math.max(0, elapsedMs);
    let low = 0;
    let high = timeline.length - 1;

    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (timeline[mid].startMs <= time) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return timeline[low].index;
  }
}
