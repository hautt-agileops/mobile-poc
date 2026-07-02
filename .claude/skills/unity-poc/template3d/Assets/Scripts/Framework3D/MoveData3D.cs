using System;
using UnityEngine;

namespace Fighter3D
{
    public enum MoveKind
    {
        Normal,
        Special,
        EX,
        Super,
    }

    // Frame-data driven 3D attack. All frame counts are 60fps frames. Hit volumes are
    // SPHERES (offset from the fighter's chest along its facing) rather than rotated boxes —
    // sphere-vs-sphere overlap is rotation-free and robust, which keeps a code-driven 3D
    // brawler free of the oriented-AABB bugs that are easy to get wrong without a Unity
    // round-trip. Plenty precise for a vertical-slice prototype.
    [Serializable]
    public class MoveData3D
    {
        public string name = "Attack";
        public MoveKind kind = MoveKind.Normal;

        // Timeline (frames)
        public int startup = 6;
        public int active = 3;
        public int recovery = 12;

        // On-hit / on-block effects
        public int damage = 80;
        public int hitstun = 16;
        public int blockstun = 10;
        public float knockback = 4f; // push along attacker facing (units/sec impulse)
        public float launch = 0f; // upward velocity on hit (>0 => juggle/knockdown)
        public bool knockdown = false; // forces a hard knockdown

        // Hit-sphere relative to the fighter origin (feet). reach = distance forward along
        // facing, height = up from feet, radius = sphere radius. Mirrored by facing direction.
        public float reach = 1.1f;
        public float height = 1.1f;
        public float radius = 0.7f;

        // Projectile — when true the move spawns a travelling shot on its active frame instead
        // of an instantaneous melee sphere. Driven by CombatSystem3D (not a MonoBehaviour
        // Update) so the headless playtest exercises it identically.
        public bool projectile = false;
        public float projectileSpeed = 9f; // world units/sec, travels along facing
        public float projectileLife = 1.6f; // seconds before it expires
        public float projectileRadius = 0.45f;

        // Economy
        public int meterCost = 0;
        public int meterGainHit = 80;
        public int meterGainBlock = 30;
        public int meterGainWhiff = 10;

        // Feel
        public int hitstop = 6; // freeze frames on contact
        public Color flash = new Color(1f, 0.9f, 0.4f);

        public int Total => startup + active + recovery;
    }
}
