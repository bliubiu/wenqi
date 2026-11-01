/**
 * 文气项目三气评分计算脚本
 *
 * 功能：
 * 1. 从 SQLite 底座读取诗人和作品数据
 * 2. 计算每个诗人的三气评分（才气/人气/运气）
 * 3. 评分结果写回数据库 scores 表（DB 为唯一真相源）
 *
 * 使用方式：
 * bun run scripts/calculate-scores.ts
 */

import { openDatabase, loadPoets, loadAllWorks, insertScores, setMeta, logStage, DEFAULT_DB } from './db-core';

// 评分算法版本
const SCORING_ALGORITHM_VERSION = 'v1.1';

// 接口定义
interface Poet {
  id: string;
  name: string;
  dynasty: string;
  biography: string | null;
  workCount: number;
}

interface Work {
  id: string;
  title: string;
  poetId: string;
  poetName: string | null;
  dynasty: string;
  genre: string | null;
  text: string | null;
}

interface TalentScore {
  value: number;
  factors: {
    lexicalUniqueness: number;
    imageryNovelty: number;
    genreInnovation: number;
  };
}

interface PopularityScore {
  value: number;
  factors: {
    citationCount: number;
    textbookCount: number;
    searchHeat: number;
  };
}

interface LuckScore {
  value: number;
  factors: {
    politicalEnvironment: number;
    rediscoveryEvents: number;
  };
}

interface ThreeQi {
  talent: TalentScore;
  popularity: PopularityScore;
  luck: LuckScore;
  algorithmVersion: string;
}

interface ScoreResult {
  poetId: string;
  poetName: string;
  dynasty: string;
  threeQi: ThreeQi;
}

/**
 * 计算用词独特性
 */
function calculateLexicalUniqueness(works: Work[]): number {
  if (works.length === 0) return 0;

  let totalChars = 0;
  const uniqueChars = new Set<string>();

  for (const work of works) {
    for (const ch of work.text ?? '') {
      if (!/\s/.test(ch) && !/[^一-龥]/.test(ch)) {
        totalChars++;
        uniqueChars.add(ch);
      }
    }
  }

  if (totalChars === 0) return 0;

  const ratio = uniqueChars.size / totalChars;
  return Math.min(ratio * 100, 100);
}

/**
 * 计算意象新颖度
 */
function calculateImageryNovelty(works: Work[]): number {
  if (works.length === 0) return 0;

  const bigramCounts = new Map<string, number>();
  let totalBigrams = 0;

  for (const work of works) {
    const chars = Array.from(work.text ?? '');
    for (let i = 0; i < chars.length - 1; i++) {
      if (!/\s/.test(chars[i]) && !/\s/.test(chars[i + 1])) {
        const bigram = chars[i] + chars[i + 1];
        bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
        totalBigrams++;
      }
    }
  }

  if (totalBigrams === 0) return 0;

  let lowFreqCount = 0;
  for (const count of bigramCounts.values()) {
    if (count <= 2) lowFreqCount++;
  }

  const noveltyRatio = lowFreqCount / totalBigrams;
  return Math.min(noveltyRatio * 100, 100);
}

/**
 * 计算体裁创新
 */
function calculateGenreInnovation(works: Work[]): number {
  if (works.length === 0) return 0;

  const genres = new Set<string>();
  for (const work of works) {
    if (work.genre) genres.add(work.genre);
  }

  return Math.min(genres.size * 20, 100);
}

/**
 * 计算才气评分
 */
function calculateTalent(poet: Poet, works: Work[]): TalentScore {
  const lexicalUniqueness = calculateLexicalUniqueness(works);
  const imageryNovelty = calculateImageryNovelty(works);
  const genreInnovation = calculateGenreInnovation(works);

  const value = Math.round(
    lexicalUniqueness * 0.4 + imageryNovelty * 0.4 + genreInnovation * 0.2
  );

  return {
    value: Math.max(0, Math.min(100, value)),
    factors: {
      lexicalUniqueness,
      imageryNovelty,
      genreInnovation,
    },
  };
}

/**
 * 计算人气评分
 *
 * 因子说明：
 * - citationCount: 作品数量 × 朝代影响力系数（唐=1.5，宋=1.3，其他=1.0）
 *   作品数量是客观数据，朝代系数反映文化繁荣度的相对差异
 * - textbookCount: 基于作品总数的 5%（保守估计）
 * - searchHeat: 基于生平描述长度（字数多说明史料丰富，关注度高）
 */
function calculatePopularity(poet: Poet, works: Work[]): PopularityScore {
  const workCount = works.length;

  // 朝代影响力系数：唐=1.5, 宋=1.3, 现代=1.2, 其他=1.0
  const dynastyMultiplier: Record<string, number> = {
    TANG: 1.5, SONG: 1.3, MODERN: 1.2,
  };
  const multiplier = dynastyMultiplier[poet.dynasty] ?? 1.0;

  const citationCount = Math.round(workCount * multiplier);
  const textbookCount = Math.floor(workCount * 0.05);
  const searchHeat = Math.min((poet.biography ?? '').length / 20, 100);

  const raw = citationCount * 0.5 + textbookCount * 0.3 + searchHeat * 0.2;
  const value = Math.round(Math.min(raw, 100));

  return {
    value,
    factors: {
      citationCount,
      textbookCount,
      searchHeat,
    },
  };
}

/**
 * 计算运气评分
 */
function calculateLuck(poet: Poet): LuckScore {
  let politicalEnvironment = 0;
  switch (poet.dynasty) {
    case 'TANG':
      politicalEnvironment = 15;
      break;
    case 'SONG':
      politicalEnvironment = 10;
      break;
    case 'WEI_JIN':
      politicalEnvironment = 8;
      break;
    case 'HAN':
      politicalEnvironment = 8;
      break;
    case 'PRE_QIN':
      politicalEnvironment = 5;
      break;
    case 'FIVE_DYNASTIES':
      politicalEnvironment = 3;
      break;
    case 'YUAN':
      politicalEnvironment = -5;
      break;
    case 'MING':
      politicalEnvironment = 5;
      break;
    case 'QING':
      politicalEnvironment = 2;
      break;
    case 'MODERN':
      politicalEnvironment = -3;
      break;
    default:
      politicalEnvironment = 0;
  }

  const rediscoveryEvents = Math.max(-25, Math.min(25, poet.workCount / 20));

  const value = Math.round(
    Math.max(-50, Math.min(50, politicalEnvironment + rediscoveryEvents))
  );

  return {
    value,
    factors: {
      politicalEnvironment,
      rediscoveryEvents,
    },
  };
}

/**
 * 计算三气合一
 */
function calculateThreeQi(poet: Poet, works: Work[]): ThreeQi {
  const talent = calculateTalent(poet, works);
  const popularity = calculatePopularity(poet, works);
  const luck = calculateLuck(poet);

  return {
    talent,
    popularity,
    luck,
    algorithmVersion: SCORING_ALGORITHM_VERSION,
  };
}

/**
 * 主函数
 */
function main() {
  console.log('=== 文气项目三气评分计算 ===\n');
  const startedAt = Date.now();

  // 读取数据（SQLite 底座为唯一真相源）
  console.log('读取数据...');
  const db = openDatabase(DEFAULT_DB);
  const poets: Poet[] = loadPoets(db);
  const works: Work[] = loadAllWorks(db);

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  // 按诗人ID分组作品
  const worksByPoet = new Map<string, Work[]>();
  for (const work of works) {
    if (!worksByPoet.has(work.poetId)) {
      worksByPoet.set(work.poetId, []);
    }
    worksByPoet.get(work.poetId)!.push(work);
  }

  // 计算评分
  console.log('\n计算三气评分...');
  const results: ScoreResult[] = [];

  for (const poet of poets) {
    const poetWorks = worksByPoet.get(poet.id) || [];
    const threeQi = calculateThreeQi(poet, poetWorks);

    results.push({
      poetId: poet.id,
      poetName: poet.name,
      dynasty: poet.dynasty,
      threeQi,
    });
  }

  // 统计信息
  console.log('\n=== 评分统计 ===');

  // 才气统计
  const talentValues = results.map(r => r.threeQi.talent.value);
  const avgTalent = talentValues.reduce((a, b) => a + b, 0) / talentValues.length;
  const maxTalent = Math.max(...talentValues);
  const minTalent = Math.min(...talentValues);

  console.log('\n才气评分:');
  console.log(`  平均值: ${avgTalent.toFixed(2)}`);
  console.log(`  最大值: ${maxTalent}`);
  console.log(`  最小值: ${minTalent}`);

  // 人气统计
  const popularityValues = results.map(r => r.threeQi.popularity.value);
  const avgPopularity = popularityValues.reduce((a, b) => a + b, 0) / popularityValues.length;
  const maxPopularity = Math.max(...popularityValues);
  const minPopularity = Math.min(...popularityValues);

  console.log('\n人气评分:');
  console.log(`  平均值: ${avgPopularity.toFixed(2)}`);
  console.log(`  最大值: ${maxPopularity}`);
  console.log(`  最小值: ${minPopularity}`);

  // 运气统计
  const luckValues = results.map(r => r.threeQi.luck.value);
  const avgLuck = luckValues.reduce((a, b) => a + b, 0) / luckValues.length;
  const maxLuck = Math.max(...luckValues);
  const minLuck = Math.min(...luckValues);

  console.log('\n运气评分:');
  console.log(`  平均值: ${avgLuck.toFixed(2)}`);
  console.log(`  最大值: ${maxLuck}`);
  console.log(`  最小值: ${minLuck}`);

  // 显示前10名诗人
  console.log('\n=== 才气排行榜 TOP 10 ===');
  const topTalent = [...results]
    .sort((a, b) => b.threeQi.talent.value - a.threeQi.talent.value)
    .slice(0, 10);

  topTalent.forEach((r, i) => {
    console.log(`${i + 1}. ${r.poetName} (${r.dynasty}): ${r.threeQi.talent.value}`);
  });

  console.log('\n=== 人气排行榜 TOP 10 ===');
  const topPopularity = [...results]
    .sort((a, b) => b.threeQi.popularity.value - a.threeQi.popularity.value)
    .slice(0, 10);

  topPopularity.forEach((r, i) => {
    console.log(`${i + 1}. ${r.poetName} (${r.dynasty}): ${r.threeQi.popularity.value}`);
  });

  // 保存评分结果（写回数据库，幂等覆盖）
  console.log('\n保存评分结果...');
  db.exec('DELETE FROM scores');
  const { inserted } = insertScores(db, results as any);
  setMeta(db, 'algorithm_version', SCORING_ALGORITHM_VERSION);
  setMeta(db, 'scores_updated_at', new Date().toISOString());
  setMeta(db, 'scores_count', inserted);
  logStage(db, {
    stage: 'scores',
    datasetVersion: null,
    source: null,
    scoresCount: inserted,
    durationMs: Date.now() - startedAt,
  });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  console.log(`  已写入数据库 scores 表: ${inserted} 条`);

  console.log('\n=== 计算完成 ===');
}

// 运行主函数
main();
