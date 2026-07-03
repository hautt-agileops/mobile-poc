using System.Collections.Generic;
using UnityEngine;

namespace Fighter
{
    // Resolves attacker hitbox vs defender hurtbox each frame; owns hitstop + hitsparks.
    // Also owns travelling projectiles ("PACKET") — advanced inside Resolve (NOT a
    // MonoBehaviour Update) so the headless playtest exercises them identically.
    public class CombatSystem
    {
        public int hitstop;
        public int projectileHits; // diagnostic: total packets that connected
        readonly Transform fxParent;
        readonly List<Shot> shots = new List<Shot>();
        const float Dt = 1f / 60f;

        public CombatSystem(Transform fx)
        {
            fxParent = fx;
        }

        public bool Frozen => hitstop > 0;

        public void PreTick()
        {
            if (hitstop > 0)
                hitstop--;
        }

        // Returns true if a meaningful contact happened (for camera shake etc.)
        public bool Resolve(Fighter a, Fighter b)
        {
            bool any = TickProjectiles();
            any |= CheckOne(a, b);
            any |= CheckOne(b, a);
            return any;
        }

        // ---- projectiles ----
        class Shot
        {
            public Fighter atk;
            public MoveData move;
            public float x,
                y;
            public int dir;
            public float life;
            public SpriteRenderer sr;
        }

        public void SpawnProjectile(Fighter atk, MoveData m)
        {
            var r = m.hitbox;
            var p = atk.transform.position;
            float w = r.width,
                h = r.height;
            float x = p.x + atk.facing * (r.x + w * 0.5f);
            float y = p.y + r.y + h * 0.5f;
            var sr = PrimitiveArt.Box(
                fxParent,
                m.flash,
                new Vector2(Mathf.Max(0.4f, w * 0.6f), Mathf.Max(0.35f, h)),
                18,
                false
            );
            sr.transform.position = new Vector3(x, y, 0);
            shots.Add(
                new Shot
                {
                    atk = atk,
                    move = m,
                    x = x,
                    y = y,
                    dir = atk.facing,
                    life = m.projectileLife,
                    sr = sr,
                }
            );
        }

        public void ClearProjectiles()
        {
            foreach (var s in shots)
                if (s.sr)
                    Object.Destroy(s.sr.gameObject);
            shots.Clear();
        }

        bool TickProjectiles()
        {
            bool contact = false;
            for (int i = shots.Count - 1; i >= 0; i--)
            {
                var s = shots[i];
                s.life -= Dt;
                s.x += s.dir * s.move.projectileSpeed * Dt;
                if (s.sr)
                    s.sr.transform.position = new Vector3(s.x, s.y, 0);

                var def = s.atk != null ? s.atk.opponent : null;
                bool retire = s.life <= 0f || Mathf.Abs(s.x) > 9.5f;

                if (!retire && def != null && def.Alive)
                {
                    float hw = Mathf.Max(0.4f, s.move.hitbox.width * 0.6f) * 0.5f;
                    var box = new Rect(s.x - hw, s.y - 0.25f, hw * 2f, 0.5f);
                    if (box.Overlaps(def.Hurtbox()))
                    {
                        ApplyHit(s.atk, def, s.move, s.dir);
                        projectileHits++;
                        contact = true;
                        retire = true;
                    }
                }
                if (retire)
                {
                    if (s.sr)
                        Object.Destroy(s.sr.gameObject);
                    shots.RemoveAt(i);
                }
            }
            return contact;
        }

        // Shared hit application (melee + projectile): block check, damage scale, meter, spark.
        void ApplyHit(Fighter atk, Fighter def, MoveData move, int dir)
        {
            int dmg = Mathf.RoundToInt(move.damage * atk.DamageMult);
            bool guarding = def.IsBlockingNow || GuardHeld(def);
            bool canBlock =
                guarding
                && def.grounded
                && def.state != FState.Attack
                && def.state != FState.Hitstun
                && def.state != FState.KnockDown;
            var temp = new MoveData
            {
                damage = dmg,
                hitstun = move.hitstun,
                blockstun = move.blockstun,
                knockback = move.knockback,
                launch = move.launch,
                knockdown = move.knockdown,
                meterGainBlock = move.meterGainBlock,
            };
            def.TakeHit(temp, dir, canBlock);
            atk.AddMeter(canBlock ? move.meterGainBlock / 2 : move.meterGainHit);
            hitstop = Mathf.Max(hitstop, canBlock ? Mathf.Max(2, move.hitstop / 2) : move.hitstop);
            Spark(
                def.transform.position + new Vector3(dir * 0.3f, def.def.height * 0.6f, 0),
                canBlock ? new Color(0.6f, 0.85f, 1f) : new Color(1f, 0.85f, 0.3f)
            );
        }

        bool CheckOne(Fighter atk, Fighter def)
        {
            if (!atk.HitboxActive || !def.Alive)
                return false;
            var hb = atk.Hitbox();
            var hurt = def.Hurtbox();
            if (!hb.Overlaps(hurt))
                return false;

            atk.MarkHit();
            ApplyHit(atk, def, atk.move, atk.facing);
            return true;
        }

        static bool GuardHeld(Fighter f) => f.state == FState.Block;

        void Spark(Vector3 pos, Color c)
        {
            var sr = PrimitiveArt.Box(fxParent, c, new Vector2(0.5f, 0.5f), 20, false);
            sr.transform.position = pos;
            var s = sr.gameObject.AddComponent<Spark>();
            s.sr = sr;
        }
    }

    public class Spark : MonoBehaviour
    {
        public SpriteRenderer sr;
        float life = 0.18f;

        void Update()
        {
            life -= Time.deltaTime;
            float t = Mathf.Clamp01(life / 0.18f);
            transform.localScale = Vector3.one * (0.6f + (1 - t) * 1.4f);
            var c = sr.color;
            c.a = t;
            sr.color = c;
            if (life <= 0)
                Destroy(gameObject);
        }
    }
}
