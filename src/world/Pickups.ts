import * as THREE from 'three';
import { randRange } from '../core/math';

export type PickupKind = 'health' | 'armor' | 'ammo' | 'weapon-rifle' | 'weapon-shotgun';

interface Pickup {
  kind: PickupKind;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  life: number;
  bobOffset: number;
}

const CONFIG: Record<PickupKind, { color: number; size: [number, number, number]; life: number }> = {
  health: { color: 0x4ade80, size: [0.34, 0.34, 0.34], life: 40 },
  armor: { color: 0x58a6ff, size: [0.34, 0.4, 0.2], life: 40 },
  ammo: { color: 0xffb347, size: [0.4, 0.24, 0.3], life: 35 },
  'weapon-rifle': { color: 0x9be36b, size: [0.16, 0.16, 0.7], life: 0 },
  'weapon-shotgun': { color: 0xff8b5e, size: [0.18, 0.2, 0.75], life: 0 },
};

const PICKUP_RADIUS = 1.15;

/**
 * Itens no chao: giram, flutuam e somem sozinhos.
 *
 * Cada item ja' teve uma PointLight propria, e era um dos motivos do jogo travar
 * ao matar inimigo: entrar e sair uma luz da cena refaz os shaders de todos os
 * materiais. O brilho agora vem do material emissivo, que nao custa nada disso.
 */
export class PickupManager {
  readonly group = new THREE.Group();
  private items: Pickup[] = [];
  private geoCache = new Map<PickupKind, THREE.BoxGeometry>();
  private matCache = new Map<PickupKind, THREE.MeshStandardMaterial>();

  spawn(kind: PickupKind, position: THREE.Vector3): void {
    const cfg = CONFIG[kind];

    let geo = this.geoCache.get(kind);
    if (!geo) {
      geo = new THREE.BoxGeometry(...cfg.size);
      this.geoCache.set(kind, geo);
    }
    let mat = this.matCache.get(kind);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: cfg.color, emissive: cfg.color, emissiveIntensity: 1.6,
        roughness: 0.4, metalness: 0.3,
      });
      this.matCache.set(kind, mat);
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.copy(position);
    mesh.position.y += 0.6;

    this.group.add(mesh);

    this.items.push({
      kind, mesh,
      position: position.clone(),
      life: cfg.life > 0 ? cfg.life : Infinity,
      bobOffset: randRange(0, Math.PI * 2),
    });
  }

  /** Move/anima os itens e devolve os que o jogador encostou. */
  update(dt: number, playerPosition: THREE.Vector3): PickupKind[] {
    const collected: PickupKind[] = [];
    const t = performance.now() / 1000;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.life -= dt;

      item.mesh.rotation.y += dt * 1.6;
      item.mesh.position.y = item.position.y + 0.6 + Math.sin(t * 2.2 + item.bobOffset) * 0.12;

      // pisca antes de sumir
      if (item.life < 5) item.mesh.visible = Math.sin(item.life * 14) > 0;

      if (item.life <= 0) { this.remove(i); continue; }

      const dx = playerPosition.x - item.position.x;
      const dz = playerPosition.z - item.position.z;
      const dy = playerPosition.y - item.position.y;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(dy) < 2.2) {
        collected.push(item.kind);
        this.remove(i);
      }
    }

    return collected;
  }

  private remove(index: number): void {
    const item = this.items[index]!;
    this.group.remove(item.mesh);
    this.items.splice(index, 1);
  }

  clear(): void {
    while (this.items.length > 0) this.remove(this.items.length - 1);
  }

  dispose(): void {
    this.clear();
    for (const g of this.geoCache.values()) g.dispose();
    for (const m of this.matCache.values()) m.dispose();
  }
}
