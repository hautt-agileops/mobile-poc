# 3d-prompt (worker-less Claude Code skill)

Turn a 3D-modelling job/brief into a refined prompt + 3D model, by calling
**Vertex AI (Gemini)** + **Meshy** directly. **No server, no worker, no
hosting.** Runs locally. You bring your own GCP project + keys.

## Install

```bash
unzip 3d-prompt.zip
cp -R 3d-prompt ~/.claude/skills/
```

Restart Claude Code. The skill triggers when you paste a 3D-model job/brief, or
invoke `/3d-prompt`.

## Prerequisites

- **Node.js 18+** (`node --version`). No `npm install` — `pipeline.mjs` uses
  only built-in `fetch` / `Buffer` / `crypto`.
- **Your own Vertex AI access:**
  1. A GCP project with the **Vertex AI API** enabled.
  2. A **service account** with `roles/aiplatform.user`, and its **JSON key**.
  3. A **Meshy** API key (paid) — https://www.meshy.ai
     - Either export `MESHY_API_KEY`, **or** store it in 1Password and let the
       skill pull it at runtime via the `op` CLI (key never hits disk). Default
       item ref `op://Shared AI/messiAPI/credential`; override with `MESHY_OP_REF`.
       Requires `op` installed + signed in (`op signin`).

**Project is auto-derived** from the service account's `project_id` — no export
needed in the common case. Only set these to override:

```bash
export GOOGLE_CLOUD_PROJECT=your-gcp-project-id   # optional; defaults to SA project_id
export GOOGLE_CLOUD_LOCATION=us-central1          # optional; gemini-3.x uses global
```

**Vertex service account** is resolved automatically, in this order — the
easiest is just dropping a `sa.json` file in the skill folder:

1. `sa.json` next to the skill (or in the cwd) — **simplest, no export**
2. `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json` (file path)
3. `GOOGLE_SA_OP_REF="op://Vault/Item/credential"` (pulled from 1Password)
4. `GOOGLE_SERVICE_ACCOUNT_JSON='{...}'` (inline; MUST be single-quoted)
5. `GOOGLE_VERTEX_ACCESS_TOKEN=$(gcloud auth print-access-token)` (~1h, dev only)

**Meshy key** is resolved as:
1. `MESHY_API_KEY=msy_...`, else
2. pulled from 1Password at runtime (`MESHY_OP_REF`, default
   `op://Shared AI/messiAPI/credential`; needs `op` signed in).

> ⚠️ Don't load the SA JSON via `set -a; source .dev.vars` — bash strips the
> double quotes and the JSON breaks. Use a `sa.json` file or
> `GOOGLE_APPLICATION_CREDENTIALS` instead.

## Run

```bash
cd ~/.claude/skills/3d-prompt
node pipeline.mjs "a cute robot"                       # quick test
node pipeline.mjs -n -f stl,glb -m "H~170mm" "<refined prompt>"
node pipeline.mjs -h                                   # all options
```

Output (4 PNG views + `model.glb` + requested formats + `prompt.txt`) lands in
`output/<task-id>/`.

## Publish a public 3D viewer (optional)

The bundled `viewer/` is a standalone static site that shows generated models in
a public, shareable 3D gallery (`<model-viewer>`). Each model gets its own deep
link `https://<site>/?id=<task-id>`; the index lists every published model.

One-time setup (inside `viewer/`):

```bash
cd viewer && npx vercel login && npx vercel link   # no global install needed (npx)
```

Publish:

```bash
node pipeline.mjs -f stl,glb "<prompt>"     # generates + auto-publishes (default)
node pipeline.mjs -P -f stl,glb "<prompt>"  # -P to skip the auto-deploy
node publish.mjs <task-id>                  # publish an existing output id
node publish.mjs <task-id> -n               # bundle + manifest only, no deploy
cd viewer && python3 -m http.server 8000    # local preview
```

`publish.mjs` (zero deps) copies the assets into `viewer/models/<task-id>/`,
rebuilds `manifest.json`, and deploys to Vercel. The site is fully public —
anyone with a link can view and download the model.

## What it does

1. Refine prompt via Vertex AI Gemini (skip with `-n`)
2. Generate 4 consistent reference views via Vertex AI (multi-turn for consistency)
3. Submit views to Meshy `multi-image-to-3d`, poll, download GLB/STL/etc.

Auth: mints a `cloud-platform` OAuth token from your service-account JSON
(RS256 JWT via Node's built-in `crypto`, no dependencies), exactly like the
worker does.

## Files

- `SKILL.md` — the skill definition Claude loads
- `pipeline.mjs` — the standalone generator (Vertex AI + Meshy, zero deps)
- `publish.mjs` — bundle a result into `viewer/` and deploy to Vercel (zero deps)
- `viewer/` — standalone static 3D gallery (`index.html` + `vercel.json`)
- `README.md` — this file

## Limits

- Provider: Meshy only (Tripo not bundled).
- Vertex AI only (no Gemini Developer API-key path). Override model ids with
  `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL` if needed.
- Each user supplies their own GCP project + SA + Meshy key — no secret of yours
  ships in this bundle.
