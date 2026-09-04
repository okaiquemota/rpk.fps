import * as THREE from 'three';
import type { Level } from '../world/Level';
import type { Enemy } from '../enemies/Enemy';

const SIZE = 176;          // lado do minimapa em pixels de CSS
const WORLD_RADIUS = 30;   // metros visiveis do centro ate' a borda
const DOT_ENEMY = '#ff4d3d';
const DOT_ITEM = '#ffb347';

/**
 * Minimapa no estilo dos FPS de arena: o mapa gira em volta de voce, que fica
 * sempre no centro apontando pra cima.
 *
 * A planta do nivel nao muda durante a partida, entao ela e' desenhada UMA vez
 * num canvas de apoio e depois so' rotacionada e transladada. Redesenhar
 * setenta caixas por frame seria desperdicio.
 */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private plan: HTMLCanvasElement;
  private dpr = Math.min(window.devicePixelRatio, 2);
  /** Pixels do canvas de planta por metro do mundo. */
  private planScale = 4;
  private planOffset = 0;

  /** Troca o nome mostrado sob o minimapa. */
  setLabel(text: string): void {
    const el = document.getElementById('minimap-label');
    if (el) el.textContent = text;
  }

  constructor(private level: Level) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.width = SIZE * this.dpr;
    this.canvas.height = SIZE * this.dpr;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
    document.getElementById('minimap-slot')?.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponivel');
    this.ctx = ctx;

    this.plan = this.buildPlan();
  }

  /** Desenha a planta do nivel vista de cima, uma unica vez. */
  private buildPlan(): HTMLCanvasElement {
    const half = this.level.size / 2 + 3;
    this.planOffset = half;
    const px = Math.ceil(half * 2 * this.planScale);

    const plan = document.createElement('canvas');
    plan.width = plan.height = px;
    const g = plan.getContext('2d');
    if (!g) return plan;

    g.fillStyle = 'rgba(24, 28, 34, 0.82)';
    g.fillRect(0, 0, px, px);

    for (const box of this.level.colliders) {
      // O chao (uma laje sob o mapa inteiro) cobriria tudo; so' interessa o que
      // e' obstaculo de verdade.
      const height = box.max.y - box.min.y;
      if (box.max.y <= 0.05 || height < 0.4) continue;

      const x = (box.min.x + this.planOffset) * this.planScale;
      const y = (box.min.z + this.planOffset) * this.planScale;
      const w = (box.max.x - box.min.x) * this.planScale;
      const h = (box.max.z - box.min.z) * this.planScale;

      // Blocos mais altos aparecem mais claros: da' leitura de relevo.
      const tone = Math.min(0.16 + height * 0.06, 0.55);
      g.fillStyle = `rgba(190, 205, 225, ${tone})`;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(150, 170, 200, 0.5)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    return plan;
  }

  update(
    playerPos: THREE.Vector3,
    yaw: number,
    enemies: readonly Enemy[],
    items: readonly THREE.Vector3[],
  ): void {
    const c = this.ctx;
    const s = SIZE * this.dpr;
    const center = s / 2;
    const pxPerMeter = center / WORLD_RADIUS;

    c.clearRect(0, 0, s, s);
    c.save();

    // Recorte circular: tudo que for desenhado fica dentro do disco.
    c.beginPath();
    c.arc(center, center, center - 1, 0, Math.PI * 2);
    c.clip();

    c.fillStyle = 'rgba(10, 13, 17, 0.72)';
    c.fillRect(0, 0, s, s);

    // Voce no centro, olhando pra cima: gira o mundo, nao o icone.
    c.translate(center, center);
    c.rotate(yaw);
    c.scale(pxPerMeter / this.planScale, pxPerMeter / this.planScale);
    c.translate(
      -(playerPos.x + this.planOffset) * this.planScale,
      -(playerPos.z + this.planOffset) * this.planScale,
    );
    c.drawImage(this.plan, 0, 0);
    c.restore();

    // ---- pontos (desenhados sem rotacao de contexto, girando o vetor a mao) ----
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const plot = (wx: number, wz: number, color: string, radius: number): void => {
      const dx = wx - playerPos.x;
      const dz = wz - playerPos.z;
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      const px = center + rx * pxPerMeter;
      const py = center + rz * pxPerMeter;
      if (Math.hypot(px - center, py - center) > center - 4) return;

      c.beginPath();
      c.arc(px, py, radius * this.dpr, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      c.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      c.lineWidth = this.dpr;
      c.stroke();
    };

    for (const item of items) plot(item.x, item.z, DOT_ITEM, 2.5);
    for (const e of enemies) {
      if (!e.isAlive) continue;
      plot(e.position.x, e.position.z, DOT_ENEMY, e.def.kind === 'brute' ? 4.5 : 3.2);
    }

    // ---- voce ----
    c.save();
    c.translate(center, center);
    c.beginPath();
    c.moveTo(0, -6 * this.dpr);
    c.lineTo(4.5 * this.dpr, 5 * this.dpr);
    c.lineTo(0, 2.5 * this.dpr);
    c.lineTo(-4.5 * this.dpr, 5 * this.dpr);
    c.closePath();
    c.fillStyle = '#eaf2ff';
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.8)';
    c.lineWidth = this.dpr;
    c.stroke();
    c.restore();

    // ---- moldura ----
    c.beginPath();
    c.arc(center, center, center - 1, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255, 157, 46, 0.55)';
    c.lineWidth = 2 * this.dpr;
    c.stroke();
  }

  onResize(): void {
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = SIZE * this.dpr;
    this.canvas.height = SIZE * this.dpr;
  }
}
