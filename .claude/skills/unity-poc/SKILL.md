---
name: unity-poc
description: Turn a game-development job/brief (Upwork/Fiverr gig, GDD excerpt, prototype spec) into a playable Unity prototype — 2D OR 3D — build it to WebGL, and deploy to a public Vercel URL. Code-driven (zero scene authoring) so the whole pipeline runs headless; generates real assets (2D sprites via Gemini nano-banana, 3D models via Meshy/glTFast) with a programmer-art fallback. Use when the user pastes or points to a game brief asking for a playable demo / vertical slice, a 2D fighter / arcade prototype, a 3D arena brawler, or wants a shareable link to a Unity build.
---

# unity-poc — orchestrator

Worker-less pipeline: a game brief → analyzed scope → a code-driven Unity project → WebGL
build → public Vercel link. Everything spawns from C# at runtime (programmer art, one empty
boot scene) so builds are fully headless/batchmode — no Editor GUI, no hand-authored scenes
or prefabs.

**This skill is a thin orchestrator.** The 13-step pipeline is split into five phases. Two
run **in the main loop as skills** because they need you and the user (interactive scope
`AskUserQuestion`, iterative code authoring); three run **as isolated agents** you spawn via
the Task tool because they are non-interactive execution whose noisy logs (Unity batchmode,
asset gen, WebGL build, puppeteer, vercel) must stay off the main thread:

| phase | kind | run how |
|-------|------|---------|
| spec (1–3) | **skill** | load `unity-poc-spec` (interactive scope) |
| scaffold (4–5) | **agent** | spawn `unity-scaffold` |
| assets (6) | **agent** | spawn `unity-assets` |
| gameplay (7) | **skill** | load `unity-poc-gameplay` (author code in main loop) |
| build+ship (8–13) | **agent** | spawn `unity-buildship` |

Shared assets (`templates/fighter2d/`, `templates/arena3d/`, `scripts/`, `references/`) live in **this** skill
dir. The sub-skills reference them by `../unity-poc/...`; the agents live in `.claude/agents/`
so they reference `.claude/skills/unity-poc/...`. Full landmine list, once:
`references/gotchas.md`. Map + flow chart: `README.md`.

## Full Pipeline Overview (Zero to Ship)

One game brief → one public playable URL. 13 steps in 5 phases; this skill drives them,
alternating main-loop skills (interactive) and spawned agents (isolated execution). Two hard
gates guard the deploy — a failure returns to the gameplay skill, then re-spawns the agent.

```
game brief ─▶ SPEC ─────▶ SCAFFOLD ──▶ ASSETS ────▶ GAMEPLAY ──▶ BUILD+SHIP ──────────▶ live URL
 (paste/file)  skill        agent        agent        skill        agent
               PRD/TDD/      env check    gen PNGs/    author       playtest gate ▸ WebGL
               manifest      + create     GLBs         Game/ +      build ▸ browser test ▸
               (AskUser)     project      (fallback)   BuildRoster  deploy-vercel.sh ▸ HANDOFF
```

| phase | kind | steps | does | gate / output |
|-------|------|-------|------|---------------|
| spec | skill `unity-poc-spec` | 1–3 | analyze brief, `AskUserQuestion` scope, pick 2D/3D | `PRD.md` `TDD.md` `assets/models.manifest.json` |
| scaffold | agent `unity-scaffold` | 4–5 | env check (Unity+WebGL, Vercel, Node, creds), headless create + copy template | project path — **stop if Unity/WebGL missing** |
| assets | agent `unity-assets` | 6 | manifest → 2D PNGs (+`alpha_key.py`) / 3D GLBs | **never a gate** — missing art → flat/primitive |
| gameplay | skill `unity-poc-gameplay` | 7 | author `Assets/Scripts/Game/`, expose `BuildRoster()`, wire art | job-specific code (reuse `Framework/`) |
| build+ship | agent `unity-buildship` | 8–13 | playtest gate ▸ WebGL build ▸ browser boot test ▸ `deploy-vercel.sh` ▸ verify ▸ handoff | **2 hard gates**; verified public `200` URL + `HANDOFF.md` |

**Dimension** (2D fighter / 3D brawler / other) is chosen in spec and threaded to every phase.
**Credentials** auto-resolve; missing Vertex/Meshy just degrades assets to programmer art —
never blocks the build. **Deploy** goes to the shared Studio portal `games/` category. Detailed
per-phase steps, commands, and gotchas live in each phase's skill/agent file.

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
| **2D fighter / arcade** | `templates/fighter2d/` | `Fighter` | 2D PNG sprites (`game-asset-gen`) | `Fighter.EditorTools.BuildScript.*` |
| **3D arena brawler** | `templates/arena3d/` | `Fighter3D` | Meshy GLB models (`gen-models.mjs` → glTFast) | `Fighter3D.EditorTools.BuildScript.*` |
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

**Genres are self-contained folders** under `templates/` (no shared C# core — 2D/3D already
diverge in loader/camera/fallback). To add a genre, copy an existing folder and honor the two
Editor entry methods + `BuildRoster()` reflection shape — full contract in
`references/genre-contract.md`.

## Pipeline — run the phases in order

Load skills into the main loop; spawn agents via the Task tool (pass the project path + the
2D/3D dimension). Each holds the detailed steps, commands, and phase gotchas.

1. **skill `unity-poc-spec`** (steps 1–3) — analyze the brief + `AskUserQuestion` scope, write
   `PRD.md` → `TDD.md` (design docs), then `ASSETS.md` → `assets.manifest.json` /
   `models.manifest.json` (the asset contract). Design-first so the build hits no surprises.
2. **agent `unity-scaffold`** (steps 4–5) — check the env (Unity 6000.x + WebGL, Vercel, Node,
   Vertex/Meshy creds), then headlessly create the project and copy `templates/fighter2d/` or
   `templates/arena3d/` + `com.unity.ugui` (+ glTFast for real 3D models). It returns the project path
   or an env-missing report — **stop the pipeline if Unity/WebGL is missing.**
3. **agent `unity-assets`** (step 6) — generate real art from the manifest via `game-asset-gen`
   (2D PNGs → `Resources/Art/`, REQUIRED `alpha_key.py`) and `gen-models.mjs` → `3d-prompt`
   (3D GLBs → `Resources/Models/`). **Never a hard gate** — missing art degrades to flat
   color / primitive. (2D and 3D asset gen are independent — if a brief needs both, spawn the
   agent once per manifest and let them run concurrently.)
4. **skill `unity-poc-gameplay`** (step 7) — author the only job-specific code:
   `Assets/Scripts/Game/`, register the roster, expose
   `public static List<CharacterDef> BuildRoster()`, wire art via `SpriteLoader`. Reuse
   `Framework/` + `Editor/` verbatim. Kept in the main loop — authoring wants your tool feedback.
5. **agent `unity-buildship`** (steps 8–13) — REQUIRED headless playtest gate → WebGL build →
   REQUIRED local puppeteer boot test → Vercel deploy (`deploy-vercel.sh`) + portal
   registration → verify public → `HANDOFF.md`. Two hard gates guard the deploy. It runs
   `deploy-vercel.sh` directly (a subagent can't spawn the `portal-deploy` agent), returning
   the verified public URL.

Both dimensions converge after asset gen onto the same gates. Asset gen is **never** a gate.
On a gate failure the agent returns the failure — drop back to the `unity-poc-gameplay` skill
in the main loop to fix, then re-spawn `unity-buildship`.

## Shared assets (in this skill dir)

- **`templates/fighter2d/`** — 2D fighter framework (`Framework/`, `Editor/`, `link.xml`). Detail:
  `references/fighter-framework.md`.
- **`templates/arena3d/`** — 3D arena-brawler framework (`Framework3D/`, `Editor/`, `models.manifest.json`).
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
