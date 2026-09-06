import * as THREE from 'three';

/**
 * Toca as animacoes que vem dentro do .glb da arma.
 *
 * O modelo do fuzil traz nove clipes prontos — idle, andar, correr, sacar,
 * recarregar, atirar. Eles sao MUITO melhores que o equivalente procedural: a
 * recarga do jogo era a arma inteira descendo e girando pra fora, enquanto o
 * clipe tira o pente, bate o novo e puxa o ferrolho.
 *
 * Tres camadas, porque os clipes nao servem todos pro mesmo tipo de coisa:
 *
 * - **base, em laco** — idle, andar e correr. Sao poses de corpo inteiro que se
 *   excluem, entao trocam por crossfade;
 * - **disparo unico que assume a base** — sacar e recarregar. Enquanto rodam, a
 *   base sai de cena; no fim, volta;
 * - **aditivo** — atirar. Este NAO pode substituir a base: o ferrolho tem que
 *   cycle enquanto a arma continua no idle ou no passo. Somado por cima, ele
 *   convive; substituindo, cortaria a animacao de baixo a cada tiro.
 *
 * A duracao nunca e' a do arquivo. Quem manda e' o jogo: uma recarga de 1.75 s
 * em `WEAPON_DEFS` com um clipe de 2.67 s daria uma arma pronta pra atirar
 * enquanto a mao ainda encaixa o pente na tela. Cada clipe entra com a
 * velocidade ajustada pro tempo real da acao.
 */

export type ClipeBase = 'idle' | 'walk' | 'run';
export type ClipeUnico = 'draw' | 'reload';

/** Acima disto anda; acima do segundo, corre. Fracao da velocidade maxima. */
const ANDANDO = 0.12;
const CORRENDO = 0.72;
/** Tempo de crossfade entre poses de base. */
const FADE = 0.22;
/**
 * Crossfade de VOLTA, quando sacar ou recarregar termina. Curto de proposito.
 *
 * Com os 0.22 s do fade normal aparecia um piscar do pente: no quadro em que o
 * clipe acaba, o pente sobressalente — que a animacao acabou de encaixar — e'
 * escondido, enquanto a base ainda leva 0.22 s trazendo o pente ORIGINAL de
 * volta pro lugar. No meio disso nao ha' pente nenhum, e o que se ve' e' ele
 * sumindo e voltando.
 *
 * Encurtar o fade nao resolve, so' encurta o buraco (medido: 0.05 s de fade =
 * 5 quadros sem pente). Manter o sobressalente visivel durante o fade tambem
 * nao, porque ele sai voando junto. O que fecha e' nao ter fade: no quadro
 * seguinte a base ja' manda sozinha, o pente original esta' no lugar e o
 * sobressalente sai de cena no mesmo instante.
 *
 * O salto de pose que isso poderia causar nao acontece porque o clipe de
 * recarga termina praticamente na pose de repouso — medido abaixo.
 */
const FADE_VOLTA = 0;

export class WeaponAnimator {
  private mixer: THREE.AnimationMixer;
  private acoes = new Map<string, THREE.AnimationAction>();
  private base: THREE.AnimationAction | null = null;
  private baseAtual: ClipeBase | null = null;
  /** Nao-nulo enquanto sacar ou recarregar esta' no ar. */
  private unico: THREE.AnimationAction | null = null;
  private atirar: THREE.AnimationAction | null = null;

  constructor(raiz: THREE.Object3D, clipes: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(raiz);

    // Os nomes vem prefixados pelo armature ("Armature.003|reload"), e nem todo
    // pacote usa o mesmo prefixo — casar pelo fim do nome e' o que sobrevive a
    // troca de modelo.
    const achar = (re: RegExp) => clipes.find((c) => re.test(c.name));
    const registrar = (chave: string, clipe?: THREE.AnimationClip) => {
      if (!clipe) return;
      const a = this.mixer.clipAction(clipe);
      this.acoes.set(chave, a);
    };

    const idle = achar(/idle$/i);
    registrar('idle', idle);
    registrar('walk', achar(/walk$/i));
    registrar('run', achar(/run(\s*cycle)?$/i));
    registrar('draw', achar(/draw$/i));
    registrar('reload', achar(/reload$/i));

    for (const chave of ['draw', 'reload'] as const) {
      const a = this.acoes.get(chave);
      if (!a) continue;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }

    // Atirar vira ADITIVO: o clipe passa a descrever a DIFERENCA em relacao a`
    // propria pose de repouso dele, e nao uma pose completa. Sem isso, cada
    // tiro apagaria a animacao de base por um quarto de segundo.
    //
    // A referencia e' o PROPRIO clipe no quadro 0 — nao o `idle`. Passar o
    // `idle` parece mais certo e nao e': `makeClipAdditive` casa trilha por
    // NOME, e o idle deste modelo nao tem trilha de posicao pro osso do
    // ferrolho, so' de rotacao. Sem referencia pra subtrair, aquela posicao
    // continuava absoluta e a camada aditiva somava ela por cima da base — o
    // ferrolho saia voando pra exatamente o DOBRO da distancia do corpo
    // (medido: 0.1014 parado, 0.2027 atirando). Um pedaco de metal boiando ao
    // lado da arma a cada tiro.
    const tiro = achar(/shoot(ing)?$/i);
    if (tiro) {
      const copia = tiro.clone();
      THREE.AnimationUtils.makeClipAdditive(copia);
      this.atirar = this.mixer.clipAction(copia);
      this.atirar.blendMode = THREE.AdditiveAnimationBlendMode;
      this.atirar.setLoop(THREE.LoopOnce, 1);
      this.atirar.clampWhenFinished = false;
    }

    this.mixer.addEventListener('finished', (e) => {
      const acao = (e as unknown as { action: THREE.AnimationAction }).action;
      if (acao !== this.unico) return;
      // Terminou de sacar ou recarregar: a base volta de onde parou.
      this.unico = null;
      if (this.base) {
        acao.crossFadeTo(this.base.reset().play(), FADE_VOLTA, false);
        this.base.setEffectiveWeight(1);
      }
    });

    if (this.acoes.has('idle')) this.trocarBase('idle', 0);
  }

  /**
   * Verdadeiro enquanto o clipe de recarga esta' no ar.
   *
   * Quem pergunta e' o ViewModel, pra deixar o pente avulso aparecer: ele fica
   * escondido o tempo todo, menos no unico momento em que faz sentido.
   */
  get recarregando(): boolean {
    return this.unico !== null && this.unico === this.acoes.get('reload');
  }

  /** Existe clipe pra isso? Quem nao tem cai no movimento procedural. */
  has(chave: ClipeBase | ClipeUnico | 'shoot'): boolean {
    return chave === 'shoot' ? !!this.atirar : this.acoes.has(chave);
  }

  update(dt: number, moveSpeed01: number, grounded: boolean): void {
    // Enquanto saca ou recarrega, a base nao muda: trocar de idle pra andar no
    // meio de uma recarga corta a recarga.
    if (!this.unico) {
      const alvo: ClipeBase = !grounded || moveSpeed01 < ANDANDO ? 'idle'
        : moveSpeed01 < CORRENDO ? 'walk' : 'run';
      if (alvo !== this.baseAtual) this.trocarBase(alvo, FADE);
    }
    this.mixer.update(dt);
  }

  /** Saca a arma. `duracao` vem do jogo, nao do arquivo. */
  draw(duracao: number): void {
    this.dispararUnico('draw', duracao);
  }

  reload(duracao: number): void {
    this.dispararUnico('reload', duracao);
  }

  /**
   * Um tiro. `intervalo` e' o tempo ate' o proximo, pra rajada encadear em vez
   * de cada tiro cortar o anterior pela metade.
   */
  shoot(intervalo: number): void {
    const a = this.atirar;
    if (!a) return;
    a.stop();
    a.setEffectiveTimeScale(this.velocidade(a, intervalo));
    a.setEffectiveWeight(1);
    a.play();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
  }

  // ------------------------------------------------------------------

  private trocarBase(chave: ClipeBase, fade: number): void {
    // Sem o clipe pedido (nem toda arma tem "correr"), fica no que ja' esta'.
    const nova = this.acoes.get(chave);
    if (!nova) return;
    this.baseAtual = chave;
    nova.enabled = true;
    nova.setEffectiveTimeScale(1);
    nova.setEffectiveWeight(1);
    if (this.base && this.base !== nova) {
      nova.reset().play();
      this.base.crossFadeTo(nova, fade, false);
    } else {
      nova.play();
    }
    this.base = nova;
  }

  private dispararUnico(chave: ClipeUnico, duracao: number): void {
    const a = this.acoes.get(chave);
    if (!a) return;
    a.reset();
    a.setEffectiveTimeScale(this.velocidade(a, duracao));
    a.setEffectiveWeight(1);
    a.play();
    // A base sai de cena por baixo; ela volta no evento `finished`.
    if (this.base) this.base.crossFadeTo(a, Math.min(FADE, duracao * 0.25), false);
    this.unico = a;
  }

  /** Fator de velocidade pra um clipe caber no tempo que o jogo reservou. */
  private velocidade(a: THREE.AnimationAction, duracao: number): number {
    const d = a.getClip().duration;
    return duracao > 0 && d > 0 ? d / duracao : 1;
  }
}
