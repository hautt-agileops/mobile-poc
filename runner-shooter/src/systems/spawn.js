import { CONFIG } from "../config.js";
import { Gate, Barrel } from "../entities/props.js";

// SpawnDirector — the "intentional, not random clutter" brain. Everything is a
// FORMULA of distance travelled (metres), not a timer, so difficulty tracks
// progress and the whole level is reproducible from the seed:
//
//   enemyBudget(d) = budgetBase + budgetSlope · d        (spent per burst)
//   enemyHp(d)     = baseHp · (1 + hpPerDistance · d)
//   gates/barrels  = fixed distance cadences with jitter
//
// Bursts are placed as a loose lateral cluster; the separation system untangles
// them into an organic mass instead of a firing-line.
export class SpawnDirector {
  constructor(scene, rng, game) {
    this.scene = scene;
    this.rng = rng;
    this.game = game;
    const s = CONFIG.spawn;
    this.nextEnemy = s.firstSafeDistance + s.burstInterval;
    this.nextGate = s.firstSafeDistance + s.gateInterval;
    this.nextBarrel = s.firstSafeDistance + s.barrelInterval;
  }

  enemyBudget(d) {
    return (CONFIG.spawn.budgetBase + CONFIG.spawn.budgetSlope * d) * this.game.mul.budget;
  }
  enemyHp(d) {
    return Math.max(1, Math.round(CONFIG.enemy.baseHp * (1 + CONFIG.enemy.hpPerDistance * d) * this.game.mul.hp));
  }

  update() {
    const d = this.game.distance;
    const s = CONFIG.spawn;
    // ahead of the SQUAD, not an absolute world Z — squad.z grows unbounded as the run
    // advances, so an absolute spawn point would land behind the squad past ~90m and get
    // culled immediately (content would stop appearing mid-level).
    const aheadZ = this.game.squad.z + CONFIG.world.spawnAhead;

    // ── enemy burst: convert this burst's budget into a scattered cluster ──
    if (d >= this.nextEnemy) {
      let budget = this.enemyBudget(d);
      const hp = this.enemyHp(d);
      const cost = s.enemyCostBase;
      let n = Math.max(1, Math.floor(budget / cost));
      n = Math.min(n, 60); // per-burst safety cap
      for (let i = 0; i < n; i++) {
        const x = this.rng.range(-1, 1) * (CONFIG.world.laneWidth - 0.6);
        const z = aheadZ + this.rng.range(-s.clusterSpread, s.clusterSpread);
        this.game.spawnEnemy(x, z, hp);
      }
      this.game.onWave(n);
      this.nextEnemy = d + Math.max(6, s.burstInterval + this.rng.range(-s.burstJitter, s.burstJitter));
    }

    // ── gate pair: a good/bad (or good/good) choice you weave between ──
    if (d >= this.nextGate) {
      this._spawnGatePair(d, aheadZ);
      this.nextGate = d + s.gateInterval;
    }

    // ── barrel: soldier reward or weapon upgrade ──
    if (d >= this.nextBarrel) {
      const weapon = this.rng.bool(CONFIG.barrel.weaponChance);
      const hp = Math.round(CONFIG.barrel.hp * (1 + CONFIG.barrel.hpPerDistance * d));
      const reward = Math.round(CONFIG.barrel.rewardBase * (1 + CONFIG.barrel.rewardPerDistance * d));
      const x = this.rng.range(-0.6, 0.6) * CONFIG.world.laneWidth;
      this.game.props.push(new Barrel(this.scene, { x, z: aheadZ, hp, reward, weapon }));
      this.nextBarrel = d + s.barrelInterval;
    }
  }

  _spawnGatePair(d, z) {
    const g = CONFIG.gate;
    const half = CONFIG.world.laneWidth * 0.5;
    const bothGood = this.rng.bool(0.3);
    const sides = this.rng.bool() ? [-half, half] : [half, -half];

    const mk = (x, good) => {
      const table = good ? g.goodOps : g.badOps;
      const choice = this.rng.pick(table);
      // multiply/divide want small magnitudes; add/subtract want big ones
      let value;
      if (choice.op === "mul" || choice.op === "div") value = this.rng.int(2, 3);
      else value = Math.max(2, Math.round(g.valueBase + g.valuePerDistance * d));
      this.game.props.push(new Gate(this.scene, { x, z, op: choice.op, label: choice.label, value, good }));
    };
    mk(sides[0], true);
    mk(sides[1], bothGood ? true : false);
  }
}
