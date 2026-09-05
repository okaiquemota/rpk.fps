import type { WeaponId } from '../weapons/WeaponDefs';

/**
 * Amostras de tiro OPCIONAIS, lidas de `assets/sounds/`.
 *
 * A pasta vazia e' um estado valido: sem arquivo nenhum, o AudioManager
 * sintetiza como sempre fez. Por isso o `import.meta.glob` no lugar de um
 * import estatico — glob sem correspondencia devolve `{}` e o build passa,
 * enquanto `import x from '.../pistol.ogg'` quebraria a compilacao.
 *
 * Nome do arquivo = id da arma, com sufixo opcional pra tomadas extras:
 *   rifle.ogg, rifle-2.ogg, rifle-3.ogg
 *
 * Vale ter mais de uma tomada: a 720 rpm sao doze disparos por segundo, e uma
 * amostra so' repetida nessa cadencia o ouvido escuta como zumbido periodico,
 * nao como tiro. Com uma tomada so', a variacao fica por conta do
 * `playbackRate` no AudioManager, que ajuda mas nao resolve.
 */
const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'deagle', 'smg', 'rifle', 'shotgun', 'sniper'];

const FILES = import.meta.glob('../../assets/sounds/*.{ogg,opus,mp3,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Bytes crus por arma — ainda nao decodificados. */
export type RawSamples = Map<WeaponId, ArrayBuffer[]>;
export type SampleBank = Map<string, AudioBuffer[]>;

function weaponOf(path: string): WeaponId | null {
  const base = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
  const id = base.split('-')[0] as WeaponId;
  return WEAPON_IDS.includes(id) ? id : null;
}

/**
 * Baixa os arquivos. Nao toca em AudioContext, entao pode rodar na tela de
 * carregamento — o contexto so' nasce quando o jogador clica em jogar.
 *
 * Um arquivo que falhe e' ignorado sozinho: a arma dele volta pro sintetizado.
 */
export async function fetchShotSamples(): Promise<RawSamples> {
  const out: RawSamples = new Map();
  const paths = Object.keys(FILES).sort();   // rifle-2 depois de rifle
  await Promise.all(paths.map(async (path) => {
    const id = weaponOf(path);
    if (!id) return;
    try {
      const res = await fetch(FILES[path]);
      if (!res.ok) return;
      const list = out.get(id) ?? [];
      list.push(await res.arrayBuffer());
      out.set(id, list);
    } catch {
      // Sem som de verdade pra essa arma; o sintetizado cobre.
    }
  }));
  return out;
}

/**
 * Decodifica pro formato que o WebAudio toca.
 *
 * `decodeAudioData` DESTACA o ArrayBuffer que recebe, entao os bytes servem
 * uma vez so' — quem chama nao pode guardar o mapa cru pra decodificar de novo.
 */
export async function decodeShotSamples(ctx: BaseAudioContext, raw: RawSamples): Promise<SampleBank> {
  const bank: SampleBank = new Map();
  await Promise.all([...raw].map(async ([id, buffers]) => {
    const takes: AudioBuffer[] = [];
    for (const bytes of buffers) {
      try {
        takes.push(await ctx.decodeAudioData(bytes));
      } catch {
        // Formato que este navegador nao abre: cai no sintetizado.
      }
    }
    if (takes.length) bank.set(id, takes);
  }));
  return bank;
}
