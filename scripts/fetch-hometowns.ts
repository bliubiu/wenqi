/**
 * 拉取 cnkgraph 诗人籍贯
 *
 * 流程：
 * 1. 按朝代拉取作者清单（缓存到 data/processed/cnkgraph/authors-*.json）
 * 2. 用「姓名 + 朝代 + 生卒年」匹配本地 poets 表
 * 3. 逐个请求人物档案，抽取 Hometown（籍贯）
 * 4. 输出 data/processed/cnkgraph/poet-hometowns.json
 *
 * 用法：
 *   bun run scripts/fetch-hometowns.ts
 *   bun run scripts/fetch-hometowns.ts --limit 5 --dynasty TANG,SONG
 *   bun run scripts/fetch-hometowns.ts --refresh
 *
 * 说明：仅用于非商业用途的 cnkgraph 开放数据；CBDB 留作后续校验。
 */

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { toSimplified } from '../src/infrastructure/text/t2s';

const API_BASE = 'https://open.cnkgraph.com';
const CACHE_DIR = 'data/processed/cnkgraph';
const PEOPLE_CACHE = path.join(CACHE_DIR, 'people.jsonl');
const OUTPUT_FILE = path.join(CACHE_DIR, 'poet-hometowns.json');
const DB_PATH = 'data/wenqi.db';

const CONCURRENCY = 1;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 8;
const REQUEST_INTERVAL_MS = 1200;
const RATE_LIMIT_WAIT_MS = 30_000;

/** 占位作者名（无真实身份，不参与匹配） */
const PLACEHOLDER_NAMES = new Set(['不详', '不詳', '佚名', '无名氏', '無名氏', '阙名', '闕名', '无名', '無名']);

/** 本地朝代码 → cnkgraph 朝代名称（五代十国作者并入宋朝清单） */
const DYNASTY_MAP: Record<string, string> = {
  TANG: '唐朝',
  SONG: '宋朝',
  YUAN: '元朝',
  MING: '明朝',
  QING: '清朝',
  PRE_QIN: '先秦',
  HAN: '汉朝',
  WEI_JIN: '魏晋',
  FIVE_DYNASTIES: '宋朝',
  MODERN: '近现代',
};

interface CnkgAuthor {
  Id: number;
  Name: string;
  Life: string;
  WritingCount: number;
}

interface HometownItem {
  RegionId: string;
  Name: string;
}

interface PersonLite {
  aid: number;
  name: string;
  dynasty: string;
  birthYear: number | null;
  deathYear: number | null;
  hometowns: HometownItem[];
}

interface LocalPoet {
  id: string;
  name: string;
  dynasty: string;
  birthDeath: { startYear: number | null; endYear: number | null } | null;
  workCount: number;
}

/* ──── 日志 ──── */

function log(level: 'DEBUG' | 'INFO' | 'ERROR', message: string): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  console.log(`[${stamp}] [${level}] [${process.pid}] [fetch-hometowns] - ${message}`);
}

/* ──── 工具 ──── */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nameKey(name: string): string {
  return toSimplified((name || '').trim()).replace(/\s+/g, '');
}

/** 解析 cnkgraph 生卒年文本，如「556 — 638」「前140 — 前89」 */
function parseLife(life: string): { start: number | null; end: number | null } {
  const text = (life || '').trim();
  if (!text) return { start: null, end: null };
  const match = text.match(/(前?\d{3,4})[^\d]{0,4}(前?\d{3,4})/);
  if (!match) return { start: null, end: null };
  const toYear = (value: string) => (value.startsWith('前') ? -Number(value.slice(1)) : Number(value));
  return { start: toYear(match[1]), end: toYear(match[2]) };
}

async function fetchJson(url: string, retries = MAX_RETRIES): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? 0);
        const waitMs = Math.max(retryAfter > 0 ? retryAfter * 1000 : 0, RATE_LIMIT_WAIT_MS * attempt);
        log('ERROR', `触发限流，等待 ${Math.round(waitMs / 1000)} 秒后重试（第 ${attempt} 次）`);
        await sleep(waitMs);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(500 * attempt);
    }
  }
  throw new Error('请求失败');
}

/** 并发池：限制同时请求数 */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ──── 数据源 ──── */

async function loadDynastyAuthors(dynastyName: string, refresh: boolean): Promise<CnkgAuthor[]> {
  const cacheFile = path.join(CACHE_DIR, `authors-${dynastyName}.json`);
  if (!refresh && fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    return cached.authors ?? [];
  }
  const data = await fetchJson(`${API_BASE}/api/writing/${encodeURIComponent(dynastyName)}`);
  const node = data?.AuthorsByDynasty ?? {};
  const authors: CnkgAuthor[] = [];
  for (const group of node.Dynasties ?? []) {
    for (const author of group.Authors ?? []) {
      authors.push({
        Id: author.Id,
        Name: author.Name ?? '',
        Life: author.Life ?? '',
        WritingCount: author.WritingCount ?? 0,
      });
    }
  }
  ensureDir(CACHE_DIR);
  fs.writeFileSync(cacheFile, JSON.stringify({ dynasty: dynastyName, authorCount: authors.length, authors }, null, 0));
  log('INFO', `${dynastyName} 作者清单已缓存：${authors.length} 位`);
  return authors;
}

function loadLocalPoets(filterDynasty?: Set<string>): LocalPoet[] {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .query('SELECT id, name, dynasty, birth_death AS birthDeath, work_count AS workCount FROM poets')
    .all() as Array<{ id: string; name: string; dynasty: string; birthDeath: string | null; workCount: number }>;
  db.close();
  return rows
    .filter((row) => (filterDynasty ? filterDynasty.has(row.dynasty) : true))
    .map((row) => ({
      id: row.id,
      name: row.name,
      dynasty: row.dynasty,
      birthDeath: row.birthDeath ? JSON.parse(row.birthDeath) : null,
      workCount: row.workCount ?? 0,
    }));
}

function loadPeopleCache(): Map<number, PersonLite> {
  const cache = new Map<number, PersonLite>();
  if (!fs.existsSync(PEOPLE_CACHE)) return cache;
  const lines = fs.readFileSync(PEOPLE_CACHE, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as PersonLite;
      if (item.aid > 0) cache.set(item.aid, item);
    } catch {
      // 跳过损坏行
    }
  }
  return cache;
}

function appendPeopleCache(item: PersonLite): void {
  ensureDir(CACHE_DIR);
  fs.appendFileSync(PEOPLE_CACHE, JSON.stringify(item) + '\n');
}

/** 匹配候选作者：优先生卒年接近，其次作品数最多 */
function pickAuthor(poet: LocalPoet, candidates: CnkgAuthor[]): CnkgAuthor | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const birth = poet.birthDeath?.startYear ?? null;
  if (birth !== null) {
    const scored = candidates
      .map((author) => ({ author, life: parseLife(author.Life) }))
      .filter(({ life }) => life.start !== null)
      .map(({ author, life }) => ({ author, diff: Math.abs((life.start as number) - birth) }))
      .filter(({ diff }) => diff <= 10)
      .sort((a, b) => a.diff - b.diff);
    if (scored.length > 0) return scored[0].author;
  }
  return [...candidates].sort((a, b) => b.WritingCount - a.WritingCount)[0];
}

function toPersonLite(profile: any): PersonLite | null {
  if (!profile?.Id) return null;
  const hometowns: HometownItem[] = Array.isArray(profile.Hometown)
    ? profile.Hometown.map((item: any) => ({ RegionId: item.RegionId ?? '', Name: item.Name ?? '' })).filter((item: HometownItem) => item.RegionId)
    : [];
  return {
    aid: profile.Id,
    name: profile.Name ?? '',
    dynasty: profile.Dynasty ?? '',
    birthYear: typeof profile.BirthYear === 'number' ? profile.BirthYear : null,
    deathYear: typeof profile.DeathYear === 'number' ? profile.DeathYear : null,
    hometowns,
  };
}

/* ──── 主流程 ──── */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith('--limit'));
  const limit = limitArg ? Number(limitArg.split('=')[1] ?? args[args.indexOf(limitArg) + 1]) : 0;
  const dynastyArg = args.find((arg) => arg.startsWith('--dynasty'));
  const dynastyFilter = dynastyArg
    ? new Set((dynastyArg.split('=')[1] ?? args[args.indexOf(dynastyArg) + 1] ?? '').split(',').filter(Boolean))
    : undefined;
  const refresh = args.includes('--refresh');
  const minWorksArg = args.find((arg) => arg.startsWith('--min-works'));
  const minWorks = minWorksArg ? Number(minWorksArg.split('=')[1] ?? args[args.indexOf(minWorksArg) + 1]) : 0;
  const intervalArg = args.find((arg) => arg.startsWith('--interval'));
  const intervalMs = intervalArg
    ? Number(intervalArg.split('=')[1] ?? args[args.indexOf(intervalArg) + 1]) || REQUEST_INTERVAL_MS
    : REQUEST_INTERVAL_MS;

  ensureDir(CACHE_DIR);
  const poets = loadLocalPoets(dynastyFilter);
  log('INFO', `本地诗人：${poets.length} 位`);

  const dynastyNames = Array.from(new Set(poets.map((poet) => DYNASTY_MAP[poet.dynasty]).filter(Boolean)));
  const authorsByDynasty = new Map<string, CnkgAuthor[]>();
  for (const dynastyName of dynastyNames) {
    const authors = await loadDynastyAuthors(dynastyName, refresh);
    authorsByDynasty.set(dynastyName, authors);
  }

  const indexByName = new Map<string, Array<{ dynastyName: string; author: CnkgAuthor }>>();
  for (const [dynastyName, authors] of authorsByDynasty) {
    for (const author of authors) {
      if (!author.Id || author.Id <= 0) continue;
      if (PLACEHOLDER_NAMES.has(author.Name.trim())) continue;
      const key = nameKey(author.Name);
      if (!key) continue;
      const bucket = indexByName.get(key) ?? [];
      bucket.push({ dynastyName, author });
      indexByName.set(key, bucket);
    }
  }

  const matched: Array<{ poet: LocalPoet; author: CnkgAuthor }> = [];
  let unmatched = 0;
  for (const poet of poets) {
    const key = nameKey(poet.name);
    const bucket = indexByName.get(key);
    if (!bucket) {
      unmatched++;
      continue;
    }
    const targetDynasty = DYNASTY_MAP[poet.dynasty];
    const sameDynasty = bucket.filter((item) => item.dynastyName === targetDynasty);
    const chosen = pickAuthor(poet, sameDynasty.length > 0 ? sameDynasty.map((item) => item.author) : bucket.map((item) => item.author));
    if (chosen) {
      matched.push({ poet, author: chosen });
    } else {
      unmatched++;
    }
  }
  log('INFO', `姓名匹配：命中 ${matched.length}，未命中 ${unmatched}`);

  const target = minWorks > 0 ? matched.filter(({ poet }) => poet.workCount >= minWorks) : matched;
  const pending = limit > 0 ? target.slice(0, limit) : target;
  const peopleCache = loadPeopleCache();
  const missing = pending.filter(({ author }) => !peopleCache.has(author.Id));
  log('INFO', `待请求人物档案：${missing.length}（缓存命中 ${pending.length - missing.length}）`);

  let done = 0;
  await mapLimit(missing, CONCURRENCY, async ({ author }) => {
    try {
      const data = await fetchJson(`${API_BASE}/api/people/${author.Id}`);
      const lite = toPersonLite(data?.Person?.Profile);
      if (lite) {
        peopleCache.set(lite.aid, lite);
        appendPeopleCache(lite);
      }
    } catch (error) {
      log('ERROR', `人物 ${author.Id}（${author.Name}）请求失败：${(error as Error).message}`);
    }
    done++;
    if (done % 200 === 0) log('INFO', `已请求 ${done}/${missing.length}`);
    await sleep(intervalMs);
  });

  const items = pending.map(({ poet, author }) => {
    const person = peopleCache.get(author.Id);
    return {
      poetId: poet.id,
      name: poet.name,
      dynasty: poet.dynasty,
      authorId: author.Id,
      authorName: author.Name,
      life: author.Life,
      hometowns: person?.hometowns ?? [],
    };
  });

  const withHometown = items.filter((item) => item.hometowns.length > 0).length;
  const now = new Date();
  const version = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const output = {
    version,
    source: API_BASE,
    generatedAt: now.toISOString(),
    total: poets.length,
    matched: matched.length,
    withHometown,
    items,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  log('INFO', `输出：${OUTPUT_FILE}（${items.length} 条，其中有籍贯 ${withHometown} 条）`);
}

main().catch((error) => {
  log('ERROR', `执行失败：${error?.message ?? error}`);
  process.exit(1);
});
