/**
 * 文气关系挖掘管线
 *
 * 从 SQLite 底座（poets / 作品分表 / nodes）挖掘诗人关系并写回 relations 表：
 * 1. 赠答友朋（FRIEND / TEACHER_STUDENT）：标题动词模式 + 姓名/字/号索引匹配
 * 2. 并称流派（SAME_SCHOOL）：并称词表 + 流派补录表 + poets.school 字段归组
 * 3. 化用影响（INFLUENCE）：跨朝代 5-gram 滚动倒排（两遍法控内存，公共语过滤）
 *    n-gram 提取优先下沉至 Rust/WASM（wenqi-core philology 模块），失败回退 JS
 * 4. 同朝代（SAME_DYNASTY）：节点空间近邻 Top-K
 * 5. 稀疏化：每诗人出边 Top-30，全库上限 25 万条
 *
 * 幂等可重跑：整表覆盖写入，meta 记录 relation_version，import_log 记录 stage='relations'。
 * 纯挖掘函数均导出供单元测试使用（import.meta.main 守卫避免测试时执行主管道）。
 *
 * 使用方式：bun run scripts/mine-relations.ts [--db data/wenqi.db]
 */

import {
  DEFAULT_DB, RELATION_SCHEMA_VERSION,
  openDatabase, ensureRelationsSchema,
  loadPoets, loadNodes, loadWorkTitles,
  replaceRelations, setMeta, logStage,
  type PoetRow, type RelationRow,
} from './db-core';
import { DYNASTY_TABLES } from '../src/infrastructure/data/shard';
import { toSimplified } from '../src/infrastructure/text/t2s';
import { createPhilology } from '../src/infrastructure/wasm/philology';
import { RELATION_TYPES, type RelationType } from '../src/domain/entities/Relation';

/* ──── 参数 ──── */

/** 每诗人保留的出边上限 */
export const MAX_EDGES_PER_POET = 30;
/** 同朝代空间近邻数 */
export const SAME_DYNASTY_NEIGHBORS = 20;
/** 全库关系总量上限 */
export const MAX_TOTAL_RELATIONS = 250000;
/** 化用检测：n-gram 长度 */
export const GRAM_LEN = 5;
/** 化用判定：同一对诗人累计命中 gram 数下限 */
export const INFLUENCE_MIN_GRAMS = 3;
/** 化用判定：同一对诗人需分布在 ≥2 个作品 */
export const INFLUENCE_MIN_WORKS = 2;
/** 公共语阈值：gram 出现在 ≥N 个诗人作品中视为常语剔除 */
export const COMMON_GRAM_POET_THRESHOLD = 50;
/** 单作品参与化用检测的 gram 上限（长文截断） */
export const MAX_GRAMS_PER_WORK = 600;

/* ──── 基础结构 ──── */

interface PoetInfo {
  id: string;
  name: string;
  dynasty: string;
  workCount: number;
  courtesyName: string | null;
  pseudonym: string | null;
}

export interface RawRelation {
  sourceId: string;
  targetId: string;
  type: RelationType;
  weight: number;
  evidence: Record<string, unknown> | null;
}

function log(message: string): void {
  console.log(`[文气关系] ${message}`);
}

/** 简繁归一 + 去空白分隔符，姓名索引与候选名统一口径 */
export function normalizeName(name: string): string {
  return toSimplified(name).replace(/[\s·・]/g, '');
}

/* ──── 姓名索引 ──── */

export interface NameIndex {
  /** 归一名 → 诗人列表（同名冲突时按作品数降序） */
  map: Map<string, PoetInfo[]>;
  /** 字号键集合（命中降权并标「推断」，与本名命中区分置信度） */
  aliasKeys: Set<string>;
}

/** 姓名/字/号 → 诗人列表；字号单独标记（歧义大，降权处理） */
export function buildNameIndex(poets: PoetInfo[]): NameIndex {
  const map = new Map<string, PoetInfo[]>();
  const aliasKeys = new Set<string>();
  const push = (key: string, poet: PoetInfo, isAlias: boolean) => {
    if (key.length < 2) return;
    const list = map.get(key);
    if (list) {
      if (!list.some((p) => p.id === poet.id)) list.push(poet);
    } else {
      map.set(key, [poet]);
    }
    if (isAlias) aliasKeys.add(key);
  };
  for (const poet of poets) {
    push(normalizeName(poet.name), poet, false);
    for (const alias of [poet.courtesyName, poet.pseudonym]) {
      if (alias) push(normalizeName(alias), poet, true);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.workCount - a.workCount);
  }
  return { map, aliasKeys };
}

/** 标题匹配前的归一：姓名归一基础上剔除排行数字（「李十二白」→「李白」） */
export function normalizeTitle(title: string): string {
  return normalizeName(title).replace(/[一二三四五六七八九十百千两零]+/g, '');
}

/** 常见姓氏：候选命中偏移 >0 且前置字为姓氏时，多为「姓+字」结构（如「沈子美」），跳过 */
const SURNAMES = new Set(
  '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('')
);

/**
 * 从标题提取赠答关系：动词前缀 + 候选名扫描（各偏移位 4→3→2 字，最早偏移优先）。
 * 候选必须命中姓名索引；字号命中权重 ×0.75 并标「推断」。
 * 返回 null 表示无可识别关系。
 */
export function extractTitleRelation(
  title: string,
  nameIndex: NameIndex
): { target: PoetInfo; type: RelationType; weight: number; kind: string } | null {
  const t = normalizeTitle(title);
  if (t.length < 3) return null;

  // 动词 → [类型, 基础权重, 证据类别]（二字动词在前，避免被单字动词抢先截断）
  const patterns: Array<[string, RelationType, number, string]> = [
    ['次韵', 'FRIEND', 0.9, '唱和'],
    ['酬和', 'FRIEND', 0.9, '唱和'],
    ['留别', 'FRIEND', 0.6, '赠别'],
    ['赠别', 'FRIEND', 0.6, '赠别'],
    ['和', 'FRIEND', 0.9, '唱和'],
    ['答', 'FRIEND', 0.9, '唱和'],
    ['酬', 'FRIEND', 0.9, '唱和'],
    ['赠', 'FRIEND', 0.7, '赠答'],
    ['呈', 'FRIEND', 0.7, '赠答'],
    ['寄', 'FRIEND', 0.7, '赠答'],
    ['简', 'FRIEND', 0.7, '赠答'],
    ['示', 'FRIEND', 0.7, '赠答'],
    ['招', 'FRIEND', 0.7, '赠答'],
    ['贺', 'FRIEND', 0.7, '赠答'],
    ['别', 'FRIEND', 0.6, '赠别'],
    ['送', 'FRIEND', 0.6, '赠别'],
    ['怀', 'FRIEND', 0.5, '怀人'],
    ['忆', 'FRIEND', 0.5, '怀人'],
    ['梦', 'FRIEND', 0.5, '怀人'],
    ['哭', 'FRIEND', 0.6, '悼亡'],
    ['悼', 'FRIEND', 0.6, '悼亡'],
    ['挽', 'FRIEND', 0.6, '悼亡'],
    ['吊', 'FRIEND', 0.6, '悼亡'],
    ['谒', 'TEACHER_STUDENT', 0.6, '推断'],
    ['上', 'TEACHER_STUDENT', 0.6, '推断'],
    ['师', 'TEACHER_STUDENT', 0.6, '推断'],
    ['从', 'TEACHER_STUDENT', 0.6, '推断'],
  ];

  for (const [verb, type, weight, kind] of patterns) {
    if (!t.startsWith(verb)) continue;
    const rest = t.slice(verb.length);
    if (rest.length < 2) continue;
    // 最早偏移优先、同偏移长前缀优先，命中即止
    for (let start = 0; start + 2 <= rest.length && start < 6; start++) {
      for (const len of [4, 3, 2]) {
        if (start + len > rest.length) continue;
        const candidate = rest.substr(start, len);
        const hits = nameIndex.map.get(candidate);
        if (hits && hits.length > 0) {
          // 「姓+字」结构排除：命中位于偏移 >0 且前置字为姓氏
          if (start > 0 && SURNAMES.has(rest[start - 1])) continue;
          const isAlias = nameIndex.aliasKeys.has(candidate);
          return {
            target: hits[0],
            type,
            weight: Number((isAlias ? weight * 0.75 : weight).toFixed(2)),
            kind: isAlias ? '推断' : kind,
          };
        }
      }
    }
    // 动词后无人名即终止，避免「春风又绿」类误配
    return null;
  }
  return null;
}

/* ──── 并称与流派词表 ──── */

const PARALLEL_NAMES: Array<{ name: string; members: string[] }> = [
  { name: '李杜', members: ['李白', '杜甫'] },
  { name: '元白', members: ['元稹', '白居易'] },
  { name: '韩孟', members: ['韩愈', '孟郊'] },
  { name: '王孟', members: ['王维', '孟浩然'] },
  { name: '高岑', members: ['高适', '岑参'] },
  { name: '温李', members: ['温庭筠', '李商隐'] },
  { name: '刘柳', members: ['刘禹锡', '柳宗元'] },
  { name: '郊寒岛瘦', members: ['孟郊', '贾岛'] },
  { name: '皮陆', members: ['皮日休', '陆龟蒙'] },
  { name: '三苏', members: ['苏洵', '苏轼', '苏辙'] },
  { name: '二程', members: ['程颢', '程颐'] },
  { name: '苏门四学士', members: ['黄庭坚', '秦观', '晁补之', '张耒'] },
  { name: '初唐四杰', members: ['王勃', '杨炯', '卢照邻', '骆宾王'] },
  { name: '建安七子', members: ['孔融', '陈琳', '王粲', '徐干', '阮瑀', '应玚', '刘桢'] },
  { name: '竹林七贤', members: ['阮籍', '嵇康', '山涛', '向秀', '刘伶', '王戎', '阮咸'] },
  { name: '大历十才子', members: ['钱起', '卢纶', '吉中孚', '韩翃', '司空曙', '苗发', '崔峒', '耿湋', '夏侯审', '李端'] },
  { name: '南施北宋', members: ['施闰章', '宋琬'] },
  { name: '南袁北纪', members: ['袁枚', '纪昀'] },
  { name: '桐城三祖', members: ['方苞', '刘大櫆', '姚鼐'] },
];

/** 流派补录表：poets.school 缺失时的流派成员名单 */
const SCHOOL_SUPPLEMENTS: Array<{ name: string; members: string[] }> = [
  { name: '江西诗派', members: ['黄庭坚', '陈师道', '陈与义', '吕本中', '曾几', '杨万里', '陆游'] },
  { name: '花间派', members: ['温庭筠', '韦庄', '皇甫松', '牛峤', '毛文锡', '牛希济', '欧阳炯', '鹿虔扆', '阎选', '尹鹗', '李珣'] },
  { name: '公安派', members: ['袁宗道', '袁宏道', '袁中道'] },
  { name: '竟陵派', members: ['钟惺', '谭元春'] },
  { name: '浙西词派', members: ['朱彝尊', '陈维崧', '厉鹗'] },
  { name: '常州词派', members: ['张惠言', '周济', '谭献'] },
];

/* ──── 化用检测（5-gram 滚动倒排） ──── */

/** FNV-1a 截断为 31 位（保持 SMI，降低 Map 内存开销；碰撞率 ~0.3%，聚合判定下无碍） */
export function gramHash(gram: string): number {
  let hash = 2166136261;
  for (let i = 0; i < gram.length; i++) {
    hash ^= gram.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 1;
}

/** 提取正文 n-gram：去非汉字后滑窗（去重、长文截断） */
export function extractGrams(text: string | null | undefined): string[] {
  if (!text) return [];
  const cjk = text.replace(/[^\u4e00-\u9fff]/g, '');
  if (cjk.length < GRAM_LEN) return [];
  const grams = new Set<string>();
  for (let i = 0; i + GRAM_LEN <= cjk.length && grams.size < MAX_GRAMS_PER_WORK; i++) {
    grams.add(cjk.slice(i, i + GRAM_LEN));
  }
  return [...grams];
}

interface GramEntry {
  poets: Map<number, Set<number>>;
  common: boolean;
}

interface InfluencePair {
  grams: number;
  works: Set<number>;
  samples: string[];
}

export interface MinimalWork {
  poetId: string;
  text: string | null;
}

/**
 * 评注特征子串黑名单：数据集部分作品正文混入诗话/选本评注
 * （如《苕溪渔隐丛话》《诗话总龟》《岁时杂咏》引文），命中即不入 gram 索引。
 */
const COMMENTARY_MARKERS = [
  '叢話', '詩話', '總龜', '雜詠', '歲時', '萬首', '苕溪', '漁隱', '竹莊', '韻語', '陽秋',
  '紀事', '藝圃', '詩數', '增修', '全唐詩', '唐詩歸', '古詩歸', '唐詩品', '刪補', '鼓吹',
  '瀛奎', '文苑', '玉臺', '樂府詩', '樂府題', '註', '箋', '注云', '注曰', '註云', '註曰',
  '一作', '按此', '按：', '案：', '集注', '評曰', '评曰', '題跋', '序曰', '云云',
];

function isCommentaryGram(gram: string): boolean {
  return COMMENTARY_MARKERS.some((m) => gram.includes(m));
}

/**
 * 化用挖掘：按朝代表滚动（**朝代级**滚动——查询与入索引分两轮，同朝代作品互不命中），
 * 同对诗人累计命中 ≥3 gram 且分布 ≥2 作品则建 INFLUENCE 边（source=后代，target=前代源头）。
 * 评注 gram 与佚名源头、同名同朝代异 ID 记录（简繁重复）均跳过。
 */
export function mineInfluence(
  worksByTable: MinimalWork[][],
  poets: PoetInfo[],
  gramExtractor: (text: string | null | undefined) => string[] = extractGrams
): RawRelation[] {
  const poetIdx = new Map(poets.map((p, i) => [p.id, i]));
  const isAnon = new Map(poets.map((p) => [p.id, p.name === '佚名']));
  // 同名同朝代归一键（简繁重复记录视为同一人，不建边）
  const identityKey = new Map(poets.map((p) => [p.id, `${normalizeName(p.name)}|${p.dynasty}`]));
  const poetIds = poets.map((p) => p.id);

  // 第一遍：全局 gram 频次（入索引资格：2 ≤ count < 公共语阈值）
  const counts = new Map<number, number>();
  for (const works of worksByTable) {
    for (const w of works) {
      for (const g of gramExtractor(w.text)) {
        if (isCommentaryGram(g)) continue;
        const h = gramHash(g);
        counts.set(h, (counts.get(h) ?? 0) + 1);
      }
    }
  }

  // 第二遍：滚动索引（仅含 <当前朝代 的 gram），聚合作者对
  const index = new Map<number, GramEntry>();
  const out: RawRelation[] = [];

  for (const works of worksByTable) {
    const pairAgg = new Map<string, InfluencePair>();
    const pairPoets = new Map<string, [number, number]>();
    const tableGrams = works.map((w) => gramExtractor(w.text));

    // 查询轮：当前朝代作品查前代索引
    for (let wi = 0; wi < works.length; wi++) {
      const w = works[wi];
      const curIdx = poetIdx.get(w.poetId);
      if (curIdx === undefined || isAnon.get(w.poetId)) continue;
      for (const g of tableGrams[wi]) {
        if (isCommentaryGram(g)) continue;
        const entry = index.get(gramHash(g));
        if (!entry || entry.common) continue;
        for (const [prevIdx] of entry.poets) {
          if (prevIdx === curIdx) continue;
          const key = `${curIdx}:${prevIdx}`;
          let agg = pairAgg.get(key);
          if (!agg) {
            agg = { grams: 0, works: new Set(), samples: [] };
            pairAgg.set(key, agg);
            pairPoets.set(key, [curIdx, prevIdx]);
          }
          agg.grams++;
          agg.works.add(wi);
          if (agg.samples.length < 3) agg.samples.push(g);
        }
      }
    }

    // 输出该朝代累计的作者对
    for (const [key, agg] of pairAgg) {
      if (agg.grams < INFLUENCE_MIN_GRAMS || agg.works.size < INFLUENCE_MIN_WORKS) continue;
      const [curIdx, prevIdx] = pairPoets.get(key)!;
      // 同名同朝代异 ID（简繁重复记录）不建边
      if (identityKey.get(poetIds[curIdx]) === identityKey.get(poetIds[prevIdx])) continue;
      if (isAnon.get(poetIds[prevIdx])) continue;
      const weight = Math.min(0.9, 0.3 + 0.1 * Math.min(agg.grams, 6));
      out.push({
        sourceId: poetIds[curIdx],
        targetId: poetIds[prevIdx],
        type: 'INFLUENCE',
        weight: Number(weight.toFixed(2)),
        evidence: { kind: '共现', quote: agg.samples.join('、') },
      });
    }

    // 索引轮：当前朝代 gram 查询完成后再入索引
    for (let wi = 0; wi < works.length; wi++) {
      const w = works[wi];
      const curIdx = poetIdx.get(w.poetId);
      if (curIdx === undefined) continue;
      for (const g of tableGrams[wi]) {
        if (isCommentaryGram(g)) continue;
        const h = gramHash(g);
        const count = counts.get(h) ?? 0;
        if (count < 2 || count >= COMMON_GRAM_POET_THRESHOLD) continue;
        let e = index.get(h);
        if (!e) {
          e = { poets: new Map(), common: false };
          index.set(h, e);
        }
        if (e.common) continue;
        let workSet = e.poets.get(curIdx);
        if (!workSet) {
          if (e.poets.size >= COMMON_GRAM_POET_THRESHOLD) {
            e.poets.clear();
            e.common = true;
            continue;
          }
          workSet = new Set();
          e.poets.set(curIdx, workSet);
        }
        workSet.add(wi);
      }
    }
  }

  return out;
}

/* ──── 同朝代空间近邻 ──── */

/** 组内每节点取欧氏距离最近 Top-K 邻居（无序对去重后输出，weight 固定 0.3） */
export function mineSameDynastyNeighbors(
  nodes: Array<{ refId: string; dynasty: string; position: { x: number; y: number; z: number } }>
): RawRelation[] {
  const groups = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (!n.dynasty) return;
    const g = groups.get(n.dynasty);
    if (g) g.push(i);
    else groups.set(n.dynasty, [i]);
  });

  const seen = new Set<string>();
  const out: RawRelation[] = [];
  const best: Array<{ j: number; d: number }> = [];

  for (const members of groups.values()) {
    for (let a = 0; a < members.length; a++) {
      const i = members[a];
      const ni = nodes[i];
      best.length = 0;
      for (let b = 0; b < members.length; b++) {
        if (a === b) continue;
        const j = members[b];
        const nj = nodes[j];
        const dx = ni.position.x - nj.position.x;
        const dy = ni.position.y - nj.position.y;
        const dz = ni.position.z - nj.position.z;
        const d = dx * dx + dy * dy + dz * dz;
        // 小数组插入排序维护 Top-K（K 较小，快于整段排序）
        if (best.length < SAME_DYNASTY_NEIGHBORS) {
          best.push({ j, d });
          for (let k = best.length - 1; k > 0 && best[k].d < best[k - 1].d; k--) {
            [best[k], best[k - 1]] = [best[k - 1], best[k]];
          }
        } else if (d < best[best.length - 1].d) {
          best[best.length - 1] = { j, d };
          for (let k = best.length - 1; k > 0 && best[k].d < best[k - 1].d; k--) {
            [best[k], best[k - 1]] = [best[k - 1], best[k]];
          }
        }
      }
      for (const { j } of best) {
        const nj = nodes[j];
        const key = i < j ? `${ni.refId}|${nj.refId}` : `${nj.refId}|${ni.refId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          sourceId: ni.refId, targetId: nj.refId,
          type: 'SAME_DYNASTY', weight: 0.3,
          evidence: { kind: '同朝代' },
        });
      }
    }
  }
  return out;
}

/* ──── 合并与稀疏化 ──── */

/** 按 (source,target,type) 去重：保留最高权重，titles 证据合并（上限 3 条） */
export function mergeRelations(raw: RawRelation[]): RawRelation[] {
  const merged = new Map<string, RawRelation>();
  for (const r of raw) {
    const key = `${r.sourceId}|${r.targetId}|${r.type}`;
    const exist = merged.get(key);
    if (!exist) {
      merged.set(key, { ...r, evidence: r.evidence ? { ...r.evidence } : null });
      continue;
    }
    if (r.weight > exist.weight) exist.weight = r.weight;
    if (exist.evidence && r.evidence) {
      const titles = [
        ...((exist.evidence.titles as string[]) ?? []),
        ...((r.evidence.titles as string[]) ?? []),
      ];
      if (titles.length > 0) exist.evidence.titles = [...new Set(titles)].slice(0, 3);
    }
  }
  return [...merged.values()];
}

/** 每诗人出边 Top-N 截断 + 全库总量上限（超限时按权重全局截断） */
export function sparsifyRelations(relations: RawRelation[]): RawRelation[] {
  const bySource = new Map<string, RawRelation[]>();
  for (const r of relations) {
    const list = bySource.get(r.sourceId);
    if (list) list.push(r);
    else bySource.set(r.sourceId, [r]);
  }
  let out: RawRelation[] = [];
  for (const list of bySource.values()) {
    list.sort((a, b) => b.weight - a.weight || a.targetId.localeCompare(b.targetId));
    out = out.concat(list.slice(0, MAX_EDGES_PER_POET));
  }
  if (out.length > MAX_TOTAL_RELATIONS) {
    out.sort((a, b) => b.weight - a.weight);
    out = out.slice(0, MAX_TOTAL_RELATIONS);
  }
  return out;
}

/* ──── 主管道 ──── */

const relations: RawRelation[] = [];

async function main() {
  const startedAt = Date.now();
  const dbPath = process.argv.includes('--db')
    ? process.argv[process.argv.indexOf('--db') + 1]
    : DEFAULT_DB;

  log(`打开数据库: ${dbPath}`);
  const db = openDatabase(dbPath);
  ensureRelationsSchema(db);

  const poets = loadPoets(db);
  const poetInfos: PoetInfo[] = poets.map((p) => ({
    id: p.id, name: p.name, dynasty: p.dynasty, workCount: p.workCount,
    courtesyName: p.courtesyName, pseudonym: p.pseudonym,
  }));
  const poetIdSet = new Set(poetInfos.map((p) => p.id));
  // 同名同朝代归一键（简繁重复记录视为同一人）
  const identityKey = new Map(poetInfos.map((p) => [p.id, `${normalizeName(p.name)}|${p.dynasty}`]));
  const isAnon = new Set(poetInfos.filter((p) => p.name === '佚名').map((p) => p.id));
  log(`诗人: ${poetInfos.length} 位`);

  // 1. 赠答友朋（标题模式 + 姓名索引）
  log('挖掘赠答关系（标题模式 + 姓名索引）...');
  const nameIndex = buildNameIndex(poetInfos);
  const titles = loadWorkTitles(db);
  let giftCount = 0;
  for (const w of titles) {
    const hit = extractTitleRelation(w.title ?? '', nameIndex);
    if (!hit || !poetIdSet.has(w.poetId) || hit.target.id === w.poetId) continue;
    // 同名同朝代异 ID（简繁重复记录）与佚名目标跳过
    if (identityKey.get(w.poetId) === identityKey.get(hit.target.id) || isAnon.has(hit.target.id)) continue;
    const evidence = { kind: hit.kind, title: w.title, names: [w.poetName ?? '', hit.target.name] };
    relations.push({
      sourceId: w.poetId, targetId: hit.target.id,
      type: hit.type, weight: hit.weight, evidence,
    });
    // 受赠者侧回边（权重略降），保证双向可查
    relations.push({
      sourceId: hit.target.id, targetId: w.poetId,
      type: hit.type, weight: Number((hit.weight * 0.9).toFixed(2)),
      evidence,
    });
    giftCount++;
  }
  log(`  赠答标题命中: ${giftCount} 条`);

  // 2. 并称 + 流派
  log('挖掘并称与流派关系...');
  const idByName = new Map<string, string[]>();
  for (const p of poetInfos) {
    const key = normalizeName(p.name);
    const list = idByName.get(key);
    if (list) list.push(p.id);
    else idByName.set(key, [p.id]);
  }
  // 唯一命中才关联，避免同名诗人误入并称
  const resolveMembers = (names: string[]): string[] => {
    const ids: string[] = [];
    for (const n of names) {
      const hits = idByName.get(normalizeName(n));
      if (hits && hits.length === 1) ids.push(hits[0]);
    }
    return ids;
  };
  const linkMembers = (members: string[], kind: string, weight: number) => {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        relations.push({
          sourceId: members[i], targetId: members[j],
          type: 'SAME_SCHOOL', weight, evidence: { kind },
        });
      }
    }
  };
  let groupEdgeCount = 0;
  for (const group of PARALLEL_NAMES) {
    const members = resolveMembers(group.members);
    if (members.length >= 2) {
      linkMembers(members, `并称·${group.name}`, 0.8);
      groupEdgeCount += (members.length * (members.length - 1)) / 2;
    }
  }
  for (const group of SCHOOL_SUPPLEMENTS) {
    const members = resolveMembers(group.members);
    if (members.length >= 2) {
      linkMembers(members, `流派·${group.name}`, 0.7);
      groupEdgeCount += (members.length * (members.length - 1)) / 2;
    }
  }
  // poets.school 字段归组（同 school 两两建边，组过大时跳过防爆炸）
  const bySchool = new Map<string, string[]>();
  for (const p of poets) {
    if (!p.school) continue;
    const list = bySchool.get(p.school);
    if (list) list.push(p.id);
    else bySchool.set(p.school, [p.id]);
  }
  for (const members of bySchool.values()) {
    if (members.length < 2 || members.length > 60) continue;
    linkMembers(members, '同门', 0.5);
    groupEdgeCount += (members.length * (members.length - 1)) / 2;
  }
  log(`  并称/流派边: ${groupEdgeCount} 条`);

  // 3. 化用影响（逐分表流式读取正文，控内存；优先 Rust/WASM 计算 n-gram）
  const philology = await createPhilology();
  log(`挖掘化用影响（5-gram 滚动倒排，${philology.backend === 'wasm' ? 'Rust/WASM' : 'JS 兜底'}）...`);
  const worksByTable: MinimalWork[][] = [];
  for (const table of Object.values(DYNASTY_TABLES)) {
    const works = db
      .query(`SELECT poet_id AS poetId, text FROM ${table}`)
      .all() as MinimalWork[];
    worksByTable.push(works);
  }
  const influence = mineInfluence(worksByTable, poetInfos, philology.extractGrams);
  log(`  化用边: ${influence.length} 条（内存 ${(process.memoryUsage.rss() / 1048576).toFixed(0)} MB）`);
  relations.push(...influence);

  // 4. 同朝代空间近邻
  log('生成同朝代空间近邻关系...');
  const nodeRows = loadNodes(db);
  const sameDynasty = mineSameDynastyNeighbors(
    nodeRows.map((n) => ({ refId: n.refId, dynasty: n.dynasty ?? '', position: n.position }))
  );
  log(`  同朝代边: ${sameDynasty.length} 条`);
  relations.push(...sameDynasty);

  // 4b. 同乡：同一籍贯区划的诗人两两建边（区划内人数受稀疏化上限约束）
  log('生成同乡关系...');
  const byHometown = new Map<string, Array<{ id: string; hometown: string | null }>>();
  for (const p of poets) {
    if (!p.hometownRegionId) continue;
    const list = byHometown.get(p.hometownRegionId);
    if (list) list.push(p);
    else byHometown.set(p.hometownRegionId, [p]);
  }
  let hometownEdges = 0;
  for (const [regionId, members] of byHometown) {
    if (members.length < 2) continue;
    const regionName = (members[0].hometown ?? regionId).split('（')[0].split('(')[0];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        relations.push({
          sourceId: members[i].id, targetId: members[j].id,
          type: 'SAME_HOMETOWN', weight: 0.45,
          evidence: { kind: `同乡·${regionName}` },
        });
        hometownEdges++;
      }
    }
  }
  log(`  同乡边: ${hometownEdges} 条（${byHometown.size} 个区划）`);

  // 5. 合并去重 + 稀疏化
  log('合并去重与稀疏化...');
  const merged = mergeRelations(relations);
  const finalRelations = sparsifyRelations(merged);
  log(`  原始 ${relations.length} → 去重 ${merged.length} → 稀疏化 ${finalRelations.length} 条`);
  const byType = new Map<string, number>();
  for (const r of finalRelations) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  for (const [type, count] of byType) log(`  ${type}: ${count} 条`);

  // 6. 写库 + meta + 审计（幂等：整表覆盖）
  const inserted = replaceRelations(db, finalRelations);
  const relationVersion = `${RELATION_SCHEMA_VERSION}.${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)}`;
  setMeta(db, 'relation_version', relationVersion);
  setMeta(db, 'relations_count', inserted);
  setMeta(db, 'relations_updated_at', new Date().toISOString());
  logStage(db, {
    stage: 'relations',
    relationsCount: inserted,
    durationMs: Date.now() - startedAt,
  });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();

  log(`完成: 写入 ${inserted} 条关系，relation_version=${relationVersion}，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

// 直接执行才运行主管道（vitest 环境下 import.meta.main 为 undefined）
if (import.meta.main) {
  main().catch((err) => {
    console.error('[文气关系] 错误:', err);
    process.exit(1);
  });
}
