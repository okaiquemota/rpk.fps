import type { WeaponId } from '../weapons/WeaponDefs';

const W = 132;
const H = 44;
/** O icone e' desenhado em 3x e reduzido pelo CSS: no HUD ele ocupa 118px. */
const SCALE = 3;

/**
 * Silhuetas de arma desenhadas em canvas e guardadas como data URL.
 *
 * Sao o que da' identidade ao killfeed e ao painel de municao — ler "abateu com
 * escopeta" pelo formato e' instantaneo, ler pelo nome nao e'. Como o resto do
 * projeto, saem de codigo: nenhum sprite pra baixar, e o icone existe mesmo
 * quando o .glb da arma nao existe.
 *
 * Os contornos abaixo foram TRACADOS dos proprios modelos, nao desenhados no
 * olho: `scratchpad/traceIcons.html` renderiza cada .glb de lado em silhueta
 * chapada, segue a fronteira dos pixels e simplifica o resultado. Por isso o
 * fuzil parece um AK e o sniper tem o buraco da coronha — o icone e' a arma que
 * o jogador tem na mao. Pra regerar depois de trocar um modelo, abra aquela
 * pagina no `npm run dev` e cole a saida aqui.
 *
 * Cada arma e' uma lista de lacos fechados em coordenadas de `W x H`: o
 * primeiro e' o contorno de fora, os demais sao vazados (guarda-mato, buraco da
 * coronha). Quem separa um do outro e' o preenchimento `evenodd`.
 */
const SHAPES: Record<WeaponId, number[][]> = {
  pistol: [
    // contorno
    [
      92.3, 6.5, 91, 15.1, 75.1, 15.5, 70.8, 18.2, 70.1, 23.1,
      66.3, 24.5, 56, 24.9, 53.3, 40, 40.1, 38.2, 40.5, 31.4, 44.9, 19.3,
      43.8, 17.3, 39.7, 15.1, 42.5, 13.1, 43.9, 9.9, 43.7, 6.3, 50, 5.5,
      87.4, 6.5, 89.5, 4,
    ],
    // vazado
    [
      56.9, 21.7, 59.9, 23.9, 66.3, 24, 68.4, 23, 69.6, 19.4, 67.6, 16.4,
      63.4, 16.4, 62.9, 19.7, 65.5, 23.1, 63, 21.8, 60.4, 16.5,
      58.3, 16.5,
    ],
  ],
  deagle: [
    // contorno
    [
      99, 9.1, 98.9, 13.2, 97.9, 13.2, 97.9, 15.3, 96.5, 15.3,
      95.4, 20.9, 62.6, 20.1, 58.4, 24.2, 47.7, 24, 44.6, 37.7, 36, 37.7,
      33, 33.8, 38.1, 23.7, 38.4, 20.1, 37, 17.2, 34, 17.1, 34.7, 11.1,
      33, 9.1, 34, 8, 36.2, 8.8, 39.4, 6.7, 39.9, 7.7, 49.5, 8.2,
      60, 8.2, 62.1, 7.1, 92.2, 7.7, 93.3, 6.3, 97.9, 7.7,
    ],
    // vazado
    [
      48.3, 21.8, 50.5, 23.2, 57.8, 23.5, 59.8, 22.2, 60.5, 19.3,
      53.9, 19.3, 54.3, 22.8, 52.1, 19.8, 49.5, 19.3,
    ],
  ],
  smg: [
    // contorno
    [
      105.4, 25.4, 101.8, 25.3, 84.3, 16.6, 73.4, 16.6, 72, 17.9,
      72.2, 20.1, 76.2, 29.9, 69.9, 31.8, 66.8, 22, 65.5, 23.2,
      56.7, 23.7, 57, 40, 50.9, 40, 51.1, 23.2, 49.2, 22.9, 49.5, 16.5,
      33.5, 15.7, 33.5, 13.6, 26.6, 13.1, 26.6, 11.2, 32.5, 11.2,
      32.8, 6.8, 36, 4, 38.1, 4.7, 38.1, 6.8, 38.9, 5.6, 40, 6.8,
      41.7, 6.8, 41.7, 5.6, 42.8, 6.8, 44.5, 6.8, 44.5, 5.6, 45.5, 6.8,
      47.3, 6.8, 47.3, 5.6, 48.3, 6.8, 50.1, 6.8, 50.1, 5.6, 51.1, 6.8,
      52.9, 6.8, 52.9, 5.6, 53.8, 6.8, 55.6, 6.8, 55.6, 5.6, 56.6, 6.8,
      58.4, 6.8, 58.4, 5.6, 59.3, 6.8, 61.1, 6.8, 61.1, 5.6, 62.1, 6.8,
      63.9, 6.8, 63.9, 5.6, 64.9, 6.8, 66.7, 6.8, 66.7, 5.6, 67.7, 6.8,
      69.4, 6.8, 69.4, 5.6, 70.5, 6.8, 71.7, 6.8, 71.7, 5.7, 75.2, 5.7,
      76.3, 8.3, 82.3, 11.1, 104.5, 11.4, 105.4, 12.2,
    ],
    // vazado
    [
      94.6, 13.2, 94.6, 20.4, 103.8, 24.1, 103.8, 13.2,
    ],
    // vazado
    [
      84.2, 13.2, 84.3, 15.5, 93.5, 19.9, 93.5, 13.2,
    ],
    // vazado
    [
      58.6, 22.7, 65.3, 22.7, 66.5, 21.4, 64, 18.6, 62.4, 22.2,
      62.1, 18.6, 59.6, 18.6,
    ],
  ],
  rifle: [
    // contorno
    [
      119, 10.9, 119, 12.8, 93, 12.8, 92.1, 14.9, 79.2, 15.1, 76.8, 16.1,
      73.8, 14.7, 66.8, 15.5, 66.9, 19.1, 69.1, 23.6, 75.8, 30.4,
      71.4, 37.7, 62.8, 29.3, 58.5, 18.7, 55.6, 20.4, 50.2, 20.2,
      49.7, 18.8, 48.1, 20.4, 45.6, 27.2, 43.7, 28.5, 40.8, 25.7,
      43, 19.2, 41.1, 16.6, 15.1, 25.4, 13, 13.8, 27.7, 12.1, 31.3, 13,
      40.4, 11.3, 44.4, 7.2, 93, 6.9, 93, 8, 102.5, 7.7, 102.5, 9.5,
      105.3, 10.9, 113.7, 10.9, 115.6, 6.3, 117.2, 6.3, 117.2, 10.8,
    ],
    // vazado
    [
      50.3, 19.9, 56, 19.8, 56.2, 16.2, 52.3, 16.5, 51.7, 18.1,
      52.9, 19.2, 50.3, 16.6,
    ],
    // vazado
    [
      92.4, 9.9, 92.7, 10.9, 101, 10.9, 99.2, 9.8,
    ],
  ],
  shotgun: [
    // contorno
    [
      121, 14.5, 121, 17.6, 114.3, 17.6, 116.1, 18.5, 116.1, 21.5,
      52.1, 22.6, 50.4, 26, 48.2, 26.6, 44.4, 26.2, 43, 23.2, 40.8, 22.4,
      34.6, 23.2, 14.5, 31, 12.8, 30.3, 11, 18, 12.3, 16.5, 29.9, 16.1,
      34.7, 16.1, 40, 18, 41.8, 16.9, 42.8, 13, 43.9, 15.4, 46.7, 14.3,
      63.6, 14.1, 110.9, 14.5, 111.3, 13.4, 112.4, 14.5,
    ],
    // vazado
    [
      84, 17.6, 84, 18.5, 112.9, 18.5, 112.9, 17.6,
    ],
    // vazado
    [
      44.5, 25.1, 49.6, 25.8, 50.4, 23.3, 46.9, 22.6, 46.7, 25.3,
      44.7, 23,
    ],
  ],
  sniper: [
    // contorno
    [
      129, 17.6, 128.9, 20.3, 88.3, 19.8, 87.6, 23.8, 66.8, 23.9,
      56.3, 26, 46, 26.3, 44, 28.1, 38.3, 26.8, 37.6, 32, 27.1, 31.5,
      21.5, 28.9, 13.2, 28.9, 11.8, 31.9, 3, 32.3, 3.3, 18.7, 38.7, 19.7,
      39.5, 17.7, 48.1, 17.2, 48.1, 15.3, 37.7, 16.2, 37.7, 11.8,
      44.3, 13, 62.5, 13, 73.6, 11.6, 73.6, 16.5, 59.8, 15.1, 59.4, 17.2,
      63.8, 16.6, 64, 17.6,
    ],
    // vazado
    [
      28.3, 27.4, 29.5, 28.8, 32.4, 28.5, 34.2, 24.7, 31.8, 23.5,
      29.6, 23.9,
    ],
    // vazado
    [
      48.8, 15.3, 48.8, 17.2, 58.7, 17.2, 58.3, 15.1,
    ],
    // vazado
    [
      38.8, 26.4, 43.7, 27.7, 45.6, 25.9, 42.3, 24.7, 42.3, 27.4,
      41.8, 24.7, 40.1, 24.7,
    ],
  ],
};

/**
 * A largura de cada arma NAO e' proporcional ao comprimento real: a pistola
 * ficaria com 40px do lado do sniper e sumiria no killfeed. O gerador usa
 * comprimento^0.6, que mantem a escada de tamanhos legivel sem achatar as
 * diferencas — a escolha ja' esta' embutida nas coordenadas acima.
 */
function draw(id: WeaponId): string {
  const c = document.createElement('canvas');
  c.width = W * SCALE;
  c.height = H * SCALE;
  const g = c.getContext('2d');
  if (!g) return '';
  g.scale(SCALE, SCALE);

  const path = new Path2D();
  for (const loop of SHAPES[id]) {
    path.moveTo(loop[0], loop[1]);
    for (let i = 2; i < loop.length; i += 2) path.lineTo(loop[i], loop[i + 1]);
    path.closePath();
  }

  // Contorno escuro por baixo do preenchimento claro: o icone precisa ler tanto
  // sobre o ceu quanto sobre o chao claro da arena. Traca ANTES de preencher —
  // assim so' sobra a metade de fora do traco, e a de dentro dos vazados, que e'
  // o que fecha o desenho do guarda-mato.
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  g.lineWidth = 2.4;
  g.stroke(path);
  g.fillStyle = '#f2f4f7';
  g.fill(path, 'evenodd');

  return c.toDataURL('image/png');
}

const cache = new Map<WeaponId, string>();

/**
 * Desenha todos os icones de uma vez, na tela de carregamento.
 *
 * Cada um custa ~1ms entre o canvas e o toDataURL. Sob demanda esse custo cai
 * na primeira troca de arma — no meio do jogo, junto com a animacao de troca.
 * Mesma ideia do warmupShaders(): o trabalho existe, so' nao pode cair num
 * frame que o jogador esteja vendo.
 */
export function warmupWeaponIcons(): void {
  for (const id of Object.keys(SHAPES) as WeaponId[]) weaponIcon(id);
}

export function weaponIcon(id: WeaponId): string {
  let url = cache.get(id);
  if (!url) {
    url = draw(id);
    cache.set(id, url);
  }
  return url;
}
