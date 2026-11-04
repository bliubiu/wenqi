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

export interface DynastyYearRange {
  start: number;
  end: number;
}

/** 朝代大致起止年份（公元纪年，负数表示公元前），用于时间轴色带与生年缺失兜底 */
export const DYNASTY_YEAR_RANGES: Record<DynastyCode, DynastyYearRange> = {
  PRE_QIN: { start: -1046, end: -221 },
  HAN: { start: -202, end: 220 },
  WEI_JIN: { start: 220, end: 589 },
  TANG: { start: 618, end: 907 },
  FIVE_DYNASTIES: { start: 907, end: 979 },
  SONG: { start: 960, end: 1279 },
  YUAN: { start: 1271, end: 1368 },
  MING: { start: 1368, end: 1644 },
  QING: { start: 1636, end: 1912 },
  MODERN: { start: 1912, end: 2026 },
};

export function getDynastyName(code: string): string {
  return DYNASTY_LABELS[code as DynastyCode] || code;
}

/** 朝代中值年份：诗人生年缺失时的回退口径 */
export function getDynastyMedianYear(code: string): number {
  const range = DYNASTY_YEAR_RANGES[code as DynastyCode];
  if (!range) return 0;
  return Math.round((range.start + range.end) / 2);
}
