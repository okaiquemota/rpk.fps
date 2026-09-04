import { STORAGE_KEY } from '../config';

export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  /** Girar a camera ao levar o mouse ate' a borda (so' vale sem pointer lock). */
  edgeTurn: boolean;
}

export interface SaveData {
  settings: Settings;
  bestWave: number;
  bestScore: number;
}

const DEFAULTS: SaveData = {
  settings: { sensitivity: 1, fov: 85, volume: 0.7, edgeTurn: true },
  bestWave: 0,
  bestScore: 0,
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export interface RunStats {
  wave: number;
  kills: number;
  score: number;
  shotsFired: number;
  shotsHit: number;
}

/**
 * Telas de menu + persistencia. localStorage pode falhar (modo privado,
 * storage bloqueado), entao toda leitura/escrita e' protegida.
 */
export class Screens {
  private start = $('screen-start');
  private pause = $('screen-pause');
  private gameover = $('screen-gameover');
  private loading = $('loading');

  save: SaveData;

  onPlay: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onSettingsChange: ((s: Settings) => void) | null = null;
  onFullscreen: (() => void) | null = null;

  constructor() {
    this.save = this.load();
    this.bindButtons();
    this.bindSliders();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        settings: { ...DEFAULTS.settings, ...parsed.settings },
        bestWave: parsed.bestWave ?? 0,
        bestScore: parsed.bestScore ?? 0,
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.save));
    } catch {
      // Sem storage o jogo funciona igual; so' nao guarda recorde.
    }
  }

  private bindButtons(): void {
    $('btn-play').addEventListener('click', () => this.onPlay?.());
    $('btn-resume').addEventListener('click', () => this.onResume?.());
    $('btn-restart').addEventListener('click', () => this.onRestart?.());
    $('btn-restart-pause').addEventListener('click', () => this.onRestart?.());
    $('btn-fullscreen').addEventListener('click', () => this.onFullscreen?.());
  }

  private bindSliders(): void {
    const s = this.save.settings;

    const sens = $<HTMLInputElement>('sens-slider');
    const fov = $<HTMLInputElement>('fov-slider');
    const vol = $<HTMLInputElement>('vol-slider');
    const edge = $<HTMLInputElement>('edge-toggle');

    sens.value = String(s.sensitivity);
    fov.value = String(s.fov);
    vol.value = String(Math.round(s.volume * 100));
    edge.checked = s.edgeTurn;
    this.refreshSliderLabels();

    const emit = (): void => {
      this.save.settings = {
        sensitivity: Number(sens.value),
        fov: Number(fov.value),
        volume: Number(vol.value) / 100,
        edgeTurn: edge.checked,
      };
      this.refreshSliderLabels();
      this.onSettingsChange?.(this.save.settings);
      this.persist();
    };

    for (const el of [sens, fov, vol]) el.addEventListener('input', emit);
    edge.addEventListener('change', emit);
  }

  private refreshSliderLabels(): void {
    const s = this.save.settings;
    $('sens-value').textContent = s.sensitivity.toFixed(2);
    $('fov-value').textContent = String(Math.round(s.fov));
    $('vol-value').textContent = String(Math.round(s.volume * 100));
  }

  hideLoading(): void { this.loading.classList.add('hidden'); }
  showStart(): void { this.setVisible(this.start); }
  showPause(): void { this.setVisible(this.pause); }
  hideAll(): void { this.setVisible(null); }

  showGameOver(stats: RunStats): void {
    $('go-wave').textContent = String(stats.wave);
    $('go-kills').textContent = String(stats.kills);
    $('go-score').textContent = String(stats.score);
    const acc = stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;
    $('go-accuracy').textContent = `${acc}%`;

    const isRecord = stats.score > this.save.bestScore;
    if (isRecord) this.save.bestScore = stats.score;
    if (stats.wave > this.save.bestWave) this.save.bestWave = stats.wave;
    this.persist();

    const best = $('go-best');
    best.classList.toggle('new', isRecord);
    best.textContent = isRecord
      ? 'NOVO RECORDE!'
      : `RECORDE: ONDA ${this.save.bestWave} · ${this.save.bestScore} PTS`;

    this.setVisible(this.gameover);
  }

  private setVisible(target: HTMLElement | null): void {
    for (const el of [this.start, this.pause, this.gameover]) {
      el.classList.toggle('hidden', el !== target);
    }
  }
}
