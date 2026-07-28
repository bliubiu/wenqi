import { sanitize, sanitizeObject } from './sanitize';

export type LogLevel = 'DEBUG' | 'INFO' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  ERROR: 2,
};

const DB_NAME = 'WenQiLogs';
const DB_VERSION = 1;
const STORE_NAME = 'logs';
const DEFAULT_RETENTION_DAYS = 32;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  threadId: number;
  processId: number;
  message: string;
  context?: string;
}

export class IndexedDBLogger {
  private db: IDBDatabase | null = null;
  private readonly moduleName: string;
  private minLevel: LogLevel;
  private readonly retentionDays: number;
  private readonly threadId = 1;
  private readonly processId: number;
  private initPromise: Promise<void> | null = null;

  constructor(
    moduleName: string,
    minLevel: LogLevel = 'INFO',
    retentionDays: number = DEFAULT_RETENTION_DAYS
  ) {
    this.moduleName = moduleName;
    this.minLevel = minLevel;
    this.retentionDays = retentionDays;
    this.processId = typeof process !== 'undefined' && process.pid
      ? process.pid
      : Math.floor(Math.random() * 10000);
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('module', 'module', { unique: false });
        }
      };

      request.onsuccess = async () => {
        this.db = request.result;
        await this.rotate();
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.initPromise;
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

  private async log(level: LogLevel, message: string, context?: object): Promise<void> {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

    const timestamp = this.formatTimestamp(new Date());
    const safeMessage = sanitize(message);
    const safeContext = context ? sanitizeObject(context) : undefined;

    this.writeToConsole(level, timestamp, safeMessage, safeContext);
    await this.writeToDB(level, timestamp, safeMessage, safeContext);
  }

  private writeToConsole(
    level: LogLevel,
    timestamp: string,
    message: string,
    context?: unknown
  ): void {
    const levelPad = level.padEnd(5);
    const line = `[${timestamp}] [${levelPad}] [${this.threadId}|${this.processId}] [${this.moduleName}] - ${message}`;

    switch (level) {
      case 'DEBUG':
        console.debug(line, context ?? '');
        break;
      case 'INFO':
        console.info(line, context ?? '');
        break;
      case 'ERROR':
        console.error(line, context ?? '');
        break;
    }
  }

  private async writeToDB(
    level: LogLevel,
    timestamp: string,
    message: string,
    context?: unknown
  ): Promise<void> {
    if (!this.db) return;

    try {
      const entry: LogEntry = {
        timestamp,
        level,
        module: this.moduleName,
        threadId: this.threadId,
        processId: this.processId,
        message,
        context: context ? JSON.stringify(context) : undefined,
      };

      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add(entry);
    } catch (err) {
      console.error('日志写入 IndexedDB 失败:', err);
    }
  }

  async rotate(): Promise<void> {
    if (!this.db) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    const cutoffStr = this.formatTimestamp(cutoff);

    try {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoffStr);

      const deleteRequest = index.openCursor(range);
      deleteRequest.onsuccess = () => {
        const cursor = deleteRequest.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    } catch (err) {
      console.error('日志轮转失败:', err);
    }
  }

  async exportLogs(date?: string): Promise<string> {
    if (!this.db) return '';

    const targetDate = date ?? this.formatTimestamp(new Date()).slice(0, 10);
    const startStr = `${targetDate} 00:00:00.000`;
    const endStr = `${targetDate} 23:59:59.999`;

    const entries = await this.queryByDateRange(startStr, endStr);

    const lines = entries.map(e =>
      `[${e.timestamp}] [${e.level.padEnd(5)}] [${e.threadId}|${e.processId}] [${e.module}] - ${e.message}`
    );

    return lines.join('\n');
  }

  async downloadLogs(date?: string): Promise<void> {
    const content = await this.exportLogs(date);
    const targetDate = (date ?? this.formatTimestamp(new Date())).slice(0, 10).replace(/-/g, '');
    const filename = `wenqi-${targetDate}.log`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private queryByDateRange(start: string, end: string): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(start, end);
      const entries: LogEntry[] = [];

      const cursorRequest = index.openCursor(range);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          entries.push(cursor.value as LogEntry);
          cursor.continue();
        } else {
          resolve(entries);
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
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
}
