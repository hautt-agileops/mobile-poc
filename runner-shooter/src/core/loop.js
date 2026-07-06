// Fixed-timestep game loop with an accumulator (Gaffer "fix your timestep").
// Simulation advances in constant CONFIG.perf.fixedStep chunks so collision,
// spawning and separation are frame-rate independent and deterministic; render
// is called once per rAF with the leftover interpolation alpha. maxSubSteps
// clamps the catch-up burst when a mobile tab is backgrounded then resumed.
export class Loop {
  constructor({ step, maxSubSteps, update, render }) {
    this.step = step;
    this.maxSubSteps = maxSubSteps;
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this._tick = this._tick.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now() / 1000;
    requestAnimationFrame(this._tick);
  }
  stop() {
    this.running = false;
  }
  _tick(nowMs) {
    if (!this.running) return;
    const now = nowMs / 1000;
    let frame = now - this.last;
    this.last = now;
    if (frame > 0.25) frame = 0.25; // avoid spiral of death on a long stall
    this.acc += frame;

    // Guard the sim + render so a single stray error can't kill the rAF chain and
    // silently freeze the whole game (which reads as "nothing happens"). Log once and
    // keep ticking — a dropped frame beats a dead loop.
    try {
      let steps = 0;
      while (this.acc >= this.step && steps < this.maxSubSteps) {
        this.update(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === this.maxSubSteps) this.acc = 0; // drop the backlog
      this.render(this.acc / this.step);
    } catch (e) {
      if (!this._warned) { console.error("loop error (continuing):", e); this._warned = true; }
    }
    requestAnimationFrame(this._tick);
  }
}
