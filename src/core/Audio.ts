import { clamp, randRange } from './math';

/**
 * Som 100% procedural (WebAudio) — zero arquivos pra baixar.
 * Cada efeito e' um envelope sobre ruido e/ou osciladores.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _volume = 0.7;

  /** Precisa ser chamado a partir de um gesto do usuario (clique). */
  init(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._volume;

    // Um pouco de compressao pra rajada nao estourar o master.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    this.master.connect(comp).connect(this.ctx.destination);

    // Buffer de ruido branco reaproveitado por todos os efeitos.
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  resume(): void { void this.ctx?.resume(); }
  suspend(): void { void this.ctx?.suspend(); }

  get volume(): number { return this._volume; }
  set volume(v: number) {
    this._volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this._volume;
  }

  private now(): number { return this.ctx?.currentTime ?? 0; }

  private noise(duration: number, gain: number, filterType: BiquadFilterType, freq: number, q = 1): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = randRange(0.9, 1.1);
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private tone(
    freqStart: number, freqEnd: number, duration: number, gain: number,
    type: OscillatorType = 'sine', delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // ---------------- efeitos do jogo ----------------

  shot(kind: 'pistol' | 'rifle' | 'shotgun'): void {
    switch (kind) {
      case 'pistol':
        this.noise(0.13, 0.5, 'bandpass', randRange(1500, 2000), 0.8);
        this.tone(320, 60, 0.1, 0.34, 'square');
        break;
      case 'rifle':
        this.noise(0.1, 0.42, 'bandpass', randRange(1900, 2500), 1.1);
        this.tone(420, 90, 0.07, 0.26, 'sawtooth');
        break;
      case 'shotgun':
        this.noise(0.3, 0.65, 'lowpass', 1400, 0.6);
        this.tone(180, 40, 0.24, 0.42, 'square');
        break;
    }
  }

  dryFire(): void { this.tone(1800, 900, 0.035, 0.16, 'square'); }

  reload(stage: 'out' | 'in'): void {
    if (stage === 'out') { this.tone(760, 380, 0.07, 0.2, 'square'); this.noise(0.07, 0.12, 'highpass', 2600); }
    else { this.tone(420, 900, 0.06, 0.24, 'square'); this.noise(0.05, 0.16, 'highpass', 3200); }
  }

  weaponSwitch(): void { this.tone(560, 900, 0.07, 0.18, 'triangle'); }

  impact(): void { this.noise(0.07, 0.2, 'highpass', 2400, 0.7); }

  /** Capsula batendo no chao. Curto e agudo — e' metal pequeno. */
  shellDrop(): void {
    this.tone(randRange(2400, 3400), randRange(1400, 2000), 0.05, 0.055, 'triangle');
    this.noise(0.04, 0.04, 'highpass', 4200, 1.4);
  }

  hitFlesh(head: boolean): void {
    this.noise(head ? 0.1 : 0.07, head ? 0.34 : 0.2, 'lowpass', head ? 900 : 620);
    if (head) this.tone(1300, 700, 0.08, 0.2, 'sine');
  }

  hitmarker(head: boolean): void { this.tone(head ? 1500 : 1050, head ? 1500 : 1050, 0.035, 0.16, 'square'); }

  enemyDeath(): void {
    this.tone(280, 60, 0.4, 0.24, 'sawtooth');
    this.noise(0.3, 0.16, 'lowpass', 700);
  }

  enemyAlert(): void { this.tone(200, 420, 0.22, 0.14, 'sawtooth'); }

  playerHurt(): void {
    this.tone(220, 90, 0.26, 0.3, 'sawtooth');
    this.noise(0.16, 0.2, 'lowpass', 420);
  }

  playerDeath(): void {
    this.tone(300, 40, 1.3, 0.4, 'sawtooth');
    this.noise(1.1, 0.22, 'lowpass', 320);
  }

  jump(): void { this.noise(0.05, 0.08, 'highpass', 1800); }

  land(force: number): void {
    this.noise(0.1, clamp(force * 0.22, 0.04, 0.3), 'lowpass', 500);
  }

  footstep(): void { this.noise(0.055, randRange(0.05, 0.09), 'bandpass', randRange(500, 1100), 1.2); }

  pickup(kind: 'health' | 'ammo'): void {
    if (kind === 'health') { this.tone(620, 940, 0.1, 0.22, 'sine'); this.tone(940, 1250, 0.12, 0.16, 'sine', 0.08); }
    else { this.tone(420, 640, 0.08, 0.2, 'square'); }
  }

  waveStart(): void {
    this.tone(180, 180, 0.5, 0.22, 'sawtooth');
    this.tone(240, 240, 0.5, 0.18, 'sawtooth', 0.16);
    this.tone(320, 320, 0.7, 0.2, 'sawtooth', 0.32);
  }

  waveClear(): void {
    this.tone(520, 520, 0.16, 0.2, 'triangle');
    this.tone(660, 660, 0.16, 0.2, 'triangle', 0.13);
    this.tone(880, 880, 0.45, 0.24, 'triangle', 0.26);
  }
}
