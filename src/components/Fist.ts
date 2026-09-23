import * as THREE from 'three';

export type PunchState = 'idle' | 'prepare' | 'down' | 'up';

export interface PunchConfig {
  startY: number;
  impactY: number;
  windUpY: number;
  windUpSpeed: number;
  downSpeed: number;
  upSpeed: number;
}

export class Fist {
  public mesh: THREE.Object3D;
  public state: PunchState = 'idle';
  private config: PunchConfig;

  private elapsedTime = 0;
  private floatAmplitude = 0.12;
  private floatFrequency = 2.5;

  constructor(scene: THREE.Scene, modelTemplate: THREE.Object3D, config: PunchConfig) {
    this.config = config;
    this.mesh = modelTemplate.clone();
    this.mesh.position.set(0, this.config.startY, 0);

    scene.add(this.mesh);
  }

  public triggerPunch(): void {
    if (this.state === 'idle') {
      this.state = 'prepare';
    }
  }

  public reset(): void {
    this.state = 'idle';
    this.mesh.position.set(0, this.config.startY, 0);
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
      this.mesh.position.y += this.config.windUpSpeed * deltaTime;

      if (this.mesh.position.y >= this.config.windUpY) {
        this.mesh.position.y = this.config.windUpY;
        this.state = 'down';
      }
    } else if (this.state === 'down') {
      this.mesh.position.y -= this.config.downSpeed * deltaTime;

      if (this.mesh.position.y <= this.config.impactY) {
        this.mesh.position.y = this.config.impactY;
        this.state = 'up';
        onImpact();
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