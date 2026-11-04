import { describe, it, expect } from 'vitest';
import { RecitationScript } from '../Recitation';

describe('RecitationScript', () => {
  it('按句末标点切分，并保留标点', () => {
    const script = RecitationScript.fromPoem('明月几时有？把酒问青天。不知天上宫阙，今夕是何年。');

    expect(script.lines).toEqual([
      { index: 0, text: '明月几时有？' },
      { index: 1, text: '把酒问青天。' },
      { index: 2, text: '不知天上宫阙，今夕是何年。' },
    ]);
  });

  it('忽略空白与空行', () => {
    const script = RecitationScript.fromPoem('  关关雎鸠，在河之洲。\n\n  窈窕淑女，君子好逑。  ');

    expect(script.lines).toHaveLength(2);
    expect(script.lines[1].text).toBe('窈窕淑女，君子好逑。');
  });

  it('空文本得到空脚本', () => {
    const script = RecitationScript.fromPoem('');

    expect(script.lines).toHaveLength(0);
    expect(script.timelineForDuration(1000)).toEqual([]);
  });

  it('按字数比例生成连续时间轴', () => {
    const script = RecitationScript.fromPoem('短句。长句长句长句。');
    const timeline = script.timelineForDuration(900);

    expect(timeline).toHaveLength(2);
    expect(timeline[0].startMs).toBe(0);
    expect(timeline[1].startMs).toBe(timeline[0].endMs);
    expect(timeline[1].endMs).toBe(900);
    expect(timeline[1].endMs - timeline[1].startMs).toBeGreaterThan(
      timeline[0].endMs - timeline[0].startMs
    );
  });

  it('时长非法时返回空时间轴', () => {
    const script = RecitationScript.fromPoem('关关雎鸠。');

    expect(script.timelineForDuration(0)).toEqual([]);
    expect(script.timelineForDuration(Number.NaN)).toEqual([]);
  });

  it('按播放时间定位当前句', () => {
    const script = RecitationScript.fromPoem('一。二。三。');
    const timeline = script.timelineForDuration(900);

    expect(script.lineAt(0, timeline)).toBe(0);
    expect(script.lineAt(450, timeline)).toBe(1);
    expect(script.lineAt(900, timeline)).toBe(2);
    expect(script.lineAt(2000, timeline)).toBe(2);
    expect(script.lineAt(-10, timeline)).toBe(0);
  });

  it('没有时间轴时返回 -1', () => {
    const script = RecitationScript.fromPoem('关关雎鸠。');

    expect(script.lineAt(0, [])).toBe(-1);
  });
});
