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

  // Traînée de dégâts : suit les HP réels avec un léger retard
  private displayedHp: number;
  private hpAnimationSpeed = 4;
  private trailDelay = 0;

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
  public hasLanded = false;

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
  private barWidth = 7;
  private barHeight = 0.6;
  private barAppearProgress = 0; // 0 → 1 : animation d'apparition
  private barFlashTimer = 0;
  private readonly barFlashDuration = 0.18;

  // Destruction : la barre reste affichée, se vide, puis disparaît en fondu
  private isBreaking = false;
  private breakTimer = 0;
  private barFadeOut = 1; // 1 → 0 pendant la disparition
  private readonly breakHoldDuration = 0.2;
  private readonly breakFadeDuration = 0.3;
  public isDead = false;

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
    // Largeur de la barre selon la résistance, canvas au même ratio pour éviter la déformation
    this.barWidth = Math.max(5, this.maxHp * 1.25);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = Math.round((512 * this.barHeight) / this.barWidth);
    this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.createHealthBar();
    this.drawHealthBar();
  }

  private createHealthBar(): void {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      opacity: 0,
    });

    this.healthBarSprite = new THREE.Sprite(spriteMaterial);
    this.healthBarSprite.renderOrder = 10;
    this.healthBarSprite.scale.set(this.barWidth, this.barHeight, 1);

    this.updateHealthBarPosition();

    // Cachée pendant la chute, affichée une fois le bloc posé au sol
    this.healthBarSprite.visible = false;

    this.scene.add(this.healthBarSprite);
  }

  private showHealthBar(): void {
    if (!this.healthBarSprite || this.healthBarSprite.visible) return;
    this.healthBarSprite.visible = true;
    this.barAppearProgress = 0;
  }

  /**
   * Animation de la barre : apparition (fondu + pop), flash d'impact, traînée de dégâts
   */
  private updateHealthBar(deltaTime: number): void {
    if (!this.healthBarSprite || !this.healthBarSprite.visible) return;

    let needsRedraw = false;

    // Apparition : fondu + léger rebond d'échelle
    if (this.barAppearProgress < 1) {
      this.barAppearProgress = Math.min(1, this.barAppearProgress + deltaTime / 0.25);
    }
    const t = this.barAppearProgress;
    const c1 = 1.70158;
    const easeOutBack = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

    // Flash d'impact
    if (this.barFlashTimer > 0) {
      this.barFlashTimer = Math.max(0, this.barFlashTimer - deltaTime);
      needsRedraw = true;
    }
    const flash = this.barFlashTimer / this.barFlashDuration;

    const fade = this.barFadeOut;
    const scale = (0.6 + 0.4 * easeOutBack) * (1 + 0.1 * flash) * (0.7 + 0.3 * fade);
    this.healthBarSprite.scale.set(this.barWidth * scale, this.barHeight * scale, 1);
    this.healthBarSprite.material.opacity = t * fade;

    // Traînée : attend un court instant puis se vide jusqu'aux HP réels
    const realHp = Math.max(0, this.hp);
    if (this.displayedHp > realHp) {
      if (this.trailDelay > 0) {
        this.trailDelay -= deltaTime;
      } else {
        this.displayedHp = Math.max(realHp, this.displayedHp - this.hpAnimationSpeed * deltaTime);
      }
      needsRedraw = true;
    }

    if (needsRedraw) this.drawHealthBar();
  }

  private updateHealthBarPosition(): void {
    if (!this.healthBarSprite) return;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const bottomY = box.min.y;
    this.healthBarSprite.position.set(this.mesh.position.x, bottomY - 0.5, this.mesh.position.z);
  }

  private getHealthColors(ratio: number): { light: string; base: string; dark: string } {
    if (ratio > 0.6) return { light: '#8dffb0', base: '#2ecc71', dark: '#1a8a4a' };
    if (ratio > 0.3) return { light: '#ffe98a', base: '#f5b700', dark: '#b37a00' };
    return { light: '#ff9a8f', base: '#e8392e', dark: '#9c1a14' };
  }

  private drawHealthBar(): void {
    if (!this.context || !this.healthBarSprite) return;

    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.maxHp <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const border = Math.max(3, h * 0.14);
    const ix = border;
    const iy = border;
    const iw = w - border * 2;
    const ih = h - border * 2;
    const radius = ih / 2;

    // 1. Contour extérieur (capsule sombre)
    ctx.fillStyle = '#0d0f16';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();

    // Tout le contenu est découpé dans la capsule intérieure
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, radius);
    ctx.clip();

    // 2. Fond de la jauge (santé perdue) avec ombre interne
    const trackGrad = ctx.createLinearGradient(0, iy, 0, iy + ih);
    trackGrad.addColorStop(0, '#141926');
    trackGrad.addColorStop(1, '#2a3247');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(ix, iy, iw, ih);

    const realHp = Math.max(0, this.hp);
    const ratio = realHp / this.maxHp;
    const flash = this.barFlashTimer / this.barFlashDuration;

    // 3. Traînée de dégâts (santé qui vient d'être perdue)
    const trailW = iw * (this.displayedHp / this.maxHp);
    if (trailW > 0) {
      ctx.fillStyle = flash > 0 ? '#ffffff' : '#ffd9a0';
      ctx.fillRect(ix, iy, trailW, ih);
    }

    // 4. Remplissage principal avec dégradé vertical selon le niveau de vie
    const fillW = iw * ratio;
    if (fillW > 0) {
      const colors = this.getHealthColors(ratio);
      const fillGrad = ctx.createLinearGradient(0, iy, 0, iy + ih);
      fillGrad.addColorStop(0, colors.light);
      fillGrad.addColorStop(0.45, colors.base);
      fillGrad.addColorStop(1, colors.dark);
      ctx.fillStyle = fillGrad;
      ctx.fillRect(ix, iy, fillW, ih);

      // Flash blanc à l'impact
      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * flash})`;
        ctx.fillRect(ix, iy, fillW, ih);
      }
    }

    // 5. Reflet brillant sur la moitié haute
    const glossGrad = ctx.createLinearGradient(0, iy, 0, iy + ih * 0.5);
    glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glossGrad;
    ctx.fillRect(ix, iy, iw, ih * 0.5);

    // 6. Séparateurs entre chaque point de vie
    ctx.fillStyle = 'rgba(13, 15, 22, 0.85)';
    const sepW = Math.max(2, border * 0.6);
    for (let i = 1; i < this.maxHp; i++) {
      const x = ix + (iw * i) / this.maxHp;
      ctx.fillRect(x - sepW / 2, iy, sepW, ih);
    }

    ctx.restore();

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
    this.barFlashTimer = this.barFlashDuration;
    this.trailDelay = 0.25;
    this.drawHealthBar();
    return this.hp <= 0;
  }

  public triggerShake(): void {
    this.shakeTimer = this.shakeDuration;
  }

  public update(deltaTime: number): void {
    if (this.isDead) return;

    // 1. Mise à jour de l'effet de poussière
    this.updateDust(deltaTime);

    // Bloc détruit : seule la barre de vie reste, elle se vide puis s'efface
    if (this.isBreaking) {
      this.updateBreaking(deltaTime);
      return;
    }

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
          this.showHealthBar();
        }
      }

      this.mesh.position.y = this.currentY;
      this.updateHealthBarPosition();
      return;
    }

    // 3. Animation de la barre de vie (apparition, flash, traînée)
    this.updateHealthBar(deltaTime);

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

  private updateBreaking(deltaTime: number): void {
    this.updateHealthBar(deltaTime);

    // On attend que la traînée soit vide et le flash terminé avant le fondu
    const barSettled = this.displayedHp <= 0 && this.barFlashTimer <= 0;
    if (barSettled) {
      this.breakTimer += deltaTime;
      const fadeT = (this.breakTimer - this.breakHoldDuration) / this.breakFadeDuration;
      this.barFadeOut = 1 - Math.max(0, Math.min(1, fadeT));
    }

    if (this.barFadeOut <= 0 && this.dustParticles.length === 0) {
      this.destroy();
    }
  }

  public breakIntoPieces(count: number): BlockFragment[] {
    // Vide la barre si le bloc est cassé sans avoir pris de dégâts (ex: bloc bonus)
    if (this.hp > 0) {
      this.hp = 0;
      this.barFlashTimer = this.barFlashDuration;
      this.trailDelay = 0.25;
      this.drawHealthBar();
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

    // Le mesh disparaît tout de suite, la barre reste jusqu'à la fin de son animation
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }

    if (this.healthBarSprite?.visible) {
      this.shakeTimer = 0;
      this.isBreaking = true;
    } else {
      this.destroy();
    }

    return fragments;
  }

  public destroy(): void {
    this.isDead = true;

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