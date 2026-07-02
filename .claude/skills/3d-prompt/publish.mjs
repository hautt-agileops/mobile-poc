#!/usr/bin/env node
/**
 * publish.mjs — bundle a finished 3D model into the static viewer and deploy to Vercel.
 *
 * Reads an output dir produced by pipeline.mjs (output/<id>/ with model.glb +
 * view PNGs + prompt.txt), copies it under viewer/models/<id>/, rebuilds
 * viewer/models/manifest.json from every published id, then runs
 * `vercel deploy --prod`. Idempotent: re-running for an id just refreshes it.
 *
 * Usage:
 *   node publish.mjs <id> [-o OUTBASE] [-n]
 *     -o OUTBASE   output base dir (default ./output); may also be the id dir itself
 *     -n           bundle + manifest only, skip the vercel deploy
 *
 * First-time setup (one time, inside viewer/):
 *   vercel login && vercel link
 *
 * Requires: Node 18+, and (for deploy) the `vercel` CLI on PATH.
 */
import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  readdir,
  access,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = join(HERE, "viewer");
// The portal organizes content by category, one dir per category under viewer/:
//   gallery -> models/   (this skill — 3D models)
//   games   -> games/    (the unity-poc skill — WebGL builds)
// This skill publishes the "gallery" category; its on-disk dir is models/ (override with
// PORTAL_GALLERY_DIR if ever renamed). Each category is just <category>/{manifest.json, …}.
const GALLERY_DIR = process.env.PORTAL_GALLERY_DIR || "models";
const MODELS = join(VIEWER, GALLERY_DIR);

const c = {
  cyan: "\x1b[0;36m",
  green: "\x1b[0;32m",
  red: "\x1b[0;31m",
  off: "\x1b[0m",
};
const say = (s) => console.log(`${c.cyan}==>${c.off} ${s}`);
const ok = (s) => console.log(`${c.green}  ✓ ${s}${c.off}`);
const die = (s) => {
  console.error(`${c.red}error: ${s}${c.off}`);
  process.exit(1);
};

function parseArgs(argv) {
  const o = { id: "", outBase: "output", deploy: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o") o.outBase = argv[++i] || "output";
    else if (a === "-n") o.deploy = false;
    else if (!o.id) o.id = a;
  }
  return o;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Resolve a Vercel API token so a recipient can deploy to the owner's project
// without `vercel login`: env first, else pulled from 1Password at runtime
// (key never lands on disk). Empty string falls back to any local login session.
function resolveVercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN.trim();
  const ref =
    process.env.VERCEL_OP_REF || "op://Shared AI/vercel-token/credential";
  const r = spawnSync("op", ["read", ref], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return r.status === 0 ? r.stdout.trim() : "";
}

// Extract the prompt body: everything after the "Prompt:" marker, minus the
// trailing "Original job:" note, with leading/trailing blank lines trimmed.
function parsePromptTxt(txt) {
  const field = (re) => (txt.match(re)?.[1] ?? "").trim();
  const created = field(/^Generated:[ \t]*(.+)$/m);
  const provider = field(/^Provider:[ \t]*(.+)$/m);
  let prompt = "";
  const lines = txt.split("\n");
  const start = lines.findIndex((l) => /^Prompt:/.test(l));
  if (start !== -1) {
    let body = lines.slice(start + 1).filter((l) => !/^Original job:/.test(l));
    while (body.length && body[0].trim() === "") body.shift();
    while (body.length && body[body.length - 1].trim() === "") body.pop();
    prompt = body.join("\n");
  }
  return { created, provider, prompt, title: prompt.split("\n")[0] || "" };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.id) die("usage: node publish.mjs <id> [-o OUTBASE] [-n]");

  // outBase may be the id dir itself or its parent.
  let src = o.outBase;
  if (!existsSync(join(src, "model.glb"))) src = join(o.outBase, o.id);
  if (!existsSync(join(src, "model.glb")))
    die(`model.glb not found under ${src}`);

  // 1. Copy assets
  const dest = join(MODELS, o.id);
  await mkdir(dest, { recursive: true });
  say(`Bundling ${o.id}`);
  const files = (await readdir(src)).filter(
    (f) => /^model\./.test(f) || f.endsWith(".png"),
  );
  for (const f of files) await copyFile(join(src, f), join(dest, f));
  ok(`copied ${files.length} files → viewer/models/${o.id}/`);

  // 2. Parse prompt.txt (best-effort)
  let meta = { title: o.id, prompt: "", provider: "", created: "" };
  if (await exists(join(src, "prompt.txt"))) {
    const parsed = parsePromptTxt(
      await readFile(join(src, "prompt.txt"), "utf8"),
    );
    meta = {
      title: parsed.title || o.id,
      prompt: parsed.prompt,
      provider: parsed.provider,
      created: parsed.created,
    };
  }

  // formats = extensions of any model.* files present
  const formats = files
    .filter((f) => /^model\./.test(f))
    .map((f) => f.replace(/^model\./, ""));
  const thumb = existsSync(join(dest, "front.png")) ? "front.png" : "";

  // 3. Write per-id meta + rebuild manifest from every models/<id>/meta.json
  await writeFile(
    join(dest, "meta.json"),
    JSON.stringify(
      { id: o.id, category: "gallery", ...meta, thumb, formats: formats.length ? formats : ["glb"] },
      null,
      2,
    ),
  );

  const ids = await readdir(MODELS, { withFileTypes: true });
  const manifest = [];
  for (const d of ids) {
    if (!d.isDirectory()) continue;
    const mp = join(MODELS, d.name, "meta.json");
    if (await exists(mp)) manifest.push(JSON.parse(await readFile(mp, "utf8")));
  }
  manifest.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  await writeFile(
    join(MODELS, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  ok(`manifest: ${manifest.length} model(s)`);

  // 4. Deploy
  if (!o.deploy) {
    ok("skipped deploy (-n) — bundled locally");
    return;
  }
  if (!existsSync(join(VIEWER, ".vercel", "project.json")))
    die(`viewer/.vercel/project.json missing — not linked to a Vercel project`);

  // Prefer an installed `vercel`; otherwise run it via `npx` — no global install
  // needed (Node ships npx). Recipients only need Node on PATH.
  const vercel =
    spawnSync("vercel", ["--version"], { stdio: "ignore" }).status === 0
      ? ["vercel"]
      : ["npx", "--yes", "vercel"];
  const [bin, ...pre] = vercel;

  const token = resolveVercelToken();
  const tokenArgs = token ? ["--token", token] : [];
  if (token) ok("using Vercel token (env/1Password)");
  else if (!process.env.VERCEL_TOKEN)
    say("no token resolved — relying on local `vercel login` session");

  say(`Deploying to Vercel (${bin === "npx" ? "via npx" : "vercel"})`);
  const r = spawnSync(
    bin,
    [...pre, "deploy", "--prod", "--yes", ...tokenArgs],
    { cwd: VIEWER, encoding: "utf8" },
  );
  if (r.status !== 0) die(`vercel deploy failed:\n${r.stderr || r.stdout}`);
  // Match the deployment URL anywhere in stdout/stderr — newer Vercel CLIs emit
  // structured output where the last line isn't the bare URL (don't use .pop()).
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const matches = out.match(/https?:\/\/[^\s"'`]*\.vercel\.app[^\s"'`]*/g);
  const url = matches ? matches[matches.length - 1] : "";
  if (!url) die(`vercel deploy: no URL found in output:\n${out}`);
  ok(`deployed: ${url}`);
  console.log(`${c.green}  ✓ public link: ${url}/?id=${o.id}${c.off}`);
}

main().catch((e) => die(e?.stack || String(e)));
