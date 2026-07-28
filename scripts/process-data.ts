/**
 * 文气项目数据处理脚本
 *
 * 功能：
 * 1. 读取 chinese-poetry 原始数据
 * 2. 清洗、去重、标准化
 * 3. 生成 poets.json 和 works.json
 *
 * 使用方式：
 * bun run scripts/process-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 朝代枚举
enum DynastyCode {
  PreQin = 'PRE_QIN',
  Han = 'HAN',
  WeiJin = 'WEI_JIN',
  Tang = 'TANG',
  FiveDynasties = 'FIVE_DYNASTIES',
  Song = 'SONG',
  Yuan = 'YUAN',
  Ming = 'MING',
  Qing = 'QING',
  Modern = 'MODERN',
}

// 体裁枚举
enum GenreCode {
  Shi = 'SHI',
  Ci = 'CI',
  Qu = 'QU',
  Fu = 'FU',
  Wen = 'WEN',
  Xiaoshuo = 'XIAOSHUO',
}

// 诗人原始数据接口
interface PoetRaw {
  id: string;
  name: string;
  dynasty: DynastyCode;
  description?: string;
}

// 作品原始数据接口
interface WorkRaw {
  id: string;
  title: string;
  author: string;
  dynasty: DynastyCode;
  genre: GenreCode;
  paragraphs: string[];
}

interface BirthDeathInfo {
  startYear: number | null;
  endYear: number | null;
}

// 处理后的诗人数据
interface PoetProcessed {
  id: string;
  name: string;
  dynasty: DynastyCode;
  biography: string;
  workCount: number;
  courtesyName: string | null;
  pseudonym: string | null;
  birthDeath: BirthDeathInfo | null;
  school: string | null;
}

// 处理后的作品数据
interface WorkProcessed {
  id: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: DynastyCode;
  genre: GenreCode;
  text: string;
}

// 数据目录
const RAW_DIR = path.join(__dirname, '../data/raw/chinese-poetry');
const OUTPUT_DIR = path.join(__dirname, '../data/processed');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 读取 JSON 文件
 */
function readJsonFile<T>(filePath: string): T[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error);
    return [];
  }
}

/**
 * 清理编码（去除替换字符 U+FFFD / \uFFFD 和不可见控制字符）
 */
function cleanEncoding(text: string): string {
  return text
    .replace(/\uFFFD/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();
}

/**
 * 批量清理文本数组中的编码问题
 */
function cleanTextArray(arr: string[]): string[] {
  return arr.map(s => cleanEncoding(s)).filter(s => s.length > 0);
}

/**
 * 生成确定性 ID（基于内容的 SHA256 前缀）
 */
function deterministicId(prefix: string, content: string): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `${prefix}_${hash.slice(0, 12)}`;
}

/**
 * 作品去重（基于标题 + 作者 + 内容前 100 字符的哈希）
 */
function deduplicateWorks(works: WorkRaw[]): WorkRaw[] {
  const seen = new Map<string, WorkRaw>();
  for (const w of works) {
    const contentKey = (w.paragraphs || []).join('').slice(0, 100);
    const key = crypto.createHash('sha256').update(`${w.title}|${w.author}|${contentKey}`).digest('hex');
    if (!seen.has(key)) {
      seen.set(key, w);
    }
  }
  return Array.from(seen.values());
}

/**
 * 将数据源中的字符串朝代映射到 DynastyCode
 */
function mapDynasty(source: string): DynastyCode | null {
  const map: Record<string, DynastyCode> = {
    'tang': DynastyCode.Tang,
    'song': DynastyCode.Song,
    'yuan': DynastyCode.Yuan,
    'ming': DynastyCode.Ming,
    'qing': DynastyCode.Qing,
    'pre_qin': DynastyCode.PreQin,
    'han': DynastyCode.Han,
    'weijin': DynastyCode.WeiJin,
    'five_dynasties': DynastyCode.FiveDynasties,
    'modern': DynastyCode.Modern,
  };
  return map[source.toLowerCase()] || null;
}

// 诗人详情缓存（供各处理函数共享）
const poetDetailCache = new Map<string, { courtesyName: string | null; pseudonym: string | null; birthDeath: BirthDeathInfo | null }>();

/**
 * 处理全唐诗数据
 */
function processTangPoetry(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理全唐诗数据...');

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];

  // 读取诗人数据
  const authorsTang = readJsonFile<any>(path.join(RAW_DIR, '全唐诗/authors.tang.json'));
  const authorsSong = readJsonFile<any>(path.join(RAW_DIR, '全唐诗/authors.song.json'));

  // 处理唐代诗人
  for (const author of authorsTang) {
    const desc = author.desc || '';
    const details = extractPoetDetails(desc);
    poets.push({
      id: `poet_${author.id}`,
      name: author.name,
      dynasty: DynastyCode.Tang,
      description: desc,
    });
    // 缓存作者详情供后续使用
    if (details.courtesyName || details.pseudonym || details.birthDeath) {
      poetDetailCache.set(author.name, details);
    }
  }

  // 处理宋代诗人（全唐诗中也包含宋代诗人）
  for (const author of authorsSong) {
    const desc = author.desc || '';
    const details = extractPoetDetails(desc);
    poets.push({
      id: `poet_${author.id}`,
      name: author.name,
      dynasty: DynastyCode.Song,
      description: desc,
    });
    if (details.courtesyName || details.pseudonym || details.birthDeath) {
      poetDetailCache.set(author.name, details);
    }
  }

  // 读取诗歌数据
  const tangFiles = fs.readdirSync(path.join(RAW_DIR, '全唐诗'))
    .filter(f => f.startsWith('poet.tang.') && f.endsWith('.json'));

  for (const file of tangFiles) {
    const poems = readJsonFile<any>(path.join(RAW_DIR, `全唐诗/${file}`));
    for (const poem of poems) {
      works.push({
        id: `work_${poem.id}`,
        title: poem.title,
        author: poem.author,
        dynasty: DynastyCode.Tang,
        genre: GenreCode.Shi,
        paragraphs: poem.paragraphs || [],
      });
    }
  }

  // 处理宋词文件
  const songFiles = fs.readdirSync(path.join(RAW_DIR, '全唐诗'))
    .filter(f => f.startsWith('poet.song.') && f.endsWith('.json'));

  for (const file of songFiles) {
    const poems = readJsonFile<any>(path.join(RAW_DIR, `全唐诗/${file}`));
    for (const poem of poems) {
      works.push({
        id: `work_${poem.id}`,
        title: poem.title,
        author: poem.author,
        dynasty: DynastyCode.Song,
        genre: GenreCode.Shi,
        paragraphs: poem.paragraphs || [],
      });
    }
  }

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 处理宋词数据
 */
function processSongCi(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理宋词数据...');

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];

  const ciDir = path.join(RAW_DIR, '宋词');
  if (!fs.existsSync(ciDir)) {
    console.log('  宋词目录不存在，跳过');
    return { poets, works };
  }

  const files = fs.readdirSync(ciDir)
    .filter(f => f.endsWith('.json'));

  for (const file of files) {
    const ciPoems = readJsonFile<any>(path.join(ciDir, file));
    for (const poem of ciPoems) {
      // 提取诗人信息
      if (poem.author) {
        const poetId = `poet_song_${poem.author}`;
        if (!poets.find(p => p.id === poetId)) {
          poets.push({
            id: poetId,
            name: poem.author,
            dynasty: DynastyCode.Song,
            description: '',
          });
        }

        const poemKey = `${poem.rhythmic || poem.title || '无题'}_${poem.author}_${(poem.paragraphs || []).slice(0, 5).join('')}`;
        works.push({
          id: poem.id ? `work_song_${poem.id}` : deterministicId('work_song', poemKey),
          title: poem.rhythmic || poem.title || '无题',
          author: poem.author,
          dynasty: DynastyCode.Song,
          genre: GenreCode.Ci,
          paragraphs: poem.paragraphs || [],
        });
      }
    }
  }

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 处理元曲数据
 */
function processYuanQu(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理元曲数据...');

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];

  const quDir = path.join(RAW_DIR, '元曲');
  if (!fs.existsSync(quDir)) {
    console.log('  元曲目录不存在，跳过');
    return { poets, works };
  }

  const files = fs.readdirSync(quDir)
    .filter(f => f.endsWith('.json'));

  for (const file of files) {
    const quPoems = readJsonFile<any>(path.join(quDir, file));
    for (const poem of quPoems) {
      if (poem.author) {
        // 优先使用数据自带的 dynasty 字段，回退到硬编码
        const dynasty = (poem.dynasty && mapDynasty(poem.dynasty)) || DynastyCode.Yuan;
        const poetId = `poet_${dynasty.toLowerCase()}_${poem.author}`;
        if (!poets.find(p => p.id === poetId)) {
          poets.push({
            id: poetId,
            name: poem.author,
            dynasty,
            description: '',
          });
        }

        const yuanKey = `${poem.title || '无题'}_${poem.author}_${(poem.paragraphs || []).slice(0, 5).join('')}`;
        works.push({
          id: poem.id ? `work_${dynasty.toLowerCase()}_${poem.id}` : deterministicId(`work_${dynasty.toLowerCase()}`, yuanKey),
          title: poem.title || '无题',
          author: poem.author,
          dynasty,
          genre: GenreCode.Qu,
          paragraphs: poem.paragraphs || [],
        });
      }
    }
  }

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 去重诗人数据
 */
function deduplicatePoets(poets: PoetRaw[]): PoetRaw[] {
  const seen = new Map<string, PoetRaw>();

  for (const poet of poets) {
    const key = `${poet.name}_${poet.dynasty}`;
    if (!seen.has(key)) {
      seen.set(key, poet);
    }
  }

  return Array.from(seen.values());
}

/**
 * 生成诗人ID映射
 */
function generatePoetIdMap(poets: PoetRaw[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const poet of poets) {
    map.set(poet.name, poet.id);
  }

  return map;
}

/**
 * 从作者生平描述中提取字号、生卒年等信息
 */
function extractPoetDetails(description: string): { courtesyName: string | null; pseudonym: string | null; birthDeath: BirthDeathInfo | null } {
  let courtesyName: string | null = null;
  let pseudonym: string | null = null;
  let birthDeath: BirthDeathInfo | null = null;

  // 提取字号——匹配"字XXX"模式
  const courtesyMatch = description.match(/字([^，。,．\s]{1,10})/);
  if (courtesyMatch) {
    courtesyName = courtesyMatch[1].trim();
  }

  // 提取别号——匹配"号XXX"模式（可能有多号，取第一个）
  const pseudoMatch = description.match(/号([^，。,．\s]{1,20})/);
  if (pseudoMatch) {
    pseudonym = pseudoMatch[1].trim();
  }

  // 提取生卒年——匹配 "(\d{3,4})[~-](\d{3,4})" 或 "(\d{3,4})―(\d{3,4})" 模式
  const yearMatch = description.match(/[（(]?(\d{3,4})\s*[~-―]\s*(\d{3,4})[）)]?/);
  if (yearMatch) {
    const start = parseInt(yearMatch[1], 10);
    const end = parseInt(yearMatch[2], 10);
    if (!isNaN(start) && !isNaN(end) && start > 0 && end > 0) {
      birthDeath = { startYear: start, endYear: end };
    }
  }

  return { courtesyName, pseudonym, birthDeath };
}

/**
 * 加载宋词作者元数据（提取字号、生卒年等结构化数据）
 */
function loadSongAuthorDetails(): Map<string, { courtesyName: string | null; pseudonym: string | null; birthDeath: BirthDeathInfo | null }> {
  const result = new Map<string, { courtesyName: string | null; pseudonym: string | null; birthDeath: BirthDeathInfo | null }>();

  const authorFile = path.join(RAW_DIR, '宋词/author.song.json');
  if (!fs.existsSync(authorFile)) {
    console.log('  宋词作者文件不存在，跳过');
    return result;
  }

  const authors = readJsonFile<any>(authorFile);
  for (const author of authors) {
    if (!author.name) continue;
    const text = author.description || author.short_description || '';
    const details = extractPoetDetails(text);
    result.set(author.name, details);
  }

  console.log(`  加载宋词作者元数据: ${result.size} 人`);
  return result;
}

/**
 * 处理诗经数据
 */
function processShiJing(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理诗经数据...');

  // 诗经文件可能在两个位置
  let filePath = path.join(RAW_DIR, '诗经/shijing.json');
  if (!fs.existsSync(filePath)) {
    filePath = path.join(RAW_DIR, '四书五经/诗经/shijing.json');
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(RAW_DIR, '四书五经/shijing.json');
  }
  if (!fs.existsSync(filePath)) {
    console.log('  诗经文件不存在，跳过');
    return { poets: [], works: [] };
  }

  const poems = readJsonFile<any>(filePath);
  if (poems.length === 0) {
    console.log('  诗经文件为空，跳过');
    return { poets: [], works: [] };
  }

  const poetId = 'poet_shijing';
  const poet: PoetRaw = {
    id: poetId,
    name: '诗经',
    dynasty: DynastyCode.PreQin,
    description: '中国最早的诗歌总集，收录西周初年至春秋中叶（前11世纪至前6世纪）的诗歌305篇，作者多为无名氏。分为风、雅、颂三部分。',
  };

  const works: WorkRaw[] = poems.map((poem: any, index: number) => {
    // content 可能是字符串（含换行）或数组
    let paragraphs: string[];
    if (typeof poem.content === 'string') {
      paragraphs = poem.content.split('\n').filter((p: string) => p.trim().length > 0);
    } else if (Array.isArray(poem.content)) {
      paragraphs = poem.content;
    } else {
      paragraphs = [];
    }

    return {
      id: `work_shijing_${String(index + 1).padStart(3, '0')}`,
      title: poem.title || '无题',
      author: '诗经',
      dynasty: DynastyCode.PreQin,
      genre: GenreCode.Shi,
      paragraphs,
    };
  });

  // 统计各章节
  const chapterCounts = new Map<string, number>();
  for (const poem of poems) {
    const ch = poem.chapter || '未知';
    chapterCounts.set(ch, (chapterCounts.get(ch) || 0) + 1);
  }
  for (const [ch, count] of chapterCounts) {
    console.log(`  ${ch}: ${count} 篇`);
  }

  console.log(`  作品总数: ${works.length}`);

  return { poets: [poet], works };
}

/**
 * 处理楚辞数据
 */
function processChuCi(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理楚辞数据...');

  const filePath = path.join(RAW_DIR, '楚辞/chuci.json');
  if (!fs.existsSync(filePath)) {
    console.log('  楚辞文件不存在，跳过');
    return { poets: [], works: [] };
  }

  const poems = readJsonFile<any>(filePath);
  if (poems.length === 0) {
    console.log('  楚辞文件为空，跳过');
    return { poets: [], works: [] };
  }

  // 收集诗人
  const poetMap = new Map<string, string>();
  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];

  for (let i = 0; i < poems.length; i++) {
    const poem = poems[i];
    const author = poem.author || '佚名';

    if (!poetMap.has(author)) {
      const poetId = `poet_chuci_${author}`;
      poetMap.set(author, poetId);
      poets.push({
        id: poetId,
        name: author,
        dynasty: DynastyCode.PreQin,
        description: `楚辞诗人，代表作《${poem.title}》`,
      });
    }

    works.push({
      id: `work_chuci_${String(i + 1).padStart(3, '0')}`,
      title: poem.title || '无题',
      author,
      dynasty: DynastyCode.PreQin,
      genre: GenreCode.Fu,
      paragraphs: poem.content || [],
    });
  }

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 处理论语数据
 */
function processLunYu(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理论语数据...');

  let filePath = path.join(RAW_DIR, '论语/lunyu.json');
  if (!fs.existsSync(filePath)) {
    filePath = path.join(RAW_DIR, '四书五经/论语/lunyu.json');
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(RAW_DIR, '四书五经/lunyu.json');
  }
  if (!fs.existsSync(filePath)) {
    console.log('  论语文件不存在，跳过');
    return { poets: [], works: [] };
  }

  const chapters = readJsonFile<any>(filePath);
  if (chapters.length === 0) {
    console.log('  论语文件为空，跳过');
    return { poets: [], works: [] };
  }

  const poets: PoetRaw[] = [{
    id: 'poet_lunyu',
    name: '孔子',
    dynasty: DynastyCode.PreQin,
    description: '孔子（前551年－前479年），子姓，孔氏，名丘，字仲尼，鲁国陬邑（今山东曲阜）人，中国古代伟大的思想家、教育家、政治家，儒家学派创始人。',
  }];

  const works: WorkRaw[] = chapters.map((ch: any, i: number) => ({
    id: `work_lunyu_${String(i + 1).padStart(2, '0')}`,
    title: ch.chapter || `篇${i + 1}`,
    author: '孔子',
    dynasty: DynastyCode.PreQin,
    genre: GenreCode.Wen,
    paragraphs: ch.paragraphs || [],
  }));

  console.log(`  章节数: ${works.length}`);

  return { poets, works };
}

/**
 * 处理四书五经数据（大学、中庸、孟子）
 */
function processSiShu(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理四书五经数据...');

  const entries: { file: string; author: string; desc: string; title: string }[] = [
    { file: 'daxue.json', author: '曾参', desc: '曾参（前505年－前435年），字子舆，鲁国南武城（今山东嘉祥）人，儒家重要代表人物，孔子晚年弟子之一。《大学》相传为其所作。', title: '大学' },
    { file: 'zhongyong.json', author: '子思', desc: '子思（前483年－前402年），名孔伋，字子思，孔子之孙。战国初期思想家，儒家代表人物。《中庸》为其代表作。', title: '中庸' },
    { file: 'mengzi.json', author: '孟子', desc: '孟子（约前372年－前289年），名轲，字子舆，邹国（今山东邹城）人。战国时期儒家代表人物，被尊为"亚圣"。', title: '孟子' },
  ];

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];

  for (const entry of entries) {
    const filePath = path.join(RAW_DIR, `四书五经/${entry.file}`);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${entry.file} 不存在，跳过`);
      continue;
    }

    const data = readJsonFile<any>(filePath);
    if (!data || !(data as any).chapter) {
      // mengzi.json 是数组格式
      if (Array.isArray(data) && data.length > 0) {
        if (!poets.find(p => p.name === entry.author)) {
          poets.push({
            id: `poet_${entry.author}`,
            name: entry.author,
            dynasty: DynastyCode.PreQin,
            description: entry.desc,
          });
        }
        data.forEach((ch: any, i: number) => {
          works.push({
            id: `work_${entry.file.replace('.json', '')}_${String(i + 1).padStart(2, '0')}`,
            title: ch.chapter || `${entry.title}篇${i + 1}`,
            author: entry.author,
            dynasty: DynastyCode.PreQin,
            genre: GenreCode.Wen,
            paragraphs: ch.paragraphs || [],
          });
        });
        console.log(`  ${entry.title}: ${data.length} 篇`);
        continue;
      }
      console.log(`  ${entry.file} 格式异常，跳过`);
      continue;
    }

    if (!poets.find(p => p.name === entry.author)) {
      poets.push({
        id: `poet_${entry.author}`,
        name: entry.author,
        dynasty: DynastyCode.PreQin,
        description: entry.desc,
      });
    }

    const d = data as any;
    works.push({
      id: `work_${entry.file.replace('.json', '')}_01`,
      title: entry.title,
      author: entry.author,
      dynasty: DynastyCode.PreQin,
      genre: GenreCode.Wen,
      paragraphs: d.paragraphs || [],
    });

    console.log(`  ${entry.title}: ${(d.paragraphs || []).length} 段`);
  }

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 处理五代诗词数据（花间集 + 南唐词）
 */
function processWudaiPoetry(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理五代诗词数据...');

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];

  // 花间集
  const hjDir = path.join(RAW_DIR, '五代诗词/huajianji');
  if (fs.existsSync(hjDir)) {
    const files = fs.readdirSync(hjDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const poems = readJsonFile<any>(path.join(hjDir, file));
      for (let i = 0; i < poems.length; i++) {
        const p = poems[i];
        if (!p.author) continue;
        const poetId = `poet_wudai_${p.author}`;
        if (!poets.find(po => po.id === poetId)) {
          poets.push({
            id: poetId,
            name: p.author,
            dynasty: DynastyCode.FiveDynasties,
            description: `花间词人`,
          });
        }
        works.push({
          id: `work_wudai_hj_${file.replace('.json', '')}_${String(i + 1).padStart(3, '0')}`,
          title: p.title || p.rhythmic || '无题',
          author: p.author,
          dynasty: DynastyCode.FiveDynasties,
          genre: GenreCode.Ci,
          paragraphs: p.paragraphs || [],
        });
      }
    }
    console.log(`  花间集: ${poets.filter(p => !p.id.startsWith('poet_wudai_nt')).length} 诗人`);
  } else {
    console.log('  花间集目录不存在，跳过');
  }

  // 南唐词
  const ntPoetryPath = path.join(RAW_DIR, '五代诗词/nantang/poetrys.json');
  const ntAuthorsPath = path.join(RAW_DIR, '五代诗词/nantang/authors.json');
  if (fs.existsSync(ntPoetryPath)) {
    const ntAuthors: any[] = fs.existsSync(ntAuthorsPath) ? readJsonFile<any>(ntAuthorsPath) : [];
    const authorDescMap = new Map<string, string>();
    for (const a of ntAuthors) {
      if (a.name) authorDescMap.set(a.name, a.desc || '');
    }

    const poems = readJsonFile<any>(ntPoetryPath);
    for (let i = 0; i < poems.length; i++) {
      const p = poems[i];
      // 南唐词可能不标注作者，需从上下文推断
      let author = p.author || '';
      if (!author) {
        // 有些南唐词有 rhythmic 但无 author，标记为佚名
        author = '佚名';
      }
      const poetId = `poet_wudai_nt_${author}`;
      if (!poets.find(po => po.id === poetId)) {
        poets.push({
          id: poetId,
          name: author,
          dynasty: DynastyCode.FiveDynasties,
          description: authorDescMap.get(author) || `南唐词人`,
        });
      }
      works.push({
        id: `work_wudai_nt_${String(i + 1).padStart(3, '0')}`,
        title: p.rhythmic || p.title || '无题',
        author,
        dynasty: DynastyCode.FiveDynasties,
        genre: GenreCode.Ci,
        paragraphs: p.paragraphs || [],
      });
    }
    console.log(`  南唐词: ${Array.from(new Set(poems.map((p: any) => p.author || '佚名'))).filter(Boolean).length} 诗人, ${poems.length} 首`);
  } else {
    console.log('  南唐词文件不存在，跳过');
  }

  console.log(`  总诗人数量: ${poets.length}`);
  console.log(`  总作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 摊平嵌套的蒙学 JSON 内容为段落数组
 */
function flattenParagraphs(content: any): string[] {
  if (!content) return [];
  if (typeof content === 'string') return [content];
  if (Array.isArray(content)) {
    const result: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        result.push(item);
      } else if (item.paragraphs) {
        result.push(...flattenParagraphs(item.paragraphs));
      } else if (item.content) {
        result.push(...flattenParagraphs(item.content));
      }
    }
    return result;
  }
  return [];
}

/**
 * 处理蒙学数据
 */
function processMengXue(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理蒙学数据...');

  const mDir = path.join(RAW_DIR, '蒙学');

  // { file, title, author, dynasty }
  const bookConfigs: { file: string; title: string; author: string; dynasty: DynastyCode; desc: string }[] = [
    { file: 'sanzijing-new.json', title: '三字经（新版）', author: '王应麟', dynasty: DynastyCode.Song, desc: '王应麟（1223年－1296年），字伯厚，号深宁，南宋著名学者。《三字经》为其所著，是中国古代经典的启蒙读物。' },
    { file: 'sanzijing-traditional.json', title: '三字经（传统版）', author: '王应麟', dynasty: DynastyCode.Song, desc: '三字经传统版。' },
    { file: 'qianziwen.json', title: '千字文', author: '周兴嗣', dynasty: DynastyCode.WeiJin, desc: '周兴嗣，南朝梁代文人。《千字文》成书于梁武帝时期，由一千个不重复的汉字组成。' },
    { file: 'baijiaxing.json', title: '百家姓', author: '佚名', dynasty: DynastyCode.Song, desc: '《百家姓》成书于北宋初期，收录常见姓氏。' },
    { file: 'dizigui.json', title: '弟子规', author: '李毓秀', dynasty: DynastyCode.Qing, desc: '李毓秀（1647年－1729年），字子潜，清代学者。《弟子规》以《论语》中"弟子入则孝"一节为纲。' },
    { file: 'shenglvqimeng.json', title: '声律启蒙', author: '车万育', dynasty: DynastyCode.Qing, desc: '车万育（1632年－1705年），字双亭，号鹤田，清代学者。《声律启蒙》是训练儿童应对、掌握声韵格律的启蒙读物。' },
    { file: 'zhuzijiaxun.json', title: '朱子家训', author: '朱柏庐', dynasty: DynastyCode.Ming, desc: '朱柏庐（1627年－1698年），名用纯，字致一，明末清初理学家。《朱子家训》以修身齐家为宗旨。' },
    { file: 'guwenguanzhi.json', title: '古文观止', author: '吴楚材、吴调侯', dynasty: DynastyCode.Qing, desc: '吴楚材、吴调侯，清初浙江绍兴人。《古文观止》是清康熙年间编选的古代散文选本，收文222篇。' },
  ];

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];
  const seenPoets = new Set<string>();

  for (const cfg of bookConfigs) {
    const fp = path.join(mDir, cfg.file);
    if (!fs.existsSync(fp)) {
      console.log(`  ${cfg.file} 不存在，跳过`);
      continue;
    }

    const data = readJsonFile<any>(fp);
    if (!data) continue;

    // 提取段落
    let paragraphs: string[] = [];
    let foundTitle = cfg.title;

    const d = data as any;
    if (d.paragraphs && Array.isArray(d.paragraphs)) {
      paragraphs = d.paragraphs.map((p: any) => (typeof p === 'string' ? p : ''));
    } else if (d.content && Array.isArray(d.content)) {
      paragraphs = flattenParagraphs(d.content);
    }

    if (paragraphs.length === 0) {
      console.log(`  ${cfg.file}: 无法提取段落，跳过`);
      continue;
    }

    // 诗人去重
    const poetKey = `${cfg.author}_${cfg.dynasty}`;
    if (!seenPoets.has(poetKey) && cfg.author !== '佚名') {
      seenPoets.add(poetKey);
      poets.push({
        id: `poet_mx_${cfg.author}`,
        name: cfg.author,
        dynasty: cfg.dynasty,
        description: cfg.desc,
      });
    }

    // 佚名诗人单独处理
    const actualAuthor = cfg.author === '佚名' ? `佚名（${cfg.title}）` : cfg.author;
    const poetId = cfg.author === '佚名'
      ? `poet_mx_anonymous_${cfg.file.replace('.json', '')}`
      : `poet_mx_${cfg.author}`;

    if (cfg.author === '佚名' && !poets.find(p => p.id === poetId)) {
      poets.push({
        id: poetId,
        name: actualAuthor,
        dynasty: cfg.dynasty,
        description: `${cfg.title}，作者佚名，${cfg.dynasty === DynastyCode.Song ? '宋代' : cfg.dynasty === DynastyCode.Qing ? '清代' : cfg.dynasty === DynastyCode.Ming ? '明代' : ''}启蒙读物。`,
      });
    }

    works.push({
      id: `work_mx_${cfg.file.replace('.json', '')}`,
      title: foundTitle,
      author: actualAuthor,
      dynasty: cfg.dynasty,
      genre: GenreCode.Wen,
      paragraphs,
    });

    console.log(`  ${cfg.title}: ${paragraphs.length} 段 (${cfg.file})`);
  }

  return { poets, works };
}

/**
 * 从 chinese-classical-corpus 接入五经（尚书、礼记、周易、春秋三传）
 */
function processWuJing(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理五经数据（chinese-classical-corpus）...');

  const corpusPath = path.join(__dirname, '../data/raw/chinese-classical-corpus/corpus.jsonl');
  if (!fs.existsSync(corpusPath)) {
    console.log('  corpus.jsonl 不存在，跳过（请先从 HuggingFace 下载）');
    return { poets: [], works: [] };
  }

  const lines = fs.readFileSync(corpusPath, 'utf-8').split('\n').filter(Boolean);

  const sourceConfig: Record<string, { author: string; desc: string; dynasty: DynastyCode; genre: GenreCode }> = {
    '尚书': { author: '佚名（先秦）', desc: '《尚书》又称《书》《书经》，中国第一部古典散文集和最早的历史文献汇编，相传由孔子编撰。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '礼记': { author: '戴圣', desc: '戴圣，西汉学者。《礼记》是战国至秦汉年间儒家学者解释说明经书《仪礼》的文章选集。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '周易': { author: '佚名（周）', desc: '《周易》即《易经》，中国传统思想文化中自然哲学与人文实践的理论根源，群经之首。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '春秋左传': { author: '左丘明', desc: '左丘明（约前502年—约前422年），春秋末年史学家。《左传》是中国第一部叙事详细的编年史著作。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '春秋公羊传': { author: '公羊高', desc: '公羊高，战国时期齐国人，相传为孔子弟子子夏的弟子。《春秋公羊传》为春秋三传之一。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '春秋穀梁传': { author: '穀梁赤', desc: '穀梁赤，战国时期鲁国人，相传为子夏的弟子。《春秋穀梁传》为春秋三传之一。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '孝经': { author: '曾参', desc: '曾参（前505年—前435年），字子舆，孔子弟子。《孝经》为中国古代儒家经典，论述孝道。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
    '尔雅': { author: '佚名', desc: '《尔雅》成书于战国至西汉年间，中国第一部按义类编排的综合性辞书，被认为是训诂学的开山之作。', dynasty: DynastyCode.PreQin, genre: GenreCode.Wen },
  };

  const skipSources = new Set(['诗经', '论语', '孟子', '大学', '中庸']);

  const poets: PoetRaw[] = [];
  const works: WorkRaw[] = [];
  const seenPoets = new Set<string>();

  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      const cfg = sourceConfig[d.source];
      if (!cfg) continue;
      if (skipSources.has(d.source)) continue;

      if (!seenPoets.has(cfg.author)) {
        seenPoets.add(cfg.author);
        poets.push({
          id: `poet_wj_${d.source}`,
          name: cfg.author,
          dynasty: cfg.dynasty,
          description: cfg.desc,
        });
      }

      const textContent = d.content || '';
      const paragraphs = textContent.split('\n').filter((p: string) => p.trim().length > 0);

      works.push({
        id: `work_wj_${d.source}_${d.id}`,
        title: d.chapter || d.source,
        author: cfg.author,
        dynasty: cfg.dynasty,
        genre: cfg.genre,
        paragraphs,
      });
    } catch {
      // skip malformed lines
    }
  }

  const sourceCounts = new Map<string, number>();
  for (const w of works) {
    const src = w.id.split('_')[2];
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
  }
  for (const [src, count] of sourceCounts) {
    console.log(`  ${src}: ${count} 篇/章`);
  }
  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 处理曹操诗集
 */
function processCaoCao(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理曹操诗集...');

  const filePath = path.join(RAW_DIR, '曹操诗集/caocao.json');
  if (!fs.existsSync(filePath)) {
    console.log('  文件不存在，跳过');
    return { poets: [], works: [] };
  }

  const poems = readJsonFile<any>(filePath);

  const poets: PoetRaw[] = [{
    id: 'poet_caocao',
    name: '曹操',
    dynasty: DynastyCode.WeiJin,
    description: '曹操（155年－220年），字孟德，小字阿瞒，沛国谯县（今安徽亳州）人。东汉末年杰出的政治家、军事家、文学家，建安文学的代表人物。',
  }];

  const works: WorkRaw[] = poems.map((p: any, i: number) => ({
    id: `work_caocao_${String(i + 1).padStart(2, '0')}`,
    title: p.title || '无题',
    author: '曹操',
    dynasty: DynastyCode.WeiJin,
    genre: GenreCode.Shi,
    paragraphs: p.paragraphs || [],
  }));

  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 * 处理纳兰性德诗集
 */
function processNalanXingde(): { poets: PoetRaw[]; works: WorkRaw[] } {
  console.log('处理纳兰性德诗集...');

  const filePath = path.join(RAW_DIR, '纳兰性德/纳兰性德诗集.json');
  if (!fs.existsSync(filePath)) {
    console.log('  文件不存在，跳过');
    return { poets: [], works: [] };
  }

  const poems = readJsonFile<any>(filePath);

  const poets: PoetRaw[] = [{
    id: 'poet_nalan',
    name: '纳兰性德',
    dynasty: DynastyCode.Qing,
    description: '纳兰性德（1655年－1685年），叶赫那拉氏，字容若，号楞伽山人。清朝著名词人，被誉为"清词三大家"之一。',
  }];

  const works: WorkRaw[] = poems.map((p: any, i: number) => ({
    id: `work_nalan_${String(i + 1).padStart(3, '0')}`,
    title: p.title || '无题',
    author: p.author || '纳兰性德',
    dynasty: DynastyCode.Qing,
    genre: GenreCode.Ci,
    paragraphs: p.para || p.paragraphs || [],
  }));

  console.log(`  作品数量: ${works.length}`);

  return { poets, works };
}

/**
 */
function main() {
  console.log('=== 文气项目数据处理 ===\n');

  // 加载宋词作者元数据（备于后续匹配）
  const songAuthorDetails = loadSongAuthorDetails();

  // 处理各朝代数据
  const tang = processTangPoetry();
  const song = processSongCi();
  const yuan = processYuanQu();
  const shijing = processShiJing();
  const chuci = processChuCi();
  const lunyu = processLunYu();
  const sishu = processSiShu();
  const wudai = processWudaiPoetry();
  const mengxue = processMengXue();

  const wujing = processWuJing();
  const caocao = processCaoCao();
  const nalan = processNalanXingde();

  // 合并数据
  let allPoets = [
    ...tang.poets, ...song.poets, ...yuan.poets,
    ...shijing.poets, ...chuci.poets,
    ...lunyu.poets, ...sishu.poets,
    ...wudai.poets, ...mengxue.poets,
    ...wujing.poets, ...caocao.poets, ...nalan.poets,
  ];
  let allWorks = [
    ...tang.works, ...song.works, ...yuan.works,
    ...shijing.works, ...chuci.works,
    ...lunyu.works, ...sishu.works,
    ...wudai.works, ...mengxue.works,
    ...wujing.works, ...caocao.works, ...nalan.works,
  ];

  // 去重诗人
  allPoets = deduplicatePoets(allPoets);

  // 去重作品
  const dedupCount = allWorks.length;
  allWorks = deduplicateWorks(allWorks);
  if (dedupCount > allWorks.length) {
    console.log(`  作品去重: ${dedupCount} → ${allWorks.length} (移除 ${dedupCount - allWorks.length} 重复)`);
  }

  // 生成诗人ID映射
  const poetIdMap = generatePoetIdMap(allPoets);

  // 更新作品的诗人ID + 编码清理
  const worksProcessed: WorkProcessed[] = allWorks.map(work => ({
    id: work.id,
    title: cleanEncoding(work.title),
    poetId: poetIdMap.get(work.author) || `poet_unknown_${work.author}`,
    poetName: cleanEncoding(work.author),
    dynasty: work.dynasty,
    genre: work.genre,
    text: cleanTextArray(work.paragraphs).join('\n'),
  }));

  // 生成诗人数据（含字号、生卒年等详情）+ 编码清理
  const poetsProcessed: PoetProcessed[] = allPoets.map(poet => {
    const desc = poet.description || '';
    // 优先从作者元数据中提取详情，其次从 desc 中解析
    let details = extractPoetDetails(desc);

    // 尝试从全唐诗作者详情缓存中匹配
    if (poetDetailCache.has(poet.name)) {
      const cached = poetDetailCache.get(poet.name)!;
      details = {
        courtesyName: details.courtesyName || cached.courtesyName,
        pseudonym: details.pseudonym || cached.pseudonym,
        birthDeath: details.birthDeath || cached.birthDeath,
      };
    }

    // 对宋词诗人，尝试从 author.song.json 元数据中匹配
    if (poet.dynasty === 'SONG' && songAuthorDetails.has(poet.name)) {
      const matched = songAuthorDetails.get(poet.name)!;
      details = {
        courtesyName: details.courtesyName || matched.courtesyName,
        pseudonym: details.pseudonym || matched.pseudonym,
        birthDeath: details.birthDeath || matched.birthDeath,
      };
    }

    return {
      id: poet.id,
      name: cleanEncoding(poet.name),
      dynasty: poet.dynasty,
      biography: cleanEncoding(desc),
      workCount: worksProcessed.filter(w => w.poetId === poet.id).length,
      courtesyName: details.courtesyName,
      pseudonym: details.pseudonym,
      birthDeath: details.birthDeath,
      school: null,
    };
  });

  // 统计信息
  console.log('\n=== 统计信息 ===');
  console.log(`总诗人数: ${poetsProcessed.length}`);
  console.log(`总作品数: ${worksProcessed.length}`);

  // 按朝代统计
  const dynastyStats = new Map<string, number>();
  for (const poet of poetsProcessed) {
    dynastyStats.set(poet.dynasty, (dynastyStats.get(poet.dynasty) || 0) + 1);
  }
  console.log('\n按朝代统计:');
  for (const [dynasty, count] of dynastyStats) {
    console.log(`  ${dynasty}: ${count} 人`);
  }

  // 保存数据
  console.log('\n保存数据...');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'poets.json'),
    JSON.stringify(poetsProcessed, null, 2),
    'utf-8'
  );
  console.log('  已保存 poets.json');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'works.json'),
    JSON.stringify(worksProcessed, null, 2),
    'utf-8'
  );
  console.log('  已保存 works.json');

  // 生成 manifest
  const poetsPath = path.join(OUTPUT_DIR, 'poets.json');
  const worksPath = path.join(OUTPUT_DIR, 'works.json');
  const manifest = {
    version: '2026.06.24',
    algorithmVersion: 'v1.0',
    generatedAt: new Date().toISOString(),
    stats: {
      poetCount: poetsProcessed.length,
      workCount: worksProcessed.length,
      relationCount: 0,
    },
    files: [
      { path: 'poets.json', type: 'poets', size: fs.statSync(poetsPath).size, hash: computeHash(poetsPath) },
      { path: 'works.json', type: 'works', size: fs.statSync(worksPath).size, hash: computeHash(worksPath) },
    ],
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
  console.log('  已保存 manifest.json');

  console.log('\n=== 处理完成 ===');
}

function computeHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 运行主函数
main();
