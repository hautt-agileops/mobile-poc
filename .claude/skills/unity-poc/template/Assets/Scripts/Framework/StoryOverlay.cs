using System;
using UnityEngine;
using UnityEngine.UI;

namespace Fighter
{
    // Narrative text the Game layer fills at boot (keeps the Framework decoupled from any
    // specific IP). GameBootstrap reads these for the premise / versus / closing cards.
    public static class StoryText
    {
        // Opening premise card, shown once before character select. Overridden in Boot().
        public static string premise =
            "Three forces meet where the city breaks.\nOnly one writes what comes after.";

        // One-line clash narration for a versus card, by faction pairing. Order-independent.
        public static string Clash(string facA, string facB)
        {
            string key = Key(facA, facB);
            switch (key)
            {
                case "BLOOD|BLOOM":
                    return "Instinct against influence. Appetite against identity.";
                case "BLOOD|PROTOCOL":
                    return "The hunger trips the wire. The system answers in kind.";
                case "BLOOM|PROTOCOL":
                    return "Persuasion meets the machine that cannot be persuaded.";
                default:
                    return facA == facB
                        ? "A reflection refuses to agree."
                        : "Two forces decide who defines the rest.";
            }
        }

        // Closing line by winning faction.
        public static string Closing(string faction)
        {
            switch (faction)
            {
                case "BLOOD":
                    return "BLOOD writes the next line in red.";
                case "BLOOM":
                    return "BLOOM rewrites the room in its own image.";
                case "PROTOCOL":
                    return "PROTOCOL logs the outcome. Case closed.";
                default:
                    return "The protocol resolves.";
            }
        }

        static string Key(string a, string b)
        {
            return string.CompareOrdinal(a, b) <= 0 ? a + "|" + b : b + "|" + a;
        }
    }

    // Full-screen VN-style card built entirely in code (own canvas, torn down on destroy —
    // same pattern as SelectMenu/HudController). Dismisses on any key / click after a short
    // grace, or automatically after autoSeconds (<=0 means key/click only). Only used in the
    // live game; the headless playtest bypasses GameBootstrap entirely.
    public class StoryOverlay : MonoBehaviour
    {
        Action onDone;
        Canvas canvas;
        float timer; // remaining auto time; <=0 at Show means key-only
        bool auto;
        float grace = 0.45f; // ignore input briefly so a held key from the prior screen can't skip instantly

        void OnDestroy()
        {
            if (canvas)
                Destroy(canvas.gameObject);
        }

        public void Show(
            string title,
            string body,
            string prompt,
            Color accent,
            float autoSeconds,
            Action done
        )
        {
            onDone = done;
            auto = autoSeconds > 0f;
            timer = autoSeconds;
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

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
            // accent rule sits clearly below the title, above the body
            var rule = Panel(accent, new Vector2(0.5f, 0.575f), new Vector2(0.5f, 0.575f));
            rule.rectTransform.sizeDelta = new Vector2(620, 3);

            Label(
                body,
                new Vector2(0.5f, 0.50f),
                26,
                new Color(0.92f, 0.92f, 0.95f),
                TextAnchor.UpperCenter,
                1000,
                240
            );
            Label(
                prompt,
                new Vector2(0.5f, 0.12f),
                18,
                new Color(1, 1, 1, 0.5f),
                TextAnchor.MiddleCenter,
                1000
            );
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

        void Label(
            string s,
            Vector2 anchor,
            int size,
            Color c,
            TextAnchor a,
            float w,
            float h = 120
        )
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
