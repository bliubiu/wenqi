const PHONE_REGEX = /(1[3-9]\d)\d{4}(\d{4})/g;
const ID_CARD_REGEX = /(\d{6})\d{8,10}(\d{4}|\d{2}X)/g;
const EMAIL_REGEX = /([a-zA-Z0-9])[a-zA-Z0-9._-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const PASSWORD_REGEX = /(password|密码|口令|token|密钥)[=:：\s]+(\S+)/gi;

export function sanitize(input: string): string {
  if (typeof input !== 'string') return String(input);

  let result = input;

  result = result.replace(ID_CARD_REGEX, '$1********$2');
  result = result.replace(PHONE_REGEX, '$1****$2');
  result = result.replace(EMAIL_REGEX, '$1***@$2');
  result = result.replace(PASSWORD_REGEX, '$1 ***');

  return result;
}

export function sanitizeObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;

  const SENSITIVE_KEYS = new Set([
    'password', 'passwd', 'pwd', 'token', 'secret', '密钥', '密码', '口令',
    'idCard', 'id_card', '身份证', 'phone', 'phoneNumber', '手机号', '手机号码',
    'email', '邮箱',
  ]);

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      sanitized[key] = '***';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitize(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
