/**
 * 拉取 cnkgraph 区划经纬度
 *
 * 流程：
 * 1. 从诗人籍贯数据（data/processed/cnkgraph/poet-hometowns.json）收集唯一 RegionId
 * 2. 逐个请求 /api/map/region/{RegionId}，解析 Latitude / Longitude 与历史地名
 * 3. 结果缓存到 regions.jsonl（断点续传），最终输出 regions.json
 *
 * 用法：
 *   bun run scripts/fetch-regions.ts
 *   bun run scripts/fetch-regions.ts --limit 5 --interval 6000
 *   bun run scripts/fetch-regions.ts --refresh
 *
 * 说明：cnkgraph 全站限流严格，默认串行 + 6 秒间隔 + 429 指数退避。
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'https://open.cnkgraph.com';
const CACHE_DIR = 'data/processed/cnkgraph';
const HOMETOWN_FILE = path.join(CACHE_DIR, 'poet-hometowns.json');
const REGION_CACHE = path.join(CACHE_DIR, 'regions.jsonl');
const OUTPUT_FILE = path.join(CACHE_DIR, 'regions.json');

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 8;
const DEFAULT_INTERVAL_MS = 6000;
const RATE_LIMIT_WAIT_MS = 30_000;

interface RegionHistory {
  name: string;
  latitude: number | null;
  longitude: number | null;
  beginYear: number | null;
  endYear: number | null;
}

interface RegionItem {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  parentId: string | null;
  history: RegionHistory[];
}

/* ──── 日志 ──── */

function log(level: 'DEBUG' | 'INFO' | 'ERROR', message: string): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  console.log(`[${stamp}] [${level}] [${process.pid}] [fetch-regions] - ${message}`);
}

/* ──── 工具 ──── */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseArgs(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      options[argv[i].slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return options;
}

/** 收集籍贯数据中的唯一区划代码 */
function collectRegionIds(): string[] {
  if (!fs.existsSync(HOMETOWN_FILE)) {
    throw new Error(`籍贯数据不存在: ${HOMETOWN_FILE}（请先运行 data:hometown）`);
  }
  const raw = JSON.parse(fs.readFileSync(HOMETOWN_FILE, 'utf8'));
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  const ids = new Set<string>();
  for (const item of items) {
    for (const hometown of item.hometowns ?? []) {
      if (hometown?.RegionId) ids.add(hometown.RegionId);
    }
  }
  return [...ids].sort();
}

/** 读取缓存（以行为单位，最后一行为空则忽略） */
function loadCache(): Map<string, RegionItem> {
  const cache = new Map<string, RegionItem>();
  if (!fs.existsSync(REGION_CACHE)) return cache;
  for (const line of fs.readFileSync(REGION_CACHE, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text) continue;
    try {
      const item = JSON.parse(text) as RegionItem;
      if (item.id) cache.set(item.id, item);
    } catch {
      // 跳过损坏行，保留可续传部分
    }
  }
  return cache;
}

/** 请求单个区划；返回 null 表示该区划不存在（404） */
async function fetchRegion(id: string): Promise<RegionItem | null> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${API_BASE}/api/map/region/${encodeURIComponent(id)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 404) {
        log('ERROR', `区划 ${id} 不存在（HTTP 404），跳过`);
        return null;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? 0);
        const waitMs = Math.max(retryAfter > 0 ? retryAfter * 1000 : 0, RATE_LIMIT_WAIT_MS * attempt);
        log('ERROR', `触发限流，等待 ${Math.round(waitMs / 1000)} 秒后重试（第 ${attempt} 次）`);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as Array<{ Region?: Record<string, unknown> }>;
      const region = payload?.[0]?.Region;
      if (!region) {
        log('ERROR', `区划 ${id} 返回空数据，跳过`);
        return null;
      }

      const historyRaw = Array.isArray(region.HistoryRecords) ? region.HistoryRecords : [];
      const history: RegionHistory[] = historyRaw
        .map((record) => {
          const row = record as Record<string, unknown>;
          return {
            name: String(row.TName ?? row.Name ?? ''),
            latitude: typeof row.Latitude === 'number' ? row.Latitude : null,
            longitude: typeof row.Longitude === 'number' ? row.Longitude : null,
            beginYear: typeof row.BeginYear === 'number' ? row.BeginYear : null,
            endYear: typeof row.EndYear === 'number' ? row.EndYear : null,
          };
        })
        .filter((row) => row.name);

      return {
        id,
        name: String(region.Name ?? id),
        latitude: typeof region.Latitude === 'number' ? region.Latitude : null,
        longitude: typeof region.Longitude === 'number' ? region.Longitude : null,
        parentId: typeof region.ParentId === 'string' ? region.ParentId : null,
        history,
      };
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        log('ERROR', `区划 ${id} 请求失败（已重试 ${MAX_RETRIES} 次）：${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
      log('ERROR', `区划 ${id} 请求失败：${error instanceof Error ? error.message : String(error)}，稍后重试`);
      await sleep(RATE_LIMIT_WAIT_MS * attempt);
    }
  }
  return null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const interval = Number(options.interval ?? DEFAULT_INTERVAL_MS);
  const limit = options.limit ? Number(options.limit) : Infinity;
  const refresh = options.refresh === 'true';

  ensureDir(CACHE_DIR);

  const ids = collectRegionIds();
  log('INFO', `籍贯数据共 ${ids.length} 个唯一区划`);

  const cache = refresh ? new Map<string, RegionItem>() : loadCache();
  if (refresh && fs.existsSync(REGION_CACHE)) {
    fs.writeFileSync(REGION_CACHE, '', 'utf8');
  }
  log('INFO', `已有缓存 ${cache.size} 个，待请求 ${ids.filter((id) => !cache.has(id)).length} 个`);

  const pending = ids.filter((id) => !cache.has(id)).slice(0, limit);
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i];
    const item = await fetchRegion(id);
    if (item) {
      cache.set(id, item);
      fs.appendFileSync(REGION_CACHE, `${JSON.stringify(item)}\n`, 'utf8');
    }
    log('INFO', `已请求 ${i + 1}/${pending.length}（${id}）`);
    if (i + 1 < pending.length) await sleep(interval);
  }

  const items = [...cache.values()].sort((a, b) => a.id.localeCompare(b.id));
  const withCoord = items.filter((item) => item.latitude !== null && item.longitude !== null).length;
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2),
    'utf8'
  );
  log('INFO', `输出：${OUTPUT_FILE}（${items.length} 条，其中有坐标 ${withCoord} 条）`);
}

main().catch((error) => {
  log('ERROR', `任务失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
