// Deterministic RNG (mulberry32) — seeded so the formula-based spawn director
// produces the SAME level every run, which makes balancing reproducible. Swap
// the seed in config.debug.seed to roll a different but still-repeatable level.
export class RNG {
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  next() {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  bool(p = 0.5) {
    return this.next() < p;
  }
}
