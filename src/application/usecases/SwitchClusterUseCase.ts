import { Galaxy } from '@/domain/aggregates/Galaxy';
import { LayoutService } from '@/domain/services/LayoutService';
import { type ClusterDimension } from '@/domain/entities/QiCluster';
import { type QiClusterDTO } from '../dto/GalaxyDTO';
import { getDynastyName } from '@/domain/value-objects/DynastyCode';
import { getGenreName } from '@/domain/value-objects/GenreCode';

export interface SwitchClusterRequest {
  dimension: 'DYNASTY' | 'GENRE';
}

export interface SwitchClusterResponse {
  clusters: QiClusterDTO[];
}

export class SwitchClusterUseCase {
  constructor(
    private galaxy: Galaxy,
    private layoutService: LayoutService
  ) {}

  execute(request: SwitchClusterRequest): SwitchClusterResponse {
    const allNodes = this.galaxy.getAllNodes();
    const clusters = this.layoutService.computeClusters(allNodes, request.dimension as ClusterDimension);
    this.galaxy.storeClusters(clusters);

    const dtos: QiClusterDTO[] = clusters.map(c => ({
      id: c.id,
      dimension: c.dimension,
      key: c.key,
      label: c.dimension === 'DYNASTY' ? getDynastyName(c.key) : getGenreName(c.key),
      center: { x: c.center.x, y: c.center.y, z: c.center.z },
      density: c.density,
      color: c.color,
      nodeCount: c.getNodeCount(),
    }));

    return { clusters: dtos };
  }
}
