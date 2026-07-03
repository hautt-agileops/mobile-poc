# Genre template contract

`templates/` holds one **self-contained folder per genre**. There is deliberately **no shared C#
core** — 2D and 3D already diverge in their "core" utilities (sprite-loader vs model-loader,
ortho vs perspective camera, sprite vs mesh fallback), so a shared layer would cost more than it
saves. Each genre folder is namespace-isolated and copied whole by `unity-scaffold`.

The real reuse lives **outside** the templates: the pipeline flow, `game-asset-gen` /
`gen-models.mjs`, `scripts/*.sh`, the playtest + puppeteer gates, and the IL2CPP config pattern.
A new genre plugs into that pipeline by honoring the contract below — not by sharing code.

```
templates/
  fighter2d/   namespace Fighter     2D PNG sprites
  arena3d/     namespace Fighter3D   3D GLB models
  <newgenre>/  namespace <Ns>        add when a brief needs it
```

## What a genre folder MUST expose

A folder is pipeline-compatible iff it provides all of these. Copy an existing genre and swap
the genre-specific parts rather than starting blank.

1. **Layout**
   ```
   templates/<genre>/Assets/
     Scripts/Framework<X>/   reusable engine for this genre (namespace <Ns>)
     Scripts/Game/           per-brief layer (unity-poc-gameplay writes this)
     Editor/BuildScript.cs   headless build + playtest entry (namespace <Ns>.EditorTools)
     link.xml                IL2CPP strip guard for this genre's runtime types
   ```

2. **One namespace** `<Ns>` for the framework, `<Ns>.EditorTools` for the Editor layer.
   Existing: `Fighter` / `Fighter3D`. Pick a distinct one; keeps genres from colliding if ever
   copied side by side.

3. **Two static Editor entry methods** (the only pipeline coupling points):
   - `<Ns>.EditorTools.BuildScript.RunPlaytest()` — runs the headless gate, exits **non-zero on
     fail** (aborts the build).
   - `<Ns>.EditorTools.BuildScript.BuildWebGL()` — WebGL build, compression **Disabled**,
     `ManagedStrippingLevel.Minimal` + `stripEngineCode = false` (IL2CPP "Could not produce
     class with ID N" guard).

4. **Reflection roster contract.** `BuildScript` discovers the Game layer by reflection, NOT by a
   hard reference — it scans all assemblies for a
   `public static List<<DefType>> BuildRoster()` and requires **≥ 2** entries. `<DefType>` is the
   genre's character/entity struct (`CharacterDef` for 2D, `CharacterDef3D` for 3D; a new genre
   defines its own). RuntimeInitialize hooks don't fire in `-executeMethod` batchmode, so this
   reflection lookup is the contract — the Game layer just has to define that one static method.

5. **Headless-drivable sim.** The playtest drives the game **frame-by-frame with no scene / no
   MonoBehaviour lifecycle** and asserts something actually happened (catches "compiles but does
   nothing"). Keep genre logic advanceable from a plain `Tick(dt)`-style call, not only from
   `Update()`.

6. **Asset convention** (only `Resources/` ships with `Resources.Load`):
   - 2D → `Resources/Art/<id>.png`, loaded by the genre's sprite loader.
   - 3D → `Resources/Models/<id>.bytes` (`.bytes` required — Unity only ships known extensions),
     read at runtime via glTFast.
   - Genre owns its **loader + primitive fallback** so a partial/failed asset run still produces
     a playable headless build (2D → flat color, 3D → primitive capsule). Assets are **never a
     hard gate**.

## Pipeline invocation per genre

`scripts/*.sh` default to `Fighter.*`. Any non-2D-fighter genre must point the scripts at its
own entry methods via env:

```bash
BUILD_METHOD=<Ns>.EditorTools.BuildScript.BuildWebGL     scripts/build-webgl.sh ...
PLAYTEST_METHOD=<Ns>.EditorTools.BuildScript.RunPlaytest  scripts/playtest.sh ...
```

3D also needs the `com.unity.cloud.gltfast` package AND `Assets/csc.rsp` with
`-define:HAS_GLTFAST` (add the define only when the package is present). A new genre adds only
the packages it actually uses.

## Adding a genre — checklist

1. `cp -R templates/fighter2d templates/<genre>` (or `arena3d` for a 3D base).
2. Rename the namespace throughout to `<Ns>` (framework + `<Ns>.EditorTools`).
3. Replace the genre logic (entity, sim, camera, loader, fallback, HUD) — keep the two Editor
   entry methods and the `BuildRoster()` reflection shape intact.
4. Update `link.xml` for the new runtime types.
5. Add the genre row to the pick tables in `unity-poc/SKILL.md`, `unity-poc/README.md`,
   `unity-poc-spec/SKILL.md`, and root `CLAUDE.md`.
6. Teach `unity-scaffold` the new brief → folder mapping + any extra packages.

If a brief doesn't fit any genre folder, write the Game layer from scratch and reuse only the
pipeline + `scripts/` — still honor the two Editor entry methods and the `BuildRoster()` contract
so the headless gates work.
