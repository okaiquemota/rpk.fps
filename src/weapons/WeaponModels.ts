import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WeaponId } from './WeaponDefs';

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
interface ModelSpec {
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
   * O pacote NAO e' uniforme: a maioria tem o cano no +X, mas a pistola e a
   * submetralhadora vem com ele no -X. Sem inverter essas duas, elas apontam
   * pras costas do jogador.
   *
   * Pra descobrir num modelo novo: fatie a peca ao longo do comprimento e veja
   * de que lado a secao transversal e' mais FINA — a ponta fina e' o cano.
   */
  flipped: boolean;
}

const SPECS: Record<WeaponId, ModelSpec> = {
  pistol: { url: pistolUrl, length: 0.26, offset: [-0.02, 0.01, 0.05], adsOffset: [0, 0, 0], flipped: true },
  deagle: { url: deagleUrl, length: 0.3, offset: [-0.02, 0.01, 0.05], adsOffset: [0, 0, 0], flipped: false },
  smg: { url: smgUrl, length: 0.44, offset: [-0.03, 0.02, 0.04], adsOffset: [0, 0, 0], flipped: true },
  // Fuzil: o unico calibrado ate' agora, no quadril e na mira.
  rifle: { url: rifleUrl, length: 0.62, offset: [-0.12, 0.105, 0.278], adsOffset: [0.12, -0.079, -0.13], flipped: false },
  shotgun: { url: shotgunUrl, length: 0.66, offset: [-0.04, 0.025, 0.03], adsOffset: [0, 0, 0], flipped: false },
  sniper: { url: sniperUrl, length: 0.78, offset: [-0.04, 0.03, 0.03], adsOffset: [0, 0, 0], flipped: false },
};

export interface WeaponModel {
  /** Ja' escalado, orientado e centrado: e' so' pendurar no rig. */
  object: THREE.Object3D;
  /** Ponta do cano, em coordenadas do proprio objeto. */
  muzzle: THREE.Vector3;
  /** Correcao de posicao ao mirar — ver `adsOffset` em `SPECS`. */
  adsFix: THREE.Vector3;
}

/**
 * Carrega os modelos das armas.
 *
 * Falha em um modelo NAO e' erro fatal: aquela arma volta pro modelo
 * procedural e o jogo segue. Isso mantem o projeto rodando pra quem clonar sem
 * os arquivos, e permite trocar uma arma de cada vez.
 */
export async function loadWeaponModels(): Promise<Map<WeaponId, WeaponModel>> {
  const loader = new GLTFLoader();
  const out = new Map<WeaponId, WeaponModel>();

  const jobs = (Object.entries(SPECS) as [WeaponId, ModelSpec][]).map(
    async ([id, spec]) => {
      try {
        const gltf = await loader.loadAsync(spec.url);
        out.set(id, prepare(gltf.scene, spec));
      } catch {
        // Sem modelo, sem drama: o ViewModel usa o rig procedural.
      }
    },
  );
  await Promise.all(jobs);
  return out;
}

/** Escala, orienta e centra o modelo cru pro espaco do viewmodel. */
function prepare(scene: THREE.Object3D, spec: ModelSpec): WeaponModel {
  const root = new THREE.Group();
  root.add(scene);

  // Leva o cano pra -Z, que e' pra onde a camera olha. O sinal muda por arma
  // porque o pacote nao e' uniforme (ver `flipped`). Errar isso nao aparece na
  // tela: em perspectiva, arma apontando pra frente e pra tras parecem iguais.
  scene.rotation.y = spec.flipped ? -Math.PI / 2 : Math.PI / 2;

  // Escala derivada da peca de verdade, nao chutada.
  const raw = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  raw.getSize(size);
  const longest = Math.max(size.x, size.y, size.z);
  const scale = longest > 0 ? spec.length / longest : 1;
  root.scale.setScalar(scale);

  // Cada autor deixa o pivo num canto diferente, entao centramos a peca e
  // depois a empurramos pra frente. O ponto do rig tem que cair no PUNHO, nao
  // no meio da arma: centrada, ela nasce metade atras da mao e parece flutuar.
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
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

  // Boca do cano: a ponta da frente da peca ja' orientada e posicionada.
  const finalBox = new THREE.Box3().setFromObject(root);
  const muzzle = new THREE.Vector3(0, (finalBox.min.y + finalBox.max.y) / 2, finalBox.min.z);

  return { object: root, muzzle, adsFix: new THREE.Vector3(...spec.adsOffset) };
}
