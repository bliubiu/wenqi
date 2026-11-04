import { describe, expect, it } from 'vitest';
import {
  assignDailyWorks,
  buildMonthDays,
  rankCandidates,
  selectAnchors,
  type DailyCandidate,
} from '../../scripts/build-daily-poems';

const candidate = (id: string, title: string, popularity: number): DailyCandidate => ({
  id,
  title,
  poetId: `poet_${id}`,
  poetName: '某诗人',
  dynasty: 'TANG',
  popularity,
});

describe('buildMonthDays', () => {
  it('生成 366 天且包含闰日', () => {
    const days = buildMonthDays();
    expect(days).toHaveLength(366);
    expect(days).toContain('02-29');
    expect(days[0]).toBe('01-01');
    expect(days[days.length - 1]).toBe('12-31');
  });
});

describe('selectAnchors', () => {
  it('命中节气标题时取人气最高者', () => {
    const anchors = selectAnchors([
      candidate('a', '清明日对酒', 20),
      candidate('b', '清明', 90),
      candidate('c', '春夜喜雨', 30),
    ]);
    expect(anchors.get('04-05')).toEqual({ candidate: expect.objectContaining({ id: 'b' }), tag: '清明' });
  });

  it('无命中时不含该锚点', () => {
    expect(selectAnchors([]).size).toBe(0);
  });
});

describe('rankCandidates', () => {
  it('按人气降序，同分按 ID 稳定排序', () => {
    const ranked = rankCandidates([candidate('b', '甲', 10), candidate('a', '乙', 10), candidate('c', '丙', 20)]);
    expect(ranked.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('assignDailyWorks', () => {
  it('锚点优先且全年作品不重复（候选耗尽后停止分配）', () => {
    const all = [
      candidate('x', '春晓', 30),
      candidate('y', '静夜思', 20),
      candidate('z', '登鹳雀楼', 10),
      candidate('q', '清明', 40),
    ];
    const anchors = selectAnchors(all);
    // 锚点日排在候选耗尽之前，才能验证「锚点优先」而非被池顺序抢占
    const days = ['04-05', '01-02', '01-03', '01-04', '01-05'];
    const assigned = assignDailyWorks(days, anchors, rankCandidates(all));

    expect(assigned).toHaveLength(4);
    expect(assigned[0].monthDay).toBe('04-05');
    expect(assigned[0].tag).toBe('清明');
    expect(assigned[0].candidate.id).toBe('q');
    const ids = assigned.map((a) => a.candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
