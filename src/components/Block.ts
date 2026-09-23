import * as THREE from 'three';
import { BlockFragment } from './BlockFragment';

export class Block {
  public mesh: THREE.Object3D;

  constructor(scene: THREE.Scene, modelTemplate: THREE.Object3D) {
    this.mesh = modelTemplate.clone();
    this.mesh.position.set(0, 0, 0);

    const scaleFactor = 1.8;
    this.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

    scene.add(this.mesh);
  }

  public breakIntoPieces(count: number): BlockFragment[] {
    const fragments: BlockFragment[] = [];
    const originPosition = this.mesh.position.clone();

    let blockMaterial: THREE.Material | THREE.Material[] | undefined;

    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !blockMaterial) {
        blockMaterial = (child as THREE.Mesh).material;
      }
    });

    for (let i = 0; i < count; i++) {
      fragments.push(
        new BlockFragment(
          this.mesh.parent!,
          originPosition,
          blockMaterial
        )
      );
    }

    this.destroy();
    return fragments;
  }

  public destroy(): void {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}