/**
 * JSON 漫游剧本仓储（构建期产物懒加载）
 *
 * 剧本由 scripts/build-tours.ts 生成到 public/data/processed/tours/：
 * - index.json：漫游列表
 * - {tourId}.json：单条剧本，进入漫游时才拉取
 */

import type { TourRepository } from '@/domain/ports/TourPorts';
import { parseTourScript, type TourScript, type TourSummary } from '@/domain/value-objects/Tour';

const DEFAULT_BASE_PATH = '/data/processed/tours';

function isSummary(value: unknown): value is TourSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.title === 'string';
}

export class JsonTourRepository implements TourRepository {
  private indexCache: TourSummary[] | null = null;
  private readonly scriptCache = new Map<string, TourScript>();

  constructor(private readonly basePath: string = DEFAULT_BASE_PATH) {}

  async listTours(): Promise<TourSummary[]> {
    if (this.indexCache) return this.indexCache;
    try {
      const response = await fetch(`${this.basePath}/index.json`);
      if (!response.ok) return [];
      const payload = await response.json() as { tours?: unknown };
      const tours = Array.isArray(payload.tours) ? payload.tours.filter(isSummary) : [];
      this.indexCache = tours;
      return tours;
    } catch {
      return [];
    }
  }

  async loadTour(tourId: string): Promise<TourScript | null> {
    const cached = this.scriptCache.get(tourId);
    if (cached) return cached;

    try {
      const response = await fetch(`${this.basePath}/${encodeURIComponent(tourId)}.json`);
      if (!response.ok) return null;
      const script = parseTourScript(await response.json());
      this.scriptCache.set(tourId, script);
      return script;
    } catch {
      return null;
    }
  }
}
