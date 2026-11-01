/**
 * 检索归一化映射表生成器
 *
 * 以 OpenCC（繁→简）为权威数据源，扫描数据底座语料的唯一字符集，
 * 生成「语料实际需要」的繁→简单字映射子集，写入 src/infrastructure/text/t2s-table.ts。
 * 生成后再以 README 与 docs 简体文本做反向过滤：映射键若出现在简体参照中
 * （说明该字形在简体中通用），则丢弃该映射，保证前端查询词归一化不误伤简体。
 *
 * 使用方式：bun run scripts/gen-t2s-table.ts（索引重建前或映射表过期时运行）
 */

import * as OpenCC from 'opencc-js';
import * as fs from 'fs';
import * as path from 'path';
import { openDatabase, loadAllWorks, loadPoets, DEFAULT_DB } from './db-core';

const OUT_FILE = path.join('src', 'infrastructure', 'text', 't2s-table.ts');

function log(message: string): void {
  console.log(`[文气归一化] ${message}`);
}

function fail(message: string): never {
  console.error(`[文气归一化] 错误: ${message}`);
  process.exit(1);
}

function main(): void {
  console.log('=== 检索归一化映射表生成 ===\n');

  if (!fs.existsSync(DEFAULT_DB)) {
    fail(`数据底座不存在，请先运行数据管道（bun run data:all）：${DEFAULT_DB}`);
  }

  const converter = OpenCC.Converter({ from: 't', to: 'cn' });

  // 收集语料唯一字符（作品标题与全文 + 诗人名，构成查询可能涉及的超集）
  log('扫描语料唯一字符...');
  const db = openDatabase(DEFAULT_DB, { readonly: true });
  const works = loadAllWorks(db);
  const poets = loadPoets(db);
  db.close();

  const chars = new Set<string>();
  for (const w of works) {
    for (const ch of w.title) chars.add(ch);
    for (const ch of w.text ?? '') chars.add(ch);
  }
  for (const p of poets) for (const ch of p.name) chars.add(ch);
  log(`唯一字符: ${chars.size} 个`);

  // OpenCC 转换，收集字形变化对
  let pairs = '';
  let count = 0;
  const sorted = [...chars].sort();
  for (const ch of sorted) {
    const converted = converter(ch);
    if (converted.length === 1 && converted !== ch) {
      pairs += ch + converted;
      count++;
    }
  }
  log(`字形变化对: ${count} 对`);

  // 反向过滤：映射键若出现在简体参照文本中则丢弃（避免前端查询词被误转换）
  let sample = '';
  const readme = path.join('README.md');
  if (fs.existsSync(readme)) sample += fs.readFileSync(readme, 'utf8');
  const docsDir = path.join('docs');
  for (const f of fs.readdirSync(docsDir)) {
    if (f.endsWith('.md')) sample += fs.readFileSync(path.join(docsDir, f), 'utf8');
  }
  const sampleChars = new Set(sample);
  let filtered = 0;
  let finalPairs = '';
  for (let i = 0; i < pairs.length; i += 2) {
    if (sampleChars.has(pairs[i])) {
      filtered++;
      continue;
    }
    finalPairs += pairs[i] + pairs[i + 1];
  }
  if (filtered > 0) {
    log(`反向过滤: 丢弃 ${filtered} 对（映射键在简体参照中通用）`);
  }

  // 拆行书写（每行 60 对），错位可定位
  const lines: string[] = [];
  for (let i = 0; i < finalPairs.length; i += 120) {
    lines.push(`  '${finalPairs.slice(i, i + 120)}'`);
  }

  const table = `/**
 * 检索归一化映射表（自动生成，勿手工编辑）
 *
 * 生成方式：bun run scripts/gen-t2s-table.ts
 * 数据源：OpenCC 繁→简，语料（data/wenqi.db）唯一字符子集，
 *        已用 README 与 docs 简体文本做反向过滤。
 * 格式：每两个字符一组映射（第 1 字为繁/异体，第 2 字为简）。
 */

export const T2S_PAIRS = [
${lines.join(',\n')}
].join('');
`;

  fs.writeFileSync(OUT_FILE, table, 'utf-8');
  log(`映射表已生成: ${OUT_FILE}（${finalPairs.length / 2} 对）`);
  console.log('\n=== 生成完成 ===');
}

main();
