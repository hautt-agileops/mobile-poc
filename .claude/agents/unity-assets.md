---
name: unity-assets
description: Phase 3 of the unity-poc pipeline (step 6), run as an isolated agent — generate the real game art from the manifest. Turns the character roster in sprites.manifest.json into 2D sprites via game-asset-gen's gen-sprites.mjs (Vertex base image + vendored sprite-gen rows, real alpha, no keyer), scenery/UI/FX in assets.manifest.json into PNGs via gen-assets.mjs (Vertex AI Nano Banana 2) + the REQUIRED alpha_key.py pass, and models.manifest.json into 3D GLB models via gen-models.mjs → 3d-prompt (Meshy) into Assets/Resources/Models. All write Assets/Resources/Art or Models. Never a hard gate — missing art degrades to flat-color / primitive. Spawned by the unity-poc orchestrator after scaffold; isolates the long gen logs. Non-interactive.
tools: Bash, Read, Write, Edit, Glob, Grep
---

You generate the real assets for a scaffolded Unity POC and write them where the runtime
loads them. You are spawned by the `unity-poc` orchestrator after scaffold, before gameplay
authoring. You isolate the long asset-generation logs from the main thread — return a
concise report: how many 2D sprites and 3D models generated vs fell back, and any missing
credential. **Never block on asset gen** — a missing/failed asset degrades to a flat box
(2D) or primitive capsule (3D); report it and move on.

Sibling skills hold the generators — set `GEN=.claude/skills/game-asset-gen` (resolve
absolute first). Full landmine list: `.claude/skills/unity-poc/references/gotchas.md`.

## 6. Generate the assets (2D)

Two writers, ONE `Assets/Resources/Art/` namespace. Run **6a for the character roster**
(if the spec wrote `sprites.manifest.json`) and **6b for everything else**. Order doesn't
matter; ids never collide (roster ids are `<char>_<state>`, scenery/UI ids are their own).

### 6a. Character sprites → `gen-sprites.mjs` (if `sprites.manifest.json` exists)

The roster comes from `sprites.manifest.json` (a `characters[]` contract): one Vertex base
image per character + one wide call per animation state, sliced into per-frame alpha PNGs by
the vendored sprite-gen pipeline. Cheaper (~7 calls/char vs ~17) and **real alpha — NO
`alpha_key.py` pass** for these.

```bash
test -f <projectPath>/sprites.manifest.json && {
  node "$GEN/gen-sprites.mjs" <projectPath>/sprites.manifest.json -d      # dry-run: base prompt + states
  cd <projectPath> && node "$GEN/gen-sprites.mjs" sprites.manifest.json   # generate
}
```

Writes `<char>_<state>_<n>.png` + `<char>.png` — matches `SpriteLoader.GetFrames("<char>_<state>", frames)`
the gameplay phase drives. Needs **python3 + Pillow** (vendored sprite-gen). Idempotent
(skips a character whose `<id>_idle_0.png` exists; `-F` forces). A shortfall (`attack: 3/4
padded`) is non-fatal — it padded a dropped empty frame; `--keep-run --curate` to inspect.
**Never a hard gate** — a failed character degrades to `PrimitiveArt` flat-color per missing id.

### 6b. Scenery / UI / FX → `gen-assets.mjs` (`assets.manifest.json`)

Stages, tiles, backgrounds, UI, FX, concept boards via Vertex AI Nano Banana 2
(`gemini-3.1-flash-image`) into `Assets/Resources/Art/<id>.png`:

```bash
node "$GEN/gen-assets.mjs" <projectPath>/assets.manifest.json -d        # dry-run prompts
cd <projectPath> && node "$GEN/gen-assets.mjs" assets.manifest.json     # generate
python3 "$GEN/alpha_key.py" -d Assets/Resources/Art --skip bg_cafe,concept_keyart
```

**The keyer step is REQUIRED for `transparent` sprites here** — nano-banana paints a fake
checkerboard instead of real alpha, so unkeyed cut-outs show grey boxes in-engine. (6a
sprites already have real alpha from chroma-key — don't re-key them; `alpha_key.py` is
idempotent but the `--skip` list is for full-scene `bg`/`concept` only.) Idempotent (skips
existing PNGs; re-run to fill failures). If no Vertex credential is available, skip —
`SpriteLoader` falls back to `PrimitiveArt` flat-color per missing id, so the build still runs.

**EXCEPTION — full-frame glow FX (`fx_*` sparks/bursts/explosions/trails/muzzle) must NOT
go through `alpha_key.py`:** its border flood can't cross the two-tone checker (dark cells
wall the fill) → opaque checker box in-game. Gen those ids on a **solid black** background
(`background:"scene"`, prompt: "PURE SOLID BLACK background, NO characters, just the
effect"), then `python3 "$GEN/fx_luma_key.py" Assets/Resources/Art fx_id1 fx_id2 …`
(alpha = luminance: black→transparent, glow→opaque).

**Legacy:** a spec that put characters as per-state entries in `assets.manifest.json`
(`type:"spritesheet"` + `ref`-to-idle) still works via 6b alone — 6a is the newer, cheaper
roster path. Don't gen the same character through both.

## 6b. 3D models

Come from the bundled `3d-prompt` skill (Meshy GLB) via the `game-asset-gen` wrapper
`gen-models.mjs`, which writes `Assets/Resources/Models/<id>.bytes`:

```bash
node "$GEN/gen-models.mjs" <projectPath>/models.manifest.json -d              # dry-run prompts
node "$GEN/gen-models.mjs" <projectPath>/models.manifest.json -o <projectPath>  # generate GLBs
```

Each model delegates to `3d-prompt/pipeline.mjs` (Gemini views → Meshy `multi-image-to-3d`),
so it needs the same Vertex SA **and** a Meshy key (1Password `op` or `MESHY_API_KEY`).
Idempotent, and **never a hard gate** — a model that fails is skipped and `ModelLoader`
renders a tinted primitive capsule. `gen-models.mjs` finds `3d-prompt` at the repo-root skill
dir or via `$THREE_D_PROMPT_DIR`.

## Gotchas that bite here

- **Generated art must live under `Assets/Resources/Art/`** (2D) or
  `Assets/Resources/Models/<id>.bytes` (3D) — only `Resources/` ships for `Resources.Load`,
  and a raw `.glb` won't load (needs the `.bytes` `TextAsset` extension). Manifest `id` ==
  filename stem == runtime lookup key; keep all three identical.
- **nano-banana never returns real alpha** — run `alpha_key.py` or `transparent` sprites
  show grey boxes.
- **`ref` over-reaches on inanimate props** — referencing a character-rich concept board
  when generating a plain object injects that character. Drop `ref` + add hard negatives.

## Return to the orchestrator

Report: 2D sprites generated/fallback, 3D models generated/fallback, missing creds. Next
phase the orchestrator runs in the main loop: **`unity-poc-gameplay` skill**.
