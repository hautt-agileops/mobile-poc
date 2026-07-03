using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Fighter3D
{
    // The single scene object for the 3D brawler. Builds camera + light + arena + HUD; runs
    // select -> fight -> match loop on a fixed 60fps step. Spawns everything at runtime (no
    // authored scene), so the WebGL build is fully headless.
    public class GameBootstrap3D : MonoBehaviour
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
        CameraRig3D rig;
        CombatSystem3D combat;
        HudController3D hud;
        Transform fxRoot;

        Fighter3D p1, p2;
        InputReader3D in1, in2;
        int bestOf = 3, winsL, winsR;
        float timer, phaseTimer;
        bool trainingMode;
        string closingFaction = "";

        const float startX = 3.0f, roundLength = 60f;
        static readonly Vector3 FaceR = new Vector3(1, 0, 0);
        static readonly Vector3 FaceL = new Vector3(-1, 0, 0);

        SelectMenu3D select;

        void Awake()
        {
            Application.targetFrameRate = 60;
            Time.fixedDeltaTime = 1f / 60f;
            BuildScene();
            ShowPremise();
        }

        void ShowPremise()
        {
            var s = gameObject.AddComponent<StoryOverlay3D>();
            s.Show(StoryText3D.gameTitle, StoryText3D.premise, "PRESS ANY KEY", new Color(0.9f, 0.5f, 0.2f), 0f, StartSelect);
        }

        void ShowVersus(CharacterDef3D a, CharacterDef3D b, System.Action done)
        {
            string title = a.displayName.ToUpper() + "   //   " + b.displayName.ToUpper();
            string body =
                StoryText3D.Clash(a.faction, b.faction)
                + "\n\n" + a.displayName + " <" + a.faction + ">  —  " + a.lore
                + "\n" + b.displayName + " <" + b.faction + ">  —  " + b.lore;
            var s = gameObject.AddComponent<StoryOverlay3D>();
            s.Show(title, body, "PRESS ANY KEY", a.accentColor, 3.2f, done);
        }

        void ShowClosing(System.Action done)
        {
            var winnerDef = winsL > winsR ? p1.def : p2.def;
            var s = gameObject.AddComponent<StoryOverlay3D>();
            s.Show(winnerDef.displayName.ToUpper() + " WINS", StoryText3D.Closing(closingFaction), "PRESS ANY KEY", winnerDef.accentColor, 5f, done);
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
            cam.transform.position = new Vector3(0, 3f, -8f);
            rig = new CameraRig3D(cam);

            // Lighting — a 3D scene with no light renders black. One key directional + ambient.
            var lgo = new GameObject("KeyLight");
            var light = lgo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.color = new Color(1f, 0.97f, 0.9f);
            lgo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.35f, 0.36f, 0.42f);

            fxRoot = new GameObject("FX").transform;
            combat = new CombatSystem3D(fxRoot);

            EnsureEventSystem();
            BuildStage();

            in1 = new InputReader3D(PlayerKeys3D.P1());
            in2 = new InputReader3D(PlayerKeys3D.P2());
        }

        void EnsureEventSystem()
        {
            if (EventSystem.current != null)
                return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        void BuildStage()
        {
            // Circular-ish arena floor (a wide flat cylinder reads as a fighting ring).
            PrimitiveArt3D.Primitive(
                transform,
                PrimitiveType.Cylinder,
                new Color(0.16f, 0.16f, 0.2f),
                new Vector3(Fighter3D.ArenaRadius * 2.2f, 0.25f, Fighter3D.ArenaRadius * 2.2f),
                new Vector3(0, -0.25f, 0)
            );
            // ring accent
            PrimitiveArt3D.Primitive(
                transform,
                PrimitiveType.Cylinder,
                new Color(0.10f, 0.09f, 0.14f),
                new Vector3(Fighter3D.ArenaRadius * 2.45f, 0.18f, Fighter3D.ArenaRadius * 2.45f),
                new Vector3(0, -0.32f, 0)
            );
            // far backdrop wall for depth
            PrimitiveArt3D.Cube(
                transform,
                new Color(0.12f, 0.10f, 0.16f),
                new Vector3(60, 24, 1),
                new Vector3(0, 8, Fighter3D.ArenaRadius + 6)
            );
        }

        void StartSelect()
        {
            phase = Phase.Select;
            select = gameObject.AddComponent<SelectMenu3D>();
            select.Build(Roster3D.All, OnChosen);
        }

        void OnChosen(CharacterDef3D a, CharacterDef3D b, bool training)
        {
            trainingMode = training;
            in2.aiControlled = training;
            Destroy(select);
            select = null;
            SpawnFighters(a, b);
            hud = gameObject.AddComponent<HudController3D>();
            hud.Build(a, b, bestOf);
            winsL = winsR = 0;
            ShowVersus(a, b, StartRound);
        }

        void SpawnFighters(CharacterDef3D a, CharacterDef3D b)
        {
            p1 = NewFighter(a, new Vector3(-startX, 0, 0), FaceR);
            p2 = NewFighter(b, new Vector3(+startX, 0, 0), FaceL);
            p1.opponent = p2;
            p2.opponent = p1;
        }

        Fighter3D NewFighter(CharacterDef3D d, Vector3 pos, Vector3 face)
        {
            var go = new GameObject("Fighter_" + d.id);
            var f = go.AddComponent<Fighter3D>();
            f.Init(d, pos, face);
            f.combat = combat;
            return f;
        }

        void StartRound()
        {
            combat.ClearProjectiles();
            p1.ResetForRound(new Vector3(-startX, 0, 0), FaceR);
            p2.ResetForRound(new Vector3(+startX, 0, 0), FaceL);
            timer = roundLength;
            phase = Phase.RoundIntro;
            phaseTimer = 1.4f;
            hud.Banner("ROUND " + (winsL + winsR + 1), Color.white);
            hud.ShowControls(true);
        }

        void EndRound(int winner)
        {
            phase = Phase.RoundEnd;
            phaseTimer = 2.2f;
            if (winner == 1)
                winsL++;
            else if (winner == 2)
                winsR++;
            else
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
            hud.Banner(winner == 0 ? "TIME — DRAW" : "K.O.", winner == 1 ? p1.def.accentColor : p2.def.accentColor);
            if (winsL >= need || winsR >= need)
            {
                phase = Phase.MatchEnd;
                phaseTimer = 3f;
                var wd = winsL > winsR ? p1.def : p2.def;
                closingFaction = wd.faction;
                hud.Banner(wd.displayName + " WINS", Color.white);
            }
        }

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
                        phase = Phase.Select;
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
                EndRound(0);
        }

        InputSnapshot3D TrainingInput()
        {
            var s = new InputSnapshot3D();
            bool close = Vector3.Distance(p1.transform.position, p2.transform.position) < 2.4f;
            if (close && p1.state == FState.Attack)
                s.block = true;
            return s;
        }

        void SimDeadFall(float dt)
        {
            p1.Tick(new InputSnapshot3D(), dt);
            p2.Tick(new InputSnapshot3D(), dt);
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
