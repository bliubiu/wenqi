import * as THREE from 'three';
import { Node } from '@/infrastructure/data/DataLoader';

export class LabelRenderer {
  private sprites: THREE.Sprite[] = [];

  constructor(private scene: THREE.Scene) {}

  build(focusNode: Node, relatedNodes: Node[]): void {
    this.clear();
    const allNodes = [focusNode, ...relatedNodes];
    for (const n of allNodes) {
      const sprite = this.createSprite(n.label);
      sprite.position.set(n.position.x, n.position.y + n.size + 1.5, n.position.z);
      this.scene.add(sprite);
      this.sprites.push(sprite);
    }
  }

  updateProgress(
    focusNode: Node,
    relatedNodes: Node[],
    targetPositions: Map<string, THREE.Vector3>,
    progress: number
  ): void {
    const focusTarget = targetPositions.get(focusNode.id);
    if (!focusTarget) return;

    let idx = 0;
    const apply = (n: Node, targetPos: THREE.Vector3) => {
      const sx = n.position.x + (targetPos.x - n.position.x) * progress;
      const sy = n.position.y + (targetPos.y - n.position.y) * progress;
      const sz = n.position.z + (targetPos.z - n.position.z) * progress;
      const size = focusNode && n.id === focusNode.id ? n.size * 1.5 : n.size;
      if (this.sprites[idx]) {
        this.sprites[idx].position.set(sx, sy + size + 1.5, sz);
      }
      idx++;
    };

    apply(focusNode, focusTarget);
    for (const rn of relatedNodes) {
      const t = targetPositions.get(rn.id);
      if (t) apply(rn, t);
    }
  }

  clear(): void {
    for (const sprite of this.sprites) {
      this.scene.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.sprites = [];
  }

  private createSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(10, 2.5, 1);
    return sprite;
  }
}
