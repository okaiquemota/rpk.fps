/**
 * Todos os numeros que valem a pena mexer ficam aqui.
 * Ajustar "feel" de FPS e' 90% tuning: mude aqui, nao no meio da logica.
 */

export const PLAYER = {
  radius: 0.34,
  heightStand: 1.75,
  heightCrouch: 1.05,
  eyeOffset: 0.14, // quanto o olho fica abaixo do topo da capsula
  crouchLerp: 12, // velocidade da transicao de agachar

  speedWalk: 5.2,
  speedSprint: 8.4,
  speedCrouch: 2.6,
  speedAir: 1.6, // controle no ar (aceleracao, nao velocidade maxima)

  accelGround: 60,
  accelAir: 14,
  frictionGround: 11,

  jumpVelocity: 6.6,
  gravity: 22,
  maxFallSpeed: 45,
  coyoteTime: 0.12, // ainda da' pra pular logo apos sair da borda
  jumpBuffer: 0.14, // pulo bufferizado antes de tocar o chao

  maxHealth: 100,
  maxArmor: 100,
  armorAbsorb: 0.5, // fracao do dano absorvida pelo colete
  regenDelay: 6, // segundos sem tomar dano ate' comecar a regenerar
  regenRate: 8, // hp por segundo
  regenCap: 50, // regenera no maximo ate' esse valor

  stepHeight: 0.45, // altura de degrau que sobe sem pular
} as const;

export const CAMERA = {
  fov: 85,
  near: 0.05,
  far: 300,
  adsFovScale: 0.72, // fov quando mira
  adsTime: 0.14,
  pitchLimit: Math.PI / 2 - 0.02,
  bobFrequency: 10,
  bobAmount: 0.045,
  landingDip: 0.16,
} as const;

export const WORLD = {
  arenaSize: 62, // lado da arena (metros)
  wallHeight: 9,
  fogNear: 38,
  fogFar: 165,
  gravityProjectile: 0,
} as const;

export const COMBAT = {
  headshotMultiplier: 2.4,
  headHeightFraction: 0.78, // acima disso do corpo do inimigo conta como cabeca
  maxRange: 220,
  hitmarkerTime: 0.26,
} as const;

export const WAVES = {
  firstWaveDelay: 3,
  breakBetweenWaves: 6,
  baseEnemies: 4,
  enemiesPerWave: 1.7,
  maxAlive: 16,
  spawnInterval: 0.85,
  healthPerWave: 0.09, // +9% de vida por onda
  speedPerWave: 0.022,
} as const;

export const FX = {
  maxDecals: 90,
  maxParticles: 700,
  maxSmoke: 260,
  tracerSpeed: 260,
  screenShakeDecay: 7,
} as const;

export const STORAGE_KEY = 'rpk.fps.save.v1';
