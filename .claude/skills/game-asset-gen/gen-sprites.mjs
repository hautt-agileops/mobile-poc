#!/usr/bin/env node
/**
 * Character sprite generator — Vertex base image + vendored sprite-gen row pipeline.
 *
 * For each character: generate ONE base idle image via Vertex AI (Gemini nano-banana),
 * hand it to sprite-gen's prepare_sprite_run.py (writes per-state prompts + 4:1 layout
 * guides), fill each state's raw magenta strip with a SINGLE wide Vertex call (all
 * frames of that state in one image), then let sprite-gen's extract_sprite_row_frames.py
 * chroma-key + connected-component split it into clean per-frame alpha PNGs. Frames are
 * renamed to the fighter SpriteLoader convention (<id>_<state>_<n>.png) under
 * Assets/Resources/Art so the Unity build loads them at runtime.
 *
 * Why: ~1 Vertex call per state ROW instead of one per frame (~3x fewer calls), real
 * alpha from chroma-key (no alpha_key.py flood-fill needed for characters), and stronger
 * identity lock via the base anchor + layout guides.
 *
 * Vertex auth (SA JSON -> RS256 JWT -> OAuth bearer) is ported from gen-assets.mjs so the
 * same sa.json / GOOGLE_* / 1Password resolution works. Requires python3 + Pillow for the
 * vendored sprite-gen scripts under vendor/sprite-gen/.
 *
 * Usage:
 *   node gen-sprites.mjs <manifest.json>              # generate all characters
 *   node gen-sprites.mjs <manifest.json> -o <dir>     # override output dir
 *   node gen-sprites.mjs <manifest.json> -i vyre      # only ids containing substr
 *   node gen-sprites.mjs <manifest.json> -F           # force re-gen existing
 *   node gen-sprites.mjs <manifest.json> -d           # dry run: print plan, gen nothing
 *   node gen-sprites.mjs <manifest.json> --curate     # print curation-webview command per char
 *   node gen-sprites.mjs <manifest.json> --keep-run   # keep the .sprite-runs work dirs
 *
 * Manifest (sprite mode):
 *   {
 *     "outDir": "Assets/Resources/Art",
 *     "style": "gritty 2D fighter, bold ink outline, cel shading",   // -> prepare --style
 *     "chroma": "#FF00FF",
 *     "cellSize": 256,
 *     "characters": [
 *       { "id": "vyre", "description": "crimson blade duelist",
 *         "identity": "canonical design restated in the base prompt",
 *         "base": "full-body base idle of a crimson-armored duelist ...",
 *         "states": { ...optional override; defaults to the fighter set... } }
 *     ]
 *   }
 */

import { writeFile, mkdir, readFile, rm, readdir, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createSign } from "node:crypto";
import { execFileSync } from "node:child_process";

// ---- config ---------------------------------------------------------------
const PROJECT_ENV = (process.env.GOOGLE_CLOUD_PROJECT || "").trim();
const DEFAULT_LOCATION =
  (process.env.GOOGLE_CLOUD_LOCATION || "").trim() || "us-central1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE_CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const VERTEX_MODEL_OVERRIDE = {
  "gemini-3-pro-image-preview": "gemini-3.1-flash-image",
  "nano-banana-2-lite": "gemini-3.1-flash-lite-image",
  "nano-banana-2": "gemini-3.1-flash-image",
};
const MAX_RETRIES = 5;

const SKILL_DIR = import.meta.dirname || process.cwd();
const SPRITEGEN = join(SKILL_DIR, "vendor", "sprite-gen", "scripts");

// Default fighter coverage — the "enough sprites" guarantee. idle FIRST so it is the
// identity anchor. Override per character via manifest character.states.
const FIGHTER_STATES = {
  idle: { frames: 4, fps: 4, loop: true, action: "gentle breathing idle, subtle weight shift, no travel" },
  walk: { frames: 4, fps: 8, loop: true, action: "side-on walk cycle, clear left/right foot contacts, full stride" },
  attack: { frames: 4, fps: 10, loop: false, action: "windup, strike, impact, recovery" },
  hurt: { frames: 2, fps: 8, loop: false, action: "flinch and recoil back from a hit" },
  block: { frames: 1, fps: 1, loop: false, action: "raise guard, braced defensive stance" },
  ko: { frames: 2, fps: 6, loop: false, action: "stagger then collapse to the ground" },
};

// ---- tiny logger ----------------------------------------------------------
const C = { cyan: "\x1b[0;36m", green: "\x1b[0;32m", red: "\x1b[0;31m", yellow: "\x1b[0;33m", off: "\x1b[0m" };
const say = (m) => console.log(`${C.cyan}==>${C.off} ${m}`);
const ok = (m) => console.log(`${C.green}  ✓ ${m}${C.off}`);
const warn = (m) => console.log(`${C.yellow}  ! ${m}${C.off}`);
const die = (m) => { console.error(`${C.red}error: ${m}${C.off}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- arg parsing ----------------------------------------------------------
function parseArgs(argv) {
  const o = { manifest: "", outDir: "", only: "", force: false, dry: false, concurrency: 0, curate: false, keepRun: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o") o.outDir = argv[++i] || "";
    else if (a === "-i") o.only = argv[++i] || "";
    else if (a === "-c") o.concurrency = Math.max(1, Number(argv[++i]) || 0);
    else if (a === "-F") o.force = true;
    else if (a === "-d") o.dry = true;
    else if (a === "--curate") o.curate = true;
    else if (a === "--keep-run") o.keepRun = true;
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else rest.push(a);
  }
  o.manifest = rest[0] || "";
  return o;
}
function printHelp() {
  console.log(`gen-sprites.mjs — Vertex base + sprite-gen rows -> per-frame character sprites

  node gen-sprites.mjs <manifest.json> [options]

  -o DIR      override manifest.outDir (where PNGs land, e.g. Assets/Resources/Art)
  -i STR      only characters whose id contains STR
  -c N        max characters generated in parallel (default 2, or GEN_CONCURRENCY env)
  -F          force: re-generate even if <id>_idle_0.png already exists
  -d          dry run: print the plan (base prompt + states + aspect), generate nothing
  --curate    after building, print the sprite-gen curation-webview command per character
  --keep-run  keep the .sprite-runs/<id> work dirs (default: removed unless a char failed)
  -h          help

  Needs python3 + Pillow (vendored sprite-gen). Vertex auth: same as gen-assets.mjs.`);
}

// ---- 1Password helper -----------------------------------------------------
function opRead(ref) {
  try {
    return execFileSync("op", ["read", ref], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return ""; }
}

// ---- Vertex auth: service account -> OAuth bearer -------------------------
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const SA_OP_REF = process.env.GOOGLE_SA_OP_REF || "op://Shared AI/vertex-sa/credential";

let _sa;
function loadServiceAccount() {
  if (_sa !== undefined) return _sa;
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  if (inline) return (_sa = JSON.parse(inline));
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    if (!existsSync(path)) die(`GOOGLE_APPLICATION_CREDENTIALS not found: ${path}`);
    return (_sa = JSON.parse(readFileSync(path, "utf8")));
  }
  for (const f of [join(process.cwd(), "sa.json"), join(SKILL_DIR, "sa.json")]) {
    if (existsSync(f)) { ok(`service account loaded from ${f}`); return (_sa = JSON.parse(readFileSync(f, "utf8"))); }
  }
  if (SA_OP_REF) {
    const raw = opRead(SA_OP_REF);
    if (raw) { ok(`service account loaded from 1Password (${SA_OP_REF})`); return (_sa = JSON.parse(raw)); }
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
  if (!sa) die("No Vertex credential found. Provide GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_VERTEX_ACCESS_TOKEN / GOOGLE_SA_OP_REF, or drop a sa.json next to the skill.");
  if (!sa.client_email || !sa.private_key) die("service account JSON missing client_email/private_key");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE_CLOUD_PLATFORM, aud: sa.token_uri || TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const jwt = `${signingInput}.${b64url(signer.sign(sa.private_key))}`;
  const resp = await fetch(sa.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!resp.ok) die(`Google token exchange failed (${resp.status}): ${await resp.text()}`);
  return (_token = (await resp.json()).access_token);
}

async function genaiRequest(model, method) {
  const project = resolveProject();
  if (!project) die("No GCP project: set GOOGLE_CLOUD_PROJECT or provide a service account (its project_id is used)");
  const resolved = VERTEX_MODEL_OVERRIDE[model] ?? model;
  const loc = resolved.startsWith("gemini-3") ? "global" : DEFAULT_LOCATION;
  const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${project}/locations/${loc}/publishers/google/models/${resolved}:${method}`;
  const token = await getAccessToken();
  return { url, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

// ---- image gen ------------------------------------------------------------
function throttleDelayMs(resp, attempt) {
  const ra = resp.headers.get("retry-after");
  if (ra) { const s = Number(ra); if (!Number.isNaN(s)) return Math.min(60000, s * 1000); }
  return Math.min(60000, 8000 * 2 ** (attempt - 1));
}
const VALID_SIZES = new Set(["1K", "2K"]);
const coerceSize = (s) => (VALID_SIZES.has(s) ? s : "1K");

// Vertex gemini-3 image aspect ratios. A true 4:1 sprite strip is unsupported, so
// pick the WIDEST ratio that fits the frame count and let sprite-gen's component
// extraction find the N blobs (it is geometry-tolerant, not fixed-grid).
const VALID_ASPECTS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);
const coerceAspect = (a) => (VALID_ASPECTS.has(a) ? a : "16:9");
function aspectForFrames(n) {
  if (n <= 1) return "1:1";
  if (n === 2) return "16:9";
  return "21:9"; // 3+ frames: widest available (~2.33:1)
}

const IMAGE_MODEL_CHAIN = (() => {
  const extra = (process.env.GEMINI_IMAGE_FALLBACKS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const chain = extra.length ? [IMAGE_MODEL, ...extra] : [IMAGE_MODEL, "gemini-2.5-flash-image", "gemini-3.1-flash-lite-image"];
  return [...new Set(chain)];
})();

// contents: full request parts (text + optional inlineData refs). Returns a Buffer.
async function generateImage(contents, size, aspect) {
  let lastErr;
  for (let mi = 0; mi < IMAGE_MODEL_CHAIN.length; mi++) {
    const model = IMAGE_MODEL_CHAIN[mi];
    let throttled = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { url, headers } = await genaiRequest(model, "generateContent");
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents,
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: { imageSize: coerceSize(size), ...(aspect ? { aspectRatio: coerceAspect(aspect) } : {}) },
            },
          }),
        });
        if (resp.status === 503 || resp.status === 429) {
          throttled = true;
          lastErr = new Error(`Vertex AI throttled (${resp.status}) on ${model}`);
          if (attempt === MAX_RETRIES) break;
          await sleep(throttleDelayMs(resp, attempt));
          continue;
        }
        if (!resp.ok) throw new Error(`Vertex AI image gen failed (${resp.status}): ${await resp.text()}`);
        const data = await resp.json();
        const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (!part?.inlineData) throw new Error("No image in Gemini response — returned text only");
        return Buffer.from(part.inlineData.data, "base64");
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_RETRIES) break;
        await sleep(2000 * attempt);
      }
    }
    const next = IMAGE_MODEL_CHAIN[mi + 1];
    if (throttled && next) warn(`${model} throttled — falling back to ${next}`);
    else if (!throttled) break;
  }
  throw lastErr || new Error("all image models failed");
}

const imgPart = (buf) => ({ inlineData: { mimeType: "image/png", data: buf.toString("base64") } });

// ---- python bridge --------------------------------------------------------
// script: bare name -> vendored sprite-gen scripts dir; contains "/" -> used as-is
// (so our SKILL-local slot_extract.py resolves too).
function py(script, args) {
  const path = script.includes("/") ? script : join(SPRITEGEN, script);
  const out = execFileSync("python3", [path, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return out;
}
// Like py() but tolerant of a non-zero exit: extract_sprite_row_frames.py exits
// non-zero when ANY single frame is sparse/empty, yet it still WRITES every good
// frame first. Swallow the exit and return whatever it printed so the reconcile
// step can proceed on the frames that did extract (a lone bad frame gets padded,
// not the whole character discarded).
function pyTolerant(script, args) {
  try { return py(script, args); }
  catch (e) { return e.stdout || ""; }
}
function checkPython() {
  try { execFileSync("python3", ["-c", "import PIL"], { stdio: "ignore" }); }
  catch { die("python3 + Pillow required for sprite-gen. Install: python3 -m pip install 'pillow>=12,<13'"); }
}

// ---- base image prompt ----------------------------------------------------
function basePrompt(char, style) {
  return [
    "A single full-body 2D game character sprite, side-on orthographic view, standing " +
      "neutral idle, full body in frame, readable silhouette, game-ready.",
    char.identity ? `CHARACTER (canonical design — keep identical everywhere): ${char.identity}` : "",
    char.base || char.description || char.id,
    style ? `Art style: ${style}` : "",
    "FULLY TRANSPARENT background (alpha channel, no backdrop, no ground shadow, no " +
      "checkerboard). Center the subject. No text, no labels, no watermarks, no UI.",
  ].filter(Boolean).join("\n\n");
}

// ---- per-character pipeline -----------------------------------------------
async function buildCharacter(char, cfg) {
  const { outDir, style, chroma, cellSize, runsBase, dry, curate } = cfg;
  const id = char.id;
  const states = char.states && Object.keys(char.states).length ? char.states : FIGHTER_STATES;
  const stateNames = Object.keys(states);
  const runDir = join(runsBase, id);

  if (dry) {
    console.log(`\n--- ${id} ---`);
    console.log(`base:\n${basePrompt(char, style)}`);
    console.log(`states: ${stateNames.map((s) => `${s}(${states[s].frames}f, ${aspectForFrames(states[s].frames)})`).join(", ")}`);
    return { id, ok: true, dry: true };
  }

  // 1. base idle image (identity anchor)
  say(`${id}: base image`);
  const baseBuf = await generateImage([{ role: "user", parts: [{ text: basePrompt(char, style) }] }], "1K", "1:1");
  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });
  const basePath = join(runDir, "_base.png");
  await writeFile(basePath, baseBuf);
  ok(`base (${baseBuf.length} bytes)`);

  // 2. prepare_sprite_run.py -> prompts/ + layout-guides/ + sprite-request.json
  const request = {
    version: 1, kind: "sprite-gen-request", engine: "component-row",
    character: { id, description: char.description || "" },
    cell: { shape: "square", size: cellSize, safe_margin: Math.round(cellSize * 0.09) },
    chroma_key: { name: "magenta", hex: chroma, rgb: [255, 0, 255] },
    states,
  };
  const prepArgs = [
    "--out-dir", runDir, "--character-id", id, "--base-image", basePath,
    "--chroma-key", chroma, "--request-json", JSON.stringify(request), "--force",
  ];
  if (style) prepArgs.push("--style", style);
  try { py("prepare_sprite_run.py", prepArgs); }
  catch (e) { throw new Error(`prepare_sprite_run failed: ${e.stderr || e.message}`); }
  ok(`prepared ${stateNames.length} state prompts`);

  const guideDir = join(runDir, "references", "layout-guides");
  const promptDir = join(runDir, "prompts");
  const rawDir = join(runDir, "raw");
  await mkdir(rawDir, { recursive: true });

  // 3. one wide Vertex call per state ROW -> raw/<state>.png. Attach base (identity)
  //    + layout guide (frame count / spacing). Prompt text is authored by prepare.
  const limit = Math.max(1, Number(process.env.STATE_CONCURRENCY) || 3);
  let sidx = 0;
  const genState = async (state) => {
    const frames = states[state].frames;
    const aspect = aspectForFrames(frames);
    const promptTxt = await readFile(join(promptDir, `${state}.txt`), "utf8");
    const parts = [{ text: promptTxt }, imgPart(baseBuf)];
    const guidePath = join(guideDir, `${state}.png`);
    if (existsSync(guidePath)) parts.push(imgPart(await readFile(guidePath)));
    say(`${id}/${state} row (${frames}f, ${aspect})`);
    const buf = await generateImage([{ role: "user", parts }], "2K", aspect);
    await writeFile(join(rawDir, `${state}.png`), buf);
    ok(`${id}/${state} raw strip (${buf.length} bytes)`);
  };
  const workers = Array.from({ length: Math.min(limit, stateNames.length) }, async () => {
    while (sidx < stateNames.length) {
      const s = stateNames[sidx++];
      try { await genState(s); } catch (e) { warn(`${id}/${s} row failed: ${e.message}`); }
    }
  });
  await Promise.all(workers);

  // 4. slot_extract.py -> frames/<state>/frame-N.png (chroma-key + FORCED even-slot
  //    slicing). We use our SKILL-local force-slots driver instead of sprite-gen's
  //    connected-component extractor because a fighter's weapon (katana held low) can
  //    bridge slots -> one giant component -> empty frames. Our strips are always
  //    evenly laid out on the layout guide, so fixed slicing is correct + robust.
  //    Still tolerant: any per-frame warning makes it exit non-zero but frames are
  //    written; parse errors[] to DROP empty/sparse frames, reconcile pads shortfalls.
  const extractOut = pyTolerant(join(SKILL_DIR, "slot_extract.py"), ["--run-dir", runDir]);
  const bad = new Map(); // state -> Set(frameIdx flagged empty/sparse)
  try {
    const rep = JSON.parse(extractOut);
    for (const e of rep.errors || []) {
      const m = /^([a-z0-9_]+): frame (\d+)/i.exec(e);
      if (m) { if (!bad.has(m[1])) bad.set(m[1], new Set()); bad.get(m[1]).add(Number(m[2])); }
    }
  } catch { /* non-JSON output: no drops, reconcile still runs on file counts */ }

  // 5. reconcile counts + rename into Resources/Art as <id>_<state>_<n>.png
  await mkdir(outDir, { recursive: true });
  let framesWritten = 0;
  const shortfalls = [];
  for (const state of stateNames) {
    const want = states[state].frames;
    const fdir = join(runDir, "frames", state);
    let files = [];
    if (existsSync(fdir)) {
      const badSet = bad.get(state);
      files = (await readdir(fdir)).filter((f) => /^frame-\d+\.png$/.test(f))
        .filter((f) => !badSet || !badSet.has(Number(f.match(/\d+/)[0]))) // drop empty/sparse
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    }
    if (files.length === 0) { shortfalls.push(`${state}: 0/${want} (no usable frames extracted)`); continue; }
    // reconcile: too many -> take leftmost `want`; too few -> pad by repeating the last.
    const picked = [];
    for (let k = 0; k < want; k++) picked.push(files[Math.min(k, files.length - 1)]);
    if (files.length !== want) shortfalls.push(`${state}: ${files.length}/${want} (padded/truncated)`);
    for (let k = 0; k < want; k++) {
      await copyFile(join(fdir, picked[k]), join(outDir, `${id}_${state}_${k}.png`));
      framesWritten++;
    }
  }
  // default static sprite for Renderer(id)/Get(id): idle frame 0 if present
  const idle0 = join(outDir, `${id}_idle_0.png`);
  if (existsSync(idle0)) await copyFile(idle0, join(outDir, `${id}.png`));

  for (const s of shortfalls) warn(`${id} ${s}`);
  ok(`${id}: ${framesWritten} frames -> ${outDir}`);
  if (curate) console.log(`   curate: python3 ${join(SPRITEGEN, "serve_curation.py")} --run-dir ${runDir}`);
  return { id, ok: framesWritten > 0, framesWritten, shortfalls, runDir };
}

// ---- main -----------------------------------------------------------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.manifest) { printHelp(); die("manifest path required"); }
  if (!existsSync(o.manifest)) die(`manifest not found: ${o.manifest}`);

  let manifest;
  try { manifest = JSON.parse(readFileSync(o.manifest, "utf8")); }
  catch (e) { die(`manifest is not valid JSON: ${e.message}`); }
  if (!Array.isArray(manifest.characters) || manifest.characters.length === 0)
    die("manifest.characters must be a non-empty array");

  const outDir = o.outDir || manifest.outDir || "Assets/Resources/Art";
  const style = manifest.style || "";
  const chroma = manifest.chroma || "#FF00FF";
  const cellSize = manifest.cellSize || 256;
  const runsBase = join(dirname(o.manifest), ".sprite-runs");

  if (!o.dry) {
    checkPython();
    if (!resolveProject()) die("No GCP project: set GOOGLE_CLOUD_PROJECT or provide a service account (its project_id is used)");
  }

  // filter + skip
  let chars = manifest.characters.filter((c) => c.id && (c.base || c.description || c.states));
  if (o.only) chars = chars.filter((c) => c.id.includes(o.only));
  if (!o.force && !o.dry) {
    chars = chars.filter((c) => {
      if (existsSync(join(outDir, `${c.id}_idle_0.png`))) { ok(`${c.id} — exists, skipped (use -F to force)`); return false; }
      return true;
    });
  }
  if (chars.length === 0) { say("nothing to do"); return; }

  say(`Generating ${chars.length} character(s) -> ${outDir}`);
  const cfg = { outDir, style, chroma, cellSize, runsBase, dry: o.dry, curate: o.curate };

  // characters in bounded parallel (each shells python + does its own state pool)
  const limit = o.concurrency || Math.max(1, Number(process.env.GEN_CONCURRENCY) || 2);
  let idx = 0;
  const results = [];
  const worker = async () => {
    while (idx < chars.length) {
      const c = chars[idx++];
      try { results.push(await buildCharacter(c, cfg)); }
      catch (e) { warn(`${c.id} failed: ${e.message}`); results.push({ id: c.id, ok: false, err: e.message, runDir: join(runsBase, c.id) }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, chars.length) }, worker));

  if (o.dry) return;

  // cleanup run dirs (keep on failure or --keep-run for debugging)
  if (!o.keepRun) {
    for (const r of results) {
      if (r.ok && r.runDir && !(r.shortfalls && r.shortfalls.length)) await rm(r.runDir, { recursive: true, force: true });
    }
  }

  const done = results.filter((r) => r.ok).length;
  const failed = results.length - done;
  console.log(`\n${C.green}done${C.off} — ${done} ok, ${failed} failed -> ${outDir}`);
  if (failed > 0) warn("some characters failed — re-run to retry (existing PNGs are skipped). SpriteLoader falls back to PrimitiveArt for missing sprites.");
  if (results.some((r) => r.shortfalls && r.shortfalls.length))
    warn("frame-count shortfalls were padded/truncated — run with --keep-run + --curate to inspect and fix rows.");
}

main().catch((e) => die(e.message || String(e)));
