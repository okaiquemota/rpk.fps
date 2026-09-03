import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLAYER, WORLD } from '../config';
import { AABB, clamp, randRange } from './math';
import { Input } from './Input';
import { AudioManager } from './Audio';
import { Level } from '../world/Level';
import { PickupManager, type PickupKind } from '../world/Pickups';
import { Player } from '../player/Player';
import { ViewModel } from '../weapons/ViewModel';
import { CombatSystem } from '../weapons/Combat';
import { WEAPON_DEFS, WEAPON_ORDER, type WeaponId } from '../weapons/WeaponDefs';
import { EnemyManager } from '../enemies/EnemyManager';
import { Enemy, disposeEnemyGeometries } from '../enemies/Enemy';
import { ENEMY_DEFS, type EnemyKind } from '../enemies/EnemyTypes';
import { ProjectileSystem } from '../enemies/Projectile';
import { Effects } from '../fx/Effects';
import { HUD } from '../ui/HUD';
import { Screens, type Settings } from '../ui/Screens';

type GameState = 'menu' | 'playing' | 'paused' | 'dead';

const COMBO_WINDOW = 4;
const MAX_COMBO = 10;
const _playerBox = new AABB();
const _tmp = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _ejectAt = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
/** A que distancia do olho o clarao e o tracer nascem, em metros. */
const MUZZLE_WORLD_DISTANCE = 0.85;
const PICKUP_KINDS: PickupKind[] = ['health', 'armor', 'ammo', 'weapon-rifle', 'weapon-shotgun'];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** Cena separada so' pra arma: impede que ela atravesse paredes. */
  private viewScene = new THREE.Scene();
  private viewCamera: THREE.PerspectiveCamera;
  private envMap: THREE.Texture;
  /** Ver warmupShaders(): mantidos vivos so' pra segurar o cache de shaders. */
  private warmupKeepAlive: Enemy[] = [];

  private input: Input;
  private audio = new AudioManager();
  private level: Level;
  private player: Player;
  private viewModel = new ViewModel();
  private effects: Effects;
  private projectiles = new ProjectileSystem();
  private pickups = new PickupManager();
  private enemies: EnemyManager;
  private combat: CombatSystem;
  private hud = new HUD();
  private screens = new Screens();

  private state: GameState = 'menu';
  private lastTime = 0;
  private accumulatedLook = { dx: 0, dy: 0 };

  private score = 0;
  private kills = 0;
  private combo = 1;
  private comboTimer = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private deathTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    // ---------- renderer ----------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    // O fog casa com a cor do horizonte do ceu pra nao ter emenda visivel.
    this.scene.fog = new THREE.Fog(0x3d4350, WORLD.fogNear, WORLD.fogFar);

    // Sem environment map, todo material metalico renderiza praticamente preto.
    // O RoomEnvironment gera um em memoria, sem baixar HDRI nenhum.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.45;
    this.viewScene.environment = this.envMap;
    this.viewScene.environmentIntensity = 0.5;

    // ---------- mundo ----------
    this.level = new Level();
    // As capsulas ejetadas precisam saber onde e' o chao pra parar em cima da
    // caixa certa, e nao atravessar tudo ate' o infinito.
    this.effects = new Effects((x, z, fromY) => this.level.groundHeightAt(x, z, fromY));
    this.effects.onShellLand = () => this.audio.shellDrop();

    this.scene.add(this.level.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.projectiles.group);
    this.scene.add(this.pickups.group);

    this.player = new Player(this.level, {
      onFootstep: () => this.audio.footstep(),
      onJump: () => this.audio.jump(),
      onLand: (force) => this.audio.land(force),
      onHurt: (damage) => {
        this.audio.playerHurt();
        this.hud.flashDamage();
        this.effects.addShake(clamp(damage / 45, 0.12, 0.5));
      },
      onDeath: () => this.onPlayerDeath(),
      onWeaponSwitch: (id) => {
        this.audio.weaponSwitch();
        this.viewModel.setWeapon(id);
      },
    });

    this.enemies = new EnemyManager(this.level, this.projectiles, {
      onMeleeAttack: (damage, from) => this.player.takeDamage(damage, from),
      onEnemyKilled: (enemy) => this.onEnemyKilled(enemy),
      onWaveStart: (index) => this.onWaveStart(index),
      onWaveClear: (index) => this.onWaveClear(index),
      onEnemySpawn: () => this.audio.enemyAlert(),
    });
    this.scene.add(this.enemies.group);

    this.combat = new CombatSystem(this.level, this.enemies, this.effects);

    // ---------- camera da arma ----------
    this.viewCamera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.01, 5,
    );
    this.viewScene.add(this.viewModel.group);
    this.viewScene.add(new THREE.AmbientLight(0xbfd0e8, 2.4));
    const keyLight = new THREE.DirectionalLight(0xfff2dd, 5.5);
    keyLight.position.set(0.7, 1.1, 0.9);
    this.viewScene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7fb0ff, 2.2);
    rimLight.position.set(-0.9, 0.1, -0.5);
    this.viewScene.add(rimLight);

    // ---------- entrada e UI ----------
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.onPointerLockChange(locked);
    this.input.onFallback = () => {
      this.hud.showToast(
        'MOUSE SOLTO',
        'Aqui o navegador nao deixa capturar o cursor. Leve o mouse ate a borda da tela para continuar girando — ou use as setas',
      );
    };

    // Clicar no jogo tenta recapturar o mouse (perde-se ao trocar de aba).
    canvas.addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.input.active) this.input.requestLock();
    });

    this.screens.onPlay = () => this.startRun();
    this.screens.onResume = () => this.resume();
    this.screens.onRestart = () => this.startRun();
    this.screens.onSettingsChange = (s) => this.applySettings(s);
    this.applySettings(this.screens.save.settings);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.warmupShaders();

    this.screens.hideLoading();
    this.screens.showStart();
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ==================================================================
  // ciclo de vida
  // ==================================================================

  /**
   * Compila de uma vez todos os shaders que a partida vai precisar.
   *
   * O three compila o programa de um material na primeira vez que ele aparece na
   * tela, e isso trava o frame. Sem este passo, o engasgo caia no primeiro
   * inimigo, no primeiro tiro e no primeiro item — no meio do jogo. Aqui ele cai
   * na tela inicial, onde ninguem se importa.
   */
  private warmupShaders(): void {
    // Os figurantes precisam ficar DENTRO do campo de visao (e do volume de
    // sombra): fora dele nao entram no render e nada e' preparado por eles.
    // A tela de carregamento cobre isso tudo — ninguem ve' os bonecos.
    const start = this.level.playerStart;
    const dummies: Enemy[] = [];
    const kinds = Object.keys(ENEMY_DEFS) as EnemyKind[];
    kinds.forEach((kind, i) => {
      const spot = new THREE.Vector3(start.x - 3 + i * 2, 0, start.z - 7);
      const e = new Enemy(kind, spot, 1, 1);
      e.group.position.copy(spot);
      this.scene.add(e.group);
      dummies.push(e);
    });
    PICKUP_KINDS.forEach((kind, i) => {
      this.pickups.spawn(kind, new THREE.Vector3(start.x - 2 + i, 0, start.z - 4));
    });

    this.effects.setVisibleForWarmup(true);
    this.viewModel.setVisibleForWarmup(true);

    // `compile` resolve os programas dos materiais, mas nao os shaders de sombra
    // nem o envio das geometrias pra GPU. Um frame de verdade resolve os tres.
    this.renderer.compile(this.scene, this.player.camera);
    this.renderer.compile(this.viewScene, this.viewCamera);
    this.renderer.clear();
    this.renderer.render(this.scene, this.player.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewScene, this.viewCamera);

    this.effects.setVisibleForWarmup(false);
    this.viewModel.setVisibleForWarmup(false);
    this.pickups.clear();
    for (const e of dummies) this.scene.remove(e.group);

    // Os figurantes saem da cena mas os materiais NAO sao descartados: o three
    // libera o programa compilado junto com o ultimo material que o usa, e ai' o
    // primeiro inimigo de verdade pagaria a compilacao de novo. Quatro materiais
    // vivos custam nada perto disso.
    this.warmupKeepAlive = dummies;
  }

  private applySettings(s: Settings): void {
    this.player.sensitivity = s.sensitivity;
    this.player.edgeTurnEnabled = s.edgeTurn;
    this.player.baseFov = s.fov;
    this.player.camera.fov = s.fov;
    this.player.camera.updateProjectionMatrix();
    this.audio.volume = s.volume;
  }

  private startRun(): void {
    this.audio.init();
    this.audio.resume();

    this.player.respawn();
    this.enemies.reset();
    this.projectiles.clear();
    this.pickups.clear();
    this.effects.clear();
    this.hud.reset();

    this.score = 0;
    this.kills = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.deathTimer = 0;

    this.viewModel.setWeapon('pistol');
    this.state = 'playing';
    document.body.classList.add('playing');
    this.screens.hideAll();
    this.hud.show();
    this.input.resetPointerIdle();
    this.input.requestLock();
    this.hud.showToast('SOBREVIVA', 'A primeira onda chega em instantes');
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.body.classList.remove('playing');
    this.input.releaseLock();
    this.audio.suspend();
    this.screens.showPause();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    document.body.classList.add('playing');
    this.screens.hideAll();
    this.audio.resume();
    this.input.resetPointerIdle();
    this.input.requestLock();
  }

  private onPointerLockChange(locked: boolean): void {
    // Perder o lock durante o jogo = pausa. Sair pelo menu ja' esta' tratado.
    // No modo fallback nunca houve lock pra perder.
    if (!locked && this.state === 'playing' && !this.input.fallback) this.pause();
  }

  private onPlayerDeath(): void {
    this.state = 'dead';
    document.body.classList.remove('playing');
    this.deathTimer = 0;
    this.audio.playerDeath();
    this.effects.addShake(0.8);
    this.input.releaseLock();
  }

  private finishRun(): void {
    this.hud.hide();
    this.screens.showGameOver({
      wave: Math.max(1, this.enemies.waveIndex),
      kills: this.kills,
      score: this.score,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
    });
  }

  // ==================================================================
  // eventos de jogo
  // ==================================================================

  private onWaveStart(index: number): void {
    this.audio.waveStart();
    this.hud.showToast(`ONDA ${index}`, this.waveSubtitle(index));

    // Armas novas chegam como item no chao, perto do centro.
    if (index === 2) this.dropWeapon('weapon-rifle');
    if (index === 4) this.dropWeapon('weapon-shotgun');
  }

  private waveSubtitle(index: number): string {
    if (index === 2) return 'Um fuzil apareceu na arena';
    if (index === 3) return 'Atiradores entraram em campo';
    if (index === 4) return 'Uma escopeta apareceu na arena';
    if (index === 5) return 'Cuidado: brutamontes';
    if (index % 5 === 0) return 'Brutamontes a caminho';
    return '';
  }

  private dropWeapon(kind: PickupKind): void {
    for (let i = 0; i < 20; i++) {
      const x = randRange(-10, 10);
      const z = randRange(-10, 10);
      if (this.level.isFreeSpot(x, z, 1)) {
        this.pickups.spawn(kind, new THREE.Vector3(x, this.level.groundHeightAt(x, z, 6), z));
        return;
      }
    }
    this.pickups.spawn(kind, this.level.playerStart.clone());
  }

  private onWaveClear(index: number): void {
    this.audio.waveClear();
    const bonus = index * 100;
    this.score += bonus;
    this.hud.showToast('ONDA LIMPA', `+${bonus} pontos · proxima onda em instantes`);

    // Recompensa de sobrevivencia: um kit no centro entre ondas.
    const spot = this.level.playerStart.clone().lerp(new THREE.Vector3(0, 0, 0), 0.5);
    this.pickups.spawn('health', spot);
    if (index % 2 === 0) this.pickups.spawn('ammo', spot.clone().add(new THREE.Vector3(2, 0, 0)));
    if (index % 3 === 0) this.pickups.spawn('armor', spot.clone().add(new THREE.Vector3(-2, 0, 0)));
  }

  private onEnemyKilled(enemy: Enemy): void {
    this.kills++;
    this.comboTimer = COMBO_WINDOW;
    this.combo = Math.min(MAX_COMBO, this.combo + 1);
    this.score += Math.round(enemy.def.score * this.combo * 0.5);

    this.audio.enemyDeath();

    if (Math.random() < enemy.def.dropChance) {
      const roll = Math.random();
      const kind: PickupKind = roll < 0.45 ? 'health' : roll < 0.85 ? 'ammo' : 'armor';
      this.pickups.spawn(kind, enemy.randomDropOffset());
    }
  }

  private onPickup(kind: PickupKind): void {
    switch (kind) {
      case 'health': {
        const healed = this.player.heal(30);
        this.audio.pickup('health');
        if (healed > 0) this.hud.showToast('', `+${Math.round(healed)} VIDA`);
        break;
      }
      case 'armor':
        this.player.addArmor(50);
        this.audio.pickup('health');
        break;
      case 'ammo': {
        this.audio.pickup('ammo');
        for (const id of WEAPON_ORDER) {
          const w = this.player.weapons.get(id)!;
          if (w.unlocked) w.addAmmo(Math.round(w.def.reserveMax * 0.3));
        }
        break;
      }
      case 'weapon-rifle':
      case 'weapon-shotgun': {
        const id: WeaponId = kind === 'weapon-rifle' ? 'rifle' : 'shotgun';
        const w = this.player.weapons.get(id)!;
        if (!w.unlocked) {
          w.unlocked = true;
          this.player.switchWeapon(id);
          this.hud.showToast(WEAPON_DEFS[id].name, 'Nova arma adquirida');
        } else {
          w.addAmmo(Math.round(w.def.reserveMax * 0.4));
        }
        this.audio.pickup('ammo');
        break;
      }
    }
  }

  // ==================================================================
  // entrada durante o jogo
  // ==================================================================

  private handleCombatInput(dt: number): void {
    const player = this.player;
    const weapon = player.weapon;

    // --- trocar de arma ---
    for (const id of WEAPON_ORDER) {
      if (this.input.wasPressed(`Digit${WEAPON_DEFS[id].slot}`)) player.switchWeapon(id);
    }
    if (this.input.wheelDelta !== 0) player.cycleWeapon(this.input.wheelDelta > 0 ? 1 : -1);

    // --- recarregar ---
    if (this.input.wasPressed('KeyR') && weapon.startReload()) {
      this.audio.reload('out');
      this.viewModel.onReloadStart();
    }

    // --- mirar ---
    player.updateAds(dt, this.input.isMouseDown(2));

    // --- atirar ---
    const wantsFire = weapon.def.automatic
      ? this.input.isMouseDown(0)
      : this.input.wasMousePressed(0);

    if (wantsFire) {
      const result = weapon.tryFire();
      if (result === 'fired') {
        this.fireShot();
      } else if (result === 'empty' && this.input.wasMousePressed(0)) {
        this.audio.dryFire();
        if (weapon.startReload()) {
          this.audio.reload('out');
          this.viewModel.onReloadStart();
        }
      }
    }
  }

  private fireShot(): void {
    const player = this.player;
    const weapon = player.weapon;

    // Onde fica a boca do cano NO MUNDO?
    //
    // A arma e' desenhada noutra cena, com camera e FOV proprios, entao aplicar
    // a matriz da camera do mundo no ponto local erra o alvo: o flash sai solto
    // no ar, longe do cano que voce ve'. O jeito certo e' passar pela TELA —
    // projetar o ponto na camera do viewmodel e desprojetar na do mundo, o que
    // devolve um ponto que cai exatamente sobre o cano desenhado.
    this.viewModel.group.updateMatrixWorld(true);
    const ndc = this.viewModel.muzzleWorldPosition.project(this.viewCamera);
    const muzzleWorld = _muzzle.set(ndc.x, ndc.y, 0.5)
      .unproject(player.camera)
      .sub(player.eyePosition)
      .normalize()
      .multiplyScalar(MUZZLE_WORLD_DISTANCE)
      .add(player.eyePosition);

    const report = this.combat.fire(player, weapon, muzzleWorld);

    this.shotsFired++;
    if (report.anyHit) this.shotsHit++;

    // Clarao que ilumina o mundo (o do viewmodel so' acende a arma) e a
    // capsula saindo pela direita.
    const forward = player.forward();
    const strength = weapon.def.muzzleScale;
    this.effects.muzzleBlast(muzzleWorld, forward, strength);

    _camRight.set(1, 0, 0).applyQuaternion(player.camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(player.camera.quaternion);
    _ejectAt.copy(player.eyePosition)
      .addScaledVector(_camRight, 0.24)
      .addScaledVector(forward, 0.34)
      .addScaledVector(_camUp, -0.1);
    this.effects.ejectShell(_ejectAt, _camRight, _camUp);

    this.audio.shot(weapon.def.id);
    if (report.surfaceHits > 0) this.audio.impact();
    this.viewModel.onFire(weapon.def.kickback);
    player.addRecoil(
      weapon.def.recoilPitch * (1 - player.adsAmount * 0.3),
      weapon.def.recoilYaw,
    );
    this.effects.addShake(weapon.def.shakeAmount * 0.06);

    if (report.anyHit) {
      const killed = report.kills.length > 0;
      const head = report.headshots > 0;
      this.hud.showHitmarker(killed, head);
      this.audio.hitmarker(head);
      this.audio.hitFlesh(head);
      if (head) this.score += 50;
    }

    for (const enemy of report.kills) {
      this.enemies.killEnemy(enemy);
      this.hud.addKillfeed(enemy.def.name, report.headshots > 0);
    }
  }

  // ==================================================================
  // loop
  // ==================================================================

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);

    // Clamp de dt: voltar de uma aba em segundo plano nao pode teleportar todo mundo.
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 20);
    this.lastTime = now;

    if (this.state === 'playing' || this.state === 'dead') {
      this.update(dt);
    }
    this.render();
    this.input.endFrame();
  };

  private update(dt: number): void {
    const player = this.player;

    if (this.state === 'playing') {
      if (this.input.wasPressed('Escape')) { this.pause(); return; }

      this.accumulatedLook.dx = this.input.mouseDX;
      this.accumulatedLook.dy = this.input.mouseDY;

      player.updateLook(this.input, dt);
      this.handleCombatInput(dt);
      player.updateMovement(this.input, dt);

      const reloadEvent = player.weapon.update(dt);
      if (reloadEvent === 'reload-finished') this.audio.reload('in');

      // combo esfria se voce parar de matar
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 1;
      }
    } else {
      // morto: o mundo continua rodando, a camera cai
      player.updateMovement(this.input, dt);
      this.deathTimer += dt;
      if (this.deathTimer > 2.2) {
        this.state = 'menu';
        this.finishRun();
        return;
      }
    }

    // ---- mundo ----
    this.enemies.update(dt, player.position, player.alive);

    _playerBox.setFromFootprint(
      player.position.x, player.position.y, player.position.z,
      PLAYER.radius, player.alive ? PLAYER.heightStand : 0.5,
    );
    for (const hit of this.projectiles.update(dt, this.level.colliders, _playerBox)) {
      if (hit.hitPlayer) {
        player.takeDamage(hit.damage, hit.position);
      }
      this.effects.impact(hit.position, _tmp.set(0, 1, 0));
      this.audio.impact();
    }

    for (const kind of this.pickups.update(dt, player.position)) this.onPickup(kind);

    this.effects.update(dt);
    player.updateCamera(dt, this.effects.shakeOffset);

    this.viewModel.update(dt, {
      moveSpeed01: clamp(player.horizontalSpeed / PLAYER.speedSprint, 0, 1),
      grounded: player.grounded,
      adsAmount: player.adsAmount,
      lookDX: this.accumulatedLook.dx,
      lookDY: this.accumulatedLook.dy,
      reloadProgress: player.weapon.reloadProgress,
      reloading: player.weapon.reloading,
    });

    this.updateHud(dt);
  }

  private updateHud(dt: number): void {
    const player = this.player;
    const weapon = player.weapon;

    this.hud.update(dt);
    this.hud.setHealth(player.health, player.armor);
    this.hud.setAmmo(
      weapon.ammoInMag, weapon.reserve, weapon.hasInfiniteReserve,
      weapon.def.name, weapon.canReload, weapon.def.magSize,
    );
    this.hud.setWave(Math.max(1, this.enemies.waveIndex), this.enemies.remainingInWave);
    this.hud.setScore(this.score, this.kills, this.combo);
    this.hud.setEdgeTurn(player.edgeTurnX, player.edgeTurnY);
    this.hud.setCrosshairSpread(
      weapon.currentSpread(player.adsAmount, player.horizontalSpeed > 1.2, !player.grounded),
      player.adsAmount,
    );

    const unlocked = new Set<WeaponId>(
      WEAPON_ORDER.filter((id) => player.weapons.get(id)!.unlocked),
    );
    this.hud.setWeaponSlots(unlocked, player.currentWeaponId);
  }

  private render(): void {
    this.renderer.clear();
    this.renderer.render(this.scene, this.player.camera);

    // A arma vai depois, com o depth buffer limpo: sempre por cima do mundo.
    if (this.state === 'playing') {
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
    }
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.player.onResize();
    this.viewCamera.aspect = window.innerWidth / window.innerHeight;
    this.viewCamera.updateProjectionMatrix();
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.level.dispose();
    this.effects.dispose();
    this.projectiles.dispose();
    this.pickups.dispose();
    this.viewModel.dispose();
    for (const e of this.warmupKeepAlive) e.dispose();
    disposeEnemyGeometries();
    this.envMap.dispose();
    this.renderer.dispose();
  }
}

