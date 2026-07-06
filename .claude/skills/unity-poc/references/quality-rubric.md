# Game quality rubric — grade every POC before calling it done

Orchestrator scores this at the visual-review step (after buildship returns gameplay
screenshots) and writes the table into `HANDOFF.md`. 8 dimensions, 0–3 each:
**0 = broken/missing · 1 = weak · 2 = good · 3 = excellent.**

Bands: **≤11 not shippable · 12–17 good POC (shippable slice) · 18+ excellent (portfolio-grade).**
Anti-pattern floor: any single 0 in dimensions 1–4 caps the verdict at "not shippable"
regardless of total.

| # | Dimension | 2 = Good | 3 = Excellent |
|---|-----------|----------|---------------|
| 1 | **Core loop** (30-sec test) | action→feedback→reward, no dead time | fun the 100th time; "one more run" pull |
| 2 | **Game feel / juice** | every input gets instant visible+audible response | actions feel physical — hitstop, shake, tweens, layered SFX; a crit *feels* different from a body hit |
| 3 | **Flow / difficulty** | selectable difficulty, no wall, no boredom | challenge tracks skill inside a session; near-misses frequent; deaths feel fair (player blames self) |
| 4 | **Clarity / readability** | player always knows what to do and what hit them | zero tutorial needed — affordances teach (glows, tells, silhouettes); first-try comprehension |
| 5 | **Depth vs complexity** | few rules, some strategy | easy to learn, hard to master; small rule set, big decision space; skill ceiling visible in score spread |
| 6 | **Presentation coherence** | consistent style, no placeholder feel | one authored visual voice — palette, UI, FX, audio one world; a screenshot alone sells the fantasy |
| 7 | **Motivation coverage** | serves one player type well (e.g. achiever score-chase) | hooks 2–3 Bartle types — mastery + discovery + competition |
| 8 | **Stakes / fail state** | player can lose; losing has a cause they saw | tension curve — pressure builds, comeback possible, loss teaches |

## How to grade (evidence, not vibes)

- Grade from the **gameplay screenshots + a real play session** (deployed URL), never from
  code review alone.
- Each score needs one line of evidence ("crit = hitstop+slow-mo+gold burst → feel 2").
- Dimension 5 is the usual POC gap: if the player never makes a *decision* (only executes),
  depth ≤ 1. Name the missing decision in the notes.
- Dimension 8 was the arrow-clash lesson: no fail state = passive gallery = boring, no
  matter the polish.

## Measurable proxies (when a human plays)

| Signal | Good | Excellent |
|--------|------|-----------|
| Replays without being asked | ~50% | 80%+ |
| Session completion | 70% | 95% |
| "one more" said aloud | sometimes | reliably |

## HANDOFF.md block (copy this shape)

```markdown
## Quality score (rubric: unity-poc/references/quality-rubric.md)
| Dim | Score | Evidence |
|-----|-------|----------|
| Core loop | 2 | ... |
| ...
**Total: 15/24 — good POC.** Biggest gap: depth (no per-shot decision). Next lever: X.
```

Always name the **single biggest gap** and the **next lever** — the rubric exists to drive
the next iteration, not to congratulate the ship.
