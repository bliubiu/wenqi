export class YearRange {
  constructor(
    public readonly startYear: number | null,
    public readonly endYear: number | null
  ) {
    if (startYear !== null && endYear !== null && startYear > endYear) {
      throw new Error(`生卒年范围无效: 起始年 ${startYear} > 结束年 ${endYear}`);
    }
  }

  contains(year: number): boolean {
    if (this.startYear !== null && year < this.startYear) return false;
    if (this.endYear !== null && year > this.endYear) return false;
    return true;
  }

  overlaps(other: YearRange): boolean {
    const s1 = this.startYear ?? -Infinity;
    const e1 = this.endYear ?? Infinity;
    const s2 = other.startYear ?? -Infinity;
    const e2 = other.endYear ?? Infinity;
    return s1 <= e2 && s2 <= e1;
  }

  toString(): string {
    const start = this.startYear?.toString() ?? '不详';
    const end = this.endYear?.toString() ?? '不详';
    return `${start} — ${end}`;
  }
}
