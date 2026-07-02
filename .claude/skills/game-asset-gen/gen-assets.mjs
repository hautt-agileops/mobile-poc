#!/usr/bin/env node
/**
 * Worker-less 2D game-asset generator. Reads an assets.manifest.json, renders
 * every sprite / tile / UI element / concept image by calling Vertex AI
 * (Gemini "Nano Banana 2" = gemini-3.1-flash-image) directly, and writes PNGs into
 * the project so Unity loads them at runtime. No server, no worker. Zero npm deps
 * (Node 18+: fetch, Buffer, crypto).
 *
 * Auth code (service-account JSON -> RS256 JWT -> OAuth bearer -> Vertex URL) is
 * ported verbatim from the 3d-prompt skill's pipeline.mjs so the same sa.json /
 * GOOGLE_* env / 1Password resolution works here.
 *
 * Usage:
 *   node gen-assets.mjs <manifest.json>                 # generate all assets
 *   node gen-assets.mjs <manifest.json> -o <outDir>     # override output dir
 *   node gen-assets.mjs <manifest.json> -i fighter_red  # only ids matching substr
 *   node gen-assets.mjs <manifest.json> -F              # force re-gen existing
 *   node gen-assets.mjs <manifest.json> -d              # dry run: print prompts
 *
 * Auth (any one, same priority as 3d-prompt):
 *   GOOGLE_SERVICE_ACCOUNT_JSON (inline) | GOOGLE_APPLICATION_CREDENTIALS (file) |
 *   GOOGLE_SA_OP_REF (1Password) | a sa.json next to this script or in the cwd |
 *   GOOGLE_VERTEX_ACCESS_TOKEN (pre-minted, dev only)
 *   Project: GOOGLE_CLOUD_PROJECT, else the SA's project_id.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSign } from "node:crypto";
import { execFileSync } from "node:child_process";

// ---- config ---------------------------------------------------------------
const PROJECT_ENV = (process.env.GOOGLE_CLOUD_PROJECT || "").trim();
const DEFAULT_LOCATION =
  (process.env.GOOGLE_CLOUD_LOCATION || "").trim() || "us-central1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE_CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";

// Nano Banana 2 = gemini-3.1-flash-image. gemini-3-pro-image-preview is remapped
// to it on Vertex (same mapping the 3d-prompt pipeline uses).
const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const VERTEX_MODEL_OVERRIDE = {
  "gemini-3-pro-image-preview": "gemini-3.1-flash-image",
};
const MAX_RETRIES = 5;

// ---- tiny logger ----------------------------------------------------------
const C = {
  cyan: "\x1b[0;36m",
  green: "\x1b[0;32m",
  red: "\x1b[0;31m",
  yellow: "\x1b[0;33m",
  off: "\x1b[0m",
};
const say = (m) => console.log(`${C.cyan}==>${C.off} ${m}`);
const ok = (m) => console.log(`${C.green}  ✓ ${m}${C.off}`);
const warn = (m) => console.log(`${C.yellow}  ! ${m}${C.off}`);
const die = (m) => {
  console.error(`${C.red}error: ${m}${C.off}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- arg parsing ----------------------------------------------------------
function parseArgs(argv) {
  const o = { manifest: "", outDir: "", only: "", force: false, dry: false, concurrency: 0 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o") o.outDir = argv[++i] || "";
    else if (a === "-i") o.only = argv[++i] || "";
    else if (a === "-c") o.concurrency = Math.max(1, Number(argv[++i]) || 0);
    else if (a === "-F") o.force = true;
    else if (a === "-d") o.dry = true;
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else rest.push(a);
  }
  o.manifest = rest[0] || "";
  return o;
}

function printHelp() {
  console.log(`gen-assets.mjs — manifest -> 2D game assets (Vertex AI nano-banana)

  node gen-assets.mjs <manifest.json> [options]

  -o DIR   override manifest.outDir (where PNGs land, e.g. Assets/Resources/Art)
  -i STR   only generate assets whose id contains STR
  -c N     max assets generated in parallel (default 4, or GEN_CONCURRENCY env).
           ref-dependent assets still wait for their ref; spritesheet frames stay serial.
  -F       force: re-generate even if the PNG already exists
  -d       dry run: print the composed prompt for each asset, generate nothing
  -h       help

  Auth: same resolution as the 3d-prompt skill (sa.json / GOOGLE_* / 1Password).`);
}

// ---- 1Password helper -----------------------------------------------------
function opRead(ref) {
  try {
    return execFileSync("op", ["read", ref], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// ---- Vertex auth: service account -> OAuth bearer -------------------------
const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const SA_OP_REF =
  process.env.GOOGLE_SA_OP_REF || "op://Shared AI/vertex-sa/credential";
const SKILL_DIR = import.meta.dirname || process.cwd();

let _sa;
function loadServiceAccount() {
  if (_sa !== undefined) return _sa;
  const inline =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  if (inline) return (_sa = JSON.parse(inline));

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    if (!existsSync(path))
      die(`GOOGLE_APPLICATION_CREDENTIALS not found: ${path}`);
    return (_sa = JSON.parse(readFileSync(path, "utf8")));
  }

  for (const f of [join(process.cwd(), "sa.json"), join(SKILL_DIR, "sa.json")]) {
    if (existsSync(f)) {
      ok(`service account loaded from ${f}`);
      return (_sa = JSON.parse(readFileSync(f, "utf8")));
    }
  }

  if (SA_OP_REF) {
    const raw = opRead(SA_OP_REF);
    if (raw) {
      ok(`service account loaded from 1Password (${SA_OP_REF})`);
      return (_sa = JSON.parse(raw));
    }
  }
  return (_sa = null);
}

function resolveProject() {
  if (PROJECT_ENV) return PROJECT_ENV;
  const sa = loadServiceAccount();
  return sa && sa.project_id ? sa.project_id : "";
}

let _token = null;
async function getAccessToken() {
  if (_token) return _token;
  const pre = (process.env.GOOGLE_VERTEX_ACCESS_TOKEN || "").trim();
  if (pre) return (_token = pre);

  const sa = loadServiceAccount();
  if (!sa)
    die(
      "No Vertex credential found. Provide one of: GOOGLE_SERVICE_ACCOUNT_JSON " +
        "(inline), GOOGLE_APPLICATION_CREDENTIALS (file), GOOGLE_VERTEX_ACCESS_TOKEN, " +
        "GOOGLE_SA_OP_REF (1Password), or drop a sa.json next to the skill / in the cwd.",
    );
  if (!sa.client_email || !sa.private_key)
    die("service account JSON missing client_email/private_key");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE_CLOUD_PLATFORM,
      aud: sa.token_uri || TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const jwt = `${signingInput}.${b64url(signer.sign(sa.private_key))}`;

  const resp = await fetch(sa.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok)
    die(`Google token exchange failed (${resp.status}): ${await resp.text()}`);
  return (_token = (await resp.json()).access_token);
}

async function genaiRequest(model, method) {
  const project = resolveProject();
  if (!project)
    die(
      "No GCP project: set GOOGLE_CLOUD_PROJECT or provide a service account (its project_id is used)",
    );
  const resolved = VERTEX_MODEL_OVERRIDE[model] ?? model;
  const loc = resolved.startsWith("gemini-3") ? "global" : DEFAULT_LOCATION;
  const host =
    loc === "global"
      ? "aiplatform.googleapis.com"
      : `${loc}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${project}/locations/${loc}/publishers/google/models/${resolved}:${method}`;
  const token = await getAccessToken();
  return {
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
}

// ---- prompt composition ---------------------------------------------------
// Background directive per asset type. Game sprites need alpha; UI/concept can
// keep a flat fill the SpriteLoader doesn't key out.
function backgroundDirective(bg) {
  switch (bg) {
    case "transparent":
      return (
        "FULLY TRANSPARENT background (alpha channel, no backdrop, no ground " +
        "shadow, no checkerboard). The subject must be cleanly cut out so it " +
        "composites onto any game scene."
      );
    case "white":
      return "Plain solid white (#FFFFFF) background, no gradients.";
    case "scene":
      return "Painted in-scene background appropriate to the description.";
    default:
      return "FULLY TRANSPARENT background (alpha channel, no backdrop).";
  }
}

// Type-specific framing so a sprite reads as a game asset, not a render.
function typeDirective(type) {
  switch (type) {
    case "sprite":
      return (
        "A single 2D game character sprite, side-on orthographic view, full body " +
        "in frame, consistent line weight, readable silhouette, game-ready."
      );
    case "spritesheet":
      return (
        "2D character animation frames of the SAME character, identical colors / " +
        "proportions / line weight across every frame, side-on orthographic view."
      );
    case "tile":
      return (
        "A seamless 2D game tile / platform texture, top-lit, tileable edges, " +
        "orthographic, no perspective."
      );
    case "ui":
      return (
        "A clean 2D game UI element (icon / button / frame), crisp vector-like " +
        "edges, centered, flat game-UI style."
      );
    case "icon":
      return "A single crisp 2D game icon, centered, bold readable silhouette.";
    case "bg":
      return (
        "A 2D game background / stage, parallax-friendly, wide composition, no " +
        "characters, no UI, no text."
      );
    case "concept":
      return (
        "A polished concept-art key illustration that sets the visual target for " +
        "the game (mood, palette, shapes). Reference only, not a game asset."
      );
    default:
      return "A clean 2D game asset, centered, readable.";
  }
}

function composePrompt(asset, style) {
  return [
    typeDirective(asset.type),
    asset.prompt,
    style ? `Art style: ${style}` : "",
    backgroundDirective(asset.background),
    "No text, no labels, no watermarks, no UI chrome unless explicitly asked. " +
      "Center the subject in the frame.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---- Gemini image gen -----------------------------------------------------
function throttleDelayMs(resp, attempt) {
  const ra = resp.headers.get("retry-after");
  if (ra) {
    const s = Number(ra);
    if (!Number.isNaN(s)) return Math.min(60000, s * 1000);
  }
  return Math.min(60000, 8000 * 2 ** (attempt - 1));
}

// Vertex flash-image models only accept these imageSize values; anything else
// (e.g. "512") is rejected with INVALID_ARGUMENT. Coerce so a stray size never fails a run.
const VALID_SIZES = new Set(["1K", "2K"]);
const coerceSize = (s) => (VALID_SIZES.has(s) ? s : "1K");

// contents: full multi-turn history (so spritesheet frames stay consistent).
async function generateWithRetry(contents, size) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { url, headers } = await genaiRequest(IMAGE_MODEL, "generateContent");
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { imageSize: coerceSize(size) },
          },
        }),
      });
      if (resp.status === 503 || resp.status === 429) {
        if (attempt === MAX_RETRIES)
          throw new Error(
            `Vertex AI throttled (${resp.status}) after ${MAX_RETRIES} attempts`,
          );
        await sleep(throttleDelayMs(resp, attempt));
        continue;
      }
      if (!resp.ok)
        throw new Error(
          `Vertex AI image gen failed (${resp.status}): ${await resp.text()}`,
        );
      const data = await resp.json();
      const part = data.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData,
      );
      if (!part?.inlineData)
        throw new Error("No image in Gemini response — returned text only");
      return {
        imageData: part.inlineData.data,
        thoughtSignature: part.thoughtSignature,
      };
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      await sleep(2000 * attempt);
    }
  }
  throw new Error("Unreachable");
}

// Generate one asset. For spritesheet (frames > 1) generate N consistent frames
// via multi-turn history. A `ref` id reuses an already-generated image as visual
// context so related assets stay on-model. Returns [{name, buf}].
async function generateAsset(asset, style, refBuf) {
  const size = asset.size || "1K";
  const frames = Math.max(1, asset.frames || 1);
  const history = [];

  // Seed history with a reference image (keeps a roster / set consistent).
  if (refBuf) {
    history.push({
      role: "user",
      parts: [
        {
          text:
            "Reference image — match its art style, palette, line weight and " +
            "proportions in everything that follows.",
        },
        { inlineData: { mimeType: "image/png", data: refBuf.toString("base64") } },
      ],
    });
    history.push({
      role: "model",
      parts: [{ text: "Understood. I will match that reference." }],
    });
  }

  const out = [];
  for (let f = 0; f < frames; f++) {
    const base = composePrompt(asset, style);
    const text =
      frames === 1
        ? base
        : f === 0
          ? `${base}\n\nThis is frame 1 of a ${frames}-frame animation: the rest pose / first key.`
          : `Now frame ${f + 1} of ${frames} for the EXACT same character — ` +
            `${asset.frameNotes?.[f] || "next key pose of the animation cycle"}. ` +
            "Identical style, colors, proportions, line weight, same framing.";
    history.push({ role: "user", parts: [{ text }] });
    const { imageData, thoughtSignature } = await generateWithRetry(history, size);
    const modelPart = { inlineData: { mimeType: "image/png", data: imageData } };
    if (thoughtSignature) modelPart.thoughtSignature = thoughtSignature;
    history.push({ role: "model", parts: [modelPart] });
    const name = frames === 1 ? `${asset.id}.png` : `${asset.id}_${f}.png`;
    out.push({ name, buf: Buffer.from(imageData, "base64") });
  }
  return out;
}

// ---- main -----------------------------------------------------------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.manifest) {
    printHelp();
    die("manifest path required");
  }
  if (!existsSync(o.manifest)) die(`manifest not found: ${o.manifest}`);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(o.manifest, "utf8"));
  } catch (e) {
    die(`manifest is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0)
    die("manifest.assets must be a non-empty array");

  const outDir = o.outDir || manifest.outDir || "Assets/Resources/Art";
  const style = manifest.style || "";

  if (!o.dry && !resolveProject())
    die(
      "No GCP project: set GOOGLE_CLOUD_PROJECT or provide a service account (its project_id is used)",
    );

  await mkdir(outDir, { recursive: true });
  say(`Generating ${manifest.assets.length} assets -> ${outDir}`);
  if (manifest.project) ok(`project: ${manifest.project}`);

  // index assets by id so `ref` can find an already-generated buffer
  const generated = new Map();
  let done = 0;
  let skipped = 0;
  let failed = 0;

  // ---- pre-pass: validate, apply -i filter, skip existing --------------------
  // Builds the work list; dry-run prints prompts here (sequential, in order).
  const work = [];
  for (const asset of manifest.assets) {
    if (!asset.id || !asset.prompt) {
      warn(`asset missing id/prompt — skipped: ${JSON.stringify(asset).slice(0, 80)}`);
      failed++;
      continue;
    }
    if (o.only && !asset.id.includes(o.only)) continue;

    const firstName =
      (asset.frames || 1) === 1 ? `${asset.id}.png` : `${asset.id}_0.png`;
    if (!o.force && existsSync(join(outDir, firstName))) {
      ok(`${asset.id} — exists, skipped (use -F to force)`);
      skipped++;
      continue;
    }

    if (o.dry) {
      console.log(`\n--- ${asset.id} [${asset.type}] ---`);
      console.log(composePrompt(asset, style));
      continue;
    }
    work.push(asset);
  }

  if (o.dry) return;

  // ---- generate one asset (shared by serial + parallel paths) ---------------
  const genOne = async (asset) => {
    try {
      // ref buffer only exists once the ref target has finished this run
      const refBuf = asset.ref ? generated.get(asset.ref) : undefined;
      say(`${asset.id} (${asset.type}${asset.frames > 1 ? `, ${asset.frames}f` : ""})`);
      const imgs = await generateAsset(asset, style, refBuf);
      for (const img of imgs) {
        await writeFile(join(outDir, img.name), img.buf);
        ok(`${img.name} (${img.buf.length} bytes)`);
      }
      if (imgs[0]) generated.set(asset.id, imgs[0].buf); // first frame for downstream refs
      done++;
    } catch (e) {
      warn(`${asset.id} failed: ${e.message}`);
      failed++;
    }
  };

  // ---- schedule: dependency levels, bounded concurrency within each level ----
  // A `ref` edge exists only when the target is also generated THIS run (in `work`);
  // a ref pointing at an already-existing/skipped PNG is treated as a root (matches
  // the old in-memory-only ref behavior). Each level runs in parallel; a barrier
  // between levels guarantees a ref target's buffer is ready before its dependents.
  const inRun = new Set(work.map((a) => a.id));
  const levelOf = new Map();
  const computeLevel = (a, seen = new Set()) => {
    if (levelOf.has(a.id)) return levelOf.get(a.id);
    let lvl = 0;
    if (a.ref && inRun.has(a.ref) && !seen.has(a.id)) {
      const parent = work.find((x) => x.id === a.ref);
      if (parent) lvl = computeLevel(parent, new Set(seen).add(a.id)) + 1; // cycle-safe
    }
    levelOf.set(a.id, lvl);
    return lvl;
  };
  work.forEach((a) => computeLevel(a));

  const limit = o.concurrency || Math.max(1, Number(process.env.GEN_CONCURRENCY) || 4);
  const levels = [...new Set([...levelOf.values()])].sort((x, y) => x - y);

  for (const lvl of levels) {
    const batch = work.filter((a) => levelOf.get(a.id) === lvl);
    // bounded worker pool over this level
    let idx = 0;
    const worker = async () => {
      while (idx < batch.length) await genOne(batch[idx++]);
    };
    await Promise.all(Array.from({ length: Math.min(limit, batch.length) }, worker));
  }

  console.log(
    `\n${C.green}done${C.off} — generated ${done}, skipped ${skipped}, failed ${failed} -> ${outDir}`,
  );
  if (failed > 0)
    warn(
      "some assets failed — re-run to retry just the missing ones (existing PNGs are skipped). " +
        "Unity's SpriteLoader falls back to PrimitiveArt for any missing sprite.",
    );
}

main().catch((e) => die(e.message || String(e)));
