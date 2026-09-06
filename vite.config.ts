import { defineConfig } from 'vite';

/**
 * Nomes dos decodificadores de glTF comprimido (Draco e KTX2/Basis).
 *
 * Nao sao importados por nenhum arquivo nosso: o proprio three os referencia
 * com `new URL(..., import.meta.url)`, e o Vite entende esse padrao — emite os
 * arquivos e reescreve a URL. Nao ha nada pra configurar, contanto que eles
 * continuem sendo ARQUIVOS.
 *
 * Sao ~1.5 MB de wasm que o navegador so' baixa se um modelo de fato usar
 * aquela compressao. Embutir isso em base64 seria pagar o custo sempre.
 */
const DECODIFICADORES = /draco_|basis_transcoder/;

export default defineConfig(({ mode }) => ({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,

    /**
     * Asset sai como ARQUIVO, nao como data URI dentro do JS.
     *
     * Era 600 KB fixo, o que embutia tudo em base64 (+33%) e fazia todo modelo
     * e todo som passarem pelo mesmo bundle do codigo — pior cache, primeira
     * pintura mais tarde, e um teto artificial em cada decisao de asset. O
     * Pages publica `dist/` inteira, entao arquivo separado sempre funcionou
     * ali; quem precisa de tudo junto e' so' o build de arquivo unico, que roda
     * no modo `single` (ver `scripts/build-single.mjs`).
     *
     * Modelo pesado agora e' so' mais um arquivo — nao um problema de build.
     */
    assetsInlineLimit: (arquivo: string, conteudo: Buffer) => {
      if (DECODIFICADORES.test(arquivo)) return false;
      return mode === 'single' ? true : conteudo.length <= 4096;
    },
  },
}));
