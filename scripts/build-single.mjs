/**
 * Empacota o build do Vite num unico arquivo HTML, com CSS e JS embutidos.
 *
 * Gera dois arquivos em dist/:
 *   rpk-fps.html           pagina completa — abre com duplo clique, sem servidor
 *   rpk-fps.fragment.html  so' o conteudo (title + style + markup + script),
 *                          pra hospedagens que injetam o proprio <head>/<body>
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');

const escapeForScript = (code) =>
  // Um "</script>" dentro do bundle encerraria a tag mais cedo.
  code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

const stripSourceMapRef = (code) =>
  code.replace(/\n?\/\/# sourceMappingURL=.*$/m, '').replace(/\n?\/\*# sourceMappingURL=.*?\*\/\s*$/m, '');

const files = await readdir(ASSETS);
const jsName = files.find((f) => f.endsWith('.js'));
const cssName = files.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error('rode `npm run build` antes: nao achei os assets em dist/assets');

const [html, js, css] = await Promise.all([
  readFile(join(DIST, 'index.html'), 'utf8'),
  readFile(join(ASSETS, jsName), 'utf8'),
  readFile(join(ASSETS, cssName), 'utf8'),
]);

let out = html
  .replace(new RegExp(`\\s*<link[^>]*href="[^"]*${cssName}"[^>]*>`), '')
  .replace(new RegExp(`\\s*<script[^>]*src="[^"]*${jsName}"[^>]*>\\s*</script>`), '');

const styleTag = `<style>\n${stripSourceMapRef(css)}\n</style>`;
const scriptTag = `<script type="module">\n${escapeForScript(stripSourceMapRef(js))}\n</script>`;

// ATENCAO: o replacement precisa ser uma FUNCAO. Como string, o `$` seguido de
// crase (que aparece no bundle do three) seria lido como o padrao especial `$\``
// e trocado por "tudo que vem antes do match", corrompendo o arquivo.
out = out.replace('</head>', () => `${styleTag}\n</head>`);
out = out.replace('</body>', () => `${scriptTag}\n</body>`);

await writeFile(join(DIST, 'rpk-fps.html'), out, 'utf8');

// Versao fragmento: sem doctype/html/head/body, mantendo title, style e conteudo.
const title = out.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'RPK.FPS';
const body = out.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
const fragment = `<title>${title}</title>\n${styleTag}\n${body.trim()}\n`;
await writeFile(join(DIST, 'rpk-fps.fragment.html'), fragment, 'utf8');

const kb = (s) => `${Math.round(s.length / 1024)} kB`;
console.log(`dist/rpk-fps.html           ${kb(out)}`);
console.log(`dist/rpk-fps.fragment.html  ${kb(fragment)}`);
