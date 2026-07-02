using UnityEngine;

namespace Fighter
{
    // Generates flat-color sprites at runtime so the build needs zero art assets.
    public static class PrimitiveArt
    {
        static Sprite _white;

        public static Sprite WhiteBox()
        {
            if (_white != null)
                return _white;
            var tex = new Texture2D(4, 4, TextureFormat.RGBA32, false);
            var px = new Color[16];
            for (int i = 0; i < 16; i++)
                px[i] = Color.white;
            tex.SetPixels(px);
            tex.filterMode = FilterMode.Point;
            tex.Apply();
            _white = Sprite.Create(tex, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4f);
            return _white;
        }

        // A SpriteRenderer rectangle sized in world units, anchored bottom-center by default.
        // Sized via localScale (the sprite is exactly 1 world unit) — using Simple draw mode
        // avoids the "Sprite Tiling / not Full Rect" warnings that Sliced mode spams on a
        // runtime-created tight-mesh sprite.
        public static SpriteRenderer Box(
            Transform parent,
            Color color,
            Vector2 size,
            int order,
            bool bottomAnchor = true
        )
        {
            var go = new GameObject("box");
            go.transform.SetParent(parent, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = WhiteBox();
            sr.color = color;
            sr.sortingOrder = order;
            go.transform.localScale = new Vector3(size.x, size.y, 1f);
            if (bottomAnchor)
                go.transform.localPosition = new Vector3(0, size.y * 0.5f, 0);
            return sr;
        }
    }
}
