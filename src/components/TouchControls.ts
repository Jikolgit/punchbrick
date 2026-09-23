export class TouchControls {
  private button: HTMLButtonElement;

  constructor(onAction: () => void) {
    this.button = document.createElement('button');
    this.button.id = 'action-button';
    this.button.setAttribute('aria-label', 'Frapper');

    const handleTrigger = (e: Event) => {
      e.preventDefault();
      onAction();
    };

    // Support des événements tactiles et pointeur
    this.button.addEventListener('pointerdown', handleTrigger);

    const gameContainer = document.getElementById('game-container') || document.body;
    gameContainer.appendChild(this.button);
  }

  public setVisible(visible: boolean): void {
    this.button.style.display = visible ? 'block' : 'none';
  }
}