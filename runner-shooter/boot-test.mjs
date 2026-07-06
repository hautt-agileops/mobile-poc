// Headless boot test: serve the prototype, load it in Chrome, capture console
// errors, verify the simulation actually advances (distance + HUD), screenshot.
// Reuses the puppeteer-core installed under the unity-poc skill scripts.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
const CHROME = process.env.CHROME_BIN ||
  "/Users/hau/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const PORT = 8177;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = join(ROOT, p);
    if (!existsSync(file)) { res.writeHead(404); res.end("nf"); return; }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

await new Promise((r) => server.listen(PORT, r));

const { default: puppeteer } = await import(
  "../.claude/skills/unity-poc/scripts/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"
);

const errors = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); // iPhone-ish
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle0", timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500)); // let the run advance

const state = await page.evaluate(() => ({
  hasGame: !!window.GAME,
  distance: window.GAME?.distance ?? -1,
  count: window.GAME?.squad?.count ?? -1,
  enemies: window.GAME?.enemies?.activeCount ?? -1,
  bullets: window.GAME?.bullets?.activeCount ?? -1,
  props: window.GAME?.props?.length ?? -1,
  hud: document.getElementById("dist")?.textContent,
}));

await page.screenshot({ path: join(ROOT, "boot-shot.png") });
await browser.close();
server.close();

console.log("state:", JSON.stringify(state));
console.log("console errors:", errors.length ? errors : "none");
const ok = state.hasGame && state.distance > 5 && state.bullets > 0 && errors.length === 0;
console.log(ok ? "BOOT OK ✓" : "BOOT FAIL ✗");
process.exit(ok ? 0 : 1);
