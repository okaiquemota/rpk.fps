export type EnemyKind = 'grunt' | 'runner' | 'shooter' | 'brute';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  health: number;
  speed: number;
  /** Distancia em que para de avancar e comeca a atacar. */
  attackRange: number;
  attackCooldown: number;
  /** Tempo entre o inicio do ataque e o dano sair (janela pra desviar). */
  windup: number;
  damage: number;
  radius: number;
  height: number;
  score: number;
  color: number;
  eyeColor: number;
  ranged: boolean;
  projectileSpeed: number;
  /** Chance de dropar item ao morrer. */
  dropChance: number;
  /** A partir de que onda esse tipo aparece. */
  minWave: number;
  /** Peso relativo no sorteio da onda. */
  weight: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: {
    kind: 'grunt', name: 'CAPANGA',
    health: 60, speed: 3.4, attackRange: 1.9, attackCooldown: 1.15, windup: 0.35,
    damage: 12, radius: 0.42, height: 1.75, score: 100,
    color: 0x8f3b3b, eyeColor: 0xff4d3d, ranged: false, projectileSpeed: 0,
    dropChance: 0.16, minWave: 1, weight: 10,
  },
  runner: {
    kind: 'runner', name: 'CORREDOR',
    health: 34, speed: 6.2, attackRange: 1.7, attackCooldown: 0.85, windup: 0.22,
    damage: 8, radius: 0.34, height: 1.5, score: 130,
    color: 0xb0632a, eyeColor: 0xffc23d, ranged: false, projectileSpeed: 0,
    dropChance: 0.1, minWave: 2, weight: 8,
  },
  shooter: {
    kind: 'shooter', name: 'ATIRADOR',
    health: 48, speed: 2.5, attackRange: 15, attackCooldown: 2.1, windup: 0.6,
    damage: 11, radius: 0.4, height: 1.7, score: 180,
    color: 0x4a5f8f, eyeColor: 0x62d0ff, ranged: true, projectileSpeed: 19,
    dropChance: 0.24, minWave: 3, weight: 7,
  },
  brute: {
    kind: 'brute', name: 'BRUTAMONTES',
    health: 260, speed: 2.1, attackRange: 2.5, attackCooldown: 1.7, windup: 0.55,
    damage: 30, radius: 0.68, height: 2.5, score: 400,
    color: 0x5c3f7a, eyeColor: 0xd07dff, ranged: false, projectileSpeed: 0,
    dropChance: 0.6, minWave: 5, weight: 4,
  },
};
