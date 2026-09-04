/**
 * Atributos do jogador que as melhorias mexem.
 *
 * Tudo aqui e' multiplicador ou bonus somado ao valor base — as armas e o
 * jogador continuam definidos em WEAPON_DEFS e PLAYER, e este objeto so'
 * tempera aqueles numeros. Assim uma melhoria nova nao precisa tocar em
 * balanceamento, e o balanceamento nao precisa saber das melhorias.
 */
export interface Stats {
  damageMult: number;
  fireRateMult: number;
  reloadMult: number;
  magSizeMult: number;
  spreadMult: number;
  moveSpeedMult: number;
  maxHealthBonus: number;
  /** Vida recuperada a cada abate. */
  lifestealPerKill: number;
  /** Colete ganho no comeco de cada onda. */
  armorPerWave: number;
  /** Multiplicador extra de dano em acerto na cabeca. */
  headshotMult: number;
  /** Fracao da municao do carregador devolvida a cada abate. */
  ammoOnKill: number;
}

export const BASE_STATS: Stats = {
  damageMult: 1,
  fireRateMult: 1,
  reloadMult: 1,
  magSizeMult: 1,
  spreadMult: 1,
  moveSpeedMult: 1,
  maxHealthBonus: 0,
  lifestealPerKill: 0,
  armorPerWave: 0,
  headshotMult: 1,
  ammoOnKill: 0,
};

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  /** Quantas vezes pode ser escolhida. */
  maxStacks: number;
  apply(stats: Stats): void;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'damage', name: 'MUNICAO PESADA', maxStacks: 5,
    description: '+18% de dano com todas as armas',
    apply: (s) => { s.damageMult *= 1.18; },
  },
  {
    id: 'firerate', name: 'GATILHO LEVE', maxStacks: 4,
    description: '+15% de cadencia de tiro',
    apply: (s) => { s.fireRateMult *= 1.15; },
  },
  {
    id: 'reload', name: 'MAOS RAPIDAS', maxStacks: 3,
    description: 'Recarga 25% mais rapida',
    apply: (s) => { s.reloadMult *= 0.75; },
  },
  {
    id: 'mag', name: 'PENTE ESTENDIDO', maxStacks: 3,
    description: '+40% de balas no carregador',
    apply: (s) => { s.magSizeMult *= 1.4; },
  },
  {
    id: 'accuracy', name: 'CANO RAIADO', maxStacks: 3,
    description: '25% menos dispersao',
    apply: (s) => { s.spreadMult *= 0.75; },
  },
  {
    id: 'speed', name: 'BOTAS LEVES', maxStacks: 3,
    description: '+12% de velocidade de movimento',
    apply: (s) => { s.moveSpeedMult *= 1.12; },
  },
  {
    id: 'health', name: 'COLETE REFORCADO', maxStacks: 4,
    description: '+30 de vida maxima, e cura na hora',
    apply: (s) => { s.maxHealthBonus += 30; },
  },
  {
    id: 'lifesteal', name: 'ADRENALINA', maxStacks: 4,
    description: '+6 de vida a cada abate',
    apply: (s) => { s.lifestealPerKill += 6; },
  },
  {
    id: 'armor', name: 'PLACAS BALISTICAS', maxStacks: 3,
    description: '+35 de colete no comeco de cada onda',
    apply: (s) => { s.armorPerWave += 35; },
  },
  {
    id: 'headshot', name: 'MIRA CIRURGICA', maxStacks: 3,
    description: '+35% de dano em acerto na cabeca',
    apply: (s) => { s.headshotMult *= 1.35; },
  },
  {
    id: 'scavenger', name: 'CATADOR', maxStacks: 3,
    description: 'Cada abate devolve 15% do carregador',
    apply: (s) => { s.ammoOnKill += 0.15; },
  },
];

/** Sorteia `count` melhorias ainda disponiveis, sem repetir na mesma oferta. */
export function rollUpgrades(taken: Map<string, number>, count: number): Upgrade[] {
  const pool = UPGRADES.filter((u) => (taken.get(u.id) ?? 0) < u.maxStacks);
  const picked: Upgrade[] = [];
  while (picked.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool[i]!);
    pool.splice(i, 1);
  }
  return picked;
}
