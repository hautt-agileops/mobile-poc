using System.Collections.Generic;
using UnityEngine;

namespace Fighter3D
{
    public enum InstallType
    {
        None,
        MeterBuff,
        StanceSwap,
    }

    // Per-character data + behaviour knobs for the 3D arena brawler. Job-specific characters
    // build these in the Game/ layer. `modelId` names a GLB under Assets/Resources/Models/<id>
    // (loaded by ModelLoader via glTFast); when absent/failed the fighter renders as a tinted
    // primitive capsule — same graceful-degrade contract the 2D side has with SpriteLoader.
    [System.Serializable]
    public class CharacterDef3D
    {
        public string id = "char";
        public string displayName = "Character";
        public string faction = "";
        public string tagline = "";
        public string lore = "";
        public Color bodyColor = Color.white;
        public Color accentColor = Color.gray;

        // 3D model (optional). null/empty => primitive capsule fallback.
        public string modelId = "";
        public float modelScale = 1f; // multiplies the imported GLB to ~`height` tall
        public float modelYaw = 0f; // extra Y rotation if the GLB faces a non-+Z direction

        // Movement (XZ plane; gravity on Y)
        public float walkSpeed = 3.2f;
        public float backSpeed = 2.4f;
        public float strafeSpeed = 2.6f;
        public float dashSpeed = 7.5f;
        public float jumpVelocity = 9f;
        public float gravity = 26f;
        public float height = 1.8f;
        public float radius = 0.45f; // capsule radius — also the hurt-sphere radius
        public int maxHealth = 1000;

        // Moves
        public MoveData3D light;
        public MoveData3D heavy;
        public MoveData3D special;
        public MoveData3D super;

        // Install / transformation
        public InstallType installType = InstallType.None;
        public string installName = "Install";
        public int installMeterCost = 50;
        public float installDuration = 8f; // MeterBuff only
        public float installSpeedMult = 1.25f;
        public float installDamageMult = 1.2f;
        public Color installColor = new Color(1f, 0.4f, 0.4f);

        // StanceSwap alternate moveset
        public MoveData3D altLight;
        public MoveData3D altHeavy;
        public MoveData3D altSpecial;
        public Color stanceBColor = new Color(0.2f, 0.2f, 0.25f);
        public string stanceBName = "Shadow";

        public MoveData3D ResolveLight(bool stanceB) =>
            (stanceB && altLight != null) ? altLight : light;

        public MoveData3D ResolveHeavy(bool stanceB) =>
            (stanceB && altHeavy != null) ? altHeavy : heavy;

        public MoveData3D ResolveSpecial(bool stanceB) =>
            (stanceB && altSpecial != null) ? altSpecial : special;
    }

    public static class Roster3D
    {
        // Filled by the Game layer at boot. The build/playtest gate also discovers the roster
        // by reflecting on a `public static List<CharacterDef3D> BuildRoster()` in the Game layer.
        public static List<CharacterDef3D> All = new List<CharacterDef3D>();
    }
}
