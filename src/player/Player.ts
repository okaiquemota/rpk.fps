import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';
import { clamp, damp } from '../core/math';
import type { Input } from '../core/Input';
import type { Level } from '../world/Level';
import { canStandAt, moveCharacter } from '../world/Physics';
import { Weapon } from '../weapons/Weapon';
import { BASE_STATS, type Stats, type Upgrade } from './Stats';
import { WEAPON_DEFS, WEAPON_ORDER, type WeaponId } from '../weapons/WeaponDefs';

export interface PlayerEvents {
  onFootstep(): void;
  onJump(): void;
  onLand(force: number): void;
  onHurt(damage: number, fromDirection: THREE.Vector3): void;
  onDeath(): void;
  onWeaponSwitch(id: WeaponId): void;
}

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3();   // base (pes)
  readonly velocity = new THREE.Vector3();

  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  baseFov: number = CAMERA.fov;

  health: number = PLAYER.maxHealth;
  armor = 0;

  /** Multiplicadores das melhorias. As armas guardam a mesma referencia. */
  readonly stats: Stats = { ...BASE_STATS };
  readonly upgradesTaken = new Map<string, number>();
  alive = true;

  grounded = false;
  crouching = false;
  sprinting = false;
  private currentHeight: number = PLAYER.heightStand;
  private timeSinceDamage = 99;
  private coyote = 0;
  private jumpBuffered = 0;
  private stepDistance = 0;
  private landDip = 0;
  private lastFallSpeed = 0;

  /** Recuo de camera aplicado por cima do look do jogador; volta sozinho. */
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilPitchTarget = 0;
  private recoilYawTarget = 0;

  adsAmount = 0;
  wantsAds = false;

  readonly weapons = new Map<WeaponId, Weapon>();
  currentWeaponId: WeaponId = 'pistol';

  constructor(private level: Level, private events: PlayerEvents) {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far,
    );
    for (const id of WEAPON_ORDER) {
      this.weapons.set(id, new Weapon(WEAPON_DEFS[id], id === 'pistol', this.stats));
    }
    this.respawn();
  }

  get weapon(): Weapon { return this.weapons.get(this.currentWeaponId)!; }
  get eyeHeight(): number { return this.currentHeight - PLAYER.eyeOffset; }
  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }
  get horizontalSpeed(): number { return Math.hypot(this.velocity.x, this.velocity.z); }
  get maxHealth(): number { return PLAYER.maxHealth + this.stats.maxHealthBonus; }
  get maxSpeedNow(): number {
    const base = this.crouching ? PLAYER.speedCrouch
      : this.sprinting ? PLAYER.speedSprint
      : PLAYER.speedWalk;
    return base * this.stats.moveSpeedMult;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.pitch + this.recoilPitch;
    const y = this.yaw + this.recoilYaw;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)).normalize();
  }

  respawn(): void {
    this.position.copy(this.level.playerStart);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    Object.assign(this.stats, BASE_STATS);
    this.upgradesTaken.clear();
    this.health = this.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.crouching = false;
    this.currentHeight = PLAYER.heightStand;
    this.timeSinceDamage = 99;
    this.recoilPitch = this.recoilYaw = this.recoilPitchTarget = this.recoilYawTarget = 0;
    this.adsAmount = 0;
    this.currentWeaponId = 'pistol';
    for (const w of this.weapons.values()) {
      w.reset();
      w.unlocked = w.def.id === 'pistol';
    }
  }

  // ------------------------------------------------------------------

  /** Quanto do giro de borda esta' ativo neste eixo, em [-1, 1]. */
  edgeTurnX = 0;
  edgeTurnY = 0;
  edgeTurnEnabled = true;

  updateLook(input: Input, dt: number): void {
    const scale = 0.0022 * this.sensitivity * (1 - this.adsAmount * 0.35);
    this.yaw -= input.mouseDX * scale;
    this.pitch -= input.mouseDY * scale;

    // Setas viram mira completa quando o mouse nao pode ser capturado.
    const arrow = 2.1 * this.sensitivity * (1 - this.adsAmount * 0.35) * dt;
    if (input.isDown('ArrowLeft')) this.yaw += arrow;
    if (input.isDown('ArrowRight')) this.yaw -= arrow;
    if (input.isDown('ArrowUp')) this.pitch += arrow;
    if (input.isDown('ArrowDown')) this.pitch -= arrow;

    // Giro de borda: sem pointer lock o cursor encosta na moldura da janela e o
    // movimento relativo morre ali. Levar o mouse para a beirada passa a girar
    // sozinho, entao da' pra dar a volta completa.
    this.edgeTurnX = 0;
    this.edgeTurnY = 0;
    // Girar exige mouse EM MOVIMENTO. Sem isso, largar o cursor perto da borda
    // deixava a tela girando sozinha — que e' exatamente o que nao se espera de
    // um jogo parado.
    const pointerActive = input.secondsSincePointerMove < EDGE_IDLE_TIMEOUT;
    if (this.edgeTurnEnabled && input.fallback && input.pointerInside && pointerActive) {
      this.edgeTurnX = edgeRamp(input.pointerNX);
      this.edgeTurnY = edgeRamp(input.pointerNY);
      const speed = EDGE_TURN_SPEED * this.sensitivity * (1 - this.adsAmount * 0.4) * dt;
      this.yaw -= this.edgeTurnX * speed;
      this.pitch -= this.edgeTurnY * speed * 0.65;
    }

    this.pitch = clamp(this.pitch, -CAMERA.pitchLimit, CAMERA.pitchLimit);

    // O recuo sobe rapido e assenta devagar. A volta usa o ritmo da arma: uma
    // sniper leva um tempao pra reassentar, uma submetralhadora quase nao sai.
    const recovery = this.weapon.def.recoilRecovery;
    this.recoilPitch = damp(this.recoilPitch, this.recoilPitchTarget, 24, dt);
    this.recoilYaw = damp(this.recoilYaw, this.recoilYawTarget, 24, dt);
    this.recoilPitchTarget = damp(this.recoilPitchTarget, 0, recovery, dt);
    this.recoilYawTarget = damp(this.recoilYawTarget, 0, recovery, dt);
  }

  /** `yaw` ja' vem com sinal: quem decide o lado e' o padrao da arma. */
  addRecoil(pitch: number, yaw: number): void {
    this.recoilPitchTarget += pitch;
    this.recoilYawTarget += yaw;
  }

  updateMovement(input: Input, dt: number): void {
    if (!this.alive) {
      this.velocity.x = damp(this.velocity.x, 0, 6, dt);
      this.velocity.z = damp(this.velocity.z, 0, 6, dt);
      this.velocity.y -= PLAYER.gravity * dt;
      moveCharacter(this.position, this.velocity, PLAYER.radius, 0.6, this.level.colliders, dt, 0);
      return;
    }

    // ---- entrada de direcao ----
    let ix = 0, iz = 0;
    // iz positivo = para frente. A camera olha para -Z com yaw 0, e a conversao
    // logo abaixo ja' cuida disso — inverter aqui trocava W com S.
    if (input.isDown('KeyW')) iz += 1;
    if (input.isDown('KeyS')) iz -= 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;
    const inputLen = Math.hypot(ix, iz);
    if (inputLen > 0) { ix /= inputLen; iz /= inputLen; }

    // ---- agachar ----
    const wantCrouch = input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC');
    if (wantCrouch) {
      this.crouching = true;
    } else if (this.crouching) {
      // So' levanta se tiver teto livre.
      const probe = this.position.clone();
      if (canStandAt(probe, PLAYER.radius, PLAYER.heightStand, this.level.colliders)) this.crouching = false;
    }
    const targetHeight = this.crouching ? PLAYER.heightCrouch : PLAYER.heightStand;
    this.currentHeight = damp(this.currentHeight, targetHeight, PLAYER.crouchLerp, dt);

    // ---- correr ----
    // So' corre pra frente, sem agachar e sem mirar.
    this.sprinting = input.isDown('ShiftLeft') && iz > 0.5 && !this.crouching && !this.wantsAds;

    // ---- aceleracao ----
    const sinYaw = Math.sin(this.yaw), cosYaw = Math.cos(this.yaw);
    // frente = (-sin, -cos); direita = (cos, -sin)
    const wishX = ix * cosYaw - iz * sinYaw;
    const wishZ = -ix * sinYaw - iz * cosYaw;
    // Confira com yaw = 0: W (iz = 1) da' wish = (0, -1), que e' exatamente
    // a direcao para onde a camera aponta.

    const maxSpeed = this.maxSpeedNow;
    const accel = this.grounded ? PLAYER.accelGround : PLAYER.accelAir;

    if (inputLen > 0) {
      this.velocity.x += wishX * accel * dt;
      this.velocity.z += wishZ * accel * dt;

      const speed = this.horizontalSpeed;
      const cap = this.grounded ? maxSpeed : Math.max(maxSpeed, speed); // no ar nao freia o momentum
      if (speed > cap) {
        const k = cap / speed;
        this.velocity.x *= k;
        this.velocity.z *= k;
      }
    } else if (this.grounded) {
      const f = Math.max(0, 1 - PLAYER.frictionGround * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
      if (this.horizontalSpeed < 0.05) { this.velocity.x = 0; this.velocity.z = 0; }
    }

    // ---- pulo (com coyote time e buffer) ----
    if (input.wasPressed('Space')) this.jumpBuffered = PLAYER.jumpBuffer;
    this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.coyote = this.grounded ? PLAYER.coyoteTime : Math.max(0, this.coyote - dt);

    if (this.jumpBuffered > 0 && this.coyote > 0) {
      this.velocity.y = PLAYER.jumpVelocity;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffered = 0;
      this.events.onJump();
    }

    // ---- gravidade + colisao ----
    this.velocity.y = Math.max(this.velocity.y - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);
    this.lastFallSpeed = this.velocity.y;

    const wasGrounded = this.grounded;
    const result = moveCharacter(
      this.position, this.velocity, PLAYER.radius, this.currentHeight,
      this.level.colliders, dt, PLAYER.stepHeight,
    );
    this.grounded = result.grounded;

    if (!wasGrounded && this.grounded) {
      const force = Math.abs(this.lastFallSpeed);
      if (force > 6) {
        this.landDip = clamp(force / PLAYER.maxFallSpeed, 0, 1) * CAMERA.landingDip;
        this.events.onLand(force);
        // Queda alta machuca — ensina o jogador a nao se jogar das plataformas.
        if (force > 20) this.takeDamage((force - 20) * 2.4, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
      }
    }

    // ---- passos ----
    if (this.grounded && this.horizontalSpeed > 0.6) {
      this.stepDistance += this.horizontalSpeed * dt;
      const stride = this.sprinting ? 2.4 : this.crouching ? 2.6 : 1.9;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.events.onFootstep();
      }
    } else {
      this.stepDistance = 1.2; // proximo passo sai logo ao voltar a andar
    }

    // ---- regeneracao ----
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > PLAYER.regenDelay && this.health < PLAYER.regenCap) {
      this.health = Math.min(PLAYER.regenCap, this.health + PLAYER.regenRate * dt);
    }
  }

  updateCamera(dt: number, shake: THREE.Vector3): void {
    const eye = this.position.y + this.eyeHeight;
    this.landDip = damp(this.landDip, 0, 9, dt);

    // Head bob acompanha a velocidade real, nao a tecla apertada.
    const speed01 = clamp(this.horizontalSpeed / PLAYER.speedSprint, 0, 1);
    const bobT = performance.now() / 1000;
    const bobAmp = CAMERA.bobAmount * speed01 * (this.grounded ? 1 : 0) * (1 - this.adsAmount * 0.8);
    const bobY = Math.abs(Math.sin(bobT * CAMERA.bobFrequency)) * bobAmp;
    const bobX = Math.sin(bobT * CAMERA.bobFrequency * 0.5) * bobAmp * 0.7;

    this.camera.position.set(
      this.position.x + bobX + shake.x,
      eye + bobY - this.landDip + shake.y,
      this.position.z + shake.z,
    );

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
    // Leve inclinacao lateral ao andar de lado — barato e vende movimento.
    const strafe = this.velocity.x * -Math.sin(this.yaw + Math.PI / 2) + this.velocity.z * -Math.cos(this.yaw + Math.PI / 2);
    this.camera.rotation.z = damp(this.camera.rotation.z, clamp(strafe * 0.004, -0.03, 0.03), 8, dt);

    // FOV: mirar fecha, correr abre um pouco.
    const def = this.weapon.def;
    const sprintBoost = this.sprinting ? 4 : 0;
    const targetFov = this.baseFov * lerpZoom(def.adsZoom, this.adsAmount) + sprintBoost;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 12, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  updateAds(dt: number, wants: boolean): void {
    this.wantsAds = wants && !this.sprinting && !this.weapon.reloading;
    const rate = 1 / Math.max(this.weapon.def.adsTime, 0.01);
    this.adsAmount = clamp(
      this.adsAmount + (this.wantsAds ? rate : -rate) * dt, 0, 1,
    );
  }

  switchWeapon(id: WeaponId): boolean {
    if (id === this.currentWeaponId) return false;
    const w = this.weapons.get(id);
    if (!w || !w.unlocked) return false;
    this.weapon.cancelReload();
    this.currentWeaponId = id;
    this.adsAmount = 0;
    this.events.onWeaponSwitch(id);
    return true;
  }

  cycleWeapon(dir: number): void {
    const unlocked = WEAPON_ORDER.filter((id) => this.weapons.get(id)!.unlocked);
    if (unlocked.length < 2) return;
    const i = unlocked.indexOf(this.currentWeaponId);
    const next = unlocked[(i + dir + unlocked.length * 2) % unlocked.length]!;
    this.switchWeapon(next);
  }

  takeDamage(amount: number, fromPosition: THREE.Vector3): void {
    if (!this.alive) return;

    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * PLAYER.armorAbsorb);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    this.timeSinceDamage = 0;

    const dir = fromPosition.clone().sub(this.eyePosition).normalize();
    this.events.onHurt(amount, dir);

    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.events.onDeath();
    }
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  addArmor(amount: number): number {
    const before = this.armor;
    this.armor = Math.min(PLAYER.maxArmor, this.armor + amount);
    return this.armor - before;
  }

  /** Aplica uma melhoria e conta o acumulo dela. */
  takeUpgrade(upgrade: Upgrade): void {
    upgrade.apply(this.stats);
    this.upgradesTaken.set(upgrade.id, (this.upgradesTaken.get(upgrade.id) ?? 0) + 1);
    // Vida maxima maior nao serve de nada se a barra nao acompanhar na hora.
    if (upgrade.id === 'health') this.heal(30);
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

const lerpZoom = (zoom: number, t: number): number => 1 + (zoom - 1) * t;

/** Radianos por segundo no extremo da tela. */
const EDGE_TURN_SPEED = 3.4;
/** Fracao central da tela onde o giro de borda nao age. */
const EDGE_DEADZONE = 0.72;
/** Sem mexer o mouse por esse tempo, o giro de borda para. */
const EDGE_IDLE_TIMEOUT = 0.9;

/**
 * Converte a posicao do ponteiro num eixo ([-1, 1]) na intensidade do giro.
 * Zero no miolo, subindo em curva quadratica ate' 1 na beirada — assim o
 * comeco do giro e' suave e o canto da tela vira de vez.
 */
function edgeRamp(n: number): number {
  const a = Math.abs(n);
  if (a <= EDGE_DEADZONE) return 0;
  const t = Math.min((a - EDGE_DEADZONE) / (1 - EDGE_DEADZONE), 1);
  return Math.sign(n) * t * t;
}
