import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
const CHROME = "/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
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
const errs = [];
pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
pg.on("pageerror", (e) => errs.push("pageerror:" + e.message));
await pg.goto("http://localhost:8179/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

const seq = [];
const snap = async (tag) => {
  const st = await pg.evaluate(() => ({ state: window.GAME.state, level: window.GAME.level, boss: !!window.GAME.boss,
    lvUp: getComputedStyle(document.getElementById("levelup")).display, win: getComputedStyle(document.getElementById("win")).display }));
  seq.push([tag, st]);
};
await snap("boot");
// level 1 boss
await pg.evaluate(() => window.GAME._enterBoss()); await snap("L1 boss");
await pg.screenshot({ path: "boss-shot.png" });
await pg.evaluate(() => window.GAME.onBossDead()); await snap("L1 cleared");
await pg.screenshot({ path: "levelup-shot.png" });
await pg.evaluate(() => window.GAME.nextLevel()); await snap("→L2");
// level 2 boss
await pg.evaluate(() => window.GAME._enterBoss()); await pg.evaluate(() => window.GAME.onBossDead());
await pg.evaluate(() => window.GAME.nextLevel()); await snap("→L3");
// level 3 boss → win
await pg.evaluate(() => window.GAME._enterBoss()); await pg.evaluate(() => window.GAME.onBossDead()); await snap("L3 → win");
await pg.screenshot({ path: "win-shot.png" });

await b.close(); s.close();
for (const [t, st] of seq) console.log(t, JSON.stringify(st));
console.log("errors:", errs.length ? errs : "none");
const last = seq[seq.length - 1][1];
console.log(last.state === "win" && last.win !== "none" && !errs.length ? "LEVELS OK ✓" : "LEVELS FAIL ✗");
