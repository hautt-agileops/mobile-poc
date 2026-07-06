// ─────────────────────────────────────────────────────────────────────────
// config.js — SINGLE source of truth for every tunable number.
//
// Nothing else in the codebase hard-codes gameplay values; systems read from
// here so the whole game can be retuned live (see tuning.js, which builds a
// lil-gui panel straight off this object). Grouped by system.
// ─────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  world: {
    laneWidth: 6, // playfield half-extents in X the squad can weave across (±)
    runSpeed: 14, // base forward scroll speed (units/s); world moves toward squad
    despawnBehind: 8, // cull props/enemies this far behind the squad
    spawnAhead: 90, // how far ahead (+Z) content is placed
    floorLength: 220, // scrolling floor tile length
  },

  squad: {
    start: 12, // starting soldier count
    min: 1, // game over below this
    max: 400, // formation cap (gameplay count)
    maxRendered: 140, // only draw this many soldier models (perf on low-end phones); count still counts
    cols: 12, // formation grid width
    spacing: 0.55, // soldier-to-soldier gap in formation
    followLerp: 12, // how snappily the formation re-packs after count change
    moveLerp: 14, // how snappily the squad centroid tracks the input X
    radius: 0.28, // soldier body radius (collision + separation)
  },

  weapon: {
    fireInterval: 0.14, // seconds between volleys (whole squad fires a volley)
    bulletsPerSoldier: 1, // volley size scales with squad size / this
    maxVolley: 60, // hard cap on bullets spawned per volley (perf)
    damage: 1, // count-based: each bullet subtracts this from target HP
    bulletSpeed: 42,
    bulletLife: 3, // seconds before auto-recycle
    spread: 0.12, // lateral aim jitter (radians)
  },

  enemy: {
    baseHp: 3,
    hpPerDistance: 0.02, // HP scales with distance travelled (progression)
    speed: 9, // approach speed toward the squad
    radius: 0.34,
    bite: 3, // soldiers removed when an UNSHOT enemy reaches the squad, then it dies
    biteScale: 0.01, // bite grows with distance (bite · (1 + biteScale·d))
    touchRange: 0.9, // contact distance (enemy.radius + squad reach)
    reward: 0, // soldiers gained per kill (0 = kills only thin the enemy budget)
  },

  // Boids-style separation so enemies never overlap or form straight lines.
  separation: {
    radius: 1.1, // neighbours within this push apart
    strength: 18, // push acceleration
    jitter: 1.5, // small per-enemy noise so columns break up
    cellSize: 1.2, // spatial-hash cell (≈ separation.radius for O(1) queries)
  },

  // Formula-based spawn director. A "wave budget" grows with distance and is
  // spent on enemies; props (gates/barrels) spawn on their own distance cadence.
  spawn: {
    // enemyBudget(d) = base + slope*d, released in bursts every `interval` metres
    budgetBase: 6,
    budgetSlope: 0.05,
    burstInterval: 22, // metres between enemy bursts
    burstJitter: 6,
    enemyCostBase: 1, // budget cost per enemy (rises with hp scaling)
    clusterSpread: 4, // lateral scatter of a burst (separation untangles the rest)

    gateInterval: 34, // metres between gate pairs
    barrelInterval: 18, // metres between barrels
    firstSafeDistance: 12, // grace before anything spawns
  },

  gate: {
    hp: 20, // shoot to raise the operator value; each hit = +1 to the shown value
    startValue: 1, // initial operator magnitude
    width: 2.4,
    // two gates side by side; operators drawn from this table (good vs bad)
    goodOps: [
      { op: "add", label: "+" },
      { op: "mul", label: "×" },
    ],
    badOps: [
      { op: "sub", label: "−" },
      { op: "div", label: "÷" },
    ],
    valueBase: 8, // baseline magnitude a fresh gate shows
    valuePerDistance: 0.06,
  },

  barrel: {
    hp: 12,
    hpPerDistance: 0.05,
    rewardBase: 6, // soldiers granted when destroyed
    rewardPerDistance: 0.04,
    weaponChance: 0.25, // chance a barrel is a weapon barrel (fire-rate upgrade)
    weaponBonus: 0.85, // multiplies fireInterval (lower = faster) on pickup
  },

  // Campaign: each level runs `length` metres of the formula spawner, then a BOSS
  // blocks the lane (distance freezes) until killed → Level Complete → next level,
  // scaled by the multipliers. Clearing the last level → You Win.
  levels: [
    { name: "Outpost", length: 120, speedMul: 1.0, budgetMul: 1.0, hpMul: 1.0, bossHp: 400, bossDps: 8, bossSpeed: 3.0 },
    { name: "Ridge", length: 160, speedMul: 1.12, budgetMul: 1.4, hpMul: 1.3, bossHp: 900, bossDps: 12, bossSpeed: 3.4 },
    { name: "Citadel", length: 200, speedMul: 1.25, budgetMul: 1.9, hpMul: 1.7, bossHp: 1800, bossDps: 16, bossSpeed: 3.8 },
  ],
  boss: {
    spawnAhead: 26, // where the boss appears ahead of the squad
    touchRange: 2.4, // big model → larger contact distance
    scale: 3.2, // enemy model scaled up
    hitRadius: 2.2, // bullet-vs-boss half-width (generous — the boss is a big target)
    // HP is scaled to the squad's firepower so the fight always lasts ~this long
    // regardless of squad size (small squad → small boss, huge squad → huge boss).
    targetSeconds: 7, // base fight length at level 1
    secondsPerLevel: 2.5, // +this per level (L1=7s, L2=9.5s, L3=12s)
    hitFraction: 0.55, // fraction of a volley that lands on the boss (spread vs width)
    minHp: 120,
    // during the fight the boss throws adds at you → dodge + shoot, not just hold
    addInterval: 1.5, // seconds between add waves
    addCount: 3, // enemies per wave
    addHp: 4,
    advanceScale: 1.0, // boss approach-speed multiplier
  },

  pools: {
    bullets: 1200,
    enemies: 400,
    soldiers: 400, // == squad.max
    props: 48, // gates + barrels alive at once
  },

  perf: {
    fixedStep: 1 / 60, // fixed-timestep for deterministic simulation
    maxSubSteps: 5, // clamp catch-up after a stall (mobile tab resume)
    targetDpr: 2, // cap devicePixelRatio for fill-rate on mobile
  },

  debug: {
    showTuning: true, // lil-gui panel
    seed: 1337, // deterministic RNG seed for reproducible spawns
  },
};
