const WIDTH = 460;
const HEIGHT = 26;
/** Quantos graus de rumo cabem na largura da faixa. */
const SPAN = 150;

const CARDINALS: [number, string][] = [
  [0, 'N'], [45, 'NE'], [90, 'L'], [135, 'SE'],
  [180, 'S'], [225, 'SO'], [270, 'O'], [315, 'NO'],
];

/**
 * Faixa de rumo no topo da tela: as letras rolam conforme voce gira, com o rumo
 * atual sempre no risco central. Serve pra combinar com o minimapa e pra
 * chamar direcao ("inimigo no norte") sem precisar de texto.
 */
export class Compass {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.min(window.devicePixelRatio, 2);
  private lastBearing = -999;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'compass';
    this.canvas.style.width = `${WIDTH}px`;
    this.canvas.style.height = `${HEIGHT}px`;
    document.getElementById('compass-slot')?.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponivel');
    this.ctx = ctx;
    this.applySize();
  }

  private applySize(): void {
    this.canvas.width = WIDTH * this.dpr;
    this.canvas.height = HEIGHT * this.dpr;
    this.lastBearing = -999;
  }

  /** `yaw` em radianos, na convencao do jogo (0 = olhando pro norte, -Z). */
  update(yaw: number): void {
    // Rumo em graus, 0..360, crescendo pra direita como numa bussola de verdade.
    let bearing = (-yaw * 180) / Math.PI % 360;
    if (bearing < 0) bearing += 360;

    // Redesenhar so' quando o rumo muda o bastante pra aparecer na tela.
    if (Math.abs(bearing - this.lastBearing) < 0.25
      && Math.abs(bearing - this.lastBearing) > -0.25) {
      if (this.lastBearing !== -999) return;
    }
    this.lastBearing = bearing;

    const c = this.ctx;
    const w = WIDTH * this.dpr;
    const h = HEIGHT * this.dpr;
    const pxPerDeg = w / SPAN;
    c.clearRect(0, 0, w, h);

    c.save();
    c.scale(this.dpr, this.dpr);
    const W = WIDTH, H = HEIGHT;

    // trilho
    c.fillStyle = 'rgba(8, 10, 14, 0.5)';
    c.fillRect(0, H - 11, W, 11);

    c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';

    // Tres voltas cobrem as bordas quando o rumo esta' perto de 0 ou 360.
    for (let turn = -1; turn <= 1; turn++) {
      for (let deg = 0; deg < 360; deg += 15) {
        const abs = deg + turn * 360;
        const x = W / 2 + (abs - bearing) * (pxPerDeg / this.dpr);
        if (x < -30 || x > W + 30) continue;

        const cardinal = CARDINALS.find(([d]) => d === deg);
        const fade = 1 - Math.abs(x - W / 2) / (W / 2);
        const alpha = Math.max(0.15, fade);

        if (cardinal) {
          c.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          c.fillText(cardinal[1], x, H - 14);
          c.fillRect(x - 0.5, H - 11, 1, 8);
        } else {
          c.fillStyle = `rgba(255, 255, 255, ${alpha * 0.45})`;
          c.fillRect(x - 0.5, H - 9, 1, 5);
        }
      }
    }

    // risco do rumo atual
    c.fillStyle = '#ff9d2e';
    c.beginPath();
    c.moveTo(W / 2 - 5, H - 13);
    c.lineTo(W / 2 + 5, H - 13);
    c.lineTo(W / 2, H - 6);
    c.closePath();
    c.fill();
    c.restore();
  }

  onResize(): void {
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.applySize();
  }
}
