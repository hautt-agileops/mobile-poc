#!/usr/bin/env node
/*
 * Worker-less 3D game-MODEL generator for the unity-poc 3D pipeline. Reads a
 * models.manifest.json and turns each entry into a GLB by delegating to the bundled
 * `3d-prompt` skill's pipeline.mjs (Gemini reference views -> Meshy multi-image-to-3d),
 * then writes the result into the Unity project as Assets/Resources/Models/<id>.bytes so
 * ModelLoader (glTFast) loads it at runtime. The `.bytes` extension is required — Unity only
 * ships arbitrary binaries through Resources as a TextAsset.
 *
 * It is the 3D analogue of gen-assets.mjs and follows the same contract: idempotent (skips
 * ids whose .bytes already exists), and NEVER a hard gate — a model that fails to generate is
 * logged and skipped, and the runtime falls back to a tinted primitive capsule.
 *
 * Usage:
 *   node gen-models.mjs <models.manifest.json>                 # generate all missing models
 *   node gen-models.mjs <models.manifest.json> -o <projDir>    # project root (default: manifest dir)
 *   node gen-models.mjs <models.manifest.json> -i ridge        # only ids matching a substring
 *   node gen-models.mjs <models.manifest.json> -F              # force re-gen existing
 *   node gen-models.mjs <models.manifest.json> -d              # dry run: print the prompts only
 *
 * manifest shape:
 *   { "style": "low-poly stylized game character, clean solid colors",
 *     "models": [ { "id": "ridge", "prompt": "armored red brawler, broad shoulders" }, ... ] }
 * The global `style` is prepended to every prompt so the set stays visually coherent — exactly
 * like gen-assets.mjs's `style` field.
 *
 * 3d-prompt location resolves in order: $THREE_D_PROMPT_DIR -> the repo-root skill at
 * ../../../.claude/skills/3d-prompt (relative to this file). Credentials (Vertex SA + Meshy)
 * are resolved by pipeline.mjs itself — do NOT export anything here.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function has(flag) {
  return process.argv.includes(flag);
}

const manifestPath = process.argv[2];
if (!manifestPath || manifestPath.startsWith("-")) {
  console.error("usage: node gen-models.mjs <models.manifest.json> [-o projDir] [-i idSub] [-F] [-d]");
  process.exit(2);
}

const DRY = has("-d");
const FORCE = has("-F");
const ONLY = arg("-i");
const projDir = resolve(arg("-o", dirname(manifestPath)));
const outDir = join(projDir, "Assets", "Resources", "Models");

// Resolve the 3d-prompt skill (its pipeline.mjs).
const threeDir = resolve(
  process.env.THREE_D_PROMPT_DIR || join(__dir, "..", "..", "..", ".claude", "skills", "3d-prompt")
);
const pipeline = join(threeDir, "pipeline.mjs");
if (!DRY && !existsSync(pipeline)) {
  console.error(
    `[gen-models] 3d-prompt pipeline not found at ${pipeline}\n` +
      `  set THREE_D_PROMPT_DIR to the 3d-prompt skill dir.`
  );
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const style = (manifest.style || "").trim();
const models = manifest.models || manifest.assets || [];
if (!Array.isArray(models) || models.length === 0) {
  console.error("[gen-models] manifest has no `models` array");
  process.exit(2);
}

if (!DRY) mkdirSync(outDir, { recursive: true });

// Find the newest model.glb produced anywhere under a base dir (pipeline writes output/<task-id>/).
function newestGlb(base) {
  let best = null;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith(".glb")) {
        const m = statSync(p).mtimeMs;
        if (!best || m > best.m) best = { p, m };
      }
    }
  };
  walk(base);
  return best?.p || null;
}

let made = 0,
  skipped = 0,
  failed = 0;

for (const m of models) {
  const id = m.id;
  if (!id) {
    console.warn("[gen-models] entry missing `id`, skipping");
    continue;
  }
  if (ONLY && !id.includes(ONLY)) continue;

  const dest = join(outDir, `${id}.bytes`);
  if (!FORCE && existsSync(dest)) {
    console.log(`[skip] ${id} (exists)`);
    skipped++;
    continue;
  }

  const prompt = [style, (m.prompt || "").trim()].filter(Boolean).join(", ");
  if (DRY) {
    console.log(`[dry] ${id}: ${prompt}`);
    continue;
  }

  const work = mkdtempSync(join(tmpdir(), `glb-${id}-`));
  console.log(`[gen] ${id} -> ${dest}`);
  try {
    // -n: skip pipeline's own refine (manifest prompt is final). -P: no Vercel publish.
    // -f glb: only need the mesh. -o <work>: isolate this model's output.
    execFileSync("node", [pipeline, "-n", "-P", "-f", "glb", "-o", work, prompt], {
      stdio: "inherit",
    });
    const glb = newestGlb(work);
    if (!glb) {
      console.warn(`[fail] ${id}: pipeline produced no .glb`);
      failed++;
      continue;
    }
    copyFileSync(glb, dest);
    made++;
  } catch (e) {
    console.warn(`[fail] ${id}: ${e.message} (runtime will use a primitive fallback)`);
    failed++;
  }
}

console.log(`\n[gen-models] made=${made} skipped=${skipped} failed=${failed} -> ${outDir}`);
if (!DRY && made > 0) {
  console.log(
    "[gen-models] models written. Ensure the 3D project has com.unity.cloud.gltfast +\n" +
      "  Assets/csc.rsp containing `-define:HAS_GLTFAST` so ModelLoader compiles the glTFast path."
  );
}
