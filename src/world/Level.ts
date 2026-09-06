import * as THREE from 'three';
import { AABB, distanceToBoxXZ, randRange, rayAABB } from '../core/math';
import { WORLD } from '../config';
import type { Surface } from './textures';
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
/**
 * De onde vem o sol. UM lugar so': a luz direcional, o disco no ceu e o
 * environment map leem daqui. Separados, o ceu mostrava o sol num canto
 * enquanto a sombra caia pro outro — e ninguem estranha isso de imediato,
 * so' fica com cara de cenario falso.
 */
export const SUN_DIR = new THREE.Vector3(34, 30, 20).normalize();

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

  /**
   * A esfera do ceu. Fica exposta porque o environment map da cena e' gerado
   * DELA: antes vinha de um `RoomEnvironment`, uma sala fechada, e todo metal
   * do patio refletia um interior que nao existe em lugar nenhum do jogo.
   */
  sky!: THREE.Mesh;

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
    const geo = new THREE.SphereGeometry(180, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3d6fa8) },
        horizonColor: { value: new THREE.Color(0xb8a888) },
        groundColor: { value: new THREE.Color(0x6b5c48) },
        sunColor: { value: new THREE.Color(0xfff4de) },
        sunDir: { value: SUN_DIR.clone() },
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
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        varying vec3 vWorld;
        void main() {
          vec3 d = normalize(vWorld);
          float h = d.y;

          // A faixa de bruma e' ESTREITA. Com uma rampa reta ate' o topo, o azul
          // sobe devagar demais e o ceu inteiro fica leitoso — que era o efeito
          // de "coberto" que a arena tinha antes. A exponencial concentra a
          // bruma nos primeiros graus acima do horizonte, como no ceu de verdade.
          float t = 1.0 - exp(-3.4 * max(h, 0.0));
          vec3 c = h > 0.0
            ? mix(horizonColor, topColor, t)
            : mix(horizonColor, groundColor, pow(-h, 0.5));

          float cosSol = dot(d, sunDir);

          // O horizonte esquenta perto do azimute do sol. Sem isso a bruma tem a
          // mesma cor nos 360 graus, e o ceu le' como gradiente, nao como ar.
          float perto = max(dot(normalize(vec3(d.x, 0.0, d.z)),
                                normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          c = mix(c, c * vec3(1.16, 1.06, 0.92), pow(perto, 3.0) * (1.0 - t) * 0.9);

          // Halo largo e disco. O disco entra com borda suave: recortado, ele
          // vira serrilha do tamanho do pixel quando a camera gira.
          c += sunColor * pow(max(cosSol, 0.0), 220.0) * 0.55;
          c += sunColor * smoothstep(0.9994, 0.9998, cosSol) * 3.2;

          gl_FragColor = vec4(c, 1.0);
          // Um ShaderMaterial cru nao ganha essas etapas de graca: sem elas a cor
          // linear vai direto pro framebuffer sRGB e o ceu sai quase preto.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    this.sky = sky;
    this.group.add(sky);
    this.geometries.push(geo);
    this.materials.push(mat);
  }

  private buildFloor(): void {
    const half = this.size / 2;
    const sup = floorTexture();
    this.textures.push(...sup.all);

    const geo = new THREE.PlaneGeometry(this.size, this.size);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: sup.map, normalMap: sup.normalMap, roughnessMap: sup.roughnessMap,
      // Com mapa de rugosidade, o numero aqui vira MULTIPLICADOR do mapa, nao
      // um valor fixo — 1 deixa o mapa mandar sozinho.
      roughness: 1, metalness: 0.05,
      normalScale: new THREE.Vector2(sup.relief, sup.relief),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
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
    const sup = wallTexture();
    this.textures.push(...sup.all);
    const mat = new THREE.MeshStandardMaterial({
      map: sup.map, normalMap: sup.normalMap, roughnessMap: sup.roughnessMap,
      roughness: 1, metalness: 0.08,
      normalScale: new THREE.Vector2(sup.relief, sup.relief),
    });
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
      mesh.receiveShadow = true;
      mesh.castShadow = true;
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

    // Um material por tipo — barato pro renderer. A rugosidade agora vem do
    // mapa; o que fica por material e' so' o quanto ele e' METAL, que o mapa
    // nao tem como saber: madeira, concreto e chapa reagem diferente ao sol
    // com a mesma aspereza.
    const kinds: [string, Surface, number][] = [
      // Tons dessaturados de proposito. Com o relevo novo a peca ja' tem
      // variacao propria de luz, e a cor saturada que compensava a superficie
      // chapada passou a brigar com ela: o engradado lia como pinho de
      // brinquedo. Madeira exposta ao tempo perde croma antes de perder valor.
      [C_CRATE, crateTexture('#7b6749'), 0.02],
      [C_METAL, steelTexture('#6d7076'), 0.5],
      [C_RUST, containerTexture('#8d4c33'), 0.35],
    ];
    const matByColor = new Map<string, THREE.MeshStandardMaterial>();
    for (const [key, sup, metalness] of kinds) {
      this.textures.push(...sup.all);
      const mat = new THREE.MeshStandardMaterial({
        map: sup.map, normalMap: sup.normalMap, roughnessMap: sup.roughnessMap,
        roughness: 1, metalness,
        normalScale: new THREE.Vector2(sup.relief, sup.relief),
      });
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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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
    // Caiu de 2.4 pra 1.1 quando o environment map passou a vir do ceu de
    // verdade: os dois fazem a MESMA conta — luz do ceu em cima, quique do chao
    // embaixo. Somando os dois inteiros, a arena ficou clara e azulada e perdeu
    // o patio ao sol. A contagem de luzes nao muda; so' o peso.
    const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x6b5a44, 1.1);
    this.group.add(hemi);

    // Sol baixo e quente: rasante da sombra mais longa, e sombra longa e' o que
    // faz um patio parecer patio. A pino, tudo achata.
    const sun = new THREE.DirectionalLight(0xffe6bd, 5.2);
    sun.position.copy(SUN_DIR).multiplyScalar(52);
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

    // Preenchimento nos cantos, so' pra abrir a sombra. Antes eram laranja e
    // azul saturados, um em cada canto: aquilo pintava a arena de neon e dava
    // cara de fliperama, nao de patio ao sol. A CONTAGEM de luzes segue a mesma
    // de proposito — mudar quantas luzes a cena tem recompila todo material.
    const fills: [number, number, number, number][] = [
      [-22, 6, -22, 0xffd9a8],
      [22, 6, 22, 0xbfd4ee],
    ];
    for (const [x, y, z, color] of fills) {
      const p = new THREE.PointLight(color, 42, 46, 2);
      p.position.set(x, y, z);
      this.group.add(p);
    }
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
