import * as THREE from 'three';
import { createGlowPointsMaterial } from './GlowMaterials';

interface FlowPath {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface NebulaCluster {
  center: THREE.Vector3;
  color: number;
  nodeCount: number;
}

const FLOW_COUNT = 600;
const NEBULA_COUNT = 800;

export class ParticleSystem {
  private scene: THREE.Scene;
  private reducedMotion = false;

  readonly flowParticles: THREE.Points;
  readonly nebula: THREE.Points;

  private flowProgress!: Float32Array;
  private flowSpeeds!: Float32Array;
  private flowPaths: FlowPath[] = [];
  private flowActive = false;

  private nebulaClusters: NebulaCluster[] = [];
  private nebulaPhases!: Float32Array;
  private nebulaActive = false;

  /** 地理模式：隐藏流动雾气，避免干扰地图轮廓判读 */
  private geoMode = false;

  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.flowParticles = this.createFlowParticles();
    this.nebula = this.createNebula();

    scene.add(this.flowParticles);
    scene.add(this.nebula);
  }

  /* ── 气流光粒层 ────────────────────────────── */

  private createFlowParticles(): THREE.Points {
    const positions = new Float32Array(FLOW_COUNT * 3);
    const colors = new Float32Array(FLOW_COUNT * 3);
    const sizes = new Float32Array(FLOW_COUNT);
    this.flowProgress = new Float32Array(FLOW_COUNT);
    this.flowSpeeds = new Float32Array(FLOW_COUNT);

    for (let i = 0; i < FLOW_COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;

      const c = new THREE.Color();
      c.setHSL(0.10 + Math.random() * 0.08, 0.8, 0.7 + Math.random() * 0.3);
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;

      sizes[i] = 0.08 + Math.random() * 0.15;
      this.flowProgress[i] = Math.random();
      this.flowSpeeds[i] = 0.3 + Math.random() * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    // 氛围层按时间裁剪口径与旧行为一致（aYear 缺省为 0）
    geometry.setAttribute(
      'aTemporal',
      new THREE.BufferAttribute(new Float32Array(FLOW_COUNT).fill(1), 1)
    );

    const material = createGlowPointsMaterial(22, 0.9);

    const mesh = new THREE.Points(geometry, material);
    mesh.visible = false;
    return mesh;
  }

  /* ── 星云雾气层 ────────────────────────────── */

  private createNebula(): THREE.Points {
    const positions = new Float32Array(NEBULA_COUNT * 3);
    const colors = new Float32Array(NEBULA_COUNT * 3);
    const sizes = new Float32Array(NEBULA_COUNT);
    this.nebulaPhases = new Float32Array(NEBULA_COUNT);

    for (let i = 0; i < NEBULA_COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 200;
      positions[i3 + 1] = (Math.random() - 0.5) * 200;
      positions[i3 + 2] = (Math.random() - 0.5) * 200;

      const c = new THREE.Color();
      c.setHSL(0.10 + Math.random() * 0.15, 0.4, 0.15 + Math.random() * 0.15);
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;

      sizes[i] = 3 + Math.random() * 12;
      this.nebulaPhases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    // 氛围层按时间裁剪口径与旧行为一致（aYear 缺省为 0）
    geometry.setAttribute(
      'aTemporal',
      new THREE.BufferAttribute(new Float32Array(NEBULA_COUNT).fill(1), 1)
    );

    const material = createGlowPointsMaterial(7, 0.16);

    const mesh = new THREE.Points(geometry, material);
    mesh.visible = false;
    return mesh;
  }

  /* ── 公开接口 ────────────────────────────────── */

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  loadFlowPaths(paths: FlowPath[]): void {
    this.flowPaths = paths;
    this.flowParticles.visible = paths.length > 0 && this.flowActive && !this.geoMode;
    this.resetFlowParticles();
  }

  setFlowActive(active: boolean): void {
    this.flowActive = active;
    this.flowParticles.visible = active && this.flowPaths.length > 0 && !this.geoMode;
    if (active) this.resetFlowParticles();
  }

  loadNebulaClusters(clusters: NebulaCluster[]): void {
    this.nebulaClusters = clusters;
    this.nebula.visible = clusters.length > 0 && this.nebulaActive && !this.geoMode;
    this.resetNebula();
    this.setNebulaColors(clusters);
  }

  setNebulaActive(active: boolean): void {
    this.nebulaActive = active;
    this.nebula.visible = active && this.nebulaClusters.length > 0 && !this.geoMode;
  }

  /** 切换地理模式：隐藏气流与雾气层 */
  setGeoMode(active: boolean): void {
    this.geoMode = active;
    this.flowParticles.visible = !active && this.flowActive && this.flowPaths.length > 0;
    this.nebula.visible = !active && this.nebulaActive && this.nebulaClusters.length > 0;
  }

  /* ── 内部更新 ────────────────────────────────── */

  update(deltaMs: number): void {
    if (this.reducedMotion) return;
    this.time += deltaMs * 0.001;
    const t = this.time;

    if (this.flowActive && this.flowPaths.length > 0) this.updateFlowParticles(t);
    if (this.nebulaActive && this.nebulaClusters.length > 0) this.updateNebula(t);
  }

  private updateFlowParticles(t: number): void {
    const pos = this.flowParticles.geometry.attributes.position.array as Float32Array;
    const sizeAttr = this.flowParticles.geometry.attributes.aSize as THREE.BufferAttribute;
    const sizes = sizeAttr.array as Float32Array;
    const pathCount = this.flowPaths.length;

    for (let i = 0; i < FLOW_COUNT; i++) {
      this.flowProgress[i] += this.flowSpeeds[i] * 0.008;
      if (this.flowProgress[i] >= 1) this.flowProgress[i] = 0;

      const pathIdx = i % pathCount;
      const path = this.flowPaths[pathIdx];
      const p = this.flowProgress[i];
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      const i3 = i * 3;
      pos[i3] = path.from.x + (path.to.x - path.from.x) * eased;
      pos[i3 + 1] = path.from.y + (path.to.y - path.from.y) * eased;
      pos[i3 + 2] = path.from.z + (path.to.z - path.from.z) * eased;

      const fade = p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1;
      sizes[i] = (0.15 + 0.15 * Math.sin(t * 3 + i)) * fade;
    }

    this.flowParticles.geometry.attributes.position.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  private baseNebulaPositions: Float32Array | null = null;
  private baseNebulaSizes: Float32Array | null = null;

  private updateNebula(t: number): void {
    const pos = this.nebula.geometry.attributes.position.array as Float32Array;
    const sizeAttr = this.nebula.geometry.attributes.aSize as THREE.BufferAttribute;
    const sizes = sizeAttr.array as Float32Array;

    if (!this.baseNebulaPositions) return;

    for (let i = 0; i < NEBULA_COUNT; i++) {
      const i3 = i * 3;
      const driftX = Math.sin(t * 0.12 + this.nebulaPhases[i]) * 1.5;
      const driftY = Math.cos(t * 0.09 + this.nebulaPhases[i] * 1.3) * 1.2;
      const driftZ = Math.sin(t * 0.07 + this.nebulaPhases[i] * 0.8) * 1.0;

      pos[i3] = this.baseNebulaPositions[i3] + driftX;
      pos[i3 + 1] = this.baseNebulaPositions[i3 + 1] + driftY;
      pos[i3 + 2] = this.baseNebulaPositions[i3 + 2] + driftZ;

      const breathe = 0.7 + 0.3 * Math.sin(t * 0.5 + this.nebulaPhases[i]);
      sizes[i] = this.baseNebulaSizes![i] * breathe;
    }

    this.nebula.geometry.attributes.position.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  private resetFlowParticles(): void {
    if (this.flowPaths.length === 0) return;
    for (let i = 0; i < FLOW_COUNT; i++) {
      this.flowProgress[i] = Math.random();
      this.flowSpeeds[i] = 0.3 + Math.random() * 0.5;
    }
  }

  private resetNebula(): void {
    const posAttr = this.nebula.geometry.attributes.position as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const sizeAttr = this.nebula.geometry.attributes.aSize as THREE.BufferAttribute;
    const sizes = sizeAttr.array as Float32Array;
    const clusterCount = this.nebulaClusters.length;

    this.baseNebulaPositions = new Float32Array(NEBULA_COUNT * 3);
    this.baseNebulaSizes = new Float32Array(NEBULA_COUNT);

    for (let i = 0; i < NEBULA_COUNT; i++) {
      const cluster = this.nebulaClusters[i % clusterCount];
      const i3 = i * 3;
      const spread = Math.min(30, 5 + Math.sqrt(cluster.nodeCount) * 1.5);
      const x = cluster.center.x + (Math.random() - 0.5) * spread;
      const y = cluster.center.y + (Math.random() - 0.5) * spread;
      const z = cluster.center.z + (Math.random() - 0.5) * spread;
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      this.baseNebulaPositions[i3] = x;
      this.baseNebulaPositions[i3 + 1] = y;
      this.baseNebulaPositions[i3 + 2] = z;
      this.baseNebulaSizes[i] = sizes[i];
    }

    posAttr.needsUpdate = true;
  }

  setNebulaColors(clusters: NebulaCluster[]): void {
    const colorAttr = this.nebula.geometry.attributes.aColor as THREE.BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    const clusterCount = clusters.length;

    for (let i = 0; i < NEBULA_COUNT; i++) {
      const cluster = clusters[i % clusterCount];
      const c = new THREE.Color(cluster.color);
      c.multiplyScalar(0.3 + Math.random() * 0.2);
      const i3 = i * 3;
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    colorAttr.needsUpdate = true;
  }

  /* ── 资源清理 ────────────────────────────────── */

  dispose(): void {
    [this.flowParticles, this.nebula].forEach((points) => {
      this.scene.remove(points);
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    });
  }
}
