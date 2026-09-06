import * as THREE from 'three';
import { FX } from '../config';
import { clamp, randRange } from '../core/math';

interface Particle {
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  gravity: number;
  drag: number;
  size: number;
  grow: number;
  alpha: number;
}

/**
 * Um lote de particulas com um unico draw call.
 *
 * Existem duas instancias no jogo porque faisca e fumaca querem blending
 * diferente: faisca soma luz (aditivo), fumaca cobre o que esta' atras
 * (normal). Misturar os dois num material so' deixa a fumaca parecendo vapor
 * brilhante.
 */
class ParticleLayer {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private count = 0;

  constructor(private max: number, blending: THREE.Blending, softness: number) {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uSoftness: { value: softness } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;

          // Sem teto, uma particula perto da camera vira um borrao do tamanho da
          // tela: a formula de perspectiva explode quando dist tende a zero.
          gl_PointSize = min(size * (260.0 / max(dist, 0.05)), 110.0);

          // E some de vez quando esta' quase no olho, senao a fumaca do proprio
          // cano tapa a mira.
          vAlpha = alpha * smoothstep(0.35, 1.3, dist);

          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uSoftness;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, uSoftness, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    for (let i = 0; i < max; i++) {
      this.particles.push({
        life: 0, maxLife: 1, velocity: new THREE.Vector3(),
        gravity: 0, drag: 2.2, size: 1, grow: 0, alpha: 1,
      });
    }
  }

  emit(
    pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color,
    life: number, size: number, gravity: number, drag = 2.2, grow = 0, alpha = 1,
  ): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    const p = this.particles[i]!;
    p.life = p.maxLife = life;
    p.velocity.copy(vel);
    p.gravity = gravity;
    p.drag = drag;
    p.size = size;
    p.grow = grow;
    p.alpha = alpha;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.sizes[i] = size;
    this.alphas[i] = alpha;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-remove: troca com a ultima viva e encolhe a contagem.
        const last = this.count - 1;
        if (i !== last) {
          this.particles[i] = this.particles[last]!;
          this.particles[last] = p;
          for (let k = 0; k < 3; k++) {
            this.positions[i * 3 + k] = this.positions[last * 3 + k]!;
            this.colors[i * 3 + k] = this.colors[last * 3 + k]!;
          }
          this.sizes[i] = this.sizes[last]!;
          this.alphas[i] = this.alphas[last]!;
        }
        this.count--;
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      p.velocity.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      this.positions[i * 3] += p.velocity.x * dt;
      this.positions[i * 3 + 1] += p.velocity.y * dt;
      this.positions[i * 3 + 2] += p.velocity.z * dt;

      const t = p.life / p.maxLife;
      this.sizes[i] = p.size * (1 + p.grow * (1 - t));
      this.alphas[i] = t * p.alpha;
      i++;
    }

    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.color!.needsUpdate = true;
    geo.attributes.size!.needsUpdate = true;
    geo.attributes.alpha!.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

interface Tracer {
  life: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
}

interface Shell {
  life: number;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  bounces: number;
  mesh: THREE.Mesh;
  /**
   * A capsula existe e ja' voa, mas ainda nao aparece: e' o instante da ejecao,
   * que pertence a` animacao da arma (ver `LIBERA`).
   */
  escondida: boolean;
}

interface FlashLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  power: number;
}

const MAX_TRACERS = 32;
const MAX_SHELLS = 28;
/**
 * A que distancia do olho a capsula do jogo comeca a aparecer, em metros.
 *
 * Modelo com animacao de tiro cospe o PROPRIO cartucho pela janela de ejecao,
 * preso ao movimento da arma — e ele e' melhor que o nosso naquele instante,
 * porque acompanha o ferrolho. Nascendo junto, os dois apareciam lado a lado a
 * 40 cm do olho, e o que se via era municao em dobro.
 *
 * O que a animacao NAO faz e' o resto: voar, quicar e fazer barulho no chao.
 * Entao a nossa continua saindo no mesmo quadro do tiro, com a mesma fisica —
 * so' fica invisivel enquanto esta' na regiao da arma. A conta e' por
 * DISTANCIA, e nao por tempo, porque e' a distancia que decide se ela vai
 * aparecer gigante na cara do jogador ou pequena, ja' caindo.
 */
const LIBERA = 0.75;
const MAX_FLASHES = 4;
const TRACER_LENGTH = 4.5;

function decalTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(10,10,12,0.95)');
  grad.addColorStop(0.45, 'rgba(20,18,18,0.7)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  // lascas irregulares pro buraco nao parecer um circulo perfeito
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 12;
    ctx.beginPath();
    ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _reflect = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * Feedback visual do combate. Tudo em pools pre-alocados: durante um tiro de
 * escopeta saem 9 impactos no mesmo frame, e alocar nesse momento e' garantia
 * de engasgo no GC.
 */
export class Effects {
  readonly group = new THREE.Group();

  private sparks = new ParticleLayer(FX.maxParticles, THREE.AdditiveBlending, 0.1);
  private smoke = new ParticleLayer(FX.maxSmoke, THREE.NormalBlending, 0.0);

  private tracers: Tracer[] = [];
  private tracerMeshes: THREE.Mesh[] = [];

  private shells: Shell[] = [];
  private flashes: FlashLight[] = [];

  private decals: THREE.Mesh[] = [];
  private decalIndex = 0;

  private shakeTrauma = 0;
  readonly shakeOffset = new THREE.Vector3();

  /** Tocado quando uma capsula ejetada bate no chao. */
  onShellLand: (() => void) | null = null;

  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  /** Recebe a altura do chao pra capsula parar em cima da geometria certa. */
  constructor(private groundHeightAt: (x: number, z: number, fromY: number) => number) {
    this.group.add(this.sparks.points);
    this.group.add(this.smoke.points);

    // --- tracers: caixinhas esticadas, mais baratas e grossas que THREE.Line ---
    const tracerGeo = new THREE.BoxGeometry(0.022, 0.022, 1);
    this.disposables.push(tracerGeo);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const m = new THREE.Mesh(tracerGeo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracerMeshes.push(m);
      this.disposables.push(mat);
      this.tracers.push({ life: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), progress: 0 });
    }

    // --- capsulas ejetadas ---
    //
    // Medida de estojo de verdade: 7.62x39 tem ~4.6 mm de raio por 39 mm de
    // comprimento, quase 5 pra 1. A versao anterior era 11 mm por 34 mm — 1.4
    // pra 1, quase tao larga quanto alta. Ejetada a 24 cm do olho e iluminada
    // pelo clarao, aquilo nao lia como estojo: lia como uma pepita dourada
    // flutuando, e foi relatado como "um elemento flutuando enquanto atiro".
    //
    // Os seis lados tambem entregavam: de perto, o cilindro virava uma caixa.
    const shellGeo = new THREE.CylinderGeometry(0.0046, 0.005, 0.039, 8);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xc9a227, metalness: 0.95, roughness: 0.3,
    });
    this.disposables.push(shellGeo, shellMat);
    for (let i = 0; i < MAX_SHELLS; i++) {
      const mesh = new THREE.Mesh(shellGeo, shellMat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.shells.push({
        life: 0, velocity: new THREE.Vector3(), spin: new THREE.Vector3(),
        bounces: 0, mesh, escondida: false,
      });
    }

    // --- luzes de clarao (tiro e impacto) ---
    //
    // ATENCAO: estas luzes NUNCA sao escondidas nem removidas. No three, mudar a
    // QUANTIDADE de luzes da cena invalida os programas de shader de todos os
    // materiais, e a recompilacao trava o jogo por centenas de milissegundos —
    // era isso que engasgava a cada tiro e a cada inimigo morto. Uma luz apagada
    // aqui e' uma luz com intensity 0, que custa alguns ciclos por fragmento e
    // nao custa nenhuma recompilacao.
    for (let i = 0; i < MAX_FLASHES; i++) {
      const light = new THREE.PointLight(0xffb457, 0, 14, 2);
      this.group.add(light);
      this.flashes.push({ light, life: 0, maxLife: 1, power: 0 });
    }

    // --- decals: buracos de bala reciclados em anel ---
    const decalTex = decalTexture();
    this.disposables.push(decalTex);
    const decalGeo = new THREE.PlaneGeometry(0.17, 0.17);
    this.disposables.push(decalGeo);
    for (let i = 0; i < FX.maxDecals; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: decalTex, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      });
      const m = new THREE.Mesh(decalGeo, mat);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
      this.disposables.push(mat);
    }
  }

  private static readonly SPARK = new THREE.Color(0xffc46b);
  private static readonly SPARK_HOT = new THREE.Color(0xfff2c8);
  private static readonly BLOOD = new THREE.Color(0x9e1f14);
  private static readonly DUST = new THREE.Color(0x8b8378);
  private static readonly SMOKE = new THREE.Color(0x4a4742);

  // ------------------------------------------------------------------
  // clarões e luz
  // ------------------------------------------------------------------

  private lightAt(pos: THREE.Vector3, color: number, power: number, duration: number): void {
    const f = this.flashes.find((x) => x.life <= 0);
    if (!f) return;
    f.light.position.copy(pos);
    f.light.color.setHex(color);
    f.life = f.maxLife = duration;
    f.power = power;
  }

  /**
   * Clarão do disparo NA CENA DO MUNDO. O flash preso ao viewmodel ilumina só a
   * arma; este aqui é o que joga luz na parede ao seu lado e entrega o tiro.
   */
  muzzleBlast(worldPos: THREE.Vector3, direction: THREE.Vector3, strength: number): void {
    this.lightAt(worldPos, 0xffb457, 19 * strength, 0.065);

    // fagulhas de pólvora saindo pela boca do cano
    for (let i = 0; i < Math.round(5 * strength); i++) {
      _vel.copy(direction)
        .multiplyScalar(randRange(4, 13) * strength)
        .add(new THREE.Vector3(randRange(-1.6, 1.6), randRange(-1.2, 1.6), randRange(-1.6, 1.6)));
      this.sparks.emit(
        worldPos, _vel, i % 3 === 0 ? Effects.SPARK_HOT : Effects.SPARK,
        randRange(0.05, 0.16), randRange(0.8, 2.2), 6, 5.5,
      );
    }

    // Fumaça que sobe e abre. Nasce adiantada na direção do tiro: no ponto exato
    // do cano ela ficaria colada na câmera e tomaria a tela inteira.
    _pos.copy(worldPos).addScaledVector(direction, 0.5);
    for (let i = 0; i < Math.round(3 * strength); i++) {
      _vel.copy(direction)
        .multiplyScalar(randRange(0.6, 1.8))
        .add(new THREE.Vector3(randRange(-0.25, 0.25), randRange(0.25, 0.7), randRange(-0.25, 0.25)));
      this.smoke.emit(
        _pos, _vel, Effects.SMOKE,
        randRange(0.4, 0.85), randRange(0.35, 0.7) * strength, -0.5, 1.5, 3, 0.3,
      );
    }
  }

  /** Cápsula saindo pela janela de ejeção. */
  ejectShell(origin: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const s = this.shells.find((x) => x.life <= 0);
    if (!s) return;
    s.mesh.position.copy(origin);
    s.mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    s.velocity.copy(right).multiplyScalar(randRange(1.6, 2.8))
      .addScaledVector(up, randRange(1.6, 2.6))
      .add(new THREE.Vector3(randRange(-0.4, 0.4), 0, randRange(-0.4, 0.4)));
    s.spin.set(randRange(-18, 18), randRange(-18, 18), randRange(-18, 18));
    s.life = 3.2;
    s.bounces = 0;
    // Nasce invisivel: quem mostra a ejecao e' a animacao da arma. Ela aparece
    // sozinha no `update`, ao se afastar do olho (ver `LIBERA`).
    s.escondida = true;
    s.mesh.visible = false;
  }

  // ------------------------------------------------------------------
  // impactos
  // ------------------------------------------------------------------

  /**
   * Faísca + poeira + buraco de bala numa superfície sólida.
   * `incoming` é a direção do tiro: com ela as fagulhas ricocheteiam pra fora
   * em vez de saírem em todas as direções.
   */
  impact(
    point: THREE.Vector3, normal: THREE.Vector3,
    incoming?: THREE.Vector3, withDecal = true,
  ): void {
    // reflexão: r = d - 2(d·n)n
    if (incoming) {
      _reflect.copy(incoming).addScaledVector(normal, -2 * incoming.dot(normal)).normalize();
    } else {
      _reflect.copy(normal);
    }

    this.lightAt(point, 0xffd9a0, 5, 0.05);

    for (let i = 0; i < 10; i++) {
      _vel.copy(_reflect)
        .multiplyScalar(randRange(2.5, 9))
        .add(new THREE.Vector3(randRange(-1.5, 1.5), randRange(-0.6, 1.8), randRange(-1.5, 1.5)));
      this.sparks.emit(
        point, _vel, i % 4 === 0 ? Effects.SPARK_HOT : Effects.SPARK,
        randRange(0.14, 0.45), randRange(0.5, 1.5), 14, 2.4,
      );
    }

    // lascas de material caindo
    for (let i = 0; i < 4; i++) {
      _vel.copy(normal)
        .multiplyScalar(randRange(1, 2.6))
        .add(new THREE.Vector3(randRange(-1, 1), randRange(0, 1.4), randRange(-1, 1)));
      this.sparks.emit(point, _vel, Effects.DUST, randRange(0.4, 0.8), randRange(0.6, 1.2), 16, 1.6);
    }

    // nuvem de poeira que cresce e some
    for (let i = 0; i < 5; i++) {
      _vel.copy(normal)
        .multiplyScalar(randRange(0.5, 1.6))
        .add(new THREE.Vector3(randRange(-0.7, 0.7), randRange(0, 0.7), randRange(-0.7, 0.7)));
      this.smoke.emit(
        point, _vel, Effects.DUST, randRange(0.4, 0.9), randRange(0.7, 1.5), -0.3, 2.2, 3, 0.42,
      );
    }

    if (withDecal) this.addDecal(point, normal);
  }

  /** Respingo de sangue — cor diferente pra leitura instantanea de "acertei". */
  blood(point: THREE.Vector3, direction: THREE.Vector3, heavy: boolean): void {
    const count = heavy ? 22 : 11;
    for (let i = 0; i < count; i++) {
      _vel.copy(direction)
        .multiplyScalar(randRange(1.5, heavy ? 7 : 4.5))
        .add(new THREE.Vector3(randRange(-1.6, 1.6), randRange(-0.3, 2), randRange(-1.6, 1.6)));
      this.sparks.emit(
        point, _vel, Effects.BLOOD, randRange(0.3, 0.7), randRange(1, 2.4), 15, 1.8,
      );
    }
    // névoa vermelha atrás do alvo
    for (let i = 0; i < (heavy ? 6 : 3); i++) {
      _vel.copy(direction).multiplyScalar(randRange(1, 3))
        .add(new THREE.Vector3(randRange(-0.5, 0.5), randRange(0, 0.8), randRange(-0.5, 0.5)));
      this.smoke.emit(point, _vel, Effects.BLOOD, randRange(0.25, 0.5), randRange(0.9, 1.8), 2, 2.4, 2, 0.5);
    }
  }

  private addDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const m = this.decals[this.decalIndex]!;
    this.decalIndex = (this.decalIndex + 1) % this.decals.length;
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.lookAt(_pos.copy(point).add(normal));
    m.rotation.z = Math.random() * Math.PI * 2;
    m.scale.setScalar(randRange(0.7, 1.3));
    m.visible = true;
    (m.material as THREE.MeshBasicMaterial).opacity = 0.72;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const idx = this.tracers.findIndex((t) => t.life <= 0);
    if (idx < 0) return;
    const t = this.tracers[idx]!;
    t.from.copy(from);
    t.to.copy(to);
    t.progress = 0;
    t.life = from.distanceTo(to) / FX.tracerSpeed + 0.03;
    this.tracerMeshes[idx]!.visible = true;
  }

  /**
   * Deixa tudo visivel por um instante para o `renderer.compile` alcancar todos
   * os materiais. Compilar shader e' caro; melhor pagar na tela inicial do que
   * no primeiro tiro.
   */
  setVisibleForWarmup(on: boolean): void {
    for (const m of this.tracerMeshes) m.visible = on;
    for (const s of this.shells) s.mesh.visible = on;
    for (const d of this.decals) d.visible = on;
  }

  /** Apaga so' os buracos de bala, sem mexer no resto dos efeitos. */
  clearDecals(): void {
    for (const d of this.decals) d.visible = false;
  }

  addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1);
  }

  // ------------------------------------------------------------------

  /** `olho` posiciona a camera: e' o que decide quando a capsula aparece. */
  update(dt: number, olho?: THREE.Vector3): void {
    this.sparks.update(dt);
    this.smoke.update(dt);

    // --- tracers ---
    for (let k = 0; k < this.tracers.length; k++) {
      const t = this.tracers[k]!;
      const mesh = this.tracerMeshes[k]!;
      if (t.life <= 0) { mesh.visible = false; continue; }
      t.life -= dt;
      if (t.life <= 0) { mesh.visible = false; continue; }
      t.progress += FX.tracerSpeed * dt;

      const total = t.from.distanceTo(t.to);
      const head = Math.min(t.progress, total);
      const tail = Math.max(0, head - TRACER_LENGTH);
      _vel.subVectors(t.to, t.from).normalize();
      const ax = t.from.x + _vel.x * tail, ay = t.from.y + _vel.y * tail, az = t.from.z + _vel.z * tail;
      const bx = t.from.x + _vel.x * head, by = t.from.y + _vel.y * head, bz = t.from.z + _vel.z * head;

      mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      mesh.lookAt(bx, by, bz);
      mesh.scale.z = Math.max(Math.hypot(bx - ax, by - ay, bz - az), 0.01);
      (mesh.material as THREE.MeshBasicMaterial).opacity = clamp(t.life * 9, 0, 0.9);
    }

    // --- capsulas ---
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }

      s.velocity.y -= 20 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;

      // Saiu da regiao da arma: entra em cena e nao sai mais. O trinco importa
      // — sem ele, uma capsula parada no chao piscaria toda vez que o jogador
      // passasse por cima dela.
      if (s.escondida) {
        const longe = !olho || s.mesh.position.distanceToSquared(olho) > LIBERA * LIBERA;
        if (longe) { s.escondida = false; s.mesh.visible = true; }
      }

      const p = s.mesh.position;
      const floor = this.groundHeightAt(p.x, p.z, p.y + 0.5) + 0.014;
      if (p.y <= floor && s.velocity.y < 0) {
        p.y = floor;
        if (s.bounces === 0) this.onShellLand?.();
        if (s.bounces < 2) {
          s.bounces++;
          s.velocity.y *= -0.34;
          s.velocity.x *= 0.55;
          s.velocity.z *= 0.55;
          s.spin.multiplyScalar(0.5);
        } else {
          s.velocity.set(0, 0, 0);
          s.spin.set(0, 0, 0);
        }
      }
    }

    // --- clarões ---
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.light.intensity = 0;
        continue;
      }
      f.light.intensity = f.power * (f.life / f.maxLife);
    }

    // --- decals somem devagar ---
    for (const d of this.decals) {
      if (!d.visible) continue;
      const mat = d.material as THREE.MeshBasicMaterial;
      mat.opacity -= dt * 0.02;
      if (mat.opacity <= 0) d.visible = false;
    }

    // --- screen shake (trauma^2 e' mais natural que linear) ---
    //
    // Amplitude de 0.16 pra 0.1: numa rajada o trauma se empilha, e o que era
    // pra ser um soco por tiro virava a tela inteira tremendo enquanto se
    // atira — justo quando se precisa ver onde a bala foi.
    this.shakeTrauma = Math.max(0, this.shakeTrauma - FX.screenShakeDecay * dt * 0.14);
    const s = this.shakeTrauma * this.shakeTrauma;
    const now = performance.now() / 1000;
    this.shakeOffset.set(
      Math.sin(now * 47) * s * 0.1,
      Math.sin(now * 61 + 1.7) * s * 0.1,
      Math.sin(now * 53 + 3.1) * s * 0.045,
    );
  }

  clear(): void {
    this.sparks.clear();
    this.smoke.clear();
    for (let k = 0; k < this.tracers.length; k++) {
      this.tracers[k]!.life = 0;
      this.tracerMeshes[k]!.visible = false;
    }
    for (const s of this.shells) { s.life = 0; s.escondida = false; s.mesh.visible = false; }
    for (const f of this.flashes) { f.life = 0; f.light.intensity = 0; }
    for (const d of this.decals) d.visible = false;
    this.shakeTrauma = 0;
    this.shakeOffset.set(0, 0, 0);
  }

  dispose(): void {
    this.sparks.dispose();
    this.smoke.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
