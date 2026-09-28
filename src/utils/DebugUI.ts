import * as THREE from 'three';

export class DebugUI {
  private container: HTMLDivElement;
  private cameraPosElement: HTMLDivElement;
  private gameInfoElement: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'debug-ui';

    this.cameraPosElement = document.createElement('div');
    this.container.appendChild(this.cameraPosElement);

    this.gameInfoElement = document.createElement('div');
    this.container.appendChild(this.gameInfoElement);

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.appendChild(this.container);
    } else {
      document.body.appendChild(this.container);
    }
  }

  public updateCameraPosition(camera: THREE.Camera): void {
    const { x, y, z } = camera.position;
    this.cameraPosElement.innerHTML = `
      <strong>Camera Pos:</strong><br/>
      X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)}
    `;
  }

  /**
   * Affiche l'état de gameplay utile en debug : type de bloc courant,
   * son état (PV, ou zones activées pour un bloc spécial), la force
   * du joueur, et les raccourcis disponibles.
   */
  public updateGameInfo(blockType: string, blockStatus: number | string, force: number): void {
    this.gameInfoElement.innerHTML = `
      <strong>[DEV] Bloc:</strong> ${blockType} | État: ${blockStatus} | Force: ${force}<br/>
      <small>1/2/3 = type de bloc · 4 = bloc spécial · F = forcer la casse</small>
    `;
  }
}