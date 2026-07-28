import * as THREE from 'three';
import { Node } from '@/infrastructure/data/DataLoader';

const DYNASTY_COLORS: Record<string, number> = {
  PRE_QIN: 0x3a4a5c, HAN: 0x8b7355, WEI_JIN: 0x6fae8e,
  TANG: 0xd4a24c, SONG: 0x7ba7d9, YUAN: 0xb5523e,
  MING: 0xc9866b, QING: 0x8c6fae, MODERN: 0x5a8c7a,
};

const PARTICLES_PER_EDGE = 8;
const PARTICLE_SIZE = 0.3;
const FLOW_SPEED = 0.15;
const ARC_HEIGHT = 4;

interface ParticleData {
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  progress: number;
  speed: number;
  color: THREE.Color;
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

  build(focusNode: Node, relatedNodes: Node[]): void {
    this.clear();

    const focusPos = new THREE.Vector3(focusNode.position.x, focusNode.position.y, focusNode.position.z);
    const baseColor = new THREE.Color(DYNASTY_COLORS[focusNode.dynasty] || 0xffffff);

    const particleCount = relatedNodes.length * PARTICLES_PER_EDGE;
    if (particleCount === 0) return;

    this.particles = [];

    for (const rn of relatedNodes) {
      const rnPos = new THREE.Vector3(rn.position.x, rn.position.y, rn.position.z);
      const mid = new THREE.Vector3().lerpVectors(focusPos, rnPos, 0.5);
      mid.y += ARC_HEIGHT;

      const fade = new THREE.Color(baseColor);
      fade.multiplyScalar(0.5);

      for (let i = 0; i < PARTICLES_PER_EDGE; i++) {
        this.particles.push({
          start: focusPos.clone(),
          ctrl: mid.clone(),
          end: rnPos.clone(),
          progress: i / PARTICLES_PER_EDGE,
          speed: FLOW_SPEED * (0.8 + Math.random() * 0.4),
          color: fade.clone(),
        });
      }
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
    geometry.setAttribute('color', this.colorAttr);
    geometry.setAttribute('size', this.sizeAttr);

    const material = new THREE.PointsMaterial({
      size: PARTICLE_SIZE,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

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

  updateProgress(
    focusNode: Node,
    relatedNodes: Node[],
    targetPositions: Map<string, THREE.Vector3>,
    progress: number,
  ): void {
    const sourcePos = targetPositions.get(focusNode.id);
    if (!sourcePos) return;

    let pi = 0;
    for (const rn of relatedNodes) {
      const targetPos = targetPositions.get(rn.id);
      if (!targetPos) {
        pi += PARTICLES_PER_EDGE;
        continue;
      }

      const src = new THREE.Vector3(
        focusNode.position.x + (sourcePos.x - focusNode.position.x) * progress,
        focusNode.position.y + (sourcePos.y - focusNode.position.y) * progress,
        focusNode.position.z + (sourcePos.z - focusNode.position.z) * progress,
      );
      const dst = new THREE.Vector3(
        rn.position.x + (targetPos.x - rn.position.x) * progress,
        rn.position.y + (targetPos.y - rn.position.y) * progress,
        rn.position.z + (targetPos.z - rn.position.z) * progress,
      );
      const mid = new THREE.Vector3().lerpVectors(src, dst, 0.5);
      mid.y += ARC_HEIGHT;

      for (let i = 0; i < PARTICLES_PER_EDGE; i++) {
        const p = this.particles[pi + i];
        p.start.copy(src);
        p.end.copy(dst);
        p.ctrl.copy(mid);
      }
      pi += PARTICLES_PER_EDGE;
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
