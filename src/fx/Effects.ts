import * as THREE from 'three';
import { FX } from '../config';
import { clamp, randRange } from '../core/math';

interface Particle {
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  gravity: number;
  size: number;
}

interface Tracer {
  life: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  speed: number;
}

const MAX_TRACERS = 32;
const TRACER_LENGTH = 3.5;

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

/**
 * Feedback visual do combate. Tudo em pools pre-alocados: durante um tiroteio
 * com escopeta saem 9 impactos no mesmo frame, e alocar nesse momento e' garantia
 * de engasgo no GC.
 */
export class Effects {
  readonly group = new THREE.Group();

  // --- particulas ---
  private particles: Particle[] = [];
  private points: THREE.Points;
  private pPositions: Float32Array;
  private pColors: Float32Array;
  private pSizes: Float32Array;
  private pCount = 0;

  // --- tracers ---
  private tracers: Tracer[] = [];
  private tracerMeshes: THREE.Mesh[] = [];

  // --- decals ---
  private decals: THREE.Mesh[] = [];
  private decalIndex = 0;
  private decalTex: THREE.Texture;

  // --- screen shake ---
  private shakeTrauma = 0;
  readonly shakeOffset = new THREE.Vector3();

  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  constructor() {
    // Particulas: um unico Points com buffers dinamicos.
    const geo = new THREE.BufferGeometry();
    this.pPositions = new Float32Array(FX.maxParticles * 3);
    this.pColors = new Float32Array(FX.maxParticles * 3);
    this.pSizes = new Float32Array(FX.maxParticles);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pColors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSizes, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float a = smoothstep(0.5, 0.15, length(d));
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.disposables.push(geo, mat);

    for (let i = 0; i < FX.maxParticles; i++) {
      this.particles.push({ life: 0, maxLife: 1, velocity: new THREE.Vector3(), gravity: 0, size: 1 });
    }

    // Tracers: caixinhas esticadas, mais baratas e mais grossas que THREE.Line.
    const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffdb8a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.disposables.push(tracerGeo, tracerMat);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracerMeshes.push(m);
      this.tracers.push({ life: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), progress: 0, speed: 1 });
    }

    // Decals: buracos de bala reciclados em anel.
    this.decalTex = decalTexture();
    this.disposables.push(this.decalTex);
    const decalGeo = new THREE.PlaneGeometry(0.26, 0.26);
    this.disposables.push(decalGeo);
    for (let i = 0; i < FX.maxDecals; i++) {
      const mat2 = new THREE.MeshBasicMaterial({
        map: this.decalTex, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      });
      const m = new THREE.Mesh(decalGeo, mat2);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
      this.disposables.push(mat2);
    }
  }

  // ------------------------------------------------------------------

  private emitParticle(
    pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color,
    life: number, size: number, gravity: number,
  ): void {
    if (this.pCount >= FX.maxParticles) return;
    const i = this.pCount++;
    const p = this.particles[i]!;
    p.life = p.maxLife = life;
    p.velocity.copy(vel);
    p.gravity = gravity;
    p.size = size;
    this.pPositions[i * 3] = pos.x;
    this.pPositions[i * 3 + 1] = pos.y;
    this.pPositions[i * 3 + 2] = pos.z;
    this.pColors[i * 3] = color.r;
    this.pColors[i * 3 + 1] = color.g;
    this.pColors[i * 3 + 2] = color.b;
    this.pSizes[i] = size;
  }

  private static readonly SPARK = new THREE.Color(0xffc46b);
  private static readonly BLOOD = new THREE.Color(0xd83a2a);
  private static readonly DUST = new THREE.Color(0x9a9186);

  /** Faisca + poeira + buraco de bala numa superficie solida. */
  impact(point: THREE.Vector3, normal: THREE.Vector3): void {
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Vector3(
        normal.x + randRange(-0.7, 0.7),
        normal.y + randRange(-0.3, 0.9),
        normal.z + randRange(-0.7, 0.7),
      ).multiplyScalar(randRange(1.6, 5.5));
      this.emitParticle(point, v, Effects.SPARK, randRange(0.15, 0.4), randRange(0.6, 1.4), 9);
    }
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3(
        normal.x + randRange(-0.5, 0.5), normal.y + randRange(0, 0.6), normal.z + randRange(-0.5, 0.5),
      ).multiplyScalar(randRange(0.4, 1.2));
      this.emitParticle(point, v, Effects.DUST, randRange(0.4, 0.8), randRange(1.5, 3), 1.2);
    }
    this.addDecal(point, normal);
  }

  /** Respingo de sangue — cor diferente pra leitura instantanea de "acertei". */
  blood(point: THREE.Vector3, direction: THREE.Vector3, heavy: boolean): void {
    const count = heavy ? 16 : 8;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        direction.x + randRange(-0.8, 0.8),
        randRange(-0.2, 1.1),
        direction.z + randRange(-0.8, 0.8),
      ).multiplyScalar(randRange(1.5, heavy ? 6 : 4));
      this.emitParticle(point, v, Effects.BLOOD, randRange(0.3, 0.7), randRange(1.2, 2.6), 11);
    }
  }

  /** Nuvem escura quando um inimigo morre. */
  deathBurst(point: THREE.Vector3, color: number): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 24; i++) {
      const v = new THREE.Vector3(randRange(-1, 1), randRange(0.2, 1.4), randRange(-1, 1))
        .multiplyScalar(randRange(1.5, 5));
      this.emitParticle(point, v, c, randRange(0.5, 1.1), randRange(2, 4.5), 5);
    }
  }

  private addDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const m = this.decals[this.decalIndex]!;
    this.decalIndex = (this.decalIndex + 1) % this.decals.length;
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.lookAt(point.clone().add(normal));
    m.rotation.z = Math.random() * Math.PI * 2;
    m.scale.setScalar(randRange(0.7, 1.3));
    m.visible = true;
    (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const idx = this.tracers.findIndex((t) => t.life <= 0);
    if (idx < 0) return;
    const t = this.tracers[idx]!;
    t.from.copy(from);
    t.to.copy(to);
    t.progress = 0;
    t.speed = FX.tracerSpeed;
    t.life = from.distanceTo(to) / FX.tracerSpeed + 0.02;
    this.tracerMeshes[idx]!.visible = true;
  }

  addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1);
  }

  // ------------------------------------------------------------------

  update(dt: number): void {
    // --- particulas (compactacao por swap-remove) ---
    let i = 0;
    while (i < this.pCount) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        const last = this.pCount - 1;
        if (i !== last) {
          this.particles[i] = this.particles[last]!;
          this.particles[last] = p;
          for (let k = 0; k < 3; k++) {
            this.pPositions[i * 3 + k] = this.pPositions[last * 3 + k]!;
            this.pColors[i * 3 + k] = this.pColors[last * 3 + k]!;
          }
          this.pSizes[i] = this.pSizes[last]!;
        }
        this.pCount--;
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      p.velocity.multiplyScalar(1 - 2.2 * dt); // arrasto
      this.pPositions[i * 3] += p.velocity.x * dt;
      this.pPositions[i * 3 + 1] += p.velocity.y * dt;
      this.pPositions[i * 3 + 2] += p.velocity.z * dt;
      this.pSizes[i] = p.size * (p.life / p.maxLife);
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.pCount);
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.color!.needsUpdate = true;
    geo.attributes.size!.needsUpdate = true;

    // --- tracers ---
    for (let k = 0; k < this.tracers.length; k++) {
      const t = this.tracers[k]!;
      const mesh = this.tracerMeshes[k]!;
      if (t.life <= 0) { mesh.visible = false; continue; }
      t.life -= dt;
      t.progress += t.speed * dt;

      const total = t.from.distanceTo(t.to);
      const head = Math.min(t.progress, total);
      const tail = Math.max(0, head - TRACER_LENGTH);
      const dir = new THREE.Vector3().subVectors(t.to, t.from).normalize();
      const a = t.from.clone().addScaledVector(dir, tail);
      const b = t.from.clone().addScaledVector(dir, head);

      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.lookAt(b);
      mesh.scale.z = Math.max(a.distanceTo(b), 0.01);
      (mesh.material as THREE.MeshBasicMaterial).opacity = clamp(t.life * 6, 0, 0.85);
      if (t.life <= 0) mesh.visible = false;
    }

    // --- decals somem devagar ---
    for (const d of this.decals) {
      if (!d.visible) continue;
      const mat = d.material as THREE.MeshBasicMaterial;
      mat.opacity -= dt * 0.02;
      if (mat.opacity <= 0) d.visible = false;
    }

    // --- screen shake (trauma^2 = mais natural que linear) ---
    this.shakeTrauma = Math.max(0, this.shakeTrauma - FX.screenShakeDecay * dt * 0.14);
    const s = this.shakeTrauma * this.shakeTrauma;
    const now = performance.now() / 1000;
    this.shakeOffset.set(
      Math.sin(now * 47) * s * 0.14,
      Math.sin(now * 61 + 1.7) * s * 0.14,
      Math.sin(now * 53 + 3.1) * s * 0.06,
    );
  }

  clear(): void {
    this.pCount = 0;
    this.points.geometry.setDrawRange(0, 0);
    for (let k = 0; k < this.tracers.length; k++) {
      this.tracers[k]!.life = 0;
      this.tracerMeshes[k]!.visible = false;
    }
    for (const d of this.decals) d.visible = false;
    this.shakeTrauma = 0;
    this.shakeOffset.set(0, 0, 0);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const m of this.tracerMeshes) (m.material as THREE.Material).dispose();
  }
}
