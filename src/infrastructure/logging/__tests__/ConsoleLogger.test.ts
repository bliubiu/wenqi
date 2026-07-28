import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { ConsoleLogger } from '../ConsoleLogger';

describe('ConsoleLogger', () => {
  let debugSpy: ReturnType<typeof spyOn>;
  let infoSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    debugSpy = spyOn(console, 'debug');
    infoSpy = spyOn(console, 'info');
    errorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('INFO 级别应输出 INFO 和 ERROR', () => {
    const logger = new ConsoleLogger('TestModule', 'INFO');
    logger.info('测试信息');
    logger.error('测试错误');
    logger.debug('调试信息');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledTimes(0);
  });

  it('DEBUG 级别应输出所有级别', () => {
    const logger = new ConsoleLogger('TestModule', 'DEBUG');
    logger.debug('调试信息');
    logger.info('测试信息');

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('ERROR 级别应只输出 ERROR', () => {
    const logger = new ConsoleLogger('TestModule', 'ERROR');
    logger.debug('调试');
    logger.info('信息');
    logger.error('错误');

    expect(debugSpy).toHaveBeenCalledTimes(0);
    expect(infoSpy).toHaveBeenCalledTimes(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('日志格式应包含模块名和级别', () => {
    const logger = new ConsoleLogger('MyModule', 'INFO');
    logger.info('测试消息');
    const call = infoSpy.mock.calls[0];
    expect(call[0]).toContain('MyModule');
    expect(call[0]).toContain('INFO');
    expect(call[0]).toContain('测试消息');
  });

  it('日志应包含时间戳格式', () => {
    const logger = new ConsoleLogger('Test', 'INFO');
    logger.info('消息');
    const call = infoSpy.mock.calls[0];
    expect(call[0]).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('上下文字段应脱敏', () => {
    const logger = new ConsoleLogger('Test', 'INFO');
    logger.info('用户登录', { password: 'mypass', phone: '13812345678' });
    const call = infoSpy.mock.calls[0] as [string, unknown];
    const ctx = call[1] as Record<string, unknown>;
    expect(ctx.password).toBe('***');
    expect(ctx.phone).toBe('***');
  });
});
