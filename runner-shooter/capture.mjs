import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME = "/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png" };
const s = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = join(process.cwd(), p);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" }); res.end(await readFile(f));
});
await new Promise((r) => s.listen(8179, r));
const { default: P } = await import("../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const b = await P.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"] });
const pg = await b.newPage();
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await pg.goto("http://localhost:8179/", { waitUntil: "networkidle0" });
// wait until a wave is actually on screen (enemies present), up to ~20s
const deadline = Date.now() + 20000;
while (Date.now() < deadline) {
  const e = await pg.evaluate(() => window.GAME?.enemies?.activeCount ?? 0);
  if (e >= 5) break;
  await new Promise((r) => setTimeout(r, 250));
}
const st = await pg.evaluate(() => ({ d: Math.floor(window.GAME.distance), e: window.GAME.enemies.activeCount, p: window.GAME.props.length }));
await pg.screenshot({ path: "models-shot.png" });
await b.close(); s.close();
console.log("captured at", JSON.stringify(st));
