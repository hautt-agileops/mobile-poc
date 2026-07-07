# UI/UX review checklist — run at step 6 on the gameplay screenshots

Screenshot-driven (canvas games have no DOM — heuristics apply to the rendered frames from
`gameplay-shots.mjs`, incl. the mobile shot). Complements `quality-rubric.md`: the rubric
grades the GAME; this checks the INTERFACE. Answer each with evidence from a frame; any FAIL
loops back to `unity-poc-gameplay` before deploy.

## A. Readability (worth failing a ship over)

1. **Surface contrast** — every card/button/panel visibly separates from the backdrop. Text
   never floats raw on scenery. (App Empire lesson: ghosty generated plates → text-on-office.)
2. **State visibility** — enabled vs disabled is unmistakable, and disabled is NEVER
   alpha→invisible; drain hue, keep the surface solid (`UiKit.SetEnabled` pattern).
3. **Text size floor** — smallest UI text ≥ ~16px at 720-wide reference; verify on the
   MOBILE shot, not the desktop one.
4. **Number formatting** — money/score reads naturally ($15.00, $1.24M — no $15.0, no
   12345678), never overflows its container.

## B. Hierarchy & layout

5. **One primary action per screen** — the biggest/brightest thing is what the player should
   press next (WRITE CODE, not a random card).
6. **Alignment grid** — card internals share baselines; buttons same size per class; equal
   gutters. Misaligned rows read amateur instantly.
7. **Information scent** — every button carries its consequence (cost on BUY/HIRE, +N IP on
   prestige); no mystery-meat icons without labels on first use.
8. **Safe areas** — nothing clipped at the top/bottom edges on the mobile shot; column
   centered in landscape with intentional gutters.

## C. Feedback

9. **Every input responds** in <100ms visually (punch/press tint) and audibly.
10. **Passive progress is visible** — bars move, counters tween; a screenshot 5s apart must
    differ (the game must LOOK alive in stills).
11. **Unlock moments announced** — a newly-available action (prestige ready, boost ready)
    pulses/ignites; the player never discovers it by accident.

## D. Style coherence

12. **Palette lock** — every UI color is from the art-bible palette; no default-Unity grey,
    no untinted white plates.
13. **One surface language** — either generated plate art everywhere or procedural flat
    everywhere; a mix reads broken. (If generated plates ship ghosty/thin, prefer the
    procedural flat path — verified stronger in App Empire.)
14. **Font consistency** — one display font family across all screens; default engine font
    is a FAIL.

## E. Visual regression (between builds)

After each ship, keep the gameplay-shot set as the baseline:
`cp _gameplay.*.png _baseline/` (project root). On the next build, compare new shots to the
baseline before deploy — flag any UNINTENDED change (layout shift, missing element, color
drift). Cheap diff: open both frames side by side in the vision review; pixel-diff optional
(`python3 -c "from PIL import Image, ImageChops; ..."`) when the eye is unsure. Intended
changes replace the baseline; unintended ones loop back.

## How to run (orchestrator, step 6)

1. Read all `_gameplay*.png` frames (buildship returns paths — desktop + mobile).
2. Walk A→D against the frames; cite frame + region per finding.
3. Compare vs `_baseline/` if it exists (E).
4. FAIL on any A-item or ≥3 total findings → fix in gameplay phase, rebuild, reshoot.
5. Findings feed the rubric's Coherence/Clarity rows; verdicts land in HANDOFF.md.

## Ecosystem skills (installed at project `.claude/skills/`, load for deeper passes)

- **`ui-ux-reviewer`** — systematic UX critique workflow; run it against the frames for a
  second-opinion pass when the ship is high-stakes (client pitch, portfolio).
- **`ui-ux-design-review`** — heuristics + accessibility (WCAG-flavored) vocabulary; useful
  for contrast/readability judgments beyond checklist A.
- **`visual-regression-testing`** — methodology for the E-section baseline diffing.

Caveat: all three are DOM-web oriented — a Unity canvas has no DOM, so they inform HOW to
judge the screenshots; the screenshot capture (`gameplay-shots.mjs`) stays the mechanism.
