import { describe, it, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { getConfig, mergeConfig } from '../ConfigLoader';

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

describe('配置深合并', () => {
  const base = {
    version: '1.0.0',
    data: { source: 'a.json', shards: { enabled: false, by: 'dynasty' } },
    rendering: { targetFps: 60, lodThresholds: [50, 200, 800] },
  };

  it('嵌套对象逐层合并，未覆盖字段保留默认值', () => {
    const merged = mergeConfig(base, { data: { shards: { enabled: true } } });
    expect(merged.data.shards.enabled).toBe(true);
    expect(merged.data.shards.by).toBe('dynasty');
    expect(merged.data.source).toBe('a.json');
    expect(merged.version).toBe('1.0.0');
  });

  it('数组整体覆盖而非合并', () => {
    const merged = mergeConfig(base, { rendering: { lodThresholds: [40, 100] } });
    expect(merged.rendering.lodThresholds).toEqual([40, 100]);
    expect(merged.rendering.targetFps).toBe(60);
  });

  it('非对象覆盖值被忽略，保持默认配置', () => {
    expect(mergeConfig(base, null).version).toBe('1.0.0');
    expect(mergeConfig(base, 'bad').version).toBe('1.0.0');
    expect(mergeConfig(base, []).version).toBe('1.0.0');
  });

  it('不修改原始默认配置对象', () => {
    mergeConfig(base, { data: { shards: { enabled: true } } });
    expect(base.data.shards.enabled).toBe(false);
  });
});

describe('application.yml 与配置结构一致', () => {
  const yml = parse(readFileSync('application.yml', 'utf8')) as Record<string, unknown>;

  it('包含配置加载所需的全部顶层键', () => {
    for (const key of ['version', 'data', 'wasm', 'rendering', 'scoring', 'logging', 'persistence', 'font']) {
      expect(yml[key]).toBeDefined();
    }
  });

  it('核心字段类型符合 AppConfig 约定', () => {
    const data = yml.data as Record<string, unknown>;
    const shards = data.shards as Record<string, unknown>;
    expect(typeof yml.version).toBe('string');
    expect(typeof shards.enabled).toBe('boolean');
    expect(shards.by).toBe('dynasty');
    expect(Array.isArray((yml.rendering as Record<string, unknown>).lodThresholds)).toBe(true);
  });

  it('日志级别取值合法', () => {
    const logging = yml.logging as Record<string, unknown>;
    expect(['DEBUG', 'INFO', 'ERROR']).toContain(String(logging.level));
    expect(typeof logging.retentionDays).toBe('number');
  });
});
