**Arrow Clash Arena**

**Game Design Document (GDD) - Version 1.3**

*Tagline: Every Arrow Matters*

# 1. Vision

Arrow Clash Arena is a premium two-player interactive archery attraction where every arrow is a meaningful decision. It is designed around real archery, where players may take 5-10 seconds to load, draw, aim and release each arrow.

* Precision, timing and tactical thinking matter more than speed.
* Every valid hit scores, so beginners still enjoy the game.
* Small weak spots and body-part scoring showcase centimeter-level impact tracking.
* The game uses split screen, so no arrow identification is required.

# 2. Core Format

|  |  |
| --- | --- |
| **Item** | **Recommendation** |
| **Players** | 2 players |
| **Screen** | 4.0 m wide x 2.2 m high |
| **Player Area** | 2.0 m wide x 2.2 m high per player |
| **Session Length** | 90 seconds |
| **Expected Shots** | Approximately 10-18 arrows per player, depending on reload/draw time |
| **Input** | Only impact X/Y coordinate from vision system (one event per detected impact; see Section 9.1) |

Coordinate origin: **Y = 0 at the top of the screen, Y = 220 cm at the floor**; X = 0 at the left edge, X = 400 cm at the right edge. The split line sits at X = 200 cm. All zone/size numbers in this document use these axes.

# 3. Gameplay Philosophy

* Every Arrow Matters: each shot must feel valuable.
* Every Hit Scores: body hits reward beginners; weak spots reward experts.
* Every Wave Presents a Choice: safe score, tactical chain reaction, or PvP curse.
* Every Target Feels Alive: targets use body language to reveal opportunities.
* Precision Is King: leaderboard players win by hitting 5-10 cm weak spots.

# 4. Screen and Spawn Zones

Each player side is divided into safe and active gameplay zones. Important objects should not appear too high, too low, too close to the split line, or too close to edges.

|  |  |  |
| --- | --- | --- |
| **Zone** | **Height Band** | **Use** |
| Safe Top | 0-15 cm | No target spawning |
| Flying Zone | 15-60 cm | Bats, birds, upper dragon movement |
| Main Combat Zone | 60-145 cm | Main enemies, dragon, boss weak spots |
| Tactical Zone | 145-180 cm | Treasure, TNT, curse targets, chain objects |
| Safe Bottom | 180-220 cm | No important target spawning |

Recommended target sizes: large monsters 50-70 cm, normal targets 30-45 cm, tactical objects 30-40 cm, weak spots 5-12 cm depending on difficulty (Pro floor = 5 cm — the vision system must resolve impacts to sub-centimetre accuracy to support this; see Section 17).

# 5. Start-of-Game Difficulty Selection (Version 1)

For version 1, the player chooses difficulty at the start instead of using real-time adaptive difficulty. This is simpler to build, easier to test and easier for players to understand.

|  |  |  |  |  |
| --- | --- | --- | --- | --- |
| **Difficulty** | **Weak Spot Size** | **Weak Spot Visible** | **Movement** | **Notes** |
| Beginner | 10-12 cm | 3.0 sec | Slow | More body-hit targets; fewer curses |
| Casual | 8-10 cm | 2.0 sec | Medium | Standard game balance |
| Pro | 5-6 cm | 1.0-1.5 sec | Medium-fast | More moving weak spots; leaderboard eligible |

Future Version 2 can introduce adaptive difficulty using recent player accuracy, weak-spot hit rate and average distance from centre. Version 1 should prioritise clean gameplay and reliable balancing.

# 6. Wave System

Every 5-8 seconds a challenge wave appears, depending on selected difficulty. Each wave contains only 3-4 meaningful objects. The player normally gets one realistic shot opportunity per wave.

* Exactly one high-value target in most waves.
* One tactical object such as TNT, rope, crystal or treasure.
* Optional curse target in selected waves.
* No overlapping objects.
* Minimum 25 cm separation between object edges.
* Movement must be readable, not random or impossible.

# 7. Target Body Language Requirements

Targets should behave like living characters, not static graphics. Body language helps players anticipate weak-spot opportunities.

|  |  |  |
| --- | --- | --- |
| **Target** | **Body Language** | **Weak-Spot Moment** |
| Dragon | Breathes, roars, turns head, flaps wings | Eye/heart visible briefly |
| Goblin | Runs, laughs, raises shield, trips | Head exposed when shield raised |
| Treasure Chest | Shakes, opens, glows | Lock appears while open |
| Boss | Armor rotates, chest opens, eyes flash | Critical heart/core exposed in phases |

# 8. Target Scoring

|  |  |
| --- | --- |
| **Action** | **Score** |
| Goblin Body | 30 |
| Goblin Head | 100 |
| Dragon Tail | 20 |
| Dragon Body | 50 |
| Dragon Neck | 80 |
| Dragon Head | 120 |
| Dragon Heart | 200 |
| Dragon Eye | 400 |
| Treasure Chest | 80 |
| Treasure Lock | 200 |
| TNT Direct Hit | 20 |
| Explosion Kill | 40 each |
| Chain Reaction Bonus | 100 |
| Boss Weak Spot | 200 |
| Boss Defeated | 1000 |

Design rule: every valid body hit scores. Weak spots create mastery and leaderboard separation, but beginners must never feel punished for hitting the main target.

# 9. Automatic Arrow System

There is no inventory and no button activation. The game automatically assigns the current arrow type and shows it clearly before the shot. The player only chooses where to place the arrow.

|  |  |
| --- | --- |
| **Arrow Type** | **Effect** |
| Normal | Single hit |
| Fire | Penetrates through aligned targets |
| Blast | Explosion damage, best for clusters and TNT |
| Split | Splits into multiple paths, useful for flying targets |
| Lightning | Chains to nearby enemies, strong against bosses |

# 9.1 Impact-to-Effect Resolution

The vision system reports a **single X/Y impact point** — no angle, velocity or direction. Every arrow effect must therefore be resolved by game logic radiating from that one point. This is the core hit-resolution rule and applies to all arrow types.

| Arrow | Resolution from impact point (X, Y) |
| --- | --- |
| Normal | Hit the single target/zone whose collider contains (X, Y). Nearest target within a small tolerance radius (recommend 3 cm) if no direct containment. |
| Fire | Penetrate a **fixed-width vertical column** (recommend 20 cm wide) centred on X; apply hit to every target the column overlaps, front-to-back. No true "aligned" line — column is deterministic and readable. |
| Blast | Apply full hit to the target at (X, Y), then splash to every target whose edge is within **blast radius** (recommend 40 cm) of the point. Splash score per Section 10. |
| Split | Spawn hits at (X, Y) plus **two fixed offset points** (recommend ±30 cm on X, same Y). Each resolved as a Normal hit. Tuned for spread flying targets. |
| Lightning | Hit target at (X, Y), then chain to the **nearest N targets** (recommend N = 2) within chain range (recommend 60 cm), each step from the previous target. Strong vs clustered/boss parts. |

Rules:

* All radii/widths above are **starting tuning values** — lock them during grey-box.
* An impact with no target inside its resolution shape counts as a **Miss** (see Section 13).
* Effect shapes never cross the split line — an arrow only affects its own player's side.
* Weak-spot vs body-zone is decided by which collider contains the exact (X, Y) point, independent of arrow type. Splash/chain hits always score as body hits, never weak-spot value (Section 10).

**Miss and side detection:** the vision system emits one event per detected impact, including impacts on empty background. Side is chosen by X (< 200 cm = left player, ≥ 200 cm = right player). An impact whose resolution shape contains no target = Miss for that player: zero score, combo reset. An impact landing on the wrong side of a shared object still resolves against the owning side only.

# 10. Blast and Chain Reaction Scoring

Area damage must feel powerful, but precision should remain the highest scoring strategy. A blast should not automatically give full weak-spot value.

|  |  |
| --- | --- |
| **Kill / Hit Type** | **Award** |
| Direct body hit | 100% of body score |
| Direct weak-spot hit | 100% of weak-spot score |
| Blast splash kill | 50-70% of body score |
| Chain reaction kill | 75-100% of body score |
| Chain reaction bonus | +100 |
| Precise TNT fuse hit | +50 precision bonus |

Example: Dragon Eye = 400, Dragon Body = 50, Blast killing Dragon = approximately 35. This ensures beginners enjoy blast moments, while experts still chase eye shots.

# 11. Curse Target PvP

Curse Target is the main player-versus-player mechanic. It appears in a player area and gives that player a meaningful choice: score normally or sacrifice the shot to penalise the opponent.

* Appears every 20-25 seconds maximum.
* Visible for around 3 seconds.
* Examples: Shadow Raven, Dark Spirit, Cursed Skull.
* If hit, applies a random opponent penalty.
* If ignored, nothing happens.

|  |  |
| --- | --- |
| **Curse** | **Opponent Penalty** |
| Wind | Opponent targets sway unpredictably for 5 seconds |
| Smoke | One high-value weak spot is hidden |
| Armor | Opponent next elite target needs one extra hit |
| Web | Opponent treasure must be hit twice before opening |
| Decoy | A fake high-value target appears worth 0 points |

Penalty timing: some penalties depend on a future object (Smoke needs a visible weak spot, Web needs a treasure spawn). If the required object does not appear within the penalty window, the penalty **queues and applies to the next matching spawn** (max hold 10 sec), then expires. This prevents a curse from silently fizzling.

Decoy vs combo: a Decoy is a valid target that scores 0. Hitting it does **not** reset combo (it is a scoring arrow with zero value), but it wastes the shot — the PvP cost. A total off-target miss still resets combo (Section 13).

Penalties should never disable shooting or block the full screen. They should change the challenge while keeping the game fun and fair.

# 12. Boss Battle

The final **25-30 seconds** create a boss rush. Each player receives their own boss. The boss remembers damage by body part. Armor can break, weak spots can open, and critical hits are worth major points.

Timing note: arrow cycle is 5-9 sec (Section 1), so the boss window yields only **3-5 shots**. Multi-step armour chains (break helmet → then hit head) do not fit that budget. Therefore the boss **starts with one weak spot already exposed** (recommend the heart/core) so the first shot can already crit. Additional weak spots (head, wings) unlock on armour break for players fast/accurate enough to chain them.

* Boss spawns with heart/core weak spot already visible.
* Helmet break exposes head weak spot (bonus, optional).
* Chest armor break increases heart/core value (deeper crit).
* Wings or shoulders can be damaged to slow movement.
* Direct weak-spot hits are worth more than blast splash damage.

# 13. Accuracy and Combo

Combo rewards consistent scoring shots, not rapid fire.

|  |  |
| --- | --- |
| **Condition** | **Result** |
| 5 consecutive scoring arrows | x2 multiplier |
| 10 consecutive scoring arrows | x3 multiplier |
| Miss | Combo reset |

Intended tiers: total arrows per game = 10-18 (Section 2), so **x2 (5-streak) is the realistic reward** most players chase and **x3 (10-streak) is an elite, near-perfect-game bonus** — leaderboard separation, not an expected state. A scoring arrow = any arrow that resolves onto a target with value > 0. Decoy (0 pts) and total miss handling per Section 11 / 9.1.

End-game accuracy bonus: 90%+ = +500, 80-89% = +300, 70-79% = +150. Accuracy = scoring arrows / total detected impacts.

# 14. Victory Screen

* Winner
* Final Score
* Accuracy %
* Weak Spot Hits
* Best Chain Reaction
* Boss Damage
* Biggest Single Shot
* Difficulty Played
* Leaderboard / Play Again

# 15. Technical Design Rules

* One Unity scene with two player areas.
* One GameManager, two PlayerState objects.
* Impact coordinate decides player side by X position.
* No arrow identity needed.
* Targets should be prefabs with body zones and weak spots.
* All movement must be smooth and readable.
* Avoid spawn positions near edges, floor, ceiling and split line.
* Build a grey-box prototype before final art.

# 16. Recommended Next Steps

1. Build a grey-box Unity prototype using circles/boxes only.
2. Implement split-screen hit mapping from X/Y impact coordinates.
3. Create three difficulty presets: Beginner, Casual and Pro.
4. Create 10 sample wave templates with fixed spawn zones.
5. Implement body hit, weak spot hit and miss scoring.
6. Add automatic arrow sequence: Normal, Fire, Blast, Split, Lightning.
7. Add one Dragon, one TNT, one Treasure and one Curse Target prototype.
8. Playtest real shot cycle timing to decide whether waves should last 6, 8 or 10 seconds.
9. Tune scoring so body hits feel rewarding but weak spots dominate leaderboard.
10. Only after pacing is proven, start final artwork, animation and sound design.

# 17. Hardware and Vision System

The whole design rests on the vision system delivering a fast, accurate impact coordinate. This section is a v1 requirement, not art.

* **Accuracy:** must resolve impact X/Y to sub-centimetre precision to support 5-6 cm Pro weak spots. Below that, cap Pro weak spots at the accuracy limit.
* **Latency:** impact-to-game event under ~150 ms so scoring feedback feels instant.
* **Coverage:** full 4.0 x 2.2 m screen, both player halves, no dead zones near edges/split line.
* **Calibration:** per-session or per-day calibration routine that maps camera space to the screen coordinate system in Section 2.
* **Event contract:** one event per detected impact = `{ x_cm, y_cm, timestamp }`. No arrow identity, no velocity. Game assigns arrow type (Section 9) and resolves effect (Section 9.1).
* **Missed/undetected shots:** define behaviour when an arrow is not detected at all (physical miss off-screen) vs detected on empty background. Only detected impacts count toward accuracy.

# 18. Operations and Business Model

It is a paid physical attraction; venue economics belong in the GDD.

* **Throughput:** 90 sec session + reset/loading. Target games-per-hour per lane and state assumed price/session.
* **Operator flow:** start game, pick difficulty, run session, victory screen, reset. Define which steps need staff vs are self-serve.
* **Reset time:** budget for arrow retrieval and screen reset between games (see Section 20) — it caps real throughput, not the 90 sec session.
* **Leaderboard:** Pro-only, persisted per venue; define retention and reset cadence.

# 19. Edge and Failure States

Define behaviour for:

* Impact exactly on the split line (X = 200 cm) — assign to a fixed side (recommend left) or ignore.
* Two impacts within the same frame — process both, order by timestamp.
* Impact during a non-shooting window (wave transition, victory screen) — ignore, no score.
* Vision dropout mid-game — pause and show a recalibration prompt; do not silently drop scoring.
* Arrow physically stuck on screen occluding a target — operator reset.

# 20. Safety, Reset and Arrow Handling

Physical venue basics the software must account for:

* Between-game reset flow: clear on-screen arrows, re-arm vision, reset both PlayerStates.
* Arrow retrieval must not be counted as impacts — vision disabled or ignored during reset.
* Safety lockout: no live game state while players are downrange retrieving arrows.

# 21. Version 2 Ideas

* Adaptive difficulty based on recent accuracy and weak-spot hit rate.
* Player profiles and skill progression.
* Tournament mode.
* Seasonal skins and events.
* More bosses and curse types.
* AI-assisted wave generation based on player performance.