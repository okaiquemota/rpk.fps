/**
 * Quanto pesa cada asset, e o que isso custa em cada um dos dois builds.
 *
 * Existe porque decisao de asset vinha sendo adivinhacao: "sera' que este .glb
 * cabe?". O limite que importa nao e' um so' — sao dois, e eles discordam:
 *
 * - o build normal (o que o GitHub Pages publica) aceita qualquer tamanho, e
 *   asset acima de 4 KB sai como arquivo separado, com cache proprio;
 * - o build de arquivo unico embute TUDO em base64, entao cada asset custa
 *   ~33% a mais e vai inteiro pro mesmo arquivo que o jogador baixa.
 *
 * `npm run assets` responde os dois de uma vez.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const PASTAS = ['assets/models', 'assets/sounds'];
/** Acima disso o Vite emite arquivo em vez de data URI (build normal). */
const LIMITE_INLINE = 4096;
/** Base64 cresce 4/3, e e' isso que vai parar dentro do .html avulso. */
const BASE64 = 4 / 3;

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

async function varrer(dir, saida = [], raiz = dir) {
  let itens;
  try {
    itens = await readdir(dir, { withFileTypes: true });
  } catch {
    return saida;                       // pasta opcional que nao existe
  }
  for (const item of itens) {
    const caminho = join(dir, item.name);
    // Subpasta e' gaveta de original (assets/sounds/originais), fora do bundle.
    if (item.isDirectory()) continue;
    if (item.name.startsWith('.') || extname(item.name) === '.md') continue;
    const { size } = await stat(caminho);
    saida.push({ caminho, raiz, size });
  }
  return saida;
}

const arquivos = [];
for (const p of PASTAS) await varrer(p, arquivos);
arquivos.sort((a, b) => b.size - a.size);

if (!arquivos.length) {
  console.log('Nenhum asset em', PASTAS.join(' nem '));
  process.exit(0);
}

const soma = arquivos.reduce((t, a) => t + a.size, 0);

console.log('\n  asset                                    tamanho    no arquivo unico');
console.log('  ' + '-'.repeat(74));
for (const a of arquivos) {
  const nome = a.caminho.padEnd(40).slice(0, 40);
  const externo = a.size > LIMITE_INLINE ? '' : '  (embutido nos dois)';
  console.log(`  ${nome} ${kb(a.size).padStart(8)}    ${kb(a.size * BASE64).padStart(8)}${externo}`);
}
console.log('  ' + '-'.repeat(74));
console.log(`  ${'total'.padEnd(40)} ${kb(soma).padStart(8)}    ${kb(soma * BASE64).padStart(8)}`);

console.log(`
  Build normal (npm run build, o que o Pages publica):
    sem limite de tamanho. Asset acima de ${kb(LIMITE_INLINE)} sai como arquivo
    separado, com cache proprio — modelo pesado aqui nao e' problema.

  Arquivo unico (npm run build:single):
    soma ~${kb(soma * BASE64)} de asset dentro do .html, alem do codigo. Ele nao
    tem limite rigido, mas o arquivo inteiro e' baixado de uma vez antes de
    qualquer coisa aparecer: passando de uns 8 MB, a espera fica ruim.
    Se algum asset nao puder ser embutido, o build FALHA e diz qual.
`);
