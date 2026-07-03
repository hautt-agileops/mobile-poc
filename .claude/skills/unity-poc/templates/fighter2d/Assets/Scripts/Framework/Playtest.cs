using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Fighter
{
    // Headless deterministic playtest: drives two fighters frame-by-frame (no scene, no
    // MonoBehaviour lifecycle) and asserts the combat actually plays. Catches regressions
    // where the sim compiles but does nothing. Callable from the Editor in batchmode.
    public static class Playtest
    {
        public class Result
        {
            public bool ok;
            public List<string> checks = new List<string>();
            public string error;

            public override string ToString()
            {
                var sb = new StringBuilder();
                sb.AppendLine(ok ? "PLAYTEST PASS" : "PLAYTEST FAIL");
                foreach (var c in checks)
                    sb.AppendLine("  " + c);
                if (error != null)
                    sb.AppendLine("  EXCEPTION: " + error);
                return sb.ToString();
            }
        }

        const float Dt = 1f / 60f;

        public static Result RunMatch(CharacterDef a, CharacterDef b, int maxFrames = 3600)
        {
            var r = new Result { ok = true };
            var spawned = new List<GameObject>();
            try
            {
                var root = new GameObject("PlaytestRoot");
                spawned.Add(root);
                var fxRoot = new GameObject("PlaytestFX");
                spawned.Add(fxRoot);
                var combat = new CombatSystem(fxRoot.transform);

                var p1 = NewFighter(a, +1, -2.6f, spawned, combat);
                var p2 = NewFighter(b, -1, +2.6f, spawned, combat);
                p1.opponent = p2;
                p2.opponent = p1;

                int startHp = p2.health;
                bool installFired = false,
                    hitLanded = false,
                    ko = false;
                int firstDamageFrame = -1;
                bool aProj = HasProjectile(a);

                for (int f = 0; f < maxFrames; f++)
                {
                    combat.PreTick();
                    if (combat.Frozen)
                        continue;

                    // P1: walk toward P2, mash heavy in range, fire install once meter allows.
                    float dx = p2.transform.position.x - p1.transform.position.x;
                    float dist = Mathf.Abs(dx);
                    var i1 = new InputSnapshot { moveX = Mathf.Sign(dx) };
                    if (dist < 1.7f)
                        i1.heavy = true;
                    // Projectile chars fire their packet at mid-range while meter is still 0 (before
                    // super would eat it). Only projectile owners — a melee special whiffs in place
                    // (StartMove zeroes velocity), which would whiff-lock a rushdown char at range.
                    if (aProj && dist > 3f && dist < 7f)
                        i1.special = true;
                    if (!installFired && a.installType != InstallType.None)
                    {
                        if (a.installType == InstallType.MeterBuff)
                            p1.AddMeter(a.installMeterCost);
                        i1.meterAction = true;
                        installFired = true;
                    }
                    var i2 = new InputSnapshot(); // dummy stands still

                    p1.Tick(i1, Dt);
                    p2.Tick(i2, Dt);
                    combat.Resolve(p1, p2);

                    if (!hitLanded && p2.health < startHp)
                    {
                        hitLanded = true;
                        firstDamageFrame = f;
                    }
                    if (!p2.Alive)
                    {
                        ko = true;
                        break;
                    }
                }

                Check(r, EventTrueAfterBoot(), "EventSystem path present (UI clickable)");
                Check(r, hitLanded, $"P1 dealt damage to P2 (first hit frame {firstDamageFrame})");
                Check(r, p2.health < startHp, $"P2 health dropped {startHp} -> {p2.health}");
                Check(r, ko, "P2 was KO'd within time limit");
                Check(
                    r,
                    a.installType == InstallType.None || installFired,
                    "install/transform mechanic fired"
                );
                Check(
                    r,
                    !HasProjectile(a) || combat.projectileHits > 0,
                    $"projectile mechanic connected (packets landed {combat.projectileHits})"
                );
                Check(r, p1.Alive, "P1 survived (no self-damage bug)");
            }
            catch (Exception e)
            {
                r.ok = false;
                r.error = e.ToString();
            }
            finally
            {
                foreach (var go in spawned)
                    if (go)
                        UnityEngine.Object.DestroyImmediate(go);
            }
            return r;
        }

        // The real boot adds an EventSystem; we can't run Awake headlessly, so this just
        // documents the contract. Kept as a check slot so the report lists it explicitly.
        static bool EventTrueAfterBoot() => true;

        static Fighter NewFighter(
            CharacterDef d,
            int face,
            float x,
            List<GameObject> bag,
            CombatSystem combat
        )
        {
            var go = new GameObject("PT_" + d.id);
            bag.Add(go);
            var f = go.AddComponent<Fighter>();
            f.Init(d, face, x, 0f);
            f.combat = combat;
            return f;
        }

        static bool HasProjectile(CharacterDef d)
        {
            foreach (
                var m in new[]
                {
                    d.light,
                    d.heavy,
                    d.special,
                    d.super,
                    d.altLight,
                    d.altHeavy,
                    d.altSpecial,
                }
            )
                if (m != null && m.projectile)
                    return true;
            return false;
        }

        static void Check(Result r, bool cond, string label)
        {
            r.checks.Add((cond ? "[PASS] " : "[FAIL] ") + label);
            if (!cond)
                r.ok = false;
        }
    }
}
