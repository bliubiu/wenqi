export class TalentScore {
  constructor(
    public readonly value: number,
    public readonly algorithmVersion: string,
    public readonly factors: {
      lexicalUniqueness: number;
      imageryNovelty: number;
      genreInnovation: number;
    }
  ) {
    if (value < 0 || value > 100) {
      throw new Error(`才气评分超出范围 [0, 100]: ${value}`);
    }
  }
}

export class PopularityScore {
  constructor(
    public readonly value: number,
    public readonly algorithmVersion: string,
    public readonly factors: {
      citationCount: number;
      textbookCount: number;
      searchHeat: number;
    }
  ) {
    if (value < 0 || value > 100) {
      throw new Error(`人气评分超出范围 [0, 100]: ${value}`);
    }
  }
}

export class LuckScore {
  constructor(
    public readonly value: number,
    public readonly algorithmVersion: string,
    public readonly factors: {
      politicalEnvironment: number;
      rediscoveryEvents: number;
    }
  ) {
    if (value < -50 || value > 50) {
      throw new Error(`运气评分超出范围 [-50, 50]: ${value}`);
    }
  }
}

export class ThreeQi {
  constructor(
    public readonly talent: TalentScore,
    public readonly popularity: PopularityScore,
    public readonly luck: LuckScore,
    public readonly algorithmVersion: string
  ) {}
}

export class NodePosition {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number
  ) {}

  distanceTo(other: NodePosition): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  toVector3(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }
}
