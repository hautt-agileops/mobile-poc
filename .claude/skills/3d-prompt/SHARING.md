# Publishing to the shared Vercel project

This skill can deploy generated 3D models to a **shared, public** Vercel viewer
owned by someone else. The bundled `viewer/.vercel/project.json` already points
at the owner's project (`3d-viewer`) — it holds only non-secret identifiers
(`projectId` / `orgId`). You just need a **Vercel token** to authenticate.

## The portal is organized by category

The viewer is a single **Studio portal** (public at `3d-viewer-navy.vercel.app`) with
one tab — and one directory — per category:

| category | dir | published by | rendered as |
|----------|-----|--------------|-------------|
| **gallery** | `viewer/models/` | this `3d-prompt` skill | `<model-viewer>` + downloads |
| **games** | `viewer/games/` | the `unity-poc` skill | thumbnail card → embedded WebGL iframe |

Each category is just `<category>/manifest.json` + per-item assets. `publish.mjs` writes the
**gallery** category (its dir is `models/`, override with `PORTAL_GALLERY_DIR`) and never
touches `games/`; the `unity-poc` deploy writes the **games** category and never touches
`models/`. So both skills publish into the same site without stepping on each other.

## One-time

1. Install the skill and meet the generation prerequisites in `README.md`
   (Node 18+, your Gemini/Meshy creds).
2. Get a **Vercel token** from the project owner (sent over a private channel).

No Vercel CLI install needed — `publish.mjs` runs it via `npx` automatically
(uses an installed `vercel` if you happen to have one).

## Each time you publish

```bash
export VERCEL_TOKEN=<token-from-owner>
node pipeline.mjs -V -f stl,glb "<prompt>"   # generate + publish
# or publish an existing output id:
node publish.mjs <task-id>
```

The scripts pass the token to `vercel` and use `viewer/.vercel/project.json` to
target the owner's project, so **no `vercel login` is needed**.

> If you are a member of the owner's 1Password **"Shared AI"** vault, the token
> is pulled automatically from `op://Shared AI/vercel-token/credential` and you
> can skip `export VERCEL_TOKEN`. Override the ref with `VERCEL_OP_REF`.

## Security

- A Vercel token is **account-wide**, not project-scoped: it grants deploy/read/
  delete on *all* of the owner's projects until revoked.
- Never commit it, never paste it in chat/logs, treat it like a password.
- The owner can revoke it anytime (Vercel → Account Settings → Tokens).

## What you get

Every published model joins the **gallery** tab at the owner's site and gets a
deep link `https://<site>/?id=<task-id>` that anyone can open — no login to view.
(WebGL games published by `unity-poc` appear under the **games** tab of the same site,
deep-linked as `?game=<id>`.)
