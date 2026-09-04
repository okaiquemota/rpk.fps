export type WeaponId = 'pistol' | 'deagle' | 'smg' | 'rifle' | 'shotgun' | 'sniper';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: number;

  damage: number;
  pellets: number;
  /** Tiros por minuto. */
  rpm: number;
  automatic: boolean;

  magSize: number;
  /** Reserva maxima. -1 = municao infinita (a pistola nunca deixa voce na mao). */
  reserveMax: number;
  startReserve: number;
  reloadTime: number;

  /** Dispersao em radianos. */
  spreadHip: number;
  spreadAds: number;
  spreadMoving: number;
  /** Quanto cada tiro abre a mira e quao rapido ela fecha. */
  spreadPerShot: number;
  spreadMax: number;
  spreadRecovery: number;

  /** Subida por tiro, em radianos, ja' com a rajada quente. */
  recoilPitch: number;
  /** Amplitude da serpentina lateral. */
  recoilYaw: number;
  /** Tiros ate' a subida saturar: quanto menor, mais violento o comeco. */
  recoilRamp: number;
  /** Avanco da fase lateral por tiro. Define o desenho do rastro. */
  recoilSway: number;
  /** Velocidade com que a mira volta ao lugar depois da rajada. */
  recoilRecovery: number;
  /** Tempo parado ate' a rajada reiniciar do primeiro tiro. */
  burstReset: number;
  kickback: number;

  range: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMin: number;

  adsZoom: number;
  adsTime: number;
  /** Arma de luneta: ao mirar, a tela vira mira telescopica e a arma some. */
  scoped: boolean;
  /** Onda em que ela aparece na arena. 0 = ja' comeca com voce. */
  unlockWave: number;

  /** Aparencia do viewmodel (procedural). */
  bodyColor: number;
  bodySize: [number, number, number];
  barrelLength: number;
  barrelRadius: number;
  muzzleScale: number;
  shakeAmount: number;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'PISTOLA', slot: 1,
    damage: 26, pellets: 1, rpm: 380, automatic: false,
    magSize: 14, reserveMax: -1, startReserve: -1, reloadTime: 1.15,
    spreadHip: 0.014, spreadAds: 0.003, spreadMoving: 0.02,
    spreadPerShot: 0.009, spreadMax: 0.07, spreadRecovery: 0.09,
    recoilPitch: 0.011, recoilYaw: 0.02, recoilRamp: 2.0, recoilSway: 0.9, recoilRecovery: 9.0, burstReset: 0.35,
    kickback: 0.055,
    range: 90, falloffStart: 28, falloffEnd: 70, falloffMin: 0.5,
    adsZoom: 0.8, adsTime: 0.13, scoped: false, unlockWave: 0,
    bodyColor: 0x23272e, bodySize: [0.07, 0.135, 0.24], barrelLength: 0.13, barrelRadius: 0.02,
    muzzleScale: 1, shakeAmount: 0.5,
  },
  rifle: {
    id: 'rifle', name: 'FUZIL', slot: 4,
    damage: 21, pellets: 1, rpm: 720, automatic: true,
    magSize: 30, reserveMax: 240, startReserve: 120, reloadTime: 1.75,
    spreadHip: 0.022, spreadAds: 0.004, spreadMoving: 0.03,
    spreadPerShot: 0.008, spreadMax: 0.1, spreadRecovery: 0.075,
    recoilPitch: 0.007, recoilYaw: 0.026, recoilRamp: 5.0, recoilSway: 0.44, recoilRecovery: 6.5, burstReset: 0.3,
    kickback: 0.04,
    range: 140, falloffStart: 45, falloffEnd: 110, falloffMin: 0.6,
    adsZoom: 0.62, adsTime: 0.16, scoped: false, unlockWave: 2,
    bodyColor: 0x2e3329, bodySize: [0.075, 0.125, 0.44], barrelLength: 0.32, barrelRadius: 0.018,
    muzzleScale: 0.85, shakeAmount: 0.35,
  },
  deagle: {
    id: 'deagle', name: 'DESERT EAGLE', slot: 2,
    damage: 58, pellets: 1, rpm: 190, automatic: false,
    magSize: 7, reserveMax: 56, startReserve: 28, reloadTime: 1.5,
    spreadHip: 0.02, spreadAds: 0.004, spreadMoving: 0.035,
    spreadPerShot: 0.03, spreadMax: 0.13, spreadRecovery: 0.11,
    recoilPitch: 0.028, recoilYaw: 0.03, recoilRamp: 1.4, recoilSway: 1.3, recoilRecovery: 7.5, burstReset: 0.4,
    kickback: 0.12,
    range: 100, falloffStart: 30, falloffEnd: 75, falloffMin: 0.6,
    adsZoom: 0.78, adsTime: 0.16, scoped: false, unlockWave: 6,
    bodyColor: 0x8a8f96, bodySize: [0.085, 0.16, 0.3], barrelLength: 0.16, barrelRadius: 0.026,
    muzzleScale: 1.35, shakeAmount: 0.95,
  },
  smg: {
    id: 'smg', name: 'SUBMETRALHADORA', slot: 3,
    damage: 15, pellets: 1, rpm: 950, automatic: true,
    magSize: 35, reserveMax: 280, startReserve: 140, reloadTime: 1.5,
    spreadHip: 0.026, spreadAds: 0.011, spreadMoving: 0.022,
    spreadPerShot: 0.007, spreadMax: 0.11, spreadRecovery: 0.08,
    recoilPitch: 0.0055, recoilYaw: 0.022, recoilRamp: 7.0, recoilSway: 0.62, recoilRecovery: 7.0, burstReset: 0.3,
    kickback: 0.03,
    range: 70, falloffStart: 18, falloffEnd: 55, falloffMin: 0.45,
    adsZoom: 0.75, adsTime: 0.12, scoped: false, unlockWave: 3,
    bodyColor: 0x2a2d33, bodySize: [0.07, 0.12, 0.3], barrelLength: 0.14, barrelRadius: 0.016,
    muzzleScale: 0.7, shakeAmount: 0.22,
  },
  sniper: {
    id: 'sniper', name: 'SNIPER', slot: 6,
    damage: 135, pellets: 1, rpm: 42, automatic: false,
    magSize: 5, reserveMax: 40, startReserve: 20, reloadTime: 2.8,
    // Sem mirar ela e' quase inutil de proposito: e' a troca por um tiro que
    // mata qualquer coisa de qualquer distancia.
    spreadHip: 0.11, spreadAds: 0.0005, spreadMoving: 0.13,
    spreadPerShot: 0.05, spreadMax: 0.22, spreadRecovery: 0.2,
    recoilPitch: 0.055, recoilYaw: 0.02, recoilRamp: 1.0, recoilSway: 2.1, recoilRecovery: 4.5, burstReset: 0.8,
    kickback: 0.2,
    range: 220, falloffStart: 200, falloffEnd: 220, falloffMin: 0.95,
    adsZoom: 0.3, adsTime: 0.3, scoped: true, unlockWave: 8,
    bodyColor: 0x3b4238, bodySize: [0.08, 0.13, 0.62], barrelLength: 0.46, barrelRadius: 0.019,
    muzzleScale: 1.5, shakeAmount: 1.3,
  },
  shotgun: {
    id: 'shotgun', name: 'ESCOPETA', slot: 5,
    damage: 14, pellets: 9, rpm: 78, automatic: false,
    magSize: 6, reserveMax: 60, startReserve: 24, reloadTime: 2.2,
    spreadHip: 0.075, spreadAds: 0.045, spreadMoving: 0.09,
    spreadPerShot: 0.01, spreadMax: 0.12, spreadRecovery: 0.12,
    recoilPitch: 0.035, recoilYaw: 0.03, recoilRamp: 1.2, recoilSway: 1.6, recoilRecovery: 5.5, burstReset: 0.5,
    kickback: 0.16,
    range: 45, falloffStart: 8, falloffEnd: 26, falloffMin: 0.22,
    adsZoom: 0.86, adsTime: 0.2, scoped: false, unlockWave: 4,
    bodyColor: 0x3a2a1c, bodySize: [0.085, 0.14, 0.48], barrelLength: 0.44, barrelRadius: 0.029,
    muzzleScale: 1.6, shakeAmount: 1.2,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'deagle', 'smg', 'rifle', 'shotgun', 'sniper'];
