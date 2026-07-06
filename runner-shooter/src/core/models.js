import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// models.js — loads the Meshy GLBs and prepares them for the InstancedMesh pools.
// A Meshy export is one textured mesh; we bake its node transform, recenter it on
// X/Z, drop its base to y=0 and scale to a target height, so a plain instance
// matrix (x, y, z) drops it on the ground at the right size. Every load is
// best-effort — a failure returns null and the game keeps its primitive fallback,
// so the build never breaks on a missing/broken asset.
// meshopt-compressed GLBs (gltf-transform optimize --compress meshopt) need the
// decoder; webp textures (EXT_texture_webp) are decoded by the browser natively.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

function firstMesh(gltf) {
  let mesh = null;
  gltf.scene.traverse((o) => {
    if (!mesh && o.isMesh) mesh = o;
  });
  return mesh;
}

function prep(mesh, targetH, faceYaw) {
  const geo = mesh.geometry.clone();
  mesh.updateWorldMatrix(true, false);
  geo.applyMatrix4(mesh.matrixWorld); // bake node transform into the geometry
  if (faceYaw) geo.rotateY(faceYaw); // orient so the model faces +Z at yaw 0
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const s = targetH / (size.y || 1);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -geo.boundingBox.min.y, -c.z); // centre X/Z, base on ground
  geo.computeVertexNormals();

  const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  // Convert Meshy's PBR MeshStandardMaterial → a cheap MeshLambertMaterial with the
  // same diffuse texture. Two wins: (1) far lighter per-fragment on mobile — no
  // metalness/roughness/env-map sampling, which matters when 100+ instances fill the
  // screen at the boss and were starving the frame rate; (2) sidesteps the Meshy
  // metalness≈1 → black-render issue entirely (no env map needed). Lit by the scene
  // lights (hemi + ambient + key + fill).
  if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({
    map: src.map || null,
    color: src.map ? 0xffffff : (src.color || new THREE.Color(0x9a9a9a)),
    side: THREE.FrontSide,
  });
  return { geo, mat };
}

async function loadOne(url, targetH, faceYaw = 0) {
  try {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const m = firstMesh(gltf);
    if (!m) return null;
    return prep(m, targetH, faceYaw);
  } catch (e) {
    console.warn(`model load failed (${url}):`, e.message, "— using primitive fallback");
    return null;
  }
}

// Returns { soldier, enemy, barrel } where each is { geo, mat } or null.
// faceYaw values are tuned so each model's front points +Z at instance-yaw 0
// (the render pass then yaws enemies by π to face the incoming squad).
export async function loadModels() {
  const base = "./assets/models/";
  const [soldier, enemy, barrel] = await Promise.all([
    loadOne(base + "soldier.glb", 0.95, 0),
    loadOne(base + "enemy.glb", 1.05, 0),
    loadOne(base + "barrel.glb", 1.6, 0),
  ]);
  return { soldier, enemy, barrel };
}
