---
name: unity-poc-scaffold
description: Phase 2 of the unity-poc pipeline — check the build environment then create the code-driven Unity project. Verifies Unity 6000.x + WebGL module, Vercel CLI, Node, and the Vertex/Meshy credentials, then headlessly creates the project and copies the 2D (template/) or 3D (template3d/) fighter framework plus com.unity.ugui (and glTFast for real 3D models). Invoked by the unity-poc skill; load it directly when a spec'd Unity POC needs its project scaffolded.
---

# unity-poc-scaffold — env check + create project

Phase 2 of **unity-poc** (steps 4–5). Runs after the spec (`unity-poc-spec`) and before
asset gen. Shared assets (`template/`, `template3d/`) live in the sibling `unity-poc/` skill
dir. Full landmine list: `../unity-poc/references/gotchas.md`.

## 4. Check the environment (before promising a build)

- Unity Editor: `ls /Applications/Unity/Hub/Editor` (need a 6000.x with the **WebGL**
  module: `.../PlaybackEngines/WebGLSupport`).
- Vercel CLI: `which vercel` (or `npx vercel`), Node 18+.
- Vertex AI credential for asset gen: a `sa.json` / `GOOGLE_*` env / 1Password SA (same as
  the `game-asset-gen` skill resolves). If absent, asset gen is skipped and the build falls
  back to `PrimitiveArt` flat-color — still playable, just programmer art.
- If Unity/WebGL module is missing, **stop and tell the user** — can't build.

## 5. Scaffold the project (once)

Create a Unity project headlessly, copy the framework, add `com.unity.ugui` to
`Packages/manifest.json`.

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app/Contents/MacOS/Unity
"$UNITY" -batchmode -quit -createProject <projectPath> -logFile -
# 2D fighter (paths relative to the unity-poc skill dir):
cp -R ../unity-poc/template/Assets/Scripts ../unity-poc/template/Assets/Editor ../unity-poc/template/Assets/link.xml <projectPath>/Assets/
# ensure "com.unity.ugui": "2.0.0" is in Packages/manifest.json (minimal templates omit it)
```

**3D brawler** copies `template3d/` instead, and adds glTFast so `ModelLoader` can load real
GLBs. glTFast is **optional**: the `HAS_GLTFAST` define gates every glTFast call, so a project
without the package still compiles (primitive-only) and never hard-fails:

```bash
cp -R ../unity-poc/template3d/Assets/Scripts ../unity-poc/template3d/Assets/Editor ../unity-poc/template3d/Assets/link.xml <projectPath>/Assets/
# add the package (enables real models):
#   "com.unity.cloud.gltfast": "6.10.1" in Packages/manifest.json (alongside com.unity.ugui)
# then turn on the glTFast code path by writing the define ONLY when the package is present:
printf -- '-define:HAS_GLTFAST\n' > <projectPath>/Assets/csc.rsp
```

Skip the package + `csc.rsp` to ship a primitive-only 3D build (fastest, zero 3D-asset cost).

## Gotchas that bite here

- **uGUI is not a built-in module.** Minimal Unity templates ship `manifest.json` without
  `com.unity.ugui`; `UnityEngine.UI` won't compile until you add it.
- **(3D) glTFast is optional, gated by `HAS_GLTFAST`** — real models need BOTH
  `com.unity.cloud.gltfast` AND `Assets/csc.rsp` with `-define:HAS_GLTFAST`; add the define
  ONLY when the package is present, or skip both for a primitive-only build that still ships.

## Next phase

Generate assets → **`unity-poc-assets`**.
