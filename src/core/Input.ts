/**
 * Teclado + mouse + pointer lock.
 * O jogo so' le' estado daqui; nada de listeners espalhados pelo codigo.
 *
 * Nem todo contexto deixa capturar o mouse — um iframe sem `allow="pointer-lock"`
 * recusa o pedido. Quando isso acontece entramos no modo `fallback`: o mouse
 * continua girando a camera enquanto o ponteiro estiver sobre a pagina, e as
 * setas do teclado viram uma alternativa completa de mira.
 *
 * Sem lock o cursor para na borda da janela e o movimento relativo zera — a
 * camera trava e voce nao consegue dar meia-volta. Por isso rastreamos tambem a
 * POSICAO do ponteiro (`pointerNX`/`pointerNY`): quem cuida do giro continuo
 * perto da borda e' o Player, com base nesses valores.
 */
export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();

  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;

  private buttons = new Set<number>();
  private buttonsPressed = new Set<number>();

  locked = false;
  /** Sem pointer lock disponivel: mira pelo movimento do mouse solto + setas. */
  fallback = false;
  /** Posicao do ponteiro em [-1, 1] a partir do centro da janela. */
  pointerNX = 0;
  pointerNY = 0;
  /** O ponteiro esta' sobre a janela? (fora dela nao ha' giro de borda) */
  pointerInside = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onFallback: (() => void) | null = null;

  /** O jogo aceita entrada de mouse? */
  get active(): boolean { return this.locked || this.fallback; }

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mouseleave', this.onMouseLeave);
    document.addEventListener('mouseenter', this.onMouseEnter);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    // Sem menu de contexto: botao direito e' mirar.
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    // Nao roubar atalhos do navegador (Ctrl+R, Cmd+T...).
    if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') return;
    if (e.metaKey) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    this.releasedThisFrame.add(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    // A posicao vale mesmo sem o jogo ativo: e' o que alimenta o giro de borda
    // assim que a partida comeca.
    const w = window.innerWidth, h = window.innerHeight;
    this.pointerNX = w > 0 ? (e.clientX / w) * 2 - 1 : 0;
    this.pointerNY = h > 0 ? (e.clientY / h) * 2 - 1 : 0;
    this.pointerInside = true;

    if (!this.active) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.active) return;
    this.buttons.add(e.button);
    this.buttonsPressed.add(e.button);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.active) return;
    this.wheelDelta += e.deltaY;
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.buttons.clear();
    this.pointerInside = false;
  };

  private onMouseLeave = (): void => { this.pointerInside = false; };
  private onMouseEnter = (): void => { this.pointerInside = true; };

  private onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
    this.onLockChange?.(this.locked);
  };

  private onPointerLockError = (): void => {
    this.enterFallback();
  };

  private enterFallback(): void {
    if (this.fallback) return;
    this.fallback = true;
    this.onFallback?.();
  }

  requestLock(): void {
    if (this.locked) return;
    if (this.fallback) return;

    // requestPointerLock devolve Promise nos navegadores atuais e undefined nos
    // antigos; os dois caminhos precisam cair no fallback quando falham.
    let result: unknown;
    try {
      result = this.canvas.requestPointerLock();
    } catch {
      this.enterFallback();
      return;
    }
    if (result instanceof Promise) {
      result.catch(() => this.enterFallback());
    } else {
      // Sem Promise nao ha' erro pra capturar: damos um tempo e checamos.
      window.setTimeout(() => {
        if (!this.locked) this.enterFallback();
      }, 400);
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean { return this.keys.has(code); }
  wasPressed(code: string): boolean { return this.pressedThisFrame.has(code); }
  isMouseDown(button: number): boolean { return this.buttons.has(button); }
  wasMousePressed(button: number): boolean { return this.buttonsPressed.has(button); }

  /** Chamar no fim de cada frame: zera os deltas e os eventos de "aconteceu agora". */
  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.buttonsPressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mouseleave', this.onMouseLeave);
    document.removeEventListener('mouseenter', this.onMouseEnter);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
  }
}
