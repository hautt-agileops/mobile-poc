# unity-poc — Gotchas (full list)

Shared landmine list for the whole pipeline. Each `unity-poc-*` phase sub-skill repeats
the gotchas that bite in that phase; this is the complete reference. The TDD's risk
register (spec phase) should pre-empt every one of these.

## Build / runtime (scaffold + gameplay + buildship)

- **IL2CPP stripping kills runtime-created components → "Could not produce class with ID
  N" at boot.** This game builds every component via `AddComponent` (uGUI, EventSystem,
  sprites), so the managed stripper can't see them used and removes them. Build sets
  `ManagedStrippingLevel.Minimal` + `stripEngineCode = false`, and `Assets/link.xml`
  preserves the uGUI/UIModule/TextRendering assemblies. Symptom is a *boot-time* console
  error — it deploys fine and the loader shows, but the game never starts. The single-shot
  headless screenshot misses it (freezes at the loader); the **puppeteer browser test**
  (real wall-clock boot) is what catches it.
- **No EventSystem = dead UI = "can't play anything".** uGUI Buttons need an
  `EventSystem` + input module in the scene or clicks never register — the player is stuck
  on character-select and nothing starts. `GameBootstrap.EnsureEventSystem()` creates one
  (`StandaloneInputModule`, legacy). This is exactly the class of bug the playtest gate
  exists to catch; never deploy without it. World-space sprite HUDs sidestep it entirely.
- **uGUI is not a built-in module.** Minimal Unity templates ship `manifest.json` without
  `com.unity.ugui`; `UnityEngine.UI` won't compile until you add it.
- **Input handling.** The framework uses legacy `Input`; the build script sets
  `activeInputHandler = 2` (Both) so it works under WebGL. New-Input-System-only projects
  throw at runtime.
- **WebGL compression = Disabled** on purpose — guarantees it loads from plain static
  hosting (Vercel) without `Content-Encoding` server config. Larger files; fine for a POC.
- **The Editor/Framework layers are game-agnostic — keep them so.** `BuildScript.cs`
  discovers the roster via reflection (`public static List<CharacterDef> BuildRoster()`),
  not by a hardcoded game-class name, so a new brief never edits `Editor/`. If you find
  yourself hand-editing `BuildScript.cs` to reference your game class, you've broken the
  contract — expose `BuildRoster()` instead.
- **`*.sh` scripts default to `Fighter.*`** — 3D builds set
  `BUILD_METHOD`/`PLAYTEST_METHOD=Fighter3D.*`; non-fighter builds invoke Unity directly
  with their own namespace. `local-test.sh` + `deploy-vercel.sh` are namespace-agnostic.
- Everything is code-driven on purpose: no `.unity`/`.prefab` YAML to hand-edit means the
  whole pipeline is reproducible headless and diffable as plain C#.

## Assets (assets phase)

- **Generated art lives under `Assets/Resources/Art/`** — Unity only ships `Resources/`
  folders for `Resources.Load`. PNGs anywhere else won't be in the WebGL build. Manifest
  `id` == filename stem == `SpriteLoader` lookup key; keep all three identical. Asset gen is
  **never a hard gate** — a missing/failed asset degrades to a flat box, it never breaks the
  build.
- **nano-banana never returns real alpha** — "transparent background" comes back as opaque
  RGB with a painted checkerboard. **Run `alpha_key.py`** for `transparent` sprites or they
  show grey boxes in-engine.
- **`ref` over-reaches on inanimate props** — referencing a character-rich concept board
  when generating a plain object injects that character. Drop `ref` + add hard negatives.

## 3D-specific (scaffold + gameplay)

- **(3D) glTFast is optional and gated by `HAS_GLTFAST`.** `ModelLoader` only calls glTFast
  inside `#if HAS_GLTFAST`. Real models need BOTH `com.unity.cloud.gltfast` in `manifest.json`
  AND `Assets/csc.rsp` containing `-define:HAS_GLTFAST` — add the define ONLY when the package
  is present, or the project won't compile. Without either, the 3D build is primitive-only and
  still ships. Models live at `Assets/Resources/Models/<id>.bytes` (Unity ships arbitrary
  binaries through `Resources` only as a `.bytes` `TextAsset`; a `.glb` won't load).
- **(3D) a lit scene needs a light** — `GameBootstrap3D` adds a directional light + flat
  ambient. A 3D scene with no light renders black; don't strip that from a custom bootstrap.
- **(3D) glTFast model load is async + fire-and-forget** — fighters show a primitive instantly
  and swap to the GLB when it finishes; the headless `Playtest3D` never loads models (logic only),
  so a slow/failed import never blocks the gate.

## Deploy (buildship phase)

- **First Vercel deploy** needs `npx vercel login` then `npx vercel link` once. Subsequent
  `vercel deploy --prod --yes` are non-interactive.
- **Splash screen / license.** Batchmode builds need an activated Unity license. Personal
  license shows the Unity splash — acceptable for a prototype.
- **The browser interaction smoke (`browser-test.mjs`) clicks fixed screen coords** tuned to
  the bundled fighter's select screen ("Funnet card", TRAINING, START). Clicks are wrapped in
  try/catch and only **log** — a miss never fails the test (the FAIL gate is fatal console
  errors / page errors). For a different UI layout, retune the coords or ignore the after-start
  screenshot; the boot-fault detection still works regardless.
