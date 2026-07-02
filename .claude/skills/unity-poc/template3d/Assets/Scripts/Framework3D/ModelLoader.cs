using UnityEngine;

namespace Fighter3D
{
    // Loads a generated GLB from Assets/Resources/Models/<modelId>.bytes at runtime via glTFast
    // and parents it under the fighter; on any failure the caller keeps its primitive fallback.
    // This is the 3D analogue of SpriteLoader's "real art or flat box" contract.
    //
    // glTFast (com.unity.cloud.gltfast) is OPTIONAL: all glTFast calls sit behind `#if HAS_GLTFAST`.
    // The 3D scaffold adds the package AND writes Assets/csc.rsp with `-define:HAS_GLTFAST` only
    // when the package is present, so a project WITHOUT the package still compiles (primitive-only)
    // and the build never hard-fails on a missing dependency. Models are stored with a `.bytes`
    // extension because Unity only ships arbitrary binaries through Resources as TextAsset.
    public static class ModelLoader
    {
        public static bool Available =>
#if HAS_GLTFAST
            true;
#else
            false;
#endif

        // Fire-and-forget: attempts to load def.modelId and, on success, invokes onLoaded with the
        // instantiated model root (so the fighter can hide its primitive body). No-op when the
        // package is absent, the modelId is empty, or the .bytes asset isn't in the build.
        public static void TryLoad(
            Transform mount,
            CharacterDef3D def,
            System.Action<GameObject> onLoaded
        )
        {
#if HAS_GLTFAST
            if (def == null || string.IsNullOrEmpty(def.modelId))
                return;
            var ta = Resources.Load<TextAsset>("Models/" + def.modelId);
            if (ta == null || ta.bytes == null || ta.bytes.Length == 0)
                return;
            LoadAsync(mount, def, ta.bytes, onLoaded);
#endif
        }

#if HAS_GLTFAST
        static async void LoadAsync(
            Transform mount,
            CharacterDef3D def,
            byte[] bytes,
            System.Action<GameObject> onLoaded
        )
        {
            try
            {
                var gltf = new GLTFast.GltfImport();
                bool ok = await gltf.LoadGltfBinary(bytes);
                if (!ok || mount == null)
                    return;
                var root = new GameObject("model_" + def.modelId);
                root.transform.SetParent(mount, false);
                bool inst = await gltf.InstantiateMainSceneAsync(root.transform);
                if (!inst)
                {
                    Object.Destroy(root);
                    return;
                }
                FitHeight(root.transform, def);
                onLoaded?.Invoke(root);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[ModelLoader] '" + def.modelId + "' failed, keeping primitive: " + e.Message);
            }
        }

        // Scale the imported model so its rendered height ≈ def.height (× modelScale), drop its
        // feet to local y=0, and apply def.modelYaw so it faces +Z (the fighter's forward).
        static void FitHeight(Transform root, CharacterDef3D def)
        {
            var rends = root.GetComponentsInChildren<Renderer>();
            if (rends.Length == 0)
                return;
            var b = rends[0].bounds;
            for (int i = 1; i < rends.Length; i++)
                b.Encapsulate(rends[i].bounds);
            float h = Mathf.Max(0.01f, b.size.y);
            float s = (def.height / h) * Mathf.Max(0.01f, def.modelScale);
            root.localScale = Vector3.one * s;
            root.localRotation = Quaternion.Euler(0, def.modelYaw, 0);
            // Re-measure after scaling to seat the feet at y=0.
            var b2 = rends[0].bounds;
            for (int i = 1; i < rends.Length; i++)
                b2.Encapsulate(rends[i].bounds);
            float feetOffset = b2.min.y - root.position.y;
            root.localPosition = new Vector3(0, -feetOffset, 0);
        }
#endif
    }
}
