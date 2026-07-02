using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Fighter
{
    // Mouse-driven character select. Click a card to fill P1 then P2. Toggle training, then START.
    public class SelectMenu : MonoBehaviour
    {
        Action<CharacterDef, CharacterDef, bool> onDone;
        List<CharacterDef> roster;
        CharacterDef pick1,
            pick2;
        bool training;
        Font font;
        Canvas canvas;
        Text slotTxt,
            startTxt,
            trainTxt;
        Image startBtn;

        public void Build(List<CharacterDef> r, Action<CharacterDef, CharacterDef, bool> done)
        {
            roster = r;
            onDone = done;
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var go = new GameObject("SelectCanvas");
            go.transform.SetParent(transform, false);
            canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 50;
            var sc = go.AddComponent<CanvasScaler>();
            sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            sc.referenceResolution = new Vector2(1280, 720);
            go.AddComponent<GraphicRaycaster>();

            // Env backdrop: the stage art (same id the match uses), shown behind the
            // menu so the select screen isn't a black void. Dim the panel over it.
            var bgSprite = string.IsNullOrEmpty(GameBootstrap.StageBgId)
                ? null
                : SpriteLoader.Get(GameBootstrap.StageBgId);
            if (bgSprite != null)
            {
                var bgGo = new GameObject("backdrop");
                bgGo.transform.SetParent(canvas.transform, false);
                var bgImg = bgGo.AddComponent<Image>();
                bgImg.sprite = bgSprite;
                bgImg.color = Color.white;
                var brt = bgImg.rectTransform;
                brt.anchorMin = Vector2.zero;
                brt.anchorMax = Vector2.one;
                brt.offsetMin = brt.offsetMax = Vector2.zero;
            }

            Panel(
                canvas.transform,
                bgSprite != null
                    ? new Color(0.03f, 0.03f, 0.05f, 0.55f)
                    : new Color(0.05f, 0.05f, 0.08f, 1f),
                Vector2.zero,
                Vector2.one,
                Vector2.zero
            );
            Label(
                "BLOOD // BLOOM // PROTOCOL",
                new Vector2(0.5f, 0.90f),
                44,
                new Color(0.9f, 0.2f, 0.3f),
                TextAnchor.MiddleCenter,
                1000
            );
            Label(
                "VERTICAL SLICE — SELECT YOUR FIGHTERS",
                new Vector2(0.5f, 0.83f),
                20,
                new Color(1, 1, 1, 0.7f),
                TextAnchor.MiddleCenter,
                1000
            );

            // cards
            int n = roster.Count;
            float spread = Mathf.Min(0.62f, 0.18f * n);
            for (int i = 0; i < n; i++)
            {
                float fx =
                    n == 1
                        ? 0.5f
                        : Mathf.Lerp(0.5f - spread / 2f, 0.5f + spread / 2f, (float)i / (n - 1));
                MakeCard(roster[i], new Vector2(fx, 0.55f));
            }

            slotTxt = Label(
                "P1: —        P2: —",
                new Vector2(0.5f, 0.30f),
                26,
                Color.white,
                TextAnchor.MiddleCenter,
                1100
            );

            trainTxt = Button(
                "TRAINING: OFF",
                new Vector2(0.35f, 0.18f),
                new Color(0.2f, 0.2f, 0.26f),
                () =>
                {
                    training = !training;
                    trainTxt.text = "TRAINING: " + (training ? "ON" : "OFF");
                    RefreshStart();
                }
            );
            startBtn = ButtonImg(
                "START",
                new Vector2(0.65f, 0.18f),
                new Color(0.25f, 0.5f, 0.3f),
                out startTxt,
                TryStart
            );
            RefreshStart();
        }

        void MakeCard(CharacterDef d, Vector2 anchor)
        {
            var go = new GameObject("card_" + d.id);
            go.transform.SetParent(canvas.transform, false);
            var img = go.AddComponent<Image>();
            // Use the generated portrait if present; else the flat faction-color box.
            var portrait = SpriteLoader.Get(d.id + "_portrait");
            if (portrait != null)
            {
                img.sprite = portrait;
                img.color = Color.white;
                img.preserveAspect = true;
            }
            else
            {
                img.color = d.bodyColor;
            }
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(150, 200);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() => Choose(d));
            // accent strip
            var strip = new GameObject("accent");
            strip.transform.SetParent(go.transform, false);
            var si = strip.AddComponent<Image>();
            si.color = d.accentColor;
            var srt = si.rectTransform;
            srt.anchorMin = new Vector2(0, 0);
            srt.anchorMax = new Vector2(1, 0.16f);
            srt.offsetMin = srt.offsetMax = Vector2.zero;
            Label(
                d.displayName.ToUpper() + "\n<" + d.faction + ">",
                anchor,
                16,
                Color.black,
                TextAnchor.LowerCenter,
                150,
                new Vector2(0, -70)
            );
        }

        // Destroying the component must also tear down its canvas, or the opaque select
        // overlay lingers on top and hides the match that just started.
        void OnDestroy()
        {
            if (canvas)
                Destroy(canvas.gameObject);
        }

        void Choose(CharacterDef d)
        {
            if (pick1 == null)
                pick1 = d;
            else if (pick2 == null)
                pick2 = d;
            else
            {
                pick1 = d;
                pick2 = null;
            }
            slotTxt.text =
                $"P1: {(pick1 != null ? pick1.displayName : "—")}        P2: {(pick2 != null ? pick2.displayName : "—")}";
            RefreshStart();
        }

        void RefreshStart()
        {
            bool ok = pick1 != null && (training || pick2 != null);
            startBtn.color = ok ? new Color(0.25f, 0.55f, 0.32f) : new Color(0.2f, 0.2f, 0.22f);
        }

        void TryStart()
        {
            if (pick1 == null)
                return;
            var b = pick2 != null ? pick2 : pick1;
            if (training)
                b = pick2 != null ? pick2 : pick1;
            if (!training && pick2 == null)
                return;
            onDone?.Invoke(pick1, b, training);
        }

        // ---- ui helpers ----
        Image Panel(Transform p, Color c, Vector2 amin, Vector2 amax, Vector2 size)
        {
            var go = new GameObject("panel");
            go.transform.SetParent(p, false);
            var img = go.AddComponent<Image>();
            img.color = c;
            var rt = img.rectTransform;
            rt.anchorMin = amin;
            rt.anchorMax = amax;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            return img;
        }

        Text Label(
            string s,
            Vector2 anchor,
            int size,
            Color c,
            TextAnchor a,
            float w,
            Vector2 offset = default
        )
        {
            var go = new GameObject("t");
            go.transform.SetParent(canvas.transform, false);
            var t = go.AddComponent<Text>();
            t.font = font;
            t.text = s;
            t.fontSize = size;
            t.color = c;
            t.alignment = a;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(w, 120);
            rt.anchoredPosition = offset;
            return t;
        }

        Text Button(string s, Vector2 anchor, Color c, Action onClick)
        {
            ButtonImg(s, anchor, c, out Text label, onClick);
            return label;
        }

        Image ButtonImg(string s, Vector2 anchor, Color c, out Text label, Action onClick)
        {
            var go = new GameObject("btn");
            go.transform.SetParent(canvas.transform, false);
            var img = go.AddComponent<Image>();
            img.color = c;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(260, 60);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() => onClick());
            var lgo = new GameObject("l");
            lgo.transform.SetParent(go.transform, false);
            label = lgo.AddComponent<Text>();
            label.font = font;
            label.text = s;
            label.fontSize = 24;
            label.color = Color.white;
            label.alignment = TextAnchor.MiddleCenter;
            var lrt = label.rectTransform;
            lrt.anchorMin = Vector2.zero;
            lrt.anchorMax = Vector2.one;
            lrt.offsetMin = lrt.offsetMax = Vector2.zero;
            return img;
        }
    }
}
