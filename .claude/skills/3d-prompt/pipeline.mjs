#!/usr/bin/env node
/**
 * Worker-less text/job -> 3D pipeline. Calls Vertex AI (Gemini) + Meshy REST
 * APIs directly. No server, no Cloudflare, no host. Zero npm deps (Node 18+).
 *
 * Ported from the 3d-pipeline-cf worker:
 *   worker/src/services/gemini.ts  (refine prompt + 4-view image gen)
 *   worker/src/services/genai.ts   (Vertex URL/model routing)
 *   worker/src/services/gdrive.ts  (service-account -> OAuth token)
 *   worker/src/services/meshy.ts   (multi-image -> 3D, poll, download)
 *
 * Auth — Vertex AI (you bring your OWN GCP project + service account):
 *   GOOGLE_CLOUD_PROJECT       (default: the service account's project_id)
 *   GOOGLE_CLOUD_LOCATION      (default us-central1; gemini-3.x forces global)
 *   one credential source, any of:
 *     GOOGLE_SERVICE_ACCOUNT_JSON   full SA JSON (inline, one line)
 *     GDRIVE_SERVICE_ACCOUNT_JSON   alias accepted
 *     GOOGLE_APPLICATION_CREDENTIALS  path to SA JSON file
 *     GOOGLE_VERTEX_ACCESS_TOKEN    pre-minted bearer (e.g. gcloud auth
 *                                   print-access-token), expires ~1h — dev only
 *   SA needs roles/aiplatform.user; enable the Vertex AI API on the project.
 *
 *   MESHY_API_KEY  (https://www.meshy.ai)
 *
 * Usage:
 *   node pipeline.mjs "a cute robot"
 *   node pipeline.mjs -n -f stl,glb -m "H~170mm, blow-mould" "<refined prompt>"
 *   node pipeline.mjs -J job.txt -o output "a leopard-shaped plastic bottle"
 *
 * Options:
 *   -n            no refine: use the prompt as-is (skip Gemini refine pass)
 *   -f FORMATS    comma list from glb,fbx,obj,stl,usdz (glb always included)
 *   -m NOTES      constraints/spec digest, recorded in prompt.txt
 *   -J JOBFILE    original brief, archived to <out>/job.txt
 *   -o OUTDIR     output base dir (default ./output)
 *   -P            no publish: skip the automatic Vercel deploy (on by default)
 *   -h            help
 */

import { writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSign } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

// ---- config ---------------------------------------------------------------
// Meshy key: from env, else pulled from 1Password (op) at runtime so it never
// lands on disk. Override the 1Password item ref with MESHY_OP_REF.
const MESHY_OP_REF =
  process.env.MESHY_OP_REF || "op://Shared AI/messiAPI/credential";
let MESHY_API_KEY = process.env.MESHY_API_KEY || "";
// Project: env first; otherwise falls back to the service account's project_id
// (resolved lazily once the SA is loaded). See resolveProject().
const PROJECT_ENV = (process.env.GOOGLE_CLOUD_PROJECT || "").trim();
const DEFAULT_LOCATION =
  (process.env.GOOGLE_CLOUD_LOCATION || "").trim() || "us-central1";
const MESHY_BASE = "https://api.meshy.ai";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE_CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";

// Model ids (same as worker). Vertex serves some under different names — see map.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.1-pro-preview";
const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
// Mirror of worker genai.ts VERTEX_MODEL_OVERRIDE.
const VERTEX_MODEL_OVERRIDE = {
  "gemini-3-pro-preview": "gemini-3.1-pro-preview",
  "gemini-3-pro": "gemini-3.1-pro-preview",
  "gemini-3.1-flash": "gemini-3.5-flash",
  "gemini-3-pro-image-preview": "gemini-3.1-flash-image",
};
const MAX_RETRIES = 5;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

// ---- tiny logger ----------------------------------------------------------
const C = {
  cyan: "\x1b[0;36m",
  green: "\x1b[0;32m",
  red: "\x1b[0;31m",
  off: "\x1b[0m",
};
const say = (m) => console.log(`${C.cyan}==>${C.off} ${m}`);
const ok = (m) => console.log(`${C.green}  ✓ ${m}${C.off}`);
const die = (m) => {
  console.error(`${C.red}error: ${m}${C.off}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- arg parsing ----------------------------------------------------------
function parseArgs(argv) {
  const o = {
    noRefine: false,
    formats: [],
    notes: "",
    jobfile: "",
    outBase: "/Users/hau/Documents/Projects/agileops/mobile-poc/3d",
    publish: true,
    prompt: "",
    refImage: "",
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") o.noRefine = true;
    else if (a === "-i") o.refImage = argv[++i] || "";
    else if (a === "-f")
      o.formats = (argv[++i] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "-m") o.notes = argv[++i] || "";
    else if (a === "-J") o.jobfile = argv[++i] || "";
    else if (a === "-o") o.outBase = argv[++i] || "/Users/hau/Documents/Projects/agileops/mobile-poc/3d";
    else if (a === "-P") o.publish = false;
    else if (a === "-V")
      o.publish = true; // back-compat no-op (publish is now default)
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else rest.push(a);
  }
  o.prompt = rest.join(" ").trim();
  return o;
}

function printHelp() {
  console.log(`pipeline.mjs — worker-less text/job -> 3D (Vertex AI Gemini + Meshy)

  node pipeline.mjs [options] "<prompt>"

  -n          no refine (use prompt as-is)
  -i IMAGE    reference product photo — local path OR http(s) URL (png/jpg/webp);
              seeds view 1 as a design cue
  -f FORMATS  comma list: glb,fbx,obj,stl,usdz (glb always included)
  -m NOTES    constraints digest, recorded in prompt.txt
  -J JOBFILE  original brief, archived to <out>/job.txt
  -o OUTDIR   output base dir (default ./output)
  -P          no publish: skip the automatic Vercel deploy (on by default)
  -h          help

  env: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION,
       Vertex SA (auto, any of): GOOGLE_SERVICE_ACCOUNT_JSON |
         GOOGLE_APPLICATION_CREDENTIALS | GOOGLE_VERTEX_ACCESS_TOKEN |
         GOOGLE_SA_OP_REF (1Password) | a sa.json in skill dir or cwd,
       MESHY_API_KEY (else pulled from 1Password; MESHY_OP_REF overrides item)`);
}

// ---- 1Password helper -----------------------------------------------------
// Read a secret from 1Password CLI. Returns '' if op is missing/locked/fails.
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

// Resolve the Vertex service account, in priority order, so it normally needs
// no manual export:
//   1. GOOGLE_SERVICE_ACCOUNT_JSON / GDRIVE_SERVICE_ACCOUNT_JSON  (inline)
//   2. GOOGLE_APPLICATION_CREDENTIALS                             (file path)
//   3. GOOGLE_SA_OP_REF                                           (1Password)
//   4. a `sa.json` sitting next to this script or in the cwd      (auto-discover)
// 1Password item holding the SA JSON; override with GOOGLE_SA_OP_REF.
const SA_OP_REF =
  process.env.GOOGLE_SA_OP_REF || "op://Shared AI/vertex-sa/credential";
const SKILL_DIR = import.meta.dirname || process.cwd();

let _sa; // cache: undefined = not yet loaded, null = none found, object = loaded
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

  // Prefer a local sa.json (no network) before falling back to 1Password.
  for (const f of [
    join(process.cwd(), "sa.json"),
    join(SKILL_DIR, "sa.json"),
  ]) {
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

// Project id: env override, else the service account's project_id.
function resolveProject() {
  if (PROJECT_ENV) return PROJECT_ENV;
  const sa = loadServiceAccount();
  return sa && sa.project_id ? sa.project_id : "";
}

let _token = null;
async function getAccessToken() {
  if (_token) return _token;
  const pre = (process.env.GOOGLE_VERTEX_ACCESS_TOKEN || "").trim();
  if (pre) {
    _token = pre;
    return _token;
  }

  const sa = loadServiceAccount();
  if (!sa) {
    die(
      "No Vertex credential found. Provide one of: GOOGLE_SERVICE_ACCOUNT_JSON " +
        "(inline), GOOGLE_APPLICATION_CREDENTIALS (file), GOOGLE_VERTEX_ACCESS_TOKEN, " +
        "GOOGLE_SA_OP_REF (1Password), or drop a sa.json next to the skill / in the cwd.",
    );
  }
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
  _token = (await resp.json()).access_token;
  return _token;
}

// Build Vertex URL + auth headers for a generateContent call (mirrors genai.ts).
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

// ---- Gemini (via Vertex) --------------------------------------------------
function throttleDelayMs(resp, attempt) {
  const ra = resp.headers.get("retry-after");
  if (ra) {
    const s = Number(ra);
    if (!Number.isNaN(s)) return Math.min(60000, s * 1000);
  }
  return Math.min(60000, 8000 * 2 ** (attempt - 1));
}

const REFINE_PROMPT = `You are an expert at writing image generation prompts for 3D model reference sheets.

Given a raw customer description enclosed in <input> tags, rewrite it into an optimized prompt that will produce the best possible 2D reference images for 3D model reconstruction.

Rules:
- Keep it concise (1-3 sentences max)
- Focus on the OBJECT to be modeled — extract the subject from the input even if it contains extra context like job descriptions, requirements, or deliverables
- Add specific details: materials, colors, proportions, surface finish
- Specify art style suitable for 3D modeling (clean, solid colors, no complex patterns)
- Remove ambiguity - be explicit about shape and form
- Do NOT add background instructions (handled separately)
- Do NOT add view angle instructions (handled separately)
- Output ONLY the refined prompt text, nothing else — no quotes, no labels, no explanation

<input>
{description}
</input>

Refined prompt:`;

const VIEWS = ["front", "left side", "back", "right side"];

const SYSTEM_CONTEXT =
  "You are generating reference images for 3D model reconstruction. " +
  "All views must depict the exact same object with identical colors, " +
  "proportions, materials, and details. Use a plain white background, " +
  "center the object, and ensure no text or watermarks.";

const buildInitialPrompt = (d) =>
  `${SYSTEM_CONTEXT}\n\nGenerate a front view of: ${d}\n\n` +
  "Requirements:\n- Plain white background\n- Object centered in frame\n" +
  "- Clear, detailed rendering\n- No text, labels, or watermarks\n" +
  "- Suitable as reference for 3D model reconstruction";

const buildFollowupPrompt = (v) =>
  `Now generate the ${v} view of the exact same object. ` +
  "Maintain identical style, colors, proportions, and level of detail. " +
  "Same white background, centered composition.";

async function refinePrompt(description) {
  const { url, headers } = await genaiRequest(TEXT_MODEL, "generateContent");
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: REFINE_PROMPT.replace("{description}", description) },
          ],
        },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  if (!resp.ok)
    throw new Error(
      `Vertex AI refine failed (${resp.status}): ${await resp.text()}`,
    );
  const data = await resp.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text)
    throw new Error(
      `Vertex AI refine returned no text (finishReason=${cand?.finishReason ?? "unknown"})`,
    );
  return text.trim().replace(/^"|"$/g, "");
}

async function generateWithRetry(contents) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { url, headers } = await genaiRequest(
        IMAGE_MODEL,
        "generateContent",
      );
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { imageSize: "1K" },
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
        throw new Error(
          "No image in Gemini response - may have returned text only",
        );
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

// Detect mime from file extension for inline image parts.
const imgMime = (p) =>
  /\.jpe?g(\?|$)/i.test(p)
    ? "image/jpeg"
    : /\.webp(\?|$)/i.test(p)
      ? "image/webp"
      : "image/png";

// Resolve a reference image (local path OR http(s) URL) to an inlineData part.
// Lets a job brief that cites a "sample of similar product" link be followed
// directly. Returns null on empty input; throws on fetch/read failure.
async function loadRefImage(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) {
    const resp = await fetch(src);
    if (!resp.ok)
      throw new Error(`reference image fetch failed (${resp.status}): ${src}`);
    const ct = resp.headers.get("content-type") || "";
    const mimeType = /image\/(jpeg|png|webp)/.exec(ct)?.[0] || imgMime(src);
    const data = Buffer.from(await resp.arrayBuffer()).toString("base64");
    ok(`reference image fetched (${mimeType}) from ${src}`);
    return { mimeType, data };
  }
  if (!existsSync(src)) throw new Error(`reference image not found: ${src}`);
  return { mimeType: imgMime(src), data: readFileSync(src).toString("base64") };
}

// Generate 4 consistent views via multi-turn history. Returns [{name, buf}].
// refPart (optional {mimeType,data}) seeds view 1 as a *design reference*: the
// generator keeps the product type/structure but applies the modifications.
async function generateViews(description, refPart) {
  const images = [];
  const history = [];
  for (let i = 0; i < VIEWS.length; i++) {
    const view = VIEWS[i];
    const prompt =
      i === 0 ? buildInitialPrompt(description) : buildFollowupPrompt(view);
    const parts = [{ text: prompt }];
    if (i === 0 && refPart) {
      parts.push({
        text:
          "A reference photo of a similar existing product is attached. Use it " +
          "as a design cue for the overall product type, structure, and " +
          "proportions, but apply the modifications described above to create a " +
          "new, distinct form. Do not copy any text, logos, or branding.",
      });
      parts.push({ inlineData: refPart });
    }
    history.push({ role: "user", parts });
    const { imageData, thoughtSignature } = await generateWithRetry(history);
    const modelPart = {
      inlineData: { mimeType: "image/png", data: imageData },
    };
    if (thoughtSignature) modelPart.thoughtSignature = thoughtSignature;
    history.push({ role: "model", parts: [modelPart] });
    images.push({
      name: `${view.replace(/\s+/g, "-")}.png`,
      buf: Buffer.from(imageData, "base64"),
    });
    ok(`view ${i + 1}/4: ${view}`);
  }
  return images;
}

// ---- Meshy ----------------------------------------------------------------
const HUMANOID_KEYWORDS = new Set([
  "human",
  "person",
  "people",
  "man",
  "woman",
  "boy",
  "girl",
  "child",
  "character",
  "humanoid",
  "warrior",
  "knight",
  "soldier",
  "wizard",
  "robot",
  "android",
  "cyborg",
  "figure",
  "avatar",
  "npc",
  "hero",
  "villain",
  "zombie",
  "skeleton",
  "elf",
  "dwarf",
  "orc",
  "dancer",
  "athlete",
  "ninja",
  "samurai",
  "pirate",
  "astronaut",
]);

function resolvePose(description) {
  const words = new Set(description.toLowerCase().split(/\s+/));
  for (const kw of HUMANOID_KEYWORDS) if (words.has(kw)) return "a-pose";
  return "";
}

async function createMeshyTask(imageBuffers, description, formats) {
  const imageUrls = imageBuffers.map(
    (b) => `data:image/png;base64,${b.toString("base64")}`,
  );
  const payload = {
    image_urls: imageUrls,
    ai_model: "meshy-6",
    target_formats: formats,
    target_polycount: 30000,
    topology: "triangle",
    enable_pbr: true,
    should_texture: true,
    image_enhancement: false,
    pose_mode: resolvePose(description),
  };
  const resp = await fetch(`${MESHY_BASE}/openapi/v1/multi-image-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok)
    throw new Error(
      `Meshy create task failed (${resp.status}): ${await resp.text()}`,
    );
  const result = (await resp.json()).result;
  if (!result)
    throw new Error(
      "Meshy create task returned no task id (unexpected response shape)",
    );
  return result;
}

async function pollMeshyTask(taskId) {
  const resp = await fetch(
    `${MESHY_BASE}/openapi/v1/multi-image-to-3d/${taskId}`,
    {
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    },
  );
  if (!resp.ok)
    throw new Error(`Meshy poll failed (${resp.status}): ${await resp.text()}`);
  const d = await resp.json();
  return {
    status: d.status || "UNKNOWN",
    progress: d.progress || 0,
    model_urls: d.model_urls || {},
    error: d.task_error?.message || "",
  };
}

async function waitForMeshy(taskId) {
  const start = Date.now();
  for (;;) {
    const r = await pollMeshyTask(taskId);
    process.stdout.write(
      `\r  [${String(r.progress).padStart(3)}%] ${r.status}            `,
    );
    if (r.status === "SUCCEEDED") {
      process.stdout.write("\n");
      return r;
    }
    if (r.status === "FAILED" || r.status === "CANCELED") {
      process.stdout.write("\n");
      die(`Meshy task ${r.status}: ${r.error}`);
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      process.stdout.write("\n");
      die(`Meshy timeout (last: ${r.status})`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function download(url, dest) {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`download failed (${resp.status}) for ${dest}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

// ---- main -----------------------------------------------------------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.prompt) {
    printHelp();
    die("prompt required");
  }
  if (!resolveProject())
    die(
      "No GCP project: set GOOGLE_CLOUD_PROJECT or provide a service account (its project_id is used)",
    );
  // Meshy key: env first, else 1Password.
  if (!MESHY_API_KEY) {
    MESHY_API_KEY = opRead(MESHY_OP_REF);
    if (MESHY_API_KEY)
      ok(`MESHY_API_KEY loaded from 1Password (${MESHY_OP_REF})`);
  }
  if (!MESHY_API_KEY)
    die(
      `MESHY_API_KEY not set and not readable from 1Password (${MESHY_OP_REF}). Set MESHY_API_KEY, or sign in: op signin`,
    );
  if (o.jobfile && !existsSync(o.jobfile))
    die(`job file not found: ${o.jobfile}`);
  // Resolve the reference image up-front (local path or http(s) URL).
  let refPart = null;
  if (o.refImage) {
    try {
      refPart = await loadRefImage(o.refImage);
    } catch (e) {
      die(String(e.message || e));
    }
  }

  // formats: always include glb
  const formats = Array.from(new Set(["glb", ...o.formats]));

  // 1. refine (optional)
  let prompt = o.prompt;
  if (!o.noRefine) {
    say("Refining prompt (Vertex AI)");
    prompt = await refinePrompt(o.prompt);
    ok(`refined: ${prompt}`);
  } else {
    say("Skipping refine (-n)");
  }

  // 2. generate 4 views
  say(
    `Generating 4 reference views (Vertex AI)${o.refImage ? ` — seeded by ${o.refImage}` : ""}`,
  );
  const images = await generateViews(prompt, refPart);

  // 3. Meshy: submit + poll
  say(`Submitting to Meshy (formats: ${formats.join(",")})`);
  const taskId = await createMeshyTask(
    images.map((i) => i.buf),
    prompt,
    formats,
  );
  ok(`task ${taskId}`);
  say("Generating 3D model (Meshy)");
  const result = await waitForMeshy(taskId);
  ok("model complete");

  // 4. write output
  const outDir = join(o.outBase, taskId);
  await mkdir(outDir, { recursive: true });

  for (const img of images) {
    await writeFile(join(outDir, img.name), img.buf);
    ok(`${img.name} (${img.buf.length} bytes)`);
  }

  for (const fmt of formats) {
    const url = result.model_urls[fmt];
    if (!url) {
      console.error(`  ! no ${fmt} url in Meshy result`);
      continue;
    }
    const bytes = await download(url, join(outDir, `model.${fmt}`));
    ok(`model.${fmt} (${bytes} bytes)`);
  }

  const meta =
    `Generated: ${new Date().toISOString()}\n` +
    `Task: ${taskId}\n` +
    `Provider: meshy\n` +
    `Formats: ${formats.join(",")}\n` +
    (o.notes ? `Constraints: ${o.notes}\n` : "") +
    `\nPrompt:\n${prompt}\n` +
    (o.jobfile ? `\nOriginal job: job.txt\n` : "");
  await writeFile(join(outDir, "prompt.txt"), meta);
  if (o.jobfile) await copyFile(o.jobfile, join(outDir, "job.txt"));

  ok(`done — ${outDir}`);

  // 5. publish to the public Vercel viewer (automatic; disable with -P).
  // Non-fatal: the model is already generated + saved, so a deploy hiccup must
  // not fail the run — warn and leave the assets in outDir.
  if (o.publish) {
    const here = dirname(fileURLToPath(import.meta.url));
    say("Publishing to Vercel viewer");
    const r = spawnSync(
      process.execPath,
      [join(here, "publish.mjs"), taskId, "-o", o.outBase],
      { stdio: "inherit" },
    );
    if (r.status !== 0) {
      console.error(
        `${C.red}  ! publish failed — assets are saved in ${outDir}; deploy manually with: node publish.mjs ${taskId}${C.off}`,
      );
    }
  }
}

main().catch((e) => die(e.message || String(e)));
