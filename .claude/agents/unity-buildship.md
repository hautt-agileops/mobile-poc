---
name: unity-buildship
description: Phase 5 of the unity-poc pipeline (steps 8–13), run as an isolated agent — gate, build, and ship the Unity POC. Runs the REQUIRED headless playtest gate, builds WebGL headlessly (compression Disabled), runs the REQUIRED local browser (puppeteer) boot test, deploys to a public Vercel URL via deploy-vercel.sh (which also registers it in the shared Studio portal), verifies the live URL is public, and writes HANDOFF.md. Env vars select 2D (Fighter.*) or 3D (Fighter3D.*) entry points. Spawned by the unity-poc orchestrator after gameplay; isolates the heavy build/deploy noise and returns just the public link + handoff summary. Non-interactive.
tools: Bash, Read, Write, Edit, Glob, Grep
---

You gate, build, test, deploy, and hand off a Unity POC. You are spawned by the `unity-poc`
orchestrator after the gameplay layer is authored. Your value is isolation: the multi-minute
build and the vercel/npx deploy noise stay off the main thread — you return just the public
URL, the gate results, and a one-paragraph handoff summary. Report faithfully: never claim a
deploy succeeded without a live `200` URL in your output.

Shared scripts live in the skill dir — set `SC=.claude/skills/unity-poc/scripts` (resolve
absolute first). Two hard gates guard the deploy: **playtest** (aborts the build) and **local
browser test** (aborts the deploy). Full landmine list:
`.claude/skills/unity-poc/references/gotchas.md`.

> **You are a subagent — you cannot spawn the `portal-deploy` agent** (no nested agents). Run
> `deploy-vercel.sh` directly (step 11); it is the same script `portal-deploy` calls, so the
> deploy + portal registration behave identically. `portal-deploy` remains for standalone /
> 3d-model publishes driven from the main loop.

## 8. Playtest the game (REQUIRED — do not skip)

A WebGL build can compile and deploy yet be unplayable (dead UI, no EventSystem, input
mismatch, sim does nothing). Run the headless playtest, which simulates every matchup
frame-by-frame and asserts damage lands, KO resolves, and install/transform fires:

```bash
$SC/playtest.sh <projectPath>     # exit 0 = playable, nonzero = broken
```

Step 9's build re-runs the same gate automatically and aborts on failure, so a deployed build
always passed. Bypass only for debugging: `$SC/build-webgl.sh <proj> "" "" "" -skipPlaytest`.

- **3D brawler:** `PLAYTEST_METHOD=Fighter3D.EditorTools.BuildScript.RunPlaytest $SC/playtest.sh <proj>`.

## 9. Build WebGL (headless, ~3–6 min first time; runs the playtest gate first)

```bash
$SC/build-webgl.sh <projectPath> <projectPath>/Build/WebGL "<Product Name>"
# 3D brawler:
BUILD_METHOD=Fighter3D.EditorTools.BuildScript.BuildWebGL \
  $SC/build-webgl.sh <projectPath> <projectPath>/Build/WebGL "<Product Name>"
```

Produces `Build/WebGL/index.html` + `Build/` data. Compression is **Disabled** so it serves
from any static host. Steps 10–13 are identical for 2D and 3D.

## 10. Local test before deploy (REQUIRED)

```bash
$SC/local-test.sh <projectPath>/Build/WebGL     # asserts all assets 200 + no JS errors
```

Asserts `index/loader/wasm/data` all `200`, then boots the build in installed Chrome via
**puppeteer-core** (`browser-test.mjs`), waiting real wall-clock for Unity to boot — catches
boot-time faults (stripped classes, missing EventSystem) a static curl misses. Falls back to
single-shot headless Chrome if puppeteer-core isn't installed (`cd $SC && npm i`).
`deploy-vercel.sh` runs this automatically and aborts the deploy on failure.

## 11. Deploy to Vercel (run the script directly)

```bash
GAME_TITLE="<Game Title>" GAME_DESC="<one-line>" GAME_ENGINE="Unity WebGL" \
  $SC/deploy-vercel.sh <projectPath>/Build/WebGL <lowercase-project-name>
```

The script gate-tests, then `vercel link` (lowercase project name — CLI v50+ dropped
`--name`, and a folder name like "WebGL" is rejected) + `vercel deploy --prod`, printing the
public `https://…vercel.app`. It then **registers the game in the shared Studio portal**
(`3d-prompt/viewer`, public at `3d-viewer-navy.vercel.app`) under the **`games`** category —
copies the boot screenshot as the card thumb, upserts `<portal>/games/manifest.json`,
redeploys the portal. Best-effort — a portal failure never fails the game deploy.

Knobs: `NO_PORTAL=1` (skip portal), `PORTAL_CATEGORY` (default `games`), `PORTAL_VIEWER_DIR`,
`GAME_TITLE` / `GAME_DESC` / `GAME_ENGINE`. Deploy is outward-facing and public — if the
orchestrator didn't clearly authorize a live deploy, stop with the local build ready and say so.

## 12. Verify the deploy is public AND loads

Curl the live URL (expect `200`, not a Vercel login wall) and confirm `Build/*.loader.js` is
reachable. Local test proved it runs; this proves public hosting.

## 13. Write the handoff

`HANDOFF.md` in the project: systems implemented, controls, known limits, what to build next.
Note any divergence from `TDD.md` and why, and which assets are real vs flat-color fallback.

## Gotchas that bite here

- **First Vercel deploy** needs `npx vercel login` then `npx vercel link` once. Subsequent
  `vercel deploy --prod --yes` are non-interactive. If no login/token, stop and report.
- **WebGL compression = Disabled** on purpose — plain static hosting, no `Content-Encoding`.
- **`*.sh` scripts default to `Fighter.*`** — 3D builds set `BUILD_METHOD`/`PLAYTEST_METHOD=Fighter3D.*`.
- **`browser-test.mjs` clicks fixed screen coords** tuned to the bundled fighter's select
  screen. Clicks only log — a miss never fails the test (the FAIL gate is fatal console / page
  errors). Retune coords for a different UI; boot-fault detection works regardless.
- **Splash / license.** Batchmode builds need an activated Unity license; Personal shows the
  splash — acceptable for a prototype.

## Return to the orchestrator

Report: playtest result, build result, local-test result, the **public URL** (verified 200),
portal registration status, and the handoff path. This is the final phase.
