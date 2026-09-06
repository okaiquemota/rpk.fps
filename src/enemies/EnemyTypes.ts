export type EnemyKind = 'grunt' | 'runner' | 'shooter' | 'brute' | 'soldier';

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
  /**
   * Cor do equipamento — capacete, colete e bracos.
   *
   * Sempre mais ESCURA que `color`. Capacete claro le' como cabeca de boneco;
   * escuro le' como capacete, e de quebra separa a silhueta do tronco.
   */
  gearColor: number;
}

/**
 * Paleta militar, nao de brinquedo.
 *
 * A versao anterior era rosa, laranja, azul e ROXO com olho brilhando: numa
 * arena de concreto, aquilo lia como boneco de Lego. Aqui e' verde-oliva, areia,
 * ardosia e carvao.
 *
 * O que NAO pode se perder ao dessaturar: reconhecer o tipo de longe, que e'
 * informacao de jogo. Sem a saturacao pra separar, quem separa e' o VALOR —
 * corredor claro, capanga medio, atirador escuro-frio, brutamontes quase preto —
 * junto com o tamanho de cada um.
 */
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: {
    kind: 'grunt', name: 'CAPANGA',
    health: 60, speed: 3.4, attackRange: 1.9, attackCooldown: 1.15, windup: 0.35,
    damage: 12, radius: 0.42, height: 1.75, score: 100,
    color: 0x4e5340, gearColor: 0x2f3229, eyeColor: 0xc9503a, ranged: false, projectileSpeed: 0,
    dropChance: 0.16, minWave: 1, weight: 10,
  },
  runner: {
    kind: 'runner', name: 'CORREDOR',
    health: 34, speed: 6.2, attackRange: 1.7, attackCooldown: 0.85, windup: 0.22,
    damage: 8, radius: 0.34, height: 1.5, score: 130,
    color: 0x87764f, gearColor: 0x4a3f2c, eyeColor: 0xc98a3a, ranged: false, projectileSpeed: 0,
    dropChance: 0.1, minWave: 2, weight: 8,
  },
  shooter: {
    kind: 'shooter', name: 'ATIRADOR',
    health: 48, speed: 2.5, attackRange: 15, attackCooldown: 2.1, windup: 0.6,
    damage: 11, radius: 0.4, height: 1.7, score: 180,
    color: 0x475363, gearColor: 0x2b323b, eyeColor: 0x6fa8c8, ranged: true, projectileSpeed: 19,
    dropChance: 0.24, minWave: 3, weight: 7,
  },
  brute: {
    kind: 'brute', name: 'BRUTAMONTES',
    health: 260, speed: 2.1, attackRange: 2.5, attackCooldown: 1.7, windup: 0.55,
    damage: 30, radius: 0.68, height: 2.5, score: 400,
    color: 0x3a3733, gearColor: 0x201e1c, eyeColor: 0xb8452f, ranged: false, projectileSpeed: 0,
    dropChance: 0.6, minWave: 5, weight: 4,
  },
  /**
   * Inimigo do modo CONFRONTO: nao corre pra cima, atira de longe.
   *
   * Nao entra no sorteio das ondas (`weight: 0`) — la' o jogo e' de horda, e
   * uma horda que atira de 22 m nao da' pra jogar. Aqui ele e' o unico tipo.
   */
  soldier: {
    kind: 'soldier', name: 'SOLDADO',
    health: 55, speed: 3.6, attackRange: 22, attackCooldown: 1.05, windup: 0.34,
    damage: 9, radius: 0.4, height: 1.78, score: 150,
    color: 0x555b46, gearColor: 0x2b2e26, eyeColor: 0xc9503a, ranged: true, projectileSpeed: 27,
    dropChance: 0.2, minWave: 99, weight: 0,
  },
};
