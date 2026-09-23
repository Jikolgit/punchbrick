export class PowerMeter {
  private container: HTMLDivElement;
  private cursor: HTMLDivElement;
  private targetZone: HTMLDivElement;

  private progress = 0;
  private speed = 1.8;
  public isMoving = true;

  private targetMin = 40;
  private targetMax = 70;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'power-meter-container';

    this.targetZone = document.createElement('div');
    this.targetZone.className = 'power-meter-target';
    this.targetZone.style.bottom = `${this.targetMin}%`;
    this.targetZone.style.height = `${this.targetMax - this.targetMin}%`;

    this.cursor = document.createElement('div');
    this.cursor.className = 'power-meter-cursor';

    this.container.appendChild(this.targetZone);
    this.container.appendChild(this.cursor);

    const gameContainer = document.getElementById('game-container') || document.body;
    gameContainer.appendChild(this.container);
  }

  public update(deltaTime: number): void {
    if (!this.isMoving) return;

    this.progress += deltaTime * this.speed;

    const normalizedPosition = (Math.sin(this.progress * Math.PI * 2) + 1) / 2;
    const percentage = normalizedPosition * 100;

    const heightInPx = 280;
    const pixelY = (percentage / 100) * heightInPx;

    this.cursor.style.transform = `translate3d(0, -${pixelY}px, 0)`;
    this.cursor.dataset.position = percentage.toFixed(2);
  }

  public stop(): boolean {
    this.isMoving = false;
    const currentPos = parseFloat(this.cursor.dataset.position || '0');
    return currentPos >= this.targetMin && currentPos <= this.targetMax;
  }

  public reset(): void {
    this.isMoving = true;
  }
}