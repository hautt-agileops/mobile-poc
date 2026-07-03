# SPEC — 2D Fighter POC

**Engine**: Unity 6000.x → WebGL → Vercel. Code-driven (`template/` `Fighter` framework, zero scene authoring).
**Art root**: `unity/Assets/Art/` (117 PNGs, true alpha, 1408×768 source, sliced at load).
**Roster**: Axiom (gunner, 3 install modes) · Vyre (clawed, ascendant transform).

Every milestone builds to a **public playable WebGL URL**. No milestone leaves the game unplayable.

---

## Requirements (global)

| # | Requirement |
|---|-------------|
| R1 | 60fps WebGL, keyboard input (P1 WASD+UJK, P2 arrows+numpad), local 2P + CPU dummy |
| R2 | Round-based 1v1: best-of-3, per-round timer, HP depletes → KO |
| R3 | Sprites load from `Resources/Art/**` via `SpriteLoader`; missing art → flat-color fallback (never a hard gate) |
| R4 | Frame data driven by `CharacterDef` (startup/active/recovery per move) |
| R5 | Hit/block detection, hitstun, chip, knockback |
| R6 | Deterministic playtest gate passes headless before every build |
| R7 | Parallax stage, HUD (HP bars, timer, round pips), win/KO screens |

---

## Milestone 1 — Core Fight Loop (playable: Axiom mirror match)

**Goal**: one character, movement + normals + KO. Mirror match Axiom vs Axiom (P2/CPU). Proves the loop.

**Scope**: idle/walk/jump/crouch locomotion · 6 normals · hurt/hitstun · HP bar · KO + win pose · single stage.

**Assets**
| role | path | frames |
|------|------|--------|
| idle | `Assets/Art/Characters/Axiom/idle/axiom_idle_{0,1}.png` | 2 |
| walk | `Assets/Art/Characters/Axiom/walk/axiom_walk_{0..5}.png` | 6 |
| jump | `Assets/Art/Characters/Axiom/jump/axiom_jump_{0,1,2}.png` | 3 |
| crouch | `Assets/Art/Characters/Axiom/crouch/axiom_crouch.png` | 1 |
| hurt | `Assets/Art/Characters/Axiom/hurt/axiom_hurt.png` | 1 |
| lp | `Assets/Art/Characters/Axiom/lp/axiom_lp_{0,1,2}.png` | 3 |
| mp | `Assets/Art/Characters/Axiom/mp/axiom_mp_{0,1,2}.png` | 3 |
| hp | `Assets/Art/Characters/Axiom/hp/axiom_hp_{0..3}.png` | 4 |
| lk | `Assets/Art/Characters/Axiom/lk/axiom_lk_{0,1,2}.png` | 3 |
| mk | `Assets/Art/Characters/Axiom/mk/axiom_mk_{0,1,2}.png` | 3 |
| hk | `Assets/Art/Characters/Axiom/hk/axiom_hk_{0..3}.png` | 4 |
| ko | `Assets/Art/Characters/Axiom/ko/axiom_ko_{0,1,2}.png` | 3 |
| win | `Assets/Art/Characters/Axiom/win/axiom_win.png` | 1 |
| stage floor | `Assets/Art/Environments/stage_floor.png` | 1 |
| HP frame | `Assets/Art/UI/ui_hp_frame.png` | 1 |
| HP fill | `Assets/Art/UI/ui_hp_fill.png` | 1 |

**Playable check**: two Axioms fight, land normals, HP drops, KO triggers win pose.

---

## Milestone 2 — Full Versus (playable: Axiom vs Vyre)

**Goal**: second character + defense + specials + FX + full HUD + rounds/timer. Real 2-character match.

**Scope**: add Vyre (full move set) · block + chip + blockspark · base special per char · hitsparks · meter · timer · best-of-3 round pips · parallax bg.

**Assets — Vyre (full)**
| role | path | frames |
|------|------|--------|
| idle | `Assets/Art/Characters/Vyre/idle/vyre_idle_{0,1}.png` | 2 |
| walk | `Assets/Art/Characters/Vyre/walk/vyre_walk_{0..5}.png` | 6 |
| jump | `Assets/Art/Characters/Vyre/jump/vyre_jump_{0,1,2}.png` | 3 |
| crouch | `Assets/Art/Characters/Vyre/crouch/vyre_crouch.png` | 1 |
| block | `Assets/Art/Characters/Vyre/block/vyre_block.png` | 1 |
| hurt | `Assets/Art/Characters/Vyre/hurt/vyre_hurt.png` | 1 |
| lp/mp/hp | `Assets/Art/Characters/Vyre/{lp,mp,hp}/vyre_*_{n}.png` | 3/3/4 |
| lk/mk/hk | `Assets/Art/Characters/Vyre/{lk,mk,hk}/vyre_*_{n}.png` | 3/3/4 |
| special | `Assets/Art/Characters/Vyre/special/vyre_special_{0..3}.png` | 4 |
| ko | `Assets/Art/Characters/Vyre/ko/vyre_ko_{0,1,2}.png` | 3 |
| win | `Assets/Art/Characters/Vyre/win/vyre_win.png` | 1 |

**Assets — defense + FX + HUD**
| role | path | frames |
|------|------|--------|
| Axiom block | `Assets/Art/Characters/Axiom/block/axiom_block.png` | 1 |
| hitspark | `Assets/Art/FX/fx_hitspark_{0,1,2}.png` | 3 |
| blockspark | `Assets/Art/FX/fx_blockspark.png` | 1 |
| timer frame | `Assets/Art/UI/ui_timer_frame.png` | 1 |
| meter fill | `Assets/Art/UI/ui_meter_fill.png` | 1 |
| round pip | `Assets/Art/UI/ui_round_pip.png` | 1 |
| logo | `Assets/Art/UI/ui_logo.png` | 1 |
| parallax bg | `Assets/Art/Environments/stage_threshold_{bg,far,fore}.png` | 3 |

**Playable check**: Axiom vs Vyre, block reduces + chips, specials fire with FX, best-of-3 with timer + round pips resolves a match.

---

## Milestone 3 — Full Product (playable: complete game)

**Goal**: install/transform systems + character select + endings. Ship-quality vertical slice.

**Scope**: Axiom 3 install modes (blade/cannon/pulse) with mode icons + aura + cannon projectile · Vyre ascendant transform state · character-select via portraits · ending screens.

**Assets — install / transform**
| role | path | frames |
|------|------|--------|
| Axiom install: blade | `Assets/Art/Characters/Axiom/special_blade/axiom_special_blade_{0..3}.png` | 4 |
| Axiom install: cannon | `Assets/Art/Characters/Axiom/special_cannon/axiom_special_cannon_{0..3}.png` | 4 |
| Axiom install: pulse | `Assets/Art/Characters/Axiom/special_pulse/axiom_special_pulse_{0,1,2}.png` | 3 |
| Vyre ascendant | `Assets/Art/Characters/Vyre/ascendant/vyre_ascendant.png` | 1 |
| mode icon blade | `Assets/Art/UI/ui_mode_blade.png` | 1 |
| mode icon cannon | `Assets/Art/UI/ui_mode_cannon.png` | 1 |
| mode icon pulse | `Assets/Art/UI/ui_mode_pulse.png` | 1 |
| install aura | `Assets/Art/FX/fx_install_aura.png` | 1 |
| cannon shot | `Assets/Art/FX/fx_cannon_shot.png` | 1 |

**Assets — select + endings**
| role | path | frames |
|------|------|--------|
| Axiom portrait | `Assets/Art/Characters/Axiom/portrait/axiom_portrait.png` | 1 |
| Vyre portrait | `Assets/Art/Characters/Vyre/portrait/vyre_portrait.png` | 1 |
| ending: protocol | `Assets/Art/UI/ui_ending_protocol.png` | 1 |
| ending: blood | `Assets/Art/UI/ui_ending_blood.png` | 1 |

**Playable check**: select screen → pick fighter → Axiom cycles 3 install modes (icon+aura+cannon projectile), Vyre triggers ascendant → win routes to matching ending screen.

---

## Asset ledger

| category | dir | count | milestone |
|----------|-----|-------|-----------|
| Axiom core (idle→ko/win) | `Characters/Axiom/*` | ~40 | M1 |
| Vyre full | `Characters/Vyre/*` | ~40 | M2 |
| Axiom installs | `Characters/Axiom/special_*` | 11 | M3 |
| FX | `FX/` | 6 | M2 (sparks) / M3 (aura, cannon) |
| UI | `UI/` | 11 | M1 (hp) / M2 (timer,meter,pip,logo) / M3 (mode icons, endings) |
| Environments | `Environments/` | 4 | M1 (floor) / M2 (parallax) |
| Concept | `Concept/` | 2 | reference only — NOT shipped |

**Shippable**: 115 PNGs (117 minus 2 concept). All true-alpha verified.
