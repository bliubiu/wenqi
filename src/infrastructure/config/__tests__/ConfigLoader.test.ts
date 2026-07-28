import { describe, it, expect, beforeEach } from 'bun:test';
import { getConfig } from '../ConfigLoader';

describe('ConfigLoader', () => {
  beforeEach(() => {
    // 重新导入前重置单例
    // 由于模块级单例，每个测试共享同一个实例
  });

  it('应返回版本号', () => {
    const config = getConfig();
    expect(config.get('version')).toBe('1.0.0');
  });

  it('应返回日志配置', () => {
    const config = getConfig();
    const logConfig = config.getLoggingConfig();
    expect(logConfig.level).toBe('INFO');
    expect(logConfig.retentionDays).toBe(32);
    expect(logConfig.fileOutput).toBe(true);
  });

  it('应返回评分权重', () => {
    const config = getConfig();
    const weights = config.getScoringWeights();
    expect(weights.talent).toBe(1.0);
    expect(weights.popularity).toBe(1.0);
    expect(weights.luck).toBe(1.0);
  });

  it('应返回 WASM 配置', () => {
    const config = getConfig();
    const wasm = config.get('wasm');
    expect(wasm.modulePath).toBe('/wasm/wenqi_core.wasm');
    expect(wasm.initTimeoutMs).toBe(5000);
  });

  it('应返回数据配置', () => {
    const config = getConfig();
    const data = config.get('data');
    expect(data.source).toBe('data/processed/dataset.json');
  });

  it('应返回渲染配置', () => {
    const config = getConfig();
    const rendering = config.get('rendering');
    expect(rendering.targetFps).toBe(60);
    expect(rendering.lodThresholds).toEqual([50, 200, 800]);
  });
});
