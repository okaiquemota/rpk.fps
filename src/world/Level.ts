import * as THREE from 'three';
import { AABB, distanceToBoxXZ, randRange, rayAABB } from '../core/math';
import { WORLD } from '../config';
import { crateTexture, floorTexture, wallTexture } from './textures';

const _losDir = new THREE.Vector3();

interface BlockSpec {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: string;
}

/**
 * Arena de combate: chao, paredes externas, coberturas e plataformas.
 * A geometria visual e a fisica saem da MESMA lista de blocos — impossivel
 * o mundo desenhado divergir do mundo que colide.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly colliders: AABB[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly playerStart = new THREE.Vector3(0, 0, 18);
  readonly size = WORLD.arenaSize;

  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private textures: THREE.Texture[] = [];

  constructor() {
    this.buildSky();
    this.buildFloor();
    this.buildWalls();
    this.buildProps();
    this.buildLights();
    this.computeSpawnPoints();
  }

  // ------------------------------------------------------------------

  private buildSky(): void {
    // Gradiente vertical numa esfera invertida. Barato e resolve o "vazio preto"
    // que aparece acima das paredes da arena.
    const geo = new THREE.SphereGeometry(180, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x28374f) },
        horizonColor: { value: new THREE.Color(0x3d4350) },
        groundColor: { value: new THREE.Color(0x1a1713) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          vec3 c = h > 0.0
            ? mix(horizonColor, topColor, pow(h, 1.1))
            : mix(horizonColor, groundColor, pow(-h, 0.5));
          gl_FragColor = vec4(c, 1.0);
          // Um ShaderMaterial cru nao ganha essas etapas de graca: sem elas a cor
          // linear vai direto pro framebuffer sRGB e o ceu sai quase preto.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    this.group.add(sky);
    this.geometries.push(geo);
    this.materials.push(mat);
  }

  private buildFloor(): void {
    const half = this.size / 2;
    const tex = floorTexture();
    this.textures.push(tex);

    const geo = new THREE.PlaneGeometry(this.size, this.size);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.geometries.push(geo);
    this.materials.push(mat);

    // Chao como colisor: uma laje grossa abaixo de y=0 evita cair pra fora do mundo.
    this.colliders.push(new AABB(
      new THREE.Vector3(-half, -4, -half),
      new THREE.Vector3(half, 0, half),
    ));
  }

  private buildWalls(): void {
    const half = this.size / 2;
    const h = WORLD.wallHeight;
    const t = 1.5;
    const tex = wallTexture();
    this.textures.push(tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.08 });
    this.materials.push(mat);

    const walls: [number, number, number, number, number, number][] = [
      // x, y, z, w, h, d
      [0, h / 2, -half - t / 2, this.size + t * 2, h, t],
      [0, h / 2, half + t / 2, this.size + t * 2, h, t],
      [-half - t / 2, h / 2, 0, t, h, this.size + t * 2],
      [half + t / 2, h / 2, 0, t, h, this.size + t * 2],
    ];

    for (const [x, y, z, w, wh, d] of walls) {
      const geo = new THREE.BoxGeometry(w, wh, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.geometries.push(geo);
      this.colliders.push(AABB.fromCenterSize(x, y, z, w, wh, d));
    }
  }

  private buildProps(): void {
    const C_CRATE = '#4a3f31';
    const C_METAL = '#39414a';
    const C_RUST = '#5a3b2c';

    // Layout desenhado a mao: coberturas medias no centro, blocos altos nas
    // diagonais e rampas/plataformas pra dar verticalidade.
    const specs: BlockSpec[] = [
      // nucleo central elevado
      { x: 0, y: 0, z: 0, w: 10, h: 2.2, d: 10, color: C_METAL },
      { x: 0, y: 2.2, z: 0, w: 5, h: 1.4, d: 5, color: C_METAL },

      // rampas de acesso ao nucleo (degraus)
      { x: 0, y: 0, z: 7.2, w: 4, h: 0.75, d: 2.4, color: C_METAL },
      { x: 0, y: 0, z: 5.6, w: 4, h: 1.5, d: 1.6, color: C_METAL },
      { x: 0, y: 0, z: -7.2, w: 4, h: 0.75, d: 2.4, color: C_METAL },
      { x: 0, y: 0, z: -5.6, w: 4, h: 1.5, d: 1.6, color: C_METAL },

      // coberturas de peito (altura de agachar atras)
      { x: -12, y: 0, z: 6, w: 5, h: 1.25, d: 1.4, color: C_CRATE },
      { x: 12, y: 0, z: -6, w: 5, h: 1.25, d: 1.4, color: C_CRATE },
      { x: 7, y: 0, z: 13, w: 1.4, h: 1.25, d: 5, color: C_CRATE },
      { x: -7, y: 0, z: -13, w: 1.4, h: 1.25, d: 5, color: C_CRATE },

      // pilhas de caixas
      { x: -17, y: 0, z: -17, w: 3, h: 3, d: 3, color: C_CRATE },
      { x: -17, y: 3, z: -17, w: 2, h: 2, d: 2, color: C_RUST },
      { x: 17, y: 0, z: 17, w: 3, h: 3, d: 3, color: C_CRATE },
      { x: 17, y: 3, z: 17, w: 2, h: 2, d: 2, color: C_RUST },
      { x: -17, y: 0, z: 17, w: 4, h: 2, d: 2.6, color: C_RUST },
      { x: 17, y: 0, z: -17, w: 2.6, h: 2, d: 4, color: C_RUST },

      // torres de canto (bloqueiam linha de tiro longa)
      { x: -24, y: 0, z: 0, w: 3, h: 5, d: 9, color: C_METAL },
      { x: 24, y: 0, z: 0, w: 3, h: 5, d: 9, color: C_METAL },
      { x: 0, y: 0, z: -24, w: 9, h: 5, d: 3, color: C_METAL },
      { x: 0, y: 0, z: 24, w: 9, h: 5, d: 3, color: C_METAL },

      // plataforma elevada com escada de caixas (lado leste)
      { x: 22, y: 0, z: 10, w: 8, h: 3.2, d: 6, color: C_METAL },
      { x: 22, y: 0, z: 5.2, w: 4, h: 1.1, d: 2.4, color: C_CRATE },
      { x: 22, y: 1.1, z: 6.4, w: 4, h: 1.1, d: 1.6, color: C_CRATE },

      // plataforma elevada (lado oeste)
      { x: -22, y: 0, z: -10, w: 8, h: 3.2, d: 6, color: C_METAL },
      { x: -22, y: 0, z: -5.2, w: 4, h: 1.1, d: 2.4, color: C_CRATE },
      { x: -22, y: 1.1, z: -6.4, w: 4, h: 1.1, d: 1.6, color: C_CRATE },

      // obstaculos espalhados
      { x: -9, y: 0, z: 20, w: 2.2, h: 2.2, d: 2.2, color: C_RUST },
      { x: 9, y: 0, z: -20, w: 2.2, h: 2.2, d: 2.2, color: C_RUST },
      { x: 14, y: 0, z: 21, w: 2, h: 1.4, d: 6, color: C_CRATE },
      { x: -14, y: 0, z: -21, w: 2, h: 1.4, d: 6, color: C_CRATE },
    ];

    // Um material por cor (3 texturas no total) — barato pro renderer.
    const matByColor = new Map<string, THREE.MeshStandardMaterial>();
    for (const color of [C_CRATE, C_METAL, C_RUST]) {
      const tex = crateTexture(color);
      this.textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.15 });
      this.materials.push(mat);
      matByColor.set(color, mat);
    }

    for (const s of specs) {
      const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
      // Repetir a textura conforme o tamanho pra escala nao esticar.
      const mesh = new THREE.Mesh(geo, matByColor.get(s.color)!);
      mesh.position.set(s.x, s.y + s.h / 2, s.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.geometries.push(geo);
      this.colliders.push(AABB.fromFootprint(s.x, s.y, s.z, s.w, s.h, s.d));
    }
  }

  private buildLights(): void {
    // three >= r155 usa intensidades fisicas: os valores sao ~PI vezes maiores
    // do que o antigo modo "legacy lights".
    const hemi = new THREE.HemisphereLight(0x9db8d8, 0x3b3228, 2.6);
    this.group.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0d8, 4.6);
    sun.position.set(28, 44, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    const s = this.size * 0.72;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun);
    this.group.add(sun.target);

    // Luzes de preenchimento nos cantos: dao cor e leem o volume da arena.
    const fills: [number, number, number, number][] = [
      [-22, 6, -22, 0xff7a3d],
      [22, 6, 22, 0x4d9dff],
    ];
    for (const [x, y, z, color] of fills) {
      const p = new THREE.PointLight(color, 90, 46, 2);
      p.position.set(x, y, z);
      this.group.add(p);
    }
  }

  private computeSpawnPoints(): void {
    // Anel externo: inimigos entram pelas bordas, longe do centro.
    const half = this.size / 2 - 4;
    const candidates: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const r = randRange(half - 8, half);
      candidates.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    for (const c of candidates) {
      if (this.isFreeSpot(c.x, c.z, 0.8)) this.spawnPoints.push(c);
    }
  }

  // ------------------------------------------------------------------

  /** True se um cilindro de raio `radius` cabe em (x, z) sem entrar em bloco. */
  isFreeSpot(x: number, z: number, radius: number): boolean {
    for (const box of this.colliders) {
      if (box.max.y <= 0.05) continue; // o chao nao conta
      if (distanceToBoxXZ(x, z, box) < radius) return false;
    }
    const limit = this.size / 2 - radius - 0.5;
    return Math.abs(x) < limit && Math.abs(z) < limit;
  }

  /** Existe parede entre estes dois pontos? */
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    _losDir.subVectors(to, from);
    const dist = _losDir.length();
    if (dist < 0.001) return true;
    _losDir.divideScalar(dist);
    for (const box of this.colliders) {
      const t = rayAABB(from, _losDir, box, dist);
      if (t >= 0 && t < dist) return false;
    }
    return true;
  }

  /** Altura do chao em (x, z): topo do bloco mais alto abaixo de `fromY`. */
  groundHeightAt(x: number, z: number, fromY: number, radius = 0.1): number {
    let best = 0;
    for (const box of this.colliders) {
      if (box.max.y > fromY + 0.01) continue;
      if (x + radius < box.min.x || x - radius > box.max.x) continue;
      if (z + radius < box.min.z || z - radius > box.max.z) continue;
      if (box.max.y > best) best = box.max.y;
    }
    return best;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
