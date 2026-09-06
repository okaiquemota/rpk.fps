import { STORAGE_KEY } from '../config';
import { detectRenderer } from '../core/gpu';
import type { Upgrade } from '../player/Stats';

export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  /** Girar a camera ao levar o mouse ate' a borda (so' vale sem pointer lock). */
  edgeTurn: boolean;
  /**
   * Fracao da resolucao nativa em que o jogo e' desenhado (0.5 a 1).
   *
   * E' o ajuste de desempenho com mais efeito por clique: o custo do quadro
   * cresce com a AREA, entao 70% de resolucao e' metade dos pixels. Numa tela
   * de alta densidade, e' a diferenca entre 10 e 40 fps sem tocar no cenario.
   */
  resolution: number;
}

export interface SaveData {
  settings: Settings;
  bestWave: number;
  bestScore: number;
}

const DEFAULTS: SaveData = {
  // Em renderizacao por software o custo e' todo por pixel: metade da resolucao
  // sao 25% dos pixels, e e' a diferenca entre injogavel e jogavel. Quem tem
  // GPU comeca em 100%; quem ja' escolheu um valor mantem o dele.
  settings: {
    sensitivity: 1, fov: 85, volume: 0.7, edgeTurn: true,
    resolution: detectRenderer().software ? 0.5 : 1,
  },
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
  private upgrade = $('screen-upgrade');
  private loading = $('loading');

  save: SaveData;

  onPlay: (() => void) | null = null;
  onPlayRange: (() => void) | null = null;
  onPlayFight: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onSettingsChange: ((s: Settings) => void) | null = null;
  onFullscreen: (() => void) | null = null;
  onUpgradePicked: ((u: Upgrade) => void) | null = null;

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
    $('btn-range').addEventListener('click', () => this.onPlayRange?.());
    $('btn-fight').addEventListener('click', () => this.onPlayFight?.());
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
    const res = $<HTMLInputElement>('res-slider');
    const edge = $<HTMLInputElement>('edge-toggle');

    sens.value = String(s.sensitivity);
    fov.value = String(s.fov);
    vol.value = String(Math.round(s.volume * 100));
    res.value = String(Math.round(s.resolution * 100));
    edge.checked = s.edgeTurn;
    this.refreshSliderLabels();

    const emit = (): void => {
      this.save.settings = {
        sensitivity: Number(sens.value),
        fov: Number(fov.value),
        volume: Number(vol.value) / 100,
        resolution: Number(res.value) / 100,
        edgeTurn: edge.checked,
      };
      this.refreshSliderLabels();
      this.onSettingsChange?.(this.save.settings);
      this.persist();
    };

    for (const el of [sens, fov, vol, res]) el.addEventListener('input', emit);
    edge.addEventListener('change', emit);
  }

  private refreshSliderLabels(): void {
    const s = this.save.settings;
    $('sens-value').textContent = s.sensitivity.toFixed(2);
    $('fov-value').textContent = String(Math.round(s.fov));
    $('vol-value').textContent = String(Math.round(s.volume * 100));
    $('res-value').textContent = `${Math.round(s.resolution * 100)}%`;
  }

  /**
   * Oferta de melhorias entre ondas. Devolve o foco pro teclado: as teclas
   * 1..3 escolhem sem tirar a mao do lugar.
   */
  showUpgrades(wave: number, options: Upgrade[], taken: Map<string, number>): void {
    $('up-wave').textContent = String(wave);

    const box = $('upgrade-cards');
    box.replaceChildren();
    box.style.gridTemplateColumns = `repeat(${Math.max(1, options.length)}, 1fr)`;

    options.forEach((up, i) => {
      const card = document.createElement('button');
      card.className = 'up-card';
      card.type = 'button';

      const stacks = taken.get(up.id) ?? 0;
      const key = document.createElement('div');
      key.className = 'up-key';
      key.textContent = String(i + 1);
      const name = document.createElement('div');
      name.className = 'up-name';
      name.textContent = up.name;
      const desc = document.createElement('div');
      desc.className = 'up-desc';
      desc.textContent = up.description;
      const st = document.createElement('div');
      st.className = 'up-stacks';
      st.textContent = stacks > 0 ? `JA TEM ${stacks} DE ${up.maxStacks}` : `ATE ${up.maxStacks}x`;

      card.append(key, name, desc, st);
      card.addEventListener('click', () => this.onUpgradePicked?.(up));
      box.appendChild(card);
    });

    this.setVisible(this.upgrade);
    (box.firstElementChild as HTMLElement | null)?.focus();
  }

  /** Escolha por teclado (1..3) enquanto a oferta esta' aberta. */
  pickUpgradeByIndex(index: number): boolean {
    const cards = $('upgrade-cards').children;
    const card = cards[index] as HTMLElement | undefined;
    if (!card) return false;
    card.click();
    return true;
  }

  get upgradeVisible(): boolean { return !this.upgrade.classList.contains('hidden'); }

  hideLoading(): void { this.loading.classList.add('hidden'); }
  showStart(): void { this.setVisible(this.start); }
  showPause(): void { this.setVisible(this.pause); }
  hideAll(): void { this.setVisible(null); }

  showGameOver(stats: RunStats, upgrades?: { name: string; count: number }[]): void {
    $('go-wave').textContent = String(stats.wave);
    $('go-kills').textContent = String(stats.kills);
    $('go-score').textContent = String(stats.score);
    const acc = stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;
    $('go-accuracy').textContent = `${acc}%`;

    const isRecord = stats.score > this.save.bestScore;
    if (isRecord) this.save.bestScore = stats.score;
    if (stats.wave > this.save.bestWave) this.save.bestWave = stats.wave;
    this.persist();

    // Mostra o "build" com que a pessoa chegou ate' ali.
    const list = $('go-upgrades');
    list.replaceChildren();
    for (const u of upgrades ?? []) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = u.count > 1 ? `${u.name} x${u.count}` : u.name;
      list.appendChild(chip);
    }

    const best = $('go-best');
    best.classList.toggle('new', isRecord);
    best.textContent = isRecord
      ? 'NOVO RECORDE!'
      : `RECORDE: ONDA ${this.save.bestWave} · ${this.save.bestScore} PTS`;

    this.setVisible(this.gameover);
  }

  private setVisible(target: HTMLElement | null): void {
    for (const el of [this.start, this.pause, this.gameover, this.upgrade]) {
      el.classList.toggle('hidden', el !== target);
    }
  }
}
