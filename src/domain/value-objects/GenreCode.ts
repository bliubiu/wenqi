export const GENRE_CODES = [
  'SHI', 'CI', 'QU', 'FU', 'WEN', 'XIAOSHUO',
] as const;

export type GenreCode = (typeof GENRE_CODES)[number];

export const GENRE_LABELS: Record<GenreCode, string> = {
  SHI: '诗',
  CI: '词',
  QU: '曲',
  FU: '赋',
  WEN: '文',
  XIAOSHUO: '小说',
};

export function getGenreName(code: string): string {
  return GENRE_LABELS[code as GenreCode] || code;
}
