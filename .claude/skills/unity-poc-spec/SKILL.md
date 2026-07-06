---
name: unity-poc-spec
description: Phase 1 of the unity-poc pipeline — turn a game brief into the design + asset spec before any code. Analyze the brief, confirm scope with AskUserQuestion, then author PRD.md and TDD.md (design docs) and ASSETS.md + assets.manifest.json / models.manifest.json (the asset contract). Invoked by the unity-poc skill; load it directly when a game brief needs its concept, technical design, and asset manifest written.
---

# unity-poc-spec — brief → PRD / TDD / asset manifest

Phase 1 of **unity-poc** (steps 1–3). Design-first: everything downstream (scaffold,
asset gen, gameplay, build) derives from the docs written here, so the later phases hit
minimal surprises. Shared assets referenced below live in the sibling `unity-poc/` skill
dir. Full landmine list: `../unity-poc/references/gotchas.md`.

## 1. Analyze the brief

Extract: genre, core loop, required systems, character/roster, stages, controls, win
condition. Fighting-game briefs map onto the bundled framework directly. Ask the user to
confirm scope with `AskUserQuestion` — at minimum: deliverable (game now vs reusable
skill), combat/mechanic depth, character count, control scheme. Don't over-ask; recommend
a default per question.

**Pick the template by brief** (drives which manifest + which downstream namespace):

| brief | template | namespace | assets |
|-------|----------|-----------|--------|
| **2D fighter / arcade** | `templates/fighter2d/` | `Fighter` | roster → `sprites.manifest.json`; scenery/UI/FX → `assets.manifest.json` |
| **3D arena brawler** | `templates/arena3d/` | `Fighter3D` | Meshy GLB models (`models.manifest.json`) |
| **platformer / cozy / other** | — | your own | write from scratch |

A **non-fighter** brief keeps the pipeline but the gameplay layer and `Playtest`
assertions are written from scratch — don't promise "reuse the framework". See
`../unity-poc/references/fighter-framework.md` (2D) and `../unity-poc/references/3d-framework.md` (3D).

## 2. Write `PRD.md` then `TDD.md`

In the project root, before scaffolding — design first so the build hits minimal surprises.

- **Use the `game-design-document` skill to author `PRD.md`.** Load that sibling skill
  (`../game-design-document/SKILL.md`) and run its content-generation standards to produce
  the detailed game-concept doc. Treat the step-1 `AskUserQuestion` answers as its Phase-1
  discovery — do **not** re-interview; map them onto its 19-section frame, then collapse to
  the unity-poc `PRD.md` shape below (a vertical-slice subset, not the full 40-80pp
  document). Skip its Phase-4 `.docx`/`.pdf` export — `PRD.md` markdown is the deliverable.
  The TDD stays unity-poc's own (harness-constraint driven), not the GDD skill's.
- Generic briefs (e.g. "build a cozy mobile game") need a concrete game *invented* to fit;
  confirm the concept in the step-1 `AskUserQuestion`. The PRD must read as a **detailed,
  self-contained game-concept document** a stranger could build from — not a stub. Name the
  game, fix the fantasy and tone, and pin down concrete numbers (round length, health,
  damage, move list, stage count) so the TDD and the asset manifest both derive from it with
  no guessing.
- **`PRD.md`** (product): summary table, pillars, target player/tone, the **core loop**
  (diagram it), in-scope P0 features, explicit out-of-scope, UX/screen layout, game-feel
  acceptance criteria, success metrics, post-slice roadmap. Also: a **concrete content
  spec** — the roster (each character's identity, silhouette, palette, signature move), each
  stage (setting, mood, palette), and the visual pillar (art direction in one paragraph).
  This content spec is what step 3 turns into assets.
- **`PRD.md` narrative section** — every game gets a **story arc**, even a vertical slice.
  Author the classic 5-element structure and map each beat onto a gameplay moment (a level,
  an encounter, a screen) so the arc is *played*, not just read:
  1. **Premise / setup** — world, protagonist, situation ("who am I, why am I here?").
     Delivered via intro screen / opening level.
  2. **Inciting incident & goal** — the disruption + the clear player objective driving
     everything (rescue, survive, escape, uncover).
  3. **Rising conflict / escalation** — obstacles/enemies/stakes that grow. Sync story
     tension to difficulty — they rise together.
  4. **Climax** — peak confrontation the slice builds to: final boss, major decision, or
     set-piece.
  5. **Resolution / ending** — payoff, character-arc wrap, optional branching endings.

  Layer in game-only storytelling tools where cheap: **environmental storytelling** (tell
  story through the level itself), **lore collectibles** (notes / audio logs), **player
  branching choices**. State which the slice uses and which are post-slice.
- **`PRD.md` milestones** — a **milestone table** breaking the build into ordered,
  demoable checkpoints (e.g. M0 boots to menu → M1 one playable character moves → M2 combat
  loop → M3 full arc playable → M4 art + polish). Each milestone: goal, in-scope, the story
  beat it makes playable, and its done-criteria. Milestones drive the implementation order
  the TDD locks in — every milestone must be a runnable build, not a half-state.
- **`TDD.md`** (technical): a **"constraints inherited from the harness"** table read off
  the gotchas (code-driven, headless build, IL2CPP stripping, EventSystem, input handler,
  compression), project layout, boot sequence, per-system design, data flow,
  build/playtest/deploy plan, a **risk register that pre-empts every harness landmine**,
  production swap-ins, and a lowest-risk-first implementation order.
- Keep the two decoupled and implementation-ready: each system maps 1:1 onto files
  scaffolded next. The TDD's risk register is what makes the later steps boring.

## 3. Write `ASSETS.md` then `assets.manifest.json`

The asset analysis. Read the PRD's content spec and TDD's render plan and enumerate **every
2D visual the prototype draws**: each character (idle + each signature action / animation
frame), each stage/background, platform & tile, UI element (health bar, timer, select
portraits, buttons, logo), FX (hit spark, projectile), and 1–2 **concept boards** that fix
the palette and mood.

**Per-character animation breakdown.** Don't list a character as one asset — decompose it
into its **animation states**, the way a real sprite pack does (cf. the `Warped` pack:
`Characters/<name>/Sprites/{Idle, walk, …}/` + a `Spritesheets/` roll-up). For each
character and each enemy, enumerate every state the gameplay actually plays, and give each
state its own manifest entry:

| state | typical `type` | frames | notes |
|-------|---------------|--------|-------|
| idle | `sprite` (or `spritesheet` if it breathes) | 1–4 | the base pose; every other state `ref`s this |
| walk / run | `spritesheet` | 4–8 | contact/passing cycle (`frameNotes`) |
| each signature action (attack, jump, cast, hit-react, death) | `spritesheet` | 3–6 | wind-up → active → recover |

Name states with a stable convention `<char>_<state>` — that stem IS the folder-analogue
(`alien_walking_idle`, `alien_walking_walk`, `alien_walking_attack`). The state list here
must match the frame data the gameplay phase drives and the `SpriteLoader.GetFrames` keys it
asks for.

**Where this lands:** for a fighter roster, each character's state list becomes ONE
`characters[]` entry in **`sprites.manifest.json`** — the states go in its `states` map
(`{frames, fps, loop, action}` per state), and the character's `base` prompt is the idle
anchor that holds identity across the whole set (no per-state `ref` needed; `gen-sprites.mjs`
anchors on the base image). This decomposition IS the `states` map. Only fall back to
per-state `assets.manifest.json` entries with `ref`-to-idle for a non-fighter one-off.

**Environments** get the same treatment — enumerate each one separately (background /
backdrop layers, tiles, props), like the pack's `Environments/` split (per-scene folders).
List parallax layers as distinct `bg` entries when the stage scrolls.

- **`ASSETS.md`** (human): a global **style guide** paragraph (palette, line weight,
  era/genre, lighting, render style) + a table of asset → type → size → frame count →
  one-line art intent. This is the analysis a reader audits before any tokens are spent.
  **Group the table by entity** (one sub-section per character / enemy / stage / UI / FX,
  set on each entry's `category`) with that entity's animation states listed together —
  mirrors the per-character folder layout above so a reader sees each actor's full state set
  at a glance.
- **Two manifests for a 2D fighter — split the roster from the scenery:**
  - **`sprites.manifest.json`** (machine): the **character roster**. A `characters[]`
    contract that `gen-sprites.mjs` reads — one entry per fighter with `id`, `identity`
    (canonical design, restated every frame), `base` (the single base-idle prompt = identity
    anchor), and a `states` map (`idle`/`walk`/`attack`/… → `{frames, fps, loop, action}`).
    Omit `states` to accept the default fighter set (`idle`4·`walk`4·`attack`4·`hurt`2·
    `block`1·`ko`2). One base image + one wide call per state → per-frame alpha PNGs
    `<id>_<state>_<n>.png` (+ `<id>.png`). Cheaper + more on-model than per-frame spritesheets,
    and real alpha (no keyer). Full schema: the **`game-asset-gen`** skill's SKILL.md
    (*Character sprites — `gen-sprites.mjs`*).
  - **`assets.manifest.json`** (machine): **everything non-character** — stages/backgrounds,
    tiles, UI (health bar, timer, portraits, buttons, logo), FX, concept boards. One entry
    per asset with a stable Unity-friendly `id`, `type`, `prompt`, `background`, optional
    `frames`/`ref`. The global `style` prepends to every prompt. Schema + example: the
    `game-asset-gen` skill's `references/manifest-schema.md`.
  - Keep `style` consistent across BOTH so the roster and the stage read as one game.
  - (A non-fighter or one-off can still put a character straight in `assets.manifest.json`
    as a `spritesheet` with `ref`-to-idle — the older path. Don't gen a character through both.)
- Every id is one namespace with the gameplay code: a roster state loads via
  `SpriteLoader.GetFrames("<char>_<state>", frames)` (so manifest state keys == PNG stems ==
  the C# `GetFrames` id), and a scenery/UI asset via `SpriteLoader.Get("<id>")`. The manifest,
  the generated PNGs, and the C# must match exactly.
- **3D brawler:** also (or instead) write **`models.manifest.json`** — a `style` string + a
  `models: [{id, prompt}]` list, one entry per 3D character. `id` == `CharacterDef3D.modelId`
  == `Assets/Resources/Models/<id>.bytes` (one namespace, like the 2D ids). UI sprites
  (HUD/logo/buttons) are still 2D and can stay in `assets.manifest.json`; characters become
  GLB models. Sample: `../unity-poc/templates/arena3d/models.manifest.json`.

## Next phase

Env check + scaffold → the orchestrator spawns the **`unity-scaffold` agent**.
