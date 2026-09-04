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
}

const SPECS: Record<WeaponId, ModelSpec> = {
  pistol: { url: pistolUrl, length: 0.22, offset: [-0.05, 0.02, 0.03] },
  deagle: { url: deagleUrl, length: 0.26, offset: [-0.05, 0.02, 0.03] },
  smg: { url: smgUrl, length: 0.38, offset: [-0.06, 0.03, 0.02] },
  rifle: { url: rifleUrl, length: 0.55, offset: [-0.07, 0.035, 0.02] },
  shotgun: { url: shotgunUrl, length: 0.58, offset: [-0.07, 0.035, 0.02] },
  sniper: { url: sniperUrl, length: 0.7, offset: [-0.07, 0.04, 0.02] },
};

export interface WeaponModel {
  /** Ja' escalado, orientado e centrado: e' so' pendurar no rig. */
  object: THREE.Object3D;
  /** Ponta do cano, em coordenadas do proprio objeto. */
  muzzle: THREE.Vector3;
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

  // O pacote deita as armas ao longo de X, com o cano pro lado POSITIVO — a
  // caixa vai de -1.6 a +3.8 no fuzil, e a ponta longa e' o cano. Girar +90 em
  // Y leva esse lado pra -Z, que e' pra onde a camera olha. Com -90 a arma
  // apontava pras costas do jogador, o que so' aparece medindo: na tela, em
  // perspectiva, os dois lados parecem plausiveis.
  scene.rotation.y = Math.PI / 2;

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

  return { object: root, muzzle };
}
