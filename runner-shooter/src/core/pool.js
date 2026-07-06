import * as THREE from "three";

// InstancedPool — object pool backed by ONE THREE.InstancedMesh. This is the
// core perf primitive: bullets, enemies and soldiers each render in a single
// draw call regardless of count, and "spawning"/"despawning" is just index
// bookkeeping (no allocation, no GC churn) — exactly the object-pooling +
// mobile-performance requirement.
//
// Each instance owns a plain JS record (this.data[i]) that systems mutate;
// syncMatrix(i) writes that record's transform into the instance matrix. Freed
// slots are scaled to zero so they vanish without reordering live instances.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ZERO = new THREE.Vector3(0, 0, 0);

export class InstancedPool {
  constructor(geometry, material, capacity, makeRecord) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // instances span the whole corridor
    this.mesh.count = capacity;
    this.data = new Array(capacity);
    this.free = new Array(capacity);
    this.active = []; // dense list of live indices for fast iteration
    for (let i = 0; i < capacity; i++) {
      this.data[i] = makeRecord ? makeRecord() : {};
      this.data[i]._alive = false;
      this.free[i] = capacity - 1 - i; // pop from the end
      _m.compose(_p.set(0, -9999, 0), _q.identity(), _ZERO);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Grab a free slot; returns its record (with .index) or null if exhausted.
  spawn() {
    if (this.free.length === 0) return null; // pool full — caller degrades
    const i = this.free.pop();
    const rec = this.data[i];
    rec._alive = true;
    rec.index = i;
    this.active.push(i);
    return rec;
  }

  // Recycle slot i. O(1) swap-remove from the active list.
  release(i) {
    const rec = this.data[i];
    if (!rec._alive) return;
    rec._alive = false;
    const a = this.active;
    const pos = a.indexOf(i);
    if (pos !== -1) {
      a[pos] = a[a.length - 1];
      a.pop();
    }
    this.free.push(i);
    _m.compose(_p.set(0, -9999, 0), _q.identity(), _ZERO);
    this.mesh.setMatrixAt(i, _m);
  }

  // Write a record's position/rotation/scale into its instance matrix.
  syncMatrix(i, scale = 1, yaw = 0) {
    const r = this.data[i];
    _q.setFromAxisAngle(_UP, yaw);
    _m.compose(_p.set(r.x, r.y, r.z), _q, _s.set(scale, scale, scale));
    this.mesh.setMatrixAt(i, _m);
  }

  // Call once per render after mutating matrices.
  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  forEach(fn) {
    const a = this.active;
    for (let k = a.length - 1; k >= 0; k--) fn(this.data[a[k]], a[k]);
  }

  get activeCount() {
    return this.active.length;
  }
}
const _UP = new THREE.Vector3(0, 1, 0);
