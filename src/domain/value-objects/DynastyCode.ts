export const DYNASTY_CODES = [
  'PRE_QIN', 'HAN', 'WEI_JIN', 'TANG', 'FIVE_DYNASTIES',
  'SONG', 'YUAN', 'MING', 'QING', 'MODERN',
] as const;

export type DynastyCode = (typeof DYNASTY_CODES)[number];

export const DYNASTY_LABELS: Record<DynastyCode, string> = {
  PRE_QIN: '先秦',
  HAN: '汉',
  WEI_JIN: '魏晋南北朝',
  TANG: '唐',
  FIVE_DYNASTIES: '五代十国',
  SONG: '宋',
  YUAN: '元',
  MING: '明',
  QING: '清',
  MODERN: '近现代',
};

export const DYNASTY_COLORS: Record<DynastyCode, number> = {
  PRE_QIN: 0x3a4a5c,
  HAN: 0x8b7355,
  WEI_JIN: 0x6fae8e,
  TANG: 0xd4a24c,
  FIVE_DYNASTIES: 0xba8c5e,
  SONG: 0x7ba7d9,
  YUAN: 0xb5523e,
  MING: 0xc9866b,
  QING: 0x8c6fae,
  MODERN: 0x5a8c7a,
};

export const DYNASTY_COLOR_HEX: Record<DynastyCode, string> = {
  PRE_QIN: '#3A4A5C',
  HAN: '#8B7355',
  WEI_JIN: '#6FAE8E',
  TANG: '#D4A24C',
  FIVE_DYNASTIES: '#BA8C5E',
  SONG: '#7BA7D9',
  YUAN: '#B5523E',
  MING: '#C9866B',
  QING: '#8C6FAE',
  MODERN: '#5A8C7A',
};

export function getDynastyName(code: string): string {
  return DYNASTY_LABELS[code as DynastyCode] || code;
}
