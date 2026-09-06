import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math';
import { WEAPON_DEFS, WEAPON_ORDER, type WeaponId } from './WeaponDefs';
import type { WeaponModel } from './WeaponModels';

interface Rig {
  root: THREE.Group;
  muzzlePoint: THREE.Object3D;
  flash: THREE.Mesh;
}

/**
 * Onde a arma fica no quadril. Mais baixa e um pouco mais afastada do que ja'
 * esteve: subindo demais, o cano cruza a tela na diagonal e encosta na mira —
 * a referencia (CrossFire) mantem a arma no canto de baixo, quase deitada.
 */
const HIP_POS = new THREE.Vector3(0.25, -0.235, -0.42);
const ADS_POS = new THREE.Vector3(0, -0.1, -0.3);
/** Angulo de 3/4 no quadril; some ao mirar, quando a arma alinha com a mira. */
const HIP_YAW = -0.16;
const HIP_PITCH = 0.05;
/**
 * Os modelos 3D sao mais longos que os rigs procedurais, entao o mesmo angulo
 * de 3/4 joga a ponta do cano pra fora da tela e a coronha na cara. Com modelo,
 * a arma fica mais alinhada com a mira.
 */
const MODEL_HIP_YAW = -0.07;
const MODEL_HIP_PITCH = 0.015;

/**
 * Quanto a arma se mexe sozinha.
 *
 * Balanco e arrasto dao vida, mas em excesso viram enjoo e atrapalham mirar:
 * a arma nunca esta' onde estava um instante atras. Estes valores sao metade
 * dos originais — o movimento continua legivel, so' parou de dancar.
 *
 * Todos juntos aqui de proposito: espalhados pelo `update`, mexer no "quanto a
 * arma balanca" virava caca a seis numeros em quatro linhas diferentes.
 */
const BOB_X = 0.008;        // vaivem lateral do passo
const BOB_Y = 0.006;        // sobe-desce do passo
const SWAY_GAIN = 0.0007;   // quanto a arma fica pra tras ao girar o mouse
const SWAY_LIMIT = 0.028;   // teto do arrasto, em metros
const SWAY_TILT = 1.6;      // giro que o arrasto lateral provoca
const SWAY_ROLL = 1.2;      // inclinacao que o arrasto vertical provoca

/**
 * A arma que voce ve' na tela. Fica pendurada na camera, entao vive em espaco
 * de camera: X pra direita, Y pra cima, Z negativo pra frente.
 *
 * Tudo aqui e' cosmetico. Nenhuma bala sai daqui — o tiro parte do centro da
 * tela, como em qualquer FPS decente.
 */
export class ViewModel {
  readonly group = new THREE.Group();
  private rigs = new Map<WeaponId, Rig>();
  private current: WeaponId = 'pistol';

  private recoilOffset = 0;
  private recoilRot = 0;
  private bobPhase = 0;
  private bobOffset = new THREE.Vector3();
  private swayX = 0;
  private swayY = 0;
  private reloadAmount = 0;
  private switchAmount = 0;
  private flashTimer = 0;
  private recoilRoll = 0;

  private disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  /**
   * Uma unica luz de clarao para todas as armas. Uma por rig significaria a
   * quantidade de luzes da cena mudando a cada troca de arma — e cada mudanca
   * dessas recompila os shaders (o mesmo problema documentado em Effects).
   */
  private flashLight = new THREE.PointLight(0xffb457, 0, 9, 2);

  /**
   * `models` traz as armas em .glb. O que faltar continua com o rig procedural
   * — da' pra trocar uma arma de cada vez, e quem clonar sem os arquivos joga
   * do mesmo jeito.
   */
  constructor(private models: Map<WeaponId, WeaponModel> = new Map()) {
    this.group.renderOrder = 10;
    this.group.add(this.flashLight);
    // A cena da arma tem FOV proprio; a escala compensa pra ela nao ficar
    // gigante em relacao ao mundo.
    this.group.scale.setScalar(0.78);
    for (const id of WEAPON_ORDER) {
      const rig = this.buildRig(id);
      rig.root.visible = id === this.current;
      this.group.add(rig.root);
      this.rigs.set(id, rig);
    }
  }

  private track<T extends THREE.BufferGeometry | THREE.Material>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private buildRig(id: WeaponId): Rig {
    const def = WEAPON_DEFS[id];
    const root = new THREE.Group();

    const model = this.models.get(id);
    if (model) return this.buildModelRig(id, root, model);

    const bodyMat = this.track(new THREE.MeshStandardMaterial({
      color: def.bodyColor, roughness: 0.45, metalness: 0.35,
    }));
    const darkMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x1c1f24, roughness: 0.35, metalness: 0.55,
    }));
    const gripMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x1e1a17, roughness: 0.9, metalness: 0.1,
    }));

    const [bw, bh, bd] = def.bodySize;

    // corpo
    const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw, bh, bd)), bodyMat);
    body.position.set(0, 0, -bd / 2);
    root.add(body);

    // cano
    const barrel = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(def.barrelRadius, def.barrelRadius, def.barrelLength, 12)),
      darkMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, bh * 0.12, -bd - def.barrelLength / 2 + 0.02);
    root.add(barrel);

    // punho
    const grip = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.85, bh * 1.15, bd * 0.28)), gripMat);
    grip.position.set(0, -bh * 0.9, -bd * 0.22);
    grip.rotation.x = -0.28;
    root.add(grip);

    // guarda-mato: um toro cortado le' como "arma" mesmo de relance
    const guard = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(bh * 0.42, 0.008, 6, 12, Math.PI * 1.25)),
      darkMat,
    );
    guard.rotation.set(Math.PI / 2, 0, Math.PI * 0.15);
    guard.position.set(0, -bh * 0.52, -bd * 0.24);
    root.add(guard);

    // gatilho
    const trigger = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.012, bh * 0.3, 0.014)), darkMat,
    );
    trigger.position.set(0, -bh * 0.45, -bd * 0.24);
    trigger.rotation.x = 0.25;
    root.add(trigger);

    // mira frontal (aparece bem no ADS)
    const frontSight = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.012, bh * 0.3, 0.012)), darkMat,
    );
    frontSight.position.set(0, bh * 0.68, -bd * 0.93);
    root.add(frontSight);

    // carregador / detalhes por arma
    if (id === 'rifle') {
      const mag = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.7, 0.19, 0.09)), darkMat);
      mag.position.set(0, -bh * 0.95, -bd * 0.55);
      mag.rotation.x = 0.16;
      root.add(mag);

      const stock = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.8, bh * 0.8, 0.16)), bodyMat);
      stock.position.set(0, -bh * 0.16, 0.07);
      root.add(stock);

      const sight = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.02, 0.05, 0.02)), darkMat);
      sight.position.set(0, bh * 0.62, -bd * 0.85);
      root.add(sight);
    } else if (id === 'shotgun') {
      const tube = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.022, 0.022, def.barrelLength * 0.85, 10)),
        darkMat,
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, -bh * 0.4, -bd - def.barrelLength * 0.42 + 0.02);
      root.add(tube);

      const pump = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 1.1, 0.07, 0.14)), gripMat);
      pump.position.set(0, -bh * 0.4, -bd * 0.95);
      root.add(pump);
    } else if (id === 'smg') {
      const mag = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.7, 0.22, 0.07)), darkMat);
      mag.position.set(0, -bh * 1.05, -bd * 0.42);
      root.add(mag);

      const stock = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.3, 0.05, 0.14)), darkMat);
      stock.position.set(0, bh * 0.1, 0.08);
      root.add(stock);
    } else if (id === 'sniper') {
      // Luneta: dois aneis e um tubo. E' o que identifica a arma de relance.
      const tube = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.026, 0.026, 0.3, 12)), darkMat,
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, bh * 0.95, -bd * 0.45);
      root.add(tube);

      for (const z of [-0.12, 0.12]) {
        const ring = new THREE.Mesh(
          this.track(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12)), bodyMat,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, bh * 0.95, -bd * 0.45 + z);
        root.add(ring);
      }

      const mount = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.02, bh * 0.5, 0.04)), darkMat);
      mount.position.set(0, bh * 0.65, -bd * 0.45);
      root.add(mount);

      const stock = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.9, bh * 1.1, 0.2)), bodyMat);
      stock.position.set(0, -bh * 0.25, 0.09);
      root.add(stock);

      const bipod = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.012, 0.11, 0.012)), darkMat);
      bipod.position.set(0, -bh * 0.7, -bd - 0.05);
      root.add(bipod);
    } else {
      // pistolas: ferrolho por cima
      const slide = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 1.05, 0.045, bd * 0.95)), darkMat);
      slide.position.set(0, bh * 0.5, -bd / 2);
      root.add(slide);
      if (id === 'deagle') {
        const vent = new THREE.Mesh(this.track(new THREE.BoxGeometry(bw * 0.5, 0.02, bd * 0.5)), bodyMat);
        vent.position.set(0, bh * 0.62, -bd * 0.62);
        root.add(vent);
      }
    }

    // ponto de saida do cano (referencia pro tracer)
    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.position.set(0, bh * 0.12, -bd - def.barrelLength + 0.01);
    root.add(muzzlePoint);

    // clarao — plano com material aditivo, ligado so' no frame do tiro
    const flash = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(0.3 * def.muzzleScale, 0.3 * def.muzzleScale)),
      this.track(new THREE.MeshBasicMaterial({
        color: 0xffd27a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })),
    );
    flash.position.copy(muzzlePoint.position);
    flash.visible = false;
    root.add(flash);

    return { root, muzzlePoint, flash };
  }

  /** Todos os rigs visiveis de uma vez, so' para o aquecimento de shaders. */
  setVisibleForWarmup(on: boolean): void {
    for (const [id, rig] of this.rigs) {
      rig.root.visible = on || id === this.current;
      rig.flash.visible = on;
    }
  }

  /**
   * Rig com modelo 3D: so' o clarao e o ponto do cano sao nossos, o resto vem
   * do arquivo. Mantem a mesma interface do rig procedural, entao nada mais no
   * viewmodel precisa saber qual dos dois esta' em uso.
   */
  private buildModelRig(id: WeaponId, root: THREE.Group, model: WeaponModel): Rig {
    const def = WEAPON_DEFS[id];
    root.add(model.object);

    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.position.copy(model.muzzle);
    root.add(muzzlePoint);

    const flash = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(0.3 * def.muzzleScale, 0.3 * def.muzzleScale)),
      this.track(new THREE.MeshBasicMaterial({
        color: 0xffd27a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })),
    );
    flash.position.copy(model.muzzle);
    flash.visible = false;
    root.add(flash);

    return { root, muzzlePoint, flash };
  }

  setWeapon(id: WeaponId): void {
    if (id === this.current) return;
    for (const [key, rig] of this.rigs) rig.root.visible = key === id;
    this.current = id;
    this.switchAmount = 1;
  }

  get muzzleWorldPosition(): THREE.Vector3 {
    const rig = this.rigs.get(this.current)!;
    return rig.muzzlePoint.getWorldPosition(new THREE.Vector3());
  }

  onFire(kickback: number): void {
    this.recoilOffset = Math.min(this.recoilOffset + kickback, 0.3);
    this.recoilRot = Math.min(this.recoilRot + kickback * 2.6, 0.6);
    this.flashTimer = 0.055;
  }

  /** Inclina a arma pro lado pra onde o padrao esta' puxando. */
  onRecoilSide(yaw: number): void {
    this.recoilRoll = clamp(this.recoilRoll + yaw * 9, -0.28, 0.28);
  }

  onReloadStart(): void { this.reloadAmount = 1; }

  update(
    dt: number,
    opts: {
      scopedOut?: boolean;
      moveSpeed01: number;
      grounded: boolean;
      adsAmount: number;
      lookDX: number;
      lookDY: number;
      reloadProgress: number;
      reloading: boolean;
    },
  ): void {
    const rig = this.rigs.get(this.current)!;
    // Com a luneta na tela a arma so' atrapalha a vista.
    rig.root.visible = !opts.scopedOut;

    // recuo volta pra posicao
    this.recoilOffset = damp(this.recoilOffset, 0, 14, dt);
    this.recoilRot = damp(this.recoilRot, 0, 12, dt);
    this.recoilRoll = damp(this.recoilRoll, 0, 9, dt);

    // balanco de caminhada (some ao mirar)
    if (opts.grounded && opts.moveSpeed01 > 0.05) {
      this.bobPhase += dt * (6 + opts.moveSpeed01 * 7);
    }
    const bobStrength = opts.moveSpeed01 * (1 - opts.adsAmount * 0.85) * (opts.grounded ? 1 : 0.25);
    this.bobOffset.set(
      Math.sin(this.bobPhase) * BOB_X * bobStrength,
      Math.abs(Math.cos(this.bobPhase)) * -BOB_Y * bobStrength,
      0,
    );

    // sway: a arma "fica pra tras" quando voce vira o mouse
    const swayScale = 1 - opts.adsAmount * 0.7;
    this.swayX = damp(this.swayX, -opts.lookDX * SWAY_GAIN * swayScale, 9, dt);
    this.swayY = damp(this.swayY, opts.lookDY * SWAY_GAIN * swayScale, 9, dt);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -SWAY_LIMIT, SWAY_LIMIT);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -SWAY_LIMIT, SWAY_LIMIT);

    // recarga: a arma desce e gira pra fora
    this.reloadAmount = opts.reloading
      ? Math.sin(opts.reloadProgress * Math.PI)
      : damp(this.reloadAmount, 0, 10, dt);

    // troca de arma: sobe da parte de baixo da tela
    this.switchAmount = damp(this.switchAmount, 0, 11, dt);

    const base = HIP_POS.clone().lerp(ADS_POS, opts.adsAmount);
    rig.root.position.set(
      base.x + this.bobOffset.x + this.swayX + this.reloadAmount * 0.05,
      base.y + this.bobOffset.y + this.swayY - this.reloadAmount * 0.14 - this.switchAmount * 0.3,
      base.z + this.recoilOffset,
    );
    const hip = 1 - opts.adsAmount;
    const usaModelo = this.models.has(this.current);
    const hipPitch = usaModelo ? MODEL_HIP_PITCH : HIP_PITCH;
    const hipYaw = usaModelo ? MODEL_HIP_YAW : HIP_YAW;
    rig.root.rotation.set(
      hipPitch * hip + this.recoilRot * 0.35 + this.reloadAmount * 0.75 + this.switchAmount * 0.4,
      hipYaw * hip - this.swayX * SWAY_TILT + this.reloadAmount * 0.3,
      this.swayY * SWAY_ROLL - this.reloadAmount * 0.35 + this.recoilRoll,
    );

    // clarao do cano
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const on = this.flashTimer > 0;
    rig.flash.visible = on;
    if (on) {
      const t = this.flashTimer / 0.045;
      (rig.flash.material as THREE.MeshBasicMaterial).opacity = t;
      rig.flash.rotation.z = Math.random() * Math.PI;
      rig.flash.scale.setScalar(lerp(0.75, 1.5, Math.random()));
      this.flashLight.position.copy(rig.root.position).add(rig.muzzlePoint.position);
      this.flashLight.intensity = t * 22;
    } else {
      this.flashLight.intensity = 0;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
