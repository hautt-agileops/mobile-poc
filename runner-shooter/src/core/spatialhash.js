// SpatialHash — uniform grid over the XZ plane for O(1) neighbour queries.
// The separation system would be O(n²) with a naive all-pairs check; this keeps
// enemy-vs-enemy separation cheap enough for hundreds of enemies on a phone.
// Rebuilt each fixed step (cheap: clear + insert), queried by cell neighbourhood.
export class SpatialHash {
  constructor(cellSize) {
    this.cell = cellSize;
    this.map = new Map(); // key -> array of {x,z,index,...} records
  }
  _key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663; // classic spatial hash mix
  }
  clear() {
    this.map.clear();
  }
  insert(rec) {
    const cx = Math.floor(rec.x / this.cell);
    const cz = Math.floor(rec.z / this.cell);
    const k = this._key(cx, cz);
    let bucket = this.map.get(k);
    if (!bucket) this.map.set(k, (bucket = []));
    bucket.push(rec);
  }
  // Invoke fn(other) for every record in the 3×3 cell block around (x,z).
  forNeighbors(x, z, fn) {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.map.get(this._key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }
}
