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
import type { WeaponModel } from '../weapons/WeaponModels';
import { EnemyManager } from '../enemies/EnemyManager';
import { Enemy, disposeEnemyGeometries } from '../enemies/Enemy';
import { ENEMY_DEFS, type EnemyKind } from '../enemies/EnemyTypes';
import { ProjectileSystem } from '../enemies/Projectile';
import { Effects } from '../fx/Effects';
import { HUD } from '../ui/HUD';
import { warmupWeaponIcons } from '../ui/weaponIcons';
import { WorldMarkers } from '../ui/WorldMarkers';
import { PerfMeter } from '../ui/PerfMeter';
import { detectRenderer } from './gpu';
import { Minimap } from '../ui/Minimap';
import { Compass } from '../ui/Compass';
import { Screens, type Settings } from '../ui/Screens';
import { rollUpgrades, UPGRADES, type Upgrade } from '../player/Stats';
import { ShootingRange } from '../modes/ShootingRange';

type GameState = 'menu' | 'playing' | 'paused' | 'dead' | 'upgrading';

/** Sobrevivencia por ondas, ou campo de tiro pra testar armas. */
export type GameMode = 'waves' | 'range';

const COMBO_WINDOW = 4;
const MAX_COMBO = 10;
const _playerBox = new AABB();
const _tmp = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _ejectAt = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _listenerFwd = new THREE.Vector3();
const _listenerUp = new THREE.Vector3();
const _bufSize = new THREE.Vector2();
/** A que distancia do olho o clarao e o tracer nascem, em metros. */
const MUZZLE_WORLD_DISTANCE = 0.85;
/** Uma linha explicando cada tempero de onda, na hora que ele aparece. */
const MODIFIER_HINTS: Record<string, string> = {
  HORDA: 'Muitos, rapidos e fracos — nao deixe cercar',
  ELITE: 'Poucos e duros, mas valem bem mais pontos',
  CERCO: 'Atiradores por toda parte — use as coberturas',
};

/** Que timbre cada arma usa. */
const SHOT_SOUND: Record<WeaponId, 'pistol' | 'rifle' | 'shotgun' | 'heavy' | 'sniper'> = {
  pistol: 'pistol', deagle: 'heavy', smg: 'rifle',
  rifle: 'rifle', shotgun: 'shotgun', sniper: 'sniper',
};

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
  private viewModel: ViewModel;
  private effects: Effects;
  private projectiles = new ProjectileSystem();
  private pickups = new PickupManager();
  private enemies: EnemyManager;
  private combat: CombatSystem;
  private hud = new HUD();
  private markers = new WorldMarkers();
  private minimap: Minimap;
  private compass = new Compass();
  private perf = new PerfMeter(document.getElementById('perf')!);
  private screens = new Screens();

  private state: GameState = 'menu';
  private mode: GameMode = 'waves';
  private range: ShootingRange;
  private lastTime = 0;
  /** Frame REAL, sem o clamp do dt — o medidor precisa do numero cru. */
  private lastFrameDt = 0;
  private resolution = 1;
  private accumulatedLook = { dx: 0, dy: 0 };

  private score = 0;
  private kills = 0;
  private combo = 1;
  private comboTimer = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private deathTimer = 0;
  private wasInFallback = false;

  constructor(canvas: HTMLCanvasElement, models: Map<WeaponId, WeaponModel> = new Map()) {
    this.viewModel = new ViewModel(models);
    // ---------- renderer ----------
    // Sem GPU, cada amostra extra de suavizacao e' trabalho de CPU multiplicado
    // pela tela inteira — e' dos custos mais caros que existem em software.
    const gpu = detectRenderer();
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: !gpu.software, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    // Casa com a bruma do horizonte do ceu (Level.buildSky); destoando, a
    // parede do fundo recorta do ceu como adesivo.
    this.scene.fog = new THREE.Fog(0xaf9f83, WORLD.fogNear, WORLD.fogFar);

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
      onHurt: (damage, fromDirection) => {
        this.audio.playerHurt();
        this.hud.flashDamage();
        this.effects.addShake(clamp(damage / 45, 0.12, 0.5));

        // Angulo no espaco do jogador: 0 e' de frente, +PI/2 pela direita.
        const yaw = this.player.yaw;
        const lateral = fromDirection.x * Math.cos(yaw) - fromDirection.z * Math.sin(yaw);
        const frontal = -fromDirection.x * Math.sin(yaw) - fromDirection.z * Math.cos(yaw);
        this.hud.showHitDirection(Math.atan2(lateral, frontal));
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
      onEnemySpawn: (enemy) => this.audio.enemyAlert(enemy.center()),
      onEnemyStep: (enemy) => this.audio.enemyStep(enemy.position),
      onEnemyShoot: (enemy) => this.audio.enemyShot(enemy.muzzlePosition()),
    });
    this.scene.add(this.enemies.group);

    this.combat = new CombatSystem(this.level, this.enemies, this.effects);
    this.range = new ShootingRange();
    this.range.group.visible = false;
    this.scene.add(this.range.group);

    this.minimap = new Minimap(this.level);

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
    this.input.onFallback = () => { this.wasInFallback = true; this.announceFallback(); };
    this.input.onLockChange = (locked) => this.onPointerLockChange(locked);

    // Clicar no jogo tenta recapturar o mouse. Vale mesmo estando em fallback:
    // a recusa pode ter sido passageira, e o Input sabe se conter entre pedidos.
    canvas.addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });

    // Entrar em tela cheia costuma destravar a captura do mouse; quando nao
    // destrava, ao menos a area pra girar passa a ser o monitor inteiro.
    document.addEventListener('fullscreenchange', () => {
      this.onResize();
      if (document.fullscreenElement && this.state === 'playing') {
        window.setTimeout(() => this.input.requestLock(true), 140);
      }
    });

    this.screens.onPlay = () => this.startRun('waves');
    this.screens.onPlayRange = () => this.startRun('range');
    this.screens.onResume = () => this.resume();
    this.screens.onRestart = () => this.startRun(this.mode);
    this.screens.onSettingsChange = (s) => this.applySettings(s);
    this.screens.onFullscreen = () => { this.requestFullscreen(); this.resume(); };
    this.screens.onUpgradePicked = (u) => this.applyUpgrade(u);
    this.applySettings(this.screens.save.settings);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.warmupShaders();
    warmupWeaponIcons();
    // Som gravado, se houver: baixa agora, decodifica quando o contexto nascer.
    void this.audio.preloadShotSamples();

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
    // O campo de tiro tem materiais proprios: sem ele visivel aqui, o custo
    // de compilar reapareceria ao escolher o modo.
    this.range.group.visible = true;

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
    this.range.group.visible = false;
    this.pickups.clear();
    for (const e of dummies) this.scene.remove(e.group);

    // Os figurantes saem da cena mas os materiais NAO sao descartados: o three
    // libera o programa compilado junto com o ultimo material que o usa, e ai' o
    // primeiro inimigo de verdade pagaria a compilacao de novo. Quatro materiais
    // vivos custam nada perto disso.
    this.warmupKeepAlive = dummies;
  }

  /** Pede tela cheia. Se o navegador recusar, o jogo segue igual. */
  private requestFullscreen(): void {
    if (document.fullscreenElement) return;
    try {
      const r = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      if (r instanceof Promise) r.catch(() => { /* sem tela cheia, paciencia */ });
    } catch {
      /* idem */
    }
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else this.requestFullscreen();
  }

  /**
   * Explica o modo de mira solta.
   *
   * De proposito, nao afirma a causa: `featurePolicy.allowsFeature('pointer-lock')`
   * responde `false` ate' em pagina normal onde a captura funciona, entao usar
   * isso pra escolher a mensagem so' produz diagnostico errado. Dizemos o que
   * fazer, que serve nos dois casos.
   */
  private announceFallback(): void {
    this.hud.showToast(
      'MOUSE SOLTO',
      'Nao consegui capturar o cursor. Clique na tela ou tecle F para tela cheia e tentar de novo — enquanto isso, empurre o mouse na borda para girar',
    );
  }

  private applySettings(s: Settings): void {
    this.player.sensitivity = s.sensitivity;
    this.player.edgeTurnEnabled = s.edgeTurn;
    this.player.baseFov = s.fov;
    this.player.camera.fov = s.fov;
    this.player.camera.updateProjectionMatrix();
    this.audio.volume = s.volume;
    this.resolution = s.resolution;
    this.applyResolution();
  }

  /**
   * Desenha numa resolucao menor que a da tela, deixando o navegador esticar.
   *
   * O custo do quadro cresce com a AREA: 70% de resolucao sao 49% dos pixels.
   * Como o gargalo aqui e' por pixel (a geometria e' de 4 mil triangulos, que
   * nao derruba nada), este e' o ajuste com mais efeito do jogo inteiro.
   */
  private applyResolution(): void {
    const base = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(base * this.resolution);
  }

  private startRun(mode: GameMode = 'waves'): void {
    this.mode = mode;
    this.audio.init();
    this.audio.resume();

    this.player.respawn();
    this.enemies.reset();
    this.projectiles.clear();
    this.pickups.clear();
    this.effects.clear();
    this.markers.clear();
    this.hud.reset();

    this.score = 0;
    this.kills = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.deathTimer = 0;

    this.range.reset();
    this.range.group.visible = mode === 'range';
    this.combat.setExtraTargets(mode === 'range' ? this.range.targets : []);
    if (mode === 'range') this.level.useRangeLayout(this.range.colliders);
    else this.level.useArenaLayout();
    this.minimap.setLabel(mode === 'range' ? 'CAMPO DE TIRO' : 'ARENA');

    if (mode === 'range') {
      // No campo de tiro voce chega com tudo na mao: o proposito e' comparar
      // armas, nao desbloquear.
      this.player.position.copy(this.range.spawn);
      this.player.yaw = 0;
      for (const w of this.player.weapons.values()) {
        w.unlocked = true;
        w.reset();
      }
    }

    this.viewModel.setWeapon('pistol');
    this.state = 'playing';
    document.body.classList.add('playing');
    this.screens.hideAll();
    this.hud.show();
    this.input.resetPointerIdle();
    // Os dois no mesmo gesto do clique: e' a ativacao do usuario que autoriza.
    this.requestFullscreen();
    this.input.requestLock(true);
    if (mode === 'range') {
      this.hud.showToast('CAMPO DE TIRO', 'Todas as armas liberadas · municao infinita · L limpa a parede');
    } else {
      this.hud.showToast('SOBREVIVA', 'A primeira onda chega em instantes');
    }
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
    this.input.requestLock(true);
  }

  private onPointerLockChange(locked: boolean): void {
    if (locked) {
      if (this.wasInFallback) {
        this.wasInFallback = false;
        this.hud.showToast('MOUSE CAPTURADO', 'Mira normal de FPS');
      }
      return;
    }
    // Perder o lock durante o jogo = pausa. Sair pelo menu ja' esta' tratado.
    // No modo fallback nunca houve lock pra perder.
    if (this.state === 'playing' && !this.input.fallback) this.pause();
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
    const taken = [...this.player.upgradesTaken.entries()]
      .map(([id, count]) => ({ name: UPGRADES.find((u) => u.id === id)?.name ?? id, count }))
      .sort((a, b) => b.count - a.count);
    this.screens.showGameOver({
      wave: Math.max(1, this.enemies.waveIndex),
      kills: this.kills,
      score: this.score,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
    }, taken);
  }

  // ==================================================================
  // eventos de jogo
  // ==================================================================

  private onWaveStart(index: number): void {
    this.audio.waveStart();
    if (this.player.stats.armorPerWave > 0) this.player.addArmor(this.player.stats.armorPerWave);

    const mod = this.enemies.modifierLabel;
    this.hud.showToast(
      mod ? `ONDA ${index} · ${mod}` : `ONDA ${index}`,
      mod ? MODIFIER_HINTS[mod] ?? '' : this.waveSubtitle(index),
    );

    // Armas novas chegam como item no chao, perto do centro. Quem manda e' o
    // `unlockWave` de cada arma — nao ha lista repetida aqui.
    for (const id of WEAPON_ORDER) {
      const def = WEAPON_DEFS[id];
      if (def.unlockWave === index && !this.player.weapons.get(id)!.unlocked) {
        this.dropWeapon(`weapon-${id}`);
      }
    }
  }

  private waveSubtitle(index: number): string {
    const arma = WEAPON_ORDER.find((id) => WEAPON_DEFS[id].unlockWave === index);
    if (arma) return `${WEAPON_DEFS[arma].name} apareceu na arena`;
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
    this.hud.showToast('ONDA LIMPA', `+${bonus} pontos`);
    this.offerUpgrades(index);

    // Recompensa de sobrevivencia: um kit no centro entre ondas.
    const spot = this.level.playerStart.clone().lerp(new THREE.Vector3(0, 0, 0), 0.5);
    this.pickups.spawn('health', spot);
    if (index % 2 === 0) this.pickups.spawn('ammo', spot.clone().add(new THREE.Vector3(2, 0, 0)));
    if (index % 3 === 0) this.pickups.spawn('armor', spot.clone().add(new THREE.Vector3(-2, 0, 0)));
  }

  /**
   * Abre a escolha de melhorias. O jogo congela aqui — sem isso a onda seguinte
   * chegaria enquanto a pessoa le' as cartas.
   */
  private offerUpgrades(wave: number): void {
    const options = rollUpgrades(this.player.upgradesTaken, 3);
    if (options.length === 0) return; // tudo no maximo: segue o jogo

    this.state = 'upgrading';
    document.body.classList.remove('playing');
    this.input.releaseLock();
    this.screens.showUpgrades(wave, options, this.player.upgradesTaken);
  }

  private applyUpgrade(upgrade: Upgrade): void {
    if (this.state !== 'upgrading') return;
    this.player.takeUpgrade(upgrade);
    this.hud.showToast(upgrade.name, upgrade.description);

    this.state = 'playing';
    document.body.classList.add('playing');
    this.screens.hideAll();
    this.input.resetPointerIdle();
    this.input.requestLock(true);
  }

  private onEnemyKilled(enemy: Enemy): void {
    this.kills++;
    this.comboTimer = COMBO_WINDOW;
    this.combo = Math.min(MAX_COMBO, this.combo + 1);
    this.score += Math.round(enemy.def.score * this.combo * 0.5 * this.enemies.modifierScoreMult);

    this.audio.enemyDeath(enemy.center());

    const stats = this.player.stats;
    if (stats.lifestealPerKill > 0) this.player.heal(stats.lifestealPerKill);
    if (stats.ammoOnKill > 0) this.player.weapon.refillFraction(stats.ammoOnKill);

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
      default: {
        // `weapon-<id>`: pegar a arma no chao desbloqueia e ja' troca pra ela.
        const id = kind.slice('weapon-'.length) as WeaponId;
        const w = this.player.weapons.get(id);
        if (!w) break;
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

    if (this.mode === 'range') {
      this.range.noteShot(weapon.def.pellets);
      for (const p of report.surfacePoints) this.range.notePatternHit(p);
      // Reserva sempre cheia: trocar de arma pra testar nao pode esbarrar em
      // ficar sem bala.
      if (!weapon.hasInfiniteReserve) weapon.reserve = weapon.def.reserveMax;
    }

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

    this.audio.shot(SHOT_SOUND[weapon.def.id], undefined, weapon.def.id);
    if (report.surfaceHits > 0) this.audio.impact();
    this.viewModel.onFire(weapon.def.kickback);
    // Mirar segura a arma: o mesmo padrao, com menos amplitude.
    const kick = weapon.recoilStep();
    const adsDamp = 1 - player.adsAmount * 0.35;
    player.addRecoil(kick.pitch * adsDamp, kick.yaw * adsDamp);
    this.viewModel.onRecoilSide(kick.yaw);
    this.effects.addShake(weapon.def.shakeAmount * 0.06);

    for (const hit of report.hits) {
      this.markers.showDamage(hit.point, hit.damage, hit.headshot, hit.killed);
      if (!hit.killed) this.markers.trackEnemy(hit.enemy);
    }

    if (report.anyHit) {
      const killed = report.kills.length > 0;
      const head = report.headshots > 0;
      this.hud.showHitmarker(killed, head);
      this.audio.hitmarker(head);
      this.audio.hitFlesh(head, report.hits[0]?.point);
      if (head) this.score += 50;
    }

    for (const enemy of report.kills) {
      this.enemies.killEnemy(enemy);
      this.hud.addKillfeed(enemy.def.name, report.headshots > 0, weapon.def.id);
      this.hud.showKillBanner(enemy.def.name, report.headshots > 0);
    }
  }

  // ==================================================================
  // loop
  // ==================================================================

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);

    // Clamp de dt: voltar de uma aba em segundo plano nao pode teleportar todo mundo.
    // O medidor guarda o valor CRU: com o clamp, um frame de 200ms apareceria
    // como 50 e o F3 mentiria justamente quando importa.
    const cru = (now - this.lastTime) / 1000;
    this.lastFrameDt = cru;
    const dt = Math.min(cru, 1 / 20);
    this.lastTime = now;

    if (this.state === 'upgrading') {
      // As mesmas teclas de trocar de arma escolhem a carta — o dedo ja' esta' la'.
      for (let i = 0; i < 3; i++) {
        if (this.input.wasPressed(`Digit${i + 1}`)) { this.screens.pickUpgradeByIndex(i); break; }
      }
    } else if (this.state === 'playing' || this.state === 'dead') {
      this.update(dt);
    }
    this.render();
    this.input.endFrame();
  };

  private update(dt: number): void {
    const player = this.player;

    if (this.state === 'playing') {
      if (this.input.wasPressed('Escape')) { this.pause(); return; }
      if (this.input.wasPressed('KeyF')) this.toggleFullscreen();
      if (this.input.wasPressed('F3')) this.perf.toggle();

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
    if (this.mode === 'range') {
      this.range.update(dt);
      // L limpa os buracos da parede: da' pra repetir o teste de padrao limpo.
      if (this.input.wasPressed('KeyL')) {
        this.range.clearPattern();
        this.effects.clearDecals();
        this.hud.showToast('', 'PAREDE LIMPA');
      }
    } else {
      this.enemies.update(dt, player.position, player.alive);
    }

    _playerBox.setFromFootprint(
      player.position.x, player.position.y, player.position.z,
      PLAYER.radius, player.alive ? PLAYER.heightStand : 0.5,
    );
    for (const hit of this.projectiles.update(dt, this.level.colliders, _playerBox)) {
      if (hit.hitPlayer) {
        player.takeDamage(hit.damage, hit.position);
      }
      this.effects.impact(hit.position, _tmp.set(0, 1, 0));
      this.audio.impact(hit.position);
    }

    for (const kind of this.pickups.update(dt, player.position)) this.onPickup(kind);

    this.effects.update(dt);
    player.updateCamera(dt, this.effects.shakeOffset);
    this.markers.update(dt, player.camera);
    this.minimap.update(player.position, player.yaw, this.enemies.enemies, this.pickups.positions);
    this.compass.update(player.yaw);

    // Os ouvidos vao junto com a camera; sem isso o panner posiciona tudo
    // em relacao a origem do mundo.
    _listenerFwd.set(0, 0, -1).applyQuaternion(player.camera.quaternion);
    _listenerUp.set(0, 1, 0).applyQuaternion(player.camera.quaternion);
    this.audio.setListener(player.camera.position, _listenerFwd, _listenerUp);

    // A luneta so' entra depois de metade da mirada, pra transicao nao piscar.
    const scoped = player.weapon.def.scoped && player.adsAmount > 0.55;
    this.hud.setScope(scoped);

    this.viewModel.update(dt, {
      scopedOut: scoped,
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
    this.hud.setHealth(player.health, player.armor, player.maxHealth);
    this.hud.setAmmo(
      weapon.ammoInMag, weapon.reserve, weapon.hasInfiniteReserve,
      weapon.def.name, weapon.canReload, weapon.magSize, weapon.def.id,
    );
    // So' o topo da tela muda entre os modos. Mira, giro de borda e slots de
    // arma valem nos dois — e no campo de tiro a mira abrindo com o recuo e'
    // justamente o que se quer observar.
    this.hud.setTeamScore(null);
    if (this.mode === 'range') {
      this.hud.setRangeStats(this.range.stats);
      this.hud.setWave(0, 0, 'TREINO');
    } else {
      this.hud.setRangeStats(null);
      this.hud.setWave(
        Math.max(1, this.enemies.waveIndex), this.enemies.remainingInWave,
        this.enemies.modifierLabel,
      );
      this.hud.setScore(this.score, this.kills, this.combo);
    }

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
    // O info do three zera sozinho a cada render(): le' ANTES do proximo passe,
    // senao a conta vem so' da arma.
    const alvo = this.renderer.getDrawingBufferSize(_bufSize);
    this.perf.sample(this.lastFrameDt, this.renderer.info, alvo.x, alvo.y);

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
    this.minimap.onResize();
    this.compass.onResize();
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
    this.range.dispose();
    for (const e of this.warmupKeepAlive) e.dispose();
    disposeEnemyGeometries();
    this.envMap.dispose();
    this.renderer.dispose();
  }
}

