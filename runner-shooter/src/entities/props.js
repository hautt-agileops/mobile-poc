import * as THREE from "three";
import { CONFIG } from "../config.js";
import { Label } from "../ui/label.js";

// Props = the low-churn, high-state world objects: gates and barrels. Unlike
// bullets/enemies (thousands, pooled in InstancedMesh), only a handful of props
// live at once, so each is a small object with its own mesh + number Label. Both
// are "count-based": you shoot them and a number changes.

const gateGeo = new THREE.BoxGeometry(CONFIG.gate.width, 3, 0.3);
const barrelGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12);

// Optional real barrel model (Meshy GLB), injected at boot. When set, Barrel
// renders the mesh (geometry baked base-at-y0) instead of the primitive cylinder.
let BARREL_MODEL = null; // { geo, mat }
export function setBarrelModel(m) {
  BARREL_MODEL = m;
}

// ── Gate ───────────────────────────────────────────────────────────────────
// One panel of a pair. Shooting it raises its value (rewarding accuracy before
// you commit); running the squad through applies op(count, value). Green = good
// (add/multiply), red = bad (subtract/divide) — you weave toward the better one.
export class Gate {
  constructor(scene, { x, z, op, label, value, good }) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.op = op;
    this.opLabel = label;
    this.value = value;
    this.good = good;
    this.hp = CONFIG.gate.hp; // how many hits before value stops climbing
    this.dead = false;
    this.applied = false;
    this.kind = "gate";

    const color = good ? 0x38d66b : 0xe0473e;
    this.mesh = new THREE.Mesh(gateGeo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.55 }));
    this.mesh.position.set(x, 1.5, z);
    this.label = new Label(1.5);
    this.label.sprite.position.set(x, 3.2, z);
    scene.add(this.mesh, this.label.sprite);
    this._refresh();
  }
  _refresh() {
    this.label.set(`${this.opLabel}${this.value}`, this.good ? "#b6ffce" : "#ffc4c0");
  }
  // A bullet hit nudges the value up (good gates get better; bad gates get worse).
  hit() {
    if (this.dead) return;
    this.hp -= 1;
    this.value += 1;
    this._refresh();
  }
  // Apply the operator to a squad count. Called once when the squad crosses it.
  apply(count) {
    switch (this.op) {
      case "add": return count + this.value;
      case "sub": return count - this.value;
      case "mul": return count * this.value;
      case "div": return Math.floor(count / Math.max(1, this.value));
      default: return count;
    }
  }
  remove() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh, this.label.sprite);
    this.mesh.material.dispose();
    this.label.dispose();
  }
}

// ── Barrel ───────────────────────────────────────────────────────────────────
// Destructible HP block. At 0 HP it grants soldiers (or, if a weapon barrel, a
// fire-rate upgrade). The visible number is remaining HP → the "shoot to open".
export class Barrel {
  constructor(scene, { x, z, hp, reward, weapon }) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.hp = hp;
    this.maxHp = hp;
    this.reward = reward;
    this.weapon = weapon;
    this.dead = false;
    this.kind = "barrel";

    const color = weapon ? 0x4da3ff : 0xf2a541;
    if (BARREL_MODEL) {
      this.mesh = new THREE.Mesh(BARREL_MODEL.geo, BARREL_MODEL.mat.clone());
      if (weapon) this.mesh.material.color?.set(0x9fd0ff); // tint weapon barrels
      this.mesh.position.set(x, 0, z); // GLB base sits on the ground
    } else {
      this.mesh = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color }));
      this.mesh.position.set(x, 0.8, z);
    }
    this.label = new Label(1.2);
    this.label.sprite.position.set(x, 2.1, z);
    scene.add(this.mesh, this.label.sprite);
    this._refresh();
  }
  _refresh() {
    this.label.set(this.weapon ? `⚡${this.hp}` : `${this.hp}`, this.weapon ? "#cfe8ff" : "#ffe6bf");
  }
  // Returns true when this hit destroys the barrel (caller grants the reward).
  hit(dmg) {
    if (this.dead) return false;
    this.hp -= dmg;
    if (this.hp <= 0) return true;
    this._refresh();
    return false;
  }
  remove() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh, this.label.sprite);
    this.mesh.material.dispose();
    this.label.dispose();
  }
}
