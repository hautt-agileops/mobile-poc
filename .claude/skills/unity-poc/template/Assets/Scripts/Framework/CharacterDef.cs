using System.Collections.Generic;
using UnityEngine;

namespace Fighter
{
    public enum InstallType
    {
        None,
        MeterBuff,
        StanceSwap,
    }

    // Per-character data + behaviour knobs. Job-specific characters subclass / build these.
    [System.Serializable]
    public class CharacterDef
    {
        public string id = "char";
        public string displayName = "Character";
        public string faction = "";
        public string tagline = "";
        public string lore = ""; // one-line VN flavor, shown on select + versus cards
        public Color bodyColor = Color.white;
        public Color accentColor = Color.gray;

        // Movement
        public float walkForward = 3.2f;
        public float walkBack = 2.4f;
        public float dashSpeed = 7.5f;
        public float jumpVelocity = 11f;
        public float gravity = 30f;
        public float height = 1.8f;
        public float width = 0.7f;
        public int maxHealth = 1000;

        // Moves
        public MoveData light;
        public MoveData heavy;
        public MoveData special;
        public MoveData super;

        // Install / transformation
        public InstallType installType = InstallType.None;
        public string installName = "Install";
        public int installMeterCost = 50;
        public float installDuration = 8f; // MeterBuff only; StanceSwap is a toggle
        public float installSpeedMult = 1.25f; // MeterBuff
        public float installDamageMult = 1.2f; // MeterBuff
        public Color installColor = new Color(1f, 0.4f, 0.4f);

        // StanceSwap: alternate moveset used while in stance B
        public MoveData altLight;
        public MoveData altHeavy;
        public MoveData altSpecial;
        public Color stanceBColor = new Color(0.2f, 0.2f, 0.25f);
        public string stanceBName = "Shadow";

        // Resolve the active normal/special given current stance.
        public MoveData ResolveLight(bool stanceB) =>
            (stanceB && altLight != null) ? altLight : light;

        public MoveData ResolveHeavy(bool stanceB) =>
            (stanceB && altHeavy != null) ? altHeavy : heavy;

        public MoveData ResolveSpecial(bool stanceB) =>
            (stanceB && altSpecial != null) ? altSpecial : special;
    }

    public static class Roster
    {
        // Filled by the Game layer at boot.
        public static List<CharacterDef> All = new List<CharacterDef>();
    }
}
