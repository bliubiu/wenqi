import { describe, it, expect } from 'bun:test';
import { sanitize, sanitizeObject } from '../sanitize';

describe('sanitize', () => {
  it('应脱敏手机号', () => {
    expect(sanitize('联系手机：13812345678')).toBe('联系手机：138****5678');
  });

  it('应脱敏身份证号', () => {
    expect(sanitize('身份证：110101199001011234')).toBe('身份证：110101********1234');
  });

  it('应脱敏邮箱', () => {
    expect(sanitize('邮箱：zhangsan@example.com')).toBe('邮箱：z***@example.com');
  });

  it('应脱敏密码', () => {
    expect(sanitize('password=mypassword123')).toBe('password ***');
    expect(sanitize('密码：abc123')).toBe('密码 ***');
    expect(sanitize('token: abcdef123456')).toBe('token ***');
  });

  it('非字符串输入应返回字符串', () => {
    expect(sanitize(123 as unknown as string)).toBe('123');
    expect(sanitize(null as unknown as string)).toBe('null');
  });

  it('无敏感信息的文本应不变', () => {
    const text = '加载节点数据成功，共 5000 条';
    expect(sanitize(text)).toBe(text);
  });
});

describe('sanitizeObject', () => {
  it('应脱敏顶层敏感字段', () => {
    const obj = { name: '张三', password: 'abc123', phone: '13812345678', email: 'test@test.com' };
    const result = sanitizeObject(obj) as Record<string, unknown>;
    expect(result.password).toBe('***');
    expect(result.phone).toBe('***');
    expect(result.name).toBe('张三');
  });

  it('应脱敏嵌套对象中的敏感字段', () => {
    const obj = { user: { password: 'secret', name: '李四' } };
    const result = sanitizeObject(obj) as any;
    expect(result.user.password).toBe('***');
    expect(result.user.name).toBe('李四');
  });

  it('应脱敏数组中的敏感字段', () => {
    const arr = [{ password: 'secret1' }, { password: 'secret2' }];
    const result = sanitizeObject(arr) as any[];
    expect(result[0].password).toBe('***');
    expect(result[1].password).toBe('***');
  });

  it('null 和原始值应原样返回', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject('string')).toBe('string');
  });
});
