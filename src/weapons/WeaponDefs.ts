export type WeaponId = 'pistol' | 'rifle' | 'shotgun';

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

  recoilPitch: number;
  recoilYaw: number;
  kickback: number;

  range: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMin: number;

  adsZoom: number;
  adsTime: number;

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
    recoilPitch: 0.026, recoilYaw: 0.008, kickback: 0.055,
    range: 90, falloffStart: 28, falloffEnd: 70, falloffMin: 0.5,
    adsZoom: 0.8, adsTime: 0.13,
    bodyColor: 0x23272e, bodySize: [0.07, 0.135, 0.24], barrelLength: 0.13, barrelRadius: 0.02,
    muzzleScale: 1, shakeAmount: 0.5,
  },
  rifle: {
    id: 'rifle', name: 'FUZIL', slot: 2,
    damage: 21, pellets: 1, rpm: 720, automatic: true,
    magSize: 30, reserveMax: 240, startReserve: 120, reloadTime: 1.75,
    spreadHip: 0.022, spreadAds: 0.004, spreadMoving: 0.03,
    spreadPerShot: 0.008, spreadMax: 0.1, spreadRecovery: 0.075,
    recoilPitch: 0.017, recoilYaw: 0.006, kickback: 0.04,
    range: 140, falloffStart: 45, falloffEnd: 110, falloffMin: 0.6,
    adsZoom: 0.62, adsTime: 0.16,
    bodyColor: 0x2e3329, bodySize: [0.075, 0.125, 0.44], barrelLength: 0.32, barrelRadius: 0.018,
    muzzleScale: 0.85, shakeAmount: 0.35,
  },
  shotgun: {
    id: 'shotgun', name: 'ESCOPETA', slot: 3,
    damage: 14, pellets: 9, rpm: 78, automatic: false,
    magSize: 6, reserveMax: 60, startReserve: 24, reloadTime: 2.2,
    spreadHip: 0.075, spreadAds: 0.045, spreadMoving: 0.09,
    spreadPerShot: 0.01, spreadMax: 0.12, spreadRecovery: 0.12,
    recoilPitch: 0.07, recoilYaw: 0.014, kickback: 0.16,
    range: 45, falloffStart: 8, falloffEnd: 26, falloffMin: 0.22,
    adsZoom: 0.86, adsTime: 0.2,
    bodyColor: 0x3a2a1c, bodySize: [0.085, 0.14, 0.48], barrelLength: 0.44, barrelRadius: 0.029,
    muzzleScale: 1.6, shakeAmount: 1.2,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'rifle', 'shotgun'];
