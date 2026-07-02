using UnityEngine;

namespace Fighter3D
{
    // Runtime flat-color 3D primitives so the build needs zero art assets — the 3D analogue of
    // PrimitiveArt. Uses GameObject.CreatePrimitive (built-in meshes ship in every player, so it
    // works headless and in WebGL) and strips the auto-added collider (combat is sphere-based,
    // no physics engine). A URP-less default unlit/lit standard material is fine for a POC.
    public static class PrimitiveArt3D
    {
        static Material _mat;

        static Material BaseMaterial()
        {
            if (_mat != null)
                return _mat;
            // Built-in pipeline "Standard" shader is always present; tinting via color works in
            // gamma WebGL. If a project switches to URP, swap to "Universal Render Pipeline/Lit".
            var sh = Shader.Find("Standard") ?? Shader.Find("Sprites/Default");
            _mat = new Material(sh);
            return _mat;
        }

        public static GameObject Primitive(
            Transform parent,
            PrimitiveType type,
            Color color,
            Vector3 size,
            Vector3 localPos
        )
        {
            var go = GameObject.CreatePrimitive(type);
            go.transform.SetParent(parent, false);
            go.transform.localScale = size;
            go.transform.localPosition = localPos;
            // CreatePrimitive always adds a collider we don't need (combat is sphere-math, no
            // physics). The headless playtest runs in edit mode, where Destroy() warns and skips —
            // use DestroyImmediate there.
            var col = go.GetComponent<Collider>();
            if (col != null)
            {
                if (Application.isPlaying)
                    Object.Destroy(col);
                else
                    Object.DestroyImmediate(col);
            }
            var mr = go.GetComponent<MeshRenderer>();
            mr.sharedMaterial = BaseMaterial();
            // Per-renderer color without leaking material instances across fighters.
            var mpb = new MaterialPropertyBlock();
            mpb.SetColor("_Color", color); // Standard
            mpb.SetColor("_BaseColor", color); // URP/Lit (harmless if absent)
            mr.SetPropertyBlock(mpb);
            return go;
        }

        // A tinted capsule "body" anchored at the feet (origin = bottom). Returns the renderer
        // so callers can recolor it on flash/install.
        public static MeshRenderer Capsule(Transform parent, Color color, float height, float radius)
        {
            // Unity capsule mesh is 2 units tall at scale 1, centered. Scale so it stands `height`.
            float yScale = height / 2f;
            var go = Primitive(
                parent,
                PrimitiveType.Capsule,
                color,
                new Vector3(radius * 2f, yScale, radius * 2f),
                new Vector3(0, height * 0.5f, 0)
            );
            go.name = "body";
            return go.GetComponent<MeshRenderer>();
        }

        public static MeshRenderer Cube(Transform parent, Color color, Vector3 size, Vector3 pos)
        {
            var go = Primitive(parent, PrimitiveType.Cube, color, size, pos);
            return go.GetComponent<MeshRenderer>();
        }

        public static MeshRenderer Sphere(Transform parent, Color color, float diameter, Vector3 pos)
        {
            var go = Primitive(parent, PrimitiveType.Sphere, color, Vector3.one * diameter, pos);
            return go.GetComponent<MeshRenderer>();
        }

        // Set a single renderer's color via property block (no material instancing).
        public static void Tint(MeshRenderer mr, Color c)
        {
            if (mr == null)
                return;
            var mpb = new MaterialPropertyBlock();
            mr.GetPropertyBlock(mpb);
            mpb.SetColor("_Color", c);
            mpb.SetColor("_BaseColor", c);
            mr.SetPropertyBlock(mpb);
        }
    }
}
