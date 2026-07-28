import { NodePosition } from '../value-objects/ThreeQi';
import { type DynastyCode } from '../value-objects/DynastyCode';
import { type GenreCode } from '../value-objects/GenreCode';

export type ClusterDimension = 'DYNASTY' | 'GENRE';

export class QiCluster {
  constructor(
    public readonly id: string,
    public readonly dimension: ClusterDimension,
    public readonly key: string,
    public readonly nodeIds: string[],
    public readonly center: NodePosition,
    public readonly density: number,
    public readonly color: string
  ) {
    if (nodeIds.length < 1) {
      throw new Error('气团至少包含一个节点');
    }
  }

  getNodeCount(): number {
    return this.nodeIds.length;
  }

  isDynastyCluster(): this is QiCluster & { key: DynastyCode } {
    return this.dimension === 'DYNASTY';
  }

  isGenreCluster(): this is QiCluster & { key: GenreCode } {
    return this.dimension === 'GENRE';
  }
}
