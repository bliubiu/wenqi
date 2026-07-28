import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  private cameraTargetPos: THREE.Vector3 | null = null;
  private controlsTargetPos: THREE.Vector3 | null = null;
  private animSpeed = 0.04;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls
  ) {}

  moveTo(target: THREE.Vector3, controlsTarget: THREE.Vector3): void {
    this.cameraTargetPos = target.clone();
    this.controlsTargetPos = controlsTarget.clone();
  }

  update(): void {
    if (!this.cameraTargetPos) return;

    this.camera.position.lerp(this.cameraTargetPos, this.animSpeed);
    this.controls.target.lerp(this.controlsTargetPos ?? new THREE.Vector3(0, 0, 0), this.animSpeed);

    const dist = this.camera.position.distanceTo(this.cameraTargetPos);
    if (dist < 0.1) {
      this.camera.position.copy(this.cameraTargetPos);
      this.controls.target.copy(this.controlsTargetPos ?? new THREE.Vector3(0, 0, 0));
      this.cameraTargetPos = null;
      this.controlsTargetPos = null;
    }
  }

  reset(): void {
    this.cameraTargetPos = new THREE.Vector3(50, 50, 50);
    this.controlsTargetPos = new THREE.Vector3(0, 0, 0);
  }

  isAnimating(): boolean {
    return this.cameraTargetPos !== null;
  }
}
