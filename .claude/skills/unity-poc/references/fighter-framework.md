# Fighter framework reference

How to turn a fighting-game brief into content on top of the bundled framework.
The `Framework/` layer is reused verbatim; you only write a `Game/` file.

## The one job-specific file

`Assets/Scripts/Game/<Title>.cs` does three things:

```csharp
// REQUIRED signature — the headless playtest/build (BuildScript.cs) finds the roster by
// reflection on `public static List<CharacterDef> BuildRoster()`. Name the class anything.
public static List<CharacterDef> BuildRoster() =>
    new List<CharacterDef> { MyFighterA(), MyFighterB() };  // each returns a CharacterDef

[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
static void Boot()
{
    Roster.All = BuildRoster();      // runtime + gate share one source
    new GameObject("Game").AddComponent<GameBootstrap>();
}
```

No scene editing — the empty boot scene + this attribute spawn everything. **`Boot()` runs at
runtime only**; `RuntimeInitializeOnLoadMethod` does NOT fire under `-executeMethod` batchmode,
which is why the gate reflects `BuildRoster()` directly. Skip it and the playtest can't find a
roster.

## CharacterDef knobs

| Field | Meaning |
|-------|---------|
| `walkForward/walkBack/dashSpeed/jumpVelocity/gravity` | movement feel |
| `maxHealth` | health pool (damage values are absolute) |
| `bodyColor/accentColor` | programmer-art colors (body + outline/strip) |
| `light/heavy/special/super` | `MoveData` for the 4 buttons |
| `installType` | `None` / `MeterBuff` (timed stat buff, costs meter) / `StanceSwap` (toggle moveset) |
| `installSpeedMult/installDamageMult/installDuration` | MeterBuff tuning |
| `altLight/altHeavy/altSpecial` + `stanceBColor/stanceBName` | StanceSwap alternate moveset |

`super` auto-replaces `special` when meter ≥ 100 (costs 100). Keep `special` free.

## MoveData (frame data — all counts at 60fps)

```
startup / active / recovery   timeline
damage / hitstun / blockstun  on-contact
knockback / launch / knockdown horizontal push / upward / hard KD
hitbox = Rect(xOffset, yFromFeet, w, h)   mirrored by facing
meterGainHit/Block/Whiff      economy
hitstop / flash               feel (freeze frames + color pop)
```

Sane normal: `startup 5-8, active 3-4, recovery 9-18`. Heavies slower + bigger hitbox.
Specials usually `knockdown=true`. Supers: low startup, big hitbox, `hitstop 16`.

## Mapping common fighting-game mechanics

| Brief asks for | Implement as |
|----------------|--------------|
| install / transformation state | `InstallType.MeterBuff` (timed buff) |
| stance shifting / multi-state | `InstallType.StanceSwap` + alt moveset |
| EX / super | `super` move (meter ≥ 100 upgrades special) |
| meter system | built in (`Fighter.meter`, gained on hit/block) |
| training / dummy mode | `InputReader.aiControlled` (SelectMenu "TRAINING" toggle) |
| local versus | P1/P2 keyboard in `PlayerKeys` |
| rounds / win-loss loop | `GameBootstrap` best-of-3 phase machine |

## Things the framework does NOT do (yet) — extend points

- Air attacks / juggles (only `launch` exists; no air normals).
- Projectiles / zoning (add a `Projectile` spawned from a `MoveData` flag).
- Cancels / combo routing / input buffering beyond single-tap + dash double-tap.
- Crouch / overhead / low mix-ups (all hits are mid).
- Gamepad (add `com.unity.inputsystem` + a second `InputReader` path).

These are the natural "what to build next" items for a vertical-slice handoff.
