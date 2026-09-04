import type { WeaponId } from '../weapons/WeaponDefs';

const W = 132;
const H = 44;

/**
 * Silhuetas de arma desenhadas em canvas e guardadas como data URL.
 *
 * Sao o que da' identidade ao killfeed e ao painel de municao — ler "abateu com
 * escopeta" pelo formato e' instantaneo, ler pelo nome nao e'. Como o resto do
 * projeto, saem de codigo: nenhum sprite pra baixar.
 */
function draw(id: WeaponId): string {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return '';

  // Contorno escuro por baixo do preenchimento claro: o icone precisa ler tanto
  // sobre o ceu quanto sobre o chao claro da arena.
  const parts: [number, number, number, number][] = [];
  const box = (x: number, y: number, w: number, h: number): void => { parts.push([x, y, w, h]); };

  switch (id) {
    case 'pistol':
      box(38, 14, 42, 9);    // corpo
      box(74, 16, 22, 5);    // cano
      box(44, 22, 12, 18);   // punho
      box(52, 22, 14, 4);    // guarda-mato
      break;

    case 'rifle':
      box(24, 15, 78, 9);    // corpo
      box(96, 17, 26, 5);    // cano
      box(10, 16, 16, 7);    // coronha
      box(46, 24, 12, 16);   // punho
      box(62, 24, 10, 14);   // carregador
      box(70, 24, 6, 10);
      box(56, 10, 4, 5);     // mira
      box(90, 10, 4, 5);
      break;

    case 'shotgun':
      box(22, 15, 74, 10);   // corpo
      box(92, 16, 32, 6);    // cano
      box(92, 23, 26, 4);    // tubo
      box(8, 16, 15, 9);     // coronha
      box(44, 25, 12, 15);   // punho
      box(70, 24, 20, 6);    // bombeamento
      break;
  }

  g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  g.lineJoin = 'round';
  g.lineWidth = 4;
  for (const [x, y, w, h] of parts) g.strokeRect(x, y, w, h);
  g.fillStyle = '#f2f4f7';
  for (const [x, y, w, h] of parts) g.fillRect(x, y, w, h);

  return c.toDataURL('image/png');
}

const cache = new Map<WeaponId, string>();

export function weaponIcon(id: WeaponId): string {
  let url = cache.get(id);
  if (!url) {
    url = draw(id);
    cache.set(id, url);
  }
  return url;
}
