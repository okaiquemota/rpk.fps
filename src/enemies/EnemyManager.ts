import * as THREE from 'three';
import { WAVES } from '../config';
import { clamp, pick, randRange } from '../core/math';
import type { Level } from '../world/Level';
import { Enemy } from './Enemy';
import { ENEMY_DEFS, type EnemyKind } from './EnemyTypes';
import type { ProjectileSystem } from './Projectile';

export interface WaveState {
  index: number;
  /** Quantos ainda faltam nascer nesta onda. */
  pending: number;
  alive: number;
  inProgress: boolean;
  breakRemaining: number;
}

export interface EnemyManagerEvents {
  onMeleeAttack(damage: number, from: THREE.Vector3): void;
  onEnemyKilled(enemy: Enemy): void;
  onWaveStart(index: number): void;
  onWaveClear(index: number): void;
  onEnemySpawn(enemy: Enemy): void;
  onEnemyStep(enemy: Enemy): void;
  onEnemyShoot(enemy: Enemy): void;
}

/**
 * Temperos de onda: mudam a composicao sem mexer no balanceamento base.
 * Uma onda de trinta corredores fracos joga muito diferente de uma com tres
 * brutamontes, e as duas saem da mesma tabela de inimigos.
 */
export type WaveModifier = 'normal' | 'horda' | 'elite' | 'cerco';

interface ModifierSpec {
  label: string;
  countMult: number;
  healthMult: number;
  scoreMult: number;
  /** Se definido, a onda inteira e' desse tipo. */
  forceKind?: EnemyKind;
  /** Fracao da onda trocada por atiradores. */
  shooterShare?: number;
  minWave: number;
}

const MODIFIERS: Record<WaveModifier, ModifierSpec> = {
  normal: { label: '', countMult: 1, healthMult: 1, scoreMult: 1, minWave: 1 },
  horda: {
    label: 'HORDA', countMult: 1.9, healthMult: 0.55, scoreMult: 0.8,
    forceKind: 'runner', minWave: 4,
  },
  elite: {
    label: 'ELITE', countMult: 0.55, healthMult: 2.1, scoreMult: 1.8, minWave: 6,
  },
  cerco: {
    label: 'CERCO', countMult: 0.85, healthMult: 1, scoreMult: 1.3,
    shooterShare: 0.6, minWave: 5,
  },
};

const _v = new THREE.Vector3();

export class EnemyManager {
  readonly group = new THREE.Group();
  readonly enemies: Enemy[] = [];

  waveIndex = 0;
  modifier: WaveModifier = 'normal';
  private pendingSpawns: EnemyKind[] = [];
  private spawnTimer = 0;
  private breakTimer: number = WAVES.firstWaveDelay;
  private waveActive = false;

  constructor(
    private level: Level,
    private projectiles: ProjectileSystem,
    private events: EnemyManagerEvents,
  ) {}

  get aliveCount(): number {
    return this.enemies.reduce((n, e) => n + (e.isAlive ? 1 : 0), 0);
  }

  get state(): WaveState {
    return {
      index: this.waveIndex,
      pending: this.pendingSpawns.length,
      alive: this.aliveCount,
      inProgress: this.waveActive,
      breakRemaining: this.breakTimer,
    };
  }

  /** Rotulo do tempero da onda atual, vazio quando e' uma onda comum. */
  get modifierLabel(): string { return MODIFIERS[this.modifier].label; }
  get modifierScoreMult(): number { return MODIFIERS[this.modifier].scoreMult; }

  /** Total de inimigos restantes na onda (vivos + por nascer). */
  get remainingInWave(): number { return this.aliveCount + this.pendingSpawns.length; }

  // ------------------------------------------------------------------

  /** Sorteia o tempero desta onda. Onda "normal" continua sendo a mais comum. */
  private rollModifier(wave: number): WaveModifier {
    const candidates = (Object.keys(MODIFIERS) as WaveModifier[])
      .filter((m) => m !== 'normal' && wave >= MODIFIERS[m].minWave);
    if (candidates.length === 0) return 'normal';
    // Uma onda especial a cada tres, em media.
    if (Math.random() > 0.34) return 'normal';
    return pick(candidates);
  }

  private composeWave(wave: number): EnemyKind[] {
    const mod = MODIFIERS[this.modifier];
    // O teto existe pra onda nao virar espera: com `maxAlive` limitando quantos
    // ficam vivos ao mesmo tempo, uma lista gigante so' alonga o intervalo.
    const total = clamp(
      Math.round((WAVES.baseEnemies + (wave - 1) * WAVES.enemiesPerWave) * mod.countMult),
      2, WAVES.maxPerWave,
    );
    const available = (Object.keys(ENEMY_DEFS) as EnemyKind[])
      .filter((k) => wave >= ENEMY_DEFS[k].minWave);

    // Sorteio ponderado — tipos novos aparecem mais assim que desbloqueiam.
    const pool: EnemyKind[] = [];
    for (const kind of available) {
      const def = ENEMY_DEFS[kind];
      const recencyBonus = wave - def.minWave < 2 ? 6 : 0;
      const weight = def.weight + recencyBonus;
      for (let i = 0; i < weight; i++) pool.push(kind);
    }

    const list: EnemyKind[] = [];
    // Teto de brutamontes: o sorteio ponderado sozinho ja' produziu ondas com
    // metade do time de tanques, o que vira uma parede em vez de uma onda.
    const bruteCap = Math.max(1, Math.floor(total * 0.18));
    let brutes = 0;

    for (let i = 0; i < total; i++) {
      if (mod.forceKind) { list.push(mod.forceKind); continue; }
      if (mod.shooterShare && Math.random() < mod.shooterShare && wave >= ENEMY_DEFS.shooter.minWave) {
        list.push('shooter');
        continue;
      }
      let kind = pick(pool);
      if (kind === 'brute') {
        if (brutes >= bruteCap) kind = pick(pool.filter((k) => k !== 'brute'));
        else brutes++;
      }
      list.push(kind);
    }

    // Toda onda multipla de 5 ganha um brutamontes garantido.
    if (wave >= 5 && wave % 5 === 0 && !mod.forceKind) list.push('brute');
    return list;
  }

  startNextWave(): void {
    this.waveIndex++;
    this.modifier = this.rollModifier(this.waveIndex);
    this.pendingSpawns = this.composeWave(this.waveIndex);
    this.spawnTimer = 0;
    this.waveActive = true;
    this.events.onWaveStart(this.waveIndex);
  }

  private spawnOne(kind: EnemyKind, playerPos: THREE.Vector3): void {
    // Nasce longe do jogador — nada de brotar nas costas dele.
    const candidates = this.level.spawnPoints.filter(
      (p) => p.distanceToSquared(playerPos) > 18 * 18,
    );
    const source = candidates.length > 0 ? candidates : this.level.spawnPoints;
    const spot = pick(source);

    const healthScale = (1 + (this.waveIndex - 1) * WAVES.healthPerWave)
      * MODIFIERS[this.modifier].healthMult;
    const speedScale = Math.min(1.45, 1 + (this.waveIndex - 1) * WAVES.speedPerWave);

    const pos = new THREE.Vector3(
      spot.x + randRange(-1.5, 1.5), 0.05, spot.z + randRange(-1.5, 1.5),
    );
    if (!this.level.isFreeSpot(pos.x, pos.z, ENEMY_DEFS[kind].radius + 0.2)) pos.copy(spot);

    const enemy = new Enemy(kind, pos, healthScale, speedScale);
    this.enemies.push(enemy);
    this.group.add(enemy.group);
    this.events.onEnemySpawn(enemy);
  }

  update(dt: number, playerPosition: THREE.Vector3, playerAlive: boolean): void {
    // ---- ritmo das ondas ----
    if (!this.waveActive) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0 && playerAlive) this.startNextWave();
    } else {
      if (this.pendingSpawns.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.aliveCount < WAVES.maxAlive) {
          this.spawnOne(this.pendingSpawns.pop()!, playerPosition);
          this.spawnTimer = WAVES.spawnInterval;
        }
      } else if (this.aliveCount === 0) {
        this.waveActive = false;
        this.breakTimer = WAVES.breakBetweenWaves;
        this.events.onWaveClear(this.waveIndex);
      }
    }

    // ---- inimigos ----
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      enemy.update(dt, playerPosition, this.level, this.enemies);

      if (enemy.state === 'dead') {
        this.group.remove(enemy.group);
        enemy.dispose();
        this.enemies.splice(i, 1);
        continue;
      }

      if (enemy.pendingStep) {
        enemy.pendingStep = false;
        this.events.onEnemyStep(enemy);
      }

      if (enemy.pendingAttack) {
        enemy.pendingAttack = false;
        if (playerAlive) this.resolveAttack(enemy, playerPosition);
      }
    }
  }

  private resolveAttack(enemy: Enemy, playerPosition: THREE.Vector3): void {
    if (enemy.def.ranged) {
      const from = enemy.muzzlePosition();
      _v.set(playerPosition.x, playerPosition.y + 1.2, playerPosition.z).sub(from).normalize();
      // Mira imperfeita de proposito: da' pra fugir andando de lado.
      _v.x += randRange(-0.05, 0.05);
      _v.y += randRange(-0.03, 0.03);
      _v.z += randRange(-0.05, 0.05);
      this.projectiles.spawn(from, _v, enemy.def.projectileSpeed, enemy.def.damage);
      this.events.onEnemyShoot(enemy);
    } else {
      this.events.onMeleeAttack(enemy.def.damage, enemy.center());
    }
  }

  killEnemy(enemy: Enemy): void {
    this.events.onEnemyKilled(enemy);
  }

  /** Inimigos que podem levar tiro (ignora os que estao nascendo/morrendo). */
  targetables(): Enemy[] {
    return this.enemies.filter((e) => e.isTargetable);
  }

  reset(): void {
    for (const e of this.enemies) {
      this.group.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    this.pendingSpawns.length = 0;
    this.waveIndex = 0;
    this.modifier = 'normal';
    this.waveActive = false;
    this.breakTimer = WAVES.firstWaveDelay;
    this.spawnTimer = 0;
  }
}
