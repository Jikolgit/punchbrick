import * as THREE from 'three';

export class DebugUI {
  private container: HTMLDivElement;
  private cameraPosElement: HTMLDivElement;

  constructor() {
    // Création du conteneur d'affichage UI
    this.container = document.createElement('div');
    this.container.id = 'debug-ui';

    // Élément spécifique pour la position de la caméra
    this.cameraPosElement = document.createElement('div');
    this.container.appendChild(this.cameraPosElement);

    // Injection dans la page
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.appendChild(this.container);
    } else {
      document.body.appendChild(this.container);
    }
  }

  /**
   * Met à jour l'affichage de la position de la caméra
   */
  public updateCameraPosition(camera: THREE.Camera): void {
    const { x, y, z } = camera.position;
    this.cameraPosElement.innerHTML = `
      <strong>Camera Pos:</strong><br/>
      X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)}
    `;
  }
}