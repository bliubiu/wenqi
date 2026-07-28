import { sanitize, sanitizeObject } from './sanitize';

export type LogLevel = 'DEBUG' | 'INFO' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  ERROR: 2,
};

export class FileLogger {
  private logsDir: FileSystemDirectoryHandle | null = null;
  private minLevel: LogLevel;
  private readonly retentionDays: number;
  private readonly moduleName: string;
  private ready = false;
  private initError: string | null = null;

  private buffer = new Map<string, string[]>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly FLUSH_INTERVAL_MS = 30000;
  private readonly FLUSH_THRESHOLD = 5;

  constructor(
    moduleName: string,
    minLevel: LogLevel = 'INFO',
    retentionDays = 32,
  ) {
    this.moduleName = moduleName;
    this.minLevel = minLevel;
    this.retentionDays = retentionDays;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get initErrorMessage(): string | null {
    return this.initError;
  }

  async init(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
        this.initError = 'OPFS 不可用';
        console.warn('[FileLogger] OPFS 不可用，文件日志将跳过');
        return;
      }

      const root = await navigator.storage.getDirectory();
      this.logsDir = await root.getDirectoryHandle('wenqi-logs', { create: true });

      await this.rotate();

      this.ready = true;
      this.flushTimer = setInterval(() => this.flushAll(), this.FLUSH_INTERVAL_MS);
    } catch (err) {
      this.initError = String(err);
      console.error('[FileLogger] 初始化失败:', err);
    }
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushAll();
    this.ready = false;
  }

  async debug(message: string, context?: object): Promise<void> {
    if (LOG_LEVELS['DEBUG'] < LOG_LEVELS[this.minLevel]) return;
    await this.write('DEBUG', message, context);
  }

  async info(message: string, context?: object): Promise<void> {
    if (LOG_LEVELS['INFO'] < LOG_LEVELS[this.minLevel]) return;
    await this.write('INFO', message, context);
  }

  async error(message: string, context?: object): Promise<void> {
    await this.write('ERROR', message, context);
  }

  private async write(level: LogLevel, message: string, context?: object): Promise<void> {
    if (!this.ready) return;

    const timestamp = this.formatTimestamp(new Date());
    const safeMessage = sanitize(message);
    const safeContext = context ? sanitizeObject(context) : undefined;

    const line = this.formatLine(level, timestamp, safeMessage, safeContext);
    const dateKey = this.formatDateKey(new Date());

    const lines = this.buffer.get(dateKey) ?? [];
    lines.push(line);
    this.buffer.set(dateKey, lines);

    if (lines.length >= this.FLUSH_THRESHOLD) {
      await this.flushDate(dateKey);
    }
  }

  private async flushAll(): Promise<void> {
    for (const key of this.buffer.keys()) {
      await this.flushDate(key);
    }
  }

  private async flushDate(dateKey: string): Promise<void> {
    const lines = this.buffer.get(dateKey);
    if (!lines || lines.length === 0 || !this.logsDir) return;

    try {
      const fileName = `wenqi-${dateKey}.log`;
      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await this.logsDir.getFileHandle(fileName);
      } catch {
        fileHandle = await this.logsDir.getFileHandle(fileName, { create: true });
      }

      let existing = '';
      try {
        const file = await fileHandle.getFile();
        if (file.size > 0) {
          existing = await file.text();
        }
      } catch {
        /* 新文件 */
      }

      const updated = existing + lines.join('\n') + '\n';
      const writable = await fileHandle.createWritable();
      await writable.write(updated);
      await writable.close();

      this.buffer.set(dateKey, []);
    } catch (err) {
      console.error('[FileLogger] 写入失败:', err);
    }
  }

  private async rotate(): Promise<void> {
    if (!this.logsDir) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    const cutoffDate = this.formatDateKey(cutoff);

    for await (const [name] of (this.logsDir as any).entries()) {
      if (!name.startsWith('wenqi-') || !name.endsWith('.log')) continue;
      const dateStr = name.slice(6, 14);
      if (dateStr < cutoffDate) {
        await this.logsDir.removeEntry(name);
      }
    }
  }

  private formatLine(level: LogLevel, timestamp: string, message: string, context?: unknown): string {
    const levelPad = level.padEnd(5);
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${levelPad}] [1|0] [${this.moduleName}] - ${message}${ctx}`;
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

  private formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
}
