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
| **2D fighter / arcade** | `template/` | `Fighter` | 2D PNG sprites (`assets.manifest.json`) |
| **3D arena brawler** | `template3d/` | `Fighter3D` | Meshy GLB models (`models.manifest.json`) |
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

- **`ASSETS.md`** (human): a global **style guide** paragraph (palette, line weight,
  era/genre, lighting, render style) + a table of asset → type → size → frame count →
  one-line art intent. This is the analysis a reader audits before any tokens are spent.
- **`assets.manifest.json`** (machine): the contract the asset generator reads — one entry
  per asset with a stable Unity-friendly `id` (becomes the PNG filename AND the runtime
  lookup key), `type`, `prompt`, `background`, optional `frames`/`ref`. The global `style`
  string is prepended to every prompt so the set stays coherent. Schema + example: the
  **`game-asset-gen`** skill's `references/manifest-schema.md`.
- Every `id` here must match the sprite id the gameplay-phase code asks `SpriteLoader.Get`
  for — the manifest, the generated PNGs, and the C# are one namespace.
- **3D brawler:** also (or instead) write **`models.manifest.json`** — a `style` string + a
  `models: [{id, prompt}]` list, one entry per 3D character. `id` == `CharacterDef3D.modelId`
  == `Assets/Resources/Models/<id>.bytes` (one namespace, like the 2D ids). UI sprites
  (HUD/logo/buttons) are still 2D and can stay in `assets.manifest.json`; characters become
  GLB models. Sample: `../unity-poc/template3d/models.manifest.json`.

## Next phase

Env check + scaffold → **`unity-poc-scaffold`**.
