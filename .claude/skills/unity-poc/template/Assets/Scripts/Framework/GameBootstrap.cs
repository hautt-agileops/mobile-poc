using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Fighter
{
    // The single scene object. Builds stage, fighters, HUD; runs select -> fight -> match loop.
    public class GameBootstrap : MonoBehaviour
    {
        enum Phase
        {
            Select,
            RoundIntro,
            Fight,
            RoundEnd,
            MatchEnd,
        }

        Phase phase;
        Camera cam;
        CameraRig rig;
        CombatSystem combat;
        HudController hud;
        Transform fxRoot;

        Fighter p1,
            p2;
        InputReader in1,
            in2;
        int bestOf = 3,
            winsL,
            winsR;
        float roundTime,
            timer;
        float phaseTimer;
        bool trainingMode;
        string closingFaction = "";

        const float startX = 2.6f,
            groundY = 0f,
            roundLength = 60f;

        // Select UI
        SelectMenu select;

        void Awake()
        {
            Application.targetFrameRate = 60;
            Time.fixedDeltaTime = 1f / 60f;
            BuildScene();
            ShowPremise();
        }

        // ---------- STORY (light VN cards) ----------
        void ShowPremise()
        {
            var s = gameObject.AddComponent<StoryOverlay>();
            s.Show(
                "BLOOD // BLOOM // PROTOCOL",
                StoryText.premise,
                "PRESS ANY KEY",
                new Color(0.9f, 0.2f, 0.3f),
                0f,
                StartSelect
            );
        }

        void ShowVersus(CharacterDef a, CharacterDef b, System.Action done)
        {
            string title = a.displayName.ToUpper() + "   //   " + b.displayName.ToUpper();
            string body =
                StoryText.Clash(a.faction, b.faction)
                + "\n\n"
                + a.displayName
                + " <"
                + a.faction
                + ">  —  "
                + a.lore
                + "\n"
                + b.displayName
                + " <"
                + b.faction
                + ">  —  "
                + b.lore;
            var s = gameObject.AddComponent<StoryOverlay>();
            s.Show(title, body, "PRESS ANY KEY", a.accentColor, 3.2f, done);
        }

        void ShowClosing(System.Action done)
        {
            var winnerDef = winsL > winsR ? p1.def : p2.def;
            var s = gameObject.AddComponent<StoryOverlay>();
            s.Show(
                winnerDef.displayName.ToUpper() + " WINS",
                StoryText.Closing(closingFaction),
                "PRESS ANY KEY",
                winnerDef.accentColor,
                5f,
                done
            );
        }

        void BuildScene()
        {
            cam = Camera.main;
            if (cam == null)
            {
                var cgo = new GameObject("Main Camera");
                cgo.tag = "MainCamera";
                cam = cgo.AddComponent<Camera>();
            }
            cam.backgroundColor = new Color(0.07f, 0.07f, 0.10f);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.transform.position = new Vector3(0, 2.2f, -10);
            rig = new CameraRig(cam);

            fxRoot = new GameObject("FX").transform;
            combat = new CombatSystem(fxRoot);

            EnsureEventSystem();
            BuildStage();

            in1 = new InputReader(PlayerKeys.P1());
            in2 = new InputReader(PlayerKeys.P2());
        }

        // uGUI buttons need an EventSystem + input module or no clicks register.
        void EnsureEventSystem()
        {
            if (EventSystem.current != null)
                return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>(); // legacy Input module (build sets activeInputHandler=Both)
        }

        void BuildStage()
        {
            // floor
            var floor = PrimitiveArt.Box(
                transform,
                new Color(0.16f, 0.16f, 0.2f),
                new Vector2(20, 0.6f),
                1,
                false
            );
            floor.transform.position = new Vector3(0, groundY - 0.3f, 0);
            // back wall gradient (two bands)
            var band1 = PrimitiveArt.Box(
                transform,
                new Color(0.12f, 0.10f, 0.16f),
                new Vector2(20, 8),
                0,
                false
            );
            band1.transform.position = new Vector3(0, 4, 1);
            var band2 = PrimitiveArt.Box(
                transform,
                new Color(0.18f, 0.13f, 0.22f),
                new Vector2(20, 3),
                0,
                false
            );
            band2.transform.position = new Vector3(0, 1.2f, 0.9f);
            // pillars for depth
            for (int i = -1; i <= 1; i += 2)
            {
                var pil = PrimitiveArt.Box(
                    transform,
                    new Color(0.10f, 0.09f, 0.14f),
                    new Vector2(0.5f, 7),
                    0,
                    false
                );
                pil.transform.position = new Vector3(i * 6.5f, 3.5f, 0.8f);
            }
        }

        // ---------- SELECT ----------
        void StartSelect()
        {
            phase = Phase.Select;
            select = gameObject.AddComponent<SelectMenu>();
            select.Build(Roster.All, OnChosen);
        }

        void OnChosen(CharacterDef a, CharacterDef b, bool training)
        {
            trainingMode = training;
            in2.aiControlled = training;
            Destroy(select);
            select = null;
            SpawnFighters(a, b);
            hud = gameObject.AddComponent<HudController>();
            hud.Build(a, b, bestOf);
            winsL = winsR = 0;
            ShowVersus(a, b, StartRound);
        }

        void SpawnFighters(CharacterDef a, CharacterDef b)
        {
            p1 = NewFighter(a, +1, -startX);
            p2 = NewFighter(b, -1, +startX);
            p1.opponent = p2;
            p2.opponent = p1;
        }

        Fighter NewFighter(CharacterDef d, int face, float x)
        {
            var go = new GameObject("Fighter_" + d.id);
            var f = go.AddComponent<Fighter>();
            f.Init(d, face, x, groundY);
            f.combat = combat;
            return f;
        }

        // ---------- ROUND FLOW ----------
        void StartRound()
        {
            combat.ClearProjectiles();
            p1.ResetForRound(-startX);
            p2.ResetForRound(+startX);
            timer = roundLength;
            phase = Phase.RoundIntro;
            phaseTimer = 1.4f;
            hud.Banner("ROUND " + (winsL + winsR + 1), Color.white);
            hud.ShowControls(true);
        }

        void EndRound(int winner) // 0 none(time), 1 left, 2 right
        {
            phase = Phase.RoundEnd;
            phaseTimer = 2.2f;
            if (winner == 1)
                winsL++;
            else if (winner == 2)
                winsR++;
            else // time over: higher health wins
            {
                if (p1.health > p2.health)
                {
                    winsL++;
                    winner = 1;
                }
                else if (p2.health > p1.health)
                {
                    winsR++;
                    winner = 2;
                }
            }
            int need = (bestOf + 1) / 2;
            hud.Banner(
                winner == 0 ? "TIME — DRAW" : "K.O.",
                winner == 1 ? p1.def.accentColor : p2.def.accentColor
            );
            if (winsL >= need || winsR >= need)
            {
                phase = Phase.MatchEnd;
                phaseTimer = 3f;
                var wd = winsL > winsR ? p1.def : p2.def;
                closingFaction = wd.faction;
                hud.Banner(wd.displayName + " WINS", Color.white);
            }
        }

        // ---------- LOOP ----------
        void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            switch (phase)
            {
                case Phase.RoundIntro:
                    rig.Frame(p1.transform, p2.transform, dt);
                    if ((phaseTimer -= dt) <= 0)
                    {
                        phase = Phase.Fight;
                        hud.Banner("FIGHT!", new Color(1f, 0.85f, 0.3f));
                        Invoke(nameof(ClearBanner), 0.7f);
                    }
                    break;

                case Phase.Fight:
                    TickFight(dt);
                    break;

                case Phase.RoundEnd:
                    rig.Frame(p1.transform, p2.transform, dt);
                    SimDeadFall(dt);
                    if ((phaseTimer -= dt) <= 0)
                    {
                        hud.Banner("", Color.white);
                        StartRound();
                    }
                    break;

                case Phase.MatchEnd:
                    rig.Frame(p1.transform, p2.transform, dt);
                    SimDeadFall(dt);
                    if ((phaseTimer -= dt) <= 0)
                    {
                        phase = Phase.Select; // idle the loop while the closing card shows
                        hud.Banner("", Color.white);
                        ShowClosing(RestartToSelect);
                    }
                    break;
            }
        }

        void ClearBanner()
        {
            if (hud)
            {
                hud.Banner("", Color.white);
                hud.ShowControls(false);
            }
        }

        void TickFight(float dt)
        {
            combat.PreTick();
            if (!combat.Frozen)
            {
                var i1 = in1.Read();
                var i2 = trainingMode ? TrainingInput() : in2.Read();
                p1.Tick(i1, dt);
                p2.Tick(i2, dt);
                if (combat.Resolve(p1, p2))
                    rig.Shake(0.6f);
                timer -= dt;
            }
            rig.Frame(p1.transform, p2.transform, dt);
            hud.Tick(p1, p2, timer, winsL, winsR);

            if (!p1.Alive)
            {
                EndRound(2);
                return;
            }
            if (!p2.Alive)
            {
                EndRound(1);
                return;
            }
            if (timer <= 0)
            {
                EndRound(0);
            }
        }

        InputSnapshot TrainingInput()
        {
            // dummy holds block when P1 is attacking & close, else idle.
            var s = new InputSnapshot();
            bool close = Mathf.Abs(p1.transform.position.x - p2.transform.position.x) < 2.2f;
            if (close && p1.state == FState.Attack)
                s.block = true;
            return s;
        }

        void SimDeadFall(float dt)
        {
            // let bodies settle after KO
            p1.Tick(new InputSnapshot(), dt);
            p2.Tick(new InputSnapshot(), dt);
        }

        void RestartToSelect()
        {
            if (hud)
                Destroy(hud);
            if (p1)
                Destroy(p1.gameObject);
            if (p2)
                Destroy(p2.gameObject);
            StartSelect();
        }
    }
}
