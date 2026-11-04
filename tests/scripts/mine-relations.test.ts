import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  normalizeTitle,
  buildNameIndex,
  extractTitleRelation,
  gramHash,
  extractGrams,
  mergeRelations,
  sparsifyRelations,
  mineSameDynastyNeighbors,
  mineInfluence,
  type PoetInfo,
  type RawRelation,
} from '../../scripts/mine-relations';

const poet = (id: string, name: string, workCount = 10, courtesyName: string | null = null, pseudonym: string | null = null): PoetInfo => ({
  id, name, dynasty: 'TANG', workCount, courtesyName, pseudonym,
});

describe('姓名归一', () => {
  it('简繁归一并去除分隔符', () => {
    expect(normalizeName('蘇軾')).toBe('苏轼');
    expect(normalizeName('李 白')).toBe('李白');
    expect(normalizeName('李·白')).toBe('李白');
  });

  it('标题归一剔除排行数字', () => {
    expect(normalizeTitle('寄李十二白二十韻')).toBe('寄李白韵');
    expect(normalizeTitle('贈汪倫')).toBe('赠汪伦');
  });
});

describe('姓名索引', () => {
  it('本名与字号均登记，字号键被单独标记', () => {
    const index = buildNameIndex([poet('p1', '白居易', 100, '樂天')]);
    expect(index.map.get('白居易')?.[0].id).toBe('p1');
    expect(index.map.get('乐天')?.[0].id).toBe('p1');
    expect(index.aliasKeys.has('乐天')).toBe(true);
    expect(index.aliasKeys.has('白居易')).toBe(false);
  });

  it('同名冲突按作品数降序', () => {
    const index = buildNameIndex([poet('p_low', '王维', 5), poet('p_high', '王维', 99)]);
    expect(index.map.get('王维')?.[0].id).toBe('p_high');
  });
});

describe('标题关系提取', () => {
  const index = buildNameIndex([
    poet('p_libai', '李白', 900),
    poet('p_menghaoran', '孟浩然', 200),
    poet('p_dufu', '杜甫', 1000, null, '子美'),
    poet('p_baijuyi', '白居易', 2000, '樂天'),
  ]);

  it('单字动词 + 二字人名', () => {
    const hit = extractTitleRelation('贈汪倫', index);
    expect(hit).toBeNull(); // 汪伦不在索引
    expect(extractTitleRelation('贈孟浩然', index)?.target.id).toBe('p_menghaoran');
  });

  it('唱和动词权重更高', () => {
    const hit = extractTitleRelation('酬孟雲卿', index);
    expect(hit).toBeNull(); // 孟云卿不在索引
    // 「樂天」为字号命中，降权 0.9 × 0.75
    expect(extractTitleRelation('和樂天春詞', index)).toMatchObject({
      target: { id: 'p_baijuyi' },
      type: 'FRIEND',
      weight: 0.68,
    });
  });

  it('字号命中降权并标推断', () => {
    const hit = extractTitleRelation('寄子美', index);
    expect(hit).toMatchObject({ target: { id: 'p_dufu' }, weight: 0.52, kind: '推断' });
  });

  it('「姓+字」结构跳过（沈子美非杜甫）', () => {
    // rest = '沈子美梅詩'，offset1 命中「子美」但前置「沈」为姓氏
    expect(extractTitleRelation('和沈子美梅詩', index)).toBeNull();
  });

  it('排行数字剔除后可命中（寄李十二白）', () => {
    expect(extractTitleRelation('寄李十二白', index)?.target.id).toBe('p_libai');
  });

  it('尊长动词归师承并标推断', () => {
    expect(extractTitleRelation('上李邕', index)).toBeNull(); // 李邕不在索引
    const hit = extractTitleRelation('謁李白', index);
    expect(hit).toMatchObject({ target: { id: 'p_libai' }, type: 'TEACHER_STUDENT', kind: '推断' });
  });

  it('动词后无人名即终止，不误配后续偏移', () => {
    expect(extractTitleRelation('春夜喜雨', index)).toBeNull();
  });
});

describe('gram 工具', () => {
  it('哈希稳定且为 31 位非负整数', () => {
    expect(gramHash('明月几时有')).toBe(gramHash('明月几时有'));
    expect(gramHash('明月几时有')).toBeGreaterThanOrEqual(0);
    expect(gramHash('明月几时有')).toBeLessThan(2 ** 31);
  });

  it('去非汉字后滑窗去重，短文本为空', () => {
    expect(extractGrams('床前明月光，疑是地上霜。')).toContain('床前明月光');
    expect(extractGrams('床前明月光，疑是地上霜。')).not.toContain('，疑是地上霜');
    expect(extractGrams('春眠')).toEqual([]);
    expect(extractGrams(null)).toEqual([]);
  });
});

describe('关系合并与稀疏化', () => {
  const rel = (s: string, t: string, type: string, weight: number, titles?: string[]): RawRelation => ({
    sourceId: s, targetId: t, type: type as RawRelation['type'], weight,
    evidence: titles ? { kind: '赠答', titles } : null,
  });

  it('同对同类型保留最高权重并合并证据', () => {
    const merged = mergeRelations([
      rel('a', 'b', 'FRIEND', 0.6, ['赠甲']),
      rel('a', 'b', 'FRIEND', 0.9, ['赠乙']),
      rel('a', 'b', 'FRIEND', 0.7, ['赠丙']),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].weight).toBe(0.9);
    expect(merged[0].evidence?.titles).toEqual(['赠甲', '赠乙', '赠丙']);
  });

  it('每诗人出边 Top-N 截断', () => {
    const many: RawRelation[] = Array.from({ length: 40 }, (_, i) =>
      rel('a', `t${i}`, 'SAME_DYNASTY', i / 100)
    );
    const out = sparsifyRelations(many);
    expect(out).toHaveLength(30);
    expect(out.every((r) => r.weight >= 0.1)).toBe(true);
  });
});

describe('同朝代空间近邻', () => {
  it('组内取最近邻并去重无序对', () => {
    const nodes = [
      { refId: 'a', dynasty: 'TANG', position: { x: 0, y: 0, z: 0 } },
      { refId: 'b', dynasty: 'TANG', position: { x: 1, y: 0, z: 0 } },
      { refId: 'c', dynasty: 'TANG', position: { x: 10, y: 0, z: 0 } },
      { refId: 'd', dynasty: 'SONG', position: { x: 0.5, y: 0, z: 0 } },
    ];
    const out = mineSameDynastyNeighbors(nodes);
    const pairKeys = out.map((r) => [r.sourceId, r.targetId].sort().join('|'));
    expect(new Set(pairKeys).size).toBe(pairKeys.length);
    expect(pairKeys).toContain('a|b');
    expect(pairKeys).toContain('a|c'); // c 的最近邻是 b 与 a（同朝代）
    // 不同朝代不建边
    expect(out.every((r) => r.type === 'SAME_DYNASTY')).toBe(true);
  });
});

describe('化用挖掘', () => {
  const poets: PoetInfo[] = [
    poet('p_prev', '屈原', 100),
    poet('p_cur', '李白', 900),
    poet('p_solo', '独行者', 5),
  ];

  const works = (poetId: string, texts: string[]) => texts.map((text, i) => ({ poetId, text, id: `${poetId}_${i}` }));

  it('跨朝代 gram 共现达阈值才建 INFLUENCE，同朝代不互指', () => {
    const prev = works('p_prev', ['沧浪之水清兮可以濯我缨', '沧浪之水浊兮可以濯我足']);
    const cur = works('p_cur', ['沧浪之水清兮吾自濯缨一', '沧浪之水清兮复濯足矣二']);
    const solo = works('p_solo', ['孤云独去闲相看两不厌三']);

    const out = mineInfluence([prev, cur], poets);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceId: 'p_cur',   // source=后代（受影响者）
      targetId: 'p_prev',  // target=前代源头
      type: 'INFLUENCE',
    });
    expect(out[0].evidence?.quote).toContain('沧浪之水清');
  });

  it('评注特征 gram 被过滤', () => {
    const prev = works('p_prev', ['苕溪漁隱叢話前集卷之第亂数数']);
    const cur = works('p_cur', ['苕溪漁隱叢話後集卷之第六数数', '苕溪漁隱叢話別集卷之第七数数']);
    const out = mineInfluence([prev, cur], poets);
    expect(out).toHaveLength(0);
  });

  it('佚名源头与同名同朝代记录不建边', () => {
    const anon: PoetInfo = { ...poet('p_anon', '佚名', 50), dynasty: 'TANG' };
    const prev = works('p_anon', ['沧海月明珠有泪蓝田日暖玉生烟一']);
    const cur = works('p_cur', ['沧海月明珠有泪蓝田日暖玉生烟二', '沧海月明珠有泪蓝田日暖玉生烟三']);
    expect(mineInfluence([prev, cur], [anon, ...poets.filter(p => p.id === 'p_cur')])).toHaveLength(0);

    const dupA: PoetInfo = { ...poet('p_a', '苏轼', 100), dynasty: 'SONG' };
    const dupB: PoetInfo = { ...poet('p_b', '蘇軾', 50), dynasty: 'SONG' };
    const aWorks = works('p_a', ['大江东去浪淘尽千古风流人物一']);
    const bWorks = works('p_b', ['大江东去浪淘尽千古风流人物二', '大江东去浪淘尽千古风流人物三']);
    expect(mineInfluence([aWorks, bWorks], [dupA, dupB])).toHaveLength(0);
  });
});
