/**
 * 关系分类（关系体系 v1）
 *
 * 依据需求将关系类型归入四大类：
 *  - 师承   ：TEACHER_STUDENT
 *  - 好友   ：FRIEND
 *  - 社会关系：SAME_HOMETOWN（同乡）/ INFLUENCE（影响·化用）/ SAME_DYNASTY（同代）
 *  - 其余   ：SAME_SCHOOL（同门·并称）/ CITATION（引用）/ ANTHOLOGY（选本）
 *
 * 颜色与文气现有视觉一致（师承 #c98a4b、好友 #5fb8a8、社会关系 #a8bfd4、其余 #9b7ede）。
 */

export type RelationCategory = '师承' | '好友' | '社会关系' | '其余';

const TYPE_TO_CATEGORY: Record<string, RelationCategory> = {
  TEACHER_STUDENT: '师承',
  FRIEND: '好友',
  SAME_HOMETOWN: '社会关系',
  INFLUENCE: '社会关系',
  SAME_DYNASTY: '社会关系',
  SAME_SCHOOL: '其余',
  CITATION: '其余',
  ANTHOLOGY: '其余',
};

export const CATEGORY_META: Record<RelationCategory, { label: string; color: string; className: string }> = {
  师承: { label: '师承', color: '#c98a4b', className: 'text-[#c98a4b] border-[#c98a4b]/40' },
  好友: { label: '好友', color: '#5fb8a8', className: 'text-[#5fb8a8] border-[#5fb8a8]/40' },
  社会关系: { label: '社会关系', color: '#a8bfd4', className: 'text-[#a8bfd4] border-[#a8bfd4]/40' },
  其余: { label: '其余', color: '#9b7ede', className: 'text-[#9b7ede] border-[#9b7ede]/40' },
};

export function categoryOf(type: string): RelationCategory {
  return TYPE_TO_CATEGORY[type] ?? '其余';
}
