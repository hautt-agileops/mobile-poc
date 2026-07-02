using System;
using UnityEngine;

namespace Fighter
{
    public enum MoveKind
    {
        Normal,
        Special,
        EX,
        Super,
    }

    // Frame-data driven attack definition. All frame counts are in 60fps frames.
    [Serializable]
    public class MoveData
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
        public float knockback = 4f; // horizontal push on hit (units/sec impulse)
        public float launch = 0f; // upward velocity on hit (>0 => juggle/knockdown)
        public bool knockdown = false; // forces a hard knockdown

        // Hitbox geometry, relative to fighter origin (facing +x). Mirrored by facing.
        public Rect hitbox = new Rect(0.5f, 0.4f, 1.2f, 0.5f);

        // Projectile ("PACKET") — when true the move spawns a travelling shot on its active
        // frame instead of swinging a melee hitbox. The hitbox Rect above is reused as the
        // packet's spawn offset + size. Driven by CombatSystem (no MonoBehaviour Update), so
        // the headless playtest exercises it too.
        public bool projectile = false;
        public float projectileSpeed = 9f; // world units/sec, travels along facing
        public float projectileLife = 1.6f; // seconds before it expires

        // Economy
        public int meterCost = 0; // meter spent to perform
        public int meterGainHit = 80;
        public int meterGainBlock = 30;
        public int meterGainWhiff = 10;

        // Feel
        public int hitstop = 6; // freeze frames on contact
        public Color flash = new Color(1f, 0.9f, 0.4f);

        public int Total => startup + active + recovery;
    }
}
