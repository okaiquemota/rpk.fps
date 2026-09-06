/**
 * Empacota o jogo num unico arquivo HTML, com CSS e JS embutidos.
 *
 * Gera dois arquivos em dist/:
 *   rpk-fps.html           pagina completa — abre com duplo clique, sem servidor
 *   rpk-fps.fragment.html  so' o conteudo (title + style + markup + script),
 *                          pra hospedagens que injetam o proprio <head>/<body>
 *
 * ESTE NAO E' O DEPLOY. O GitHub Pages publica a pasta `dist/` inteira, com os
 * assets como arquivos separados; o arquivo unico e' um extra, pra baixar e
 * jogar offline. Por isso ele faz o PROPRIO build, no modo `single`, onde o
 * limite de embutir sobe o suficiente pra tudo virar data URI — sem obrigar o
 * build de verdade a carregar cada modelo em base64 dentro do JS.
 *
 * E por isso ele FALHA quando nao consegue carregar tudo. A versao anterior
 * pegava um .js e um .css e ignorava o resto: asset grande demais e divisao de
 * codigo viravam referencia pra arquivo que nao existe, o HTML saia "pronto", e
 * o que faltava sumia calado — arma voltando pro modelo procedural, som que
 * nunca toca. Um build quebrado tem que doer no build, nao no jogador.
 */
import { readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';

const SAIDA = 'dist';
const TRABALHO = 'dist-single';
const ASSETS = join(TRABALHO, 'assets');

/**
 * Decodificadores de Draco e KTX2: wasm que o three carrega por URL. Ficam de
 * fora do arquivo unico de proposito (sao ~1.5 MB que so' servem pra modelo
 * comprimido), entao encontra-los soltos NAO e' erro.
 */
const EXTERNO_OK = /draco_|basis_transcoder/;

const escapeForScript = (code) =>
  // Um "</script>" dentro do bundle encerraria a tag mais cedo.
  code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

const stripSourceMapRef = (code) =>
  code.replace(/\n?\/\/# sourceMappingURL=.*$/m, '').replace(/\n?\/\*# sourceMappingURL=.*?\*\/\s*$/m, '');

const kb = (n) => `${Math.round(n / 1024)} kB`;

// ---------------------------------------------------------------- build
await rm(TRABALHO, { recursive: true, force: true });
await build({
  mode: 'single',
  logLevel: 'warn',
  build: { outDir: TRABALHO, emptyOutDir: true, sourcemap: false },
});

// ------------------------------------------------------------ conferencia
const todos = await readdir(ASSETS);
// Os decodificadores saem da conta ANTES de tudo: parte deles e' .js, e contados
// como pedaco de codigo eles disparariam um alarme de code-splitting que nao
// existe.
const bundle = todos.filter((f) => !EXTERNO_OK.test(f) && !f.endsWith('.map'));
const js = bundle.filter((f) => f.endsWith('.js'));
const css = bundle.filter((f) => f.endsWith('.css'));
const sobrou = bundle.filter((f) => !f.endsWith('.js') && !f.endsWith('.css'));
const decodificadores = todos.filter((f) => EXTERNO_OK.test(f));

const problemas = [];
if (js.length !== 1) {
  problemas.push(
    `esperava 1 arquivo .js e achei ${js.length}: ${js.join(', ') || '(nenhum)'}.\n` +
    '  Divisao de codigo (import dinamico) quebra o arquivo unico:\n' +
    '  so um dos pedacos entraria, e o resto sumiria sem aviso.',
  );
}
if (css.length !== 1) {
  problemas.push(`esperava 1 arquivo .css e achei ${css.length}: ${css.join(', ') || '(nenhum)'}.`);
}
if (sobrou.length) {
  const linhas = await Promise.all(sobrou.map(async (f) => {
    const { size } = await stat(join(ASSETS, f));
    return `    ${f} — ${kb(size)}`;
  }));
  problemas.push(
    `${sobrou.length} asset(s) ficaram fora do bundle:\n${linhas.join('\n')}\n` +
    '  No modo `single` tudo deveria ser embutido, entao isto e inesperado.\n' +
    '  Eles funcionam normalmente no site (o Pages publica dist/ inteira),\n' +
    '  mas o arquivo unico nao tem como carrega-los.',
  );
}

if (problemas.length) {
  console.error('\nO build de arquivo unico NAO pode ser gerado:\n');
  for (const p of problemas) console.error(`  - ${p}\n`);
  console.error('  O build normal (`npm run build`) nao e afetado: ele publica os');
  console.error('  assets como arquivos, que e como o GitHub Pages serve o jogo.\n');
  process.exit(1);
}

// ------------------------------------------------------------- montagem
const [html, codigo, estilo] = await Promise.all([
  readFile(join(TRABALHO, 'index.html'), 'utf8'),
  readFile(join(ASSETS, js[0]), 'utf8'),
  readFile(join(ASSETS, css[0]), 'utf8'),
]);

let out = html
  .replace(new RegExp(`\\s*<link[^>]*href="[^"]*${css[0]}"[^>]*>`), '')
  .replace(new RegExp(`\\s*<script[^>]*src="[^"]*${js[0]}"[^>]*>\\s*</script>`), '');

const styleTag = `<style>\n${stripSourceMapRef(estilo)}\n</style>`;
const scriptTag = `<script type="module">\n${escapeForScript(stripSourceMapRef(codigo))}\n</script>`;

// ATENCAO: o replacement precisa ser uma FUNCAO. Como string, o `$` seguido de
// crase (que aparece no bundle do three) seria lido como o padrao especial `$\``
// e trocado por "tudo que vem antes do match", corrompendo o arquivo.
out = out.replace('</head>', () => `${styleTag}\n</head>`);
out = out.replace('</body>', () => `${scriptTag}\n</body>`);

await writeFile(join(SAIDA, 'rpk-fps.html'), out, 'utf8');

// Versao fragmento: sem doctype/html/head/body, mantendo title, style e conteudo.
const title = out.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'RPK.FPS';
const body = out.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
const fragment = `<title>${title}</title>\n${styleTag}\n${body.trim()}\n`;
await writeFile(join(SAIDA, 'rpk-fps.fragment.html'), fragment, 'utf8');

await rm(TRABALHO, { recursive: true, force: true });

console.log(`dist/rpk-fps.html           ${kb(out.length)}`);
console.log(`dist/rpk-fps.fragment.html  ${kb(fragment.length)}`);
if (decodificadores.length) {
  console.log(
    `\nNota: ${decodificadores.length} decodificador(es) de modelo comprimido` +
    '\n(Draco/KTX2) ficaram de fora — sao carregados por URL e nao cabem num' +
    '\narquivo so. Modelo SEM compressao funciona normalmente aqui; modelo' +
    '\ncomprimido so no site (npm run build).',
  );
}
