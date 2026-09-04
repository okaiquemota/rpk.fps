import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Enemy } from '../enemies/Enemy';

interface DamageNumber {
  el: HTMLElement;
  position: THREE.Vector3;
  life: number;
  maxLife: number;
  rise: number;
  drift: number;
}

interface HealthBar {
  el: HTMLElement;
  fill: HTMLElement;
  enemy: Enemy | null;
  life: number;
}

const MAX_NUMBERS = 16;
const MAX_BARS = 10;
/** Quanto tempo a barra de vida fica visivel depois do ultimo acerto. */
const BAR_LINGER = 2.6;
const _v = new THREE.Vector3();

/**
 * Marcadores que vivem no mundo mas sao desenhados em DOM: numeros de dano e
 * barras de vida dos inimigos.
 *
 * DOM em vez de sprite 3D de proposito — tipografia nitida em qualquer
 * resolucao, sem textura nem atlas de fonte, e mover elemento por `transform`
 * nao dispara layout. O custo e' projetar alguns pontos por frame.
 */
export class WorldMarkers {
  private root: HTMLElement;
  private numbers: DamageNumber[] = [];
  private bars: HealthBar[] = [];

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'world-markers';
    document.getElementById('hud')?.appendChild(this.root);

    for (let i = 0; i < MAX_NUMBERS; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.numbers.push({
        el, position: new THREE.Vector3(), life: 0, maxLife: 1, rise: 0, drift: 0,
      });
    }

    for (let i = 0; i < MAX_BARS; i++) {
      const el = document.createElement('div');
      el.className = 'enemy-hp';
      el.style.display = 'none';
      const fill = document.createElement('div');
      fill.className = 'enemy-hp-fill';
      el.appendChild(fill);
      this.root.appendChild(el);
      this.bars.push({ el, fill, enemy: null, life: 0 });
    }
  }

  /** Numero saltando do ponto do acerto. */
  showDamage(worldPos: THREE.Vector3, amount: number, headshot: boolean, killed: boolean): void {
    const n = this.numbers.find((x) => x.life <= 0);
    if (!n) return;
    n.position.copy(worldPos);
    n.life = n.maxLife = headshot || killed ? 1.05 : 0.8;
    n.rise = 1.1 + Math.random() * 0.5;
    n.drift = (Math.random() - 0.5) * 0.8;
    n.el.textContent = String(Math.max(1, Math.round(amount)));
    n.el.className = `dmg-num${headshot ? ' head' : ''}${killed ? ' kill' : ''}`;
    n.el.style.display = 'block';
  }

  /** Passa a acompanhar este inimigo por alguns segundos. */
  trackEnemy(enemy: Enemy): void {
    const existing = this.bars.find((b) => b.enemy === enemy);
    if (existing) { existing.life = BAR_LINGER; return; }

    // Sem barra livre, rouba a que esta' mais perto de expirar.
    let slot = this.bars.find((b) => b.life <= 0);
    if (!slot) {
      slot = this.bars.reduce((a, b) => (a.life <= b.life ? a : b));
    }
    slot.enemy = enemy;
    slot.life = BAR_LINGER;
    slot.el.style.display = 'block';
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) { n.el.style.display = 'none'; continue; }

      const t = 1 - n.life / n.maxLife;
      _v.copy(n.position);
      _v.y += n.rise * t;
      _v.x += n.drift * t;
      _v.project(camera);

      if (_v.z > 1) { n.el.style.visibility = 'hidden'; continue; }
      n.el.style.visibility = 'visible';
      n.el.style.transform =
        `translate3d(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px, 0) ` +
        `translate(-50%, -50%) scale(${1 + (1 - t) * 0.35})`;
      n.el.style.opacity = String(clamp(n.life / (n.maxLife * 0.45), 0, 1));
    }

    for (const b of this.bars) {
      if (b.life <= 0) continue;
      const enemy = b.enemy;
      // Some junto com o inimigo: barra de morto e' ruido.
      if (!enemy || !enemy.isAlive) {
        b.life = 0;
        b.enemy = null;
        b.el.style.display = 'none';
        continue;
      }
      b.life -= dt;
      if (b.life <= 0) { b.el.style.display = 'none'; b.enemy = null; continue; }

      _v.set(enemy.position.x, enemy.position.y + enemy.def.height + 0.28, enemy.position.z);
      _v.project(camera);
      if (_v.z > 1) { b.el.style.visibility = 'hidden'; continue; }

      b.el.style.visibility = 'visible';
      b.el.style.transform =
        `translate3d(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px, 0) translate(-50%, -50%)`;
      b.el.style.opacity = String(clamp(b.life / 0.6, 0, 1));

      const frac = clamp(enemy.health / enemy.maxHealth, 0, 1);
      b.fill.style.width = `${frac * 100}%`;
      b.fill.classList.toggle('hurt', frac < 0.35);
    }
  }

  clear(): void {
    for (const n of this.numbers) { n.life = 0; n.el.style.display = 'none'; }
    for (const b of this.bars) { b.life = 0; b.enemy = null; b.el.style.display = 'none'; }
  }
}
