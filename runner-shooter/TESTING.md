# Testing & verification — don't trust headless for the wrong things

Hard lesson from this build: "headless boots with 0 console errors" is **necessary, not
sufficient**. Most bugs here (dark models, invisible soldiers, boss pacing, perf) never threw
an error — they slipped straight past the gate. This is the loop that catches them.

## What each tool CAN and CAN'T verify

| tool | trust it for | do NOT trust it for |
|------|--------------|---------------------|
| `node --check` | syntax | anything runtime |
| `boot-test.mjs` (headless) | loads, no console errors, sim advances, assets fetch | **look, feel, framerate** — it's swiftshader (software GL, ~5 fps) |
| `simtest.mjs` pattern (loop-stop + `GAME.update(1/60)`) | game **logic** (boss dies, adds spawn, count changes, state transitions) | render, perf, visuals |
| headless screenshot | rough layout / "did it draw at all" | colour/lighting fidelity, real framing, smoothness |
| **your phone** | **looks right, plays right, runs fast** | — this is the only real success check |

**Rule:** headless is a smoke test. `0 errors` ≠ done. Done = looks right + plays right **on a
real device**.

## Real-device pass (do this every milestone, before "done")

Open the deployed URL on an actual phone (or DevTools device mode as a weak fallback):

1. **Boots** — no black screen, no stuck loader.
2. **Framerate** — smooth while a wave is on screen AND with a big squad (100+). Watch the fps
   line. If it dips, that's real (unlike headless).
3. **Reads** — every entity is identifiable: squad, enemies, barrels, gates, boss. No black
   silhouettes, no invisible actors, nothing off-frame.
4. **Controls** — drag steers the squad responsively; no lag, no fighting the input.
5. **Core loop** — barrels add, gates ×/+ apply, bullets hit, enemies separate (no lines/stacks).
6. **Boss** — appears, is a fight (adds, dodging, ~7s), dies → Level Complete → next.
7. **End states** — win screen after L3; wipe → game over → restart works.

If any fail, it's a bug even with 0 console errors.

## Engine-gotcha pre-flight (check BEFORE writing a feature, not after)

These bit us; check them up front next time:

- **Meshy / PBR GLB renders black** → materials bake `metalness≈1`; tame to ~0.05 + add an env
  map (`scene.environment`). (`core/models.js`)
- **GLB → InstancedMesh** → must normalize geometry: bake node transform, centre X/Z, base to
  y=0, scale to target height, orient to +Z. (`core/models.js` `prep()`)
- **Movement/anim tied to frame rate** → any per-frame `lerp * fixedNumber` drifts on slow
  frames. Use real `dt`, or snap. (formation was `followLerp * 1/60` → lagged 4 m.)
- **Fixed enemy/boss HP vs a scaling squad** → scale to firepower so pacing holds at any size.
- **Big GLBs** → Meshy exports are 10–30 MB; `gltf-transform optimize --compress meshopt
  --simplify --texture-size 512 --texture-compress webp` → ~10× smaller. Needs MeshoptDecoder.

## Dev harnesses in this dir (all `.vercelignore`d)

- `boot-test.mjs` — smoke gate (serve + load + 0 errors + sim advances).
- `simtest.mjs` — drive sim by hand (`loop.stop()` then `GAME.update(1/60)` in a loop) to test
  logic without the render bottleneck. **Use this for boss/level/balance logic, not wall-clock.**
- `capture.mjs` / `inspect.mjs` / `thumb.mjs` — screenshots (rough layout only).

## Bottom line

Headless proves it doesn't *crash*. Only your phone proves it's *good*. Loop the human in at
every milestone — that's the step we kept skipping.
