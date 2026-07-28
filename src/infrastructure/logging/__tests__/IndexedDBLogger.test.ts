import { describe, it, expect, beforeAll, spyOn } from 'bun:test';

import 'fake-indexeddb/auto';
import { IndexedDBLogger } from '../IndexedDBLogger';

describe('IndexedDBLogger', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('WenQiLogs');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it('应能初始化数据库', async () => {
    const logger = new IndexedDBLogger('Test', 'DEBUG', 32);
    await expect(logger.init()).resolves.toBeUndefined();
  });

  it('DEBUG 级别应记录所有级别到控制台', async () => {
    const debugSpy = spyOn(console, 'debug');
    const infoSpy = spyOn(console, 'info');
    const errorSpy = spyOn(console, 'error');

    const logger = new IndexedDBLogger('TestAll', 'DEBUG', 32);
    await logger.init();
    logger.debug('调试消息');
    logger.info('信息消息');
    logger.error('错误消息');

    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('INFO 级别应过滤 DEBUG', async () => {
    const debugSpy = spyOn(console, 'debug');
    const logger = new IndexedDBLogger('TestFilter', 'INFO', 32);
    await logger.init();
    logger.debug('不应输出');
    logger.info('应输出');

    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('日志格式应包含正确时间戳', async () => {
    const infoSpy = spyOn(console, 'info');
    const logger = new IndexedDBLogger('TestFmt', 'INFO', 32);
    await logger.init();
    logger.info('格式化测试');
    const call = infoSpy.mock.calls[0][0] as string;
    expect(call).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
    expect(call).toContain('TestFmt');
    infoSpy.mockRestore();
  });

  it('上下文应脱敏', async () => {
    const infoSpy = spyOn(console, 'info');
    const logger = new IndexedDBLogger('TestSafe', 'INFO', 32);
    await logger.init();
    logger.info('脱敏测试', { password: 'secret', phone: '13900001111' });
    const ctx = infoSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(ctx.password).toBe('***');
    expect(ctx.phone).toBe('***');
    infoSpy.mockRestore();
  });

  it('导出日志应返回格式化内容', async () => {
    const logger = new IndexedDBLogger('TestExport', 'DEBUG', 32);
    await logger.init();
    logger.info('导出测试消息');
    await new Promise(r => setTimeout(r, 100));
    const content = await logger.exportLogs();
    expect(content).toContain('导出测试消息');
    expect(content).toContain('[INFO');
    expect(content).toContain('TestExport');
  });
});
