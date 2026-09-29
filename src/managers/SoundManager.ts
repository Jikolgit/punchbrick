/**
 * Effets sonores générés par synthèse (Web Audio API) : aucun fichier audio requis.
 * Le contexte audio est créé au premier geste du joueur (règle des navigateurs).
 */

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  duration: number;
  volume: number;
  attack?: number;
  delay?: number;
  lowpass?: number;
}

interface NoiseOptions {
  duration: number;
  volume: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  attack?: number;
  delay?: number;
}

export class SoundManager {
  private static readonly MUTE_KEY = 'blockBreaker.muted';

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly volume = 0.6;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(SoundManager.MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }

    // Déverrouillage de l'audio au premier geste du joueur
    const unlock = () => this.ensureContext();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  public get isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    try {
      localStorage.setItem(SoundManager.MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // stockage indisponible : le choix ne sera simplement pas mémorisé
    }
    return this.muted;
  }

  // --- Sons du jeu ---

  /** Souffle du poing qui part */
  public punch(): void {
    this.noise({ duration: 0.22, volume: 0.3, filter: 'bandpass', freq: 400, freqEnd: 2200, q: 1.2, attack: 0.08 });
  }

  /** Coup réussi mais le bloc résiste */
  public hit(): void {
    this.tone({ type: 'sine', freq: 170, freqEnd: 55, duration: 0.28, volume: 0.9 });
    this.tone({ type: 'triangle', freq: 95, freqEnd: 60, duration: 0.16, volume: 0.35 });
    this.noise({ duration: 0.08, volume: 0.5, filter: 'lowpass', freq: 1800 });
  }

  /** Destruction du bloc : explosion sourde + craquements de briques */
  public breakBlock(weight = 1): void {
    const w = Math.min(4, Math.max(1, weight));
    this.tone({ type: 'sine', freq: 120, freqEnd: 32, duration: 0.45 + w * 0.05, volume: 1 });
    this.noise({ duration: 0.45, volume: 0.8, filter: 'lowpass', freq: 3500, freqEnd: 250 });

    const crackles = 6 + w * 2;
    for (let i = 0; i < crackles; i++) {
      this.noise({
        duration: 0.025 + Math.random() * 0.03,
        volume: 0.2 + Math.random() * 0.2,
        filter: 'bandpass',
        freq: 1500 + Math.random() * 3500,
        q: 3,
        delay: 0.02 + Math.random() * 0.3,
      });
    }
  }

  /** Coup raté : impact mat + son d'échec */
  public miss(): void {
    this.tone({ type: 'sine', freq: 130, freqEnd: 60, duration: 0.2, volume: 0.7 });
    this.tone({ type: 'square', freq: 220, freqEnd: 110, duration: 0.35, volume: 0.12, delay: 0.06, lowpass: 1200 });
  }

  /** Bloc qui touche le sol, plus lourd selon sa résistance */
  public land(weight = 1): void {
    const w = Math.min(4, Math.max(1, weight));
    this.tone({ type: 'sine', freq: 95, freqEnd: 38, duration: 0.3, volume: 0.3 + w * 0.15 });
    this.noise({ duration: 0.15, volume: 0.15 + w * 0.08, filter: 'lowpass', freq: 700 });
  }

  /** Activation d'une zone du bloc bonus (son de plus en plus aigu) */
  public zoneActivate(step: number): void {
    const notes = [659, 880, 1109];
    const freq = notes[Math.min(step, notes.length - 1)];
    this.tone({ type: 'triangle', freq, duration: 0.22, volume: 0.35 });
    this.tone({ type: 'sine', freq: freq * 2, duration: 0.3, volume: 0.12, delay: 0.02 });
  }

  /** Destruction du bloc bonus, avec une fanfare en plus si l'ordre est parfait */
  public specialBreak(perfect: boolean): void {
    this.breakBlock(2);
    const notes = perfect ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((freq, i) => {
      this.tone({ type: 'triangle', freq, duration: 0.25, volume: 0.28, delay: 0.1 + i * 0.07 });
    });
  }

  /** Bloc bonus qui disparaît */
  public vanish(): void {
    this.noise({ duration: 0.4, volume: 0.3, filter: 'bandpass', freq: 800, freqEnd: 4500, q: 1.5, attack: 0.05 });
    this.tone({ type: 'sine', freq: 700, freqEnd: 180, duration: 0.35, volume: 0.2 });
  }

  public gameOver(): void {
    const notes = [392, 330, 262];
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1;
      this.tone({
        type: 'square',
        freq,
        freqEnd: last ? freq * 0.9 : undefined,
        duration: last ? 0.8 : 0.3,
        volume: 0.14,
        delay: i * 0.3,
        lowpass: 1500,
      });
    });
  }

  /** Clic sur un bouton d'interface */
  public uiClick(): void {
    this.tone({ type: 'triangle', freq: 900, freqEnd: 600, duration: 0.07, volume: 0.2 });
  }

  // --- Synthèse ---

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      // Buffer de bruit blanc réutilisé par tous les sons "bruités"
      const length = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createEnvelope(ctx: AudioContext, start: number, attack: number, duration: number, volume: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(this.master!);
    return gain;
  }

  private tone(opts: ToneOptions): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;

    const start = ctx.currentTime + (opts.delay ?? 0);
    const end = start + opts.duration;
    const envelope = this.createEnvelope(ctx, start, opts.attack ?? 0.005, opts.duration, opts.volume);

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, end);
    }

    if (opts.lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.lowpass;
      osc.connect(filter);
      filter.connect(envelope);
    } else {
      osc.connect(envelope);
    }

    osc.start(start);
    osc.stop(end + 0.05);
  }

  private noise(opts: NoiseOptions): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted || !this.noiseBuffer) return;

    const start = ctx.currentTime + (opts.delay ?? 0);
    const end = start + opts.duration;
    const envelope = this.createEnvelope(ctx, start, opts.attack ?? 0.003, opts.duration, opts.volume);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter ?? 'lowpass';
    filter.Q.value = opts.q ?? 0.7;
    filter.frequency.setValueAtTime(opts.freq ?? 2000, start);
    if (opts.freqEnd) {
      filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, end);
    }

    source.connect(filter);
    filter.connect(envelope);

    // Point de départ aléatoire dans le buffer pour varier chaque son
    source.start(start, Math.random() * 0.5);
    source.stop(end + 0.05);
  }
}
