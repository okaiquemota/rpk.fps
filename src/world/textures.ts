import * as THREE from 'three';

/**
 * Texturas desenhadas em canvas — nada de baixar imagem.
 *
 * A paleta e' de patio industrial ao sol: concreto quente, ferrugem, tinta
 * desbotada. A versao anterior era toda azul-acinzentada e sem detalhe de
 * superficie, e o resultado lia como galpao vazio, nao como mapa.
 *
 * O que faz uma superficie parecer construida, e nao um bloco pintado:
 * JUNTA (onde uma peca encosta na outra), DESGASTE saindo da junta pra baixo,
 * e uma quebra de escala — ripa, nervura, rebite. Ruido sozinho nao resolve:
 * de longe ele vira cinza chapado.
 */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponivel');
  return [c, ctx];
}

function finish(canvas: HTMLCanvasElement, repeat: number, repeatY = repeat): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Poeira e manchas em cinza. Mancha colorida briga com a luz do sol. */
function grime(ctx: CanvasRenderingContext2D, size: number, n: number, max: number): void {
  for (let i = 0; i < n; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * max})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 3 + Math.random() * (size / 7), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Escorrido de ferrugem: sai de uma junta e desce, afinando. */
function rustStreak(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, w: number): void {
  const g = ctx.createLinearGradient(0, y, 0, y + len);
  g.addColorStop(0, 'rgba(120, 62, 28, 0.5)');
  g.addColorStop(0.4, 'rgba(120, 62, 28, 0.22)');
  g.addColorStop(1, 'rgba(120, 62, 28, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w * 0.35, y + len);
  ctx.lineTo(x - w * 0.35, y + len);
  ctx.closePath();
  ctx.fill();
}

/** Laje de concreto do patio: junta funda, brita e manchas de oleo. */
export function floorTexture(): THREE.Texture {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = '#6f675a';
  ctx.fillRect(0, 0, S, S);

  // Brita: pontinho claro e escuro em densidade alta. E' o que impede o chao
  // de virar um plano chapado quando o sol bate de frente.
  for (let i = 0; i < 5000; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.09})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  grime(ctx, S, 90, 0.05);

  // Manchas de oleo, escuras e quentes.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(38, 28, 18, ${0.05 + Math.random() * 0.09})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * S, Math.random() * S, 12 + Math.random() * 28,
      8 + Math.random() * 20, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Junta da laje: sombra funda de um lado, quina iluminada do outro. Um
  // traco so' le' como risco desenhado; dois leem como duas pecas encostadas.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(3.5, 3.5, S - 7, S - 7);

  return finish(canvas, 22);
}

/**
 * UM painel de concreto pre-moldado — as paredes externas.
 *
 * A textura desenha um painel so', e quem posiciona os painels e' o
 * `scaleBoxUVs` do muro: assim a junta cai a cada 4.5 m de verdade, em vez de
 * "sete vezes por parede, seja qual for o tamanho da parede". A versao anterior
 * repetia 7x nos dois eixos, o que dava uma faixa horizontal a cada 1.3 m — de
 * longe o muro lia como tapume de madeira, nao como concreto.
 *
 * Ferrugem aqui e' de proposito discreta: e' a marca mais reconhecivel de uma
 * textura, e repetida catorze vezes ao longo do muro denuncia a repeticao mais
 * do que qualquer outra coisa.
 */
export function wallTexture(): THREE.Texture {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = '#8a8175';
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 2600; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // Mancha grande e' o que mais denuncia a repeticao: a mesma bolha reaparecendo
  // em catorze painels le' como padrao. Aqui ela entra fraca, so' pra tirar o
  // chapado; o grao fino acima faz o resto.
  grime(ctx, S, 22, 0.022);

  // Sujeira acumulada no pe' do painel, onde bate a chuva do chao.
  const pe = ctx.createLinearGradient(0, S, 0, S * 0.62);
  pe.addColorStop(0, 'rgba(48, 40, 30, 0.4)');
  pe.addColorStop(1, 'rgba(48, 40, 30, 0)');
  ctx.fillStyle = pe;
  ctx.fillRect(0, S * 0.62, S, S * 0.38);

  // Junta do painel: sombra na borda de baixo/direita, luz na de cima/esquerda.
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, S - 8, S - 8);

  for (let i = 0; i < 2; i++) {
    rustStreak(ctx, 20 + Math.random() * (S - 40), 4, 14 + Math.random() * 26, 1 + Math.random() * 1.6);
  }

  return finish(canvas, 1);
}

/** Contentor de carga: nervura vertical, travessas e ferrugem. */
export function containerTexture(tint: string): THREE.Texture {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);

  // Nervura: a marca registrada do contentor. Claro e escuro alternados leem
  // como chapa dobrada mesmo sem mapa de normal.
  for (let x = 0; x < S; x += 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(x, 0, 4, S);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 4, 0, 2, S);
  }

  // Travessas de cima e de baixo, onde o contentor e' empilhado.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, S, 12);
  ctx.fillRect(0, S - 12, S, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 12, S, 2);
  ctx.fillRect(0, S - 14, S, 2);

  for (let i = 0; i < 5; i++) {
    rustStreak(ctx, Math.random() * S, 12 + Math.random() * 20, 20 + Math.random() * 45, 1.5 + Math.random() * 3);
  }
  grime(ctx, S, 40, 0.07);

  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, S, S);

  return finish(canvas, 1);
}

/** Engradado de madeira: ripa horizontal, travessa em diagonal e cantoneira. */
export function crateTexture(tint: string): THREE.Texture {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);

  // Ripas, cada uma com o proprio tom: madeira nunca vem toda igual.
  for (let y = 0; y < S; y += 21) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(0, y, S, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, y + 19, S, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, y + 21, S, 1);
  }

  // Veio: risco longo e fraco no sentido da ripa.
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    ctx.lineWidth = 1;
    const y = Math.random() * S;
    ctx.beginPath();
    ctx.moveTo(Math.random() * S, y);
    ctx.lineTo(Math.random() * S, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }

  // Travessa diagonal e cantoneira — o que faz ler "engradado", nao "tabua".
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(6, S - 6); ctx.lineTo(S - 6, 6); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(6, S - 8); ctx.lineTo(S - 8, 6); ctx.stroke();

  grime(ctx, S, 30, 0.06);

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, S - 18, S - 18);

  return finish(canvas, 1);
}

/** Chapa de aco pintada, com rebite — nucleo e plataformas. */
export function steelTexture(tint: string): THREE.Texture {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 500; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, Math.random() * 7, Math.random() * 7);
  }

  // Rebites na borda da chapa.
  for (let i = 14; i < S; i += 20) {
    for (const [x, y] of [[i, 9], [i, S - 9], [9, i], [S - 9, i]] as const) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.arc(x, y + 1, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  for (let i = 0; i < 4; i++) {
    rustStreak(ctx, Math.random() * S, Math.random() * 24, 18 + Math.random() * 40, 1.5 + Math.random() * 2.5);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, S, S);

  return finish(canvas, 1);
}

/**
 * Escala as UVs de uma caixa pra textura ter o MESMO tamanho em metros em
 * qualquer bloco.
 *
 * Sem isto, um bloco de 10 m e um de 2 m mostram uma repeticao cada, e a ripa
 * do engradado grande fica cinco vezes maior que a do pequeno — e' o que fazia
 * tudo ler como bloco pintado em vez de objeto. As seis faces da BoxGeometry
 * vem na ordem +X, -X, +Y, -Y, +Z, -Z, e cada uma quer o par de dimensoes que
 * de fato aparece nela.
 */
export function scaleBoxUVs(geo: THREE.BufferGeometry, w: number, h: number, d: number, unit: number): void {
  const uv = geo.getAttribute('uv');
  const faces: [number, number][] = [
    [d, h], [d, h],   // +X, -X
    [w, d], [w, d],   // +Y, -Y
    [w, h], [w, h],   // +Z, -Z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * (su / unit), uv.getY(i) * (sv / unit));
    }
  }
  uv.needsUpdate = true;
}
