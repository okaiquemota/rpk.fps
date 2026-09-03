import * as THREE from 'three';

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Lerp independente de framerate: t = 1 - exp(-rate * dt). */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));

export const randRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);

export const randInt = (min: number, max: number): number =>
  Math.floor(randRange(min, max + 1));

export const pick = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)]!;

/** Gaussiana aproximada em [-1, 1], concentrada no centro. Bom pra spread de tiro. */
export const gaussian = (): number => (Math.random() + Math.random() - 1);

/** Caixa alinhada aos eixos. Tudo no jogo colide como AABB — simples e previsivel. */
export class AABB {
  constructor(
    public min = new THREE.Vector3(),
    public max = new THREE.Vector3(),
  ) {}

  static fromCenterSize(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): AABB {
    return new AABB(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
    );
  }

  /** Caixa apoiada no chao: (cx, cz) e' o centro da base, y e' a altura da base. */
  static fromFootprint(cx: number, y: number, cz: number, sx: number, height: number, sz: number): AABB {
    return new AABB(
      new THREE.Vector3(cx - sx / 2, y, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, y + height, cz + sz / 2),
    );
  }

  setFromFootprint(cx: number, y: number, cz: number, radius: number, height: number): this {
    this.min.set(cx - radius, y, cz - radius);
    this.max.set(cx + radius, y + height, cz + radius);
    return this;
  }

  intersects(o: AABB): boolean {
    return (
      this.min.x < o.max.x && this.max.x > o.min.x &&
      this.min.y < o.max.y && this.max.y > o.min.y &&
      this.min.z < o.max.z && this.max.z > o.min.z
    );
  }

  expand(m: number): AABB {
    return new AABB(
      new THREE.Vector3(this.min.x - m, this.min.y - m, this.min.z - m),
      new THREE.Vector3(this.max.x + m, this.max.y + m, this.max.z + m),
    );
  }

  center(out = new THREE.Vector3()): THREE.Vector3 {
    return out.addVectors(this.min, this.max).multiplyScalar(0.5);
  }
}

export interface RayHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Raio x AABB pelo metodo dos slabs.
 * Retorna a distancia ate' a entrada, ou -1 se nao acerta dentro de maxDist.
 * A direcao precisa estar normalizada.
 *
 * Origem DENTRO da caixa conta como "nao acertou". Sem isso, atirar de dentro
 * de uma parede (ou de um inimigo grudado em voce) devolve t=0 e engole todos
 * os tiros do frame.
 */
export function rayAABB(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  box: AABB,
  maxDist: number,
  normalOut?: THREE.Vector3,
): number {
  if (
    origin.x > box.min.x && origin.x < box.max.x &&
    origin.y > box.min.y && origin.y < box.max.y &&
    origin.z > box.min.z && origin.z < box.max.z
  ) return -1;

  let tmin = 0;
  let tmax = maxDist;
  let hitAxis = 0;
  let hitSign = 0;

  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
    const d = axis === 0 ? dir.x : axis === 1 ? dir.y : dir.z;
    const bmin = axis === 0 ? box.min.x : axis === 1 ? box.min.y : box.min.z;
    const bmax = axis === 0 ? box.max.x : axis === 1 ? box.max.y : box.max.z;

    if (Math.abs(d) < 1e-8) {
      // Raio paralelo a esse slab: so' acerta se ja' estiver dentro dele.
      if (o < bmin || o > bmax) return -1;
      continue;
    }

    const inv = 1 / d;
    let t1 = (bmin - o) * inv;
    let t2 = (bmax - o) * inv;
    let sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }

    if (t1 > tmin) { tmin = t1; hitAxis = axis; hitSign = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }

  if (normalOut) {
    normalOut.set(0, 0, 0);
    if (hitAxis === 0) normalOut.x = hitSign;
    else if (hitAxis === 1) normalOut.y = hitSign;
    else normalOut.z = hitSign;
  }
  return tmin;
}

/** Menor distancia horizontal de um ponto ate' uma AABB (ignora Y). */
export function distanceToBoxXZ(px: number, pz: number, box: AABB): number {
  const dx = Math.max(box.min.x - px, 0, px - box.max.x);
  const dz = Math.max(box.min.z - pz, 0, pz - box.max.z);
  return Math.hypot(dx, dz);
}
