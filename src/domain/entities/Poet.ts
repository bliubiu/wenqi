import { type DynastyCode } from '../value-objects/DynastyCode';
import { type ThreeQi } from '../value-objects/ThreeQi';
import { YearRange } from '../value-objects/YearRange';

export interface WorkSummary {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
}

export class Poet {
  public threeQi: ThreeQi | null;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly dynasty: DynastyCode,
    public readonly biography: string,
    public readonly workCount: number,
    public readonly courtesyName: string | null = null,
    public readonly pseudonym: string | null = null,
    public readonly birthDeath: YearRange | null = null,
    public readonly school: string | null = null,
    threeQi: ThreeQi | null = null,
    public readonly workSummaries: WorkSummary[] = [],
    public readonly hometown?: string | null,
    public readonly hometownLatitude?: number | null,
    public readonly hometownLongitude?: number | null
  ) {
    this.threeQi = threeQi;
  }

  isContemporaryWith(other: Poet): boolean {
    if (!this.birthDeath || !other.birthDeath) return false;
    return this.birthDeath.overlaps(other.birthDeath);
  }

  static create(data: {
    id: string;
    name: string;
    dynasty: string;
    biography: string;
    workCount: number;
    courtesyName?: string | null;
    pseudonym?: string | null;
    birthDeath?: { startYear: number | null; endYear: number | null } | null;
    school?: string | null;
    hometown?: string | null;
    hometownLatitude?: number | null;
    hometownLongitude?: number | null;
    workSummaries?: WorkSummary[];
  }): Poet {
    return new Poet(
      data.id,
      data.name,
      data.dynasty as DynastyCode,
      data.biography,
      data.workCount,
      data.courtesyName ?? null,
      data.pseudonym ?? null,
      data.birthDeath ? new YearRange(data.birthDeath.startYear, data.birthDeath.endYear) : null,
      data.school ?? null,
      null,
      data.workSummaries ?? [],
      data.hometown ?? null,
      data.hometownLatitude ?? null,
      data.hometownLongitude ?? null
    );
  }
}
