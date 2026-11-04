/**
 * 主题漫游剧本构建脚本
 *
 * 按下方内置的主题配置，从 SQLite 诗人表解析姓名对应的诗人 ID（繁简归一 + 取作品数最多者），
 * 生成前端消费的剧本 JSON：
 *   public/data/processed/tours/index.json     索引（漫游列表）
 *   public/data/processed/tours/{tourId}.json  单剧本（懒加载）
 *
 * 幂等可重跑：整目录覆盖写入。
 * 使用方式：bun run scripts/build-tours.ts [--db data/wenqi.db] [--out public/data/processed/tours]
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_DB, getMeta, loadPoets, openDatabase } from './db-core';
import { toSimplified } from '../src/infrastructure/text/t2s';
import { getDynastyName } from '../src/domain/value-objects/DynastyCode';
import type { TourScript, TourStep } from '../src/domain/value-objects/Tour';

const DEFAULT_OUT = 'public/data/processed/tours';

interface FocusStepDef {
  type: 'focus';
  poetName: string;
  durationMs: number;
  caption: string;
  narration?: string;
}

interface ClusterStepDef {
  type: 'cluster';
  clusterKey: string;
  durationMs: number;
  caption: string;
  narration?: string;
}

export type StepDef = FocusStepDef | ClusterStepDef;

export interface TourDefinition {
  id: string;
  title: string;
  description: string;
  steps: StepDef[];
}

/** 六条预置漫游剧本（人工撰写解说词，构建时解析诗人 ID） */
export const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    id: 'mid-autumn-moon',
    title: '千里共婵娟：中秋咏月',
    description: '循着明月意象，从张若虚的江畔，走到苏轼的中秋词',
    steps: [
      { type: 'focus', poetName: '张若虚', durationMs: 9000,
        caption: '「春江潮水连海平，海上明月共潮生。」张若虚仅存诗两首，却以《春江花月夜》孤篇压全唐。',
        narration: '春江潮水连海平，海上明月共潮生。' },
      { type: 'focus', poetName: '李白', durationMs: 8000,
        caption: '李白把月亮邀入酒杯：「举杯邀明月，对影成三人。」孤独在他的笔下也成了盛唐气象。',
        narration: '花间一壶酒，独酌无相亲。举杯邀明月，对影成三人。' },
      { type: 'focus', poetName: '苏轼', durationMs: 9000,
        caption: '到了宋代，苏轼把月亮写成对亲人的祝福：「但愿人长久，千里共婵娟。」',
        narration: '人有悲欢离合，月有阴晴圆缺，此事古难全。但愿人长久，千里共婵娟。' },
      { type: 'focus', poetName: '辛弃疾', durationMs: 7000,
        caption: '辛弃疾的月色则带着人间烟火：「明月别枝惊鹊，清风半夜鸣蝉。」',
        narration: '明月别枝惊鹊，清风半夜鸣蝉。' },
      { type: 'cluster', clusterKey: 'SONG', durationMs: 6000,
        caption: '从唐到宋，同一轮明月照亮了不同的心事。整片宋词星空，正为这轮月色亮起。' },
    ],
  },
  {
    id: 'frontier-storm',
    title: '边塞风云：黄沙与铁马',
    description: '从盛唐的豪情到宋人的忧思，看边塞诗如何写尽家国',
    steps: [
      { type: 'focus', poetName: '王昌龄', durationMs: 8000,
        caption: '「秦时明月汉时关，万里长征人未还。」王昌龄一句诗，写尽千年边关的苍凉。',
        narration: '秦时明月汉时关，万里长征人未还。' },
      { type: 'focus', poetName: '高适', durationMs: 8000,
        caption: '高适亲历军营：「战士军前半死生，美人帐下犹歌舞。」边塞诗第一次有了冷峻的目击感。',
        narration: '战士军前半死生，美人帐下犹歌舞。' },
      { type: 'focus', poetName: '岑参', durationMs: 8000,
        caption: '岑参把奇寒写得瑰丽：「忽如一夜春风来，千树万树梨花开。」',
        narration: '忽如一夜春风来，千树万树梨花开。' },
      { type: 'focus', poetName: '范仲淹', durationMs: 8000,
        caption: '宋人的边塞换了腔调：「塞下秋来风景异，衡阳雁去无留意。」思归与守土彼此拉扯。',
        narration: '塞下秋来风景异，衡阳雁去无留意。' },
      { type: 'focus', poetName: '陆游', durationMs: 7000,
        caption: '到陆游笔下，边塞已是纸上山河：「夜阑卧听风吹雨，铁马冰河入梦来。」',
        narration: '夜阑卧听风吹雨，铁马冰河入梦来。' },
      { type: 'cluster', clusterKey: 'SONG', durationMs: 6000,
        caption: '铁马冰河远去，只剩一片宋词星空，仍在替诗人守夜。' },
    ],
  },
  {
    id: 'farewell-longing',
    title: '送别怀远：长亭与孤帆',
    description: '从王勃的豁达到柳永的缠绵，四首送别诗串起中国人的离别',
    steps: [
      { type: 'focus', poetName: '王勃', durationMs: 7000,
        caption: '「海内存知己，天涯若比邻。」初唐的送别，把距离写成了豪迈。',
        narration: '海内存知己，天涯若比邻。' },
      { type: 'focus', poetName: '王维', durationMs: 8000,
        caption: '「劝君更尽一杯酒，西出阳关无故人。」一杯酒，压住了所有说不出口的话。',
        narration: '劝君更尽一杯酒，西出阳关无故人。' },
      { type: 'focus', poetName: '李白', durationMs: 8000,
        caption: '「桃花潭水深千尺，不及汪伦送我情。」李白把友情写得比水深，也比水响。',
        narration: '桃花潭水深千尺，不及汪伦送我情。' },
      { type: 'focus', poetName: '柳永', durationMs: 8000,
        caption: '到了宋代，离别变得缠绵：「多情自古伤离别，更那堪冷落清秋节。」',
        narration: '多情自古伤离别，更那堪冷落清秋节。' },
      { type: 'cluster', clusterKey: 'SONG', durationMs: 6000,
        caption: '长亭之外，是整片宋词星空；每一盏灯，都像在等人归来。' },
    ],
  },
  {
    id: 'wine-bold',
    title: '饮酒旷达：一杯敬天地',
    description: '诗人们如何借酒把苦闷酿成旷达',
    steps: [
      { type: 'focus', poetName: '李白', durationMs: 9000,
        caption: '「天生我材必有用，千金散尽还复来。」李白的酒，是把失意举过头顶的豪情。',
        narration: '天生我材必有用，千金散尽还复来。' },
      { type: 'focus', poetName: '白居易', durationMs: 8000,
        caption: '白居易的酒是暖的：「绿蚁新醅酒，红泥小火炉。晚来天欲雪，能饮一杯无？」',
        narration: '晚来天欲雪，能饮一杯无。' },
      { type: 'focus', poetName: '苏轼', durationMs: 9000,
        caption: '苏轼的酒是旷的：「一蓑烟雨任平生。」风雨入酒，也入了他的从容。',
        narration: '回首向来萧瑟处，归去，也无风雨也无晴。' },
      { type: 'focus', poetName: '辛弃疾', durationMs: 8000,
        caption: '辛弃疾的酒是烈的：「醉里挑灯看剑，梦回吹角连营。」酒醒之后，仍是山河。',
        narration: '醉里挑灯看剑，梦回吹角连营。' },
      { type: 'cluster', clusterKey: 'SONG', durationMs: 6000,
        caption: '酒尽灯残，宋词星空依然滚烫。' },
    ],
  },
  {
    id: 'homesick-return',
    title: '思乡望归：何处是故乡',
    description: '从江南舟中到元曲古道，跟随诗人寻找回家的方向',
    steps: [
      { type: 'focus', poetName: '王湾', durationMs: 7000,
        caption: '「潮平两岸阔，风正一帆悬。」北固山下的江水，载着一个旅人的归心。',
        narration: '潮平两岸阔，风正一帆悬。' },
      { type: 'focus', poetName: '孟浩然', durationMs: 8000,
        caption: '「野旷天低树，江清月近人。」宿在建德江边，故乡远得只剩一轮月。',
        narration: '移舟泊烟渚，日暮客愁新。野旷天低树，江清月近人。' },
      { type: 'focus', poetName: '杜甫', durationMs: 8000,
        caption: '「露从今夜白，月是故乡明。」乱世里的乡愁，比月光更清冷。',
        narration: '露从今夜白，月是故乡明。' },
      { type: 'focus', poetName: '马致远', durationMs: 9000,
        caption: '「夕阳西下，断肠人在天涯。」元曲只用二十八字，写尽了游子的黄昏。',
        narration: '枯藤老树昏鸦，小桥流水人家，古道西风瘦马。夕阳西下，断肠人在天涯。' },
      { type: 'focus', poetName: '纳兰性德', durationMs: 8000,
        caption: '「风一更，雪一更，聒碎乡心梦不成。」清代的塞外风雪，吹不散同一个乡愁。',
        narration: '风一更，雪一更，聒碎乡心梦不成，故园无此声。' },
      { type: 'cluster', clusterKey: 'YUAN', durationMs: 5000,
        caption: '元曲的星团里，还有无数个没有归期的黄昏。' },
    ],
  },
  {
    id: 'su-circle',
    title: '苏轼的朋友圈：苏门四学士',
    description: '以苏轼为圆心，看北宋文人如何互相照亮',
    steps: [
      { type: 'focus', poetName: '苏轼', durationMs: 9000,
        caption: '「人生如逆旅，我亦是行人。」苏轼把一生流放，走成了后人心里的坐标。',
        narration: '人生如逆旅，我亦是行人。' },
      { type: 'focus', poetName: '黄庭坚', durationMs: 8000,
        caption: '黄庭坚是苏门四学士之一，诗学杜甫而自开江西诗派：「桃李春风一杯酒，江湖夜雨十年灯。」',
        narration: '桃李春风一杯酒，江湖夜雨十年灯。' },
      { type: 'focus', poetName: '秦观', durationMs: 8000,
        caption: '秦观把词写得柔婉：「两情若是久长时，又岂在朝朝暮暮。」苏轼称他有屈宋之才。',
        narration: '两情若是久长时，又岂在朝朝暮暮。' },
      { type: 'focus', poetName: '晁补之', durationMs: 7000,
        caption: '晁补之与张耒同列苏门，诗文唱和，是苏轼身边最稳定的回声。',
        narration: '' },
      { type: 'focus', poetName: '张耒', durationMs: 7000,
        caption: '张耒的笔下有民生疾苦，也有对师友的深情。苏门四学士，各有各的光。',
        narration: '' },
      { type: 'cluster', clusterKey: 'SONG', durationMs: 6000,
        caption: '以苏轼为圆心，北宋文人的光互相照亮，连成一片更大的星空。' },
    ],
  },
];

/** 姓名 → 诗人（繁简归一后取作品数最多者） */
export function buildPoetIndex(poets: Array<{ id: string; name: string; workCount: number; dynasty: string }>): Map<string, { id: string; name: string; dynasty: string; workCount: number }> {
  const index = new Map<string, { id: string; name: string; dynasty: string; workCount: number }>();
  for (const poet of poets) {
    const key = toSimplified(poet.name);
    const existing = index.get(key);
    if (!existing || poet.workCount > existing.workCount) {
      index.set(key, { id: poet.id, name: poet.name, dynasty: poet.dynasty, workCount: poet.workCount });
    }
  }
  return index;
}

/** 解析单条剧本定义；姓名无法匹配时跳过该步骤并记录告警 */
export function resolveTour(
  definition: TourDefinition,
  poetIndex: Map<string, { id: string; name: string; dynasty: string; workCount: number }>,
  warn: (message: string) => void
): TourScript {
  const steps: TourStep[] = [];

  for (const def of definition.steps) {
    if (def.type === 'focus') {
      const poet = poetIndex.get(toSimplified(def.poetName));
      if (!poet) {
        warn(`  [${definition.id}] 未找到诗人「${def.poetName}」，跳过该步骤`);
        continue;
      }
      steps.push({
        type: 'focus',
        refId: poet.id,
        label: poet.name,
        durationMs: def.durationMs,
        caption: def.caption,
        ...(def.narration ? { narration: def.narration } : {}),
      });
    } else {
      steps.push({
        type: 'cluster',
        clusterKey: def.clusterKey,
        label: getDynastyName(def.clusterKey),
        durationMs: def.durationMs,
        caption: def.caption,
        ...(def.narration ? { narration: def.narration } : {}),
      });
    }
  }

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    steps,
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (key?.startsWith('--')) options[key.slice(2)] = argv[i + 1] ?? '';
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const dbPath = options.db ?? DEFAULT_DB;
  const outDir = options.out ?? DEFAULT_OUT;

  const db = openDatabase(dbPath, { readonly: true });
  try {
    const poets = loadPoets(db).map((p) => ({
      id: p.id, name: p.name, dynasty: p.dynasty, workCount: p.workCount,
    }));
    const poetIndex = buildPoetIndex(poets);

    fs.mkdirSync(outDir, { recursive: true });
    const version = getMeta(db, 'dataset_version');
    const summaries: Array<{ id: string; title: string; description: string; stepCount: number; durationMs: number }> = [];
    let totalSteps = 0;

    for (const definition of TOUR_DEFINITIONS) {
      const script = resolveTour(definition, poetIndex, (msg) => console.warn(msg));
      if (script.steps.length === 0) {
        throw new Error(`剧本「${definition.id}」未解析到任何有效步骤`);
      }
      fs.writeFileSync(
        path.join(outDir, `${script.id}.json`),
        JSON.stringify(script, null, 2),
        'utf-8'
      );
      summaries.push({
        id: script.id,
        title: script.title,
        description: script.description,
        stepCount: script.steps.length,
        durationMs: script.steps.reduce((sum, step) => sum + step.durationMs, 0),
      });
      totalSteps += script.steps.length;
      console.log(`  ${script.id}: ${script.steps.length} 步`);
    }

    fs.writeFileSync(
      path.join(outDir, 'index.json'),
      JSON.stringify({ version, tours: summaries }, null, 2),
      'utf-8'
    );
    console.log(`漫游剧本构建完成: ${summaries.length} 条 / ${totalSteps} 步 → ${outDir}`);
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  main();
}
