using UnityEngine;
using System.Collections.Generic;

namespace Fighter
{
    // Loads generated PNGs from Assets/Resources/Art/<id>.png at runtime (by the
    // game-asset-gen skill's manifest id) and falls back to PrimitiveArt flat-color
    // when an asset wasn't generated — so a partial or skipped asset run still
    // produces a playable headless build. Resources.Load is synchronous and works
    // in WebGL, unlike StreamingAssets + UnityWebRequest.
    public static class SpriteLoader
    {
        const string Root = "Art/"; // under Assets/Resources/

        static readonly Dictionary<string, Sprite> _cache = new Dictionary<string, Sprite>();
        static readonly HashSet<string> _missing = new HashSet<string>();

        // Pixels-per-unit for generated sprites. 100 = a 1K (1024px) sprite is ~10
        // world units tall; callers scale to taste via SpriteRenderer.transform.
        public const float PPU = 100f;

        // True when the PNG exists; lets callers decide layout (real art vs box).
        public static bool Has(string id)
        {
            if (_cache.ContainsKey(id)) return true;
            if (_missing.Contains(id)) return false;
            return Get(id) != null && !_missing.Contains(id);
        }

        // Returns the generated sprite for `id`, or null if it wasn't generated.
        // Use GetOr() when you want an automatic flat-color fallback.
        public static Sprite Get(string id)
        {
            if (_cache.TryGetValue(id, out var s)) return s;
            if (_missing.Contains(id)) return null;

            var tex = Resources.Load<Texture2D>(Root + id);
            if (tex == null)
            {
                _missing.Add(id);
                return null;
            }
            tex.filterMode = FilterMode.Bilinear;
            var sp = Sprite.Create(
                tex,
                new Rect(0, 0, tex.width, tex.height),
                new Vector2(0.5f, 0.5f), // centered pivot
                PPU
            );
            _cache[id] = sp;
            return sp;
        }

        // Generated sprite if present, else PrimitiveArt.WhiteBox() (tinted by the
        // caller's SpriteRenderer.color). Never returns null.
        public static Sprite GetOr(string id)
        {
            return Get(id) ?? PrimitiveArt.WhiteBox();
        }

        // Spritesheet frames written as <id>_0.png … <id>_{count-1}.png. Returns the
        // frames that exist; an empty array means none were generated (caller should
        // fall back to a single Get(id) or PrimitiveArt).
        public static Sprite[] GetFrames(string id, int count)
        {
            var frames = new List<Sprite>(count);
            for (int i = 0; i < count; i++)
            {
                var f = Get(id + "_" + i);
                if (f != null) frames.Add(f);
            }
            return frames.ToArray();
        }

        // Convenience: a SpriteRenderer using the generated art if present, else a
        // tinted flat box at the given world size — mirrors PrimitiveArt.Box so game
        // code can swap a Box() call for this without other changes. When the real
        // sprite loads, `size` is treated as the target height and width auto-scales
        // to the sprite's aspect ratio so art isn't squashed.
        public static SpriteRenderer Renderer(
            Transform parent,
            string id,
            Color fallbackColor,
            Vector2 size,
            int order,
            bool bottomAnchor = true
        )
        {
            var go = new GameObject(id);
            go.transform.SetParent(parent, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sortingOrder = order;

            var sprite = Get(id);
            if (sprite != null)
            {
                sr.sprite = sprite;
                sr.color = Color.white; // show the art's own colors
                float spriteH = sprite.bounds.size.y;
                float spriteW = sprite.bounds.size.x;
                float scale = spriteH > 0f ? size.y / spriteH : 1f;
                go.transform.localScale = new Vector3(scale, scale, 1f);
                if (bottomAnchor)
                    go.transform.localPosition = new Vector3(0, size.y * 0.5f, 0);
                // keep width informative for callers that read it back
                _ = spriteW;
            }
            else
            {
                sr.sprite = PrimitiveArt.WhiteBox();
                sr.color = fallbackColor;
                go.transform.localScale = new Vector3(size.x, size.y, 1f);
                if (bottomAnchor)
                    go.transform.localPosition = new Vector3(0, size.y * 0.5f, 0);
            }
            return sr;
        }
    }
}
