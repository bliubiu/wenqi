/**
 * 主题漫游剧本
 *
 * 剧本为构建期产物（public/data/processed/tours/{tourId}.json），
 * 本文负责结构校验与索引摘要生成，供应用层与基础设施层共用。
 */

export type TourStepType = 'focus' | 'cluster';

export interface TourStep {
  type: TourStepType;
  /** focus 步骤的目标诗人 ID（与节点 refId 一致） */
  refId?: string;
  /** cluster 步骤的朝代键（如 TANG / SONG） */
  clusterKey?: string;
  /** 步骤自动推进时长（毫秒） */
  durationMs: number;
  /** 字幕解说 */
  caption: string;
  /** 可选朗读文本，缺省时不朗读 */
  narration?: string;
  /** 焦点对象的显示名（诗人姓名或朝代名） */
  label?: string;
}

export interface TourScript {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}

export interface TourSummary {
  id: string;
  title: string;
  description: string;
  stepCount: number;
  durationMs: number;
}

/** 步骤默认时长（剧本未给出时兜底） */
export const DEFAULT_STEP_DURATION_MS = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown, field: string, required = true): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (!required && (value === undefined || value === null)) return '';
  throw new Error(`漫游剧本格式不合规：字段 ${field} 必须为非空字符串`);
}

function parseStep(raw: unknown, index: number): TourStep {
  if (!isRecord(raw)) throw new Error(`漫游剧本格式不合规：第 ${index + 1} 步不是对象`);

  const type = raw.type;
  if (type !== 'focus' && type !== 'cluster') {
    throw new Error(`漫游剧本格式不合规：第 ${index + 1} 步 type 必须为 focus 或 cluster`);
  }

  const duration = typeof raw.durationMs === 'number' && raw.durationMs > 0
    ? raw.durationMs
    : DEFAULT_STEP_DURATION_MS;

  const step: TourStep = {
    type,
    durationMs: duration,
    caption: readString(raw.caption, `steps[${index}].caption`),
  };

  if (type === 'focus') {
    step.refId = readString(raw.refId, `steps[${index}].refId`);
  } else {
    step.clusterKey = readString(raw.clusterKey, `steps[${index}].clusterKey`);
  }

  if (raw.narration !== undefined && raw.narration !== null && raw.narration !== '') {
    step.narration = String(raw.narration);
  }
  if (raw.label !== undefined && raw.label !== null && raw.label !== '') {
    step.label = String(raw.label);
  }
  return step;
}

/** 校验并归一化剧本；格式不合规时抛出中文错误 */
export function parseTourScript(raw: unknown): TourScript {
  if (!isRecord(raw)) throw new Error('漫游剧本格式不合规：根节点不是对象');
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error('漫游剧本格式不合规：steps 必须为非空数组');
  }

  return {
    id: readString(raw.id, 'id'),
    title: readString(raw.title, 'title'),
    description: readString(raw.description, 'description', false),
    steps: raw.steps.map(parseStep),
  };
}

/** 生成漫游索引入口摘要 */
export function toTourSummary(script: TourScript): TourSummary {
  return {
    id: script.id,
    title: script.title,
    description: script.description,
    stepCount: script.steps.length,
    durationMs: script.steps.reduce((sum, step) => sum + step.durationMs, 0),
  };
}
