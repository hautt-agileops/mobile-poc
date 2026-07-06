// Input — unified pointer (touch + mouse) that maps horizontal drag to a target
// X for the squad. Relative dragging (not absolute tap position) so the squad
// doesn't teleport under your thumb; feels right on a phone. Returns a value in
// [-1, 1] the game scales to lane width.
export class Input {
  constructor(el, { sensitivity = 2.4 } = {}) {
    this.el = el;
    this.sensitivity = sensitivity;
    this.axis = 0; // -1..1 target across the lane
    this._dragging = false;
    this._lastX = 0;
    this._startAxis = 0;

    const down = (x) => {
      this._dragging = true;
      this._lastX = x;
      this._startAxis = this.axis;
    };
    const move = (x) => {
      if (!this._dragging) return;
      const dx = (x - this._lastX) / window.innerWidth;
      this.axis = clamp(this._startAxis + dx * this.sensitivity, -1, 1);
    };
    const up = () => (this._dragging = false);

    el.addEventListener("pointerdown", (e) => { el.setPointerCapture?.(e.pointerId); down(e.clientX); });
    el.addEventListener("pointermove", (e) => move(e.clientX));
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    // keyboard fallback for desktop testing
    this._keys = { left: false, right: false };
    window.addEventListener("keydown", (e) => this._key(e, true));
    window.addEventListener("keyup", (e) => this._key(e, false));
  }
  _key(e, v) {
    if (e.key === "ArrowLeft" || e.key === "a") this._keys.left = v;
    if (e.key === "ArrowRight" || e.key === "d") this._keys.right = v;
  }
  // Call each fixed step; folds keyboard into the same axis.
  update(dt) {
    if (this._keys.left) this.axis = clamp(this.axis - 2 * dt, -1, 1);
    if (this._keys.right) this.axis = clamp(this.axis + 2 * dt, -1, 1);
    return this.axis;
  }
}
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
