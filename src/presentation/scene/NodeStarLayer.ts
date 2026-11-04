/**
 * 节点 + 星空合并层：两层共用同一 Points 几何体与同一套 glow 着色器，
 * 把原来的两次 draw call 合并为一次，同时保留独立的时间裁剪、LOD 与地理模式开关。
 */

import * as THREE from 'three';
import { createGlowPointsMaterial } from './GlowMaterials';

const STAR_COUNT = 2000;
const STAR_SPREAD = 250;
/** 星空点沿用原材质的尺寸倍率（原 ParticleSystem 使用 sizeScale=6） */
const STAR_SIZE_SCALE = 6;

function randomPastelColor(baseHue: number): THREE.Color {
  const c = new THREE.Color();
  c.setHSL(baseHue + (Math.random() - 0.5) * 0.1, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.3);
  return c;
}

export class NodeStarLayer {
  readonly points: THREE.Points;
  /** 节点段数组（前 nodeCount 段），由 GalaxyScene 直接填充 */
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly years: Float32Array;

  private readonly material: THREE.ShaderMaterial;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly yearAttr: THREE.BufferAttribute;

  private readonly starBasePositions: Float32Array;
  private readonly starPhases: Float32Array;
  private readonly starSizes: Float32Array;
  private readonly starVelocities: Float32Array;
  private starTime = 0;
  private pulseLevel = 0;
  private reducedMotion = false;
  /** 地理模式下星空被隐藏，同时跳过漂移计算以节省算力 */
  private geoMode = false;

  /** 节点段属性引用（供渲染层逐点更新位置/尺寸/颜色） */
  readonly attributes: {
    position: THREE.BufferAttribute;
    color: THREE.BufferAttribute;
    size: THREE.BufferAttribute;
    year: THREE.BufferAttribute;
  };

  constructor(private readonly nodeCount: number) {
    const total = nodeCount + STAR_COUNT;
    this.positions = new Float32Array(total * 3);
    this.colors = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    this.sizes = sizes;
    this.years = new Float32Array(total);
    const temporals = new Float32Array(total);
    const opacities = new Float32Array(total);

    // 节点段：参与时间裁剪，透明度交给 uOpacity（LOD 控制）
    for (let i = 0; i < nodeCount; i++) {
      temporals[i] = 1;
    }

    this.starBasePositions = new Float32Array(STAR_COUNT * 3);
    this.starPhases = new Float32Array(STAR_COUNT);
    this.starSizes = new Float32Array(STAR_COUNT);
    this.starVelocities = new Float32Array(STAR_COUNT * 3);
    this.initStars(total, sizes, temporals, opacities);

    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);
    this.yearAttr = new THREE.BufferAttribute(this.years, 1);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('aColor', this.colorAttr);
    geometry.setAttribute('aSize', this.sizeAttr);
    geometry.setAttribute('aYear', this.yearAttr);
    geometry.setAttribute('aTemporal', new THREE.BufferAttribute(temporals, 1));
    geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

    this.material = createGlowPointsMaterial(1, 1);
    this.attributes = {
      position: this.positionAttr,
      color: this.colorAttr,
      size: this.sizeAttr,
      year: this.yearAttr,
    };
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** 星空段常驻显示（不参与时间裁剪），透明度固定为 0.85 */
  private initStars(total: number, sizes: Float32Array, temporals: Float32Array, opacities: Float32Array): void {
    const HUE_TANG = 0.10;
    const HUE_SONG = 0.58;
    const HUE_COLD = 0.65;
    const color = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i++) {
      const idx = this.nodeCount + i;
      const i3 = idx * 3;
      const x = (Math.random() - 0.5) * STAR_SPREAD;
      const y = (Math.random() - 0.5) * STAR_SPREAD;
      const z = (Math.random() - 0.5) * STAR_SPREAD;

      this.positions[i3] = x;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = z;
      this.starBasePositions[i * 3] = x;
      this.starBasePositions[i * 3 + 1] = y;
      this.starBasePositions[i * 3 + 2] = z;

      const dist = Math.sqrt(x * x + y * y + z * z) / STAR_SPREAD;
      const hue = dist < 0.3 ? HUE_TANG : dist < 0.6 ? HUE_SONG : HUE_COLD;
      color.copy(randomPastelColor(hue + (Math.random() - 0.5) * 0.15));
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      const size = 0.15 + Math.random() * 0.6;
      this.starSizes[i] = size;
      sizes[idx] = size * STAR_SIZE_SCALE;
      this.starPhases[i] = Math.random() * Math.PI * 2;

      this.starVelocities[i * 3] = (Math.random() - 0.5) * 0.008;
      this.starVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
      this.starVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.008;

      temporals[idx] = 0;
      opacities[idx] = 0.85;
    }
  }

  /** 节点段属性变更后仅上传节点区间 */
  markNodesDirty(): void {
    const nodeVerts = this.nodeCount;
    if (nodeVerts > 0) {
      this.positionAttr.clearUpdateRanges();
      this.positionAttr.addUpdateRange(0, nodeVerts * 3);
      this.positionAttr.needsUpdate = true;
      this.colorAttr.clearUpdateRanges();
      this.colorAttr.addUpdateRange(0, nodeVerts * 3);
      this.colorAttr.needsUpdate = true;
      this.sizeAttr.clearUpdateRanges();
      this.sizeAttr.addUpdateRange(0, nodeVerts);
      this.sizeAttr.needsUpdate = true;
      this.yearAttr.clearUpdateRanges();
      this.yearAttr.addUpdateRange(0, nodeVerts);
      this.yearAttr.needsUpdate = true;
    }
  }

  /** 每帧呼吸动画：仅上传节点位置与尺寸区间 */
  markNodeTransformsDirty(): void {
    const nodeVerts = this.nodeCount;
    if (nodeVerts > 0) {
      this.positionAttr.clearUpdateRanges();
      this.positionAttr.addUpdateRange(0, nodeVerts * 3);
      this.positionAttr.needsUpdate = true;
      this.sizeAttr.clearUpdateRanges();
      this.sizeAttr.addUpdateRange(0, nodeVerts);
      this.sizeAttr.needsUpdate = true;
    }
  }

  /** 仅节点颜色变更（悬停高亮）时上传节点颜色区间 */
  markNodeColorsDirty(): void {
    const nodeVerts = this.nodeCount;
    if (nodeVerts > 0) {
      this.colorAttr.clearUpdateRanges();
      this.colorAttr.addUpdateRange(0, nodeVerts * 3);
      this.colorAttr.needsUpdate = true;
    }
  }

  /** 每帧更新星空段，仅上传星空区间 */
  updateStars(deltaMs: number): void {
    if (this.reducedMotion || this.geoMode) return;
    this.starTime += deltaMs * 0.001;
    const t = this.starTime;
    const base = this.nodeCount;

    for (let i = 0; i < STAR_COUNT; i++) {
      const idx = base + i;
      const i3 = idx * 3;
      this.positions[i3] = this.starBasePositions[i * 3]
        + Math.sin(t * 0.1 + this.starPhases[i]) * 0.8
        + this.starVelocities[i * 3] * t * 0.3;
      this.positions[i3 + 1] = this.starBasePositions[i * 3 + 1]
        + Math.cos(t * 0.08 + this.starPhases[i] * 1.3) * 0.6
        + this.starVelocities[i * 3 + 1] * t * 0.3;
      this.positions[i3 + 2] = this.starBasePositions[i * 3 + 2]
        + Math.sin(t * 0.06 + this.starPhases[i] * 0.7) * 0.7
        + this.starVelocities[i * 3 + 2] * t * 0.3;

      const twinkle = 0.5 + 0.5 * Math.sin(t * 1.2 + this.starPhases[i]);
      this.sizes[idx] = this.starSizes[i] * (0.6 + 0.4 * twinkle) * (1 + 0.5 * this.pulseLevel) * STAR_SIZE_SCALE;
    }

    // 追加星空区间（节点区间可能已由 markNodeTransformsDirty 标记，不能清空）
    this.positionAttr.addUpdateRange(base * 3, STAR_COUNT * 3);
    this.positionAttr.needsUpdate = true;
    this.sizeAttr.addUpdateRange(base, STAR_COUNT);
    this.sizeAttr.needsUpdate = true;
  }

  setVisibleRange(from: number, to: number, fadeYears: number): void {
    this.material.uniforms.uYearFrom.value = from;
    this.material.uniforms.uYearTo.value = to;
    this.material.uniforms.uFadeYears.value = fadeYears;
  }

  setRecitationPulse(level: number): void {
    this.pulseLevel = Math.min(1, Math.max(0, level));
    this.material.uniforms.uPulse.value = this.pulseLevel;
  }

  /** 地理模式下关闭星空段（节点仍正常显示） */
  setGeoMode(active: boolean): void {
    this.geoMode = active;
    this.material.uniforms.uStarVisible.value = active ? 0 : 1;
  }

  setLod(sizeScale: number, opacity: number): void {
    this.material.uniforms.uSizeScale.value = sizeScale;
    this.material.uniforms.uOpacity.value = opacity;
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
