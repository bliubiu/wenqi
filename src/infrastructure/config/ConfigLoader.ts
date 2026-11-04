import { type AppConfig, type LoggingConfig } from './AppConfig';
import { type LoggerConfig } from '../logging/LoggerFactory';

const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  data: {
    source: 'data/processed/dataset.json',
    version: '2026.06.24',
    shards: {
      enabled: false,
      by: 'dynasty',
      preloadAll: false,
      lazyLoadOnSearch: true,
    },
  },
  wasm: {
    modulePath: '/wasm/wenqi_core.wasm',
    initTimeoutMs: 5000,
  },
  rendering: {
    targetFps: 60,
    maxNodes: 10000,
    maxEdges: 20000,
    lodThresholds: [50, 200, 800],
    divergenceThreshold: 100,
  },
  scoring: {
    algorithmVersion: 'v1.0',
    weights: {
      talent: 1.0,
      popularity: 1.0,
      luck: 1.0,
    },
  },
  logging: {
    level: 'INFO',
    fileOutput: true,
    filePath: 'logs/',
    retentionDays: 32,
    exportEnabled: true,
  },
  persistence: {
    dataset: { cache: 'indexedDB', versionKey: 'data.version', autoUpdate: true },
    scores: { cache: 'indexedDB', versionKey: 'scoring.algorithmVersion' },
    viewConfig: { storage: 'localStorage' },
  },
  font: {
    primary: 'Noto Sans SC',
    fallback: 'system-ui, sans-serif',
  },
};

class ConfigLoader {
  private config: AppConfig;

  constructor() {
    this.config = loadWithEnvOverrides(mergeWithInjectedConfig(DEFAULT_CONFIG));
  }

  get<T extends keyof AppConfig>(key: T): AppConfig[T] {
    return this.config[key];
  }

  getLoggingConfig(): LoggerConfig {
    const lc = this.config.logging;
    return {
      level: lc.level,
      fileOutput: lc.fileOutput,
      filePath: lc.filePath,
      retentionDays: lc.retentionDays,
    };
  }

  getScoringWeights(): { talent: number; popularity: number; luck: number } {
    return { ...this.config.scoring.weights };
  }
}

/** 判断是否为可递归合并的普通对象 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 深合并：对象逐层合并，数组与基本类型整体覆盖 */
export function mergeConfig<T>(base: T, override: unknown): T {
  if (!isPlainObject(override) || !isPlainObject(base)) return base;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isPlainObject(value) && isPlainObject(current) ? mergeConfig(current, value) : value;
  }
  return result as T;
}

/** 构建期由 next.config.js 注入的 application.yml 内容 */
function mergeWithInjectedConfig(defaults: AppConfig): AppConfig {
  const raw = typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_WENQI_CONFIG : undefined;
  if (!raw) return defaults;
  try {
    return mergeConfig(defaults, JSON.parse(raw));
  } catch {
    console.warn('[配置] application.yml 注入内容解析失败，回退默认配置');
    return defaults;
  }
}

function loadWithEnvOverrides(defaults: AppConfig): AppConfig {
  let cfg = defaults;

  if (typeof process !== 'undefined' && process.env) {
    const logLevel = process.env.WENQI_LOG_LEVEL as string;
    if (logLevel && ['DEBUG', 'INFO', 'ERROR'].includes(logLevel)) {
      cfg = { ...cfg, logging: { ...cfg.logging, level: logLevel as LoggingConfig['level'] } };
    }
  }

  return cfg;
}

let globalConfig: ConfigLoader | null = null;

export function getConfig(): ConfigLoader {
  if (!globalConfig) {
    globalConfig = new ConfigLoader();
  }
  return globalConfig;
}

export { ConfigLoader };
export type { AppConfig };
