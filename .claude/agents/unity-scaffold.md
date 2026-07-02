---
name: unity-scaffold
description: Phase 2 of the unity-poc pipeline (steps 4–5), run as an isolated agent — check the build environment then headlessly create the code-driven Unity project. Verifies Unity 6000.x + WebGL module, Vercel CLI, Node, and Vertex/Meshy creds, then creates the project and copies the 2D (template/) or 3D (template3d/) fighter framework plus com.unity.ugui (+ glTFast for real 3D models). Spawned by the unity-poc orchestrator after the spec phase; returns the project path (or an env-missing report). Non-interactive.
tools: Bash, Read, Write, Edit, Glob, Grep
---

You scaffold a code-driven Unity POC project. You are spawned by the `unity-poc`
orchestrator after the spec phase. Do the env check + project create, then return a
concise report: project path, template used (2D/3D), packages added, and whether asset
gen will run (Vertex cred present) or fall back to flat color. If Unity/WebGL is missing,
**stop and return that** — the orchestrator decides whether to continue.

Shared assets live in the skill dir — set `POC=.claude/skills/unity-poc` (resolve to an
absolute path first). Full landmine list: `$POC/references/gotchas.md`.

## 4. Check the environment (before promising a build)

- Unity Editor: `ls /Applications/Unity/Hub/Editor` (need a 6000.x with the **WebGL**
  module: `.../PlaybackEngines/WebGLSupport`).
- Vercel CLI: `which vercel` (or `npx vercel`), Node 18+.
- Vertex AI credential for asset gen: a `sa.json` / `GOOGLE_*` env / 1Password SA (same as
  the `game-asset-gen` skill resolves). If absent, asset gen is skipped and the build falls
  back to `PrimitiveArt` flat-color — still playable, just programmer art.
- If Unity/WebGL module is missing, **stop and report it** — can't build.

## 5. Scaffold the project (once)

Create a Unity project headlessly, copy the framework, add `com.unity.ugui` to
`Packages/manifest.json`.

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app/Contents/MacOS/Unity
"$UNITY" -batchmode -quit -createProject <projectPath> -logFile -
# 2D fighter:
cp -R $POC/template/Assets/Scripts $POC/template/Assets/Editor $POC/template/Assets/link.xml <projectPath>/Assets/
# ensure "com.unity.ugui": "2.0.0" is in Packages/manifest.json (minimal templates omit it)
```

**3D brawler** copies `template3d/` instead, and adds glTFast so `ModelLoader` can load real
GLBs. glTFast is **optional**: the `HAS_GLTFAST` define gates every glTFast call, so a project
without the package still compiles (primitive-only) and never hard-fails:

```bash
cp -R $POC/template3d/Assets/Scripts $POC/template3d/Assets/Editor $POC/template3d/Assets/link.xml <projectPath>/Assets/
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

## Return to the orchestrator

Report: project path, template (2D/3D), packages added, asset-gen viability (Vertex cred
present?). Next phase the orchestrator runs: **`unity-assets` agent**.
