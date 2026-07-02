---
name: 3d-prompt
description: Turn a freelance 3D-modelling job description (Upwork/Fiverr brief, manufacturing spec, product-design gig) into a clean visual prompt plus the right output formats, then generate the 3D model by calling Gemini + Meshy directly via the bundled pipeline.mjs (no server/worker needed), optionally seeded by a reference/sample product photo, and optionally publish it to a public shareable web viewer. Use when the user pastes or points to a job/brief asking for a 3D model, STL for manufacture, blow moulding, printable mesh, product design, wants to base the model on a sample/reference product image, or wants a shareable link to view the generated 3D model.
license: MIT
---

# 3d-prompt (worker-less)

Convert a real job description into pipeline inputs and generate a 3D model by
calling Gemini + Meshy REST APIs directly through `pipeline.mjs` (bundled in this
skill dir). Runs locally — no server, no worker, no hosting.

A bare object string (`"a cute robot"`) loses what a manufacturing brief carries:
the **output format** the deliverable needs (e.g. STL for moulding) and the hard
**constraints** a reviewer must verify (dimensions, capacity, neck, process).
This skill extracts that, writes a refined *visual* prompt, and runs the generator.

## Prerequisite

`pipeline.mjs` auto-resolves credentials — do NOT make the user export env vars,
and do NOT treat missing project/keys as a blocker. Typical setup: a `sa.json`
present (project derives from its `project_id`) + `op` signed in (Meshy key).
Preflight is only **Node.js 18+** on PATH (zero npm deps).

Full credential resolution order is in README.md. Only ask the user for
credentials if BOTH the service account *and* the 1Password pull are unavailable.

## When to use

User pastes or references a job/brief like:

> Create 3D Leopard Bottle Model for Blow Moulding (STL Required). Approximate
> height 170mm. Target sand fill 120g–150g. Standard bottle neck opening.

…or any "make me a 3D model of X for manufacture/printing/product design" task.

## Steps

### 1. Ingest the job

Accept the brief from a file path, a pasted block, or stdin. If pasted, save it
verbatim to a temp file (e.g. `/tmp/job-<slug>.txt`) so `-J` can archive it next
to the output.

### 2. Analyze → produce the fields

- **`prompt`** — the refined **visual** prompt:
  - Focus on the OBJECT. Extract the subject even when buried in
    budget/application/"please quote" boilerplate.
  - 1–3 sentences. Explicit **materials, colors, proportions, surface finish**.
  - Clean, solid colors, no busy patterns.
  - Do **NOT** mention background or camera/view angles — the generator handles
    those.
  - Bake physical form implied by constraints into the *shape* description, but
    keep numeric specs out of the visual prompt — they go in `notes`.

  `pipeline.mjs` runs its own refine pass by default. Since this skill already
  produced a final prompt, pass `-n` to skip the second refine (avoids drift).

- **`formats`** — comma list from `glb,fbx,obj,stl,usdz` (`glb` always added):
  - Add `stl` for manufacture / moulding / 3D printing / literal "STL".
  - Add `obj` / `fbx` / `usdz` only when explicitly requested.

- **`notes`** — one short line digesting the hard requirements, e.g.
  `H~170mm, 120-150g fill, blow-mould, standard neck`. Recorded for the
  reviewer; NOT sent to image generation.

- **`refImage`** *(optional)* — a sample/reference product photo, passed with
  `-i <image>`. Accepts a **local path OR an http(s) URL**. Use when the user
  provides, pastes, or points to an image of a similar existing product. It
  seeds the first generated view as a **design cue**: the generator keeps the
  product type, structure, and proportions but applies the `prompt`
  modifications to create a new, distinct form (logos/text are ignored).
  png/jpg/webp.
  - **Always scan the brief for a sample/reference link.** If it says anything
    like "sample of similar product", "reference", "like this", "see this
    listing/image", with a URL — extract that URL and pass it as `-i`. A direct
    image URL works as-is; for a product/listing page, pull the main product
    image URL first (e.g. via WebFetch) and pass that.
  - If pasted, the harness caches it — pass that cached path.
  - Omit when there's no reference.

### 3. Confirm (skip when explicitly invoked)

- If the user **explicitly invoked** the skill with the object/brief in the same
  message (e.g. `/3d-prompt "a fox"`, or "run the 3d skill on X"), treat that as
  go-ahead: print the derived fields in one line and **run immediately**.
- Otherwise (auto-triggered on a pasted brief, or ambiguous request), show the
  fields and ask for go-ahead first. The run spends Gemini + Meshy credits, so
  don't run unattended.

### 4. Run

No exports needed when a `sa.json` is present and `op` is signed in:

```bash
node pipeline.mjs -n -f <formats> -J <job-file> -m "<notes>" "<refined prompt>"

# with a reference/sample product photo:
node pipeline.mjs -n -i <image> -f <formats> -J <job-file> -m "<notes>" "<refined prompt>"
```

- `-n` skips pipeline.mjs's own refine (this skill already refined).
- `-i <image>` seeds view 1 with a reference product photo — local path or
  http(s) URL (see `refImage` above; follow any sample link in the brief).
- `-f` output formats. `-J` archives the brief. `-m` records the spec digest.
- `-o <dir>` changes the output base (default `./output`).
- Generate with **`-P`** (skip the inline auto-deploy). Publishing to Vercel is
  handled in step 5 by delegating to the **`portal-deploy`** agent, so the deploy
  runs in its own context and returns just the link. Assets are always saved under
  the output dir regardless of deploy.

Only set env vars to override defaults (e.g. `GOOGLE_CLOUD_PROJECT`,
`MESHY_API_KEY`). Don't load an SA via `set -a; source` — it strips the JSON's
double quotes and breaks it; use a `sa.json` file or a single-quoted inline value.

### 5. Publish to the public viewer (delegate to the portal-deploy agent)

When generation completes and the model should go live, **delegate the deploy to
the `portal-deploy` agent** (Task tool). It classifies the output as the `gallery`
category, bundles it into the viewer, rebuilds `models/manifest.json`, ensures the
viewer is linked to the owner's Vercel project, deploys, and returns the public
deep link `https://3d-viewer-navy.vercel.app/?id=<task-id>`.

Spawn it with the output path, e.g.:

> Use the portal-deploy agent to publish the 3D model at
> `/Users/hau/Documents/Projects/agileops/mobile-poc/3d/<task-id>`.

The agent wraps `publish.mjs` internally — do NOT run `publish.mjs` from the main
thread; let the agent handle the deploy noise and hand back only the link. For a
local-only preview without deploying: `cd viewer && python3 -m http.server 8000`
(or the agent can bundle with `publish.mjs <task-id> -n`, no deploy).

### 6. Report

Relay the resulting `output/<task-id>/` path and asset list (4 PNG views,
`model.glb`, the requested `.stl`/others, plus `prompt.txt` and `job.txt`).
If published, include the public viewer link `https://<site>/?id=<task-id>`.

## Worked example

Brief: *"Leopard-shaped plastic bottle for blow moulding, STL required, ~170mm,
120–150g sand fill, standard bottle neck, children's coloured-sand activity."*

- `prompt`: `A leopard-shaped plastic bottle: stylized leopard body forming a
  tall hollow vessel, glossy golden-tan surface with solid dark-brown rosette
  spots, smooth rounded contours, a standard cylindrical screw-neck opening at
  the top, injection-mouldable simple geometry.`
- `formats`: `stl,glb`
- `notes`: `H~170mm, 120-150g fill, blow-mould, standard neck`

```bash
node pipeline.mjs -n -f stl,glb -J /tmp/job-leopard.txt \
  -m "H~170mm, 120-150g fill, blow-mould, standard neck" \
  "A leopard-shaped plastic bottle: stylized leopard body forming a tall hollow vessel, glossy golden-tan surface with solid dark-brown rosette spots, smooth rounded contours, a standard cylindrical screw-neck opening at the top, injection-mouldable simple geometry."
```

## Notes / limits

- Provider is Meshy (`multi-image-to-3d`, `meshy-6`). Tripo not bundled.
- Uses **Vertex AI** (service-account OAuth). Models default to
  `gemini-3.1-pro-preview` (text) and `gemini-3-pro-image-preview` (image, mapped
  to `gemini-3.1-flash-image` / Nano Banana 2 on Vertex); override with `GEMINI_TEXT_MODEL` /
  `GEMINI_IMAGE_MODEL`. gemini-3.x ids route to the Vertex `global` endpoint.
```
