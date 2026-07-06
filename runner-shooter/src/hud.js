// HUD — thin DOM overlay (no per-frame allocation beyond text). The game calls
// stats() every step; flash() on a gate; levelComplete()/win()/gameOver() once.
let els = null;
let fpsT = 0, fpsN = 0, fpsLast = performance.now(), flashUntil = 0;

function grab() {
  if (els) return els;
  els = {
    count: document.getElementById("count"),
    dist: document.getElementById("dist"),
    level: document.getElementById("level"),
    prog: document.getElementById("prog-fill"),
    diag: document.getElementById("diag"),
    flash: document.getElementById("flash"),
    over: document.getElementById("over"),
    overText: document.getElementById("over-text"),
    levelup: document.getElementById("levelup"),
    levelupText: document.getElementById("levelup-text"),
    win: document.getElementById("win"),
    winText: document.getElementById("win-text"),
  };
  return els;
}

export function stats({ count, distance, level, levelName, prog, boss, enemies, bullets }) {
  const e = grab();
  e.count.textContent = count;
  e.dist.textContent = `${Math.floor(distance)} m`;
  e.level.textContent = boss ? `BOSS · ${levelName}` : `Lv${level} · ${levelName}`;
  e.level.style.color = boss ? "#ff8a80" : "#cbd5e6";
  e.prog.style.width = `${Math.round((boss ? 1 : prog) * 100)}%`;
  e.prog.style.background = boss ? "#ff5a4d" : "#4da3ff";
  const now = performance.now();
  fpsN++;
  if (now - fpsLast >= 500) { fpsT = Math.round((fpsN * 1000) / (now - fpsLast)); fpsN = 0; fpsLast = now; }
  e.diag.textContent = `${fpsT} fps · ${enemies} enemies · ${bullets} bullets`;
  if (flashUntil && now > flashUntil) { e.flash.style.opacity = "0"; flashUntil = 0; }
}

export function flash(msg, good) {
  const e = grab();
  e.flash.textContent = msg;
  e.flash.style.color = good ? "#8dffb0" : "#ff9a94";
  e.flash.style.opacity = "1";
  flashUntil = performance.now() + 1300;
}

export function levelComplete(clearedLevel, nextName, count) {
  const e = grab();
  e.levelupText.textContent = `Level ${clearedLevel} cleared — ${count} soldiers survive. Next: ${nextName}.`;
  e.levelup.style.display = "flex";
}

export function win(distance) {
  const e = grab();
  e.winText.textContent = `All levels cleared — ${distance} m. You broke the frontline.`;
  e.win.style.display = "flex";
}

export function gameOver(distance, level) {
  const e = grab();
  e.overText.textContent = `Reached Level ${level} · ${distance} m.`;
  e.over.style.display = "flex";
}

export function hideOverlays() {
  const e = grab();
  e.levelup.style.display = "none";
  e.over.style.display = "none";
  e.win.style.display = "none";
}
