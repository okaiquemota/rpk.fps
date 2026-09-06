import * as THREE from 'three';
import { AABB, distanceToBoxXZ, randRange, rayAABB } from '../core/math';
import { WORLD } from '../config';
import { containerTexture, crateTexture, floorTexture, scaleBoxUVs, steelTexture, wallTexture } from './textures';

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
  /**
   * Colisores em uso agora.
   *
   * O chao e as paredes externas valem sempre; os obstaculos internos so' no
   * modo de ondas. O campo de tiro precisa de um espaco limpo — com os blocos
   * da arena no caminho, metade dos tiros morria num caixote antes de chegar na
   * parede de padrao (foi exatamente o que aconteceu na primeira versao).
   */
  colliders: AABB[] = [];
  /** Chao e paredes externas: valem em qualquer modo. */
  private baseColliders: AABB[] = [];
  /** Obstaculos internos da arena. */
  private propColliders: AABB[] = [];
  /** Grupo dos obstaculos, pra poder escondê-los inteiros. */
  private propsGroup = new THREE.Group();
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
    this.group.add(this.propsGroup);
    this.buildLights();
    this.useArenaLayout();
    this.computeSpawnPoints();
  }

  // ------------------------------------------------------------------

  private buildSky(): void {
    // Gradiente vertical numa esfera invertida. Barato e resolve o "vazio preto"
    // que aparece acima das paredes da arena.
    //
    // Dia claro com bruma quente no horizonte, nao noite. O ceu ocupa a faixa
    // toda acima do muro: escuro ali, a arena inteira le' como galpao fechado,
    // por mais que o chao esteja iluminado.
    const geo = new THREE.SphereGeometry(180, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3d6fa8) },
        horizonColor: { value: new THREE.Color(0xb8a888) },
        groundColor: { value: new THREE.Color(0x6b5c48) },
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
    this.group.add(mesh);
    this.geometries.push(geo);
    this.materials.push(mat);

    // Chao como colisor: uma laje grossa abaixo de y=0 evita cair pra fora do mundo.
    this.baseColliders.push(new AABB(
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
      // Um painel a cada 4.5 m, medido em metros e nao em "n vezes por parede".
      scaleBoxUVs(geo, w, wh, d, 4.5);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this.geometries.push(geo);
      this.baseColliders.push(AABB.fromCenterSize(x, y, z, w, wh, d));
    }
  }

  private buildProps(): void {
    // Tres TIPOS de peca, nao tres cores do mesmo desenho. Antes tudo usava a
    // mesma textura tingida, e o resultado era um patio de blocos pintados: o
    // que da' leitura de mapa e' reconhecer contentor, engradado e chapa de
    // longe, cada um com a propria silhueta de superficie.
    const C_CRATE = 'crate';
    const C_METAL = 'steel';
    const C_RUST = 'container';

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

    // Um material por tipo (3 texturas no total) — barato pro renderer.
    const kinds: [string, THREE.Texture, number, number][] = [
      [C_CRATE, crateTexture('#8a6a3e'), 0.94, 0.02],
      [C_METAL, steelTexture('#6d7076'), 0.62, 0.45],
      [C_RUST, containerTexture('#9c4a2c'), 0.8, 0.25],
    ];
    const matByColor = new Map<string, THREE.MeshStandardMaterial>();
    for (const [key, tex, roughness, metalness] of kinds) {
      this.textures.push(tex);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness, metalness });
      this.materials.push(mat);
      matByColor.set(key, mat);
    }

    for (const s of specs) {
      const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
      // Textura em metros, nao em "uma repeticao por bloco": sem isto a ripa do
      // engradado de 10 m sai cinco vezes maior que a do de 2 m.
      scaleBoxUVs(geo, s.w, s.h, s.d, s.color === C_CRATE ? 1.6 : 2.6);
      const mesh = new THREE.Mesh(geo, matByColor.get(s.color)!);
      mesh.position.set(s.x, s.y + s.h / 2, s.z);
      this.propsGroup.add(mesh);
      this.geometries.push(geo);
      this.propColliders.push(AABB.fromFootprint(s.x, s.y, s.z, s.w, s.h, s.d));
    }
  }

  private buildLights(): void {
    // three >= r155 usa intensidades fisicas: os valores sao ~PI vezes maiores
    // do que o antigo modo "legacy lights".
    // Ceu azul por cima, quique quente do concreto por baixo.
    //
    // Sem sombra projetada, a hemisferica e' a unica coisa que separa uma face
    // virada pro ceu de uma virada pro chao — mas subi-la demais lava a cena.
    // O contraste que sobrou entre face iluminada e face na sombra e' a razao
    // sol/hemisferica; alta demais aqui, tudo vira o mesmo bege.
    const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x6b5a44, 2.2);
    this.group.add(hemi);

    // Sol baixo e quente: rasante da sombra mais longa, e sombra longa e' o que
    // faz um patio parecer patio. A pino, tudo achata.
    const sun = new THREE.DirectionalLight(0xffe6bd, 5.2);
    sun.position.set(34, 30, 20);
    this.group.add(sun);
    this.group.add(sun.target);

    // Nada de luz de preenchimento nos cantos. Ela custava caro pelo motivo que
    // nao aparece no perfil de geometria: a contagem de luzes entra no SHADER,
    // e cada point light e' avaliada em todo pixel de todo material — apagada
    // ou nao. Duas delas por decoracao sao dois lacos por fragmento na tela
    // inteira, e a hemisferica ja' abre a sombra de graca.
  }

  /** Arena completa: obstaculos visiveis e colidindo. */
  useArenaLayout(): void {
    this.propsGroup.visible = true;
    this.colliders = [...this.baseColliders, ...this.propColliders];
  }

  /** Espaco limpo, com os colisores que o modo passar (parede de padrao etc). */
  useRangeLayout(extra: readonly AABB[]): void {
    this.propsGroup.visible = false;
    this.colliders = [...this.baseColliders, ...extra];
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
