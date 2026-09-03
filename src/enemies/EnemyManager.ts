import * as THREE from 'three';
import { WAVES } from '../config';
import { pick, randRange } from '../core/math';
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
}

const _v = new THREE.Vector3();

export class EnemyManager {
  readonly group = new THREE.Group();
  readonly enemies: Enemy[] = [];

  waveIndex = 0;
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

  /** Total de inimigos restantes na onda (vivos + por nascer). */
  get remainingInWave(): number { return this.aliveCount + this.pendingSpawns.length; }

  // ------------------------------------------------------------------

  private composeWave(wave: number): EnemyKind[] {
    const total = Math.round(WAVES.baseEnemies + (wave - 1) * WAVES.enemiesPerWave);
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
    for (let i = 0; i < total; i++) list.push(pick(pool));

    // Toda onda multipla de 5 ganha um brutamontes garantido.
    if (wave >= 5 && wave % 5 === 0) list.push('brute');
    return list;
  }

  startNextWave(): void {
    this.waveIndex++;
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

    const healthScale = 1 + (this.waveIndex - 1) * WAVES.healthPerWave;
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
    this.waveActive = false;
    this.breakTimer = WAVES.firstWaveDelay;
    this.spawnTimer = 0;
  }
}
