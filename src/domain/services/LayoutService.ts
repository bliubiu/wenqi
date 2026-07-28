import { GalaxyNode } from '../entities/Node';
import { QiCluster, type ClusterDimension } from '../entities/QiCluster';
import { Relation } from '../entities/Relation';
import { NodePosition } from '../value-objects/ThreeQi';
import { DYNASTY_COLOR_HEX } from '../value-objects/DynastyCode';
import { type DimensionWeights } from '../events/DomainEvent';

export interface ConvergenceMovement {
  nodeId: string;
  from: NodePosition;
  to: NodePosition;
  durationMs: number;
  easing: 'ease-out' | 'ease-in-out';
}

export interface ConvergenceResult {
  focusId: string;
  movements: ConvergenceMovement[];
  relatedCount: number;
}

export const CONVERGENCE_LIMIT = 50;

export class LayoutService {
  computeInitialLayout(nodes: GalaxyNode[]): Map<string, NodePosition> {
    const layout = new Map<string, NodePosition>();
    for (const node of nodes) {
      layout.set(node.id, new NodePosition(
        node.basePosition.x,
        node.basePosition.y,
        node.basePosition.z
      ));
    }
    return layout;
  }

  computeConvergence(
    focusNode: GalaxyNode,
    allNodes: GalaxyNode[],
    relations: Relation[]
  ): ConvergenceResult {
    const relatedIds = new Set<string>();
    const focusRelations = relations.filter(
      r => r.sourceId === focusNode.id || r.targetId === focusNode.id
    );
    for (const rel of focusRelations) {
      const otherId = rel.sourceId === focusNode.id ? rel.targetId : rel.sourceId;
      if (allNodes.find(n => n.id === otherId)) {
        relatedIds.add(otherId);
      }
    }

    const weighted = Array.from(relatedIds)
      .map(id => {
        const maxWeight = focusRelations
          .filter(r => r.sourceId === id || r.targetId === id)
          .reduce((max, r) => Math.max(max, r.weight), 0);
        return { id, weight: maxWeight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, CONVERGENCE_LIMIT);

    const focusPos = focusNode.position;
    const movements: ConvergenceMovement[] = [];

    for (const { id, weight } of weighted) {
      const node = allNodes.find(n => n.id === id)!;
      const from = node.position;
      const radius = 3 + (1 - weight) * 5;
      const angle = Math.random() * Math.PI * 2;
      const heightOffset = (Math.random() - 0.5) * 4;
      const to = new NodePosition(
        focusPos.x + Math.cos(angle) * radius,
        focusPos.y + heightOffset,
        focusPos.z + Math.sin(angle) * radius
      );

      movements.push({
        nodeId: id,
        from,
        to,
        durationMs: 800 + (1 - weight) * 400,
        easing: 'ease-out',
      });
    }

    return {
      focusId: focusNode.id,
      movements,
      relatedCount: weighted.length,
    };
  }

  computeClusters(
    nodes: GalaxyNode[],
    dimension: ClusterDimension
  ): QiCluster[] {
    const groupMap = new Map<string, GalaxyNode[]>();
    for (const node of nodes) {
      const key = dimension === 'DYNASTY'
        ? node.dynasty
        : (node.genre ?? 'UNKNOWN');
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(node);
    }

    const clusters: QiCluster[] = [];
    const colorMap = this.getClusterColorMap(dimension);

    for (const [key, group] of groupMap.entries()) {
      if (group.length === 0) continue;

      const avgX = group.reduce((s, n) => s + n.currentPosition.x, 0) / group.length;
      const avgY = group.reduce((s, n) => s + n.currentPosition.y, 0) / group.length;
      const avgZ = group.reduce((s, n) => s + n.currentPosition.z, 0) / group.length;
      const totalBrightness = group.reduce((s, n) => s + n.brightness, 0);
      const density = group.length * (totalBrightness / group.length);

      clusters.push(new QiCluster(
        `${dimension}_${key}`,
        dimension,
        key,
        group.map(n => n.id),
        new NodePosition(avgX, avgY, avgZ),
        density,
        colorMap.get(key) ?? '#888888'
      ));
    }

    return clusters;
  }

  recomputePositions(
    nodes: GalaxyNode[],
    weights: DimensionWeights
  ): Map<string, NodePosition> {
    const positions = new Map<string, NodePosition>();
    for (const node of nodes) {
      const x = node.basePosition.x * weights.luckWeight;
      const y = node.basePosition.y * weights.talentWeight;
      const z = node.basePosition.z * weights.popularityWeight;
      positions.set(node.id, new NodePosition(x, y, z));
    }
    return positions;
  }

  private getClusterColorMap(dimension: ClusterDimension): Map<string, string> {
    const map = new Map<string, string>();
    if (dimension === 'DYNASTY') {
      for (const [code, color] of Object.entries(DYNASTY_COLOR_HEX)) {
        map.set(code, color as string);
      }
    } else {
      const genreColors: Record<string, string> = {
        SHI: '#D4A24C',
        CI: '#7BA7D9',
        QU: '#B5523E',
        FU: '#C9866B',
        WEN: '#8C6FAE',
        XIAOSHUO: '#5A8C7A',
      };
      for (const [code, color] of Object.entries(genreColors)) {
        map.set(code, color);
      }
    }
    return map;
  }
}
