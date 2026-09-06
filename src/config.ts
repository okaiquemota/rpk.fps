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
  /**
   * Amplitude do balanco da CAMERA ao andar, em metros.
   *
   * Caiu de 0.045 pra 0.02 junto com o balanco da arma. O olho oscilando e' o
   * que mais atrapalha mirar em movimento: a arma sacode um pouco, mas a
   * camera sacode o ALVO junto. Sobra o suficiente pra sentir o passo.
   */
  bobAmount: 0.02,
  /** Quanto o olho afunda ao aterrissar. Era 0.16 — um mergulho. */
  landingDip: 0.09,
} as const;

export const WORLD = {
  arenaSize: 62, // lado da arena (metros)
  wallHeight: 9,
  // Ar limpo perto, bruma so' no fundo. Comecando em 38 m numa arena de 62, a
  // nevoa pegava o patio INTEIRO: o muro do fundo chegava lavado e o contraste
  // do meio da arena ia junto. Num patio de 60 m em dia claro nao ha' bruma
  // nenhuma pra ver — ela existe aqui so' pra amaciar o encontro do muro com o
  // ceu, e pra isso basta pegar o ultimo terco.
  fogNear: 58,
  fogFar: 210,
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
  /** Teto de inimigos numa onda, tempero incluso. */
  maxPerWave: 32,
  spawnInterval: 0.85,
  healthPerWave: 0.09, // +9% de vida por onda
  speedPerWave: 0.022,
  /**
   * Espera entre matar o ultimo da onda e abrir a escolha de melhoria.
   *
   * Abrindo na hora, a tela cobre o proprio abate: o ultimo tiro, o tombo e o
   * "ONDA LIMPA" acontecem atras do menu. Um respiro deixa a onda terminar em
   * cena antes do jogo pausar.
   */
  upgradeDelay: 1.5,
} as const;

export const FX = {
  maxDecals: 90,
  maxParticles: 700,
  maxSmoke: 260,
  tracerSpeed: 260,
  /** Quanto mais alto, mais rapido o tremor da tela assenta. Era 7. */
  screenShakeDecay: 9.5,
} as const;

/**
 * Modo confronto: partida contra soldados armados, sem ondas.
 *
 * A diferenca de ritmo pra sobrevivencia esta' toda aqui: um efetivo pequeno e
 * constante em vez de horda, e voce VOLTA quando morre — quem termina a partida
 * e' o placar ou o relogio, nao a sua vida.
 */
export const FIREFIGHT = {
  /** Soldados em campo ao mesmo tempo. */
  aliveTarget: 5,
  /** Abates que encerram a partida. */
  killTarget: 25,
  /** Duracao da rodada, em segundos. */
  roundSeconds: 300,
  /** Tempo caido antes de voltar em campo. */
  respawnDelay: 2.4,
} as const;

export const STORAGE_KEY = 'rpk.fps.save.v1';
