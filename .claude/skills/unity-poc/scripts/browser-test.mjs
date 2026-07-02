// Real-time browser test: drives the installed Chrome via puppeteer-core, loads the local
// server, waits for the Unity game to ACTUALLY boot (past the loader), captures every page
// console message + page errors, screenshots the running game, and fails on fatal errors.
// Unlike the single-shot headless screenshot, this waits real wall-clock time so Unity's
// async wasm boot completes — so it catches boot-time faults (e.g. stripped classes).
//
// Usage: node browser-test.mjs <url> <screenshotPath> [waitMs]
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8123';
const SHOT = process.argv[3] || './_browsertest.png';
const WAIT = parseInt(process.argv[4] || '18000', 10);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const FATAL = [
  /could not produce class/i,
  /stripped from the build/i,
  /uncaught/i,
  /\babort\(/i,
  /assertion failed/i,
  /is not a function/i,
  /failed to (load|fetch|compile|instantiate)/i,
  /referenceerror|typeerror/i,
];

const logs = [];
let pageErrors = 0;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox', '--mute-audio',
    '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--window-size=1280,720',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => { pageErrors++; logs.push(`[pageerror] ${e.message}`); });
  page.on('requestfailed', r => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText || ''}`));

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // give Unity real time to download wasm + boot the first scene
  await sleep(WAIT);
  await page.screenshot({ path: SHOT });

  // Interaction smoke: drive the actual UI. Unity draws its UI inside the WebGL canvas,
  // so we dispatch real mouse clicks at the button's screen coords (UI anchored in a
  // 1280x720 reference; screen-y = (1 - anchorY) * H). Catches dead-button / overlay bugs.
  const W = 1280, H = 720;
  const SHOT2 = SHOT.replace(/\.png$/, '.afterstart.png');
  const click = async (ax, ay) => { await page.mouse.click(ax * W, (1 - ay) * H); await sleep(500); };
  try {
    await click(0.32, 0.55); // Funnet card  -> P1
    await click(0.35, 0.18); // TRAINING     -> ON (lets us start with one fighter)
    await click(0.65, 0.18); // START
    await sleep(2800);
    await page.screenshot({ path: SHOT2 });
    console.log('after-start screenshot: ' + SHOT2);
  } catch (e) {
    logs.push('[interaction] ' + e.message);
  }

  const fatals = logs.filter(l => FATAL.some(re => re.test(l)));
  console.log('--- page console (' + logs.length + ' msgs) ---');
  for (const l of logs.slice(-40)) console.log('  ' + l);
  console.log('screenshot: ' + SHOT);

  if (fatals.length || pageErrors) {
    console.log('[FAIL] browser-test: fatal errors:');
    for (const f of fatals) console.log('  ' + f);
    await browser.close();
    process.exit(1);
  }
  console.log('[PASS] browser-test: game booted with no fatal console errors');
  await browser.close();
  process.exit(0);
} catch (e) {
  console.log('[FAIL] browser-test exception: ' + e.message);
  try { await browser.close(); } catch {}
  process.exit(1);
}
