/**
 * 文献学计算适配层
 *
 * 优先加载 Rust/WASM（`wenqi-core` philology 模块）执行 n-gram 提取与韵脚归组；
 * 加载失败时静默降级为等价 JS 实现，调用方无感知。
 * 构建期管线（scripts/mine-relations.ts）与运行时均可使用。
 */

/** 默认 n-gram 长度 */
export const DEFAULT_GRAM_LEN = 5;
/** 单作品参与检测的 gram 上限 */
export const DEFAULT_MAX_GRAMS = 600;

export interface RhymeGroup {
  /** 韵脚尾字 */
  ending: string;
  /** 出现次数 */
  count: number;
}

export interface PhilologyWork {
  id?: string;
  text: string;
}

export interface Philology {
  /** 当前计算后端 */
  backend: 'wasm' | 'js';
  /** 提取正文 n-gram（去非汉字、去重、上限截断） */
  extractGrams(text: string | null | undefined, gramLen?: number, maxGrams?: number): string[];
  /** 韵脚尾字（诗行尾字众数，无韵脚返回空串） */
  rhymeFoot(text: string): string;
  /** 韵部归组（次数降序） */
  groupByRhyme(works: PhilologyWork[]): RhymeGroup[];
}

const CJK_ONLY = /[^\u4e00-\u9fff]/g;

/** JS 兜底：n-gram 提取（与 Rust 实现口径一致） */
export function jsExtractGrams(
  text: string | null | undefined,
  gramLen = DEFAULT_GRAM_LEN,
  maxGrams = DEFAULT_MAX_GRAMS
): string[] {
  if (!text || gramLen <= 0 || maxGrams <= 0) return [];
  const cjk = text.replace(CJK_ONLY, '');
  if (cjk.length < gramLen) return [];
  const grams = new Set<string>();
  for (let i = 0; i + gramLen <= cjk.length && grams.size < maxGrams; i++) {
    grams.add(cjk.slice(i, i + gramLen));
  }
  return [...grams];
}

/** JS 兜底：韵脚尾字（按标点/空白切行，取两字以上诗行尾字众数） */
export function jsRhymeFoot(text: string): string {
  const feet: string[] = [];
  let segment = '';
  const flush = () => {
    if (segment.length >= 2) feet.push(segment[segment.length - 1]);
    segment = '';
  };
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) segment += ch;
    else flush();
  }
  flush();
  if (feet.length === 0) return '';
  const counts = new Map<string, number>();
  let best = feet[0];
  let bestCount = 0;
  for (const foot of feet) {
    const count = (counts.get(foot) ?? 0) + 1;
    counts.set(foot, count);
    if (count > bestCount) {
      best = foot;
      bestCount = count;
    }
  }
  return best;
}

/** JS 兜底：韵部归组（次数降序，同频按尾字排序） */
export function jsGroupByRhyme(works: PhilologyWork[]): RhymeGroup[] {
  const counts = new Map<string, number>();
  for (const work of works) {
    const foot = jsRhymeFoot(work.text ?? '');
    if (!foot) continue;
    counts.set(foot, (counts.get(foot) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ending, count]) => ({ ending, count }))
    .sort((a, b) => b.count - a.count || (a.ending < b.ending ? -1 : a.ending > b.ending ? 1 : 0));
}

const jsPhilology: Philology = {
  backend: 'js',
  extractGrams: jsExtractGrams,
  rhymeFoot: jsRhymeFoot,
  groupByRhyme: jsGroupByRhyme,
};

async function load(): Promise<Philology> {
  try {
    const mod = await import('../../../public/wasm/wenqi_core');
    await mod.default();
    const service = new mod.PhilologyService();
    return {
      backend: 'wasm',
      extractGrams: (text, gramLen = DEFAULT_GRAM_LEN, maxGrams = DEFAULT_MAX_GRAMS) =>
        text ? (service.extractGrams(text, gramLen, maxGrams) as string[]) : [],
      rhymeFoot: (text) => service.rhymeFoot(text),
      groupByRhyme: (works) => JSON.parse(service.groupByRhyme(JSON.stringify(works))),
    };
  } catch {
    return jsPhilology;
  }
}

let cached: Promise<Philology> | null = null;

/** 获取文献学计算实例（WASM 优先，失败降级 JS；结果缓存） */
export async function createPhilology(): Promise<Philology> {
  if (!cached) cached = load();
  return cached;
}
