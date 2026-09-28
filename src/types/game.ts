export type PunchState = 'idle' | 'prepare' | 'down' | 'shake' | 'up';

export interface PunchConfig {
  startY: number;
  impactY: number;
  downSpeed: number;
  upSpeed: number;
  windUpY?: number;    // Hauteur max du recul (ex: 4.6)
  windUpSpeed?: number; // Vitesse de la préparation (ex: 8)
}