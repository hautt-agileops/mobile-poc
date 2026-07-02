using UnityEngine;

namespace Fighter
{
    // Job-specific content for BLOOD // BLOOM // PROTOCOL vertical slice.
    // Registers the roster and boots the game with zero scene authoring.
    // Three fighters, one per title word:
    //   BLOOD    -> Funnet  : INSTALL  (timed meter buff)
    //   BLOOM    -> Joan    : SHADOW   (stance swap)
    //   PROTOCOL -> Sable   : PACKET   (projectile zoning)
    public static class BloodBloomProtocol
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Boot()
        {
            StoryText.premise =
                "The city runs on three appetites.\n"
                + "BLOOD takes. BLOOM persuades. PROTOCOL contains them both.\n"
                + "Tonight one of them gets to write the rules.";

            Roster.All = BuildRoster();
            var go = new GameObject("Game");
            go.AddComponent<GameBootstrap>();
        }

        // Public so the headless playtest can construct the same roster without booting the scene.
        public static System.Collections.Generic.List<CharacterDef> BuildRoster() =>
            new System.Collections.Generic.List<CharacterDef> { Funnet(), Shadow(), Sable() };

        // ---- BLOOD: Funnet — adaptive rushdown + INSTALL (meter buff) ----
        static CharacterDef Funnet()
        {
            var d = new CharacterDef
            {
                id = "funnet",
                displayName = "Funnet",
                faction = "BLOOD",
                tagline = "adaptive rushdown / install",
                lore = "Runs on appetite. Stops for nothing it can catch.",
                bodyColor = new Color(0.62f, 0.12f, 0.16f),
                accentColor = new Color(0.95f, 0.25f, 0.25f),
                walkForward = 3.6f,
                walkBack = 2.6f,
                dashSpeed = 8.4f,
                jumpVelocity = 11.5f,
                gravity = 32f,
                maxHealth = 1000,
                installType = InstallType.MeterBuff,
                installName = "BLOOD INSTALL",
                installMeterCost = 50,
                installDuration = 8f,
                installSpeedMult = 1.28f,
                installDamageMult = 1.25f,
                installColor = new Color(1f, 0.45f, 0.18f),
            };
            d.light = new MoveData
            {
                name = "Claw Jab",
                startup = 5,
                active = 3,
                recovery = 9,
                damage = 45,
                hitstun = 14,
                blockstun = 9,
                knockback = 3f,
                hitbox = new Rect(0.45f, 0.8f, 1.0f, 0.45f),
                hitstop = 5,
                meterGainHit = 60,
            };
            d.heavy = new MoveData
            {
                name = "Rend",
                startup = 10,
                active = 4,
                recovery = 18,
                damage = 95,
                hitstun = 20,
                blockstun = 12,
                knockback = 5f,
                hitbox = new Rect(0.5f, 0.6f, 1.45f, 0.7f),
                hitstop = 8,
                meterGainHit = 90,
            };
            d.special = new MoveData
            {
                name = "Lunge Fang",
                kind = MoveKind.Special,
                startup = 12,
                active = 5,
                recovery = 22,
                damage = 110,
                hitstun = 22,
                blockstun = 14,
                knockback = 6f,
                knockdown = true,
                hitbox = new Rect(0.5f, 0.5f, 1.75f, 0.6f),
                hitstop = 9,
                meterGainHit = 70,
                flash = new Color(1f, 0.5f, 0.2f),
            };
            d.super = new MoveData
            {
                name = "Pack Frenzy",
                kind = MoveKind.Super,
                startup = 6,
                active = 8,
                recovery = 26,
                damage = 250,
                hitstun = 30,
                blockstun = 18,
                knockback = 8f,
                knockdown = true,
                hitbox = new Rect(0.4f, 0.3f, 2.3f, 1.5f),
                hitstop = 16,
                flash = new Color(1f, 0.85f, 0.3f),
            };
            return d;
        }

        // ---- BLOOM: Joan / The Shadow — multi-state, SHADOW transform (stance swap) ----
        static CharacterDef Shadow()
        {
            var d = new CharacterDef
            {
                id = "shadow",
                displayName = "Joan",
                faction = "BLOOM",
                tagline = "multi-state / shadow transform",
                lore = "Wears a second face, and a third. You won't see the switch.",
                bodyColor = new Color(0.45f, 0.25f, 0.62f),
                accentColor = new Color(0.75f, 0.45f, 0.95f),
                walkForward = 3.1f,
                walkBack = 2.7f,
                dashSpeed = 7.4f,
                jumpVelocity = 11.8f,
                gravity = 30f,
                maxHealth = 1000,
                installType = InstallType.StanceSwap,
                installName = "SHADOW",
                stanceBName = "Shadow",
                stanceBColor = new Color(0.10f, 0.08f, 0.16f),
                installColor = new Color(0.6f, 0.3f, 0.95f),
            };
            // Joan stance — measured, mid-range
            d.light = new MoveData
            {
                name = "Palm",
                startup = 6,
                active = 3,
                recovery = 10,
                damage = 42,
                hitstun = 14,
                blockstun = 9,
                knockback = 3f,
                hitbox = new Rect(0.45f, 0.85f, 1.05f, 0.45f),
                hitstop = 5,
                meterGainHit = 60,
            };
            d.heavy = new MoveData
            {
                name = "Projection",
                startup = 12,
                active = 4,
                recovery = 16,
                damage = 90,
                hitstun = 19,
                blockstun = 12,
                knockback = 5.5f,
                hitbox = new Rect(0.5f, 0.7f, 1.6f, 0.65f),
                hitstop = 8,
                meterGainHit = 90,
            };
            d.special = new MoveData
            {
                name = "Command Strike",
                kind = MoveKind.Special,
                startup = 13,
                active = 5,
                recovery = 20,
                damage = 100,
                hitstun = 20,
                blockstun = 13,
                knockback = 6f,
                knockdown = true,
                hitbox = new Rect(0.45f, 0.55f, 1.7f, 0.6f),
                hitstop = 9,
                meterGainHit = 70,
            };
            d.super = new MoveData
            {
                name = "Institution",
                kind = MoveKind.Super,
                startup = 7,
                active = 7,
                recovery = 26,
                damage = 240,
                hitstun = 28,
                blockstun = 18,
                knockback = 7.5f,
                knockdown = true,
                hitbox = new Rect(0.4f, 0.3f, 2.2f, 1.5f),
                hitstop = 16,
                flash = new Color(0.8f, 0.5f, 1f),
            };
            // Shadow stance — faster, chip-rush, lower damage
            d.altLight = new MoveData
            {
                name = "Shade Jab",
                startup = 4,
                active = 3,
                recovery = 8,
                damage = 36,
                hitstun = 13,
                blockstun = 9,
                knockback = 2.6f,
                hitbox = new Rect(0.45f, 0.8f, 1.0f, 0.45f),
                hitstop = 4,
                meterGainHit = 65,
            };
            d.altHeavy = new MoveData
            {
                name = "Duplicate Slash",
                startup = 8,
                active = 5,
                recovery = 15,
                damage = 78,
                hitstun = 18,
                blockstun = 11,
                knockback = 4.6f,
                hitbox = new Rect(0.5f, 0.6f, 1.7f, 0.6f),
                hitstop = 7,
                meterGainHit = 90,
            };
            d.altSpecial = new MoveData
            {
                name = "Distortion",
                kind = MoveKind.Special,
                startup = 10,
                active = 6,
                recovery = 18,
                damage = 92,
                hitstun = 20,
                blockstun = 13,
                knockback = 5.5f,
                knockdown = true,
                hitbox = new Rect(0.45f, 0.45f, 1.9f, 0.7f),
                hitstop = 9,
                meterGainHit = 75,
            };
            return d;
        }

        // ---- PROTOCOL: Sable — zoner, PACKET (projectile) keep-out ----
        static CharacterDef Sable()
        {
            var d = new CharacterDef
            {
                id = "sable",
                displayName = "Sable",
                faction = "PROTOCOL",
                tagline = "zoning / projectile keep-out",
                lore = "The system's hand. Keeps you at arm's length, then closes it.",
                bodyColor = new Color(0.10f, 0.42f, 0.50f),
                accentColor = new Color(0.30f, 0.90f, 0.95f),
                walkForward = 2.9f,
                walkBack = 2.9f,
                dashSpeed = 7.0f,
                jumpVelocity = 11.0f,
                gravity = 30f,
                maxHealth = 950,
                installType = InstallType.None,
                installName = "PACKET",
                installColor = new Color(0.3f, 0.9f, 0.95f),
            };
            // Short, unremarkable melee — Sable wants you out, not in.
            d.light = new MoveData
            {
                name = "Ping",
                startup = 6,
                active = 3,
                recovery = 11,
                damage = 38,
                hitstun = 13,
                blockstun = 9,
                knockback = 3f,
                hitbox = new Rect(0.45f, 0.85f, 0.95f, 0.45f),
                hitstop = 5,
                meterGainHit = 55,
            };
            d.heavy = new MoveData
            {
                name = "Firewall",
                startup = 11,
                active = 4,
                recovery = 17,
                damage = 80,
                hitstun = 18,
                blockstun = 12,
                knockback = 5.5f,
                hitbox = new Rect(0.5f, 0.6f, 1.35f, 0.7f),
                hitstop = 8,
                meterGainHit = 85,
            };
            // PACKET — the signature: a travelling projectile that controls space.
            d.special = new MoveData
            {
                name = "Packet",
                kind = MoveKind.Special,
                startup = 10,
                active = 4,
                recovery = 20,
                damage = 72,
                hitstun = 18,
                blockstun = 12,
                knockback = 5f,
                projectile = true,
                projectileSpeed = 11f,
                projectileLife = 1.7f,
                hitbox = new Rect(0.6f, 0.95f, 0.6f, 0.5f),
                hitstop = 7,
                meterGainHit = 55,
                flash = new Color(0.35f, 0.95f, 1f),
            };
            // DENIAL OF SERVICE — super: a fat, fast, knockdown packet.
            d.super = new MoveData
            {
                name = "Denial of Service",
                kind = MoveKind.Super,
                startup = 6,
                active = 6,
                recovery = 26,
                damage = 210,
                hitstun = 28,
                blockstun = 18,
                knockback = 7f,
                knockdown = true,
                projectile = true,
                projectileSpeed = 13f,
                projectileLife = 1.9f,
                hitbox = new Rect(0.6f, 0.9f, 1.0f, 0.85f),
                hitstop = 16,
                flash = new Color(0.6f, 1f, 1f),
            };
            return d;
        }
    }
}
