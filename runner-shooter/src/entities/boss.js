import * as THREE from "three";
import { CONFIG } from "../config.js";
import { Label } from "../ui/label.js";

// Boss — the level-ending gate. Reuses the enemy GLB scaled up (primitive cone
// fallback), advances on the frozen lane toward the held squad, and chews the
// count on contact until it's shot dead. Not pooled (one at a time).
const fallbackGeo = new THREE.ConeGeometry(1.1, 3.2, 8);

export class Boss {
  constructor(scene, model, { x, z, hp, dps, speed }) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.hp = hp;
    this.maxHp = hp;
    this.dps = dps;
    this.speed = speed;
    this.dead = false;
    this.kind = "boss";
    this.addTimer = CONFIG.boss.addInterval; // throws add-waves during the fight
    this._n = 0;

    if (model) {
      this.mesh = new THREE.Mesh(model.geo, model.mat.clone());
      this.mesh.material.color?.set(0x9a1f1f); // darker, meaner tint
      this.mesh.scale.setScalar(CONFIG.boss.scale);
      this.mesh.position.set(x, 0, z);
    } else {
      this.mesh = new THREE.Mesh(fallbackGeo, new THREE.MeshLambertMaterial({ color: 0x9a1f1f }));
      this.mesh.position.set(x, 1.6, z);
    }
    this.label = new Label(2.2);
    this.label.sprite.position.set(x, CONFIG.boss.scale + 1.4, z);
    scene.add(this.mesh, this.label.sprite);
    this._refresh();
  }
  _refresh() {
    this.label.set(`👹 ${Math.max(0, Math.ceil(this.hp))}`, "#ff8a80");
  }
  // Advance toward the squad; deal continuous damage once in contact. Returns
  // true while engaged (for HUD urgency). Squad is at (centroidX, squad.z).
  update(dt, game) {
    if (this.dead) return false;
    // throw add-waves at the squad so the fight demands dodging + shooting, not holding
    this.addTimer -= dt;
    if (this.addTimer <= 0) {
      this.addTimer += CONFIG.boss.addInterval;
      for (let k = 0; k < CONFIG.boss.addCount; k++) {
        const ax = this.x + Math.sin(this._n + k * 2.1) * 3.2;
        game.spawnEnemy(ax, this.z - 1.5, CONFIG.boss.addHp);
      }
      this._n += 1.7;
    }
    const targetZ = game.squad.z;
    if (this.z > targetZ + CONFIG.boss.touchRange) {
      this.z -= this.speed * dt;
      this.mesh.position.z = this.z;
      this.label.sprite.position.z = this.z;
      return false;
    }
    game.squad.damage(this.dps * dt); // engaged: grind the count
    return true;
  }
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
