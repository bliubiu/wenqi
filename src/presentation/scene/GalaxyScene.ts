import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Node } from '@/infrastructure/data/DataLoader';
import { ParticleSystem } from './ParticleSystem';
import { CameraController } from './CameraController';
import { EdgeRenderer } from './EdgeRenderer';
import { LabelRenderer } from './LabelRenderer';
import { NodeStarLayer } from './NodeStarLayer';
import { lodVisual } from './lod';
import { getConfig } from '@/infrastructure/config/ConfigLoader';
import { buildGeoGridVertices, canCheckDivergence, computeGeoFrame } from './geoLayout';

const DYNASTY_COLORS: Record<string, number> = {
  PRE_QIN: 0x3a4a5c, HAN: 0x8b7355, WEI_JIN: 0x6fae8e,
  TANG: 0xd4a24c, SONG: 0x7ba7d9, YUAN: 0xb5523e,
  MING: 0xc9866b, QING: 0x8c6fae, MODERN: 0x5a8c7a,
};

/** 地理布局下隐藏节点的临时安置高度（远离视野，避免 1px 点残留） */
const HIDDEN_NODE_Y = -5000;

interface ConvergenceState {
  isConverging: boolean;
  focusNode: Node | null;
  relatedNodes: Node[];
  startTime: number;
  duration: number;
  targetPositions: Map<string, THREE.Vector3>;
}

interface Cluster {
  dynasty: string;
  center: THREE.Vector3;
  nodeCount: number;
  color: number;
}

interface DivergenceState {
  isDiverging: boolean;
  isActive: boolean;
  clusters: Cluster[];
  startTime: number;
  duration: number;
}

export interface HoverInfo {
  node: Node;
  screenX: number;
  screenY: number;
}

export class GalaxyScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private instancedMesh: THREE.InstancedMesh | null = null;
  /** 节点 + 星空合并渲染层（单一 Points，单次 draw call） */
  private nodeStarLayer: NodeStarLayer | null = null;
  private nodeColors: Float32Array | null = null;
  private clusterMeshes: THREE.Mesh[] = [];
  private nodes: Node[] = [];
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private selectedNode: Node | null = null;
  private animationId: number | null = null;
  /** 当前布局模式：螺旋星系（三气投影）/ 籍贯地理投影 */
  private layoutMode: 'spiral' | 'geo' = 'spiral';
  /** 地理布局下具有籍贯坐标的节点 id（其余节点隐藏，避免残留螺旋盘干扰读图） */
  private geoNodeIds: Set<string> = new Set();
  /** 经纬网格参照线（仅地理布局显示） */
  private geoGrid: THREE.LineSegments | null = null;
  /** 中国轮廓底图线条（仅地理布局显示） */
  private geoOutline: THREE.LineSegments | null = null;

  private convergence: ConvergenceState = {
    isConverging: false, focusNode: null, relatedNodes: [],
    startTime: 0, duration: 1000, targetPositions: new Map(),
  };

  private divergence: DivergenceState = {
    isDiverging: false, isActive: false, clusters: [],
    startTime: 0, duration: 800,
  };

  private onNodeSelect: ((node: Node | null) => void) | null = null;
  private onDivergenceChange: ((isActive: boolean) => void) | null = null;
  private onConvergenceChange: ((state: 'idle' | 'converging' | 'focused') => void) | null = null;
  private onHover: ((info: HoverInfo | null) => void) | null = null;

  private divergenceThreshold = getConfig().get('rendering').divergenceThreshold;
  private lodThresholds = getConfig().get('rendering').lodThresholds;
  private currentLodLevel = -1;
  private dimensionWeights = { talent: 1, popularity: 1, luck: 1 };
  private originalPositions: Map<string, THREE.Vector3> = new Map();
  private reducedMotion = false;
  /** 主题漫游进行中：禁用散气自动触发，避免镜头飞行途中误入聚类视图 */
  private tourActive = false;
  /** 时间演化回放进行中：禁用散气自动触发 */
  private timeTravelActive = false;
  /** 时间区间可见范围（年生硬剔除口径），null 表示全量 */
  private visibleYearFrom = -99999;
  private visibleYearTo = 99999;

  private static ORIGIN = new THREE.Vector3(0, 0, 0);

  private boundResize: (() => void) | null = null;
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private pointerDownPos = { x: 0, y: 0 };
  private boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundPointerUp: ((e: PointerEvent) => void) | null = null;
  private boundPointerMove: ((e: PointerEvent) => void) | null = null;

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private particleSystem: ParticleSystem | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  /** 当前主诗人的关系流缓存（双诗人对比时用于重建叠加层） */
  private primaryRelationFlows: Array<{ node: Node; type: string; weight: number }> = [];

  private needsMatrixUpdate = true;
  private reusePosition = new THREE.Vector3();
  private reuseScale = new THREE.Vector3();
  private reuseMatrix = new THREE.Matrix4();
  private reuseQuaternion = new THREE.Quaternion();

  private reuseVecA = new THREE.Vector3();
  private reuseVecB = new THREE.Vector3();
  private nodeIdMap: Map<string, Node> = new Map();

  // 委托模块
  private cameraController: CameraController;
  private edgeRenderer: EdgeRenderer;
  private labelRenderer: LabelRenderer;

  // 悬停
  private hoveredInstanceIndex = -1;
  private originalHoverColor = new THREE.Color();
  private reuseHighlightColor = new THREE.Color();
  private reuseWhite = new THREE.Color(0xffffff);

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75, container.clientWidth / container.clientHeight, 0.1, 1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.cameraController = new CameraController(this.camera, this.controls);
    this.edgeRenderer = new EdgeRenderer(this.scene);
    this.labelRenderer = new LabelRenderer(this.scene);

    this.init();
  }

  /* ──── 初始化 ────────────────────────────────── */

  private init(): void {
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.container.appendChild(this.renderer.domElement);

    this.camera.position.set(50, 50, 50);
    this.camera.lookAt(0, 0, 0);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 200;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(50, 50, 50);
    this.scene.add(pointLight);

    // 指数雾——增强纵深感，远距离节点隐入雾中
    this.scene.fog = new THREE.FogExp2(0x07060f, 0.0028);

    // 后期特效：辉光 Bloom
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
      0.3,    // strength — 辉光强度
      0.45,   // radius  — 辉光半径
      0.75    // threshold — 亮度阈值
    );
    this.composer.addPass(this.bloomPass);

    this.particleSystem = new ParticleSystem(this.scene);
    // 首屏先创建仅星空的合并层，节点数据到达后按实际数量重建
    this.nodeStarLayer = new NodeStarLayer(0);
    this.scene.add(this.nodeStarLayer.points);
    this.addAxesHelper();
    this.addEventListeners();
    this.animate();
  }

  private addAxesHelper(): void {
    this.axesHelper = new THREE.AxesHelper(50);
    this.scene.add(this.axesHelper);
  }

  private addEventListeners(): void {
    this.boundResize = () => this.onWindowResize();
    window.addEventListener('resize', this.boundResize);

    this.boundKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.unfocus();
    };
    window.addEventListener('keydown', this.boundKeyDown);

    const canvas = this.renderer.domElement;

    this.boundPointerDown = (e: PointerEvent) => {
      this.pointerDownPos.x = e.clientX;
      this.pointerDownPos.y = e.clientY;
    };
    canvas.addEventListener('pointerdown', this.boundPointerDown);

    this.boundPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        this.onCanvasClick(e);
      }
    };
    canvas.addEventListener('pointerup', this.boundPointerUp);

    this.boundPointerMove = (e: PointerEvent) => {
      this.onCanvasMove(e);
    };
    canvas.addEventListener('pointermove', this.boundPointerMove);
  }

  /* ──── 回调设置 ──────────────────────────────── */

  setOnNodeSelect(callback: (node: Node | null) => void): void {
    this.onNodeSelect = callback;
  }
  setOnDivergenceChange(callback: (isActive: boolean) => void): void {
    this.onDivergenceChange = callback;
  }
  setOnConvergenceChange(callback: (state: 'idle' | 'converging' | 'focused') => void): void {
    this.onConvergenceChange = callback;
  }
  setOnHover(callback: (info: HoverInfo | null) => void): void {
    this.onHover = callback;
  }

  private notifyConvergence(state: 'idle' | 'converging' | 'focused'): void {
    if (this.onConvergenceChange) this.onConvergenceChange(state);
  }

  /* ──── 窗口 ──────────────────────────────────── */

  private onWindowResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    if (this.composer) {
      this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }

  /* ──── 点击 ──────────────────────────────────── */

  private onCanvasClick(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.divergence.isActive) {
      const clusterMeshes = this.clusterMeshes.filter((m) => m.visible);
      const clusterIntersects = this.raycaster.intersectObjects(clusterMeshes);
      if (clusterIntersects.length > 0) {
        const clickedMesh = clusterIntersects[0].object as THREE.Mesh;
        this.zoomToDynasty(clickedMesh.userData.dynasty);
        return;
      }
    }

    if (this.instancedMesh && !this.divergence.isActive) {
      const intersects = this.raycaster.intersectObject(this.instancedMesh);
      const hit = intersects.find(
        (item) => item.instanceId !== undefined && this.isPickable(this.nodes[item.instanceId])
      );
      if (hit) {
        const clickedNode = this.nodes[hit.instanceId!];
        if (this.convergence.focusNode === clickedNode) {
          this.unfocus();
        } else {
          this.focusNode(clickedNode);
        }
      } else {
        this.unfocus();
      }
    }
  }

  /* ──── 悬停 ──────────────────────────────────── */

  private onCanvasMove(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const prevHovered = this.hoveredInstanceIndex;

    if (!this.instancedMesh || this.divergence.isActive) {
      this.clearHover(prevHovered);
      if (this.onHover) this.onHover(null);
      return;
    }

    const intersects = this.raycaster.intersectObject(this.instancedMesh);
    const hit = intersects.find(
      (item) => item.instanceId !== undefined && this.isPickable(this.nodes[item.instanceId])
    );

    if (hit) {
      const idx = hit.instanceId!;
      if (idx !== this.hoveredInstanceIndex) {
        this.clearHover(prevHovered);
        this.hoveredInstanceIndex = idx;
        this.setInstanceHighlight(idx, true);
        this.container.style.cursor = 'pointer';
        if (this.onHover) {
          this.onHover({
            node: this.nodes[idx],
            screenX: event.clientX,
            screenY: event.clientY,
          });
        }
      }
    } else {
      this.clearHover(prevHovered);
      this.container.style.cursor = 'default';
      if (this.onHover) this.onHover(null);
    }
  }

  private clearHover(instanceIdx: number): void {
    if (instanceIdx >= 0 && this.nodeColors) {
      this.setInstanceHighlight(instanceIdx, false);
    }
    this.hoveredInstanceIndex = -1;
  }

  private setInstanceHighlight(idx: number, highlight: boolean): void {
    if (!this.nodeColors || !this.nodeStarLayer) return;

    const base = idx * 3;
    if (highlight) {
      this.originalHoverColor.setRGB(
        this.nodeColors[base], this.nodeColors[base + 1], this.nodeColors[base + 2]
      );
      this.reuseHighlightColor.copy(this.originalHoverColor).lerp(this.reuseWhite, 0.5);
    } else {
      this.reuseHighlightColor.copy(this.originalHoverColor);
    }

    this.nodeColors[base] = this.reuseHighlightColor.r;
    this.nodeColors[base + 1] = this.reuseHighlightColor.g;
    this.nodeColors[base + 2] = this.reuseHighlightColor.b;

    this.nodeStarLayer.markNodeColorsDirty();
  }

  /* ──── 数据 ──────────────────────────────────── */

  async loadNodes(nodes: Node[]): Promise<void> {
    this.nodes = nodes;
    this.nodeIdMap = new Map(nodes.map((n) => [n.id, n]));
    this.createInstancedMesh();
    this.calculateClusters();
  }

  private createInstancedMesh(): void {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      (this.instancedMesh.material as THREE.Material).dispose();
    }
    this.destroyNodePoints();
    this.currentLodLevel = -1;

    const count = this.nodes.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const years = new Float32Array(count);
    const color = new THREE.Color();

    // 拾取体：不可见球体，仅用于射线检测
    this.instancedMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial(),
      count
    );
    this.instancedMesh.visible = false;

    for (let i = 0; i < count; i++) {
      const node = this.nodes[i];
      positions[i * 3] = node.position.x;
      positions[i * 3 + 1] = node.position.y;
      positions[i * 3 + 2] = node.position.z;

      color.setHex(DYNASTY_COLORS[node.dynasty] || 0xffffff);
      color.multiplyScalar(node.brightness);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = this.getNodeScale(node) * 2.5;
      years[i] = node.birthYear ?? 0;

      const pickScale = this.getNodeScale(node) * 0.55;
      this.reusePosition.set(node.position.x, node.position.y, node.position.z);
      this.reuseScale.set(pickScale, pickScale, pickScale);
      this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
      this.instancedMesh.setMatrixAt(i, this.reuseMatrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);

    // 渲染体：节点段与星空段共用同一 Points 与同一套着色器
    const layer = new NodeStarLayer(count);
    layer.positions.set(positions);
    layer.colors.set(colors);
    layer.sizes.set(sizes);
    layer.years.set(years);
    layer.markNodesDirty();

    // 新材质默认值需同步当前时间区间/地理模式/减动效状态
    layer.setVisibleRange(this.visibleYearFrom, this.visibleYearTo, 0);
    layer.setGeoMode(this.layoutMode === 'geo');
    layer.setReducedMotion(this.reducedMotion);

    this.nodeColors = layer.colors;
    this.nodeStarLayer = layer;
    this.scene.add(layer.points);
  }

  private destroyNodePoints(): void {
    if (!this.nodeStarLayer) return;
    this.scene.remove(this.nodeStarLayer.points);
    this.nodeStarLayer.dispose();
    this.nodeStarLayer = null;
    this.nodeColors = null;
  }

  /* ──── 气团 ──────────────────────────────────── */

  private calculateClusters(): void {
    const clusterMap = new Map<string, { sum: THREE.Vector3; count: number }>();
    for (const node of this.nodes) {
      if (!clusterMap.has(node.dynasty)) {
        clusterMap.set(node.dynasty, { sum: new THREE.Vector3(0, 0, 0), count: 0 });
      }
      const cluster = clusterMap.get(node.dynasty)!;
      cluster.sum.x += node.position.x;
      cluster.sum.y += node.position.y;
      cluster.sum.z += node.position.z;
      cluster.count++;
    }

    this.divergence.clusters = [];
    clusterMap.forEach((data, dynasty) => {
      this.divergence.clusters.push({
        dynasty,
        center: new THREE.Vector3(data.sum.x / data.count, data.sum.y / data.count, data.sum.z / data.count),
        nodeCount: data.count,
        color: DYNASTY_COLORS[dynasty] || 0xffffff,
      });
    });
    this.createClusterMeshes();
  }

  private createClusterMeshes(): void {
    this.clusterMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.clusterMeshes = [];

    for (const cluster of this.divergence.clusters) {
      const radius = Math.max(5, Math.min(20, Math.sqrt(cluster.nodeCount) * 2));
      const geometry = new THREE.SphereGeometry(radius, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: cluster.color, transparent: true, opacity: 0.6,
        emissive: cluster.color, emissiveIntensity: 0.2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(cluster.center);
      mesh.userData = { dynasty: cluster.dynasty, nodeCount: cluster.nodeCount };
      mesh.visible = false;
      this.scene.add(mesh);
      this.clusterMeshes.push(mesh);
    }
  }

  /* ──── 聚焦（聚气） ──────────────────────────── */

  focusNode(node: Node): void {
    if (this.divergence.isActive) this.exitDivergence();

    this.edgeRenderer.clear();
    this.labelRenderer.clear();
    this.primaryRelationFlows = [];

    const relatedNodes = this.nodes.filter(
      (n) => n.id !== node.id && n.dynasty === node.dynasty && this.isPickable(n)
    ).slice(0, 50);

    const targetPositions = new Map<string, THREE.Vector3>();
    const focusPos = this.reuseVecA.set(node.position.x, node.position.y, node.position.z);
    targetPositions.set(node.id, focusPos.clone());

    const tempVec = new THREE.Vector3();
    relatedNodes.forEach((relatedNode, index) => {
      const angle = (index / relatedNodes.length) * Math.PI * 2;
      const radius = 5 + Math.random() * 5;
      tempVec.set(
        focusPos.x + Math.cos(angle) * radius,
        focusPos.y + Math.sin(angle) * radius,
        focusPos.z + (Math.random() - 0.5) * radius,
      );
      targetPositions.set(relatedNode.id, tempVec.clone());
    });

    this.convergence = {
      isConverging: true, focusNode: node, relatedNodes,
      startTime: Date.now(), duration: this.reducedMotion ? 1 : 1000, targetPositions,
    };

    if (this.particleSystem) {
      const flowPaths = relatedNodes.map((rn) => ({
        from: this.reuseVecB.set(rn.position.x, rn.position.y, rn.position.z).clone(),
        to: focusPos.clone(),
      }));
      this.particleSystem.loadFlowPaths(flowPaths);
      this.particleSystem.setFlowActive(true);
    }

    this.selectedNode = node;
    if (this.onNodeSelect) this.onNodeSelect(node);
    this.notifyConvergence('converging');

    const cameraTarget = focusPos.clone().add(new THREE.Vector3(20, 20, 20));
    if (this.reducedMotion) {
      this.camera.position.copy(cameraTarget);
      this.controls.target.copy(focusPos);
    } else {
      this.cameraController.moveTo(cameraTarget, focusPos.clone());
    }
    this.edgeRenderer.build(node, relatedNodes);
    this.labelRenderer.build(node, relatedNodes);
  }

  /* ──── 关系流（文脉类型化呈现） ──────────────── */

  /**
   * 关系数据懒加载到达后，以真实关系替换兜底气流：
   * - 追加关系目标到收敛目标位（动画中随收敛动画吸附，已完成则直接吸附）
   * - 边粒子按关系类型着色、权重加权（EdgeRenderer.buildFromRelations）
   * - 无关系时保留同朝代兜底（flows 为空直接返回）
   */
  setRelationFlows(focusNodeId: string, flows: Array<{ node: Node; type: string; weight: number }>): void {
    const focus = this.convergence.focusNode;
    if (!focus || focus.id !== focusNodeId || flows.length === 0) return;

    // 目标去重（排除焦点自身、已入环节点与时间区间外节点）
    const seen = new Set(this.convergence.targetPositions.keys());
    const relNodes: Node[] = [];
    const visibleFlows: Array<{ node: Node; type: string; weight: number }> = [];
    for (const f of flows) {
      if (seen.has(f.node.id) || !this.isYearVisible(f.node)) continue;
      seen.add(f.node.id);
      relNodes.push(f.node);
      visibleFlows.push(f);
    }
    if (relNodes.length === 0) {
      this.primaryRelationFlows = [];
      this.edgeRenderer.buildFromRelations(focus, visibleFlows);
      return;
    }

    // 追加环形目标位（接着已排布节点继续编号）
    const existingCount = this.convergence.targetPositions.size;
    const total = existingCount + relNodes.length;
    const tempVec = new THREE.Vector3();
    relNodes.forEach((rn, idx) => {
      const angle = ((existingCount + idx) / total) * Math.PI * 2;
      const radius = 5 + ((idx * 37) % 50) / 10;
      tempVec.set(
        focus.position.x + Math.cos(angle) * radius,
        focus.position.y + Math.sin(angle) * radius,
        focus.position.z + ((idx % 7) - 3),
      );
      this.convergence.targetPositions.set(rn.id, tempVec.clone());
    });

    // relatedNodes 合并（取消聚焦时保证所有已移动节点回位）
    const merged = [...this.convergence.relatedNodes];
    for (const rn of relNodes) {
      if (!merged.some((n) => n.id === rn.id)) merged.push(rn);
    }
    this.convergence.relatedNodes = merged;

    // 聚焦动画已完成的节点直接吸附到目标位
    if (!this.convergence.isConverging) {
      for (const rn of relNodes) {
        const t = this.convergence.targetPositions.get(rn.id)!;
        rn.position.x = t.x;
        rn.position.y = t.y;
        rn.position.z = t.z;
      }
      this.updateInstancedMeshPositions();
    }

    this.edgeRenderer.buildFromRelations(focus, visibleFlows);
    this.primaryRelationFlows = visibleFlows;
    this.labelRenderer.build(focus, relNodes);
    if (this.particleSystem) {
      this.particleSystem.loadFlowPaths(
        relNodes.map((rn) => ({
          from: this.reuseVecB.set(rn.position.x, rn.position.y, rn.position.z).clone(),
          to: this.reuseVecA.set(focus.position.x, focus.position.y, focus.position.z).clone(),
        }))
      );
      this.particleSystem.setFlowActive(true);
    }
  }

  /* ──── 双诗人对比（关系网叠加） ──────────────── */

  /**
   * 在已聚焦主诗人的关系流之上叠加对比诗人的关系流：
   * 对比诗人关系目标保持原位（不参与聚气收敛），仅绘制类型化气流弧线。
   */
  setCompareRelations(
    compareNode: Node,
    flows: Array<{ node: Node; type: string; weight: number }>
  ): void {
    const focus = this.convergence.focusNode;
    if (!focus) return;

    this.edgeRenderer.clear();
    if (this.primaryRelationFlows.length > 0) {
      this.edgeRenderer.appendFromRelations(focus, this.primaryRelationFlows);
    }
    const visible = flows.filter((f) => f.node.id !== focus.id && this.isYearVisible(f.node));
    if (visible.length > 0) this.edgeRenderer.appendFromRelations(compareNode, visible);
  }

  /** 退出对比：移除叠加层，仅保留主诗人关系流 */
  clearCompareRelations(): void {
    const focus = this.convergence.focusNode;
    if (!focus) return;
    this.edgeRenderer.clear();
    if (this.primaryRelationFlows.length > 0) {
      this.edgeRenderer.appendFromRelations(focus, this.primaryRelationFlows);
    }
  }

  /* ──── 取消聚焦（散气） ──────────────────────── */

  unfocus(): void {
    if (!this.convergence.focusNode) return;
    this.primaryRelationFlows = [];

    const targetPositions = new Map<string, THREE.Vector3>();
    const tempVec = new THREE.Vector3();
    this.convergence.relatedNodes.forEach((n) => {
      tempVec.set(n.basePosition.x, n.basePosition.y, n.basePosition.z);
      targetPositions.set(n.id, tempVec.clone());
    });
    tempVec.set(this.convergence.focusNode.basePosition.x, this.convergence.focusNode.basePosition.y, this.convergence.focusNode.basePosition.z);
    targetPositions.set(this.convergence.focusNode.id, tempVec.clone());

    this.convergence = {
      isConverging: true, focusNode: null, relatedNodes: this.convergence.relatedNodes,
      startTime: Date.now(), duration: this.reducedMotion ? 1 : 800, targetPositions,
    };

    this.particleSystem?.setFlowActive(false);
    this.selectedNode = null;
    if (this.onNodeSelect) this.onNodeSelect(null);
    this.notifyConvergence('converging');

    if (this.reducedMotion) {
      this.camera.position.set(50, 50, 50);
      this.controls.target.set(0, 0, 0);
    } else {
      this.cameraController.reset();
    }
    this.edgeRenderer.clear();
    this.labelRenderer.clear();
  }

  /* ──── 散气模式 ──────────────────────────────── */

  private enterDivergence(): void {
    if (this.divergence.isActive) return;
    this.divergence.isDiverging = true;
    this.divergence.startTime = Date.now();

    this.clusterMeshes.forEach((mesh) => {
      mesh.visible = true;
      mesh.scale.set(0.01, 0.01, 0.01);
    });
    if (this.instancedMesh) this.instancedMesh.visible = false;

    if (this.particleSystem) {
      const nebulaClusters = this.divergence.clusters.map((c) => ({
        center: c.center, color: c.color, nodeCount: c.nodeCount,
      }));
      this.particleSystem.loadNebulaClusters(nebulaClusters);
      this.particleSystem.setNebulaActive(true);
    }
  }

  private exitDivergence(): void {
    if (!this.divergence.isActive) return;
    this.divergence.isDiverging = true;
    this.divergence.startTime = Date.now();
    this.clusterMeshes.forEach((mesh) => { mesh.visible = false; });
    if (this.instancedMesh) this.instancedMesh.visible = true;
    this.particleSystem?.setNebulaActive(false);
  }

  private zoomToDynasty(dynasty: string): void {
    const cluster = this.divergence.clusters.find((c) => c.dynasty === dynasty);
    if (!cluster) return;
    this.exitDivergence();
    this.reuseVecA.set(20, 20, 20).add(cluster.center);
    if (this.reducedMotion) {
      this.camera.position.copy(this.reuseVecA);
      this.controls.target.copy(cluster.center);
    } else {
      this.cameraController.moveTo(this.reuseVecA, cluster.center);
    }
  }

  /** 主题漫游：镜头飞向指定朝代的星团中心 */
  focusCluster(dynasty: string): void {
    this.zoomToDynasty(dynasty);
  }

  /* ──── 动画循环 ──────────────────────────────── */

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.applyLod();
    this.checkDivergenceState();
    this.cameraController.update();
    this.updateDivergenceAnimation();
    this.updateConvergenceAnimation();
    this.updateNodeAnimation();
    this.nodeStarLayer?.updateStars(16);
    this.edgeRenderer.update();
    this.particleSystem?.update(16);

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ──── 散气状态检测 ──────────────────────────── */

  /** 按相机距离应用 LOD 档位（阈值来自配置），仅档位变化时写 uniform */
  private applyLod(): void {
    if (!this.nodeStarLayer) return;
    const visual = lodVisual(this.camera.position.distanceTo(GalaxyScene.ORIGIN), this.lodThresholds);
    if (visual.level === this.currentLodLevel) return;
    this.currentLodLevel = visual.level;
    this.nodeStarLayer.setLod(visual.sizeScale, visual.opacity);
  }

  private checkDivergenceState(): void {
    // 漫游中禁用散气自动触发；地理布局相机固定在远景；布局切换动画期间也跳过
    if (this.tourActive || this.timeTravelActive) return;
    if (!canCheckDivergence(this.layoutMode, this.cameraController.isAnimating())) return;
    const cameraDistance = this.camera.position.distanceTo(GalaxyScene.ORIGIN);
    if (cameraDistance > this.divergenceThreshold && !this.divergence.isActive && !this.convergence.focusNode) {
      this.enterDivergence();
      this.divergence.isActive = true;
      if (this.onDivergenceChange) this.onDivergenceChange(true);
      this.notifyConvergence('idle');
    } else if (cameraDistance < this.divergenceThreshold * 0.8 && this.divergence.isActive) {
      this.exitDivergence();
      this.divergence.isActive = false;
      if (this.onDivergenceChange) this.onDivergenceChange(false);
    }
  }

  private updateDivergenceAnimation(): void {
    if (!this.divergence.isDiverging) return;
    const elapsed = Date.now() - this.divergence.startTime;
    const progress = Math.min(elapsed / this.divergence.duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    this.clusterMeshes.forEach((mesh) => {
      if (mesh.visible) {
        mesh.scale.set(easedProgress, easedProgress, easedProgress);
      }
    });
    if (progress >= 1) this.divergence.isDiverging = false;
  }

  /* ──── 聚气/散气动画 ────────────────────────── */

  private updateConvergenceAnimation(): void {
    if (!this.convergence.isConverging || !this.instancedMesh) return;

    const elapsed = Date.now() - this.convergence.startTime;
    const progress = Math.min(elapsed / this.convergence.duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const targetPos = this.convergence.targetPositions.get(node.id);
      if (targetPos) {
        this.reuseVecA.set(node.position.x, node.position.y, node.position.z);
        this.reusePosition.lerpVectors(this.reuseVecA, targetPos, easedProgress);

        let nodeScale = this.getNodeScale(node);
        if (this.convergence.focusNode && node.id === this.convergence.focusNode.id) {
          nodeScale = this.getNodeScale(node) * (1 + easedProgress * 0.5);
        }
        if (this.isNodeHidden(node)) nodeScale = 0;
        this.reuseScale.set(nodeScale, nodeScale, nodeScale);
        this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
        this.instancedMesh.setMatrixAt(i, this.reuseMatrix);
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;

    if (this.convergence.focusNode) {
      this.edgeRenderer.updateProgress(
        this.convergence.focusNode,
        this.convergence.targetPositions,
        easedProgress
      );
      this.labelRenderer.updateProgress(
        this.convergence.focusNode,
        this.convergence.targetPositions,
        easedProgress
      );
    }

    if (progress >= 1) {
      this.convergence.isConverging = false;
      this.notifyConvergence(this.convergence.focusNode ? 'focused' : 'idle');

      this.convergence.targetPositions.forEach((targetPos, nodeId) => {
        const node = this.nodeIdMap.get(nodeId);
        if (node) {
          node.position.x = targetPos.x;
          node.position.y = targetPos.y;
          node.position.z = targetPos.z;
        }
      });
    }
  }

  /* ──── 节点呼吸动画 ──────────────────────────── */

  private updateNodeAnimation(): void {
    if (!this.instancedMesh || this.convergence.isConverging || this.divergence.isActive) return;
    if (this.reducedMotion && !this.needsMatrixUpdate) return;
    if (!this.reducedMotion) this.needsMatrixUpdate = true;
    if (!this.needsMatrixUpdate) return;
    this.needsMatrixUpdate = false;

    const time = Date.now() * 0.001;
    const positionAttr = this.nodeStarLayer?.attributes.position;
    const sizeAttr = this.nodeStarLayer?.attributes.size;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      let breathScale = 1;
      if (!this.reducedMotion) {
        breathScale = 1 + Math.sin(time * 2 + node.phase) * 0.1;
      }

      this.reusePosition.set(node.position.x, node.position.y, node.position.z);

      let nodeScale = this.getNodeScale(node) * breathScale;
      if (i === this.hoveredInstanceIndex) {
        nodeScale *= 1.3;
      }
      if (this.convergence.focusNode && node.id === this.convergence.focusNode.id) {
        nodeScale = this.getNodeScale(node) * 1.5 * breathScale;
      }
      if (this.isNodeHidden(node)) {
        // 隐藏节点移到视野外：部分驱动会把点尺寸下限钳到 1px，仅置 0 仍会残留微光
        nodeScale = 0;
        this.reusePosition.set(0, HIDDEN_NODE_Y, 0);
      }

      const pickScale = nodeScale * 0.55;
      this.reuseScale.set(pickScale, pickScale, pickScale);
      this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
      this.instancedMesh.setMatrixAt(i, this.reuseMatrix);

      if (positionAttr && sizeAttr) {
        positionAttr.setXYZ(i, this.reusePosition.x, this.reusePosition.y, this.reusePosition.z);
        sizeAttr.setX(i, nodeScale * 2.5);
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.nodeStarLayer?.markNodeTransformsDirty();
  }

  /* ──── 维度权重 ──────────────────────────────── */

  updateDimensionWeights(weights: { talent: number; popularity: number; luck: number }): void {
    // 地理投影下不按三气缩放位置，避免破坏经纬度映射
    if (this.layoutMode === 'geo') return;
    this.dimensionWeights = weights;
    if (this.originalPositions.size === 0) {
      this.nodes.forEach((node) => {
        this.originalPositions.set(
          node.id, new THREE.Vector3(node.basePosition.x, node.basePosition.y, node.basePosition.z)
        );
      });
    }

    this.nodes.forEach((node) => {
      const originalPos = this.originalPositions.get(node.id);
      if (originalPos) {
        // 旋臂布局：人气缩放半径，运气缩放盘面高度
        node.position.x = originalPos.x * weights.popularity;
        node.position.y = originalPos.y * weights.luck;
        node.position.z = originalPos.z * weights.popularity;
      }
    });
    this.updateInstancedMeshPositions();
    this.calculateClusters();
  }

  private getNodeScale(node: Node): number {
    return node.size * 0.1 * this.dimensionWeights.talent;
  }

  /**
   * 切换布局：geoPositions 为按籍贯经纬度投影的坐标，缺失坐标的节点在 geo 模式下隐藏。
   */
  setLayoutMode(mode: 'spiral' | 'geo', geoPositions?: Map<string, { x: number; y: number; z: number }>): void {
    this.layoutMode = mode;
    this.geoNodeIds = mode === 'geo' ? new Set(geoPositions?.keys() ?? []) : new Set();
    this.originalPositions.clear();
    for (const node of this.nodes) {
      const target = mode === 'geo' ? geoPositions?.get(node.id) ?? node.basePosition : node.basePosition;
      node.position.x = target.x;
      node.position.y = target.y;
      node.position.z = target.z;
    }
    this.updateInstancedMeshPositions();
    this.calculateClusters();

    this.disposeGeoGrid();
    if (mode === 'geo' && geoPositions && geoPositions.size > 0) {
      this.geoGrid = this.buildGeoGrid();
      this.scene.add(this.geoGrid);
      this.frameGeoLayout(geoPositions);
    } else {
      this.disposeGeoOutline();
    }

    if (mode === 'spiral') {
      this.cameraController.reset();
    }

    // 地理模式弱化氛围层：隐藏星空段、星尘粒子与三轴坐标
    this.particleSystem?.setGeoMode(mode === 'geo');
    this.nodeStarLayer?.setGeoMode(mode === 'geo');
    if (this.axesHelper) this.axesHelper.visible = mode !== 'geo';
  }

  /** 注入中国轮廓线段顶点（lazy 加载后由表现层调用） */
  setGeoOutline(vertices: number[]): void {
    if (vertices.length === 0) return;
    this.disposeGeoOutline();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x93aec4, transparent: true, opacity: 0.55, depthWrite: false,
    });
    this.geoOutline = new THREE.LineSegments(geometry, material);
    this.geoOutline.renderOrder = 0;
    this.scene.add(this.geoOutline);
  }

  private disposeGeoOutline(): void {
    if (!this.geoOutline) return;
    this.scene.remove(this.geoOutline);
    this.geoOutline.geometry.dispose();
    (this.geoOutline.material as THREE.Material).dispose();
    this.geoOutline = null;
  }

  /** 构建经纬网格：10° 一格的 XZ 平面参考线，帮助判读籍贯星点的地理分布 */
  private buildGeoGrid(): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(buildGeoGridVertices(), 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0x6d90ad, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const grid = new THREE.LineSegments(geometry, material);
    grid.renderOrder = -1;
    return grid;
  }

  private disposeGeoGrid(): void {
    if (!this.geoGrid) return;
    this.scene.remove(this.geoGrid);
    this.geoGrid.geometry.dispose();
    (this.geoGrid.material as THREE.Material).dispose();
    this.geoGrid = null;
  }

  /** 地理布局下把相机拉到可见籍贯范围的远景，便于俯瞰整幅地图 */
  private frameGeoLayout(positions: Map<string, { x: number; y: number; z: number }>): void {
    const frame = computeGeoFrame(positions.values());
    if (!frame) return;
    this.cameraController.moveTo(
      new THREE.Vector3(frame.camera.x, frame.camera.y, frame.camera.z),
      new THREE.Vector3(frame.target.x, frame.target.y, frame.target.z)
    );
  }

  /** 地理布局下无籍贯坐标的节点不参与渲染与拾取 */
  private isNodeHidden(node: Node): boolean {
    return this.layoutMode === 'geo' && !this.geoNodeIds.has(node.id);
  }

  /** 时间区间外的节点不参与渲染与拾取 */
  private isYearVisible(node: Node): boolean {
    const year = node.birthYear ?? 0;
    return year >= this.visibleYearFrom && year <= this.visibleYearTo;
  }

  private isPickable(node: Node): boolean {
    return !this.isNodeHidden(node) && this.isYearVisible(node);
  }

  /** 设置时间区间可见范围；null 表示全量。fadeYears 为回放亮度渐入跨度（0 不渐入） */
  setVisibleRange(from: number | null, to: number | null, fadeYears = 0): void {
    this.visibleYearFrom = from ?? -99999;
    this.visibleYearTo = to ?? 99999;

    this.nodeStarLayer?.setVisibleRange(this.visibleYearFrom, this.visibleYearTo, fadeYears);

    // 悬停节点被剔除时清除高亮与提示
    if (this.hoveredInstanceIndex >= 0) {
      const hovered = this.nodes[this.hoveredInstanceIndex];
      if (hovered && !this.isPickable(hovered)) {
        this.clearHover(this.hoveredInstanceIndex);
        this.container.style.cursor = 'default';
        if (this.onHover) this.onHover(null);
      }
    }
  }

  /** 设置朗诵脉动强度（0–1），驱动节点与星尘随朗读节奏起伏 */
  setRecitationPulse(level: number): void {
    this.nodeStarLayer?.setRecitationPulse(level);
  }

  private updateInstancedMeshPositions(): void {
    if (!this.instancedMesh) return;

    const positionAttr = this.nodeStarLayer?.attributes.position;
    const sizeAttr = this.nodeStarLayer?.attributes.size;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const hidden = this.isNodeHidden(node);
      const nodeScale = hidden ? 0 : this.getNodeScale(node);
      if (hidden) {
        this.reusePosition.set(0, HIDDEN_NODE_Y, 0);
      } else {
        this.reusePosition.set(node.position.x, node.position.y, node.position.z);
      }
      this.reuseScale.set(nodeScale * 0.55, nodeScale * 0.55, nodeScale * 0.55);
      this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
      this.instancedMesh.setMatrixAt(i, this.reuseMatrix);

      if (positionAttr && sizeAttr) {
        positionAttr.setXYZ(i, this.reusePosition.x, this.reusePosition.y, this.reusePosition.z);
        sizeAttr.setX(i, nodeScale * 2.5);
      }
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.nodeStarLayer?.markNodesDirty();
  }

  private markMatrixDirty(): void {
    this.needsMatrixUpdate = true;
  }

  /* ──── 销毁 ──────────────────────────────────── */

  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.boundResize) {
      window.removeEventListener('resize', this.boundResize);
      this.boundResize = null;
    }
    if (this.boundKeyDown) {
      window.removeEventListener('keydown', this.boundKeyDown);
      this.boundKeyDown = null;
    }

    const canvas = this.renderer.domElement;
    if (this.boundPointerDown) {
      canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.boundPointerDown = null;
    }
    if (this.boundPointerUp) {
      canvas.removeEventListener('pointerup', this.boundPointerUp);
      this.boundPointerUp = null;
    }
    if (this.boundPointerMove) {
      canvas.removeEventListener('pointermove', this.boundPointerMove);
      this.boundPointerMove = null;
    }

    this.controls.dispose();

    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      (this.instancedMesh.material as THREE.Material).dispose();
      this.instancedMesh = null;
    }
    this.destroyNodePoints();
    this.disposeGeoGrid();
    this.disposeGeoOutline();

    this.clusterMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.clusterMeshes = [];

    this.edgeRenderer.clear();
    this.labelRenderer.clear();

    this.particleSystem?.dispose();
    this.particleSystem = null;

    if (this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper = null;
    }

    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.bloomPass = null;

    this.renderer.dispose();

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /* ──── 访问器 ────────────────────────────────── */

  getSelectedNode(): Node | null { return this.selectedNode; }
  getScene(): THREE.Scene { return this.scene; }
  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  getRenderer(): THREE.WebGLRenderer { return this.renderer; }
  getCameraTarget(): THREE.Vector3 { return this.controls.target; }

  /** 还原分享链接中的相机位置与注视点 */
  applyCameraState(
    position: readonly [number, number, number],
    target: readonly [number, number, number]
  ): void {
    this.camera.position.set(position[0], position[1], position[2]);
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
  }

  setTourActive(active: boolean): void {
    this.tourActive = active;
    if (active && this.divergence.isActive) {
      this.exitDivergence();
      this.divergence.isActive = false;
      if (this.onDivergenceChange) this.onDivergenceChange(false);
    }
  }

  /** 时间演化回放：禁用散气自动触发；开始时退出散气视图 */
  setTimeTravelActive(active: boolean): void {
    this.timeTravelActive = active;
    if (active && this.divergence.isActive) {
      this.exitDivergence();
      this.divergence.isActive = false;
      if (this.onDivergenceChange) this.onDivergenceChange(false);
    }
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    this.nodeStarLayer?.setReducedMotion(enabled);
    this.particleSystem?.setReducedMotion(enabled);
    // 减少动效时也减弱辉光，提升性能
    if (this.bloomPass) {
      this.bloomPass.strength = enabled ? 0.15 : 0.3;
    }
  }
}
