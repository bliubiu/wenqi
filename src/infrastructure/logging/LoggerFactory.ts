import { ConsoleLogger, type LogLevel } from './ConsoleLogger';
import { IndexedDBLogger } from './IndexedDBLogger';
import { FileLogger } from './FileLogger';

export interface LoggerConfig {
  level: LogLevel;
  fileOutput: boolean;
  filePath: string;
  retentionDays: number;
}

export interface LoggerBundle {
  console: ConsoleLogger;
  db?: IndexedDBLogger;
  file?: FileLogger;
}

export class LoggerFactory {
  private static consoleLoggers = new Map<string, ConsoleLogger>();
  private static dbLogger: IndexedDBLogger | null = null;
  private static fileLogger: FileLogger | null = null;

  static createConsoleLogger(module: string, level: LogLevel = 'INFO'): ConsoleLogger {
    const key = `${module}_${level}`;
    if (!this.consoleLoggers.has(key)) {
      this.consoleLoggers.set(key, new ConsoleLogger(module, level));
    }
    return this.consoleLoggers.get(key)!;
  }

  static getIndexedDBLogger(
    level: LogLevel = 'INFO',
    retentionDays: number = 32,
  ): IndexedDBLogger {
    if (!this.dbLogger) {
      this.dbLogger = new IndexedDBLogger('System', level, retentionDays);
    }
    return this.dbLogger;
  }

  static getFileLogger(
    level: LogLevel = 'INFO',
    retentionDays: number = 32,
  ): FileLogger {
    if (!this.fileLogger) {
      this.fileLogger = new FileLogger('System', level, retentionDays);
    }
    return this.fileLogger;
  }

  static createFromConfig(config: LoggerConfig): LoggerBundle {
    const consoleLogger = this.createConsoleLogger('System', config.level);
    let dbLogger: IndexedDBLogger | undefined;
    let fileLogger: FileLogger | undefined;

    if (typeof indexedDB !== 'undefined') {
      dbLogger = this.getIndexedDBLogger(config.level, config.retentionDays);
      dbLogger.init().catch(err => {
        consoleLogger.error('IndexedDB 日志系统初始化失败', { error: String(err) });
      });
    }

    if (config.fileOutput) {
      fileLogger = this.getFileLogger(config.level, config.retentionDays);
      fileLogger.init().then(() => {
        if (fileLogger?.isReady) {
          consoleLogger.info('文件日志器初始化完成');
        }
      }).catch(err => {
        consoleLogger.error('文件日志器初始化失败', { error: String(err) });
      });
    }

    return { console: consoleLogger, db: dbLogger, file: fileLogger };
  }

  static reset(): void {
    this.consoleLoggers.clear();
    this.dbLogger = null;
    this.fileLogger = null;
  }
}
