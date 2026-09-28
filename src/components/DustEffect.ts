import * as THREE from 'three';

interface DustParticle {
  sprite: THREE.Sprite;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  life: number;     // Vie restante (de 1 à 0)
  maxLife: number;  // Durée de vie totale
  scale: number;
}

export class DustEffect {
  private particles: DustParticle[] = [];
  private scene: THREE.Scene;
  private static texture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, position: THREE.Vector3, particleCount = 12) {
    this.scene = scene;

    // Charger la texture smoketxt.png une seule fois
    if (!DustEffect.texture) {
      const loader = new THREE.TextureLoader();
      DustEffect.texture = loader.load('/smoketxt.png');
    }

    this.createDustCloud(position, particleCount);
  }

  private createDustCloud(position: THREE.Vector3, count: number): void {
    const material = new THREE.SpriteMaterial({
      map: DustEffect.texture,
      transparent: true,
      opacity: 0.7,
      depthWrite: false, // Évite les bugs d'affichage de transparence
      blending: THREE.NormalBlending,
    });

    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(material.clone());
      
      // Position initiale au pied du bloc au sol
      sprite.position.set(
        position.x + (Math.random() - 0.5) * 0.8,
        position.y + 0.1,
        position.z + (Math.random() - 0.5) * 0.8
      );

      // Taille initiale aléatoire
      const initialScale = 0.6 + Math.random() * 0.6;
      sprite.scale.set(initialScale, initialScale, 1);

      // Projection vers l'extérieur (gauche/droite) et légèrement vers le haut
      const angle = Math.random() * Math.PI * 2;
      const speed = 4.0 + Math.random() * 5.0;

      const particle: DustParticle = {
        sprite,
        velocityX: Math.cos(angle) * speed,
        velocityY: 0.3 + Math.random() * 0.8, // S'élève légèrement
        velocityZ: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 2.0 + Math.random() * 1.0, // Durée entre 0.5s et 0.9s
        scale: initialScale,
      };

      this.scene.add(sprite);
      this.particles.push(particle);
    }
  }

  /**
   * Met à jour l'animation de la poussière. Retourne true quand l'effet est terminé.
   */
  public update(deltaTime: number): boolean {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.life -= deltaTime / p.maxLife;

      if (p.life <= 0) {
        // Supprimer le sprite de la scène
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Déplacement de la particule
      p.sprite.position.x += p.velocityX * deltaTime;
      p.sprite.position.y += p.velocityY * deltaTime;
      p.sprite.position.z += p.velocityZ * deltaTime;

      // Décélération progressive (frottement dans l'air)
      p.velocityX *= 0.97;
      p.velocityZ *= 0.97;

      // Dilatation du nuage de poussière + disparition en fondu (opacity)
      const currentScale = p.scale * (1 + (1 - p.life) * 1.5);
      p.sprite.scale.set(currentScale, currentScale, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life * 0.7);
    }

    return this.particles.length === 0;
  }
}