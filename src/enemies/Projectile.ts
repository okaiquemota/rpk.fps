import * as THREE from 'three';
import { AABB, rayAABB } from '../core/math';

interface Projectile {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  mesh: THREE.Mesh;
}

export interface ProjectileHit {
  hitPlayer: boolean;
  position: THREE.Vector3;
  damage: number;
}

const MAX_PROJECTILES = 48;
const _step = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Projeteis inimigos: esferas lentas e visiveis, feitas pra serem desviadas.
 * Pool fixo — nada de alocar mesh no meio do tiroteio, e nenhuma luz dinamica
 * (ver o comentario em Effects: mexer na contagem de luzes recompila shaders).
 */
export class ProjectileSystem {
  readonly group = new THREE.Group();
  private pool: Projectile[] = [];
  private geo = new THREE.SphereGeometry(0.14, 10, 8);
  private mat = new THREE.MeshBasicMaterial({ color: 0xbdf0ff });

  constructor() {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        damage: 0,
        life: 0,
        mesh,
      });
    }
  }

  spawn(from: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number): void {
    const p = this.pool.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.position.copy(from);
    p.velocity.copy(direction).normalize().multiplyScalar(speed);
    p.damage = damage;
    p.life = 5;
    p.mesh.visible = true;
    p.mesh.position.copy(from);
  }

  /**
   * Avanca os projeteis. Retorna os que acertaram algo neste frame.
   * O jogador e' passado como AABB pra colisao ser a mesma coisa que o resto.
   */
  update(dt: number, colliders: readonly AABB[], playerBox: AABB): ProjectileHit[] {
    const hits: ProjectileHit[] = [];

    for (const p of this.pool) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) { this.deactivate(p); continue; }

      const stepLen = p.velocity.length() * dt;
      _step.copy(p.velocity).multiplyScalar(dt);
      _dir.copy(p.velocity).normalize();

      // Raycast do passo evita atravessar parede fina em alta velocidade.
      let closest = stepLen;
      let hitPlayer = false;

      const tPlayer = rayAABB(p.position, _dir, playerBox, stepLen);
      if (tPlayer >= 0 && tPlayer < closest) { closest = tPlayer; hitPlayer = true; }

      for (const box of colliders) {
        const t = rayAABB(p.position, _dir, box, closest);
        if (t >= 0 && t < closest) { closest = t; hitPlayer = false; }
      }

      if (closest < stepLen) {
        p.position.addScaledVector(_dir, closest);
        hits.push({ hitPlayer, position: p.position.clone(), damage: p.damage });
        this.deactivate(p);
        continue;
      }

      p.position.add(_step);
      p.mesh.position.copy(p.position);
    }

    return hits;
  }

  private deactivate(p: Projectile): void {
    p.active = false;
    p.mesh.visible = false;
  }

  clear(): void {
    for (const p of this.pool) this.deactivate(p);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
