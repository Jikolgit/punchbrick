interface SpecialZoneState {
  id: number;
  min: number;
  max: number;
  element: HTMLDivElement;
  activated: boolean;
}

export interface SpecialStopResult {
  zoneId: number | null;
  justActivated: boolean;
  activatedOrder: number[];
}

export class PowerMeter {
  private container: HTMLDivElement;
  private cursor: HTMLDivElement;
  private targetZone: HTMLDivElement;

  private progress = 0;
  private speed = 0.4;
  public isMoving = true;

  // Position actuelle du curseur en % (0 à 100), stockée en nombre
  private currentPercentage = 50;

  private targetMin = 40;
  private targetMax = 70;

  // Mode spécial (blocs bonus) : plusieurs zones numérotées à allumer
  private isSpecialMode = false;
  private specialZones: SpecialZoneState[] = [];

  constructor() {
    // Conteneur : les styles essentiels sont en ligne pour ne pas dépendre de style.css
    this.container = document.createElement('div');
    this.container.id = 'power-meter-container';
    Object.assign(this.container.style, {
      position: 'fixed',
      right: '24px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '28px',
      height: 'min(50vh, 280px)',
      background: 'rgba(255, 255, 255, 0.15)',
      border: '2px solid #ffffff',
      borderRadius: '14px',
      overflow: 'hidden', // cache tout ce qui dépasse de la jauge
      zIndex: '20',
      pointerEvents: 'none',
    });

    // Zone cible (mode normal)
    this.targetZone = document.createElement('div');
    this.targetZone.className = 'power-meter-target';
    Object.assign(this.targetZone.style, {
      position: 'absolute',
      left: '0',
      width: '100%',
      bottom: `${this.targetMin}%`,
      height: `${this.targetMax - this.targetMin}%`,
      background: 'rgba(76, 217, 100, 0.7)',
      zIndex: '1',
    });

    // Curseur (toujours au-dessus des zones, quel que soit le mode)
    this.cursor = document.createElement('div');
    this.cursor.className = 'power-meter-cursor';
    Object.assign(this.cursor.style, {
      position: 'absolute',
      left: '0',
      width: '100%',
      height: '8px',
      background: '#e94560',
      borderRadius: '4px',
      transform: 'translateY(50%)', // centre le curseur sur sa valeur
      zIndex: '2',
    });

    this.container.appendChild(this.targetZone);
    this.container.appendChild(this.cursor);

    const gameContainer = document.getElementById('game-container') || document.body;
    gameContainer.appendChild(this.container);

    this.render();
  }

  public update(deltaTime: number): void {
    if (!this.isMoving) return;

    this.progress += deltaTime * this.speed;

    const normalizedPosition = (Math.sin(this.progress * Math.PI * 2) + 1) / 2;
    this.currentPercentage = normalizedPosition * 100;

    this.render();
  }

  private render(): void {
    // Positionné en % : s'adapte à toutes les tailles d'écran
    this.cursor.style.bottom = `${this.currentPercentage}%`;
  }

  // --- Mode normal (blocs faciles / difficiles / très difficiles) ---

  /**
   * Change la largeur (et la position) de la zone cible verte.
   * Bascule automatiquement hors du mode spécial si besoin.
   */
  public setTargetZone(min: number, max: number): void {
    this.exitSpecialMode();
    this.targetZone.style.display = 'block';
    this.targetMin = min;
    this.targetMax = max;
    this.targetZone.style.bottom = `${min}%`;
    this.targetZone.style.height = `${max - min}%`;
  }

  public stop(): boolean {
    this.isMoving = false;
    return (
      this.currentPercentage >= this.targetMin &&
      this.currentPercentage <= this.targetMax
    );
  }

  // --- Mode spécial (blocs bonus à zones multiples) ---

  /**
   * Passe en mode spécial : affiche plusieurs zones numérotées à la place
   * de la zone unique. Chaque zone garde son propre état "activée".
   */
  public setSpecialZones(zones: Array<{ id: number; min: number; max: number }>): void {
    this.exitSpecialMode();
    this.targetZone.style.display = 'none';
    this.isSpecialMode = true;

    this.specialZones = zones.map((z) => {
      const el = document.createElement('div');
      el.className = 'power-meter-special-zone';
      Object.assign(el.style, {
        position: 'absolute',
        left: '0',
        width: '100%',
        bottom: `${z.min}%`,
        height: `${z.max - z.min}%`,
        background: 'rgba(76, 217, 100, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '11px',
        fontFamily: 'sans-serif',
        zIndex: '1',
        transition: 'background 0.15s ease, box-shadow 0.15s ease',
      });
      el.textContent = String(z.id);
      this.container.appendChild(el);

      return { id: z.id, min: z.min, max: z.max, element: el, activated: false };
    });
  }

  /**
   * Quitte le mode spécial et retire ses éléments visuels.
   * Sans effet si on n'était pas en mode spécial.
   */
  public exitSpecialMode(): void {
    if (!this.isSpecialMode) return;
    this.isSpecialMode = false;
    this.specialZones.forEach((z) => z.element.remove());
    this.specialZones = [];
  }

  /**
   * Équivalent de stop() pour le mode spécial : allume la zone touchée
   * si elle ne l'était pas déjà, et renvoie l'état complet pour que
   * l'appelant décide (bloc qui tremble, qui casse, ou qui disparaît).
   */
  public stopSpecial(): SpecialStopResult {
    this.isMoving = false;
    const pos = this.currentPercentage;
    const hitZone = this.specialZones.find((z) => pos >= z.min && pos <= z.max);

    if (!hitZone) {
      return { zoneId: null, justActivated: false, activatedOrder: this.getActivatedOrder() };
    }

    const justActivated = !hitZone.activated;
    if (justActivated) {
      hitZone.activated = true;
      hitZone.element.style.background = 'rgba(255, 215, 0, 0.9)'; // doré : zone activée
      hitZone.element.style.boxShadow = '0 0 12px rgba(255, 215, 0, 0.9)';
      this.activationOrder.push(hitZone.id);
    }

    return { zoneId: hitZone.id, justActivated, activatedOrder: this.getActivatedOrder() };
  }

  private activationOrder: number[] = [];

  private getActivatedOrder(): number[] {
    return [...this.activationOrder];
  }

  public reset(): void {
    this.isMoving = true;
  }

  /**
   * Réinitialise l'état d'activation des zones (utilisé quand un nouveau
   * bloc spécial apparaît, pour repartir sur des zones toutes éteintes).
   */
  public resetSpecialActivation(): void {
    this.activationOrder = [];
    this.specialZones.forEach((z) => {
      z.activated = false;
      z.element.style.background = 'rgba(76, 217, 100, 0.7)';
      z.element.style.boxShadow = 'none';
    });
  }
}