/**
 * 繁体 → 简体单字归一化
 *
 * 用途：检索索引构建与查询词归一化（语料为繁体古本，用户查询多为简体）。
 * 映射为「多对一」方向，确定性安全；不做词语级转换（语境歧义字由
 * OpenCC 数据与简体参照反向过滤兜底，见 scripts/gen-t2s-table.ts）。
 */

import { T2S_PAIRS } from './t2s-table';

const T2S_MAP: Map<string, string> = new Map();
for (let i = 0; i < T2S_PAIRS.length; i += 2) {
  const traditional = T2S_PAIRS[i];
  const simplified = T2S_PAIRS[i + 1];
  if (traditional !== simplified) {
    T2S_MAP.set(traditional, simplified);
  }
}

/** 繁体 → 简体单字归一化（未收录字符原样保留） */
export function toSimplified(text: string): string {
  let out = '';
  for (const ch of text) {
    out += T2S_MAP.get(ch) ?? ch;
  }
  return out;
}

/** 映射表规模（用于诊断与测试） */
export function mappingSize(): number {
  return T2S_MAP.size;
}
