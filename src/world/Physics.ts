import type * as THREE from 'three';
import { AABB } from '../core/math';

export interface MoveResult {
  grounded: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
  groundY: number;
}

const probe = new AABB();

function overlaps(pos: THREE.Vector3, radius: number, height: number, box: AABB): boolean {
  probe.setFromFootprint(pos.x, pos.y, pos.z, radius, height);
  return probe.intersects(box);
}

/**
 * Move uma "capsula" (na verdade AABB) resolvendo eixo por eixo.
 * `pos` e' a base (os pes). Modifica `pos` e `vel` no lugar.
 *
 * Resolver um eixo de cada vez e' o truque classico de FPS: evita ficar preso
 * em quinas e deixa o personagem deslizar ao longo das paredes de graca.
 */
export function moveCharacter(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  radius: number,
  height: number,
  colliders: readonly AABB[],
  dt: number,
  stepHeight: number,
): MoveResult {
  const result: MoveResult = { grounded: false, hitWall: false, hitCeiling: false, groundY: pos.y };

  // ---------- eixo Y ----------
  pos.y += vel.y * dt;
  if (vel.y <= 0) {
    let highestTop = -Infinity;
    for (const box of colliders) {
      if (!overlaps(pos, radius, height, box)) continue;
      // So' apoia em topo que estava (quase) abaixo dos pes antes de descer.
      if (box.max.y <= pos.y - vel.y * dt + 0.02 && box.max.y > highestTop) highestTop = box.max.y;
    }
    if (highestTop > -Infinity) {
      pos.y = highestTop;
      vel.y = 0;
      result.grounded = true;
      result.groundY = highestTop;
    }
  } else {
    let lowestBottom = Infinity;
    for (const box of colliders) {
      if (!overlaps(pos, radius, height, box)) continue;
      if (box.min.y < lowestBottom) lowestBottom = box.min.y;
    }
    if (lowestBottom < Infinity) {
      pos.y = lowestBottom - height - 0.001;
      vel.y = 0;
      result.hitCeiling = true;
    }
  }

  // ---------- eixos horizontais ----------
  const moveAxis = (axis: 'x' | 'z'): void => {
    const delta = vel[axis] * dt;
    if (delta === 0) return;
    const oldValue = pos[axis];
    const oldY = pos.y;
    pos[axis] += delta;

    let blocker: AABB | null = null;
    for (const box of colliders) {
      if (overlaps(pos, radius, height, box)) { blocker = box; break; }
    }
    if (!blocker) return;

    // Tentar subir o degrau: so' vale se o topo do obstaculo estiver ao alcance
    // do passo e se houver espaco livre la' em cima.
    const rise = blocker.max.y - pos.y;
    if (rise > 0 && rise <= stepHeight) {
      pos.y = blocker.max.y + 0.001;
      let stillBlocked = false;
      for (const box of colliders) {
        if (overlaps(pos, radius, height, box)) { stillBlocked = true; break; }
      }
      if (!stillBlocked) return; // subiu o degrau
      pos.y = oldY;
    }

    pos[axis] = oldValue;
    vel[axis] = 0;
    result.hitWall = true;
  };

  // Alternar a ordem X/Z por frame evitaria vies direcional, mas manter fixo
  // e' mais previsivel — e a diferenca e' imperceptivel nessas velocidades.
  moveAxis('x');
  moveAxis('z');

  return result;
}

/** Existe espaco livre pra ficar de pe' nessa posicao? (usado ao desagachar) */
export function canStandAt(
  pos: THREE.Vector3,
  radius: number,
  height: number,
  colliders: readonly AABB[],
): boolean {
  for (const box of colliders) {
    if (overlaps(pos, radius, height, box)) return false;
  }
  return true;
}
