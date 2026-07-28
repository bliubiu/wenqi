import { describe, it, expect } from 'bun:test';
import { GENRE_CODES, GENRE_LABELS, getGenreName } from '../GenreCode';

describe('GenreCode', () => {
  it('应包含所有体裁代码', () => {
    expect(GENRE_CODES).toContain('SHI');
    expect(GENRE_CODES).toContain('CI');
    expect(GENRE_CODES).toContain('QU');
    expect(GENRE_CODES).toContain('FU');
    expect(GENRE_CODES).toContain('WEN');
    expect(GENRE_CODES).toContain('XIAOSHUO');
    expect(GENRE_CODES.length).toBe(6);
  });

  it('应包含所有体裁的中文标签', () => {
    expect(GENRE_LABELS.SHI).toBe('诗');
    expect(GENRE_LABELS.CI).toBe('词');
    expect(GENRE_LABELS.QU).toBe('曲');
    expect(GENRE_LABELS.FU).toBe('赋');
    expect(GENRE_LABELS.WEN).toBe('文');
    expect(GENRE_LABELS.XIAOSHUO).toBe('小说');
  });

  it('getGenreName 应返回正确中文名', () => {
    expect(getGenreName('SHI')).toBe('诗');
    expect(getGenreName('UNKNOWN')).toBe('UNKNOWN');
  });
});
