---
name: unity-poc-assets
description: Phase 3 of the unity-poc pipeline — generate the real game art from the manifest. Turns assets.manifest.json into 2D PNG sprites via the game-asset-gen skill (Vertex AI Nano Banana 2) written into Assets/Resources/Art, runs the REQUIRED alpha_key.py transparency pass, and turns models.manifest.json into 3D GLB models via gen-models.mjs → the 3d-prompt skill (Meshy) into Assets/Resources/Models. Never a hard gate — missing art degrades to flat-color / primitive fallback. Invoked by the unity-poc skill; load it directly when a scaffolded Unity POC needs its assets generated.
---

# unity-poc-assets — manifest → real PNGs / GLBs

Phase 3 of **unity-poc** (step 6). Runs after scaffold (`unity-poc-scaffold`), before
gameplay authoring. Delegates to sibling skills `game-asset-gen` (2D) and `3d-prompt` (3D
models). **Never block the pipeline on asset gen** — a missing/failed asset degrades to a
flat box (2D) or primitive capsule (3D). Full landmine list:
`../unity-poc/references/gotchas.md`.

## 6. Generate the assets

Use the **`game-asset-gen`** skill — a sibling skill at `../game-asset-gen/`. Turns the
spec-phase `assets.manifest.json` into real PNGs via Vertex AI Nano Banana 2
(`gemini-3.1-flash-image`) and writes them into `Assets/Resources/Art/<id>.png` so the
runtime loads them (`GEN=../game-asset-gen`):

```bash
node "$GEN/gen-assets.mjs" <projectPath>/assets.manifest.json -d        # dry-run prompts
cd <projectPath> && node "$GEN/gen-assets.mjs" assets.manifest.json     # generate
python3 "$GEN/alpha_key.py" -d Assets/Resources/Art --skip bg_cafe,concept_keyart
```

**The keyer step is REQUIRED for `transparent` sprites** — nano-banana paints a fake
checkerboard instead of real alpha, so unkeyed cut-outs show grey boxes in-engine.
Idempotent (skips existing PNGs; re-run to fill failures). If no Vertex credential is
available, skip this step — `SpriteLoader` falls back to `PrimitiveArt` flat-color per
missing id, so the build still runs.

### 3D models

Come from the bundled **`3d-prompt`** skill (Meshy GLB) via the `game-asset-gen` wrapper
`gen-models.mjs`, which writes `Assets/Resources/Models/<id>.bytes`:

```bash
node "$GEN/gen-models.mjs" <projectPath>/models.manifest.json -d              # dry-run prompts
node "$GEN/gen-models.mjs" <projectPath>/models.manifest.json -o <projectPath>  # generate GLBs
```

Each model delegates to `3d-prompt/pipeline.mjs` (Gemini views → Meshy `multi-image-to-3d`),
so it needs the same Vertex SA **and** a Meshy key (1Password `op` or `MESHY_API_KEY`).
Idempotent, and **never a hard gate** — a model that fails to generate is skipped and
`ModelLoader` renders a tinted primitive capsule for that fighter. `gen-models.mjs` finds
`3d-prompt` at the repo-root skill dir or via `$THREE_D_PROMPT_DIR`.

## Gotchas that bite here

- **Generated art must live under `Assets/Resources/Art/`** (2D) or
  `Assets/Resources/Models/<id>.bytes` (3D) — only `Resources/` ships for `Resources.Load`,
  and a raw `.glb` won't load (needs the `.bytes` `TextAsset` extension). Manifest `id` ==
  filename stem == runtime lookup key; keep all three identical.
- **nano-banana never returns real alpha** — run `alpha_key.py` or `transparent` sprites
  show grey boxes.
- **`ref` over-reaches on inanimate props** — referencing a character-rich concept board
  when generating a plain object injects that character. Drop `ref` + add hard negatives.

## Next phase

Author the game layer → **`unity-poc-gameplay`**.
