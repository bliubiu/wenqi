import { Poet } from '../entities/Poet';
import { Work } from '../entities/Work';
import { GalaxyNode } from '../entities/Node';
import { NodePosition } from '../value-objects/ThreeQi';
import { type DynastyCode } from '../value-objects/DynastyCode';
import { type GenreCode } from '../value-objects/GenreCode';

export class NodeFactory {
  static createFromPoet(
    poet: Poet,
    scores?: { talent: number; popularity: number; luck: number }
  ): GalaxyNode {
    const x = scores?.luck ?? 0;
    const y = scores?.talent ?? 50;
    const z = scores?.popularity ?? 50;
    const basePos = new NodePosition(x, y, z);
    const size = 3 + (scores?.popularity ?? 50) / 50;
    const brightness = 0.4 + (scores?.talent ?? 50) / 100 * 0.6;

    return new GalaxyNode(
      poet.id,
      'POET',
      poet.id,
      basePos,
      basePos,
      poet.dynasty as DynastyCode,
      null,
      Math.max(2, Math.min(8, size)),
      Math.max(0.4, Math.min(1.0, brightness)),
      Math.random() * Math.PI * 2,
      poet.name,
      'IDLE'
    );
  }

  static createFromWork(work: Work): GalaxyNode {
    const basePos = new NodePosition(0, 50, 50);

    return new GalaxyNode(
      work.id,
      'WORK',
      work.poetId,
      basePos,
      basePos,
      work.dynasty as DynastyCode,
      work.genre as GenreCode,
      2,
      0.5,
      Math.random() * Math.PI * 2,
      work.title,
      'IDLE'
    );
  }
}
