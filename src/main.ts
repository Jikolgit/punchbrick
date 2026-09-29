import { SceneManager } from './managers/SceneManager';
import { SoundManager } from './managers/SoundManager';
import { Block } from './components/Block';
import { Fist } from './components/Fist';
import { BlockFragment } from './components/BlockFragment';
import { PowerMeter } from './components/PowerMeter';
import { TouchControls } from './components/TouchControls';
import { ModelLoader, type LoadedModels } from './utils/ModelLoader';
import { DebugUI } from './utils/DebugUI';
import './style.css';

type GameState = 'title' | 'levelSelect' | 'playing' | 'paused' | 'gameOver';
type GameMode = 'adventure' | 'challenge' | null;
type NormalBlockTypeId = 'easy' | 'hard' | 'veryHard';
type BlockTypeId = NormalBlockTypeId | 'special';
type SpecialOutcome = 'break' | 'vanish' | null;

interface BlockTypeConfig {
  resistance: number;
  points: number;
  zone: { min: number; max: number };
  weight: number; // poids relatif pour le tirage aléatoire
}

class Game {
  private static readonly BEST_SCORE_KEY = 'blockBreaker.bestScore';
  private static readonly BEST_BLOCKS_KEY = 'blockBreaker.bestBlocksBroken';
  private static readonly DEBUG_FORCE_VALUE = 99; // force "instant break" pour les tests

  private sceneManager: SceneManager;
  private sound: SoundManager;
  private block: Block | null = null;
  private fist: Fist | null = null;
  private powerMeter: PowerMeter;
  private touchControls: TouchControls;
  private fragments: BlockFragment[] = [];
  // Blocs cassés dont la barre de vie termine son animation avant de disparaître
  private breakingBlocks: Block[] = [];
  private debugUI: DebugUI;
  private loadedModels: LoadedModels | null = null;

  private isSuccessHit = false;
  private lastTime = performance.now();

  // Réapparition / game over différés : se déclenchent quand le poing finit de remonter
  private pendingBlockSpawn = false;
  private pendingGameOver = false;
  private pendingSpecialOutcome: SpecialOutcome = null;
  private pendingSpecialActivatedOrder: number[] = [];

  // Statistiques de la partie en cours
  private lives = 4;
  private force = 1;
  private score = 0;
  private blocksBroken = 0;
  private currentBlockType: BlockTypeId = 'easy';

  // Blocs bonus (spéciaux)
  private isSpecialBlockActive = false;
  private blocksSinceSpecial = 0;
  private readonly specialBlockInterval = 5;
  private currentSpecialZones: Array<{ id: number; min: number; max: number }> = [];

  private readonly blockTypes: Record<NormalBlockTypeId, BlockTypeConfig> = {
    easy: { resistance: 1, points: 5, zone: { min: 25, max: 75 }, weight: 3 },
    hard: { resistance: 2, points: 10, zone: { min: 38, max: 62 }, weight: 2 },
    veryHard: { resistance: 4, points: 15, zone: { min: 46, max: 54 }, weight: 1 },
  };

  // État de jeu
  private state: GameState = 'title';
  private mode: GameMode = null;
  private currentLevel: number | null = null;

  // Écrans
  private titleScreen: HTMLElement | null = null;
  private levelSelectScreen: HTMLElement | null = null;
  private pauseScreen: HTMLElement | null = null;
  private pauseButton: HTMLElement | null = null;
  private gameOverScreen: HTMLElement | null = null;
  private hud: HTMLElement | null = null;

  // Éléments de texte
  private livesValueEl: HTMLElement | null = null;
  private forceValueEl: HTMLElement | null = null;
  private scoreValueEl: HTMLElement | null = null;
  private finalScoreEl: HTMLElement | null = null;
  private finalBlocksEl: HTMLElement | null = null;
  private bestScoreDisplayEl: HTMLElement | null = null;

  constructor() {
    this.sceneManager = new SceneManager();
    this.sound = new SoundManager();
    this.debugUI = new DebugUI();
    this.powerMeter = new PowerMeter();

    this.touchControls = new TouchControls(() => this.triggerPunchAction());

    this.setupScreens();
    this.updateTitleBestStats();
    window.addEventListener('keydown', this.onKeyDown.bind(this));

    this.initGame();
  }

  private setupScreens(): void {
    this.titleScreen = document.getElementById('title-screen');
    this.levelSelectScreen = document.getElementById('level-select-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.pauseButton = document.getElementById('pause-button');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.hud = document.getElementById('hud');

    this.livesValueEl = document.getElementById('lives-value');
    this.forceValueEl = document.getElementById('force-value');
    this.scoreValueEl = document.getElementById('score-value');
    this.finalScoreEl = document.getElementById('final-score');
    this.finalBlocksEl = document.getElementById('final-blocks-broken');
    this.bestScoreDisplayEl = document.getElementById('best-score-display');

    // Son de clic sur tous les boutons d'interface
    document.addEventListener('click', (event) => {
      if ((event.target as HTMLElement | null)?.closest('button')) {
        this.sound.uiClick();
      }
    });

    // Écran titre
    document
      .getElementById('start-adventure-button')
      ?.addEventListener('click', () => this.showLevelSelect());

    document
      .getElementById('start-challenge-button')
      ?.addEventListener('click', () => this.startGame('challenge'));

    // Sélection de niveau
    document
      .getElementById('back-to-title-button')
      ?.addEventListener('click', () => this.showTitle());

    document.querySelectorAll<HTMLButtonElement>('.level-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const level = Number(btn.dataset.level) || 1;
        this.startGame('adventure', level);
      });
    });

    // Pause
    this.pauseButton?.addEventListener('click', () => this.togglePause());

    const restartBtn =
      document.getElementById('restart-button') ||
      document.getElementById('restrart-button');
    restartBtn?.addEventListener('click', () => this.restartGame());

    document
      .getElementById('back-to-title-from-pause-button')
      ?.addEventListener('click', () => this.quitToTitle());

    // Game over
    document
      .getElementById('game-over-restart-button')
      ?.addEventListener('click', () => {
        this.gameOverScreen?.classList.add('hidden');
        this.restartGame();
      });

    document
      .getElementById('game-over-menu-button')
      ?.addEventListener('click', () => {
        this.gameOverScreen?.classList.add('hidden');
        this.quitToTitle();
      });
  }

  private async initGame(): Promise<void> {
    try {
      this.loadedModels = await ModelLoader.loadModels();

      this.spawnBlock();

      this.fist = new Fist(this.sceneManager.scene, this.loadedModels.fist, {
        startY: 10,
        impactY: 1.2,
        windUpOffset: 2,
        windUpSpeed: 6,
        downSpeed: 32,
        upSpeed: 8
      });

      this.animate();
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du jeu :', error);
    }
  }

  // --- Navigation entre écrans ---

  private showTitle(): void {
    this.state = 'title';
    this.titleScreen?.classList.remove('hidden');
    this.levelSelectScreen?.classList.add('hidden');
    this.pauseButton?.classList.add('hidden');
    this.hud?.classList.add('hidden');
    this.updateTitleBestStats();
  }

  private showLevelSelect(): void {
    this.state = 'levelSelect';
    this.titleScreen?.classList.add('hidden');
    this.levelSelectScreen?.classList.remove('hidden');
  }

  private startGame(mode: GameMode, level: number | null = null): void {
    this.mode = mode;
    this.currentLevel = level;

    this.titleScreen?.classList.add('hidden');
    this.levelSelectScreen?.classList.add('hidden');
    this.pauseButton?.classList.remove('hidden');
    this.hud?.classList.remove('hidden');

    this.restartGame();
    this.state = 'playing';
    this.lastTime = performance.now();
  }

  private togglePause(): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;

    this.state = this.state === 'paused' ? 'playing' : 'paused';
    this.pauseScreen?.classList.toggle('hidden', this.state !== 'paused');

    if (this.state === 'playing') {
      this.lastTime = performance.now();
    }
  }

  /**
   * Quitte la partie en cours depuis l'écran de pause : nettoie la scène
   * (bloc + fragments) tout de suite, puis retourne à l'écran titre.
   */
  private quitToTitle(): void {
    this.pauseScreen?.classList.add('hidden');

    this.clearScene();
    this.powerMeter.reset();
    this.powerMeter.exitSpecialMode();
    if (this.fist) {
      this.fist.reset();
    }
    this.pendingBlockSpawn = false;
    this.pendingGameOver = false;
    this.pendingSpecialOutcome = null;
    this.isSpecialBlockActive = false;

    this.mode = null;
    this.currentLevel = null;

    this.showTitle();
  }

  // --- Statistiques / persistance ---

  private updateHud(): void {
    if (this.livesValueEl) this.livesValueEl.textContent = String(this.lives);
    if (this.forceValueEl) this.forceValueEl.textContent = String(this.force);
    if (this.scoreValueEl) this.scoreValueEl.textContent = String(this.score);
  }

  private loadBestStats(): { bestScore: number; bestBlocksBroken: number } {
    const bestScore = Number(localStorage.getItem(Game.BEST_SCORE_KEY)) || 0;
    const bestBlocksBroken = Number(localStorage.getItem(Game.BEST_BLOCKS_KEY)) || 0;
    return { bestScore, bestBlocksBroken };
  }

  private saveBestStatsIfNeeded(): void {
    const { bestScore, bestBlocksBroken } = this.loadBestStats();

    if (this.score > bestScore) {
      localStorage.setItem(Game.BEST_SCORE_KEY, String(this.score));
    }
    if (this.blocksBroken > bestBlocksBroken) {
      localStorage.setItem(Game.BEST_BLOCKS_KEY, String(this.blocksBroken));
    }
  }

  private updateTitleBestStats(): void {
    const { bestScore, bestBlocksBroken } = this.loadBestStats();
    if (this.bestScoreDisplayEl) {
      this.bestScoreDisplayEl.textContent =
        `Meilleur score : ${bestScore} — Blocs cassés : ${bestBlocksBroken}`;
    }
  }

  // --- Sélection / apparition du bloc ---

  private pickRandomBlockType(): NormalBlockTypeId {
    const entries = Object.entries(this.blockTypes) as [NormalBlockTypeId, BlockTypeConfig][];
    const totalWeight = entries.reduce((sum, [, cfg]) => sum + cfg.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const [id, cfg] of entries) {
      roll -= cfg.weight;
      if (roll <= 0) return id;
    }
    return entries[0][0];
  }

  /**
   * Génère 3 zones vertes à des positions aléatoires (non chevauchantes),
   * avec les numéros 1/2/3 attribués eux aussi au hasard — la disposition
   * spatiale ne correspond donc jamais forcément à l'ordre numérique.
   */
  private generateRandomSpecialZones(): Array<{ id: number; min: number; max: number }> {
    const slots = [
      { min: 6, max: 34 },
      { min: 36, max: 64 },
      { min: 66, max: 94 },
    ];

    const shuffledSlots = [...slots].sort(() => Math.random() - 0.5);
    const ids = [1, 2, 3].sort(() => Math.random() - 0.5);

    return shuffledSlots.map((slot, i) => {
      const slotWidth = slot.max - slot.min;
      const zoneWidth = 10 + Math.random() * (slotWidth - 10); // largeur de zone variable
      const maxStart = slot.max - zoneWidth;
      const start = slot.min + Math.random() * (maxStart - slot.min);

      return { id: ids[i], min: Math.round(start), max: Math.round(start + zoneWidth) };
    });
  }

  /**
   * Crée un nouveau bloc. Si forcedType est fourni (mode debug), ce type
   * est utilisé directement. Sinon : un bloc spécial apparaît toutes les
   * `specialBlockInterval` destructions normales, sinon un type est tiré
   * au hasard parmi les blocs normaux.
   */
  private spawnBlockOfType(forcedType?: BlockTypeId): void {
    if (!this.loadedModels) return;

    let type: BlockTypeId;
    if (forcedType) {
      type = forcedType;
    } else if (this.blocksSinceSpecial >= this.specialBlockInterval) {
      type = 'special';
    } else {
      type = this.pickRandomBlockType();
    }

    this.currentBlockType = type;

    if (this.block) {
      this.block.destroy();
    }

    if (type === 'special') {
      this.blocksSinceSpecial = 0;
      this.isSpecialBlockActive = true;
      this.block = new Block(this.sceneManager.scene, this.loadedModels.brick, 1);
      this.currentSpecialZones = this.generateRandomSpecialZones();
      this.powerMeter.setSpecialZones(this.currentSpecialZones);
      this.powerMeter.resetSpecialActivation();
    } else {
      this.isSpecialBlockActive = false;
      const cfg = this.blockTypes[type];
      this.block = new Block(this.sceneManager.scene, this.loadedModels.brick, cfg.resistance);
      this.powerMeter.setTargetZone(cfg.zone.min, cfg.zone.max);
    }
  }

  // --- Gameplay ---

  private triggerPunchAction(): void {
    if (this.state !== 'playing') return;

    // Empêcher de frapper si le bloc est encore en train de tomber
  if (this.block && this.block.isFalling) return;

    if (!(this.fist && this.fist.state === 'idle' && this.powerMeter.isMoving)) {
      return;
    }

    if (!this.block) {
      this.sound.punch();
      this.fist.triggerPunch();
      return;
    }

    if (this.isSpecialBlockActive) {
      this.handleSpecialPunch();
    } else {
      this.handleNormalPunch();
    }
  }

  private handleNormalPunch(): void {
    this.isSuccessHit = this.powerMeter.stop();
    this.sound.punch();

    if (this.isSuccessHit) {
      const willBreak = this.block!.hp <= this.force;

      if (willBreak) {
        // Le poing traverse jusqu'à impactY, le bloc explose à l'impact
        this.fist!.triggerPunch();
      } else {
        // Coup réussi mais insuffisant : le poing s'arrête à la surface
        // sans trembler lui-même — c'est le bloc qui tremble (voir resolveNormalImpact)
        this.fist!.triggerPunch(this.block!.getTopY(), false);
      }
    } else {
      // Échec : le poing s'arrête à la surface et tremble
      this.fist!.triggerPunch(this.block!.getTopY());
    }
  }

  private handleSpecialPunch(): void {
    const result = this.powerMeter.stopSpecial();

    if (result.zoneId !== null) {
      const allZonesActivated = result.activatedOrder.length >= this.currentSpecialZones.length;
      this.sound.zoneActivate(result.activatedOrder.length - 1);

      if (allZonesActivated) {
        // Toutes les zones sont allumées : le poing frappe et casse le bloc automatiquement
        this.pendingSpecialOutcome = 'break';
        this.pendingSpecialActivatedOrder = result.activatedOrder;
        this.sound.punch();
        this.fist!.triggerPunch();
      }
      // Sinon : coup "chargé", pas de frappe sur le bloc pour l'instant
      // (un effet de charge viendra plus tard). Le poing reste en 'idle',
      // donc la jauge repart d'elle-même au prochain instant.
      return;
    }

    this.sound.punch();

    if (result.activatedOrder.length > 0) {
      // Raté en dehors des zones, mais au moins une zone déjà activée : le bloc casse
      this.pendingSpecialOutcome = 'break';
      this.pendingSpecialActivatedOrder = result.activatedOrder;
      this.fist!.triggerPunch();
    } else {
      // Raté sans aucune zone activée : le bloc spécial disparaît, sans pénalité
      this.pendingSpecialOutcome = 'vanish';
      this.fist!.triggerPunch(this.block!.getTopY(), false);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      event.preventDefault();
      this.triggerPunchAction();
      return;
    }

    if (event.code === 'Escape') {
      this.togglePause();
      return;
    }

    if (event.code === 'KeyM') {
      this.sound.toggleMute();
      return;
    }

    // --- Mode développeur : retiré automatiquement du build de production ---
    if (import.meta.env.DEV) {
      if (event.code === 'Digit1') this.debugSpawnBlockType('easy');
      else if (event.code === 'Digit2') this.debugSpawnBlockType('hard');
      else if (event.code === 'Digit3') this.debugSpawnBlockType('veryHard');
      else if (event.code === 'Digit4') this.debugSpawnBlockType('special');
      else if (event.code === 'KeyF') this.debugToggleForce();
    }
  }

  /**
   * [DEV] Force l'apparition d'un bloc d'un type donné, pour tester
   * chaque mécanique sans attendre le tirage aléatoire ou le compteur.
   */
  private debugSpawnBlockType(type: BlockTypeId): void {
    if (this.state !== 'playing') return;

    this.spawnBlockOfType(type);
    this.pendingBlockSpawn = false;
    this.pendingSpecialOutcome = null;
    if (this.fist) this.fist.reset();
    this.powerMeter.reset();

    console.log(`[DEV] Bloc forcé : ${type}`);
  }

  /**
   * [DEV] Bascule la force du joueur entre 1 et une valeur très élevée,
   * pour tester instantanément le cas "le coup casse le bloc".
   */
  private debugToggleForce(): void {
    this.force = this.force === 1 ? Game.DEBUG_FORCE_VALUE : 1;
    this.updateHud();
    console.log(`[DEV] Force réglée à ${this.force}`);
  }

  private loseLife(): void {
    this.lives -= 1;
    this.updateHud();

    if (this.lives <= 0) {
      // Le passage effectif à l'écran Game Over attend la fin du tremblement du poing
      this.pendingGameOver = true;
    }
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.pauseButton?.classList.add('hidden');
    this.hud?.classList.add('hidden');

    this.saveBestStatsIfNeeded();
    this.sound.gameOver();

    if (this.finalScoreEl) this.finalScoreEl.textContent = String(this.score);
    if (this.finalBlocksEl) this.finalBlocksEl.textContent = String(this.blocksBroken);

    this.gameOverScreen?.classList.remove('hidden');
  }

  /**
   * Retire le bloc actuel et tous les fragments de la scène, sans
   * en recréer de nouveau (utilisé pour un retour immédiat au titre).
   */
  private clearScene(): void {
    if (this.block) {
      this.block.destroy();
      this.block = null;
    }

    this.breakingBlocks.forEach((b) => b.destroy());
    this.breakingBlocks = [];

    this.fragments.forEach((f) => f.update(10, this.sceneManager.scene));
    this.fragments = [];
  }

  private spawnBlock(): void {
    if (!this.loadedModels) return;

    this.fragments.forEach((f) => f.update(10, this.sceneManager.scene));
    this.fragments = [];

    this.spawnBlockOfType();
  }

  /**
   * Fait apparaître un nouveau bloc sans toucher aux fragments existants
   * (utilisé pour la réapparition automatique après une destruction).
   */
  private spawnNextBlock(): void {
    this.spawnBlockOfType();
  }

  private restartGame(): void {
    this.lives = 4;
    this.force = 1;
    this.score = 0;
    this.blocksBroken = 0;
    this.blocksSinceSpecial = 0;
    this.isSpecialBlockActive = false;
    this.pendingBlockSpawn = false;
    this.pendingGameOver = false;
    this.pendingSpecialOutcome = null;

    this.gameOverScreen?.classList.add('hidden');
    this.updateHud();

    this.spawnBlock();
    this.powerMeter.reset();
    if (this.fist) {
      this.fist.reset();
    }

    if (this.state === 'paused') {
      this.pauseScreen?.classList.add('hidden');
    }
    this.state = 'playing';
    this.hud?.classList.remove('hidden');
  }

  private handleImpact = (): void => {
    if (!this.block) return;

    if (this.isSpecialBlockActive) {
      this.resolveSpecialImpact();
    } else {
      this.resolveNormalImpact();
    }
  };

  private resolveNormalImpact(): void {
    if (!this.block) return;

    if (this.isSuccessHit) {
      const destroyed = this.block.takeDamage(this.force);

      if (destroyed) {
        const cfg = this.blockTypes[this.currentBlockType as NormalBlockTypeId];
        this.score += cfg.points;
        this.blocksBroken += 1;
        this.blocksSinceSpecial += 1;
        this.updateHud();

        this.sceneManager.triggerImpactShake(0.6);
        this.sound.breakBlock(this.block.maxHp);

        const newFragments = this.block.breakIntoPieces(25);
        this.fragments.push(...newFragments);
        this.breakingBlocks.push(this.block);
        this.block = null;
        this.pendingBlockSpawn = true;
      } else {
        this.block.triggerShake();
        this.sceneManager.triggerImpactShake(0.2);
        this.sound.hit();
      }
    } else {
      this.sceneManager.triggerImpactShake(0.15);
      this.sound.miss();
      this.loseLife();
    }
  }

  private resolveSpecialImpact(): void {
    if (!this.block) return;

    const outcome = this.pendingSpecialOutcome;
    this.pendingSpecialOutcome = null;

    if (outcome === 'break') {
      const activatedOrder = this.pendingSpecialActivatedOrder;
      const zonesHit = activatedOrder.length;
      const totalZones = this.currentSpecialZones.length;
      const isFullyOrdered =
        zonesHit === totalZones &&
        activatedOrder.every((id, i, arr) => i === 0 || id > arr[i - 1]);

      this.score += zonesHit * 10 + (isFullyOrdered ? 20 : 0);
      this.blocksBroken += 1;
      this.updateHud();

      this.sceneManager.triggerImpactShake(0.6);
      this.sound.specialBreak(isFullyOrdered);

      const newFragments = this.block.breakIntoPieces(25);
      this.fragments.push(...newFragments);
      this.breakingBlocks.push(this.block);
      this.block = null;
      this.isSpecialBlockActive = false;
      this.pendingBlockSpawn = true;
      return;
    }

    if (outcome === 'vanish') {
      this.block.destroy();
      this.block = null;
      this.isSpecialBlockActive = false;
      this.sceneManager.triggerImpactShake(0.1);
      this.sound.vanish();
      this.pendingBlockSpawn = true; // le prochain bloc (normal) apparaît dès la remontée du poing
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Hors du mode 'playing' (titre, sélection de niveau, pause, game over) :
    // on affiche juste la scène, sans faire tourner la logique de jeu.
    if (this.state !== 'playing') {
      this.sceneManager.render();
      return;
    }

    if (this.fist && this.fist.state === 'idle') {
      if (!this.powerMeter.isMoving) {
        this.powerMeter.reset();
      }
      this.powerMeter.update(deltaTime);
    }

    if (this.fist) {
      this.fist.update(deltaTime, this.handleImpact);
    }

    // Le poing vient peut-être de terminer sa remontée : on gère les actions
    // différées (réapparition du bloc ou passage au game over) à ce moment précis.
    if (this.fist && this.fist.state === 'idle') {
      if (this.pendingBlockSpawn) {
        this.pendingBlockSpawn = false;
        this.spawnNextBlock();
      } else if (this.pendingGameOver) {
        this.pendingGameOver = false;
        this.triggerGameOver();
      }
    }

    if (this.block) {
      const wasLanded = this.block.hasLanded;
      this.block.update(deltaTime);
      if (!wasLanded && this.block.hasLanded) {
        this.sound.land(this.block.maxHp);
      }
    }

    this.breakingBlocks.forEach((b) => b.update(deltaTime));
    this.breakingBlocks = this.breakingBlocks.filter((b) => !b.isDead);

    this.fragments.forEach((fragment) =>
      fragment.update(deltaTime, this.sceneManager.scene)
    );
    this.fragments = this.fragments.filter((f) => !f.isDead);

    this.sceneManager.updateCinematicCamera(deltaTime);
    this.debugUI.updateCameraPosition(this.sceneManager.camera);

    if (import.meta.env.DEV) {
      const status = this.isSpecialBlockActive
        ? `bonus (${this.blocksSinceSpecial}/${this.specialBlockInterval} avant le prochain)`
        : this.block
          ? String(this.block.hp)
          : '—';
      this.debugUI.updateGameInfo(this.currentBlockType, status, this.force);
    }

    this.sceneManager.render();
  };
}

new Game();