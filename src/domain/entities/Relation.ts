export const RELATION_TYPES = [
  'SAME_DYNASTY',
  'SAME_SCHOOL',
  'CITATION',
  'INFLUENCE',
  'TEACHER_STUDENT',
  'FRIEND',
  'ANTHOLOGY',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export class Relation {
  constructor(
    public readonly id: string,
    public readonly sourceId: string,
    public readonly targetId: string,
    public readonly relationType: RelationType,
    public readonly weight: number
  ) {
    if (sourceId === targetId) {
      throw new Error(`关联不可自环: ${sourceId} === ${targetId}`);
    }
    if (weight < 0 || weight > 1) {
      throw new Error(`关联权重超出范围 [0, 1]: ${weight}`);
    }
  }
}
