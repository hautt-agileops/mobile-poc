---
name: unity-poc
description: Turn a game-development job/brief (Upwork/Fiverr gig, GDD excerpt, prototype spec) into a playable Unity prototype — 2D OR 3D — build it to WebGL, and deploy to a public Vercel URL. Code-driven (zero scene authoring) so the whole pipeline runs headless; generates real assets (2D sprites via Gemini nano-banana, 3D models via Meshy/glTFast) with a programmer-art fallback. Use when the user pastes or points to a game brief asking for a playable demo / vertical slice, a 2D fighter / arcade prototype, a 3D arena brawler, or wants a shareable link to a Unity build.
---

# unity-poc — orchestrator

Worker-less pipeline: a game brief → analyzed scope → a code-driven Unity project → WebGL
build → public Vercel link. Everything spawns from C# at runtime (programmer art, one empty
boot scene) so builds are fully headless/batchmode — no Editor GUI, no hand-authored scenes
or prefabs.

**This skill is a thin orchestrator.** The 13-step pipeline is split into five phase
sub-skills — load each in turn. Shared assets (`template/`, `template3d/`, `scripts/`,
`references/`) live in **this** skill dir; the sub-skills reference them by path
(`../unity-poc/...`). Full landmine list, once: `references/gotchas.md`. Map + flow chart:
`README.md`.

## When to use

User pastes a game-dev job/brief (fighting game, platformer, arcade prototype, "vertical
slice", "playable demo", GDD handoff) and wants it turned into a running Unity build, ideally
shareable. Best fit: single-scene, mechanics-first prototypes where programmer art is
acceptable.

## Pick the template by brief

The *pipeline* (scaffold → asset gen → WebGL build → local browser test → Vercel deploy) is
genre-agnostic. Two bundled fighter frameworks ship:

| brief | template | namespace | assets | build/playtest method |
|-------|----------|-----------|--------|-----------------------|
| **2D fighter / arcade** | `template/` | `Fighter` | 2D PNG sprites (`game-asset-gen`) | `Fighter.EditorTools.BuildScript.*` |
| **3D arena brawler** | `template3d/` | `Fighter3D` | Meshy GLB models (`gen-models.mjs` → glTFast) | `Fighter3D.EditorTools.BuildScript.*` |
| **platformer / cozy / other** | — | your own | write from scratch | direct Unity CLI, your namespace |

Both are full fighters with parity: state machine, install/stance/projectile, best-of-3 round
flow, uGUI HUD/select built in code, a headless `Playtest*` gate that reflects on
`BuildRoster()`. **A fighting/brawler brief reuses the matching `Framework*/` verbatim — write
only the `Game/` file.** The 3D side moves on the XZ plane with **sphere-based** hit/hurt
volumes and loads real `.glb` models with a primitive-capsule fallback.

**Scope honesty.** A **platformer / cozy / other non-fighter** brief keeps the pipeline +
scripts but you write the gameplay layer from scratch and rewrite the `Playtest` assertions —
the `BuildRoster()` contract assumes a fighter roster. Don't promise "reuse the framework" for
a non-fighter. See `references/fighter-framework.md` (2D) and `references/3d-framework.md` (3D).

## Pipeline — load each phase sub-skill in turn

Run the phases in order; each sub-skill holds the detailed steps, commands, and the gotchas
that bite in that phase.

1. **`unity-poc-spec`** (steps 1–3) — analyze the brief + `AskUserQuestion` scope, write
   `PRD.md` → `TDD.md` (design docs), then `ASSETS.md` → `assets.manifest.json` /
   `models.manifest.json` (the asset contract). Design-first so the build hits no surprises.
2. **`unity-poc-scaffold`** (steps 4–5) — check the env (Unity 6000.x + WebGL, Vercel, Node,
   Vertex/Meshy creds), then headlessly create the project and copy `template/` or
   `template3d/` + `com.unity.ugui` (+ glTFast for real 3D models). **Stop if Unity/WebGL is
   missing.**
3. **`unity-poc-assets`** (step 6) — generate real art from the manifest via `game-asset-gen`
   (2D PNGs → `Resources/Art/`, REQUIRED `alpha_key.py`) and `gen-models.mjs` → `3d-prompt`
   (3D GLBs → `Resources/Models/`). **Never a hard gate** — missing art degrades to flat
   color / primitive.
4. **`unity-poc-gameplay`** (step 7) — author the only job-specific code: `Assets/Scripts/Game/`,
   register the roster, expose `public static List<CharacterDef> BuildRoster()`, wire art via
   `SpriteLoader`. Reuse `Framework/` + `Editor/` verbatim.
5. **`unity-poc-buildship`** (steps 8–13) — REQUIRED headless playtest gate → WebGL build →
   REQUIRED local puppeteer boot test → Vercel deploy + portal registration → verify public →
   `HANDOFF.md`. Two hard gates guard the deploy.

Both dimensions converge after asset gen onto the same gates. Asset gen is **never** a gate.

## Shared assets (in this skill dir)

- **`template/`** — 2D fighter framework (`Framework/`, `Editor/`, `link.xml`). Detail:
  `references/fighter-framework.md`.
- **`template3d/`** — 3D arena-brawler framework (`Framework3D/`, `Editor/`, `models.manifest.json`).
  Detail: `references/3d-framework.md`.
- **`scripts/`** — `playtest.sh`, `build-webgl.sh`, `local-test.sh`, `deploy-vercel.sh`,
  `browser-test.mjs` (+ `package.json` for puppeteer-core). Namespace-selectable via
  `BUILD_METHOD`/`PLAYTEST_METHOD` env.
- **`references/`** — `gotchas.md` (full landmine list), `fighter-framework.md`,
  `3d-framework.md`.

## Run / develop (quick reference)

```bash
SC=scripts
# 2D fighter — scaffold once, then iterate by editing Assets/Scripts and rebuilding
$SC/build-webgl.sh <projectPath>                        # -> Build/WebGL/index.html
$SC/deploy-vercel.sh <projectPath>/Build/WebGL bbp-slice
# 3D brawler — same scripts, select the Fighter3D entry points via env
PLAYTEST_METHOD=Fighter3D.EditorTools.BuildScript.RunPlaytest $SC/playtest.sh <projectPath>
BUILD_METHOD=Fighter3D.EditorTools.BuildScript.BuildWebGL     $SC/build-webgl.sh <projectPath>
$SC/deploy-vercel.sh <projectPath>/Build/WebGL arena-clash-3d
```

> The 3D template is validated end-to-end on Unity 6000.4.0f1: compiles, 6/6 playtest matchups
> pass, WebGL build succeeds, and it boots clean in a real browser (primitive-only path; add
> `com.unity.cloud.gltfast` + `csc.rsp` `-define:HAS_GLTFAST` for real models).
