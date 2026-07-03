#!/usr/bin/env node
/**
 * build-assets.mjs — bundle a 2D art-asset library into the static viewer and
 * deploy to Vercel. This is the "assets" category writer for the Studio portal
 * (the 4th writer alongside publish.mjs -> gallery, deploy-vercel.sh -> games).
 *
 * Reads a source dir of sprite packs (e.g. unity/Assets), where each top-level
 * subdir is one pack. Copies every web-viewable image (png/gif/jpg/webp) under
 * viewer/assets/<pack-slug>/… preserving sub-structure, skips non-viewable /
 * junk files (.DS_Store, *.meta, *.psd, *.ase, *.aseprite, *.zip, *.pdf), then
 * writes:
 *   viewer/assets/<pack-slug>/manifest.json   per-pack: { id,title,count,cover,items[] }
 *   viewer/assets/manifest.json               top level: [ { id,title,count,cover,category } ]
 * and runs `vercel deploy --prod`. Idempotent: re-running refreshes everything.
 *
 * Usage:
 *   node build-assets.mjs <sourceDir> [-n] [-c "junk.png,other"]
 *     -n   bundle + manifests only, skip the vercel deploy
 *
 * First-time setup (one time, inside viewer/):  vercel login && vercel link
 * Requires: Node 18+, and (for deploy) the `vercel` CLI (or npx) on PATH.
 */
import { mkdir, copyFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, basename, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = join(HERE, "viewer");
// The portal organizes content by category, one dir per category under viewer/.
// This writer owns the "assets" category; its on-disk dir is assets/.
const ASSETS_DIR = process.env.PORTAL_ASSETS_DIR || "assets";
const ASSETS = join(VIEWER, ASSETS_DIR);

// Web-viewable raster formats. Everything else (source art, archives, Unity
// .meta sidecars, OS junk) is skipped — a browser gallery only shows these.
const VIEWABLE = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp", ".avif"]);

const c = { cyan: "\x1b[0;36m", green: "\x1b[0;32m", red: "\x1b[0;31m", off: "\x1b[0m" };
const say = (s) => console.log(`${c.cyan}==>${c.off} ${s}`);
const ok = (s) => console.log(`${c.green}  ✓ ${s}${c.off}`);
const die = (s) => { console.error(`${c.red}error: ${s}${c.off}`); process.exit(1); };

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Title-case a pack dir name for display (keep existing capitalization words).
const titleOf = (s) => s.replace(/[_-]+/g, " ").trim();

function parseArgs(argv) {
  const o = { src: "", deploy: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") o.deploy = false;
    else if (!o.src) o.src = a;
  }
  return o;
}

// Recursively collect viewable images under `dir`, returned as paths relative
// to `dir` (POSIX-separated for URLs).
async function walkImages(dir, base = dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // .DS_Store and dotfiles
    const abs = join(dir, e.name);
    if (e.isDirectory()) await walkImages(abs, base, out);
    else if (VIEWABLE.has(extname(e.name).toLowerCase()))
      out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

// Pick a cover image: prefer something that looks like a preview/portrait,
// else the shortest-path (usually top-level) image, else the first.
function pickCover(rels) {
  const pref = rels.find((r) => /(preview|portrait|cover|logo|hero)/i.test(r));
  if (pref) return pref;
  return [...rels].sort((a, b) =>
    a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
}

// Resolve a Vercel API token (env, else 1Password) so a recipient can deploy
// without an interactive `vercel login`. Empty falls back to local session.
function resolveVercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN.trim();
  const ref = process.env.VERCEL_OP_REF || "op://Shared AI/vercel-token/credential";
  const r = spawnSync("op", ["read", ref], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return r.status === 0 ? r.stdout.trim() : "";
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.src) die("usage: node build-assets.mjs <sourceDir> [-n]");
  if (!existsSync(o.src)) die(`source dir not found: ${o.src}`);

  // Fresh rebuild: wipe the category dir so removed source packs don't linger.
  await rm(ASSETS, { recursive: true, force: true });
  await mkdir(ASSETS, { recursive: true });

  const topDirs = (await readdir(o.src, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();

  const manifest = [];
  let totalFiles = 0;

  for (const pack of topDirs) {
    const packSrc = join(o.src, pack);
    const rels = await walkImages(packSrc);
    if (!rels.length) continue; // skip packs with no viewable art

    const id = slug(pack);
    const packDest = join(ASSETS, id);
    say(`Bundling ${pack} (${rels.length} images)`);
    for (const rel of rels) {
      const dst = join(packDest, rel);
      await mkdir(dirname(dst), { recursive: true });
      await copyFile(join(packSrc, rel), dst);
    }
    totalFiles += rels.length;

    // items grouped by their immediate subfolder (for section headers in the UI).
    const items = rels
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({
        path,
        name: basename(path, extname(path)),
        group: path.includes("/") ? dirname(path) : "",
      }));
    const cover = pickCover(rels);

    await writeFile(
      join(packDest, "manifest.json"),
      JSON.stringify({ id, title: titleOf(pack), category: "assets", count: items.length, cover, items }, null, 2),
    );
    ok(`${pack} → assets/${id}/ (${items.length} images)`);
    manifest.push({ id, title: titleOf(pack), category: "assets", count: items.length, cover });
  }

  manifest.sort((a, b) => b.count - a.count);
  await writeFile(join(ASSETS, "manifest.json"), JSON.stringify(manifest, null, 2));
  ok(`manifest: ${manifest.length} pack(s), ${totalFiles} images total`);

  if (!o.deploy) { ok("skipped deploy (-n) — bundled locally"); return; }
  if (!existsSync(join(VIEWER, ".vercel", "project.json")))
    die("viewer/.vercel/project.json missing — not linked to a Vercel project");

  const vercel =
    spawnSync("vercel", ["--version"], { stdio: "ignore" }).status === 0
      ? ["vercel"] : ["npx", "--yes", "vercel"];
  const [bin, ...pre] = vercel;
  const token = resolveVercelToken();
  const tokenArgs = token ? ["--token", token] : [];
  if (token) ok("using Vercel token (env/1Password)");
  else if (!process.env.VERCEL_TOKEN) say("no token resolved — relying on local `vercel login`");

  say(`Deploying to Vercel (${bin === "npx" ? "via npx" : "vercel"})`);
  const r = spawnSync(bin, [...pre, "deploy", "--prod", "--yes", ...tokenArgs], { cwd: VIEWER, encoding: "utf8" });
  if (r.status !== 0) die(`vercel deploy failed:\n${r.stderr || r.stdout}`);
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const matches = out.match(/https?:\/\/[^\s"'`]*\.vercel\.app[^\s"'`]*/g);
  const url = matches ? matches[matches.length - 1] : "";
  if (!url) die(`vercel deploy: no URL found in output:\n${out}`);
  ok(`deployed: ${url}`);
  console.log(`${c.green}  ✓ public link: ${url}/?cat=assets${c.off}`);
}

main().catch((e) => die(e?.stack || String(e)));
