import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAM_LEN,
  DEFAULT_MAX_GRAMS,
  jsExtractGrams,
  jsGroupByRhyme,
  jsRhymeFoot,
} from '@/infrastructure/wasm/philology';

describe('philology JS 兜底实现', () => {
  it('提取 n-gram 时剔除标点', () => {
    const grams = jsExtractGrams('床前明月光，疑是地上霜。');
    expect(grams).toContain('床前明月光');
    expect(grams.some((g) => g.includes('，'))).toBe(false);
  });

  it('n-gram 去重并受上限约束', () => {
    expect(jsExtractGrams('明月明月明月', 2, 3)).toEqual(['明月', '月明']);
    expect(jsExtractGrams('春眠')).toEqual([]);
    expect(jsExtractGrams(null)).toEqual([]);
    expect(jsExtractGrams('床前明月光', DEFAULT_GRAM_LEN, DEFAULT_MAX_GRAMS)).toEqual(['床前明月光']);
  });

  it('韵脚取诗行尾字众数', () => {
    expect(jsRhymeFoot('床前明月光，疑是地上霜。举头望明月，低头思故乡。')).toBe('光');
    expect(jsRhymeFoot('春眠不觉晓，处处闻啼鸟。')).toBe('晓');
    expect(jsRhymeFoot('')).toBe('');
  });

  it('韵部归组按次数降序', () => {
    const groups = jsGroupByRhyme([
      { id: '1', text: '床前明月光，疑是地上霜。' },
      { id: '2', text: '日照香炉生紫烟，遥看瀑布挂前川。' },
      { id: '3', text: '朝辞白帝彩云间，千里江陵一日还。' },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ ending: '光', count: 1 });
  });
});
