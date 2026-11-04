/**
 * 主题漫游端口
 *
 * 剧本数据通过端口读取，便于应用层测试时替换为内存实现。
 */

import type { TourScript, TourSummary } from '../value-objects/Tour';

export interface TourRepository {
  listTours(): Promise<TourSummary[]>;
  loadTour(tourId: string): Promise<TourScript | null>;
}
