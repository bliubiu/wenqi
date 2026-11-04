/**
 * 经典演绎版本元数据
 *
 * 仅记录曲目与作品对应关系，不包含任何音频文件。
 * 录音版权归表演者与录音制作者所有，需由用户自行导入合法持有的音频。
 */

export interface KnownRecitation {
  keywords: string[];
  songTitle: string;
  performer: string;
}

export const KNOWN_RECITATIONS: KnownRecitation[] = [
  { keywords: ['水调歌头'], songTitle: '但愿人长久', performer: '邓丽君' },
  { keywords: ['临江仙'], songTitle: '滚滚长江东逝水', performer: '杨洪基' },
  { keywords: ['蒹葭'], songTitle: '在水一方', performer: '邓丽君' },
];

export function findKnownRecitation(title: string): KnownRecitation | null {
  return KNOWN_RECITATIONS.find((item) =>
    item.keywords.some((keyword) => title.includes(keyword))
  ) ?? null;
}
