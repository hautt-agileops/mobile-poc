import GUI from "lil-gui";
import { CONFIG } from "./config.js";

// tuning.js — builds a live lil-gui panel straight off CONFIG so every gameplay
// value is adjustable at runtime without a rebuild (the brief's "tuning/config
// system"). Because all systems read CONFIG by reference each step, edits apply
// immediately. Ranges are heuristics; the point is discoverability.
const RANGES = {
  runSpeed: [4, 40], fireInterval: [0.03, 0.6], bulletSpeed: [15, 90],
  damage: [1, 20], speed: [2, 24], contactDps: [0, 40], baseHp: [1, 40],
  strength: [0, 60], radius: [0.2, 3], budgetBase: [0, 40], budgetSlope: [0, 0.5],
  burstInterval: [6, 60], gateInterval: [10, 80], barrelInterval: [6, 60],
  start: [1, 200], hp: [1, 80], rewardBase: [1, 40],
};

export function buildTuning(onReset) {
  if (!CONFIG.debug.showTuning) return null;
  const gui = new GUI({ title: "Tuning" });
  gui.close(); // collapsed by default so it doesn't cover the phone screen

  const addGroup = (name, obj) => {
    const f = gui.addFolder(name);
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v !== "number") continue;
      const r = RANGES[key];
      if (r) f.add(obj, key, r[0], r[1]);
      else f.add(obj, key);
    }
    f.close();
  };
  addGroup("world", CONFIG.world);
  addGroup("squad", CONFIG.squad);
  addGroup("weapon", CONFIG.weapon);
  addGroup("enemy", CONFIG.enemy);
  addGroup("separation", CONFIG.separation);
  addGroup("spawn", CONFIG.spawn);
  addGroup("gate", CONFIG.gate);
  addGroup("barrel", CONFIG.barrel);
  gui.add({ restart: () => onReset?.() }, "restart").name("↻ Restart run");
  return gui;
}
