export interface LoggingConfig {
  level: 'DEBUG' | 'INFO' | 'ERROR';
  fileOutput: boolean;
  filePath: string;
  retentionDays: number;
  exportEnabled: boolean;
}

export interface DataConfig {
  source: string;
  version: string;
  shards: {
    enabled: boolean;
    by: 'dynasty' | 'genre';
    preloadAll: boolean;
    lazyLoadOnSearch: boolean;
  };
}

export interface WasmConfig {
  modulePath: string;
  initTimeoutMs: number;
}

export interface RenderingConfig {
  targetFps: number;
  maxNodes: number;
  maxEdges: number;
  lodThresholds: number[];
}

export interface ScoringConfig {
  algorithmVersion: string;
  weights: {
    talent: number;
    popularity: number;
    luck: number;
  };
}

export interface PersistenceConfig {
  dataset: { cache: string; versionKey: string; autoUpdate: boolean };
  scores: { cache: string; versionKey: string };
  viewConfig: { storage: string };
}

export interface AppConfig {
  version: string;
  data: DataConfig;
  wasm: WasmConfig;
  rendering: RenderingConfig;
  scoring: ScoringConfig;
  logging: LoggingConfig;
  persistence: PersistenceConfig;
  font: {
    primary: string;
    fallback: string;
  };
}
