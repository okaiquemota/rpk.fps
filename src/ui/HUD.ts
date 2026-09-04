import { clamp } from '../core/math';
import { PLAYER } from '../config';
import { WEAPON_DEFS, WEAPON_ORDER, type WeaponId } from '../weapons/WeaponDefs';
import { weaponIcon } from './weaponIcons';

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
  private armorValue = $('armor-value');
  private ammoMag = $('ammo-mag');
  private ammoReserve = $('ammo-reserve');
  private weaponName = $('weapon-name');
  private reloadHint = $('reload-hint');
  private waveValue = $('wave-value');
  private waveMod = $('wave-mod');
  private weaponIconEl = $<HTMLImageElement>('weapon-icon');
  private killBanner = $('kill-banner');
  private scoreboard = $('scoreboard');
  private waveLine = $('wave-line');
  private scoreLeft = $('score-left');
  private scoreRight = $('score-right');
  private roundTimer = $('round-timer');
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
  private hitDirs: { el: HTMLElement; life: number }[] = [];

  private slots = new Map<WeaponId, HTMLElement>();
  private last = {
    health: -1, armor: -1, mag: -1, reserve: -999, weapon: '' as string,
    wave: -1, enemies: -1, score: -1, kills: -1, combo: -1, reloadable: false, lowHp: false,
    modifier: '' as string,
    weaponId: '' as string,
  };
  private damageTimer = 0;
  private hitmarkerTimer = 0;

  constructor() {
    // Setas de "levei dano daquele lado", giradas em torno da mira.
    const dirRoot = document.getElementById('hit-dirs');
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('div');
      el.className = 'hit-dir';
      el.style.opacity = '0';
      dirRoot?.appendChild(el);
      this.hitDirs.push({ el, life: 0 });
    }

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

  setHealth(health: number, armor: number, maxHealth: number): void {
    const h = Math.ceil(health);
    if (h !== this.last.health) {
      this.last.health = h;
      this.healthValue.textContent = String(h);
      const pct = clamp(health / maxHealth, 0, 1) * 100;
      this.healthFill.style.width = `${pct}%`;
      const low = health <= maxHealth * 0.35 && health > 0;
      this.healthFill.classList.toggle('low', low);

      if (low !== this.last.lowHp) {
        this.last.lowHp = low;
        this.lowHpVignette.style.opacity = low ? '1' : '0';
      }
    }
    const a = Math.ceil(armor);
    if (a !== this.last.armor) {
      this.last.armor = a;
      this.armorFill.style.width = `${clamp(armor / PLAYER.maxArmor, 0, 1) * 100}%`;
      this.armorValue.textContent = String(a);
    }
  }

  setAmmo(
    mag: number, reserve: number, infinite: boolean,
    weaponName: string, canReload: boolean, magSize: number, weaponId: WeaponId,
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
    if (weaponId !== this.last.weaponId) {
      this.last.weaponId = weaponId;
      this.weaponIconEl.src = weaponIcon(weaponId);
    }
    const showHint = canReload && mag <= Math.max(1, Math.floor(magSize * 0.25));
    if (showHint !== this.last.reloadable) {
      this.last.reloadable = showHint;
      this.reloadHint.classList.toggle('hidden', !showHint);
    }
  }

  setWave(wave: number, enemiesLeft: number, modifier: string): void {
    if (wave !== this.last.wave) {
      this.last.wave = wave;
      this.waveValue.textContent = String(wave);
    }
    if (enemiesLeft !== this.last.enemies) {
      this.last.enemies = enemiesLeft;
      this.enemiesValue.textContent = String(enemiesLeft);
    }
    if (modifier !== this.last.modifier) {
      this.last.modifier = modifier;
      this.waveMod.textContent = modifier;
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

  /**
   * Aponta de onde veio o dano.
   * `angle` em radianos no espaco do jogador: 0 e' de frente, +PI/2 pela direita.
   */
  showHitDirection(angle: number): void {
    // Reaproveita a seta mais gasta quando todas estao em uso.
    let slot = this.hitDirs.find((d) => d.life <= 0);
    if (!slot) slot = this.hitDirs.reduce((a, b) => (a.life <= b.life ? a : b));
    slot.life = 1.5;
    slot.el.style.transform = `rotate(${angle}rad)`;
    slot.el.style.opacity = '1';
  }

  flashDamage(): void {
    this.damageVignette.classList.add('on');
    this.damageTimer = 0.09;
  }

  addKillfeed(victim: string, headshot: boolean, weapon: WeaponId): void {
    const el = document.createElement('div');
    el.className = headshot ? 'kf head' : 'kf';

    const icon = document.createElement('img');
    icon.src = weaponIcon(weapon);
    icon.alt = '';
    const name = document.createElement('span');
    name.className = 'victim';
    name.textContent = headshot ? `${victim} ☠` : victim;
    el.append(icon, name);

    this.killfeed.appendChild(el);
    // O CSS ja' faz o fade; so' limpamos o no' depois.
    setTimeout(() => el.remove(), 2700);
    while (this.killfeed.childElementCount > 6) this.killfeed.firstElementChild?.remove();
  }

  /** Aviso central de abate, no estilo "voce eliminou X". */
  showKillBanner(victim: string, headshot: boolean): void {
    this.killBanner.replaceChildren();

    const verb = document.createElement('span');
    verb.className = 'verb';
    verb.textContent = 'ELIMINOU';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = victim;
    this.killBanner.append(verb, who);

    if (headshot) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'HEADSHOT';
      this.killBanner.appendChild(tag);
    }

    this.killBanner.classList.remove('on');
    void this.killBanner.offsetWidth; // reinicia a animacao
    this.killBanner.classList.add('on');
  }

  /**
   * Placar de equipes no topo. Passar `null` esconde o placar e mostra a linha
   * da onda — os dois modos usam o mesmo espaco.
   */
  setTeamScore(left: number | null, right = 0, timer = ''): void {
    const teamMode = left !== null;
    this.scoreboard.classList.toggle('hidden', !teamMode);
    this.waveLine.classList.toggle('hidden', teamMode);
    if (!teamMode) return;
    this.scoreLeft.textContent = String(left);
    this.scoreRight.textContent = String(right);
    this.roundTimer.textContent = timer;
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
    for (const d of this.hitDirs) {
      if (d.life <= 0) continue;
      d.life -= dt;
      // Fica cheia um instante e some devagar: da' tempo de ler a direcao.
      d.el.style.opacity = String(clamp(d.life / 0.9, 0, 1));
      if (d.life <= 0) d.el.style.opacity = '0';
    }

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
    this.last.modifier = '';
    this.waveMod.textContent = '';
    for (const d of this.hitDirs) { d.life = 0; d.el.style.opacity = '0'; }
    this.killfeed.replaceChildren();
    this.killBanner.classList.remove('on');
    this.toast.classList.add('hidden');
    this.damageVignette.classList.remove('on');
    this.lowHpVignette.style.opacity = '0';
  }
}
