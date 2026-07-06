import { Game } from "./game.js";
import { buildTuning } from "./tuning.js";
import { loadModels } from "./core/models.js";

// Entry point: preload the 3D models (best-effort — nulls fall back to primitives),
// boot the game, wire the tuning panel's restart, expose the instance on window
// for console poking during tuning sessions.
const canvas = document.getElementById("game");
const models = await loadModels();
const game = new Game(canvas, models);
game.start();

buildTuning(() => location.reload());

document.getElementById("restart").addEventListener("click", () => location.reload());
document.getElementById("win-restart").addEventListener("click", () => location.reload());
document.getElementById("next").addEventListener("click", () => game.nextLevel());

window.GAME = game;
