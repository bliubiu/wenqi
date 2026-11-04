import { describe, it, expect } from 'bun:test';
import { RecitationPulseBus } from '../pulseBus';

describe('朗诵脉动总线', () => {
  it('发布幅度应裁剪到 [0,1]', () => {
    const bus = new RecitationPulseBus();
    bus.publish(3);
    expect(bus.getLevel()).toBe(1);
    bus.publish(-2);
    expect(bus.getLevel()).toBe(0);
    bus.publish(Number.NaN);
    expect(bus.getLevel()).toBe(0);
  });

  it('幅度变化超过阈值时通知订阅者', () => {
    const bus = new RecitationPulseBus();
    const levels: number[] = [];
    bus.subscribe((level) => levels.push(level));
    bus.publish(0.5);
    bus.publish(0.1);
    expect(levels).toEqual([0.5, 0.1]);
  });

  it('微小变化不触发通知，避免逐帧重绘风暴', () => {
    const bus = new RecitationPulseBus();
    const levels: number[] = [];
    bus.subscribe((level) => levels.push(level));
    bus.publish(0.005);
    bus.publish(0.008);
    expect(levels).toEqual([]);
  });

  it('reset 应归零并通知订阅者', () => {
    const bus = new RecitationPulseBus();
    const levels: number[] = [];
    bus.subscribe((level) => levels.push(level));
    bus.publish(0.6);
    bus.reset();
    expect(bus.getLevel()).toBe(0);
    expect(levels).toEqual([0.6, 0]);
  });

  it('取消订阅后不再收到通知', () => {
    const bus = new RecitationPulseBus();
    const levels: number[] = [];
    const unsubscribe = bus.subscribe((level) => levels.push(level));
    bus.publish(0.4);
    unsubscribe();
    bus.reset();
    expect(levels).toEqual([0.4]);
  });
});
