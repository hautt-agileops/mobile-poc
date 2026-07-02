using System.Collections.Generic;
using UnityEngine;

namespace Fighter3D
{
    // Resolves attacker hit-sphere vs defender hurt-sphere each frame; owns hitstop, hitsparks,
    // and travelling projectiles. Projectiles advance inside Resolve (NOT a MonoBehaviour Update)
    // so the headless playtest exercises them identically.
    public class CombatSystem3D
    {
        public int hitstop;
        public int projectileHits;
        readonly Transform fxParent;
        readonly List<Shot> shots = new List<Shot>();
        const float Dt = 1f / 60f;

        public CombatSystem3D(Transform fx)
        {
            fxParent = fx;
        }

        public bool Frozen => hitstop > 0;

        public void PreTick()
        {
            if (hitstop > 0)
                hitstop--;
        }

        public bool Resolve(Fighter3D a, Fighter3D b)
        {
            bool any = TickProjectiles();
            any |= CheckOne(a, b);
            any |= CheckOne(b, a);
            return any;
        }

        // ---- projectiles ----
        class Shot
        {
            public Fighter3D atk;
            public MoveData3D move;
            public Vector3 pos;
            public Vector3 dir; // XZ unit
            public float life;
            public Transform tr;
        }

        public void SpawnProjectile(Fighter3D atk, MoveData3D m)
        {
            Vector3 start =
                atk.transform.position + atk.Facing * m.reach + Vector3.up * m.height;
            var vis = PrimitiveArt3D.Sphere(fxParent, m.flash, m.projectileRadius * 2f, start);
            shots.Add(
                new Shot
                {
                    atk = atk,
                    move = m,
                    pos = start,
                    dir = atk.Facing,
                    life = m.projectileLife,
                    tr = vis.transform,
                }
            );
        }

        public void ClearProjectiles()
        {
            foreach (var s in shots)
                if (s.tr)
                    Object.Destroy(s.tr.gameObject);
            shots.Clear();
        }

        bool TickProjectiles()
        {
            bool contact = false;
            for (int i = shots.Count - 1; i >= 0; i--)
            {
                var s = shots[i];
                s.life -= Dt;
                s.pos += s.dir * s.move.projectileSpeed * Dt;
                if (s.tr)
                    s.tr.position = s.pos;

                var def = s.atk != null ? s.atk.opponent : null;
                bool retire =
                    s.life <= 0f
                    || new Vector2(s.pos.x, s.pos.z).magnitude > Fighter3D.ArenaRadius + 1.5f;

                if (!retire && def != null && def.Alive)
                {
                    float rr = s.move.projectileRadius + def.HurtRadius();
                    if ((s.pos - def.HurtCenter()).sqrMagnitude <= rr * rr)
                    {
                        ApplyHit(s.atk, def, s.move, s.dir);
                        projectileHits++;
                        contact = true;
                        retire = true;
                    }
                }
                if (retire)
                {
                    if (s.tr)
                        Object.Destroy(s.tr.gameObject);
                    shots.RemoveAt(i);
                }
            }
            return contact;
        }

        void ApplyHit(Fighter3D atk, Fighter3D def, MoveData3D move, Vector3 dir)
        {
            int dmg = Mathf.RoundToInt(move.damage * atk.DamageMult);
            bool guarding = def.IsBlockingNow || GuardHeld(def);
            bool canBlock =
                guarding
                && def.grounded
                && def.state != FState.Attack
                && def.state != FState.Hitstun
                && def.state != FState.KnockDown;
            var temp = new MoveData3D
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
                def.HurtCenter() + dir * 0.3f,
                canBlock ? new Color(0.6f, 0.85f, 1f) : new Color(1f, 0.85f, 0.3f)
            );
        }

        bool CheckOne(Fighter3D atk, Fighter3D def)
        {
            if (!atk.HitboxActive || !def.Alive)
                return false;
            float rr = atk.HitRadius() + def.HurtRadius();
            if ((atk.HitCenter() - def.HurtCenter()).sqrMagnitude > rr * rr)
                return false;

            atk.MarkHit();
            Vector3 dir = def.transform.position - atk.transform.position;
            ApplyHit(atk, def, atk.move, dir);
            return true;
        }

        static bool GuardHeld(Fighter3D f) => f.state == FState.Block;

        void Spark(Vector3 pos, Color c)
        {
            var mr = PrimitiveArt3D.Sphere(fxParent, c, 0.5f, pos);
            var s = mr.gameObject.AddComponent<Spark3D>();
            s.mr = mr;
        }
    }

    public class Spark3D : MonoBehaviour
    {
        public MeshRenderer mr;
        float life = 0.18f;

        void Update()
        {
            life -= Time.deltaTime;
            float t = Mathf.Clamp01(life / 0.18f);
            transform.localScale = Vector3.one * (0.5f + (1 - t) * 1.2f);
            if (life <= 0)
                Destroy(gameObject);
        }
    }
}
