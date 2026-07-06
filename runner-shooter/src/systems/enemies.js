import { CONFIG } from "../config.js";

// EnemySystem — movement + separation. Each enemy seeks the squad while pushing
// off its neighbours (boids separation via the shared spatial hash) plus a small
// per-enemy jitter. Result: enemies flow around each other into an organic mass
// instead of overlapping or snapping into straight lines (the brief's explicit
// "no overlap, no firing-line" requirement). O(n) thanks to the hash.
export class EnemySystem {
  constructor(game) {
    this.game = game;
  }
  update(dt) {
    const g = this.game;
    const hash = g.enemyHash;
    const sep = CONFIG.separation;
    const targetX = g.squad.centroidX;
    const targetZ = g.squad.z;

    // rebuild the neighbour hash from current positions
    hash.clear();
    g.enemies.forEach((e) => hash.insert(e));

    g.enemies.forEach((e, i) => {
      // seek the squad (mostly -Z, weave in X)
      let ax = targetX - e.x;
      let az = targetZ - e.z;
      const seekLen = Math.hypot(ax, az) || 1;
      ax = (ax / seekLen) * CONFIG.enemy.speed;
      az = (az / seekLen) * CONFIG.enemy.speed;

      // separation from neighbours
      let sx = 0, sz = 0;
      hash.forNeighbors(e.x, e.z, (o) => {
        if (o === e) return;
        const dx = e.x - o.x;
        const dz = e.z - o.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0 && dist < sep.radius) {
          const push = (sep.radius - dist) / sep.radius;
          sx += (dx / dist) * push;
          sz += (dz / dist) * push;
        }
      });
      ax += sx * sep.strength;
      az += sz * sep.strength;

      // deterministic jitter (breaks residual symmetry / columns)
      e.phase += dt * 3;
      ax += Math.sin(e.phase + i) * sep.jitter;

      e.x += ax * dt;
      e.z += az * dt;

      // clamp to lane
      const lim = CONFIG.world.laneWidth - 0.2;
      if (e.x < -lim) e.x = -lim;
      if (e.x > lim) e.x = lim;

      // reached the squad without being shot: one bite out of the count, then dies
      if (e.z <= targetZ + CONFIG.enemy.touchRange) {
        const bite = CONFIG.enemy.bite * (1 + CONFIG.enemy.biteScale * g.distance);
        g.squad.damage(bite);
        g.killEnemy(e.index); // safe: releasing the current forEach index swap-removes an already-visited slot
      }
    });
  }
}
