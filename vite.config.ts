import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    // Os .glb entram embutidos no bundle como data URI. E' o que permite o
    // build de arquivo unico continuar sendo UM arquivo, e faz os modelos
    // funcionarem onde buscar arquivo externo e' bloqueado.
    assetsInlineLimit: 600_000,
  },
});
