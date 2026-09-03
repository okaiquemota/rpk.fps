import { clamp } from '../core/math';
import { PLAYER } from '../config';
import { WEAPON_DEFS, WEAPON_ORDER, type WeaponId } from '../weapons/WeaponDefs';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} nao existe no HTML`);
  return el as T;
};

/**
 * HUD em DOM, nao em canvas. Muito mais simples de estilizar, e o custo e' zero
 * enquanto os valores nao mudam — por isso todo setter aqui compara antes de escrever.
 */
export class HUD {
  private root = $('hud');
  private crosshair = $('crosshair');
  private hitmarker = $('hitmarker');
  private healthValue = $('health-value');
  private healthFill = $('health-fill');
  private armorFill = $('armor-fill');
  private ammoMag = $('ammo-mag');
  private ammoReserve = $('ammo-reserve');
  private weaponName = $('weapon-name');
  private reloadHint = $('reload-hint');
  private waveValue = $('wave-value');
  private enemiesValue = $('enemies-value');
  private scoreValue = $('score-value');
  private killsValue = $('kills-value');
  private comboLabel = $('combo-label');
  private comboValue = $('combo-value');
  private damageVignette = $('damage-vignette');
  private lowHpVignette = $('low-hp-vignette');
  private toast = $('center-toast');
  private killfeed = $('killfeed');
  private wheel = $('weapon-wheel');
  private edgeL = document.querySelector<HTMLElement>('.e-l')!;
  private edgeR = document.querySelector<HTMLElement>('.e-r')!;
  private edgeT = document.querySelector<HTMLElement>('.e-t')!;
  private edgeB = document.querySelector<HTMLElement>('.e-b')!;

  private slots = new Map<WeaponId, HTMLElement>();
  private last = {
    health: -1, armor: -1, mag: -1, reserve: -999, weapon: '' as string,
    wave: -1, enemies: -1, score: -1, kills: -1, combo: -1, reloadable: false, lowHp: false,
  };
  private damageTimer = 0;
  private hitmarkerTimer = 0;

  constructor() {
    for (const id of WEAPON_ORDER) {
      const el = document.createElement('div');
      el.className = 'wslot locked';
      el.textContent = `${WEAPON_DEFS[id].slot}  ${WEAPON_DEFS[id].name}`;
      this.wheel.appendChild(el);
      this.slots.set(id, el);
    }
  }

  show(): void { this.root.classList.remove('hidden'); }
  hide(): void { this.root.classList.add('hidden'); }

  setHealth(health: number, armor: number): void {
    const h = Math.ceil(health);
    if (h !== this.last.health) {
      this.last.health = h;
      this.healthValue.textContent = String(h);
      const pct = clamp(health / PLAYER.maxHealth, 0, 1) * 100;
      this.healthFill.style.width = `${pct}%`;
      this.healthFill.classList.toggle('low', health <= 35);

      const low = health <= 35 && health > 0;
      if (low !== this.last.lowHp) {
        this.last.lowHp = low;
        this.lowHpVignette.style.opacity = low ? '1' : '0';
      }
    }
    const a = Math.ceil(armor);
    if (a !== this.last.armor) {
      this.last.armor = a;
      this.armorFill.style.width = `${clamp(armor / PLAYER.maxArmor, 0, 1) * 100}%`;
    }
  }

  setAmmo(
    mag: number, reserve: number, infinite: boolean,
    weaponName: string, canReload: boolean, magSize: number,
  ): void {
    if (mag !== this.last.mag) {
      this.last.mag = mag;
      this.ammoMag.textContent = String(mag);
      this.ammoMag.classList.toggle('empty', mag === 0);
    }
    const r = infinite ? -1 : reserve;
    if (r !== this.last.reserve) {
      this.last.reserve = r;
      this.ammoReserve.textContent = infinite ? '∞' : String(reserve);
    }
    if (weaponName !== this.last.weapon) {
      this.last.weapon = weaponName;
      this.weaponName.textContent = weaponName;
    }
    const showHint = canReload && mag <= Math.max(1, Math.floor(magSize * 0.25));
    if (showHint !== this.last.reloadable) {
      this.last.reloadable = showHint;
      this.reloadHint.classList.toggle('hidden', !showHint);
    }
  }

  setWave(wave: number, enemiesLeft: number): void {
    if (wave !== this.last.wave) {
      this.last.wave = wave;
      this.waveValue.textContent = String(wave);
    }
    if (enemiesLeft !== this.last.enemies) {
      this.last.enemies = enemiesLeft;
      this.enemiesValue.textContent = String(enemiesLeft);
    }
  }

  setScore(score: number, kills: number, combo: number): void {
    if (score !== this.last.score) {
      this.last.score = score;
      this.scoreValue.textContent = String(score);
    }
    if (kills !== this.last.kills) {
      this.last.kills = kills;
      this.killsValue.textContent = String(kills);
    }
    if (combo !== this.last.combo) {
      this.last.combo = combo;
      this.comboValue.textContent = String(combo);
      this.comboLabel.classList.toggle('hidden', combo < 2);
    }
  }

  setWeaponSlots(unlocked: Set<WeaponId>, active: WeaponId): void {
    for (const [id, el] of this.slots) {
      el.classList.toggle('locked', !unlocked.has(id));
      el.classList.toggle('active', id === active);
    }
  }

  /** `spread` em radianos vira abertura da mira em pixels. */
  setCrosshairSpread(spread: number, ads: number): void {
    const px = clamp(spread * 620, 2, 34);
    this.crosshair.style.setProperty('--spread', `${px}px`);
    this.crosshair.style.opacity = String(1 - ads * 0.75);
  }

  showHitmarker(kill: boolean, headshot: boolean): void {
    this.hitmarker.classList.remove('hit', 'kill');
    void this.hitmarker.offsetWidth; // reinicia a animacao CSS
    this.hitmarker.classList.add(kill || headshot ? 'kill' : 'hit');
    this.hitmarkerTimer = 0.3;
  }

  /** Acende a borda para a qual a camera esta' girando sozinha. */
  setEdgeTurn(x: number, y: number): void {
    this.edgeL.style.opacity = x < 0 ? String(-x) : '0';
    this.edgeR.style.opacity = x > 0 ? String(x) : '0';
    this.edgeT.style.opacity = y < 0 ? String(-y) : '0';
    this.edgeB.style.opacity = y > 0 ? String(y) : '0';
  }

  flashDamage(): void {
    this.damageVignette.classList.add('on');
    this.damageTimer = 0.09;
  }

  addKillfeed(text: string, headshot: boolean): void {
    const el = document.createElement('div');
    el.className = headshot ? 'kf head' : 'kf';
    el.textContent = headshot ? `${text}  ☠` : text;
    this.killfeed.appendChild(el);
    // O CSS ja' faz o fade; so' limpamos o no' depois.
    setTimeout(() => el.remove(), 2700);
    while (this.killfeed.childElementCount > 6) this.killfeed.firstElementChild?.remove();
  }

  showToast(main: string, sub = ''): void {
    this.toast.classList.remove('hidden');
    this.toast.innerHTML = sub ? `${main}<span class="sub">${sub}</span>` : main;
    void this.toast.offsetWidth;
    this.toast.style.animation = 'none';
    void this.toast.offsetWidth;
    this.toast.style.animation = '';
  }

  update(dt: number): void {
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) this.damageVignette.classList.remove('on');
    }
    if (this.hitmarkerTimer > 0) this.hitmarkerTimer -= dt;
  }

  reset(): void {
    this.last.health = this.last.armor = this.last.mag = -1;
    this.last.reserve = -999;
    this.last.wave = this.last.enemies = this.last.score = this.last.kills = this.last.combo = -1;
    this.last.weapon = '';
    this.killfeed.replaceChildren();
    this.toast.classList.add('hidden');
    this.damageVignette.classList.remove('on');
    this.lowHpVignette.style.opacity = '0';
  }
}
