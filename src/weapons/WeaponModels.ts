import * as THREE from 'three';
import { gltfLoader } from '../core/gltf';
import type { WeaponId } from './WeaponDefs';
import { WeaponAnimator } from './WeaponAnimator';

import pistolUrl from '../../assets/models/pistol.glb?url';
import deagleUrl from '../../assets/models/deagle.glb?url';
import smgUrl from '../../assets/models/smg.glb?url';
import rifleUrl from '../../assets/models/rifle.glb?url';
import shotgunUrl from '../../assets/models/shotgun.glb?url';
import sniperUrl from '../../assets/models/sniper.glb?url';

/**
 * Como encaixar cada modelo na mao do jogador.
 *
 * A escala NAO e' um fator fixo: e' derivada de um comprimento alvo em metros.
 * O pacote nao mantem proporcao real entre as armas (a pistola vem
 * proporcionalmente maior que o fuzil), e um fator unico deixaria umas gigantes
 * e outras minusculas. Medindo a peca e escalando pro tamanho que ela deve ter,
 * trocar um modelo depois nao exige recalibrar nada.
 */
export interface ModelSpec {
  url: string;
  /** Comprimento que a arma deve ter no jogo, em metros. */
  length: number;
  /**
   * Ajuste fino na tela, em metros: X pra dentro/fora, Y pra cima/baixo,
   * Z pra perto/longe. O pivo de cada modelo cai num lugar diferente, e e' aqui
   * que cada arma e' trazida pro mesmo enquadramento.
   */
  offset: [number, number, number];
  /**
   * Correcao aplicada SO' ao mirar, somada a` posicao de mira do ViewModel.
   *
   * Mirar quer a linha de visada do modelo passando pelo centro da tela, e o
   * `offset` acima nao serve pra isso: ele posiciona a arma na MAO, com a peca
   * centrada pela propria caixa. Como a alca de mira nao fica no centro da
   * caixa — fica em cima e no eixo —, encostar os dois exige um segundo ajuste.
   */
  adsOffset: [number, number, number];
  /**
   * Giro em torno de Y, em radianos, pra levar o cano pra -Z (a direcao pra
   * onde a camera olha).
   *
   * Era um booleano `flipped`, e isso so' dava conta de modelo deitado no eixo
   * X: invertido ou nao. O primeiro modelo de fora que chegou ja' vinha deitado
   * em Z, e nenhum dos dois valores servia — girar 90 graus punha o cano
   * apontando pro lado, que e' o tipo de erro que NAO salta aos olhos.
   *
   * Os quatro casos que aparecem na pratica:
   *
   *   cano em +X -> Math.PI / 2      cano em -X -> -Math.PI / 2
   *   cano em -Z -> 0                cano em +Z -> Math.PI
   *
   * Pra descobrir num modelo novo: fatie a peca ao longo do comprimento e veja
   * de que lado a secao transversal e' mais FINA — a ponta fina e' o cano.
   * `scratchpad/inspecionarModelo.html` faz essa conta.
   */
  yaw: number;
  /**
   * Ossos cuja geometria NUNCA deve aparecer.
   *
   * Modelo de FPS animado costuma trazer peca que o jogo ja' faz melhor — no
   * AK, dois cartuchos que a animacao de tiro cospe, enquanto o jogo ja' ejeta
   * capsula com pool, fisica e som.
   *
   * A lista e' explicita, e nao adivinhada por heuristica: esconder osso errado
   * apaga parte da arma, e isso e' pior que o problema.
   */
  hiddenBones?: readonly string[];
  /**
   * Ossos escondidos EXCETO durante a recarga.
   *
   * O segundo pente, solto no ar ao lado da arma, e' o caso: em qualquer outra
   * pose ele fica boiando, mas na recarga e' justamente ele que a animacao
   * encaixa — escondido ali, o clipe tira o pente velho e nao poe nenhum.
   *
   * Precisa ser uma lista SEPARADA de `hiddenBones`. Com as duas juntas, a
   * recarga revelava os cartuchos tambem, e a municao do modelo voltava a
   * aparecer no unico momento em que ninguem esperava.
   */
  reloadBones?: readonly string[];
}

/**
 * Exportado porque `scratchpad/traceIcons.html` precisa das MESMAS decisoes
 * pra tracar o icone: orientacao e ossos escondidos. Duplicar essa tabela ja'
 * saiu de sincronia uma vez.
 */
export const SPECS: Record<WeaponId, ModelSpec> = {
  pistol: { url: pistolUrl, length: 0.26, offset: [-0.02, 0.01, 0.05], adsOffset: [0, 0, 0], yaw: -Math.PI / 2 },
  deagle: { url: deagleUrl, length: 0.3, offset: [-0.02, 0.01, 0.05], adsOffset: [0, 0, 0], yaw: Math.PI / 2 },
  smg: { url: smgUrl, length: 0.44, offset: [-0.03, 0.02, 0.04], adsOffset: [0, 0, 0], yaw: -Math.PI / 2 },
  // Fuzil: modelo do wburton (ver CREDITS.md), com esqueleto e animacoes.
  //
  // Ja' vem com o cano no -Z, entao nao gira. Isso custou caro pra descobrir, e
  // a licao nao e' sobre orientacao: a medida do eixo estava CERTA desde o
  // comeco, mas o pente avulso (abaixo) escalava e descentrava a arma a ponto
  // de o render parecer dizer o contrario. Enquadramento errado se disfarca de
  // orientacao errada.
  rifle: {
    url: rifleUrl, length: 0.62, offset: [-0.12, 0.105, 0.19],
    adsOffset: [0.123, -0.093, -0.06], yaw: 0,
    // Os cartuchos do modelo (`Bone004_04` e `Bone005_05`) ficam VISIVEIS: sao
    // eles que a animacao cospe pela janela de ejecao, presos ao movimento da
    // arma. A capsula do jogo continua existindo, mas o papel dela agora e'
    // outro — voar, quicar e fazer barulho no chao, que e' o que a animacao
    // nao faz. Dividir assim foi escolha do jogador, e nao ha' duplicata
    // visivel porque uma vive no receptor e a outra ja' esta' no ar.
    //
    // O pente avulso: 266 vertices com centro em (-2.74, -3.06, -1.65),
    // enquanto todo o resto da arma vive a menos de uma unidade da origem.
    reloadBones: ['Bone002_01'],
  },
  shotgun: { url: shotgunUrl, length: 0.66, offset: [-0.04, 0.025, 0.03], adsOffset: [0, 0, 0], yaw: Math.PI / 2 },
  sniper: { url: sniperUrl, length: 0.78, offset: [-0.04, 0.03, 0.03], adsOffset: [0, 0, 0], yaw: Math.PI / 2 },
};

export interface WeaponModel {
  /** Ja' escalado, orientado e centrado: e' so' pendurar no rig. */
  object: THREE.Object3D;
  /** Ponta do cano, em coordenadas do proprio objeto. */
  muzzle: THREE.Vector3;
  /** Correcao de posicao ao mirar — ver `adsOffset` em `SPECS`. */
  adsFix: THREE.Vector3;
  /**
   * Existe so' quando o modelo traz animacao. Precisa de `update(dt, ...)` a
   * cada quadro, senao a arma congela na pose de repouso — que, como se
   * descobriu, nem sempre e' uma pose apresentavel.
   */
  animator?: WeaponAnimator;
  /**
   * Ossos sempre escondidos. Precisam ser escondidos DE NOVO depois de cada
   * quadro de animacao: o clipe reescreve a pose (e as vezes a ESCALA) de todo
   * osso que toca, e devolveria a peca pra tela.
   */
  hidden?: OssoOculto[];
  /** Ossos que so' aparecem na recarga — ver `reloadBones` em `SPECS`. */
  hiddenReload?: OssoOculto[];
}

/**
 * Carrega os modelos das armas.
 *
 * Falha em um modelo NAO e' erro fatal: aquela arma volta pro modelo
 * procedural e o jogo segue. Isso mantem o projeto rodando pra quem clonar sem
 * os arquivos, e permite trocar uma arma de cada vez.
 */
export async function loadWeaponModels(): Promise<Map<WeaponId, WeaponModel>> {
  // Carregador compartilhado: ja' sabe abrir modelo comprimido (ver core/gltf).
  const loader = gltfLoader();
  const out = new Map<WeaponId, WeaponModel>();

  const jobs = (Object.entries(SPECS) as [WeaponId, ModelSpec][]).map(
    async ([id, spec]) => {
      try {
        const gltf = await loader.loadAsync(spec.url);
        out.set(id, prepare(gltf.scene, spec, gltf.animations));
      } catch {
        // Sem modelo, sem drama: o ViewModel usa o rig procedural.
      }
    },
  );
  await Promise.all(jobs);
  return out;
}

/**
 * Centro da fatia da frente da peca — a boca do cano.
 *
 * Fatia fina (4% do comprimento) pra pegar so' a ponta: mais que isso comeca a
 * incluir o guarda-mao e o ponto desce.
 */
function pontaDoCano(root: THREE.Object3D, caixa: THREE.Box3): THREE.Vector3 {
  const frente = caixa.min.z + (caixa.max.z - caixa.min.z) * 0.04;
  const soma = new THREE.Vector3();
  const v = new THREE.Vector3();
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (o instanceof THREE.SkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      if (v.z <= frente) { soma.add(v); n++; }
    }
  });
  return n ? soma.divideScalar(n) : new THREE.Vector3(0, (caixa.min.y + caixa.max.y) / 2, caixa.min.z);
}

/** Um osso que fica escondido, e a escala que ele tem quando aparece. */
export interface OssoOculto {
  bone: THREE.Bone;
  escala: THREE.Vector3;
}

/**
 * Colapsa a geometria de um osso: escala zero deixa os triangulos degenerados
 * (area zero, nao rasterizam), e a posicao zerada traz o ponto que sobra pra
 * junto do pai, pra ele nao continuar puxando a caixa do modelo pra longe.
 */
export function esconder(ossos: readonly OssoOculto[]): void {
  for (const o of ossos) {
    o.bone.scale.setScalar(0);
    o.bone.position.set(0, 0, 0);
  }
}

/**
 * Devolve a escala original. So' a ESCALA: posicao e giro ficam por conta do
 * clipe que esta' tocando, que e' quem sabe levar o pente ate' a arma.
 */
export function mostrar(ossos: readonly OssoOculto[]): void {
  for (const o of ossos) o.bone.scale.copy(o.escala);
}

/**
 * Caixa do modelo com o esqueleto levado em conta.
 *
 * `Box3.setFromObject` usa a caixa em cache da malha, e numa malha com
 * esqueleto essa caixa e' a do BIND POSE — a pose crua do arquivo, nao a que
 * esta' na tela. Invalidar o cache antes forca o three a refazer a conta com os
 * ossos na posicao atual.
 *
 * Isso e' o tipo de detalhe que custa horas: medindo sem invalidar, dois
 * metodos diferentes deram dois eixos longos diferentes pro mesmo arquivo, e
 * nenhum dos dois batia com o que aparecia na tela.
 */
function medirCaixa(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.skeleton.update();
      // O tipo diz Box3, mas o three usa null como "ainda nao calculei" —
      // e' assim que se pede o recalculo.
      (o as { boundingBox: THREE.Box3 | null }).boundingBox = null;
      o.computeBoundingBox();
    }
  });
  return new THREE.Box3().setFromObject(root);
}

/** Escala, orienta e centra o modelo cru pro espaco do viewmodel. */
function prepare(
  scene: THREE.Object3D,
  spec: ModelSpec,
  clips: THREE.AnimationClip[] = [],
): WeaponModel {
  const root = new THREE.Group();
  root.add(scene);

  // Leva o cano pra -Z, que e' pra onde a camera olha. O angulo muda por arma
  // porque cada autor deita a peca num eixo (ver `yaw`). Errar isso nao aparece
  // na tela: em perspectiva, arma apontando pra frente, pra tras ou pro lado
  // parecem todas plausiveis.
  scene.rotation.y = spec.yaw;

  // A pose de repouso do arquivo NAO e' necessariamente a pose de uso. O AK do
  // wburton guarda um pente SOLTO, flutuando ao lado da arma: e' o pente que a
  // animacao de recarga encaixa, e no bind pose ele fica parado no ar. Medir
  // assim escala a arma pra que "arma + pente solto" caibam no comprimento
  // alvo — a arma sai curta — e centra o conjunto no vazio entre as duas.
  //
  // Quem tem a pose certa e' a animacao `idle`. Aplicando ela antes de medir, o
  // pente vai pro lugar dele e a caixa passa a ser a caixa da arma.
  const animator = clips.length ? new WeaponAnimator(scene, clips) : undefined;
  animator?.update(0, 0, true);

  const colher = (nomes?: readonly string[]): OssoOculto[] => {
    const fora: OssoOculto[] = [];
    if (!nomes?.length) return fora;
    root.traverse((o) => {
      if (o instanceof THREE.Bone && nomes.includes(o.name)) {
        fora.push({ bone: o, escala: o.scale.clone() });
      }
    });
    return fora;
  };
  const hidden = colher(spec.hiddenBones);
  const hiddenReload = colher(spec.reloadBones);
  // Some com os dois ANTES de medir: o pente avulso boiando longe da arma
  // envenena a caixa que escala e centra o modelo.
  esconder(hidden);
  esconder(hiddenReload);

  // Escala derivada da peca de verdade, nao chutada.
  const size = new THREE.Vector3();
  medirCaixa(root).getSize(size);
  const longest = Math.max(size.x, size.y, size.z);
  const scale = longest > 0 ? spec.length / longest : 1;
  root.scale.setScalar(scale);

  // Cada autor deixa o pivo num canto diferente, entao centramos a peca e
  // depois a empurramos pra frente. O ponto do rig tem que cair no PUNHO, nao
  // no meio da arma: centrada, ela nasce metade atras da mao e parece flutuar.
  const center = new THREE.Vector3();
  medirCaixa(root).getCenter(center);
  scene.position.x -= center.x / scale;
  scene.position.y -= center.y / scale;
  scene.position.z -= center.z / scale;

  // Centrada, metade da arma nasceria atras da mao. Empurrar pra frente poe o
  // punho perto da origem do rig, que e' onde a mao estaria.
  root.position.set(
    spec.offset[0],
    spec.offset[1],
    -spec.length * 0.28 + spec.offset[2],
  );

  // Sombras e material: o pacote vem com material proprio, so' garantimos que
  // ele participa da iluminacao da cena do viewmodel.
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });

  // Boca do cano: nao e' o canto da caixa, e' onde o CANO de fato termina.
  //
  // Antes o X era zero fixo e o Y era o meio da caixa. Num modelo deslocado no
  // X — que e' todo modelo, porque o `offset` afasta a arma pro canto — isso
  // punha o clarao ao LADO do cano; e num fuzil, cujo pente puxa a caixa pra
  // baixo, o meio da caixa fica abaixo da linha do cano. Medindo o centro da
  // fatia da frente, o ponto cai no cano em qualquer modelo.
  const finalBox = medirCaixa(root);
  const muzzle = pontaDoCano(root, finalBox);

  return {
    object: root, muzzle, adsFix: new THREE.Vector3(...spec.adsOffset), animator,
    hidden: hidden.length ? hidden : undefined,
    hiddenReload: hiddenReload.length ? hiddenReload : undefined,
  };
}
