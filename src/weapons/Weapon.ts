import { clamp } from '../core/math';
import type { Stats } from '../player/Stats';
import type { WeaponDef } from './WeaponDefs';

export type FireResult = 'fired' | 'empty' | 'cooldown' | 'reloading' | 'locked';

/**
 * Estado de UMA arma. Nao sabe nada sobre o mundo — quem faz o raycast e' o
 * CombatSystem. Aqui mora so' municao, cadencia, recarga e dispersao.
 */
export class Weapon {
  readonly def: WeaponDef;

  ammoInMag: number;
  reserve: number;
  unlocked: boolean;

  private cooldown = 0;
  private reloadTimer = 0;
  reloading = false;
  /** Dispersao acumulada pelos tiros recentes (soma-se a` dispersao base). */
  bloom = 0;

  /** `stats` e' a MESMA referencia do jogador: melhoria aplicada vale na hora. */
  constructor(def: WeaponDef, unlocked: boolean, private stats: Stats) {
    this.def = def;
    this.ammoInMag = def.magSize;
    this.reserve = def.startReserve;
    this.unlocked = unlocked;
  }

  get shotInterval(): number { return 60 / (this.def.rpm * this.stats.fireRateMult); }
  get magSize(): number { return Math.round(this.def.magSize * this.stats.magSizeMult); }
  get reloadTime(): number { return this.def.reloadTime * this.stats.reloadMult; }
  get hasInfiniteReserve(): boolean { return this.def.reserveMax < 0; }
  get isMagEmpty(): boolean { return this.ammoInMag <= 0; }
  get canReload(): boolean {
    return !this.reloading
      && this.ammoInMag < this.magSize
      && (this.hasInfiniteReserve || this.reserve > 0);
  }
  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / this.reloadTime : 1;
  }

  update(dt: number): 'reload-finished' | null {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - this.def.spreadRecovery * dt * 6);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.finishReload();
        return 'reload-finished';
      }
    }
    return null;
  }

  tryFire(): FireResult {
    if (!this.unlocked) return 'locked';
    if (this.reloading) return 'reloading';
    if (this.cooldown > 0) return 'cooldown';
    if (this.ammoInMag <= 0) return 'empty';

    this.ammoInMag--;
    this.cooldown = this.shotInterval;
    this.bloom = clamp(this.bloom + this.def.spreadPerShot, 0, this.def.spreadMax);
    return 'fired';
  }

  startReload(): boolean {
    if (!this.canReload) return false;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
    return true;
  }

  cancelReload(): void {
    this.reloading = false;
    this.reloadTimer = 0;
  }

  private finishReload(): void {
    const missing = this.magSize - this.ammoInMag;
    const taken = this.hasInfiniteReserve ? missing : Math.min(missing, this.reserve);
    this.ammoInMag += taken;
    if (!this.hasInfiniteReserve) this.reserve -= taken;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  /** Dispersao efetiva agora, em radianos. */
  currentSpread(ads: number, moving: boolean, airborne: boolean): number {
    const base = this.def.spreadHip + (this.def.spreadAds - this.def.spreadHip) * ads;
    let spread = (base + this.bloom * (1 - ads * 0.55)) * this.stats.spreadMult;
    if (moving) spread += this.def.spreadMoving * (1 - ads * 0.5);
    if (airborne) spread *= 1.8;
    return spread;
  }

  /** Multiplicador de dano pela distancia. */
  damageAt(distance: number): number {
    const d = this.def;
    if (distance <= d.falloffStart) return 1;
    if (distance >= d.falloffEnd) return d.falloffMin;
    const t = (distance - d.falloffStart) / (d.falloffEnd - d.falloffStart);
    return 1 + (d.falloffMin - 1) * t;
  }

  /** Devolve parte do carregador — usado pela melhoria "catador". */
  refillFraction(fraction: number): void {
    if (fraction <= 0) return;
    this.ammoInMag = Math.min(this.magSize, this.ammoInMag + Math.ceil(this.magSize * fraction));
  }

  /** Retorna quanta municao foi realmente aceita. */
  addAmmo(amount: number): number {
    if (this.hasInfiniteReserve) return 0;
    const before = this.reserve;
    this.reserve = Math.min(this.def.reserveMax, this.reserve + amount);
    return this.reserve - before;
  }

  reset(): void {
    this.ammoInMag = this.magSize;
    this.reserve = this.def.startReserve;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.bloom = 0;
  }
}
