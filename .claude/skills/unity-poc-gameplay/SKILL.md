---
name: unity-poc-gameplay
description: Phase 4 of the unity-poc pipeline — author the job-specific game layer in Assets/Scripts/Game/. Writes the one file that registers the roster and boots GameBootstrap, each character a CharacterDef (2D) or CharacterDef3D (3D) with frame data + install/stance behaviour, wires art through SpriteLoader, and exposes the reflection contract public static List<CharacterDef> BuildRoster() the headless build/playtest gate needs. Reuses the Framework/ + Editor/ layers verbatim. Invoked by the unity-poc skill; load it directly when a scaffolded Unity POC with assets needs its gameplay written.
---

# unity-poc-gameplay — author the Game/ layer

Phase 4 of **unity-poc** (step 7). Runs after asset gen (the `unity-assets` agent), before the
build gate. This is the **only** job-specific code — the `Framework/` and `Editor/` layers
are reused verbatim. Framework detail: `../unity-poc/references/fighter-framework.md` (2D),
`../unity-poc/references/3d-framework.md` (3D). Full landmine list:
`../unity-poc/references/gotchas.md`.

## 7. Author the game content

In `Assets/Scripts/Game/` — one file that registers the roster and boots `GameBootstrap`
via `[RuntimeInitializeOnLoadMethod]`. Each character is a `CharacterDef` (stats +
`MoveData` frame data + install/stance behaviour).

- **Contract — name the class anything, but expose `public static List<CharacterDef>
  BuildRoster()`.** The headless playtest/build (`BuildScript.cs`) finds the roster by
  reflection on that exact signature — `RuntimeInitializeOnLoadMethod` does NOT fire in
  `-executeMethod` batchmode, so `Boot()` setting `Roster.All` is not enough for the gate.
  No `BuildRoster()` → playtest fails with "no … BuildRoster() found". Boot() should also
  call it (`Roster.All = BuildRoster()`) so runtime and the gate use one source.
- **Wire art via `SpriteLoader`**, not raw `PrimitiveArt`: ask `SpriteLoader.Get("<id>")` /
  `SpriteLoader.Renderer(parent, "<id>", fallbackColor, size, order)` using the exact ids
  from the manifest. Present art shows; missing art degrades to the flat-color box — so the
  same code path works with a full, partial, or empty `Assets/Resources/Art/`.
- **3D brawler:** identical contract, namespace `Fighter3D` — each character is a
  `CharacterDef3D` (set `modelId` to the `models.manifest.json` id), expose
  `public static List<CharacterDef3D> BuildRoster()`, boot `GameBootstrap3D`. Models load
  automatically via `ModelLoader`/glTFast (no manual wiring); missing/failed → primitive
  capsule. Worked example: `../unity-poc/templates/arena3d/Assets/Scripts/Game/ArenaClash3D.cs`.

## Architecture — bundled 2D-fighter framework

`../unity-poc/templates/fighter2d/Assets/Scripts/Framework/` — engine-agnostic of the brief, reused per job:

- **`GameBootstrap.cs`** — the single scene object. Builds camera/stage/HUD, runs
  `Select → RoundIntro → Fight → RoundEnd → MatchEnd`. Fixed 60fps loop in `FixedUpdate`.
- **`Fighter.cs`** — kinematic fighter (no Rigidbody): state machine
  (Idle/Walk/Jump/Attack/Block/Hitstun/Blockstun/KnockDown/Dead), frame-data attack
  timeline, health/meter, install + stance-swap, world-space hit/hurt boxes.
- **`CombatSystem.cs`** — per-frame hitbox↔hurtbox overlap → block-vs-hit resolution,
  damage/stun/knockback/meter, hitstop, hit sparks.
- **`MoveData.cs` / `CharacterDef.cs`** — pure data: frame data + character knobs. This is
  what you edit per character/brief.
- **`InputReader.cs`** — legacy `UnityEngine.Input` (works in WebGL; build sets
  `activeInputHandler = Both`). P1 keyboard, P2 keyboard, AI dummy flag.
- **`HudController.cs` / `SelectMenu.cs`** — uGUI built entirely in code (no prefabs).
- **`CameraRig.cs` / `PrimitiveArt.cs`** — auto-framing ortho camera; runtime flat-color sprites.
- **`SpriteLoader.cs`** — loads generated PNGs from `Assets/Resources/Art/<id>.png` at
  runtime via `Resources.Load` (WebGL-safe, synchronous), caches, **falls back to
  `PrimitiveArt`** for any id without a PNG. `Get(id)` / `GetOr(id)` / `GetFrames(id, n)` /
  `Renderer(parent, id, fallbackColor, size, order)`.
- **`Editor/BuildScript.cs`** — `Fighter.EditorTools.BuildScript.BuildWebGL`: creates the
  empty boot scene, sets WebGL-safe player settings, runs `BuildPipeline.BuildPlayer`.

## Architecture — bundled 3D-brawler framework

`../unity-poc/templates/arena3d/Assets/Scripts/Framework3D/` — namespace `Fighter3D`, full parity
with the 2D fighter (same shapes: `GameBootstrap3D`, `Fighter3D`, `CombatSystem3D`,
`MoveData3D`/`CharacterDef3D`, `InputReader3D`, `HudController3D`/`SelectMenu3D`/`StoryOverlay3D`,
`CameraRig3D`, `Playtest3D`, `Editor/BuildScript3D.cs`) with the 3D deltas:

- **Movement on the XZ plane** — facing-relative `moveFwd`/`moveStrafe`, gravity on Y,
  auto-faces the opponent (`LookRotation`), clamped to a circular arena.
- **Sphere combat** — hit/hurt volumes are spheres (`MoveData3D.reach/height/radius`), so
  resolution is rotation-free and robust. No oriented-box edge cases.
- **`PrimitiveArt3D.cs`** — runtime flat-color primitives via `GameObject.CreatePrimitive`,
  tinted with `MaterialPropertyBlock`. Needs a light — `GameBootstrap3D` adds a directional
  key light + flat ambient.
- **`ModelLoader.cs`** — loads `Assets/Resources/Models/<modelId>.bytes` via **glTFast** and
  parents it under the fighter; any failure keeps the primitive. All glTFast calls sit behind
  `#if HAS_GLTFAST`, so the package is optional and a missing dep never breaks the build.
- **`CameraRig3D.cs`** — perspective camera that frames both fighters, pulling back as they
  separate, with impact shake.
- **`Editor/BuildScript3D.cs`** — `Fighter3D.EditorTools.BuildScript.BuildWebGL` / `.RunPlaytest`;
  same reflection-based roster discovery (`List<CharacterDef3D> BuildRoster()`).

## Gotchas that bite here

- **IL2CPP stripping kills runtime-created components → "Could not produce class with ID N"
  at boot.** Build via `AddComponent`, `ManagedStrippingLevel.Minimal` + `stripEngineCode =
  false`, `link.xml` preserves uGUI/UIModule/TextRendering. Boot-time fault; only the
  puppeteer browser test (buildship phase) catches it.
- **No EventSystem = dead UI.** uGUI Buttons need an `EventSystem` + input module;
  `GameBootstrap.EnsureEventSystem()` creates one. World-space sprite HUDs sidestep it.
- **The Editor/Framework layers are game-agnostic — keep them so.** If you find yourself
  hand-editing `BuildScript.cs` to reference your game class, you've broken the contract —
  expose `BuildRoster()` instead.
- **Non-fighter briefs** reuse only the *patterns* (code-driven boot, `SpriteLoader` +
  fallback), NOT `Fighter`/`CombatSystem`/the fighter `Playtest` — write your own systems
  and rewrite the `Playtest` assertions.

## Next phase

Playtest → build → deploy → handoff → the orchestrator spawns the **`unity-buildship` agent**.
