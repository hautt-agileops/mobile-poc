using UnityEngine;
using UnityEngine.UI;

namespace Fighter
{
    // uGUI HUD built entirely in code: health + meter bars, round pips, timer, banner.
    public class HudController : MonoBehaviour
    {
        Image hpFillL,
            hpFillR,
            mpFillL,
            mpFillR;
        Image installL,
            installR;
        Text nameL,
            nameR,
            timerTxt,
            banner,
            controls;
        RectTransform pipsL,
            pipsR;
        Image[] pipImgsL,
            pipImgsR;
        Font font;
        GameObject canvasGO;

        // Tear down the HUD canvas with the component (else it lingers after RestartToSelect).
        void OnDestroy()
        {
            if (canvasGO)
                Destroy(canvasGO);
        }

        public void Build(CharacterDef a, CharacterDef b, int bestOf)
        {
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            canvasGO = new GameObject("HUD");
            canvasGO.transform.SetParent(transform, false);
            var canvas = canvasGO.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGO.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            canvasGO.AddComponent<GraphicRaycaster>();
            var root = canvasGO.transform;

            // Health bars
            MakeBar(root, true, 0.92f, a.accentColor, out _, out hpFillL);
            MakeBar(root, false, 0.92f, b.accentColor, out _, out hpFillR);
            // Meter bars (thinner, below)
            MakeBar(root, true, 0.85f, new Color(1f, 0.85f, 0.2f), out _, out mpFillL, 0.34f, 14);
            MakeBar(root, false, 0.85f, new Color(1f, 0.85f, 0.2f), out _, out mpFillR, 0.34f, 14);

            nameL = Label(
                root,
                a.displayName.ToUpper(),
                new Vector2(0.04f, 0.80f),
                TextAnchor.UpperLeft,
                22,
                a.bodyColor
            );
            nameR = Label(
                root,
                b.displayName.ToUpper(),
                new Vector2(0.96f, 0.80f),
                TextAnchor.UpperRight,
                22,
                b.bodyColor
            );
            installL = InstallDot(root, true, a.installColor);
            installR = InstallDot(root, false, b.installColor);

            timerTxt = Label(
                root,
                "60",
                new Vector2(0.5f, 0.92f),
                TextAnchor.MiddleCenter,
                40,
                Color.white
            );
            banner = Label(
                root,
                "",
                new Vector2(0.5f, 0.55f),
                TextAnchor.MiddleCenter,
                64,
                Color.white
            );
            controls = Label(
                root,
                ControlsText(),
                new Vector2(0.5f, 0.06f),
                TextAnchor.MiddleCenter,
                15,
                new Color(1, 1, 1, 0.55f)
            );

            int pips = (bestOf + 1) / 2;
            pipImgsL = Pips(root, true, pips, a.accentColor);
            pipImgsR = Pips(root, false, pips, b.accentColor);
        }

        string ControlsText() =>
            "P1  move A/D  jump W  block LShift   F light  G heavy  H special/super  T install\n"
            + "P2  move ←/→  jump ↑  block RCtrl   Num1 light  Num2 heavy  Num3 special/super  Num5 install";

        void MakeBar(
            Transform root,
            bool left,
            float y,
            Color fill,
            out Image bg,
            out Image fillImg,
            float width = 0.42f,
            float height = 26
        )
        {
            var bgGO = new GameObject("barbg");
            bgGO.transform.SetParent(root, false);
            bg = bgGO.AddComponent<Image>();
            bg.color = new Color(0, 0, 0, 0.6f);
            var rt = bg.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(left ? 0.04f : 0.96f, y);
            rt.pivot = new Vector2(left ? 0 : 1, 0.5f);
            rt.sizeDelta = new Vector2(1280 * width, height);

            var fGO = new GameObject("barfill");
            fGO.transform.SetParent(bgGO.transform, false);
            fillImg = fGO.AddComponent<Image>();
            fillImg.color = fill;
            fillImg.type = Image.Type.Filled;
            fillImg.fillMethod = Image.FillMethod.Horizontal;
            fillImg.fillOrigin = left ? 0 : 1;
            fillImg.fillAmount = 1f;
            var frt = fillImg.rectTransform;
            frt.anchorMin = Vector2.zero;
            frt.anchorMax = Vector2.one;
            frt.offsetMin = new Vector2(3, 3);
            frt.offsetMax = new Vector2(-3, -3);
        }

        Image InstallDot(Transform root, bool left, Color c)
        {
            var go = new GameObject("install");
            go.transform.SetParent(root, false);
            var img = go.AddComponent<Image>();
            img.color = c;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(left ? 0.04f : 0.96f, 0.80f);
            rt.pivot = new Vector2(left ? 0 : 1, 0.5f);
            rt.sizeDelta = new Vector2(16, 16);
            rt.anchoredPosition = new Vector2(left ? 150 : -150, 0);
            go.SetActive(false);
            return img;
        }

        Image[] Pips(Transform root, bool left, int n, Color c)
        {
            var arr = new Image[n];
            for (int i = 0; i < n; i++)
            {
                var go = new GameObject("pip");
                go.transform.SetParent(root, false);
                var img = go.AddComponent<Image>();
                img.color = new Color(c.r, c.g, c.b, 0.25f);
                var rt = img.rectTransform;
                rt.anchorMin = rt.anchorMax = new Vector2(left ? 0.45f : 0.55f, 0.86f);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(18, 18);
                rt.anchoredPosition = new Vector2((left ? -1 : 1) * (i * 24), 0);
                arr[i] = img;
            }
            return arr;
        }

        Text Label(Transform root, string s, Vector2 anchor, TextAnchor align, int size, Color c)
        {
            var go = new GameObject("label");
            go.transform.SetParent(root, false);
            var t = go.AddComponent<Text>();
            t.font = font;
            t.text = s;
            t.fontSize = size;
            t.color = c;
            t.alignment = align;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(700, 120);
            return t;
        }

        public void Tick(Fighter a, Fighter b, float timeLeft, int winsL, int winsR)
        {
            hpFillL.fillAmount = (float)a.health / a.def.maxHealth;
            hpFillR.fillAmount = (float)b.health / b.def.maxHealth;
            mpFillL.fillAmount = a.meter / 100f;
            mpFillR.fillAmount = b.meter / 100f;
            installL.gameObject.SetActive(a.installed || a.stanceB);
            installR.gameObject.SetActive(b.installed || b.stanceB);
            timerTxt.text = Mathf.CeilToInt(Mathf.Max(0, timeLeft)).ToString();
            for (int i = 0; i < pipImgsL.Length; i++)
                SetPip(pipImgsL[i], i < winsL, a.def.accentColor);
            for (int i = 0; i < pipImgsR.Length; i++)
                SetPip(pipImgsR[i], i < winsR, b.def.accentColor);
        }

        void SetPip(Image img, bool on, Color c) =>
            img.color = on ? c : new Color(c.r, c.g, c.b, 0.25f);

        public void Banner(string s, Color c)
        {
            banner.text = s;
            banner.color = c;
        }

        public void ShowControls(bool on)
        {
            controls.enabled = on;
        }
    }
}
