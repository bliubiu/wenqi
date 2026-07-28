import { ThreeQi, TalentScore, PopularityScore, LuckScore } from '../value-objects/ThreeQi';
import { IncompatibleAlgorithmVersionError } from '../errors/DomainError';

export class ThreeQiFactory {
  static create(
    talent: TalentScore,
    popularity: PopularityScore,
    luck: LuckScore
  ): ThreeQi {
    if (talent.algorithmVersion !== popularity.algorithmVersion ||
        talent.algorithmVersion !== luck.algorithmVersion) {
      throw new IncompatibleAlgorithmVersionError(
        `talent=${talent.algorithmVersion}, pop=${popularity.algorithmVersion}, luck=${luck.algorithmVersion}`,
        talent.algorithmVersion
      );
    }
    return new ThreeQi(talent, popularity, luck, talent.algorithmVersion);
  }
}
