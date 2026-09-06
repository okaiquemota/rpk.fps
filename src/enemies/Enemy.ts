import * as THREE from 'three';
import { AABB, clamp, damp, randRange } from '../core/math';
import { COMBAT } from '../config';
import type { Level } from '../world/Level';
import { moveCharacter } from '../world/Physics';
import { ENEMY_DEFS, type EnemyDef, type EnemyKind } from './EnemyTypes';

export type EnemyState = 'spawning' | 'chasing' | 'attacking' | 'dying' | 'dead';

/** Direcoes testadas quando o caminho reto esta' bloqueado, em ordem de preferencia. */
const AVOID_ANGLES = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.1, -2.1];

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _eye = new THREE.Vector3();

/**
 * Geometrias reaproveitadas por tipo de inimigo. Sao identicas entre instancias
 * do mesmo tipo, e criar (e descartar) cinco BoxGeometry a cada spawn e a cada
 * morte e' desperdicio puro no meio de uma onda.
 */
interface EnemyGeometry {
  body: THREE.BoxGeometry;
  head: THREE.BoxGeometry;
  eye: THREE.BoxGeometry;
  leg: THREE.BoxGeometry;
  arm: THREE.BoxGeometry;
  vest: THREE.BoxGeometry;
}
const geometryCache = new Map<EnemyKind, EnemyGeometry>();

/** Brilho de repouso do visor. Baixo: e' pista de direcao, nao lanterna. */
const EYE_GLOW = 1.0;

function geometriesFor(kind: EnemyKind): EnemyGeometry {
  const cached = geometryCache.get(kind);
  if (cached) return cached;

  const d = ENEMY_DEFS[kind];
  const H = d.height;
  const w = d.radius * 1.7;
  const geo: EnemyGeometry = {
    body: new THREE.BoxGeometry(w, H * 0.38, w * 0.7),
    head: new THREE.BoxGeometry(w * 0.62, H * 0.17, w * 0.6),
    // Visor: uma fresta larga e fina. O ponto pequeno e brilhante de antes lia
    // como olho de desenho; uma faixa le' como capacete com visor.
    eye: new THREE.BoxGeometry(w * 0.5, H * 0.17 * 0.2, 0.05),
    // Colete: um pouco mais largo que o tronco e bem fino, so' na frente.
    vest: new THREE.BoxGeometry(w * 1.04, H * 0.24, w * 0.78),
    leg: new THREE.BoxGeometry(w * 0.3, H * 0.42, w * 0.3),
    arm: new THREE.BoxGeometry(w * 0.24, H * 0.38 * 0.85, w * 0.24),
  };
  geometryCache.set(kind, geo);
  return geo;
}

/** Chamar so' ao derrubar o jogo inteiro. */
export function disposeEnemyGeometries(): void {
  for (const g of geometryCache.values()) {
    g.body.dispose(); g.head.dispose(); g.eye.dispose(); g.leg.dispose(); g.arm.dispose();
    g.vest.dispose();
  }
  geometryCache.clear();
}

export class Enemy {
  readonly def: EnemyDef;
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly aabb = new AABB();

  health: number;
  maxHealth: number;
  state: EnemyState = 'spawning';
  grounded = false;

  private body!: THREE.Mesh;
  private head!: THREE.Mesh;
  private eyeMat!: THREE.MeshStandardMaterial;
  private bodyMat!: THREE.MeshStandardMaterial;
  private headMat!: THREE.MeshStandardMaterial;
  private limbs: THREE.Mesh[] = [];

  private attackTimer = 0;
  private windupTimer = -1;
  private spawnTimer = 0.45;
  private deathTimer = 0;
  private flashTimer = 0;
  private walkPhase = Math.random() * Math.PI * 2;
  private repathTimer = 0;
  private moveDir = new THREE.Vector3();
  private speedScale: number;
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  /** O jogador esta' a vista? Reavaliado algumas vezes por segundo. */
  private canSeePlayer = false;
  private sightTimer = Math.random() * 0.2;

  /** Ataque pronto pra ser resolvido pelo manager neste frame. */
  pendingAttack = false;
  /** Um passo acabou de sair — o manager toca o som posicionado. */
  pendingStep = false;
  private stepDistance = 0;

  constructor(kind: EnemyKind, spawn: THREE.Vector3, healthScale: number, speedScale: number) {
    this.def = ENEMY_DEFS[kind];
    this.maxHealth = this.def.health * healthScale;
    this.health = this.maxHealth;
    this.speedScale = speedScale;
    this.position.copy(spawn);
    this.build();
    this.syncTransform();
    this.lastPos.copy(spawn);
  }

  private build(): void {
    const d = this.def;
    const H = d.height;
    const w = d.radius * 1.7;

    // Proporcoes em fracao da altura, empilhadas sem buraco entre as partes:
    //   pernas 0 -> 0.42 | torso 0.42 -> 0.80 | cabeca 0.80 -> 0.97
    // O topo do torso precisa encostar na cabeca, senao o boneco fica "quebrado"
    // e a hitbox de headshot (COMBAT.headHeightFraction) deixa de bater com o visual.
    const legH = H * 0.42;
    const bodyH = H * 0.38;
    const headH = H * 0.17;
    const bodyY = H * 0.61;
    const headY = H * 0.885;

    // `transparent: true` desde o nascimento, mesmo opaco: ligar isso so' na hora
    // da morte mudaria os parametros do material e obrigaria o three a recompilar
    // o shader bem no frame do abate — que era exatamente onde o jogo travava.
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: d.color, roughness: 0.75, metalness: 0.15, transparent: true,
    });
    // Equipamento — capacete, colete e bracos. Antes era o corpo CLAREADO, o que
    // dava cara de boneco; escuro le' como capacete e vest, e recorta o tronco.
    this.headMat = new THREE.MeshStandardMaterial({
      color: d.gearColor, roughness: 0.68, metalness: 0.22, transparent: true,
    });

    const geo = geometriesFor(d.kind);
    this.body = new THREE.Mesh(geo.body, this.bodyMat);
    this.body.position.y = bodyY;
    this.body.castShadow = true;
    this.group.add(this.body);

    const vest = new THREE.Mesh(geo.vest, this.headMat);
    vest.position.y = bodyY + bodyH * 0.06;
    vest.castShadow = true;
    this.group.add(vest);

    this.head = new THREE.Mesh(geo.head, this.headMat);
    this.head.position.y = headY;
    this.head.castShadow = true;
    this.group.add(this.head);

    // Visor emissivo: da' pra saber pra onde ele esta' olhando de longe. O brilho
    // e' fraco de proposito — forte demais vira farol de desenho animado.
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: d.eyeColor, emissive: d.eyeColor, emissiveIntensity: EYE_GLOW, roughness: 0.3,
      transparent: true,
    });
    const eye = new THREE.Mesh(geo.eye, this.eyeMat);
    eye.position.set(0, headY + headH * 0.08, -w * 0.31);
    this.group.add(eye);

    // pernas (animadas na caminhada)
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(geo.leg, this.bodyMat);
      leg.position.set(side * w * 0.24, legH * 0.5, 0);
      leg.castShadow = true;
      this.group.add(leg);
      this.limbs.push(leg);
    }

    // bracos
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(geo.arm, this.headMat);
      arm.position.set(side * w * 0.63, bodyY + bodyH * 0.05, 0);
      arm.castShadow = true;
      this.group.add(arm);
      this.limbs.push(arm);
    }

    this.group.scale.setScalar(0.01); // cresce ao nascer
  }

  private syncTransform(): void {
    this.group.position.copy(this.position);
    this.aabb.setFromFootprint(
      this.position.x, this.position.y, this.position.z, this.def.radius, this.def.height,
    );
  }

  get isAlive(): boolean { return this.state !== 'dying' && this.state !== 'dead'; }
  get isTargetable(): boolean { return this.isAlive && this.state !== 'spawning'; }
  get headMinY(): number { return this.position.y + this.def.height * COMBAT.headHeightFraction; }

  center(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.def.height * 0.55, this.position.z);
  }

  // ------------------------------------------------------------------

  update(dt: number, playerPos: THREE.Vector3, level: Level, neighbors: readonly Enemy[]): void {
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.bodyMat.emissive.setScalar(this.flashTimer > 0 ? this.flashTimer * 6 : 0);
    this.headMat.emissive.setScalar(this.flashTimer > 0 ? this.flashTimer * 6 : 0);

    if (this.state === 'dying') {
      this.updateDying(dt, level);
      return;
    }
    if (this.state === 'dead') return;

    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      this.group.scale.setScalar(clamp(1 - this.spawnTimer / 0.45, 0.01, 1));
      this.eyeMat.emissiveIntensity = EYE_GLOW + Math.sin(this.spawnTimer * 40) * EYE_GLOW * 0.8;
      if (this.spawnTimer <= 0) {
        this.state = 'chasing';
        this.group.scale.setScalar(1);
        this.eyeMat.emissiveIntensity = EYE_GLOW;
      }
    }

    _dir.subVectors(playerPos, this.position);
    _dir.y = 0;
    const distance = _dir.length();
    if (distance > 0.001) _dir.divideScalar(distance);

    // Linha de visao: um raycast por inimigo a cada frame seria caro, e a
    // informacao nao muda tao rapido assim. O sorteio inicial do timer espalha
    // as checagens entre frames em vez de amontoar todas no mesmo.
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.14 + Math.random() * 0.1;
      _tmp.set(this.position.x, this.position.y + this.def.height * 0.62, this.position.z);
      _eye.set(playerPos.x, playerPos.y + 1.3, playerPos.z);
      this.canSeePlayer = level.hasLineOfSight(_tmp, _eye);
    }

    this.attackTimer = Math.max(0, this.attackTimer - dt);

    // ---- ataque ----
    if (this.windupTimer >= 0) {
      this.windupTimer -= dt;
      if (this.windupTimer <= 0) {
        this.windupTimer = -1;
        // So' acerta se o alvo ainda estiver no alcance: recuar funciona.
        if (this.def.ranged || distance <= this.def.attackRange + 0.6) this.pendingAttack = true;
        this.state = 'chasing';
      }
    } else if (
      this.state !== 'spawning'
      && distance <= this.def.attackRange
      && this.attackTimer <= 0
      // Atirar na parede porque voce esta' atras dela e' o tipo de coisa que
      // faz a IA parecer burra. Corpo a corpo nao precisa: ja' esta' colado.
      && (!this.def.ranged || this.canSeePlayer)
    ) {
      this.state = 'attacking';
      this.windupTimer = this.def.windup;
      this.attackTimer = this.def.attackCooldown;
    }

    // ---- movimento ----
    if (this.state !== 'spawning') {
      this.updateNavigation(dt, distance, level, neighbors);
    }

    // gravidade + colisao (inimigos sobem degraus como o jogador)
    this.velocity.y = Math.max(this.velocity.y - 22 * dt, -40);
    const res = moveCharacter(
      this.position, this.velocity, this.def.radius, this.def.height,
      level.colliders, dt, 0.55,
    );
    this.grounded = res.grounded;

    // Destravar quem ficou preso em quina: pequeno empurrao lateral.
    if (this.state === 'chasing' && this.position.distanceToSquared(this.lastPos) < 0.0004) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.7) {
        this.moveDir.set(-_dir.z, 0, _dir.x).multiplyScalar(Math.random() > 0.5 ? 1 : -1);
        this.repathTimer = 0.6;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos.copy(this.position);

    // Passos: distancia percorrida, nao tempo — assim o ritmo acompanha a
    // velocidade real de cada tipo.
    if (this.grounded && this.state !== 'spawning') {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      this.stepDistance += speed * dt;
      const stride = 1.5 + this.def.height * 0.5;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.pendingStep = true;
      }
    }

    this.syncTransform();
    this.updateAnimation(dt, _dir, distance);
  }

  private updateNavigation(dt: number, distance: number, level: Level, neighbors: readonly Enemy[]): void {
    const stopDistance = this.def.ranged ? this.def.attackRange * 0.75 : this.def.attackRange * 0.7;
    // Sem angulo de tiro, o atirador para de recuar e vai procurar um.
    const blindShooter = this.def.ranged && !this.canSeePlayer;
    const wantsToClose = blindShooter || distance > stopDistance;

    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = 0.18 + Math.random() * 0.12;
      this.moveDir.copy(this.pickDirection(_dir, level));
    }

    let desiredX = 0, desiredZ = 0;
    if (wantsToClose) {
      desiredX = this.moveDir.x;
      desiredZ = this.moveDir.z;
    } else if (this.def.ranged && !blindShooter && distance < stopDistance * 0.6) {
      desiredX = -_dir.x; // atirador recua se voce chegar perto demais
      desiredZ = -_dir.z;
    } else if (this.def.ranged && !blindShooter) {
      // strafe lateral enquanto atira: alvo mais dificil
      desiredX = -_dir.z * 0.7;
      desiredZ = _dir.x * 0.7;
    }

    // separacao: evita empilhar todo mundo no mesmo ponto
    for (const other of neighbors) {
      if (other === this || !other.isAlive) continue;
      _tmp.subVectors(this.position, other.position);
      _tmp.y = 0;
      const d2 = _tmp.lengthSq();
      const minDist = this.def.radius + other.def.radius + 0.25;
      if (d2 > 0.0001 && d2 < minDist * minDist) {
        const d = Math.sqrt(d2);
        const push = (minDist - d) / minDist;
        desiredX += (_tmp.x / d) * push * 1.6;
        desiredZ += (_tmp.z / d) * push * 1.6;
      }
    }

    const len = Math.hypot(desiredX, desiredZ);
    const speed = this.def.speed * this.speedScale * (this.windupTimer >= 0 ? 0.25 : 1);
    if (len > 0.001) {
      const targetVX = (desiredX / len) * speed;
      const targetVZ = (desiredZ / len) * speed;
      this.velocity.x = damp(this.velocity.x, targetVX, 9, dt);
      this.velocity.z = damp(this.velocity.z, targetVZ, 9, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 9, dt);
      this.velocity.z = damp(this.velocity.z, 0, 9, dt);
    }
  }

  /**
   * Desvio de obstaculo por amostragem: tenta ir reto, e se o caminho estiver
   * bloqueado abre o angulo ate' achar folga. Nao e' A*, mas numa arena aberta
   * com coberturas resolve — e custa quase nada.
   */
  private pickDirection(toPlayer: THREE.Vector3, level: Level): THREE.Vector3 {
    const probe = this.def.radius + 0.35;
    const lookAhead = 1.6;
    const baseAngle = Math.atan2(toPlayer.x, toPlayer.z);

    for (const offset of AVOID_ANGLES) {
      const a = baseAngle + offset;
      const dx = Math.sin(a), dz = Math.cos(a);
      const px = this.position.x + dx * lookAhead;
      const pz = this.position.z + dz * lookAhead;
      if (level.isFreeSpot(px, pz, probe)) return _tmp.set(dx, 0, dz);
    }
    return _tmp.copy(toPlayer);
  }

  private updateAnimation(dt: number, toPlayer: THREE.Vector3, distance: number): void {
    // encara o jogador
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    let delta = targetYaw - this.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.group.rotation.y += delta * Math.min(1, dt * 9);

    // caminhada
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkPhase += dt * (2 + speed * 2.4);
    const swing = Math.sin(this.walkPhase) * clamp(speed / this.def.speed, 0, 1) * 0.5;
    const [legL, legR, armL, armR] = this.limbs as [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh];
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;

    // windup: encolhe e depois estica no golpe
    if (this.windupTimer >= 0) {
      const t = 1 - this.windupTimer / Math.max(this.def.windup, 0.001);
      this.body.scale.set(1 + t * 0.15, 1 - t * 0.18, 1 + t * 0.15);
      this.eyeMat.emissiveIntensity = EYE_GLOW + t * 2.2;
      armL.rotation.x = -1.2 * t;
      armR.rotation.x = -1.2 * t;
    } else {
      this.body.scale.set(
        damp(this.body.scale.x, 1, 12, dt),
        damp(this.body.scale.y, 1, 12, dt),
        damp(this.body.scale.z, 1, 12, dt),
      );
      this.eyeMat.emissiveIntensity = damp(this.eyeMat.emissiveIntensity, EYE_GLOW, 8, dt);
    }

    // respiracao sutil quando parado e longe
    if (distance > 20) this.head.position.y = this.def.height * 0.885 + Math.sin(this.walkPhase * 0.5) * 0.01;
  }

  private updateDying(dt: number, level: Level): void {
    this.deathTimer += dt;
    // tomba pra tras e afunda no chao
    this.group.rotation.x = damp(this.group.rotation.x, -Math.PI / 2, 7, dt);
    this.velocity.y -= 22 * dt;
    moveCharacter(this.position, this.velocity, this.def.radius, 0.4, level.colliders, dt, 0);
    this.group.position.copy(this.position);
    this.group.position.y -= Math.max(0, this.deathTimer - 0.9) * 1.6;

    const fade = clamp(1 - Math.max(0, this.deathTimer - 1) / 0.7, 0, 1);
    this.bodyMat.opacity = this.headMat.opacity = fade;
    this.eyeMat.opacity = fade;
    this.eyeMat.emissiveIntensity = fade * EYE_GLOW;

    if (this.deathTimer > 1.75) this.state = 'dead';
  }

  /** Retorna o dano efetivamente aplicado; `true` em `killed` se essa foi a morte. */
  takeDamage(amount: number): { applied: number; killed: boolean } {
    if (!this.isAlive) return { applied: 0, killed: false };
    const applied = Math.min(this.health, amount);
    this.health -= amount;
    this.flashTimer = 0.11;

    // Empurrao pra tras da' peso ao acerto.
    this.velocity.y = Math.max(this.velocity.y, 0.4);

    if (this.health <= 0) {
      this.state = 'dying';
      this.deathTimer = 0;
      this.velocity.set(this.velocity.x * 0.4, 2.2, this.velocity.z * 0.4);
      return { applied, killed: true };
    }
    return { applied, killed: false };
  }

  /** Ponto de onde sai o projetil (altura do peito). */
  muzzlePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.def.height * 0.62, this.position.z);
  }

  applyKnockback(dir: THREE.Vector3, force: number): void {
    if (!this.isAlive) return;
    const mass = this.def.kind === 'brute' ? 0.3 : 1;
    this.velocity.x += dir.x * force * mass;
    this.velocity.z += dir.z * force * mass;
  }

  randomDropOffset(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x + randRange(-0.4, 0.4), this.position.y, this.position.z + randRange(-0.4, 0.4),
    );
  }

  /** So' os materiais: a geometria e' compartilhada por todos do mesmo tipo. */
  dispose(): void {
    this.bodyMat.dispose();
    this.headMat.dispose();
    this.eyeMat.dispose();
  }
}
