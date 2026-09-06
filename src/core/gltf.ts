import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * O carregador de glTF do projeto — um so', pra qualquer .glb.
 *
 * Existe pra que arma, personagem e cenario passem pelo MESMO caminho: quem
 * adicionar modelo depois nao precisa saber o que e' Draco nem Basis, e nao vai
 * descobrir do jeito ruim que o modelo comprimido que baixou nao abre.
 *
 * As tres compressoes que importam num modelo pesado, e por que elas sao
 * tratadas diferente:
 *
 * - **meshopt** (geometria) entra EMBUTIDO. O decodificador do three e' um
 *   modulo JS com o wasm em base64 dentro, entao vai junto no bundle e funciona
 *   ate' no build de arquivo unico. E' a compressao a preferir.
 * - **Draco** (geometria) e **KTX2/Basis** (textura) precisam de wasm carregado
 *   por URL, e por isso ficam de FORA do bundle. Nao ha caminho pra configurar:
 *   o proprio three aponta pra eles com `new URL(..., import.meta.url)`, padrao
 *   que o Vite entende — ele emite os arquivos e reescreve a URL. Justamente
 *   por isso NAO chamamos `setDecoderPath`/`setTranscoderPath`: qualquer
 *   caminho fixo aqui desligaria essa resolucao e passaria a exigir que alguem
 *   copiasse os wasm na mao.
 *
 * O preco de Draco e KTX2 e' esse: sao arquivos externos, e no build de arquivo
 * unico eles nao existem. Modelo comprimido assim funciona no site e nao no
 * .html avulso — o `build-single.mjs` avisa isso na saida.
 *
 * Nada disso custa nada enquanto nao houver modelo comprimido: sao ~1.5 MB que
 * o navegador so' baixa quando encontra a extensao dentro de um .glb.
 */

let loader: GLTFLoader | null = null;
let draco: DRACOLoader | null = null;
let ktx2: KTX2Loader | null = null;

export function gltfLoader(): GLTFLoader {
  if (loader) return loader;

  loader = new GLTFLoader();

  draco = new DRACOLoader();
  loader.setDRACOLoader(draco);

  ktx2 = new KTX2Loader();
  loader.setKTX2Loader(ktx2);

  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/**
 * Diz ao carregador quais formatos de textura comprimida esta GPU aceita.
 *
 * Precisa do renderer, e precisa vir ANTES de carregar qualquer modelo com
 * textura KTX2 — sem isso o `KTX2Loader` nao sabe pra qual formato transcodar e
 * recusa o arquivo. E' por isso que o renderer nasce no `main.ts` e nao dentro
 * do `Game`: os modelos sao carregados antes do jogo existir, de proposito
 * (o aquecimento de shaders precisa deles), entao o renderer tem que existir
 * antes dos dois.
 */
export function enableCompressedTextures(renderer: THREE.WebGLRenderer): void {
  ktx2?.detectSupport(renderer);
}

export function disposeGltfLoader(): void {
  draco?.dispose();
  ktx2?.dispose();
  loader = null;
  draco = null;
  ktx2 = null;
}
