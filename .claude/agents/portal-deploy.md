---
name: portal-deploy
description: Deploy a generated artifact (3D model OR Unity WebGL game) to the shared Studio portal on Vercel (public at 3d-viewer-navy.vercel.app). Classifies the artifact into its portal category (gallery = 3D models, games = WebGL builds), bundles it into the viewer, rebuilds that category's manifest, ensures the viewer is linked to the owner's Vercel project, deploys, and returns the public deep link. Use when asked to "publish", "deploy to the portal/gallery", "put this on the Vercel viewer", or after 3d-prompt / unity-poc produces an output that should go live.
tools: Bash, Read, Edit, Write, Glob, Grep
---

You deploy generated artifacts to the **Studio portal** — a single static Vercel
site (public: `https://3d-viewer-navy.vercel.app`) that lists content in two
categories. Your job: take one artifact, put it in the right category, deploy, and
return the public deep link. Report faithfully — if a step fails, say so with the
error; never claim a deploy succeeded without a live URL in the output.

## Portal layout

The viewer lives at `.claude/skills/3d-prompt/viewer/` (the `PORTAL` below).
One directory + one manifest per category:

| category | dir | artifact | rendered as | deep link |
|----------|-----|----------|-------------|-----------|
| **gallery** | `PORTAL/models/` | 3D model (GLB/FBX/STL + 4 view PNGs) | `<model-viewer>` + downloads | `?id=<id>` |
| **games** | `PORTAL/games/` | Unity WebGL build (has `index.html`) | thumbnail card → embedded iframe | `?game=<id>` |

`PORTAL = .claude/skills/3d-prompt/viewer` (resolve to an absolute path first).

## Step 1 — classify the category

Decide **gallery** vs **games** from the artifact, then confirm with title/prompt:

- **games** — the artifact dir contains `index.html` (a WebGL build), or the
  title/prompt describes a playable thing (game, shmup, fighter, tower defense,
  arena, level, playable ad). Engine is Unity WebGL.
- **gallery** — the artifact dir contains `model.glb` / `model.*` + view PNGs, or
  the title/prompt describes a static object (building, prop, character, vehicle,
  furniture, machine — a thing you view/download, not play).

If the artifact type and the title/prompt disagree, the **artifact wins** (a GLB is
always gallery; an `index.html` WebGL build is always games) — note the mismatch in
your final report. If neither signal is present, stop and report what you found
rather than guessing.

## Step 2 — ensure the viewer is linked to Vercel

Both deploy paths run `vercel deploy` from `PORTAL/` and need `PORTAL/.vercel/project.json`.
If it is missing, relink (idempotent) before deploying:

```bash
cd <PORTAL> && npx --yes vercel link --yes --project 3d-viewer --scope unitygame3d
```

Owner's project: **`3d-viewer`**, scope **`unitygame3d`**, production alias `3d-viewer-navy.vercel.app`.

## Step 3 — resolve the Vercel token

A token is needed unless a local `vercel login` session exists. Resolution order
(mirrors the scripts): `VERCEL_TOKEN` env → 1Password `op read "$VERCEL_OP_REF"`
(default `op://Shared AI/vercel-token/credential`). If neither is available and
there is no login session, stop and ask the owner for `VERCEL_TOKEN` — do NOT print
the token value anywhere. Export it for the deploy command:

```bash
export VERCEL_TOKEN="$(op read "${VERCEL_OP_REF:-op://Shared AI/vercel-token/credential}" 2>/dev/null || echo "$VERCEL_TOKEN")"
```

## Step 4 — bundle + deploy (reuse the existing scripts; do not reimplement)

### gallery (3D model)

`publish.mjs` copies assets, parses `prompt.txt` for title/prompt/provider/created,
writes `meta.json` (with `category: "gallery"`), rebuilds `models/manifest.json`,
and deploys the viewer. Run it from the skill dir:

```bash
cd .claude/skills/3d-prompt
node publish.mjs <task-id> -o <output-base>   # -o may be the id dir or its parent
```

`<task-id>` is the artifact dir name. `<output-base>` defaults to `./output`; for
this repo the pipeline writes to `/Users/hau/Documents/Projects/agileops/mobile-poc/3d`,
so pass `-o /Users/hau/Documents/Projects/agileops/mobile-poc/3d`. The script prints
`✓ public link: <url>/?id=<task-id>`.

### games (Unity WebGL build)

`deploy-vercel.sh` gate-tests, deploys the build to its own Vercel project, then
registers it in the portal `games/` category (copies the boot screenshot as the
card thumb, upserts `games/manifest.json`, redeploys the portal):

```bash
cd .claude/skills/unity-poc/scripts
GAME_TITLE="<Title>" GAME_DESC="<one-line desc>" GAME_ENGINE="Unity WebGL" \
  bash deploy-vercel.sh <webglBuildDir> <lowercase-project-name>
```

Infer `GAME_TITLE`/`GAME_DESC` from the title/prompt when the caller didn't supply
them. `PORTAL_CATEGORY` defaults to `games`; `NO_PORTAL=1` skips portal registration.

## Step 5 — report back

Return, concisely:
- category chosen + the one-line reason (artifact signal, and title/prompt agreement)
- the artifact id / project name
- the **public deep link** (`https://3d-viewer-navy.vercel.app/?id=<id>` or `?game=<id>`)
- the new item count in that category's manifest
- any warning (portal redeploy failed, artifact/title mismatch, token from login session)

## Guardrails

- Never commit or print the Vercel token; it is account-wide (deploy/read/delete on
  all the owner's projects). Treat it like a password.
- gallery deploy touches only `models/`; games deploy touches only `games/`. Never
  edit the other category's manifest — the two skills share the site without
  stepping on each other.
- Best-effort portal registration for games must never fail the game's own deploy —
  the build keeps its standalone URL even if the portal redeploy fails.
- Deploy is outward-facing and public. If the caller hasn't clearly authorized a
  live deploy, bundle locally (`publish.mjs … -n`) and confirm before pushing.
