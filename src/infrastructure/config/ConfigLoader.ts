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
    this.config = this.loadWithEnvOverrides(DEFAULT_CONFIG);
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

  private loadWithEnvOverrides(defaults: AppConfig): AppConfig {
    const cfg = { ...defaults };

    if (typeof process !== 'undefined' && process.env) {
      const logLevel = process.env.WENQI_LOG_LEVEL as string;
      if (logLevel && ['DEBUG', 'INFO', 'ERROR'].includes(logLevel)) {
        cfg.logging = { ...cfg.logging, level: logLevel as LoggingConfig['level'] };
      }
    }

    return cfg;
  }
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
