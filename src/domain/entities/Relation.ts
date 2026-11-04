export const RELATION_TYPES = [
  'SAME_DYNASTY',
  'SAME_SCHOOL',
  'CITATION',
  'INFLUENCE',
  'TEACHER_STUDENT',
  'FRIEND',
  'ANTHOLOGY',
  'SAME_HOMETOWN',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

/** 关系证据（构建期挖掘产物，供详情面板溯源展示） */
export interface RelationEvidence {
  /** 证据类别：唱和 / 赠答 / 赠别 / 怀人 / 悼亡 / 并称·X / 流派·X / 同门 / 共现 / 同朝代 / 推断 */
  kind: string;
  /** 赠答作品标题（可多条） */
  titles?: string[];
  /** 共现片段（化用检测） */
  quote?: string;
}

export class Relation {
  constructor(
    public readonly id: string,
    public readonly sourceId: string,
    public readonly targetId: string,
    public readonly relationType: RelationType,
    public readonly weight: number,
    public readonly evidence?: RelationEvidence
  ) {
    if (sourceId === targetId) {
      throw new Error(`关联不可自环: ${sourceId} === ${targetId}`);
    }
    if (weight < 0 || weight > 1) {
      throw new Error(`关联权重超出范围 [0, 1]: ${weight}`);
    }
  }
}
