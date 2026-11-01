/**
 * 作品分片共享逻辑
 *
 * SQLite 底座按朝代分表切片写入，前端按诗人分片 JSON 消费。
 * 本模块是两侧共用的唯一映射真相源：
 * - 表名映射：scripts/db.ts 导入时使用
 * - 分片路径：DataLoader 按需加载分片时使用
 */

/** 朝代 → SQLite 作品分表名 */
export const DYNASTY_TABLES: Record<string, string> = {
  PRE_QIN: 'works_pre_qin',
  HAN: 'works_han',
  WEI_JIN: 'works_wei_jin',
  TANG: 'works_tang',
  FIVE_DYNASTIES: 'works_five_dynasties',
  SONG: 'works_song',
  YUAN: 'works_yuan',
  MING: 'works_ming',
  QING: 'works_qing',
  MODERN: 'works_modern',
};

/** 未知朝代的作品兜底分表 */
export const WORKS_FALLBACK_TABLE = 'works_other';

export function dynastyToTable(dynasty: string): string {
  return DYNASTY_TABLES[dynasty] ?? WORKS_FALLBACK_TABLE;
}

/** 全部分表名（含兜底表） */
export const WORKS_TABLE_NAMES: string[] = [
  ...Object.values(DYNASTY_TABLES),
  WORKS_FALLBACK_TABLE,
];

/** 分片桶数量：取诗人 ID 中 UUID 的前两位十六进制字符，共 256 桶 */
export const SHARD_BUCKET_COUNT = 256;

function hashBucket(poetId: string): string {
  let hash = 5381;
  for (let i = 0; i < poetId.length; i++) {
    hash = ((hash << 5) + hash + poetId.charCodeAt(i)) >>> 0;
  }
  return (hash % SHARD_BUCKET_COUNT).toString(16).padStart(2, '0');
}

/** 计算诗人分片桶：poetId 形如 poet_{uuid}，取 uuid 首两位十六进制；格式异常时哈希兜底 */
export function shardBucket(poetId: string): string {
  const prefix = poetId.slice(5, 7);
  return /^[0-9a-f]{2}$/.test(prefix) ? prefix : hashBucket(poetId);
}

/** 诗人作品分片在数据目录下的相对路径 */
export function workShardRelPath(poetId: string): string {
  return `works/poet/${shardBucket(poetId)}/${poetId}.json`;
}

/** 诗人作品分片文件结构（与单体 works.json 同构的条目字段） */
export interface WorkShardData {
  poetId: string;
  dynasty: string;
  count: number;
  works: Array<{
    id: string;
    title: string;
    poetId: string;
    poetName: string;
    dynasty: string;
    genre: string;
    text: string;
  }>;
}
