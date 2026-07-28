import { Poet } from '../entities/Poet';

export class PoetFactory {
  static createFromRaw(raw: {
    id: string;
    name: string;
    dynasty: string;
    biography: string;
    workCount: number;
    courtesyName?: string | null;
    pseudonym?: string | null;
    birthDeath?: { startYear: number | null; endYear: number | null } | null;
    school?: string | null;
    workSummaries?: Array<{ id: string; title: string; genre: string }>;
  }): Poet {
    return Poet.create(raw);
  }
}
