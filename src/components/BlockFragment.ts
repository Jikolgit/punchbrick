import * as THREE from 'three';

export class BlockFragment {
  public mesh: THREE.Mesh;
  private velocity: THREE.Vector3;
  public isDead = false;
  private lifetime = 1.5; // Durée de vie en secondes

  constructor(
    parent: THREE.Object3D,
    position: THREE.Vector3,
    material?: THREE.Material | THREE.Material[]
  ) {
    // Géométrie d'éclat aléatoire
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    
    // Réutilisation du matériau texturé du bloc ou matériau par défaut
    const mat = material 
      ? (Array.isArray(material) ? material[0].clone() : material.clone())
      : new THREE.MeshStandardMaterial({ color: 0xe94560 });

    this.mesh = new THREE.Mesh(geometry, mat);
    this.mesh.position.copy(position);

    // Vélocité d'explosion aléatoire
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      Math.random() * 6 + 2,
      (Math.random() - 0.5) * 8
    );

    parent.add(this.mesh);
  }

  public update(deltaTime: number, parent: THREE.Object3D): void {
    if (this.isDead) return;

    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.isDead = true;
      parent.remove(this.mesh);
      return;
    }

    // Gravité + déplacement
    this.velocity.y -= 9.81 * deltaTime;
    this.mesh.position.addScaledVector(this.velocity, deltaTime);
    this.mesh.rotation.x += 5 * deltaTime;
    this.mesh.rotation.y += 5 * deltaTime;
  }
}