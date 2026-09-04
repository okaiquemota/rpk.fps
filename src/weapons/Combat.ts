import * as THREE from 'three';
import { COMBAT } from '../config';
import { AABB, gaussian, rayAABB } from '../core/math';
import type { Enemy } from '../enemies/Enemy';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { Effects } from '../fx/Effects';
import type { Level } from '../world/Level';
import type { Player } from '../player/Player';
import type { Weapon } from './Weapon';

export interface EnemyHit {
  enemy: Enemy;
  /** Ponto do primeiro pellet que acertou — onde o numero de dano nasce. */
  point: THREE.Vector3;
  damage: number;
  headshot: boolean;
  killed: boolean;
}

/**
 * Qualquer coisa que possa levar tiro sem ser inimigo — hoje, os alvos do campo
 * de tiro. Fica aqui pra o CombatSystem continuar sendo o unico lugar que
 * decide o que a bala acerta.
 */
export interface ShootableTarget {
  aabb: AABB;
  hittable: boolean;
  onHit(point: THREE.Vector3, damage: number, headshot: boolean): void;
}

export interface ShotReport {
  pellets: number;
  pelletsHit: number;
  totalDamage: number;
  headshots: number;
  kills: Enemy[];
  anyHit: boolean;
  /**
   * Um item por inimigo atingido, com o dano ja' somado.
   * A escopeta acerta ate' nove vezes o mesmo alvo; nove numeros de dano
   * empilhados nao dizem nada — um numero com o total diz.
   */
  hits: EnemyHit[];
  /** Pellets que bateram em geometria do nivel (pra som de ricochete). */
  surfaceHits: number;
  /** Pellets que bateram num alvo de treino. */
  targetHits: number;
  /**
   * Onde cada pellet bateu na geometria do nivel. E' com isso que o campo de
   * tiro mede o agrupamento na parede de padrao.
   */
  surfacePoints: THREE.Vector3[];
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
  /** Alvos que nao sao inimigos (campo de tiro). Vazio na partida normal. */
  private extraTargets: readonly ShootableTarget[] = [];

  constructor(
    private level: Level,
    private enemies: EnemyManager,
    private effects: Effects,
  ) {}

  setExtraTargets(targets: readonly ShootableTarget[]): void {
    this.extraTargets = targets;
  }

  fire(player: Player, weapon: Weapon, muzzleWorld: THREE.Vector3): ShotReport {
    const report: ShotReport = {
      pellets: weapon.def.pellets, pelletsHit: 0, totalDamage: 0,
      headshots: 0, kills: [], anyHit: false, surfaceHits: 0, targetHits: 0, surfacePoints: [], hits: [],
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
      let hitTarget: ShootableTarget | null = null;
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
          hitTarget = null;
          hitNormal = null;
        }
      }

      // --- alvos de treino ---
      for (const target of this.extraTargets) {
        if (!target.hittable) continue;
        const t = rayAABB(origin, _dir, target.aabb, closest);
        if (t >= 0 && t < closest) {
          closest = t;
          hitEnemy = null;
          hitTarget = target;
          hitNormal = null;
        }
      }

      _point.copy(origin).addScaledVector(_dir, closest);

      if (hitEnemy) {
        const headshot = _point.y >= hitEnemy.headMinY;
        const damage = weapon.def.damage
          * weapon.damageAt(closest)
          * player.stats.damageMult
          * (headshot ? COMBAT.headshotMultiplier * player.stats.headshotMult : 1);

        const result = hitEnemy.takeDamage(damage);
        _knock.copy(_dir).setY(0).normalize();
        hitEnemy.applyKnockback(_knock, weapon.def.kickback * 8);

        this.effects.blood(_point, _dir, headshot || weapon.def.pellets > 1);

        report.pelletsHit++;
        report.totalDamage += result.applied;
        report.anyHit = true;
        if (headshot) report.headshots++;
        if (result.killed) report.kills.push(hitEnemy);

        const entry = report.hits.find((x) => x.enemy === hitEnemy);
        if (entry) {
          entry.damage += result.applied;
          entry.headshot ||= headshot;
          entry.killed ||= result.killed;
        } else {
          report.hits.push({
            enemy: hitEnemy, point: _point.clone(),
            damage: result.applied, headshot, killed: result.killed,
          });
        }
      } else if (hitTarget) {
        const damage = weapon.def.damage * weapon.damageAt(closest) * player.stats.damageMult;
        const headshot = _point.y >= hitTarget.aabb.min.y
          + (hitTarget.aabb.max.y - hitTarget.aabb.min.y) * COMBAT.headHeightFraction;
        hitTarget.onHit(_point.clone(), damage, headshot);
        this.effects.impact(_point, _dir.clone().negate(), _dir, false);
        report.pelletsHit++;
        report.targetHits++;
        report.anyHit = true;
        if (headshot) report.headshots++;
      } else if (closest < maxDist) {
        // Um buraco por pellet empilha 9 decais no mesmo palmo de parede e vira
        // uma mancha preta; espalhar em alguns ja' le' como padrao de chumbo.
        const withDecal = weapon.def.pellets === 1 || i % 3 === 0;
        this.effects.impact(_point, hitNormal ?? _dir.clone().negate(), _dir, withDecal);
        report.surfaceHits++;
        report.surfacePoints.push(_point.clone());
      }

      // Um tracer por pellet polui demais na escopeta; um a cada tres resolve.
      if (weapon.def.pellets === 1 || i % 3 === 0) {
        this.effects.tracer(muzzleWorld, _point.clone());
      }
    }

    return report;
  }

}
