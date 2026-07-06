# Frontline Runner — Three.js squad runner-shooter prototype

A systems-first vertical slice of a *Last War*-style **squad runner**: the squad auto-runs
forward and auto-fires; you drag to weave across the lane; shoot **barrels** (add soldiers /
weapon upgrade), **gates** (± × ÷ the squad count), and **enemies** (count-based damage). The
spawn system is **formula-driven**, not random clutter.

This prototype is deliberately **mechanics over art** — primitive meshes, zero art deps. The
value is in the engine: pooling, fixed-step sim, spatial-hash separation, a formula spawn
director, and a single live-tunable config.

## Run

ES modules load over HTTP (not `file://`). Any static server:

```bash
cd runner-shooter
python3 -m http.server 8000      # then open http://localhost:8000
```

Three.js + lil-gui load from a CDN via the `<script type="importmap">` in `index.html` — no
build step, no `npm install`. Open the **Tuning** panel (top-right) to retune every value live.

Headless boot/smoke test (Chrome via puppeteer-core):

```bash
node boot-test.mjs        # serves, loads, checks sim advances + 0 console errors, writes boot-shot.png
```

## Architecture

Data-oriented: the high-churn actors (soldiers, enemies, bullets) are **records inside
`InstancedMesh` pools** — one draw call each, no per-frame allocation. Systems are stateless
passes over that data. Everything reads `CONFIG` by reference so tuning is instant.

```
src/
├── config.js            ← SINGLE source of truth for every tunable number
├── main.js              ← boot: new Game(), tuning panel, restart
├── game.js              ← scene/camera/renderer, the 3 pools, squad state, fixed-step loop
├── hud.js               ← DOM overlay (count / distance / wave / fps / gate flashes)
├── input.js             ← touch + mouse + keyboard → lane axis (relative drag)
├── tuning.js            ← lil-gui panel built straight off CONFIG (live retune)
├── core/
│   ├── loop.js          ← fixed-timestep accumulator loop (deterministic sim)
│   ├── pool.js          ← InstancedPool — the pooling + draw-call-batching primitive
│   ├── spatialhash.js   ← uniform grid for O(1) neighbour queries (separation + hits)
│   └── rng.js           ← seeded mulberry32 (reproducible levels)
├── entities/
│   └── props.js         ← Gate (count operator) + Barrel (soldier/weapon reward)
└── systems/
    ├── spawn.js         ← SpawnDirector: budget/distance FORMULAS place enemies/gates/barrels
    ├── enemies.js       ← seek-squad + boids separation + contact bite
    └── combat.js        ← count-based bullet damage vs enemies (hash) and props
```

## How each brief requirement is met

| brief ask | where |
|---|---|
| Formula-based procedural spawn/progression | `systems/spawn.js` — `enemyBudget(d)=base+slope·d`, distance cadences for gates/barrels; `enemyHp(d)` scales with distance |
| Gates, barrels, enemies, weapon pickups | `entities/props.js` (Gate ±×÷, Barrel soldier/⚡weapon), `game.spawnEnemy` |
| Count-based bullet damage | `systems/combat.js` — every bullet subtracts `weapon.damage` from integer HP |
| Enemy wave budgets & progression balancing | `spawn.js` budget formula + `config.spawn` / `config.enemy` knobs |
| Collision detection | `combat.js` (bullet↔enemy circle test via hash, bullet↔prop AABB), `enemies.js` contact |
| Enemy movement/separation (no overlap, no lines) | `systems/enemies.js` — boids separation over `core/spatialhash.js` + per-enemy jitter |
| Object pooling (bullets/enemies) | `core/pool.js` InstancedPool; soldiers pooled too |
| Mobile browser performance | InstancedMesh (1 draw call/type), DPR cap, fixed-step + sub-step clamp, spatial hash, fog-culled spawn distance |
| Tuning/config system | `config.js` + `tuning.js` (live lil-gui), all systems read CONFIG by reference |
| Works inside a codebase / systems mindset | modular systems, seeded determinism, no globals beyond `window.GAME` |

## Core loop

`squad advances +Z (distance == squad.z) → director spawns by formula → enemies seek + separate
→ squad auto-fires volley → combat resolves count damage → gates apply on cross → cull behind`.

Tune it live, or edit `src/config.js`. Change `config.debug.seed` to roll a different but
still-reproducible level.
