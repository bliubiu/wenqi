/**
 * 文气数据底座共享核心
 *
 * 所有管道脚本共用（process-data / calculate-scores / build-index / db.ts）：
 * 数据库连接（WAL）、schema 定义、批量插入、按表读取、meta 与管道审计。
 * 数据库（data/wenqi.db）是项目数据的唯一真相源。
 */

import { Database, type SQLQueryBindings } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { dynastyToTable, WORKS_TABLE_NAMES } from '../src/infrastructure/data/shard';

export const SCHEMA_VERSION = '1';
export const DEFAULT_DB = 'data/wenqi.db';
const BATCH_SIZE = 5000;

/* ──── 行结构（camelCase，与前端领域结构对齐） ──── */

export interface PoetRow {
  id: string;
  name: string;
  dynasty: string;
  biography: string | null;
  workCount: number;
  courtesyName: string | null;
  pseudonym: string | null;
  birthDeath: { startYear: number | null; endYear: number | null } | null;
  school: string | null;
}

export interface WorkRow {
  id: string;
  title: string;
  poetId: string;
  poetName: string | null;
  dynasty: string;
  genre: string | null;
  text: string | null;
}

export interface ScoreRow {
  poetId: string;
  poetName: string | null;
  dynasty: string | null;
  threeQi: {
    talent: { value: number | null; factors: unknown; algorithmVersion: string | null };
    popularity: { value: number | null; factors: unknown; algorithmVersion: string | null };
    luck: { value: number | null; factors: unknown; algorithmVersion: string | null };
  };
}

export interface NodeRow {
  id: string;
  refType: string;
  refId: string;
  position: { x: number; y: number; z: number };
  basePosition: { x: number; y: number; z: number };
  dynasty: string | null;
  genre: string | null;
  size: number | null;
  brightness: number | null;
  phase: number | null;
  state: string | null;
  label: string | null;
}

/* ──── 连接与 schema ──── */

export function openDatabase(dbPath: string = DEFAULT_DB, options: { create?: boolean; readonly?: boolean } = {}): Database {
  if (options.create !== false) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath, { create: options.create !== false, readonly: options.readonly === true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  return db;
}

export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE poets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dynasty TEXT NOT NULL,
      biography TEXT,
      work_count INTEGER NOT NULL DEFAULT 0,
      courtesy_name TEXT,
      pseudonym TEXT,
      birth_death TEXT,
      school TEXT
    );
    CREATE INDEX idx_poets_dynasty ON poets(dynasty);
    CREATE TABLE scores (
      poet_id TEXT PRIMARY KEY,
      poet_name TEXT,
      dynasty TEXT,
      talent_value REAL, talent_factors TEXT, talent_version TEXT,
      popularity_value REAL, popularity_factors TEXT, popularity_version TEXT,
      luck_value REAL, luck_factors TEXT, luck_version TEXT
    );
    CREATE INDEX idx_scores_dynasty ON scores(dynasty);
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
      base_x REAL, base_y REAL, base_z REAL,
      dynasty TEXT, genre TEXT,
      size REAL, brightness REAL, phase REAL,
      state TEXT, label TEXT
    );
    CREATE INDEX idx_nodes_ref ON nodes(ref_id);
    CREATE TABLE spatial_index (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE import_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imported_at TEXT NOT NULL,
      stage TEXT NOT NULL,
      dataset_version TEXT,
      source TEXT,
      poets_count INTEGER,
      works_count INTEGER,
      scores_count INTEGER,
      nodes_count INTEGER,
      duration_ms INTEGER
    );
  `);

  for (const table of WORKS_TABLE_NAMES) {
    db.exec(`
      CREATE TABLE ${table} (
        id TEXT PRIMARY KEY,
        poet_id TEXT NOT NULL,
        poet_name TEXT,
        title TEXT NOT NULL,
        genre TEXT,
        text TEXT,
        dynasty TEXT
      );
      CREATE INDEX idx_${table}_poet ON ${table}(poet_id);
    `);
  }
}

/** 删除旧库文件（含 WAL 附属）后全新建库 */
export function rebuildDatabase(dbPath: string = DEFAULT_DB): Database {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const db = openDatabase(dbPath);
  createSchema(db);
  return db;
}

/* ──── 批量插入 ──── */

export function insertRows(db: Database, sql: string, rows: SQLQueryBindings[][]): { inserted: number; skipped: number } {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const stmt = db.prepare(sql);
  let inserted = 0;
  const run = db.transaction((batch: SQLQueryBindings[][]) => {
    for (const row of batch) {
      const result = stmt.run(...row);
      inserted += Number(result.changes);
    }
  });
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    run(rows.slice(i, i + BATCH_SIZE));
  }
  return { inserted, skipped: rows.length - inserted };
}

export function insertPoets(db: Database, poets: PoetRow[]): { inserted: number; skipped: number } {
  return insertRows(
    db,
    'INSERT OR IGNORE INTO poets (id, name, dynasty, biography, work_count, courtesy_name, pseudonym, birth_death, school) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    poets.map((p) => [
      p.id, p.name, p.dynasty, p.biography ?? null, p.workCount ?? 0,
      p.courtesyName ?? null, p.pseudonym ?? null,
      p.birthDeath ? JSON.stringify(p.birthDeath) : null, p.school ?? null,
    ])
  );
}

/** 作品按诗人朝代归表写入；未提供映射时按作品自身朝代 */
export function insertWorks(db: Database, works: WorkRow[], poetDynasty?: Map<string, string>): Record<string, number> {
  const byTable = new Map<string, SQLQueryBindings[][]>();
  for (const w of works) {
    const table = dynastyToTable(poetDynasty?.get(w.poetId) ?? w.dynasty);
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table)!.push([
      w.id, w.poetId, w.poetName ?? null, w.title, w.genre ?? null, w.text ?? null, w.dynasty ?? null,
    ]);
  }
  const counts: Record<string, number> = {};
  for (const [table, rows] of byTable) {
    const result = insertRows(
      db,
      `INSERT OR IGNORE INTO ${table} (id, poet_id, poet_name, title, genre, text, dynasty) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      rows
    );
    counts[table] = result.inserted;
  }
  return counts;
}

export function insertScores(db: Database, scores: ScoreRow[]): { inserted: number; skipped: number } {
  const topVersion = (s: ScoreRow): string | null => (s.threeQi as any)?.algorithmVersion ?? null;
  return insertRows(
    db,
    `INSERT OR IGNORE INTO scores (poet_id, poet_name, dynasty, talent_value, talent_factors, talent_version, popularity_value, popularity_factors, popularity_version, luck_value, luck_factors, luck_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    scores.map((s) => [
      s.poetId, s.poetName ?? null, s.dynasty ?? null,
      s.threeQi?.talent?.value ?? null, s.threeQi?.talent?.factors != null ? JSON.stringify(s.threeQi.talent.factors) : null, s.threeQi?.talent?.algorithmVersion ?? topVersion(s),
      s.threeQi?.popularity?.value ?? null, s.threeQi?.popularity?.factors != null ? JSON.stringify(s.threeQi.popularity.factors) : null, s.threeQi?.popularity?.algorithmVersion ?? topVersion(s),
      s.threeQi?.luck?.value ?? null, s.threeQi?.luck?.factors != null ? JSON.stringify(s.threeQi.luck.factors) : null, s.threeQi?.luck?.algorithmVersion ?? topVersion(s),
    ])
  );
}

export function insertNodes(db: Database, nodes: NodeRow[]): { inserted: number; skipped: number } {
  return insertRows(
    db,
    `INSERT OR IGNORE INTO nodes (id, ref_type, ref_id, x, y, z, base_x, base_y, base_z, dynasty, genre, size, brightness, phase, state, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    nodes.map((n) => [
      n.id, n.refType, n.refId,
      n.position.x, n.position.y, n.position.z,
      n.basePosition?.x ?? null, n.basePosition?.y ?? null, n.basePosition?.z ?? null,
      n.dynasty ?? null, n.genre ?? null, n.size ?? null, n.brightness ?? null, n.phase ?? null, n.state ?? null, n.label ?? null,
    ])
  );
}

/* ──── 读取 ──── */

export function loadPoets(db: Database): PoetRow[] {
  const rows = db
    .query('SELECT id, name, dynasty, biography, work_count AS workCount, courtesy_name AS courtesyName, pseudonym, birth_death AS birthDeathRaw, school FROM poets')
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    dynasty: r.dynasty,
    biography: r.biography ?? null,
    workCount: r.workCount ?? 0,
    courtesyName: r.courtesyName ?? null,
    pseudonym: r.pseudonym ?? null,
    birthDeath: r.birthDeathRaw ? JSON.parse(r.birthDeathRaw) : null,
    school: r.school ?? null,
  }));
}

/** 跨全部分表读取作品（UNION ALL，保持分表顺序与行序） */
export function loadAllWorks(db: Database): WorkRow[] {
  const unionSql = WORKS_TABLE_NAMES.map(
    (t) => `SELECT id, title, poet_id AS poetId, poet_name AS poetName, dynasty, genre, text FROM ${t}`
  ).join(' UNION ALL ');
  return db.query(unionSql).all() as unknown as WorkRow[];
}

export function loadScores(db: Database): ScoreRow[] {
  const rows = db
    .query(`SELECT poet_id AS poetId, poet_name AS poetName, dynasty,
      talent_value AS talentValue, talent_factors AS talentFactors, talent_version AS talentVersion,
      popularity_value AS popularityValue, popularity_factors AS popularityFactors, popularity_version AS popularityVersion,
      luck_value AS luckValue, luck_factors AS luckFactors, luck_version AS luckVersion
      FROM scores`)
    .all() as any[];
  return rows.map((r) => ({
    poetId: r.poetId,
    poetName: r.poetName ?? null,
    dynasty: r.dynasty ?? null,
    threeQi: {
      talent: { value: r.talentValue, factors: r.talentFactors ? JSON.parse(r.talentFactors) : null, algorithmVersion: r.talentVersion },
      popularity: { value: r.popularityValue, factors: r.popularityFactors ? JSON.parse(r.popularityFactors) : null, algorithmVersion: r.popularityVersion },
      luck: { value: r.luckValue, factors: r.luckFactors ? JSON.parse(r.luckFactors) : null, algorithmVersion: r.luckVersion },
    },
  }));
}

export function loadNodes(db: Database): NodeRow[] {
  return db
    .query(`SELECT id, ref_type AS refType, ref_id AS refId,
      x, y, z, base_x AS baseX, base_y AS baseY, base_z AS baseZ,
      dynasty, genre, size, brightness, phase, state, label FROM nodes`)
    .all()
    .map((r: any) => ({
      id: r.id,
      refType: r.refType,
      refId: r.refId,
      position: { x: r.x, y: r.y, z: r.z },
      basePosition: { x: r.baseX ?? r.x, y: r.baseY ?? r.y, z: r.baseZ ?? r.z },
      dynasty: r.dynasty ?? null,
      genre: r.genre ?? null,
      size: r.size ?? null,
      brightness: r.brightness ?? null,
      phase: r.phase ?? null,
      state: r.state ?? null,
      label: r.label ?? null,
    }));
}

/** 读取空间索引（kdTree 序列化 JSON + 元数据），未构建时返回 null */
export function loadSpatialIndex(db: Database): unknown {
  const row = db.query('SELECT data FROM spatial_index WHERE id = 1').get() as { data: string } | null;
  return row ? JSON.parse(row.data) : null;
}

/* ──── meta 与管道审计 ──── */

export function setMeta(db: Database, key: string, value: string | number): void {
  db.query('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(value));
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.query('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | null;
  return row?.value ?? null;
}

export interface StageLog {
  stage: string;
  datasetVersion?: string | null;
  source?: string | null;
  poetsCount?: number | null;
  worksCount?: number | null;
  scoresCount?: number | null;
  nodesCount?: number | null;
  durationMs?: number | null;
}

export function logStage(db: Database, entry: StageLog): void {
  db.query(
    `INSERT INTO import_log (imported_at, stage, dataset_version, source, poets_count, works_count, scores_count, nodes_count, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    entry.stage,
    entry.datasetVersion ?? null,
    entry.source ?? null,
    entry.poetsCount ?? null,
    entry.worksCount ?? null,
    entry.scoresCount ?? null,
    entry.nodesCount ?? null,
    entry.durationMs ?? null
  );
}
