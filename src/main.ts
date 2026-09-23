import { SceneManager } from './managers/SceneManager';
import { Block } from './components/Block';
import { Fist } from './components/Fist';
import { BlockFragment } from './components/BlockFragment';
import { PowerMeter } from './components/PowerMeter';
import { TouchControls } from './components/TouchControls';
import { ModelLoader, type LoadedModels } from './utils/ModelLoader';
import { DebugUI } from './utils/DebugUI';
import './style.css';

class Game {
  private sceneManager: SceneManager;
  private block: Block | null = null;
  private fist: Fist | null = null;
  private powerMeter: PowerMeter;
  private touchControls: TouchControls;
  private fragments: BlockFragment[] = [];
  private debugUI: DebugUI;
  private loadedModels: LoadedModels | null = null;

  private isSuccessHit = false;
  private lastTime = performance.now();

  constructor() {
    this.sceneManager = new SceneManager();
    this.debugUI = new DebugUI();
    this.powerMeter = new PowerMeter();

    // Initialisation des contrôles tactiles mobiles
    this.touchControls = new TouchControls(() => this.triggerPunchAction());

    // Bouton de redémarrage
    const restartBtn =
      document.getElementById('restart-button') ||
      document.getElementById('restrart-button');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartGame());
    }

    // Contrôles clavier
    window.addEventListener('keydown', this.onKeyDown.bind(this));

    this.initGame();
  }

  private async initGame(): Promise<void> {
    try {
      this.loadedModels = await ModelLoader.loadModels();

      this.spawnBlock();

      this.fist = new Fist(this.sceneManager.scene, this.loadedModels.fist, {
        startY: 4,
        impactY: 1.2,
        windUpY: 4.8,
        windUpSpeed: 6,
        downSpeed: 32,
        upSpeed: 8
      });

      this.animate();
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du jeu :', error);
    }
  }

  private triggerPunchAction(): void {
    if (
      this.fist &&
      this.fist.state === 'idle' &&
      this.powerMeter.isMoving
    ) {
      this.isSuccessHit = this.powerMeter.stop();
      this.fist.triggerPunch();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.triggerPunchAction();
    }
  }

  private spawnBlock(): void {
    if (!this.loadedModels) return;

    if (this.block) {
      this.block.destroy();
    }

    this.fragments.forEach((f) => f.update(10, this.sceneManager.scene));
    this.fragments = [];

    this.block = new Block(this.sceneManager.scene, this.loadedModels.brick);
  }

  private restartGame(): void {
    this.spawnBlock();
    this.powerMeter.reset();
    if (this.fist) {
      this.fist.reset();
    }
  }

  private handleImpact = (): void => {
    if (this.block) {
      if (this.isSuccessHit) {
        const newFragments = this.block.breakIntoPieces(25);
        this.fragments.push(...newFragments);
        this.block = null;
        this.sceneManager.triggerImpactShake(0.6);
      } else {
        this.sceneManager.triggerImpactShake(0.15);
      }
    }
  };

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    if (this.fist && this.fist.state === 'idle') {
      if (!this.powerMeter.isMoving) {
        this.powerMeter.reset();
      }
      this.powerMeter.update(deltaTime);
    }

    if (this.fist) {
      this.fist.update(deltaTime, this.handleImpact);
    }

    this.fragments.forEach((fragment) =>
      fragment.update(deltaTime, this.sceneManager.scene)
    );
    this.fragments = this.fragments.filter((f) => !f.isDead);

    this.sceneManager.updateCinematicCamera(deltaTime);
    this.debugUI.updateCameraPosition(this.sceneManager.camera);
    this.sceneManager.render();
  };
}

new Game();