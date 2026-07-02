---
name: unity-poc-buildship
description: Phase 5 of the unity-poc pipeline — gate, build, and ship the Unity POC. Runs the REQUIRED headless playtest gate, builds WebGL headlessly (compression Disabled), runs the REQUIRED local browser (puppeteer) boot test, deploys to a public Vercel URL, registers it in the shared Studio portal, verifies the live URL is public and loads, and writes HANDOFF.md. Uses the shared scripts (playtest.sh / build-webgl.sh / local-test.sh / deploy-vercel.sh); env vars select the 2D (Fighter.*) or 3D (Fighter3D.*) entry points. Invoked by the unity-poc skill; load it directly when a Unity POC with gameplay needs to be built, tested, and deployed.
---

# unity-poc-buildship — playtest → build → deploy → handoff

Phase 5 of **unity-poc** (steps 8–13). Runs after gameplay (`unity-poc-gameplay`). Shared
scripts live in the sibling `unity-poc/scripts/` dir — run them from there (`SC=../unity-poc/scripts`).
Two hard gates guard the deploy: **playtest** (aborts the build) and **local browser test**
(aborts the deploy). Full landmine list: `../unity-poc/references/gotchas.md`.

## 8. Playtest the game (REQUIRED — do not skip)

A WebGL build can compile and deploy yet be unplayable (dead UI, no EventSystem, input
handler mismatch, sim does nothing). Run the headless playtest, which simulates every
matchup frame-by-frame and asserts damage lands, KO resolves, and the install/transform
mechanic fires:

```bash
$SC/playtest.sh <projectPath>     # exit 0 = playable, nonzero = broken
```

Run it standalone for **fast iteration** — seconds vs the multi-minute build. Step 9's build
**re-runs the same gate automatically and aborts on failure**, so a deployed build always
passed the playtest; you don't have to run step 8 first. Bypass the gate only for debugging:
`$SC/build-webgl.sh <proj> "" "" "" -skipPlaytest` (extra args forward to Unity). Extend
`Playtest.cs` checks when you add mechanics.

- **3D brawler:** same script, point it at the 3D method via env —
  `PLAYTEST_METHOD=Fighter3D.EditorTools.BuildScript.RunPlaytest $SC/playtest.sh <proj>`.
  `Playtest3D` asserts the same outcomes (damage/KO/install/projectile) in 3D.

## 9. Build WebGL (headless, ~3-6 min first time; runs the playtest gate first)

```bash
$SC/build-webgl.sh <projectPath> <projectPath>/Build/WebGL "<Product Name>"
# 3D brawler: select the 3D build entry point via env —
BUILD_METHOD=Fighter3D.EditorTools.BuildScript.BuildWebGL \
  $SC/build-webgl.sh <projectPath> <projectPath>/Build/WebGL "<Product Name>"
```

Produces `Build/WebGL/index.html` + `Build/` data. Compression is **Disabled** so it serves
from any static host with no special headers. Steps 10–13 are **identical for 2D and 3D** —
`local-test.sh`/`deploy-vercel.sh` are namespace-agnostic.

## 10. Local test before deploy (REQUIRED)

Serve the build locally and load it in a real browser — catches missing assets, broken
loader paths, and JS exceptions that a headless sim can't:

```bash
$SC/local-test.sh <projectPath>/Build/WebGL     # asserts all assets 200 + no JS errors
```

Asserts `index/loader/wasm/data` all return `200`, then loads the build in the installed
Chrome via **puppeteer-core** (`browser-test.mjs`) and waits real wall-clock time for Unity
to actually boot — capturing the page console and screenshotting the running game. This is
what catches *boot-time* faults (stripped classes, missing EventSystem) that a static curl
or a frozen single-shot screenshot miss. Falls back to single-shot headless Chrome if
puppeteer-core isn't installed (`cd ../unity-poc/scripts && npm i`). `deploy-vercel.sh` runs
this automatically and aborts the deploy on failure.

## 11. Deploy to Vercel (delegate to the portal-deploy agent)

Once the local browser test passes, **delegate the deploy to the `portal-deploy`
agent** (Task tool) so the deploy noise (vercel/npx logs) stays out of the main
thread and you get back just the public link. Pass the WebGL build dir, the
lowercase project name, and the game title/description:

> Use the portal-deploy agent to publish the Unity WebGL game at
> `<projectPath>/Build/WebGL` as project `<lowercase-project-name>`
> (title: "<Game Title>", desc: "<one-line>").

The agent classifies it as the `games` category and runs `deploy-vercel.sh`
internally, which:
- runs the local test, then `vercel link` (lowercase project name — CLI v50+ dropped
  `--name`, and a folder name like "WebGL" is rejected) + `vercel deploy --prod`,
  printing the public `https://…vercel.app`;
- **registers it in the shared Studio portal** (`3d-prompt/viewer`, public at
  `3d-viewer-navy.vercel.app`) under the **`games`** category — copies the boot
  screenshot as the card thumb, upserts `<portal>/games/manifest.json`, redeploys
  the portal. Best-effort — a portal failure never fails the game deploy.

Knobs the agent forwards: `NO_PORTAL=1` (skip), `PORTAL_CATEGORY` (default `games`),
`PORTAL_VIEWER_DIR`, `GAME_TITLE` / `GAME_DESC` / `GAME_ENGINE`. Direct fallback if
the agent is unavailable: `$SC/deploy-vercel.sh <projectPath>/Build/WebGL <name>`.

## 12. Verify the deploy is public AND loads

Curl the live URL (expect `200`, not a Vercel login wall) and confirm `Build/*.loader.js` is
reachable. Local test proved it runs; this proves public hosting.

## 13. Write the handoff

`HANDOFF.md` in the project: systems implemented, controls, known limits, what to build
next. The brief usually asks for this explicitly. Note any divergence from the `TDD.md`
design and why, and which assets are real (generated) vs flat-color fallback.

## Gotchas that bite here

- **First Vercel deploy** needs `npx vercel login` then `npx vercel link` once. Subsequent
  `vercel deploy --prod --yes` are non-interactive.
- **WebGL compression = Disabled** on purpose — plain static hosting, no `Content-Encoding`.
- **`*.sh` scripts default to `Fighter.*`** — 3D builds set `BUILD_METHOD`/`PLAYTEST_METHOD=Fighter3D.*`.
- **`browser-test.mjs` clicks fixed screen coords** tuned to the bundled fighter's select
  screen. Clicks only **log** — a miss never fails the test (the FAIL gate is fatal console /
  page errors). Retune coords for a different UI layout; boot-fault detection works regardless.
- **Splash screen / license.** Batchmode builds need an activated Unity license. Personal
  license shows the Unity splash — acceptable for a prototype.
