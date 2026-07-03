using System;
using UnityEngine;
using UnityEngine.UI;

namespace Fighter3D
{
    // Narrative text the Game layer fills at boot (keeps Framework3D decoupled from any specific
    // IP). GameBootstrap3D reads these for the title / premise / versus / closing cards. Defaults
    // are generic; the Game layer overrides gameTitle + premise and may override Clash/Closing.
    public static class StoryText3D
    {
        public static string gameTitle = "3D ARENA";
        public static string premise =
            "Two challengers enter the arena.\nOnly one walks out standing.";

        // Override hooks: assign these from the Game layer for bespoke flavor.
        public static Func<string, string, string> ClashFn;
        public static Func<string, string> ClosingFn;

        public static string Clash(string facA, string facB) =>
            ClashFn != null
                ? ClashFn(facA, facB)
                : (facA == facB ? "A reflection refuses to agree." : "Two styles. One arena.");

        public static string Closing(string faction) =>
            ClosingFn != null ? ClosingFn(faction) : "The arena falls quiet.";
    }

    // Full-screen VN-style card built entirely in code. Dismisses on any key / click after a short
    // grace, or automatically after autoSeconds (<=0 means key/click only). Live game only; the
    // headless playtest bypasses GameBootstrap3D entirely.
    public class StoryOverlay3D : MonoBehaviour
    {
        Action onDone;
        Canvas canvas;
        float timer;
        bool auto;
        float grace = 0.45f;

        void OnDestroy()
        {
            if (canvas)
                Destroy(canvas.gameObject);
        }

        public void Show(string title, string body, string prompt, Color accent, float autoSeconds, Action done)
        {
            onDone = done;
            auto = autoSeconds > 0f;
            timer = autoSeconds;

            var go = new GameObject("StoryCanvas");
            go.transform.SetParent(transform, false);
            canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 80;
            var sc = go.AddComponent<CanvasScaler>();
            sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            sc.referenceResolution = new Vector2(1280, 720);
            go.AddComponent<GraphicRaycaster>();

            Panel(new Color(0.03f, 0.03f, 0.05f, 0.96f), Vector2.zero, Vector2.one);
            Label(title, new Vector2(0.5f, 0.68f), 46, accent, TextAnchor.MiddleCenter, 1100);
            var rule = Panel(accent, new Vector2(0.5f, 0.575f), new Vector2(0.5f, 0.575f));
            rule.rectTransform.sizeDelta = new Vector2(620, 3);
            Label(body, new Vector2(0.5f, 0.50f), 26, new Color(0.92f, 0.92f, 0.95f), TextAnchor.UpperCenter, 1000, 240);
            Label(prompt, new Vector2(0.5f, 0.12f), 18, new Color(1, 1, 1, 0.5f), TextAnchor.MiddleCenter, 1000);
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (grace > 0f)
            {
                grace -= dt;
                return;
            }
            bool pressed = Input.anyKeyDown || Input.GetMouseButtonDown(0);
            if (auto)
            {
                timer -= dt;
                if (timer <= 0f)
                    pressed = true;
            }
            if (pressed)
            {
                var d = onDone;
                onDone = null;
                Destroy(this);
                d?.Invoke();
            }
        }

        Image Panel(Color c, Vector2 amin, Vector2 amax)
        {
            var go = new GameObject("panel");
            go.transform.SetParent(canvas.transform, false);
            var img = go.AddComponent<Image>();
            img.color = c;
            var rt = img.rectTransform;
            rt.anchorMin = amin;
            rt.anchorMax = amax;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            return img;
        }

        void Label(string s, Vector2 anchor, int size, Color c, TextAnchor a, float w, float h = 120)
        {
            var go = new GameObject("t");
            go.transform.SetParent(canvas.transform, false);
            var t = go.AddComponent<Text>();
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.text = s;
            t.fontSize = size;
            t.color = c;
            t.alignment = a;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 1f);
            rt.sizeDelta = new Vector2(w, h);
        }
    }
}
