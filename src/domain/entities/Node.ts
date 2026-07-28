import { NodePosition } from '../value-objects/ThreeQi';
import { type DynastyCode } from '../value-objects/DynastyCode';
import { type GenreCode } from '../value-objects/GenreCode';

export type NodeState = 'IDLE' | 'CONVERGING' | 'DIVERGED';

export class GalaxyNode {
  public state: NodeState;
  public currentPosition: NodePosition;

  constructor(
    public readonly id: string,
    public readonly refType: 'POET' | 'WORK',
    public readonly refId: string,
    position: NodePosition,
    public readonly basePosition: NodePosition,
    public readonly dynasty: DynastyCode,
    public readonly genre: GenreCode | null,
    public size: number,
    public brightness: number,
    public readonly phase: number,
    public readonly label: string,
    state: NodeState = 'IDLE'
  ) {
    this.state = state;
    this.currentPosition = position;
  }

  get position(): NodePosition {
    return this.currentPosition;
  }

  updatePosition(newPos: NodePosition): void {
    this.currentPosition = newPos;
  }

  enterConvergence(target: NodePosition): void {
    this.state = 'CONVERGING';
    this.updatePosition(target);
  }

  resetToBase(): void {
    this.state = 'IDLE';
    this.currentPosition = this.basePosition;
  }

  static create(data: {
    id: string;
    refType: 'POET' | 'WORK';
    refId: string;
    position: { x: number; y: number; z: number };
    basePosition: { x: number; y: number; z: number };
    dynasty: string;
    genre: string | null;
    size: number;
    brightness: number;
    phase: number;
    label: string;
    state?: NodeState;
  }): GalaxyNode {
    return new GalaxyNode(
      data.id,
      data.refType,
      data.refId,
      new NodePosition(data.position.x, data.position.y, data.position.z),
      new NodePosition(data.basePosition.x, data.basePosition.y, data.basePosition.z),
      data.dynasty as DynastyCode,
      data.genre as GenreCode | null,
      data.size,
      data.brightness,
      data.phase,
      data.label,
      data.state ?? 'IDLE'
    );
  }
}
