import * as THREE from 'three';

export type PunchState = 'idle' | 'prepare' | 'down' | 'shake' | 'up';

export interface PunchConfig {
  startY: number;
  impactY: number;
  windUpOffset: number; // de combien le poing monte au-dessus de startY
  windUpSpeed: number;
  downSpeed: number;
  upSpeed: number;
}

export class Fist {
  public mesh: THREE.Object3D;
  public state: PunchState = 'idle';
  private config: PunchConfig;

  // Hauteur d'impact du coup en cours (varie selon réussite / échec / coup partiel)
  private currentImpactY: number;
  private shouldTremble = false;

  // Flottement en veille
  private elapsedTime = 0;
  private floatAmplitude = 0.12;
  private floatFrequency = 2.5;

  // Tremblement horizontal (utilisé seulement en cas d'échec)
  private shakeTimer = 0;
  private shakeDuration = 0.35;   // durée du tremblement (secondes)
  private shakeAmplitude = 0.08;  // amplitude du décalage
  private shakeFrequency = 60;    // vitesse des vibrations

  constructor(scene: THREE.Scene, modelTemplate: THREE.Object3D, config: PunchConfig) {
    this.config = config;
    this.currentImpactY = config.impactY;
    this.mesh = modelTemplate.clone();
    this.mesh.position.set(0, this.config.startY, 0);

    scene.add(this.mesh);
  }

  /**
   * Lance le coup.
   * - Sans argument : réussite qui casse le bloc, le poing descend jusqu'à config.impactY.
   * - Avec surfaceY : le poing s'arrête sur la surface du bloc.
   *   - shakeOnImpact = true (défaut) : c'est un échec, le poing tremble.
   *   - shakeOnImpact = false : c'est un coup réussi mais insuffisant pour casser
   *     le bloc ; le poing s'arrête sans trembler (c'est le bloc qui tremble).
   */
  public triggerPunch(surfaceY?: number, shakeOnImpact: boolean = true): void {
    if (this.state !== 'idle') return;

    this.shouldTremble = surfaceY !== undefined && shakeOnImpact;
    this.currentImpactY = surfaceY !== undefined ? surfaceY : this.config.impactY;

    this.state = 'prepare';
  }

  public reset(): void {
    this.state = 'idle';
    this.mesh.position.set(0, this.config.startY, 0);
    this.currentImpactY = this.config.impactY;
    this.shouldTremble = false;
    this.shakeTimer = 0;
    this.elapsedTime = 0;
  }

  public update(deltaTime: number, onImpact: () => void): void {
    if (this.state === 'idle') {
      this.elapsedTime += deltaTime;
      const floatOffset = Math.sin(this.elapsedTime * this.floatFrequency) * this.floatAmplitude;
      this.mesh.position.y = this.config.startY + floatOffset;
      return;
    }

    if (this.state === 'prepare') {
      const windUpY = this.config.startY + this.config.windUpOffset;
      this.mesh.position.y += this.config.windUpSpeed * deltaTime;

      if (this.mesh.position.y >= windUpY) {
        this.mesh.position.y = windUpY;
        this.state = 'down';
      }
    } else if (this.state === 'down') {
      this.mesh.position.y -= this.config.downSpeed * deltaTime;

      if (this.mesh.position.y <= this.currentImpactY) {
        this.mesh.position.y = this.currentImpactY;
        this.shakeTimer = 0;
        // Le poing ne tremble que sur un vrai échec ; sinon il remonte directement
        this.state = this.shouldTremble ? 'shake' : 'up';
        onImpact();
      }
    } else if (this.state === 'shake') {
      this.shakeTimer += deltaTime;
      const progress = this.shakeTimer / this.shakeDuration;

      if (progress >= 1) {
        this.mesh.position.x = 0;
        this.state = 'up';
      } else {
        const damping = 1 - progress;
        this.mesh.position.x =
          Math.sin(this.shakeTimer * this.shakeFrequency) * this.shakeAmplitude * damping;
      }
    } else if (this.state === 'up') {
      this.mesh.position.y += this.config.upSpeed * deltaTime;

      if (this.mesh.position.y >= this.config.startY) {
        this.mesh.position.y = this.config.startY;
        this.state = 'idle';
        this.elapsedTime = 0;
      }
    }
  }
}