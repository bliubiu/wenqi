import { type DynastyCode } from '../value-objects/DynastyCode';

export class Work {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly poetId: string,
    public readonly poetName: string,
    public readonly dynasty: DynastyCode,
    public readonly genre: string,
    public readonly text: string
  ) {}

  static create(data: {
    id: string;
    title: string;
    poetId: string;
    poetName: string;
    dynasty: string;
    genre: string;
    text: string;
  }): Work {
    return new Work(
      data.id,
      data.title,
      data.poetId,
      data.poetName,
      data.dynasty as DynastyCode,
      data.genre,
      data.text
    );
  }
}
