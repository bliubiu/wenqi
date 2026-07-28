import { PoetRepository, NodeRepository, ScoreRepository, WasmComputePort, ScoreData } from '@/domain/ports/DataPorts';
import { Poet } from '@/domain/entities/Poet';
import { GalaxyNode } from '@/domain/entities/Node';
import { NodeDTO, PoetDTO, ScoreDTO } from '../dto/GalaxyDTO';

export interface GalaxyInitData {
  nodes: NodeDTO[];
  poets: PoetDTO[];
  scores: ScoreDTO[];
  poetMap: Map<string, PoetDTO>;
  scoreMap: Map<string, ScoreDTO>;
}

export class InitializeUseCase {
  constructor(
    private poetRepo: PoetRepository,
    private nodeRepo: NodeRepository,
    private scoreRepo: ScoreRepository,
    private wasm?: WasmComputePort
  ) {}

  async execute(): Promise<GalaxyInitData> {
    const [poets, nodes, scores] = await Promise.all([
      this.poetRepo.loadAll(),
      this.nodeRepo.loadAll(),
      this.scoreRepo.loadAll(),
    ]);

    if (this.wasm && !this.wasm.initialized) {
      try {
        await this.wasm.init();
      } catch {
        console.warn('WASM 初始化失败，使用纯前端模式');
      }
    }

    const poetDTOs = poets.map(this.toPoetDTO);
    const nodeDTOs = nodes.map(this.toNodeDTO);
    const scoreDTOs = scores.map(this.toScoreDTO);

    const poetMap = new Map<string, PoetDTO>();
    poetDTOs.forEach((p) => poetMap.set(p.id, p));

    const scoreMap = new Map<string, ScoreDTO>();
    scoreDTOs.forEach((s) => scoreMap.set(s.poetId, s));

    return { nodes: nodeDTOs, poets: poetDTOs, scores: scoreDTOs, poetMap, scoreMap };
  }

  private toPoetDTO(poet: Poet): PoetDTO {
    return {
      id: poet.id,
      name: poet.name,
      dynasty: poet.dynasty,
      biography: poet.biography,
      workCount: poet.workCount,
    };
  }

  private toNodeDTO(node: GalaxyNode): NodeDTO {
    return {
      id: node.id,
      refType: node.refType,
      refId: node.refId,
      position: node.position.toVector3(),
      dynasty: node.dynasty,
      size: node.size,
      brightness: node.brightness,
      label: node.label,
    };
  }

  private toScoreDTO(score: ScoreData): ScoreDTO {
    return {
      poetId: score.poetId,
      poetName: score.poetName,
      dynasty: score.dynasty,
      talent: score.threeQi.talent.value,
      popularity: score.threeQi.popularity.value,
      luck: score.threeQi.luck.value,
    };
  }
}
