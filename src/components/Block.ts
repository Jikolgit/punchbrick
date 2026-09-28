import * as THREE from 'three';
import { BlockFragment } from './BlockFragment';

// --- Structure interne pour les particules de poussière ---
interface DustParticle {
  sprite: THREE.Sprite;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  life: number;
  maxLife: number;
  scale: number;
}

export class Block {
  public mesh: THREE.Object3D;
  public hp: number;
  public maxHp: number;

  // Animation fluide de la jauge HP
  private displayedHp: number;
  private hpAnimationSpeed = 4;

  // --- Animation de chute depuis le haut ---
  public isFalling = true;
  private targetY = 0;
  private fallY = 12;
  private currentY = 12;
  private fallVelocity = 0;
  private bounceFactor = -0.2;

  // --- Effet de poussière (smoketxt.png) ---
  private dustParticles: DustParticle[] = [];
  private static dustTexture: THREE.Texture | null = null;
  private hasLanded = false;

  private scene: THREE.Scene;
  private baseX: number;
  private shakeTimer = 0;
  private shakeDuration = 0.3;
  private shakeAmplitude = 0.15;
  private shakeFrequency = 60;

  // Éléments pour la barre de vie
  private healthBarSprite: THREE.Sprite | null = null;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene, modelTemplate: THREE.Object3D, resistance: number = 1) {
    this.scene = scene;
    this.mesh = modelTemplate.clone();

    // Position de départ haute dans le ciel
    this.currentY = this.fallY;
    this.mesh.position.set(0, this.currentY, 0);

    this.hp = resistance;
    this.maxHp = resistance;
    this.displayedHp = resistance;
    this.baseX = this.mesh.position.x;

    const scaleFactor = 1.8;
    this.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

    this.scene.add(this.mesh);

    // Charger la texture de poussière une seule fois
    if (!Block.dustTexture) {
      const loader = new THREE.TextureLoader();
      Block.dustTexture = loader.load('/smoketxt.png');
    }

    // Canvas pour le rendu de la barre de vie
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 32;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);

    this.createHealthBar();
    this.updateHealthBarTexture();
  }

  private createHealthBar(): void {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
    });

    this.healthBarSprite = new THREE.Sprite(spriteMaterial);

    // Ajustement de la largeur globale de la barre
    const barWidth = Math.max(3.5, this.maxHp * 1.0);
    const barHeight = 0.65;
    this.healthBarSprite.scale.set(barWidth, barHeight, 1);

    this.updateHealthBarPosition();

    this.scene.add(this.healthBarSprite);
  }

  private updateHealthBarPosition(): void {
    if (!this.healthBarSprite) return;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const bottomY = box.min.y;
    this.healthBarSprite.position.set(this.mesh.position.x, bottomY - 0.5, this.mesh.position.z);
  }

  private updateHealthBarTexture(): void {
    if (!this.context || !this.healthBarSprite) return;

    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    const totalSegments = this.maxHp;
    if (totalSegments <= 0) return;

    const segmentWidth = width / totalSegments;

    for (let i = 0; i < totalSegments; i++) {
      const x = i * segmentWidth;
      const fillAmount = Math.max(0, Math.min(1, this.displayedHp - i));

      // 1. Fond bleu ardoise (santé perdue)
      ctx.fillStyle = '#3b4a6b';
      ctx.fillRect(x, 0, segmentWidth, height);

      // 2. Remplissage vert (santé active)
      if (fillAmount > 0) {
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(x, 0, segmentWidth * fillAmount, height);
      }

      // 3. Contour noir net
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, 0, segmentWidth, height);
    }

    this.texture.needsUpdate = true;
  }

  /**
   * Génère un nuage de poussière à la base du bloc
   */
private triggerDustImpact(count = 18): void {
  if (!Block.dustTexture) return;

  const box = new THREE.Box3().setFromObject(this.mesh);
  const bottomY = box.min.y;

  // Calcul du rayon / demi-largeur du bloc
  const blockRadiusX = (box.max.x - box.min.x) / 2;
  const blockRadiusZ = (box.max.z - box.min.z) / 2;

  const material = new THREE.SpriteMaterial({
    map: Block.dustTexture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });

  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(material.clone());

    // Angle tout autour du bloc (360°)
    const angle = Math.random() * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 1. Placer la particule directement SUR le bord extérieur du bloc
    const spawnX = this.mesh.position.x + cosA * (blockRadiusX + 0.1);
    const spawnZ = this.mesh.position.z + sinA * (blockRadiusZ + 0.1);

    sprite.position.set(spawnX, bottomY + 0.1, spawnZ);

    const initialScale = 0.7 + Math.random() * 0.5;
    sprite.scale.set(initialScale, initialScale, 1);

    // 2. Vitesse élevée orientée VERS L'EXTÉRIEUR (éloignement du centre)
    const speed = 4.5 + Math.random() * 4.0; 

    this.dustParticles.push({
      sprite,
      velocityX: cosA * speed,             // Pousse fort vers l'extérieur X
      velocityY: 0.4 + Math.random() * 0.8,  // Léger élan vers le haut
      velocityZ: sinA * speed,             // Pousse fort vers l'extérieur Z
      life: 1.0,
      maxLife: 0.8 + Math.random() * 0.6,    // Durée de vie plus longue
      scale: initialScale,
    });

    this.scene.add(sprite);
  }
}

  /**
   * Met à jour les particules de poussière actives
   */
  private updateDust(deltaTime: number): void {
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.life -= deltaTime / p.maxLife;

      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.dustParticles.splice(i, 1);
        continue;
      }

      p.sprite.position.x += p.velocityX * deltaTime;
      p.sprite.position.y += p.velocityY * deltaTime;
      p.sprite.position.z += p.velocityZ * deltaTime;

      p.velocityX *= 0.92;
      p.velocityZ *= 0.92;

      const currentScale = p.scale * (1 + (1 - p.life) * 1.5);
      p.sprite.scale.set(currentScale, currentScale, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life * 0.7);
    }
  }

  public getTopY(): number {
    return new THREE.Box3().setFromObject(this.mesh).max.y;
  }

  public takeDamage(amount: number): boolean {
    this.hp -= amount;
    return this.hp <= 0;
  }

  public triggerShake(): void {
    this.shakeTimer = this.shakeDuration;
  }

  public update(deltaTime: number): void {
    // 1. Mise à jour de l'effet de poussière
    this.updateDust(deltaTime);

    // 2. Animation de chute depuis le haut
    if (this.isFalling) {
      const gravity = 50;
      this.fallVelocity += gravity * deltaTime;
      this.currentY -= this.fallVelocity * deltaTime;

      if (this.currentY <= this.targetY) {
        this.currentY = this.targetY;

        // Déclencher la poussière au premier impact pour les blocs très lourds (HP >= 4)
        if (!this.hasLanded) {
          this.hasLanded = true;
          if (this.maxHp >= 4) {
            this.triggerDustImpact(16);
          }
        }

        // Rebond léger à l'atterrissage
        if (Math.abs(this.fallVelocity) > 3) {
          this.fallVelocity *= this.bounceFactor;
        } else {
          this.fallVelocity = 0;
          this.isFalling = false;
        }
      }

      this.mesh.position.y = this.currentY;
      this.updateHealthBarPosition();
      return;
    }

    // 3. Animation fluide de la jauge HP
    if (this.displayedHp > this.hp) {
      this.displayedHp -= this.hpAnimationSpeed * deltaTime;
      if (this.displayedHp < this.hp) {
        this.displayedHp = this.hp;
      }
      this.updateHealthBarTexture();
    }

    // 4. Suivi de position de la barre de vie sous le bloc
    this.updateHealthBarPosition();

    // 5. Tremblement du bloc en cas d'impact partial
    if (this.shakeTimer <= 0) return;

    this.shakeTimer -= deltaTime;

    if (this.shakeTimer <= 0) {
      this.shakeTimer = 0;
      this.mesh.position.x = this.baseX;
      return;
    }

    const elapsed = this.shakeDuration - this.shakeTimer;
    const damping = this.shakeTimer / this.shakeDuration;
    this.mesh.position.x =
      this.baseX + Math.sin(elapsed * this.shakeFrequency) * this.shakeAmplitude * damping;
  }

  public breakIntoPieces(count: number): BlockFragment[] {
    if (this.healthBarSprite) {
      this.healthBarSprite.visible = false;
    }

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
    // Nettoyage de la poussière restante
    for (const p of this.dustParticles) {
      this.scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.dustParticles = [];

    // Nettoyage de la barre de vie
    if (this.healthBarSprite) {
      this.scene.remove(this.healthBarSprite);
      this.texture.dispose();
      this.healthBarSprite.material.dispose();
      this.healthBarSprite = null;
    }

    // Retrait du mesh
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}