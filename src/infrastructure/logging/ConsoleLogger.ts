import { sanitize, sanitizeObject } from './sanitize';

export type LogLevel = 'DEBUG' | 'INFO' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  ERROR: 2,
};

export class ConsoleLogger {
  private readonly moduleName: string;
  private minLevel: LogLevel;
  private readonly processId: number;

  constructor(moduleName: string, minLevel: LogLevel = 'INFO') {
    this.moduleName = moduleName;
    this.minLevel = minLevel;
    this.processId = typeof process !== 'undefined' && process.pid
      ? process.pid
      : Math.floor(Math.random() * 10000);
  }

  debug(message: string, context?: object): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: object): void {
    this.log('INFO', message, context);
  }

  error(message: string, context?: object): void {
    this.log('ERROR', message, context);
  }

  private log(level: LogLevel, message: string, context?: object): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

    const timestamp = this.formatTimestamp(new Date());
    const levelPad = level.padEnd(5);
    const safeMessage = sanitize(message);
    const safeContext = context ? sanitizeObject(context) : undefined;
    const threadId = 1;

    const line = `[${timestamp}] [${levelPad}] [${threadId}|${this.processId}] [${this.moduleName}] - ${safeMessage}`;

    switch (level) {
      case 'DEBUG':
        console.debug(line, safeContext ?? '');
        break;
      case 'INFO':
        console.info(line, safeContext ?? '');
        break;
      case 'ERROR':
        console.error(line, safeContext ?? '');
        break;
    }
  }

  private formatTimestamp(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${y}-${m}-${d} ${h}:${mi}:${s}.${ms}`;
  }

  getModuleName(): string {
    return this.moduleName;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}
