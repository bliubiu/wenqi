import { describe, it, expect } from 'bun:test';
import { toSimplified, mappingSize } from '../t2s';
import * as fs from 'fs';
import * as path from 'path';

describe('toSimplified（繁体归一化）', () => {
  it('映射表应具备一定规模', () => {
    expect(mappingSize()).toBeGreaterThan(500);
  });

  it('常用繁体字应正确归一化', () => {
    expect(toSimplified('靜夜思')).toBe('静夜思');
    expect(toSimplified('將進酒')).toBe('将进酒');
    expect(toSimplified('舉頭望山月')).toBe('举头望山月');
    expect(toSimplified('水調歌頭')).toBe('水调歌头');
    expect(toSimplified('蘇軾')).toBe('苏轼');
    expect(toSimplified('白居易')).toBe('白居易');
    expect(toSimplified('廬山東林寺')).toBe('庐山东林寺');
    expect(toSimplified('風雲萬變')).toBe('风云万变');
  });

  it('简体与 ASCII 应原样透传', () => {
    expect(toSimplified('床前明月光')).toBe('床前明月光');
    expect(toSimplified('静夜思')).toBe('静夜思');
    expect(toSimplified('Hello 123！')).toBe('Hello 123！');
    expect(toSimplified('，。？！')).toBe('，。？！');
  });

  it('未收录与符号字符应原样透传', () => {
    // 标点、字母、数字不参与映射
    expect(toSimplified('，。？！《》')).toBe('，。？！《》');
    expect(toSimplified('Hello 123')).toBe('Hello 123');
    // OpenCC 字级转换的语境歧义字（如「乾→干」）在索引与查询两侧
    // 做一致归一化，不影响检索命中；词形显示差异为已知 MVP 取舍。
  });

  it('简体参照文本（README 与 docs）转换后应完全不变', () => {
    // 反向校验：捕获任何方向写反的映射对
    const repoRoot = path.resolve(__dirname, '../../../..');
    let sample = '';
    const readme = path.join(repoRoot, 'README.md');
    if (fs.existsSync(readme)) sample += fs.readFileSync(readme, 'utf8');
    const docsDir = path.join(repoRoot, 'docs');
    for (const f of fs.readdirSync(docsDir)) {
      if (f.endsWith('.md')) sample += fs.readFileSync(path.join(docsDir, f), 'utf8');
    }
    expect(sample.length).toBeGreaterThan(1000);

    const changed: string[] = [];
    for (const ch of sample) {
      const t = toSimplified(ch);
      if (t !== ch) changed.push(`${ch}→${t}`);
    }
    expect(changed).toEqual([]);
  });
});
