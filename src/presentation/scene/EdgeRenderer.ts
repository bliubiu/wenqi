import * as THREE from 'three';
import { Node } from '@/infrastructure/data/DataLoader';
import { createGlowPointsMaterial } from './GlowMaterials';

const DYNASTY_COLORS: Record<string, number> = {
  PRE_QIN: 0x3a4a5c, HAN: 0x8b7355, WEI_JIN: 0x6fae8e,
  TANG: 0xd4a24c, SONG: 0x7ba7d9, YUAN: 0xb5523e,
  MING: 0xc9866b, QING: 0x8c6fae, MODERN: 0x5a8c7a,
};

/** 关系类型 → 气流粒子颜色（文脉类型化呈现） */
export const RELATION_FLOW_COLORS: Record<string, number> = {
  TEACHER_STUDENT: 0xc98a4b, // 赭石
  FRIEND: 0x5fb8a8,          // 青碧
  SAME_SCHOOL: 0x9b7ede,     // 紫
  INFLUENCE: 0xc9d8e8,       // 银白
  CITATION: 0xd9b45b,        // 金
  SAME_DYNASTY: 0x8a8578,    // 弱化灰
  ANTHOLOGY: 0xb08fb0,
};

const PARTICLES_PER_EDGE = 8;
const PARTICLE_SIZE = 0.3;
const FLOW_SPEED = 0.15;
const ARC_HEIGHT = 4;

/** 关系流条目：目标节点 + 关系类型 + 权重（决定粒子数量与亮度） */
export interface RelationFlow {
  node: Node;
  type: string;
  weight: number;
}

interface ParticleData {
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  progress: number;
  speed: number;
  color: THREE.Color;
  /** 所属边的目标节点 ID（动画插值按边匹配目标位） */
  edgeNodeId: string;
}

function bezierQuad(t: number, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, out: THREE.Vector3): void {
  const mt = 1 - t;
  out.x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
  out.y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
  out.z = mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z;
}

export class EdgeRenderer {
  private particleSystem: THREE.Points | null = null;
  private particles: ParticleData[] = [];
  private positionAttr: THREE.BufferAttribute | null = null;
  private colorAttr: THREE.BufferAttribute | null = null;
  private sizeAttr: THREE.BufferAttribute | null = null;
  private readonly reuseVec = new THREE.Vector3();
  private readonly reuseColor = new THREE.Color();

  constructor(private scene: THREE.Scene) {}

  /** 兜底流：同朝代相关节点（无关系数据时的原有口径） */
  build(focusNode: Node, relatedNodes: Node[]): void {
    this.buildFromRelations(
      focusNode,
      relatedNodes.map((n) => ({ node: n, type: 'SAME_DYNASTY', weight: 0.3 })),
      new THREE.Color(DYNASTY_COLORS[focusNode.dynasty] || 0xffffff).multiplyScalar(0.5)
    );
  }

  /**
   * 类型化关系流：按关系类型着色，粒子数与亮度随权重加权；
   * SAME_DYNASTY 整体弱化，其余类型亮度 = 0.5 + weight×0.5。
   */
  buildFromRelations(focusNode: Node, flows: RelationFlow[], fallbackColor?: THREE.Color): void {
    this.clear();
    this.appendFromRelations(focusNode, flows, fallbackColor);
  }

  /** 追加一组关系流（保留已有粒子），用于双诗人对比叠加关系网 */
  appendFromRelations(focusNode: Node, flows: RelationFlow[], fallbackColor?: THREE.Color): void {
    const focusPos = new THREE.Vector3(focusNode.position.x, focusNode.position.y, focusNode.position.z);
    const weakColor = fallbackColor ?? new THREE.Color(RELATION_FLOW_COLORS.SAME_DYNASTY ?? 0x8a8578).multiplyScalar(0.35);

    for (const flow of flows) {
      const rnPos = new THREE.Vector3(flow.node.position.x, flow.node.position.y, flow.node.position.z);
      const mid = new THREE.Vector3().lerpVectors(focusPos, rnPos, 0.5);
      mid.y += ARC_HEIGHT;

      let color: THREE.Color;
      if (flow.type === 'SAME_DYNASTY') {
        color = weakColor.clone();
      } else {
        color = new THREE.Color(RELATION_FLOW_COLORS[flow.type] ?? 0xffffff)
          .multiplyScalar(0.5 + flow.weight * 0.5);
      }

      const perEdge = Math.max(3, Math.min(12, Math.round(PARTICLES_PER_EDGE * (0.5 + flow.weight))));
      for (let i = 0; i < perEdge; i++) {
        this.particles.push({
          start: focusPos.clone(),
          ctrl: mid.clone(),
          end: rnPos.clone(),
          progress: i / perEdge,
          speed: FLOW_SPEED * (0.8 + Math.random() * 0.4),
          color: color.clone(),
          edgeNodeId: flow.node.id,
        });
      }
    }

    this.rebuildGeometry();
  }

  /** 按当前粒子列表重建渲染对象（保留粒子数据） */
  private rebuildGeometry(): void {
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      (this.particleSystem.material as THREE.Material).dispose();
      this.particleSystem = null;
    }
    this.buildGeometry();
  }

  private buildGeometry(): void {
    const count = this.particles.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      bezierQuad(p.progress, p.start, p.ctrl, p.end, this.reuseVec);
      positions[i * 3] = this.reuseVec.x;
      positions[i * 3 + 1] = this.reuseVec.y;
      positions[i * 3 + 2] = this.reuseVec.z;
      colors[i * 3] = p.color.r;
      colors[i * 3 + 1] = p.color.g;
      colors[i * 3 + 2] = p.color.b;
      sizes[i] = PARTICLE_SIZE;
    }

    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('aColor', this.colorAttr);
    geometry.setAttribute('aSize', this.sizeAttr);
    // 关系流粒子按时间裁剪口径与旧行为一致（aYear 缺省为 0）
    geometry.setAttribute(
      'aTemporal',
      new THREE.BufferAttribute(new Float32Array(count).fill(1), 1)
    );

    const material = createGlowPointsMaterial(18, 0.85);

    this.particleSystem = new THREE.Points(geometry, material);
    this.scene.add(this.particleSystem);
  }

  update(): void {
    if (!this.particleSystem || this.particles.length === 0) return;

    const positions = this.positionAttr!.array as Float32Array;
    const colors = this.colorAttr!.array as Float32Array;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.progress += p.speed * 0.016;
      if (p.progress > 1) {
        p.progress = 0;
        p.speed = FLOW_SPEED * (0.8 + Math.random() * 0.4);
      }

      bezierQuad(p.progress, p.start, p.ctrl, p.end, this.reuseVec);
      positions[i * 3] = this.reuseVec.x;
      positions[i * 3 + 1] = this.reuseVec.y;
      positions[i * 3 + 2] = this.reuseVec.z;

      const alpha = 1 - Math.abs(p.progress - 0.5) * 2;
      colors[i * 3] = p.color.r * alpha;
      colors[i * 3 + 1] = p.color.g * alpha;
      colors[i * 3 + 2] = p.color.b * alpha;
    }

    this.positionAttr!.needsUpdate = true;
    this.colorAttr!.needsUpdate = true;
  }

  /** 聚焦动画期间的粒子随动：按边的目标节点 ID 匹配目标位（支持每边粒子数不同） */
  updateProgress(
    focusNode: Node,
    targetPositions: Map<string, THREE.Vector3>,
    progress: number,
  ): void {
    const sourcePos = targetPositions.get(focusNode.id);
    if (!sourcePos) return;

    const reuseSrc = new THREE.Vector3();
    const reuseDst = new THREE.Vector3();
    const reuseMid = new THREE.Vector3();

    for (const p of this.particles) {
      const targetPos = targetPositions.get(p.edgeNodeId);
      if (!targetPos) continue;

      reuseSrc.set(
        focusNode.position.x + (sourcePos.x - focusNode.position.x) * progress,
        focusNode.position.y + (sourcePos.y - focusNode.position.y) * progress,
        focusNode.position.z + (sourcePos.z - focusNode.position.z) * progress,
      );
      reuseDst.set(
        p.end.x + (targetPos.x - p.end.x) * progress,
        p.end.y + (targetPos.y - p.end.y) * progress,
        p.end.z + (targetPos.z - p.end.z) * progress,
      );
      reuseMid.lerpVectors(reuseSrc, reuseDst, 0.5);
      reuseMid.y += ARC_HEIGHT;

      p.start.copy(reuseSrc);
      p.end.copy(reuseDst);
      p.ctrl.copy(reuseMid);
    }
  }

  clear(): void {
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      (this.particleSystem.material as THREE.Material).dispose();
      this.particleSystem = null;
    }
    this.particles = [];
    this.positionAttr = null;
    this.colorAttr = null;
    this.sizeAttr = null;
  }
}
