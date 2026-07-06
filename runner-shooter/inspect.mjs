import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME = "/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json", ".wasm": "application/wasm" };
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
await pg.setViewport({ width: 720, height: 720, deviceScaleFactor: 2 });
await pg.goto("http://localhost:8179/", { waitUntil: "networkidle0" });
// wait for a wave so an enemy is near the squad
const deadline = Date.now() + 20000;
while (Date.now() < deadline) { if (await pg.evaluate(() => (window.GAME?.enemies?.activeCount ?? 0) >= 3)) break; await new Promise((r) => setTimeout(r, 200)); }
// freeze + drop the camera close behind the squad, 3/4 angle, render once
await pg.evaluate(() => {
  const g = window.GAME; g.loop.stop();
  const z = g.squad.z;
  g.camera.position.set(2.6, 2.1, z - 4.2);
  g.camera.lookAt(g.squad.centroidX, 0.6, z + 0.5);
  g.renderer.render(g.scene, g.camera);
});
await pg.screenshot({ path: "inspect-shot.png" });
await b.close(); s.close();
console.log("inspect captured");
