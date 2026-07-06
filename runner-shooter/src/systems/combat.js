import { CONFIG } from "../config.js";

// CombatSystem — bullets vs the world. "Count-based damage": every bullet
// subtracts weapon.damage from a target's integer HP; enemies/barrels die at 0.
// Enemy broad-phase uses the shared spatial hash (bullets are the many, enemies
// the few-per-cell), props are a short linear scan. Bullets and dead enemies are
// returned to their pools — no allocation in the hot path.
export class CombatSystem {
  constructor(game) {
    this.game = game;
  }
  update(dt) {
    const g = this.game;
    const dmg = CONFIG.weapon.damage;
    const hash = g.enemyHash;

    // refresh hash after EnemySystem moved everything, so hits are accurate
    hash.clear();
    g.enemies.forEach((e) => hash.insert(e));

    const bulletR = 0.15;
    const toRelease = [];

    g.bullets.forEach((b, bi) => {
      b.z += b.vz * dt;
      b.life -= dt;
      // cull RELATIVE to the squad — squad.z grows unbounded as the run advances, so
      // an absolute threshold would delete every bullet the moment distance passes it
      // (that was the "no bullets at the boss" bug: boss sits at ~120m+).
      if (b.life <= 0 || b.z - g.squad.z > CONFIG.world.spawnAhead + 10) {
        toRelease.push(bi);
        return;
      }

      // ── vs enemies ──
      let hit = false;
      hash.forNeighbors(b.x, b.z, (e) => {
        if (hit || !e._alive) return;
        const rr = CONFIG.enemy.radius + bulletR;
        const dx = e.x - b.x;
        const dz = e.z - b.z;
        if (dx * dx + dz * dz <= rr * rr) {
          hit = true;
          e.hp -= dmg;
          if (e.hp <= 0) {
            g.killEnemy(e.index);
            if (CONFIG.enemy.reward) g.squad.add(CONFIG.enemy.reward);
          }
        }
      });
      if (hit) {
        toRelease.push(bi);
        return;
      }

      // ── vs boss (single, big target) ──
      const boss = g.boss;
      if (boss && !boss.dead && Math.abs(boss.z - b.z) < 2.5 && Math.abs(boss.x - b.x) < CONFIG.boss.hitRadius) {
        if (boss.hit(dmg)) g.onBossDead();
        toRelease.push(bi);
        return;
      }

      // ── vs props (few; linear, gated by z proximity) ──
      const props = g.props;
      for (let p = 0; p < props.length; p++) {
        const prop = props[p];
        if (prop.dead) continue;
        if (Math.abs(prop.z - b.z) > 0.6) continue;
        const halfW = (prop.kind === "gate" ? CONFIG.gate.width : 1.4) * 0.5;
        if (Math.abs(prop.x - b.x) > halfW) continue;
        if (prop.kind === "gate") {
          prop.hit();
        } else {
          if (prop.hit(dmg)) g.onBarrelOpened(prop);
        }
        hit = true;
        break;
      }
      if (hit) toRelease.push(bi);
    });

    for (let i = 0; i < toRelease.length; i++) g.bullets.release(toRelease[i]);
  }
}
