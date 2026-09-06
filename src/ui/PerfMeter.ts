/**
 * Medidor de desempenho, ligado no F3.
 *
 * Existe porque "parece uns 10 fps" nao da' pra otimizar: sem numero, mexer em
 * qualidade grafica e' chute. E as tres linhas dizem COISAS DIFERENTES —
 *
 * - fps e pior frame: o sintoma;
 * - desenhos e triangulos: se o gargalo e' a quantidade de coisas na cena;
 * - pixels: se o gargalo e' o tamanho da imagem (custo por pixel).
 *
 * Quando desenhos e triangulos estao baixos e mesmo assim o fps esta' ruim, o
 * problema e' por pixel — resolucao, luzes, sombra — e nao adianta simplificar
 * o cenario.
 */
export class PerfMeter {
  private el: HTMLElement;
  private frames = 0;
  private acc = 0;
  private pior = 0;
  visivel = false;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  toggle(): void {
    this.visivel = !this.visivel;
    this.el.classList.toggle('hidden', !this.visivel);
  }

  /**
   * `info` e' o `renderer.info` do three. Atualiza o texto 4x por segundo: a
   * cada frame, o proprio medidor viraria parte do problema.
   */
  sample(dt: number, info: { render: { calls: number; triangles: number } },
         largura: number, altura: number): void {
    if (!this.visivel) return;
    this.frames++;
    this.acc += dt;
    this.pior = Math.max(this.pior, dt);
    if (this.acc < 0.25) return;

    const fps = this.frames / this.acc;
    const px = (largura * altura) / 1e6;
    this.el.textContent =
      `${fps.toFixed(0)} fps   pior ${(this.pior * 1000).toFixed(0)} ms\n` +
      `${info.render.calls} desenhos   ${info.render.triangles} triangulos\n` +
      `${largura}x${altura}   ${px.toFixed(1)} M pixels`;
    this.frames = 0;
    this.acc = 0;
    this.pior = 0;
  }
}
