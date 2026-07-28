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

const DYNASTY_COLORS: Record<string, number> = {
  PRE_QIN: 0x3a4a5c, HAN: 0x8b7355, WEI_JIN: 0x6fae8e,
  TANG: 0xd4a24c, SONG: 0x7ba7d9, YUAN: 0xb5523e,
  MING: 0xc9866b, QING: 0x8c6fae, MODERN: 0x5a8c7a,
};

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
  private clusterMeshes: THREE.Mesh[] = [];
  private nodes: Node[] = [];
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private selectedNode: Node | null = null;
  private animationId: number | null = null;

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

  private divergenceThreshold = 100;
  private dimensionWeights = { talent: 1, popularity: 1, luck: 1 };
  private originalPositions: Map<string, THREE.Vector3> = new Map();
  private reducedMotion = false;

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
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.0035);

    // 后期特效：辉光 Bloom
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
      0.15,   // strength — 辉光强度
      0.4,    // radius  — 辉光半径
      0.85    // threshold — 亮度阈值
    );
    this.composer.addPass(this.bloomPass);

    this.particleSystem = new ParticleSystem(this.scene);
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
      if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        if (instanceId !== undefined) {
          const clickedNode = this.nodes[instanceId];
          if (this.convergence.focusNode === clickedNode) {
            this.unfocus();
          } else {
            this.focusNode(clickedNode);
          }
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

    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      const idx = intersects[0].instanceId!;
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
    if (instanceIdx >= 0 && this.instancedMesh?.instanceColor) {
      this.setInstanceHighlight(instanceIdx, false);
    }
    this.hoveredInstanceIndex = -1;
  }

  private setInstanceHighlight(idx: number, highlight: boolean): void {
    const mesh = this.instancedMesh;
    if (!mesh?.instanceColor) return;

    mesh.getColorAt(idx, this.reuseHighlightColor);

    if (highlight) {
      this.originalHoverColor.copy(this.reuseHighlightColor);
      this.reuseHighlightColor.lerp(this.reuseWhite, 0.5);
    } else {
      this.reuseHighlightColor.copy(this.originalHoverColor);
    }

    mesh.setColorAt(idx, this.reuseHighlightColor);
    mesh.instanceColor!.needsUpdate = true;
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

    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true, transparent: true, opacity: 0.8,
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.nodes.length);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      matrix.setPosition(node.position.x, node.position.y, node.position.z);
      this.instancedMesh.setMatrixAt(i, matrix);
      color.setHex(DYNASTY_COLORS[node.dynasty] || 0xffffff);
      this.instancedMesh.setColorAt(i, color);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.instancedMesh);
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

    const relatedNodes = this.nodes.filter(
      (n) => n.id !== node.id && n.dynasty === node.dynasty
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
      startTime: Date.now(), duration: 1000, targetPositions,
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
    this.cameraController.moveTo(cameraTarget, focusPos.clone());
    this.edgeRenderer.build(node, relatedNodes);
    this.labelRenderer.build(node, relatedNodes);
  }

  /* ──── 取消聚焦（散气） ──────────────────────── */

  unfocus(): void {
    if (!this.convergence.focusNode) return;

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
      startTime: Date.now(), duration: 800, targetPositions,
    };

    this.particleSystem?.setFlowActive(false);
    this.selectedNode = null;
    if (this.onNodeSelect) this.onNodeSelect(null);
    this.notifyConvergence('converging');

    this.cameraController.reset();
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
    this.cameraController.moveTo(this.reuseVecA, cluster.center);
  }

  /* ──── 动画循环 ──────────────────────────────── */

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.checkDivergenceState();
    this.cameraController.update();
    this.updateDivergenceAnimation();
    this.updateConvergenceAnimation();
    this.updateNodeAnimation();
    this.edgeRenderer.update();
    this.particleSystem?.update(16);

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ──── 散气状态检测 ──────────────────────────── */

  private checkDivergenceState(): void {
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

        let nodeScale = node.size;
        if (this.convergence.focusNode && node.id === this.convergence.focusNode.id) {
          nodeScale = node.size * (1 + easedProgress * 0.5);
        }
        this.reuseScale.set(nodeScale, nodeScale, nodeScale);
        this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
        this.instancedMesh.setMatrixAt(i, this.reuseMatrix);
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;

    if (this.convergence.focusNode) {
      this.edgeRenderer.updateProgress(
        this.convergence.focusNode,
        this.convergence.relatedNodes,
        this.convergence.targetPositions,
        easedProgress
      );
      this.labelRenderer.updateProgress(
        this.convergence.focusNode,
        this.convergence.relatedNodes,
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

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      let breathScale = 1;
      if (!this.reducedMotion) {
        breathScale = 1 + Math.sin(time * 2 + node.phase) * 0.1;
      }

      this.reusePosition.set(node.position.x, node.position.y, node.position.z);

      let nodeScale = node.size * breathScale;
      if (i === this.hoveredInstanceIndex) {
        nodeScale *= 1.3;
      }
      if (this.convergence.focusNode && node.id === this.convergence.focusNode.id) {
        nodeScale = node.size * 1.5 * breathScale;
      }

      this.reuseScale.set(nodeScale, nodeScale, nodeScale);
      this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
      this.instancedMesh.setMatrixAt(i, this.reuseMatrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /* ──── 维度权重 ──────────────────────────────── */

  updateDimensionWeights(weights: { talent: number; popularity: number; luck: number }): void {
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
        node.position.x = originalPos.x * weights.luck;
        node.position.y = originalPos.y * weights.talent;
        node.position.z = originalPos.z * weights.popularity;
      }
    });
    this.updateInstancedMeshPositions();
    this.calculateClusters();
  }

  private updateInstancedMeshPositions(): void {
    if (!this.instancedMesh) return;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      this.reusePosition.set(node.position.x, node.position.y, node.position.z);
      this.reuseScale.set(node.size, node.size, node.size);
      this.reuseMatrix.compose(this.reusePosition, this.reuseQuaternion, this.reuseScale);
      this.instancedMesh.setMatrixAt(i, this.reuseMatrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
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

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    this.particleSystem?.setReducedMotion(enabled);
    // 减少动效时也减弱辉光，提升性能
    if (this.bloomPass) {
      this.bloomPass.strength = enabled ? 0.04 : 0.15;
    }
  }
}
