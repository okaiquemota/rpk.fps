import * as THREE from 'three';
import { AABB, clamp } from '../core/math';
import type { ShootableTarget } from '../weapons/Combat';

/** Alvo de placa: cai ao levar tiro e levanta sozinho. */
class Plate implements ShootableTarget {
  readonly aabb = new AABB();
  hittable = true;

  private group = new THREE.Group();
  private downTimer = 0;
  private phase = Math.random() * Math.PI * 2;

  constructor(
    readonly origin: THREE.Vector3,
    readonly width: number,
    readonly height: number,
    /** Distancia que percorre de um lado ao outro. 0 = alvo parado. */
    readonly travel: number,
    readonly speed: number,
    face: THREE.MeshStandardMaterial,
    post: THREE.MeshStandardMaterial,
    band: THREE.MeshStandardMaterial,
    parent: THREE.Object3D,
    plateGeo: THREE.BufferGeometry,
    bandGeo: THREE.BufferGeometry,
    postGeo: THREE.BufferGeometry,
    private onScore: (points: number, headshot: boolean) => void,
  ) {
    const plate = new THREE.Mesh(plateGeo, face);
    plate.position.y = height / 2;
    this.group.add(plate);

    // Faixa vermelha no alto: marca a zona que vale dobrado, do mesmo jeito que
    // a cabeca de um inimigo.
    const top = new THREE.Mesh(bandGeo, band);
    top.position.y = height * 0.86;
    this.group.add(top);

    const stand = new THREE.Mesh(postGeo, post);
    stand.position.y = -0.25;
    this.group.add(stand);

    this.group.position.copy(origin);
    parent.add(this.group);
    this.syncBox();
  }

  private syncBox(): void {
    const p = this.group.position;
    this.aabb.min.set(p.x - this.width / 2, p.y, p.z - 0.06);
    this.aabb.max.set(p.x + this.width / 2, p.y + this.height, p.z + 0.06);
  }

  onHit(_point: THREE.Vector3, _damage: number, headshot: boolean): void {
    if (!this.hittable) return;
    this.hittable = false;
    this.downTimer = 1.3;
    this.onScore(headshot ? 2 : 1, headshot);
  }

  update(dt: number): void {
    if (this.travel > 0) {
      this.phase += dt * this.speed;
      this.group.position.x = this.origin.x + Math.sin(this.phase) * (this.travel / 2);
    }

    if (!this.hittable) {
      this.downTimer -= dt;
      // Tomba depressa e fica deitada ate' o tempo acabar.
      this.group.rotation.x = -Math.PI / 2 * clamp((1.3 - this.downTimer) * 7, 0, 1);
      if (this.downTimer <= 0) {
        this.hittable = true;
        this.group.rotation.x = 0;
      }
    }

    this.syncBox();
  }

  reset(): void {
    this.hittable = true;
    this.downTimer = 0;
    this.group.rotation.x = 0;
    this.group.position.copy(this.origin);
    this.syncBox();
  }

  detach(): void { this.group.removeFromParent(); }
}

export interface RangeStats {
  tiros: number;
  acertos: number;
  /** Raio medio dos impactos na parede de padrao, em centimetros. */
  agrupamentoCm: number;
  amostras: number;
  pontos: number;
  headshots: number;
}

/**
 * Campo de tiro: alvos que caem e levantam, e uma parede clara onde os buracos
 * de bala ficam bem visiveis.
 *
 * A parede nao e' decoracao. Ela mede o AGRUPAMENTO — o raio medio dos impactos
 * em torno do centro deles — que e' o unico jeito honesto de comparar duas armas
 * ou de saber se um ajuste de recuo mudou alguma coisa de verdade.
 */
export class ShootingRange {
  readonly group = new THREE.Group();
  private plates: Plate[] = [];
  private patternHits: THREE.Vector3[] = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  private shots = 0;
  private hits = 0;
  private score = 0;
  private headshots = 0;

  /** Onde o jogador nasce nesse modo, de frente pra parede de padrao. */
  readonly spawn = new THREE.Vector3(0, 0, 16);
  private readonly wallZ = -6;
  /** Colisores que o nivel adota enquanto o campo de tiro esta' em uso. */
  readonly colliders: AABB[] = [];

  constructor() {
    this.buildWall();
    this.buildPlates();
    this.buildMarkers();
  }

  private trackMat<T extends THREE.Material>(m: T): T { this.materials.push(m); return m; }
  private trackGeo<T extends THREE.BufferGeometry>(g: T): T { this.geometries.push(g); return g; }

  /** Parede clara: buraco de bala escuro em fundo claro le' de longe. */
  private buildWall(): void {
    const mat = this.trackMat(new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.95 }));
    const wall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(15, 8, 0.4)), mat);
    wall.position.set(0, 4, this.wallZ);
    this.group.add(wall);
    this.colliders.push(AABB.fromCenterSize(0, 4, this.wallZ, 15, 8, 0.4));

    const ringMat = this.trackMat(new THREE.MeshStandardMaterial({
      color: 0xb03a2e, roughness: 0.9,
    }));
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        this.trackGeo(new THREE.TorusGeometry(0.35 + i * 0.45, 0.035, 6, 40)), ringMat,
      );
      ring.position.set(0, 1.6, this.wallZ + 0.21);
      this.group.add(ring);
    }
  }

  private buildPlates(): void {
    const face = this.trackMat(new THREE.MeshStandardMaterial({
      color: 0xe8e2d4, roughness: 0.8, metalness: 0.1,
    }));
    const post = this.trackMat(new THREE.MeshStandardMaterial({
      color: 0x3a3f45, roughness: 0.6, metalness: 0.5,
    }));
    const band = this.trackMat(new THREE.MeshStandardMaterial({
      color: 0xff6a3d, emissive: 0xff3b20, emissiveIntensity: 0.4, roughness: 0.7,
    }));

    const W = 0.62, H = 1.5;
    const plateGeo = this.trackGeo(new THREE.BoxGeometry(W, H, 0.07));
    const bandGeo = this.trackGeo(new THREE.BoxGeometry(W * 0.98, H * 0.2, 0.075));
    const postGeo = this.trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8));

    const score = (points: number, head: boolean): void => {
      this.score += points;
      this.hits++;
      if (head) this.headshots++;
    };

    // Tres distancias fixas, pra sentir queda de dano e alcance. Todos ficam
    // ENTRE o jogador (z = 16) e a parede (z = -6), e fora do corredor central,
    // que fica livre pra atirar na parede de padrao sem esbarrar em alvo.
    const fixos: [number, number][] = [[-3.4, 9], [3.4, 2], [-3.4, -4]];
    // ...e dois moveis, pra treinar acompanhamento.
    const moveis: [number, number, number, number][] = [
      [-7.5, 6, 7, 1.1], [7.5, -3, 8, 0.75],
    ];

    for (const [x, z] of fixos) {
      this.plates.push(new Plate(
        new THREE.Vector3(x, 0.9, z), W, H, 0, 0,
        face, post, band, this.group, plateGeo, bandGeo, postGeo, score,
      ));
    }
    for (const [x, z, travel, speed] of moveis) {
      this.plates.push(new Plate(
        new THREE.Vector3(x, 0.9, z), W, H, travel, speed,
        face, post, band, this.group, plateGeo, bandGeo, postGeo, score,
      ));
    }
  }

  /** Marcos no chao dizendo a que distancia voce esta'. */
  private buildMarkers(): void {
    const mat = this.trackMat(new THREE.MeshBasicMaterial({
      color: 0xff9d2e, transparent: true, opacity: 0.3,
    }));
    const geo = this.trackGeo(new THREE.PlaneGeometry(14, 0.09));
    for (const dist of [10, 20, 30]) {
      const line = new THREE.Mesh(geo, mat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.02, this.spawn.z - dist);
      this.group.add(line);
    }
  }

  noteShot(pellets: number): void { this.shots += pellets; }

  /**
   * Registra um impacto na parede de padrao. So' contam os que caem nela: tiro
   * que foi pro chao nao diz nada sobre agrupamento.
   */
  notePatternHit(point: THREE.Vector3): void {
    if (Math.abs(point.z - this.wallZ) > 0.6) return;
    this.patternHits.push(point.clone());
    if (this.patternHits.length > 60) this.patternHits.shift();
  }

  clearPattern(): void { this.patternHits.length = 0; }

  get stats(): RangeStats {
    let agrupamento = 0;
    const n = this.patternHits.length;
    if (n >= 2) {
      let cx = 0, cy = 0;
      for (const h of this.patternHits) { cx += h.x; cy += h.y; }
      cx /= n; cy /= n;
      let soma = 0;
      for (const h of this.patternHits) soma += Math.hypot(h.x - cx, h.y - cy);
      agrupamento = (soma / n) * 100; // metros -> centimetros
    }
    return {
      tiros: this.shots,
      acertos: this.hits,
      agrupamentoCm: +agrupamento.toFixed(1),
      amostras: n,
      pontos: this.score,
      headshots: this.headshots,
    };
  }

  get targets(): readonly ShootableTarget[] { return this.plates; }

  update(dt: number): void {
    for (const p of this.plates) p.update(dt);
  }

  reset(): void {
    this.shots = 0;
    this.hits = 0;
    this.score = 0;
    this.headshots = 0;
    this.patternHits.length = 0;
    for (const p of this.plates) p.reset();
  }

  dispose(): void {
    for (const p of this.plates) p.detach();
    this.plates.length = 0;
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
  }
}
