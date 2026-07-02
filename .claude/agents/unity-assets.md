---
name: unity-assets
description: Phase 3 of the unity-poc pipeline (step 6), run as an isolated agent — generate the real game art from the manifest. Turns assets.manifest.json into 2D PNG sprites via game-asset-gen (Vertex AI Nano Banana 2) into Assets/Resources/Art + the REQUIRED alpha_key.py pass, and models.manifest.json into 3D GLB models via gen-models.mjs → 3d-prompt (Meshy) into Assets/Resources/Models. Never a hard gate — missing art degrades to flat-color / primitive. Spawned by the unity-poc orchestrator after scaffold; isolates the long gen logs. Non-interactive.
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

Turns the spec-phase `assets.manifest.json` into real PNGs via Vertex AI Nano Banana 2
(`gemini-3.1-flash-image`) written into `Assets/Resources/Art/<id>.png`:

```bash
node "$GEN/gen-assets.mjs" <projectPath>/assets.manifest.json -d        # dry-run prompts
cd <projectPath> && node "$GEN/gen-assets.mjs" assets.manifest.json     # generate
python3 "$GEN/alpha_key.py" -d Assets/Resources/Art --skip bg_cafe,concept_keyart
```

**The keyer step is REQUIRED for `transparent` sprites** — nano-banana paints a fake
checkerboard instead of real alpha, so unkeyed cut-outs show grey boxes in-engine.
Idempotent (skips existing PNGs; re-run to fill failures). If no Vertex credential is
available, skip — `SpriteLoader` falls back to `PrimitiveArt` flat-color per missing id, so
the build still runs.

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
