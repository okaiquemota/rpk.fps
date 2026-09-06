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
/** Eixo comprido da geometria do tracante. */
const _FORWARD = new THREE.Vector3(0, 0, 1);
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
  /**
   * Tracante, nao bola.
   *
   * Era uma esfera de 28 cm azul-clara voando a 27 m/s — de longe aquilo nao le'
   * como tiro, le' como bola de neve. Uma caixa comprida e fina, orientada na
   * direcao do voo, le' como rastro de projetil.
   *
   * O comprimento tem limite: um tracante fino DEMAIS some quando vem na sua
   * direcao (de frente voce so' ve' a secao), e ai' o tiro vira invisivel — que
   * e' exatamente o problema oposto. 7.5 cm de secao ainda da' um ponto visivel
   * de frente, e 55 cm de rastro le' como risco de lado.
   */
  private geo = new THREE.BoxGeometry(0.075, 0.075, 0.55);
  private mat = new THREE.MeshBasicMaterial({ color: 0xffa63d });

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
    // Aponta o tracante pra onde ele vai. Uma vez so': sem gravidade a direcao
    // nao muda, e girar isso a cada quadro seria trabalho a toa.
    _dir.copy(p.velocity).normalize();
    p.mesh.quaternion.setFromUnitVectors(_FORWARD, _dir);
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
