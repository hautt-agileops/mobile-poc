// Gameplay screenshot harness for the VISUAL-REVIEW gate (unity-poc step 10b): boots the
// game, drives a short real play session, and captures frames for the orchestrator to
// vision-review BEFORE deploy. The boot test proves the build RUNS; this proves it LOOKS
// right — broken alpha, invisible UI, and mis-scaled sprites all shipped past boot tests
// before this existed.
//
// Coords are game-specific — pass a config JSON (author it in the gameplay phase):
//   { "bootWaitMs": 22000,
//     "start": [640, 470],                      // button click to begin a run (px @1280x720)
//     "shots": [[520,330,700],[780,320,750]],   // [x, y, holdMs] play inputs (hold->release)
//     "captures": { "menu": true, "early": 2500, "aiming": [700,330,450] } }
// Defaults below fit a center-start button + combat-zone clicks; override per game.
//
// Usage: node gameplay-shots.mjs <url> <outPrefix> [configPath]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const URL = process.argv[2] || 'http://localhost:8123';
const PREFIX = process.argv[3] || './_gameplay';
const CFG = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : {};

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1280, H = 720;
const BOOT = CFG.bootWaitMs ?? 22000;
const START = CFG.start ?? [W / 2, H / 2 + 110];
const SHOTS = CFG.shots ?? [[520, 330, 700], [780, 320, 750], [640, 340, 300], [430, 350, 800], [860, 335, 700]];
const AIM = CFG.captures?.aiming ?? [700, 330, 450];
const EARLY = CFG.captures?.early ?? 2500;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox', '--mute-audio',
    '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    `--window-size=${W},${H}`,
  ],
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(BOOT);

  await page.screenshot({ path: `${PREFIX}.1-menu.png` });

  await page.mouse.click(START[0], START[1]);
  await sleep(EARLY);
  await page.screenshot({ path: `${PREFIX}.2-earlyfight.png` });

  for (const [x, y, hold] of SHOTS) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await sleep(hold);
    await page.mouse.up();
    await sleep(280); // FX peak
  }
  await page.screenshot({ path: `${PREFIX}.3-midfight.png` });

  await page.mouse.move(AIM[0], AIM[1]);
  await page.mouse.down();
  await sleep(AIM[2]);
  await page.screenshot({ path: `${PREFIX}.4-aiming.png` });
  await page.mouse.up();

  // phone-viewport sanity: portal links get opened on phones — catch unreadable HUD /
  // letterboxing / clipped UI. Unity WebGL can re-splash on a viewport reflow, so give it
  // a long settle and retry once if the frame comes back near-black (splash).
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(5000);
  await page.screenshot({ path: `${PREFIX}.5-mobile.png` });
  const { readFileSync: rf } = await import('fs');
  // crude splash check: tiny file = mostly-flat dark frame
  if (rf(`${PREFIX}.5-mobile.png`).length < 15000) {
    await sleep(8000);
    await page.screenshot({ path: `${PREFIX}.5-mobile.png` });
  }

  console.log(`gameplay shots written: ${PREFIX}.{1-menu,2-earlyfight,3-midfight,4-aiming,5-mobile}.png`);
} finally {
  await browser.close();
}
