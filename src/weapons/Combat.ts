import * as THREE from 'three';
import { COMBAT } from '../config';
import { gaussian, rayAABB } from '../core/math';
import type { Enemy } from '../enemies/Enemy';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { Effects } from '../fx/Effects';
import type { Level } from '../world/Level';
import type { Player } from '../player/Player';
import type { Weapon } from './Weapon';

export interface ShotReport {
  pellets: number;
  pelletsHit: number;
  totalDamage: number;
  headshots: number;
  kills: Enemy[];
  anyHit: boolean;
}

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _point = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _knock = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Resolve o tiro do jogador. Hitscan puro: a bala existe por um frame.
 *
 * Detalhe que importa: o raio sai do OLHO (centro da tela), nao do cano da arma.
 * O tracer e' que sai do cano — visual e fisica separados, como todo FPS faz.
 */
export class CombatSystem {
  constructor(
    private level: Level,
    private enemies: EnemyManager,
    private effects: Effects,
  ) {}

  fire(player: Player, weapon: Weapon, muzzleWorld: THREE.Vector3): ShotReport {
    const report: ShotReport = {
      pellets: weapon.def.pellets, pelletsHit: 0, totalDamage: 0,
      headshots: 0, kills: [], anyHit: false,
    };

    const origin = player.eyePosition;
    const forward = player.forward();
    const moving = player.horizontalSpeed > 1.2;
    const spread = weapon.currentSpread(player.adsAmount, moving, !player.grounded);

    // Base ortonormal pra espalhar os pellets em torno da direcao de mira.
    _right.crossVectors(forward, WORLD_UP).normalize();
    if (_right.lengthSq() < 0.0001) _right.set(1, 0, 0);
    _up.crossVectors(_right, forward).normalize();

    const targets = this.enemies.targetables();

    for (let i = 0; i < weapon.def.pellets; i++) {
      _dir.copy(forward);
      if (spread > 0) {
        _dir.addScaledVector(_right, gaussian() * spread);
        _dir.addScaledVector(_up, gaussian() * spread);
        _dir.normalize();
      }

      const maxDist = Math.min(weapon.def.range, COMBAT.maxRange);
      let closest = maxDist;
      let hitEnemy: Enemy | null = null;
      let hitNormal: THREE.Vector3 | null = null;

      // --- geometria do nivel ---
      for (const box of this.level.colliders) {
        const t = rayAABB(origin, _dir, box, closest, _normal);
        if (t >= 0 && t < closest) {
          closest = t;
          hitEnemy = null;
          hitNormal = _normal.clone();
        }
      }

      // --- inimigos (podem estar na frente da parede) ---
      for (const enemy of targets) {
        const t = rayAABB(origin, _dir, enemy.aabb, closest);
        if (t >= 0 && t < closest) {
          closest = t;
          hitEnemy = enemy;
          hitNormal = null;
        }
      }

      _point.copy(origin).addScaledVector(_dir, closest);

      if (hitEnemy) {
        const headshot = _point.y >= hitEnemy.headMinY;
        const damage = weapon.def.damage
          * weapon.damageAt(closest)
          * (headshot ? COMBAT.headshotMultiplier : 1);

        const result = hitEnemy.takeDamage(damage);
        _knock.copy(_dir).setY(0).normalize();
        hitEnemy.applyKnockback(_knock, weapon.def.kickback * 8);

        this.effects.blood(_point, _dir, headshot || weapon.def.pellets > 1);

        report.pelletsHit++;
        report.totalDamage += result.applied;
        report.anyHit = true;
        if (headshot) report.headshots++;
        if (result.killed) report.kills.push(hitEnemy);
      } else if (closest < maxDist) {
        this.effects.impact(_point, hitNormal ?? _dir.clone().negate());
      }

      // Um tracer por pellet polui demais na escopeta; um a cada tres resolve.
      if (weapon.def.pellets === 1 || i % 3 === 0) {
        this.effects.tracer(muzzleWorld, _point.clone());
      }
    }

    return report;
  }

  /** Existe linha de visao livre entre dois pontos? (usado pela IA e pelos drops) */
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    _dir.subVectors(to, from);
    const dist = _dir.length();
    if (dist < 0.001) return true;
    _dir.divideScalar(dist);
    for (const box of this.level.colliders) {
      const t = rayAABB(from, _dir, box, dist);
      if (t >= 0 && t < dist) return false;
    }
    return true;
  }
}
