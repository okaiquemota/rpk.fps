import { clamp, randRange } from './math';

/** Posicao no mundo, pros sons que vem de algum lugar. */
import { fetchShotSamples, decodeShotSamples, SHELL_KEY, type RawSamples, type SampleBank } from './ShotSamples';

/**
 * Quanto a amostra de tiro entra mais baixa que o sintetizado.
 *
 * Gravacao de tiro vem normalizada perto de 0 dBFS; o sintetizado sai bem
 * abaixo disso. Sem abaixar, trocar pro som real dobra o volume percebido do
 * jogo inteiro.
 */
const SAMPLE_GAIN = 0.55;

/**
 * A capsula entra mais baixa que o tiro.
 *
 * Numa automatica sai uma por disparo — doze por segundo no fuzil —, e a
 * gravacao dura um segundo inteiro com os quiques. Doze copias sobrepostas no
 * volume do tiro viram um chocalho que cobre o proprio tiroteio.
 */
const SHELL_GAIN = 0.85;

export interface SoundPos { x: number; y: number; z: number; }

export type ShotKind = 'pistol' | 'rifle' | 'shotgun' | 'heavy' | 'sniper';

/**
 * Perfil sonoro de um disparo.
 *
 * Um tiro nao e' um som, sao quatro empilhados: o ESTALO (o transiente agudo,
 * curtissimo, que da o susto), o CORPO (a massa de medio-grave que da o
 * calibre), a CAUDA (o rastro grave que some devagar) e o MECANICO (o ferrolho
 * batendo, alguns milissegundos depois). Mexer so num deles muda a arma sem
 * descaracterizar o conjunto.
 */
interface ShotProfile {
  crackFreq: number;      // centro do estalo, em Hz
  crackTime: number;      // duracao do estalo
  crackGain: number;
  bodyFreq: number;       // centro do corpo
  bodyTime: number;
  bodyGain: number;
  subFreq: number;        // fundamental grave, da o "peso"
  subTime: number;
  subGain: number;
  tailTime: number;       // rastro
  tailGain: number;
  reverb: number;         // quanto vai pro ambiente (0..1)
  drive: number;          // saturacao: quanto mais, mais "estourado"
  mechDelay: number;      // atraso do ferrolho
  mechGain: number;
}

const SHOT_PROFILES: Record<ShotKind, ShotProfile> = {
  pistol: {
    crackFreq: 3600, crackTime: 0.018, crackGain: 1.667,
    bodyFreq: 780, bodyTime: 0.09, bodyGain: 0.459,
    subFreq: 150, subTime: 0.07, subGain: 0.39,
    tailTime: 0.16, tailGain: 0.07,
    reverb: 0.2, drive: 2.4, mechDelay: 0.035, mechGain: 0.1,
  },
  rifle: {
    crackFreq: 4600, crackTime: 0.013, crackGain: 1.812,
    bodyFreq: 950, bodyTime: 0.07, bodyGain: 0.405,
    subFreq: 170, subTime: 0.055, subGain: 0.338,
    tailTime: 0.16, tailGain: 0.07,
    reverb: 0.22, drive: 3, mechDelay: 0.028, mechGain: 0.08,
  },
  shotgun: {
    // Grave e largo: o corpo domina, o estalo e' mais surdo.
    crackFreq: 2100, crackTime: 0.03, crackGain: 1.522,
    bodyFreq: 420, bodyTime: 0.2, bodyGain: 0.702,
    subFreq: 85, subTime: 0.22, subGain: 0.715,
    tailTime: 0.3, tailGain: 0.13,
    reverb: 0.34, drive: 2.2, mechDelay: 0.09, mechGain: 0.16,
  },
  heavy: {
    crackFreq: 3100, crackTime: 0.024, crackGain: 1.885,
    bodyFreq: 560, bodyTime: 0.15, bodyGain: 0.621,
    subFreq: 110, subTime: 0.16, subGain: 0.624,
    tailTime: 0.26, tailGain: 0.11,
    reverb: 0.3, drive: 3.4, mechDelay: 0.05, mechGain: 0.13,
  },
  sniper: {
    // Estalo altissimo e cauda longa: o eco e' metade do som.
    crackFreq: 5200, crackTime: 0.02, crackGain: 2.175,
    bodyFreq: 620, bodyTime: 0.18, bodyGain: 0.594,
    subFreq: 95, subTime: 0.26, subGain: 0.65,
    tailTime: 0.5, tailGain: 0.18,
    reverb: 0.5, drive: 3.8, mechDelay: 0.12, mechGain: 0.18,
  },
};

interface VoiceOptions {
  /** Posicao no mundo. Ausente = som do proprio jogador, sem panning. */
  at?: SoundPos;
  /** Quanto do sinal vai pro ambiente. */
  reverb?: number;
  /** Saturacao. Acima de 1 comeca a comprimir os picos. */
  drive?: number;
  /** Atraso antes de tocar. */
  delay?: number;
}

/**
 * Som 100% procedural (WebAudio) — zero arquivos pra baixar.
 *
 * Tres coisas separam um "bip" de um tiro, e todas estao aqui:
 *  - ATAQUE quase instantaneo (meio milissegundo). Envelope suave vira sopro.
 *  - SATURACAO, que arredonda o pico e da a impressao de volume alem do que o
 *    alto-falante entrega.
 *  - AMBIENTE. O eco da arena e' o que faz o tiro soar grande; sem ele, todo
 *    disparo parece dado dentro de um armario.
 *
 * Os sons que vem do mundo passam por um PannerNode e chegam do lado certo. Os
 * do jogador vao direto: acontecem na sua cabeca.
 */
export class AudioManager {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private shaper: WaveShaperNode | null = null;
  private _volume = 0.7;

  /** Vazio ate' alguem por arquivo em assets/sounds/ — ver ShotSamples.ts. */
  private samples: SampleBank = new Map();
  private rawSamples: RawSamples | null = null;

  /**
   * Precisa ser chamado a partir de um gesto do usuario (clique).
   *
   * `external` existe para os testes: passando um OfflineAudioContext da' pra
   * renderizar os efeitos num buffer e MEDIR o resultado (pico, ataque, cauda)
   * em vez de depender de alguem escutando.
   */
  /**
   * Baixa as amostras opcionais de tiro, se houver alguma.
   *
   * Separado do init de proposito: baixar nao precisa de AudioContext, entao
   * roda na tela de carregamento, enquanto o contexto so' pode nascer de um
   * clique. A decodificacao acontece no init(), e ate' ela terminar os tiros
   * saem sintetizados — nao ha espera nem engasgo, so' um comeco sintetico.
   */
  async preloadShotSamples(): Promise<number> {
    if (this.rawSamples) return this.rawSamples.size;
    this.rawSamples = await fetchShotSamples();
    return this.rawSamples.size;
  }

  init(external?: BaseAudioContext): void {
    if (this.ctx) return;
    let ctx: BaseAudioContext;
    if (external) {
      ctx = external;
    } else {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this._volume;

    // Compressor no fim: rajada de fuzil nao pode saturar a saida.
    const comp = ctx.createDynamicsCompressor();
    // Segura o pico da rajada sem comer o transiente: com ataque lento demais o
    // compressor achatava justamente o estalo, que e' a parte que da o susto.
    comp.threshold.value = -8;
    comp.ratio.value = 4;
    comp.attack.value = 0.0008;
    comp.release.value = 0.12;
    this.master.connect(comp).connect(ctx.destination);

    // Barramento seco.
    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    // Barramento de ambiente: convolucao com uma resposta de impulso gerada.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.buildImpulse(0.5, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    // Corta o grave do eco, senao a cauda embola com o proximo tiro.
    const wetFilter = ctx.createBiquadFilter();
    wetFilter.type = 'highpass';
    wetFilter.frequency.value = 260;

    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(convolver).connect(wetFilter).connect(wet).connect(this.master);

    // Saturador compartilhado, para o que precisar de peso.
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = AudioManager.saturationCurve(2.6);
    this.shaper.oversample = '2x';

    // Ruido branco reaproveitado por todos os efeitos.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // decodeAudioData destaca os bytes: serve uma vez, entao solta a referencia.
    const raw = this.rawSamples;
    this.rawSamples = null;
    if (raw?.size) {
      void decodeShotSamples(ctx, raw).then((bank) => { this.samples = bank; });
    }
  }

  /**
   * Resposta de impulso de uma arena de concreto, gerada na mao: alguns ecos
   * discretos no comeco (as primeiras reflexoes, que dizem o tamanho do lugar)
   * sobre uma cauda de ruido que decai.
   */
  private buildImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * (1 - t) ** decay;
      }
      // Primeiras reflexoes: os dois canais em tempos levemente diferentes,
      // que e' o que faz o ambiente soar largo em vez de centrado.
      const taps = [0.009, 0.017, 0.028, 0.041];
      taps.forEach((tap, k) => {
        const idx = Math.floor((tap + ch * 0.0017) * rate);
        if (idx < len) d[idx] += (0.55 - k * 0.09) * (Math.random() > 0.5 ? 1 : -1);
      });
    }
    return buf;
  }

  /** Curva de saturacao suave (tanh normalizado). */
  private static saturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 2048;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    const k = Math.tanh(amount);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * amount) / k;
    }
    return curve;
  }

  private get live(): AudioContext | null {
    const c = this.ctx as AudioContext | null;
    return c && typeof c.resume === 'function' && 'suspend' in c ? c : null;
  }

  resume(): void { void this.live?.resume(); }
  suspend(): void { void this.live?.suspend(); }

  get volume(): number { return this._volume; }
  set volume(v: number) {
    this._volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this._volume;
  }

  private now(): number { return this.ctx?.currentTime ?? 0; }

  /** Onde estao os ouvidos do jogador. Chamado uma vez por frame. */
  setListener(pos: SoundPos, forward: SoundPos, up: SoundPos): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.now();
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t);
      l.upY.setValueAtTime(up.y, t);
      l.upZ.setValueAtTime(up.z, t);
    } else {
      const legacy = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition?.(pos.x, pos.y, pos.z);
      legacy.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /**
   * Monta o fim da cadeia: panning (se o som tem lugar no mundo) e as duas
   * saidas, seca e de ambiente. Devolve o no' onde a voz deve se conectar.
   */
  private output(opts: VoiceOptions): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.dry || !this.reverbSend) return null;

    const entry = ctx.createGain();
    let node: AudioNode = entry;

    if (opts.drive && opts.drive > 0) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = AudioManager.saturationCurve(opts.drive);
      shaper.oversample = '2x';
      node.connect(shaper);
      node = shaper;
    }

    if (opts.at) {
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 5;
      panner.maxDistance = 120;
      panner.rolloffFactor = 1.15;
      if (panner.positionX) {
        const t = this.now();
        panner.positionX.setValueAtTime(opts.at.x, t);
        panner.positionY.setValueAtTime(opts.at.y, t);
        panner.positionZ.setValueAtTime(opts.at.z, t);
      } else {
        (panner as unknown as { setPosition(x: number, y: number, z: number): void })
          .setPosition?.(opts.at.x, opts.at.y, opts.at.z);
      }
      node.connect(panner);
      node = panner;
    }

    node.connect(this.dry);
    if (opts.reverb && opts.reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = opts.reverb;
      node.connect(send).connect(this.reverbSend);
    }
    return entry;
  }

  /**
   * Rajada de ruido filtrado com envelope percussivo.
   * O ataque de meio milissegundo e' o que separa "estalo" de "sopro".
   */
  private burst(
    duration: number, gain: number, filterType: BiquadFilterType, freq: number,
    q: number, opts: VoiceOptions = {},
  ): void {
    const ctx = this.ctx;
    const dest = this.output(opts);
    if (!ctx || !dest || !this.noiseBuffer) return;

    const t = this.now() + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    // Entra num ponto aleatorio do ruido: dois tiros seguidos nao sao iguais.
    const offset = Math.random() * (this.noiseBuffer.duration - duration - 0.01);
    src.playbackRate.value = randRange(0.92, 1.08);

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;

    // O filtro vem ANTES do envelope, entao ele ja' comeu parte da energia do
    // ruido branco quando o ganho e' aplicado — e um bandpass estreito come
    // quase tudo. Sem esta compensacao, `gain` nao quer dizer nada: subir o
    // valor cinco vezes mal mexia no volume de saida.
    const compensation = filterType === 'bandpass' ? 2.4 + q * 2.2 : 1.5;
    const peak = gain * compensation;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.0006);
    env.gain.exponentialRampToValueAtTime(Math.max(peak * 0.0008, 0.00001), t + duration);

    src.connect(filter).connect(env).connect(dest);
    src.start(t, Math.max(0, offset));
    src.stop(t + duration + 0.02);
  }

  /** Oscilador com envelope percussivo, para as partes com altura definida. */
  private blip(
    freqStart: number, freqEnd: number, duration: number, gain: number,
    type: OscillatorType = 'sine', opts: VoiceOptions = {},
  ): void {
    const ctx = this.ctx;
    const dest = this.output(opts);
    if (!ctx || !dest) return;

    const t = this.now() + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.001);
    env.gain.exponentialRampToValueAtTime(Math.max(gain * 0.0008, 0.00001), t + duration);

    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // ================= efeitos do jogo =================

  /** Disparo do jogador: as quatro camadas do perfil da arma. */
  /**
   * `sample` e' o id da arma; havendo gravacao pra ele em assets/sounds/, ela
   * toca no lugar das cinco camadas sintetizadas. Sem arquivo, nada muda.
   */
  shot(kind: ShotKind, at?: SoundPos, sample?: string): void {
    const p = SHOT_PROFILES[kind];
    const takes = sample ? this.samples.get(sample) : undefined;
    if (takes) {
      // 35% do envio do sintetizado: a gravacao ja' traz a sala dela.
      this.playSample(takes, p.reverb * 0.35, SAMPLE_GAIN, at);
      return;
    }
    const v = randRange(0.94, 1.06); // variacao por tiro
    const base: VoiceOptions = { at, reverb: p.reverb, drive: p.drive };

    // 1. estalo
    this.burst(p.crackTime, p.crackGain, 'bandpass', p.crackFreq * v, 0.55, base);
    // 2. corpo
    this.burst(p.bodyTime, p.bodyGain, 'bandpass', p.bodyFreq * v, 0.9, base);
    // 3. fundamental grave
    this.blip(p.subFreq * v, p.subFreq * 0.35, p.subTime, p.subGain, 'triangle', base);
    // 4. rastro no ambiente
    this.burst(p.tailTime, p.tailGain, 'lowpass', 420, 0.5, { at, reverb: Math.min(1, p.reverb * 1.4) });
    // 5. ferrolho
    this.burst(0.03, p.mechGain, 'bandpass', randRange(2400, 3400), 2.2, { at, delay: p.mechDelay });
  }

  /**
   * Toca uma gravacao pela MESMA cadeia do som sintetizado — panner e envio de
   * ambiente. E' o que faz o tiro gravado pertencer a` arena em vez de soar
   * como um aviso de interface colado por cima.
   */
  private playSample(takes: AudioBuffer[], reverb: number, ganho: number, at?: SoundPos): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // A sala ja' vem gravada na amostra: mandar o mesmo envio do sintetizado
    // empilha ambiente em cima de ambiente. E nada de saturacao — a gravacao
    // ja' tem a dela.
    const out = this.output({ at, reverb });
    if (!out) return;

    const src = ctx.createBufferSource();
    src.buffer = takes[Math.floor(Math.random() * takes.length)];
    // Sem isto, doze disparos por segundo da mesma amostra viram zumbido.
    src.playbackRate.value = randRange(0.96, 1.04);
    const gain = ctx.createGain();
    gain.gain.value = ganho;
    src.connect(gain).connect(out);
    src.start(this.now());
  }

  dryFire(): void {
    this.burst(0.022, 0.16, 'bandpass', randRange(2600, 3400), 3, { drive: 1.6 });
    this.blip(1400, 700, 0.02, 0.06, 'square');
  }

  /**
   * Recarga em tres tempos, como a de verdade: o pente saindo, o pente
   * entrando e o ferrolho armando.
   */
  reload(stage: 'out' | 'in'): void {
    if (stage === 'out') {
      this.burst(0.035, 0.2, 'bandpass', 1500, 2.4, { drive: 1.5, reverb: 0.12 });
      this.blip(420, 240, 0.05, 0.11, 'square');
    } else {
      this.burst(0.045, 0.26, 'bandpass', 900, 1.8, { drive: 1.8, reverb: 0.14 });
      this.blip(300, 170, 0.06, 0.14, 'square');
      // ferrolho armando, logo depois do pente encaixar
      this.burst(0.04, 0.22, 'highpass', 2800, 1.6, { delay: 0.13, drive: 1.6, reverb: 0.12 });
      this.burst(0.05, 0.18, 'bandpass', 1200, 2, { delay: 0.19, drive: 1.4 });
    }
  }

  weaponSwitch(): void {
    this.burst(0.04, 0.16, 'bandpass', 1800, 2, { drive: 1.4 });
    this.burst(0.05, 0.12, 'bandpass', 950, 1.6, { delay: 0.08 });
  }

  /** Bala batendo em superficie dura. */
  impact(at?: SoundPos): void {
    this.burst(0.03, 0.55, 'bandpass', randRange(2400, 3800), 0.9, { at, reverb: 0.18, drive: 2 });
    this.burst(0.08, 0.2, 'bandpass', randRange(700, 1200), 1.4, { at, reverb: 0.16 });
    // estilhaco ricocheteando
    if (Math.random() < 0.4) {
      this.blip(randRange(2400, 4200), randRange(600, 1100), 0.14, 0.09, 'sine',
        { at, delay: 0.02, reverb: 0.3 });
    }
  }

  shellDrop(): void {
    const takes = this.samples.get(SHELL_KEY);
    if (takes) {
      this.playSample(takes, 0.08, SHELL_GAIN);
      return;
    }
    this.blip(randRange(2600, 3600), randRange(1500, 2100), 0.05, 0.11, 'triangle', { reverb: 0.22 });
    this.burst(0.035, 0.09, 'bandpass', 4200, 1.6, { reverb: 0.18 });
  }

  hitFlesh(head: boolean, at?: SoundPos): void {
    this.burst(head ? 0.07 : 0.05, head ? 0.34 : 0.22, 'lowpass', head ? 800 : 560, 1,
      { at, drive: 2, reverb: 0.15 });
    if (head) this.blip(900, 260, 0.09, 0.2, 'triangle', { at, reverb: 0.2 });
  }

  /** Confirmacao de acerto: seca e sem ambiente, e' informacao de UI. */
  hitmarker(head: boolean): void {
    this.blip(head ? 1750 : 1250, head ? 1500 : 1150, 0.03, head ? 0.15 : 0.1, 'square');
  }

  enemyDeath(at?: SoundPos): void {
    this.blip(240, 55, 0.45, 0.22, 'sawtooth', { at, reverb: 0.4, drive: 1.6 });
    this.burst(0.35, 0.16, 'lowpass', 620, 0.8, { at, reverb: 0.45 });
  }

  enemyAlert(at?: SoundPos): void {
    this.blip(170, 380, 0.24, 0.13, 'sawtooth', { at, reverb: 0.35, drive: 1.5 });
  }

  /** Tiro de inimigo: mesma engine, mais abafado e com mais ambiente. */
  enemyShot(at?: SoundPos): void {
    this.burst(0.016, 0.4, 'highpass', randRange(2600, 3400), 0.7, { at, reverb: 0.5, drive: 2.2 });
    this.burst(0.09, 0.3, 'bandpass', randRange(600, 900), 1, { at, reverb: 0.45 });
    this.blip(140, 60, 0.07, 0.2, 'triangle', { at, reverb: 0.4 });
  }

  playerHurt(): void {
    this.burst(0.12, 0.26, 'lowpass', 420, 0.8, { drive: 2.2 });
    this.blip(190, 80, 0.22, 0.24, 'sawtooth', { drive: 1.5 });
  }

  playerDeath(): void {
    this.blip(280, 38, 1.3, 0.36, 'sawtooth', { reverb: 0.6, drive: 1.6 });
    this.burst(1.1, 0.2, 'lowpass', 300, 0.6, { reverb: 0.7 });
  }

  jump(): void { this.burst(0.045, 0.22, 'bandpass', 1700, 1.1); }

  land(force: number): void {
    const g = clamp(force * 0.02, 0.05, 0.3);
    this.burst(0.09, g, 'lowpass', 420, 0.7, { drive: 1.6, reverb: 0.2 });
    this.blip(110, 55, 0.1, g * 0.6, 'sine');
  }

  footstep(): void {
    this.burst(0.055, randRange(0.3, 0.45), 'bandpass', randRange(500, 1100), 1.2, { reverb: 0.14 });
    this.burst(0.03, randRange(0.12, 0.2), 'bandpass', 3200, 1.4, { reverb: 0.1 });
  }

  pickup(kind: 'health' | 'ammo'): void {
    if (kind === 'health') {
      this.blip(640, 960, 0.09, 0.2, 'sine', { reverb: 0.2 });
      this.blip(960, 1280, 0.11, 0.14, 'sine', { delay: 0.07, reverb: 0.2 });
    } else {
      this.blip(420, 660, 0.07, 0.18, 'square', { reverb: 0.18 });
      this.burst(0.04, 0.08, 'bandpass', 1800, 2, { delay: 0.03 });
    }
  }

  enemyStep(at: SoundPos): void {
    this.burst(0.06, randRange(0.34, 0.5), 'bandpass', randRange(320, 720), 1.2,
      { at, reverb: 0.2 });
  }

  waveStart(): void {
    this.blip(170, 170, 0.5, 0.2, 'sawtooth', { reverb: 0.45, drive: 1.4 });
    this.blip(228, 228, 0.5, 0.17, 'sawtooth', { delay: 0.16, reverb: 0.45 });
    this.blip(304, 304, 0.7, 0.19, 'sawtooth', { delay: 0.32, reverb: 0.5 });
  }

  waveClear(): void {
    this.blip(523, 523, 0.15, 0.18, 'triangle', { reverb: 0.4 });
    this.blip(659, 659, 0.15, 0.18, 'triangle', { delay: 0.13, reverb: 0.4 });
    this.blip(880, 880, 0.45, 0.22, 'triangle', { delay: 0.26, reverb: 0.55 });
  }
}
