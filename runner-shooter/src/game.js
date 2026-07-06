import * as THREE from "three";
import { CONFIG } from "./config.js";
import { RNG } from "./core/rng.js";
import { Loop } from "./core/loop.js";
import { InstancedPool } from "./core/pool.js";
import { SpatialHash } from "./core/spatialhash.js";
import { Input } from "./input.js";
import { SpawnDirector } from "./systems/spawn.js";
import { EnemySystem } from "./systems/enemies.js";
import { CombatSystem } from "./systems/combat.js";
import { setBarrelModel } from "./entities/props.js";
import { Boss } from "./entities/boss.js";
import * as HUD from "./hud.js";

// Game — owns the Three.js scene, the three InstancedMesh pools (soldiers /
// enemies / bullets), the squad state, and drives the fixed-step simulation +
// interpolated render. World frame: the squad advances along +Z forever;
// `distance == squad.z` is the progression clock every formula keys off.
export class Game {
  constructor(canvas, models = {}) {
    this.canvas = canvas;
    this.models = models; // { soldier, enemy, barrel } each { geo, mat } or null

    // ── renderer / scene / camera ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.perf.targetDpr));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1017);
    this.scene.fog = new THREE.Fog(0x0d1017, 40, CONFIG.world.spawnAhead + 20);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    // brighter, multi-source rig — Meshy textures bake dark, so lift them
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a3040, 2.0));
    this.scene.add(new THREE.AmbientLight(0x5a6478, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); // top, camera-side (front-lights approaching enemies)
    key.position.set(4, 16, -10);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.8); // ahead, low — rims the models
    fill.position.set(-6, 6, 14);
    this.scene.add(fill);

    this._buildFloor();

    // ── pools (one draw call each) ── real GLB geometry when loaded, else a primitive
    const soldierGeo = models.soldier?.geo || new THREE.BoxGeometry(0.4, 0.9, 0.4);
    const soldierMat = models.soldier?.mat || new THREE.MeshLambertMaterial({ color: 0x4da3ff });
    const enemyGeo = models.enemy?.geo || new THREE.ConeGeometry(0.34, 1.0, 6);
    const enemyMat = models.enemy?.mat || new THREE.MeshLambertMaterial({ color: 0xe0473e });
    const bulletGeo = new THREE.SphereGeometry(0.12, 6, 6);
    // primitives sit centred on origin (offset y in-record); GLB geo is baked base-at-0
    this._soldierYOff = models.soldier ? 0 : 0.45;
    this._enemyYOff = models.enemy ? 0 : 0.5;
    this._enemyYaw = models.enemy ? 0 : Math.PI; // cone tip vs modelled facing
    this.soldiers = new InstancedPool(soldierGeo, soldierMat, Math.min(CONFIG.squad.max, CONFIG.pools.soldiers));
    this.enemies = new InstancedPool(enemyGeo, enemyMat, CONFIG.pools.enemies, () => ({ x: 0, y: 0, z: 0, hp: 1, phase: 0 }));
    this.bullets = new InstancedPool(bulletGeo, new THREE.MeshBasicMaterial({ color: 0xffe14d }), CONFIG.pools.bullets, () => ({ x: 0, y: 0.6, z: 0, vz: 0, life: 0 }));
    if (models.barrel) setBarrelModel(models.barrel);
    this.scene.add(this.soldiers.mesh, this.enemies.mesh, this.bullets.mesh);

    // per-soldier smoothed formation position (so the block re-packs, not snaps)
    this._sx = new Float32Array(this.soldiers.capacity);
    this._sz = new Float32Array(this.soldiers.capacity);
    this._sInit = false;

    this.enemyHash = new SpatialHash(CONFIG.separation.cellSize);
    this.props = [];

    // ── squad state ──
    const self = this;
    this.squad = {
      count: CONFIG.squad.start,
      centroidX: 0,
      targetX: 0,
      z: 0,
      fireTimer: 0,
      fireInterval: CONFIG.weapon.fireInterval,
      add(n) { this.count = Math.min(CONFIG.squad.max, this.count + n); },
      damage(n) { this.count = Math.max(0, this.count - n); if (this.count < CONFIG.squad.min) self._gameOver(); },
    };

    this.rng = new RNG(CONFIG.debug.seed);
    this.director = new SpawnDirector(this.scene, this.rng, this);
    this.enemySystem = new EnemySystem(this);
    this.combat = new CombatSystem(this);
    this.input = new Input(canvas);

    this.distance = 0;
    this.wave = 0;
    this.time = 0;

    // campaign state machine: run → boss → levelcomplete → (next) run … → win
    this.level = 0;
    this._applyLevel();
    this.levelStart = 0;
    this.boss = null;
    this.state = "run"; // run | boss | levelcomplete | win | over

    this.loop = new Loop({
      step: CONFIG.perf.fixedStep,
      maxSubSteps: CONFIG.perf.maxSubSteps,
      update: (dt) => this.update(dt),
      render: (alpha) => this.render(alpha),
    });

    this._onResize();
    window.addEventListener("resize", () => this._onResize());
  }

  start() {
    this.loop.start();
  }

  // ── spawn helpers used by the director / combat ──
  spawnEnemy(x, z, hp) {
    const e = this.enemies.spawn();
    if (!e) return; // pool exhausted → drop (perf guard); budget will retry next burst
    e.x = x; e.y = 0.5; e.z = z; e.hp = hp; e.phase = this.rng.range(0, 6.28);
  }
  killEnemy(index) {
    this.enemies.release(index);
  }
  spawnBullet(x, z) {
    const b = this.bullets.spawn();
    if (!b) return;
    b.x = x; b.y = 0.6; b.z = z; b.vz = CONFIG.weapon.bulletSpeed; b.life = CONFIG.weapon.bulletLife;
  }
  onWave(n) {
    this.wave++;
  }
  onBarrelOpened(prop) {
    if (prop.weapon) this.squad.fireInterval = Math.max(0.03, this.squad.fireInterval * CONFIG.barrel.weaponBonus);
    else this.squad.add(prop.reward);
    prop.remove();
  }

  // ── level plumbing ──
  _applyLevel() {
    this.lvl = CONFIG.levels[this.level];
    // multipliers the spawn director + run speed read each step
    this.mul = { speed: this.lvl.speedMul, budget: this.lvl.budgetMul, hp: this.lvl.hpMul };
  }
  _enterBoss() {
    this.state = "boss";
    // scale HP to the squad's firepower so the fight lasts ~targetSeconds no matter
    // how big the squad got (small squad → small boss; 200-strong squad → big boss).
    const fp = Math.max(1, Math.min(CONFIG.weapon.maxVolley, Math.round(this.squad.count / CONFIG.weapon.bulletsPerSoldier)));
    const dps = (fp * CONFIG.weapon.damage / this.squad.fireInterval) * CONFIG.boss.hitFraction;
    const seconds = CONFIG.boss.targetSeconds + this.level * CONFIG.boss.secondsPerLevel;
    const hp = Math.max(CONFIG.boss.minHp, Math.round(dps * seconds));
    this.boss = new Boss(this.scene, this.models?.enemy, {
      x: 0, z: this.squad.z + CONFIG.boss.spawnAhead, hp,
      dps: this.lvl.bossDps, speed: this.lvl.bossSpeed * CONFIG.boss.advanceScale,
    });
    HUD.flash(`⚠ BOSS — ${this.lvl.name}`, false);
  }
  onBossDead() {
    if (this.boss) { this.boss.remove(); this.boss = null; }
    if (this.level >= CONFIG.levels.length - 1) {
      this.state = "win";
      HUD.win(Math.floor(this.distance));
    } else {
      this.state = "levelcomplete";
      HUD.levelComplete(this.level + 1, CONFIG.levels[this.level + 1].name, Math.floor(this.squad.count));
    }
  }
  // advance to the next level (wired to the "Next" button)
  nextLevel() {
    if (this.state !== "levelcomplete") return;
    this.level++;
    this._applyLevel();
    this.levelStart = this.distance;
    this.enemies.forEach((e) => this.enemies.release(e.index)); // clear stragglers
    this.state = "run";
    HUD.hideOverlays();
    HUD.flash(`Level ${this.level + 1}: ${this.lvl.name}`, true);
  }

  // ── fixed-step simulation ──
  update(dt) {
    if (this.state === "over" || this.state === "win" || this.state === "levelcomplete") return; // frozen behind overlay
    this.time += dt;

    // steering is always live (dodge during the boss too)
    const axis = this.input.update(dt);
    this.squad.targetX = axis * CONFIG.world.laneWidth;
    this.squad.centroidX += (this.squad.targetX - this.squad.centroidX) * Math.min(1, CONFIG.squad.moveLerp * dt);

    if (this.state === "run") {
      this.distance += CONFIG.world.runSpeed * this.mul.speed * dt;
      this.squad.z = this.distance;
      this.director.update();
      if (this.distance - this.levelStart >= this.lvl.length) this._enterBoss();
    } else if (this.state === "boss") {
      this.squad.z = this.distance; // lane frozen for the fight
      if (this.boss) this.boss.update(dt, this);
    }

    this.enemySystem.update(dt);

    // auto-fire volleys (at enemies AND the boss)
    this.squad.fireTimer -= dt;
    if (this.squad.fireTimer <= 0) {
      this.squad.fireTimer += this.squad.fireInterval;
      this._fireVolley();
    }

    this.combat.update(dt);
    if (this.state === "run") this._resolveGates();
    this._cull();

    const prog = Math.min(1, (this.distance - this.levelStart) / this.lvl.length);
    HUD.stats({
      count: Math.floor(this.squad.count), distance: this.distance, wave: this.wave,
      enemies: this.enemies.activeCount, bullets: this.bullets.activeCount,
      level: this.level + 1, levelName: this.lvl.name, prog, boss: this.state === "boss",
    });
  }

  _fireVolley() {
    const count = Math.floor(this.squad.count);
    if (count <= 0) return;
    const n = Math.max(1, Math.min(CONFIG.weapon.maxVolley, Math.round(count / CONFIG.weapon.bulletsPerSoldier)));
    const halfW = ((CONFIG.squad.cols - 1) * CONFIG.squad.spacing) * 0.5;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = this.squad.centroidX + (t - 0.5) * 2 * halfW + this.rng.range(-0.1, 0.1);
      this.spawnBullet(x, this.squad.z + 0.6);
    }
  }

  // squad crossing a gate applies its operator to the count exactly once
  _resolveGates() {
    for (const p of this.props) {
      if (p.kind !== "gate" || p.dead || p.applied) continue;
      if (p.z <= this.squad.z) {
        if (Math.abs(this.squad.centroidX - p.x) <= CONFIG.gate.width * 0.5) {
          const before = Math.floor(this.squad.count);
          this.squad.count = Math.max(0, p.apply(this.squad.count));
          HUD.flash(`${p.opLabel}${p.value}  ⇒  ${before} → ${Math.floor(this.squad.count)}`, p.good);
          if (this.squad.count < CONFIG.squad.min) this._gameOver();
        }
        p.applied = true;
      }
    }
  }

  _cull() {
    const behind = this.squad.z - CONFIG.world.despawnBehind;
    // props behind
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      if (p.dead || p.z < behind) {
        p.remove();
        this.props.splice(i, 1);
      }
    }
    // enemies that slipped behind (rare; separation shove) — no bite, just cull
    this.enemies.forEach((e) => {
      if (e.z < behind) this.enemies.release(e.index);
    });
  }

  // ── render (interpolated) ──
  render() {
    // camera chases the squad
    const z = this.squad.z;
    this.camera.position.set(this.squad.centroidX * 0.25, 7.5, z - 9);
    this.camera.lookAt(this.squad.centroidX * 0.15, 0.5, z + 8);

    // scroll the floor grid
    if (this.floorTex) {
      this.floor.position.z = z;
      this.floorTex.offset.y = this.distance / this.floorTile;
    }

    this._renderSquad();
    // enemies
    this.enemies.forEach((e, i) => {
      e.y = this._enemyYOff;
      this.enemies.syncMatrix(i, 1, this._enemyYaw);
    });
    this.enemies.flush();
    // bullets
    this.bullets.forEach((b, i) => this.bullets.syncMatrix(i, 1, 0));
    this.bullets.flush();

    this.renderer.render(this.scene, this.camera);
  }

  _renderSquad() {
    const cap = this.soldiers.capacity;
    const count = Math.min(Math.floor(this.squad.count), cap, CONFIG.squad.maxRendered);
    const cols = CONFIG.squad.cols;
    const sp = CONFIG.squad.spacing;
    const cx = this.squad.centroidX;
    const z0 = this.squad.z;
    // Snap the formation to the running front (centroidX is already smoothed in
    // update()). A per-soldier lerp here was frame-rate dependent and let the block
    // drift metres behind the squad on slow frames — never lag the formation.
    for (let i = 0; i < cap; i++) {
      if (i < count) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const rec = this.soldiers.data[i];
        rec.x = cx + (col - (cols - 1) / 2) * sp;
        rec.y = this._soldierYOff + Math.abs(Math.sin(this.time * 8 + i)) * 0.06; // run bob
        rec.z = z0 - row * sp;
        this.soldiers.syncMatrix(i, 1, 0);
      } else {
        // hide unused instances
        this.soldiers.data[i].x = 0; this.soldiers.data[i].y = -9999; this.soldiers.data[i].z = 0;
        this.soldiers.syncMatrix(i, 0.0001, 0);
      }
    }
    this._sInit = true;
    this.soldiers.flush();
  }

  _buildFloor() {
    this.floorTile = 4; // grid every 4 world units
    const depth = 400, width = CONFIG.world.laneWidth * 2 + 6;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#141a24"; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#243247"; ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.round(width / this.floorTile), Math.round(depth / this.floorTile));
    this.floorTex = tex;
    const geo = new THREE.PlaneGeometry(width, depth);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.floor = new THREE.Mesh(geo, mat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
  }

  _gameOver() {
    if (this.state === "over" || this.state === "win") return;
    this.state = "over";
    HUD.gameOver(Math.floor(this.distance), this.level + 1);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
