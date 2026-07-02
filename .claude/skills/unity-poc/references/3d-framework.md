# 3D brawler framework reference

How to turn a 3D fighting/arena brief into content on top of the bundled `template3d/`
framework. The `Framework3D/` layer (namespace `Fighter3D`) is reused verbatim; you only write
a `Game/` file — exactly the same contract as the 2D fighter, one dimension up.

It is a **3D arena brawler**: two fighters move freely on the XZ plane, auto-face each other,
and trade melee/projectile attacks resolved by **sphere overlap** (no rotated boxes — robust to
author blind). Real models load via glTFast; missing models degrade to tinted primitive capsules.

## The one job-specific file

`Assets/Scripts/Game/<Title>.cs` does three things — note the REQUIRED `BuildRoster()` signature:

```csharp
// REQUIRED — the headless playtest/build (BuildScript3D) reflects on
// `public static List<CharacterDef3D> BuildRoster()`. Name the class anything.
public static List<CharacterDef3D> BuildRoster() =>
    new List<CharacterDef3D> { FighterA(), FighterB() };

[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
static void Boot()
{
    StoryText3D.gameTitle = "MY ARENA";
    StoryText3D.premise = "…";
    Roster3D.All = BuildRoster();              // runtime + gate share one source
    new GameObject("Game").AddComponent<GameBootstrap3D>();
}
```

`Boot()` runs at runtime only; `RuntimeInitializeOnLoadMethod` does NOT fire under
`-executeMethod` batchmode, which is why the gate reflects `BuildRoster()` directly.

## CharacterDef3D knobs (delta from the 2D CharacterDef)

| Field | Meaning |
|-------|---------|
| `modelId` | GLB stem under `Assets/Resources/Models/<id>.bytes`. Empty/missing => primitive capsule. |
| `modelScale` / `modelYaw` | fit the imported GLB (height multiplier; extra Y rotation if it doesn't face +Z) |
| `walkSpeed/backSpeed/strafeSpeed/dashSpeed` | XZ movement feel (strafe is new vs 2D) |
| `jumpVelocity/gravity/height/radius` | `radius` doubles as the hurt-sphere radius |
| `maxHealth` | health pool (damage is absolute) |
| `bodyColor/accentColor` | primitive-fallback colors |
| `light/heavy/special/super` | `MoveData3D` for the 4 buttons |
| `installType` | `None` / `MeterBuff` / `StanceSwap` — identical semantics to 2D |
| `altLight/altHeavy/altSpecial` + `stanceB*` | StanceSwap alternate moveset |

`super` auto-replaces `special` when meter ≥ 100 (costs 100). Keep `special` free.

## MoveData3D (frame data — counts at 60fps)

```
startup / active / recovery   timeline
damage / hitstun / blockstun  on-contact
knockback / launch / knockdown push along facing / upward / hard KD
reach / height / radius        hit-SPHERE: forward distance, up from feet, sphere radius
projectile + projectileSpeed/Life/Radius   travelling shot along facing
meterGainHit/Block/Whiff       economy
hitstop / flash                feel
```

Sane normal: `startup 5-8, active 3-4, recovery 9-18, reach ~1.0-1.3, radius ~0.7-0.9`. A hit
lands when `distance(hitSphereCenter, opponentHurtCenter) ≤ reach.radius + hurtRadius`. Specials
usually `knockdown=true`. Set `projectile=true` for zoning shots.

## Mapping common 3D-fighter mechanics

| Brief asks for | Implement as |
|----------------|--------------|
| install / transformation | `InstallType.MeterBuff` |
| stance shifting | `InstallType.StanceSwap` + alt moveset |
| EX / super | `super` move (meter ≥ 100) |
| projectile / zoning | `MoveData3D.projectile = true` |
| 3D movement + strafing | built in (`moveFwd` + `moveStrafe`, facing-relative) |
| training / dummy | `InputReader3D.aiControlled` (select "TRAINING") |
| local versus | P1 WASD / P2 arrows in `PlayerKeys3D` |
| rounds / win-loss loop | `GameBootstrap3D` best-of-3 phase machine |

## Models (the 3D asset path)

`models.manifest.json` (a `style` string + `{id, prompt}` list) → `game-asset-gen/gen-models.mjs`
→ Meshy GLBs at `Assets/Resources/Models/<id>.bytes`. `modelId` == manifest `id` == filename stem.
`ModelLoader` loads them via glTFast and parents under the fighter; any failure keeps the capsule.

## Things the framework does NOT do (yet) — extend points

- Aerial combat / juggles beyond `launch`; ground-only normals.
- Real 3D navigation AI (the dummy walks straight in; training holds block).
- Sidestep i-frames, throws, target-lock switching for >2 fighters at once.
- Rotated/oriented hitboxes (spheres only — fine for a slice, coarse for precise spacing).
- Animated GLB playback (models load as static meshes; no skeletal clips driven yet).

These are the natural "what to build next" items for a vertical-slice handoff.
