import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_PLAY_DURATION_MS, TimeTravelUseCase } from '../TimeTravelUseCase';

describe('TimeTravelUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setRange 进入激活态并把播放头置于区间终点', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1000, 1200);

    const state = useCase.getState();
    expect(state.active).toBe(true);
    expect(state.status).toBe('paused');
    expect(state.fromYear).toBe(1000);
    expect(state.toYear).toBe(1200);
    expect(state.currentYear).toBe(1200);
    expect(useCase.getVisibleRange()).toEqual({ from: 1000, to: 1200 });
  });

  it('setRange 自动交换倒置的区间', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1300, 1100);
    expect(useCase.getState().fromYear).toBe(1100);
    expect(useCase.getState().toYear).toBe(1300);
  });

  it('未激活时可见范围为 null', () => {
    const useCase = new TimeTravelUseCase();
    expect(useCase.getVisibleRange()).toBeNull();
  });

  it('play 从区间起点推进，1 倍速全程约 60 秒结束并停在终点', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1000, 1200);
    useCase.play();
    expect(useCase.getState().currentYear).toBe(1000);

    vi.advanceTimersByTime(DEFAULT_PLAY_DURATION_MS / 2);
    const mid = useCase.getState().currentYear;
    expect(mid).toBeGreaterThan(1090);
    expect(mid).toBeLessThanOrEqual(1110);

    vi.advanceTimersByTime(DEFAULT_PLAY_DURATION_MS / 2 + 32);
    expect(useCase.getState().currentYear).toBe(1200);
    expect(useCase.getState().status).toBe('paused');
    expect(useCase.getVisibleRange()).toEqual({ from: 1000, to: 1200 });
  });

  it('4 倍速约 15 秒完成全程', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1000, 1200);
    useCase.setSpeed(4);
    useCase.play();

    vi.advanceTimersByTime(DEFAULT_PLAY_DURATION_MS / 4 - 32);
    const beforeEnd = useCase.getState().currentYear;
    expect(beforeEnd).toBeGreaterThan(1180);
    expect(beforeEnd).toBeLessThan(1200);

    vi.advanceTimersByTime(64);
    expect(useCase.getState().currentYear).toBe(1200);
    expect(useCase.getState().status).toBe('paused');
  });

  it('setSpeed 忽略不支持的倍速', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setSpeed(3);
    expect(useCase.getState().speed).toBe(1);
    useCase.setSpeed(2);
    expect(useCase.getState().speed).toBe(2);
  });

  it('pause 后停止推进，继续播放保持当前位置', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1000, 1100);
    useCase.play();

    vi.advanceTimersByTime(DEFAULT_PLAY_DURATION_MS / 4);
    useCase.pause();
    const paused = useCase.getState().currentYear;
    expect(useCase.getState().status).toBe('paused');

    vi.advanceTimersByTime(DEFAULT_PLAY_DURATION_MS / 2);
    expect(useCase.getState().currentYear).toBe(paused);
  });

  it('播放中调整区间会中止播放', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1000, 1200);
    useCase.play();
    vi.advanceTimersByTime(DEFAULT_PLAY_DURATION_MS / 4);

    useCase.setRange(1100, 1150);
    const state = useCase.getState();
    expect(state.status).toBe('paused');
    expect(state.currentYear).toBe(1150);
    expect(state.fromYear).toBe(1100);
  });

  it('exit 清除激活态并恢复全量可见范围', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1000, 1200);
    useCase.play();
    useCase.exit();

    expect(useCase.getState().active).toBe(false);
    expect(useCase.getState().status).toBe('idle');
    expect(useCase.getVisibleRange()).toBeNull();
  });

  it('区间为空时 play 不启动', () => {
    const useCase = new TimeTravelUseCase();
    useCase.setRange(1200, 1200);
    useCase.play();
    expect(useCase.getState().status).toBe('paused');
    expect(useCase.getVisibleRange()).toEqual({ from: 1200, to: 1200 });
  });

  it('订阅者能接收到状态推送', () => {
    const useCase = new TimeTravelUseCase();
    const states: Array<{ active: boolean; currentYear: number }> = [];
    useCase.subscribe((state) => states.push({ active: state.active, currentYear: state.currentYear }));

    useCase.setRange(1000, 1200);
    expect(states).toHaveLength(1);
    expect(states[0]).toEqual({ active: true, currentYear: 1200 });
  });
});
