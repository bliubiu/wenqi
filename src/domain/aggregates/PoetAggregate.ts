import { Poet } from '../entities/Poet';
import { Work } from '../entities/Work';
import { ThreeQi } from '../value-objects/ThreeQi';
import { IncompatibleAlgorithmVersionError } from '../errors/DomainError';

export class PoetAggregate {
  readonly poet: Poet;
  private readonly works: Map<string, Work>;

  constructor(poet: Poet, works: Work[] = []) {
    this.poet = poet;
    this.works = new Map();
    for (const work of works) {
      if (work.poetId !== poet.id) {
        throw new Error(`作品诗人ID不匹配: ${work.poetId} !== ${poet.id}`);
      }
      this.works.set(work.id, work);
    }
  }

  static create(poet: Poet, works: Work[] = []): PoetAggregate {
    return new PoetAggregate(poet, works);
  }

  addWork(work: Work): void {
    if (work.poetId !== this.poet.id) {
      throw new Error(`作品诗人ID不匹配: ${work.poetId} !== ${this.poet.id}`);
    }
    this.works.set(work.id, work);
  }

  removeWork(workId: string): void {
    this.works.delete(workId);
  }

  updateBiography(text: string): void {
    (this.poet as { biography: string }).biography = text;
  }

  updateThreeQi(scores: ThreeQi): void {
    if (this.poet instanceof Poet) {
      Object.assign(this.poet, { threeQi: scores });
    }
  }

  getWorks(): Work[] {
    return Array.from(this.works.values());
  }

  findWorkById(id: string): Work | null {
    return this.works.get(id) ?? null;
  }

  getWorkCount(): number {
    return this.works.size;
  }
}
