import { GalaxyNode, type NodeState } from '../entities/Node';
import { QiCluster } from '../entities/QiCluster';
import { NodePosition } from '../value-objects/ThreeQi';
import { type DimensionWeights } from '../events/DomainEvent';

export class Galaxy {
  private readonly nodesMap: Map<string, GalaxyNode>;
  private readonly clustersMap: Map<string, QiCluster>;
  private focusedNodeId: string | null = null;
  private currentWeights: DimensionWeights = {
    talentWeight: 1,
    popularityWeight: 1,
    luckWeight: 1,
  };

  constructor(nodes: GalaxyNode[] = []) {
    this.nodesMap = new Map();
    this.clustersMap = new Map();
    for (const node of nodes) {
      this.nodesMap.set(node.id, node);
    }
  }

  static create(nodes: GalaxyNode[]): Galaxy {
    return new Galaxy(nodes);
  }

  // 节点操作

  addNode(node: GalaxyNode): void {
    this.nodesMap.set(node.id, node);
  }

  removeNode(nodeId: string): void {
    this.nodesMap.delete(nodeId);
    if (this.focusedNodeId === nodeId) {
      this.focusedNodeId = null;
    }
  }

  findNode(nodeId: string): GalaxyNode | null {
    return this.nodesMap.get(nodeId) ?? null;
  }

  getAllNodes(): GalaxyNode[] {
    return Array.from(this.nodesMap.values());
  }

  getNodeCount(): number {
    return this.nodesMap.size;
  }

  getNodesByState(state: NodeState): GalaxyNode[] {
    return this.getAllNodes().filter(n => n.state === state);
  }

  // 聚焦状态

  getFocusedNodeId(): string | null {
    return this.focusedNodeId;
  }

  isFocused(): boolean {
    return this.focusedNodeId !== null;
  }

  setFocusedNode(nodeId: string | null): void {
    this.focusedNodeId = nodeId;
  }

  // 节点状态批量操作

  setNodeState(nodeId: string, state: NodeState): void {
    const node = this.nodesMap.get(nodeId);
    if (node) {
      node.state = state;
    }
  }

  setNodePosition(nodeId: string, position: NodePosition): void {
    const node = this.nodesMap.get(nodeId);
    if (node) {
      node.currentPosition = position;
    }
  }

  setNodeBrightness(nodeId: string, brightness: number): void {
    const node = this.nodesMap.get(nodeId);
    if (node) {
      node.brightness = brightness;
    }
  }

  resetAllToIdle(): void {
    for (const node of this.nodesMap.values()) {
      node.state = 'IDLE';
      node.currentPosition = node.basePosition;
      node.brightness = Math.max(0.4, node.brightness);
    }
  }

  // 聚类管理

  getClusters(): QiCluster[] {
    return Array.from(this.clustersMap.values());
  }

  storeClusters(clusters: QiCluster[]): void {
    this.clustersMap.clear();
    for (const c of clusters) {
      this.clustersMap.set(c.id, c);
    }
  }

  // 维度权重

  getCurrentWeights(): DimensionWeights {
    return { ...this.currentWeights };
  }

  setCurrentWeights(weights: DimensionWeights): void {
    this.currentWeights = weights;
  }
}
