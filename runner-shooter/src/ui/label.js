import * as THREE from "three";

// Label — a billboarded number over a gate/barrel, drawn on a small canvas
// texture. Props are few (≤ config.pools.props) so one sprite each is fine; this
// is what makes the "count-based" systems legible (gate operator value, barrel HP).
export class Label {
  constructor(scale = 1.6) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(scale * 2, scale, 1);
    this._last = null;
  }
  set(text, color = "#ffffff") {
    if (text === this._last) return; // skip redraw when unchanged
    this._last = text;
    const c = this.ctx;
    c.clearRect(0, 0, 256, 128);
    c.font = "bold 84px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 10;
    c.strokeStyle = "rgba(0,0,0,0.85)";
    c.strokeText(text, 128, 64);
    c.fillStyle = color;
    c.fillText(text, 128, 64);
    this.tex.needsUpdate = true;
  }
  dispose() {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
