using UnityEngine;

namespace Fighter3D
{
    // Per-player snapshot of intent for the 3D brawler. moveFwd/moveStrafe are facing-relative
    // axes on the XZ plane. Legacy Input (WebGL-safe, no package).
    public struct InputSnapshot3D
    {
        public float moveFwd; // +1 toward opponent .. -1 away (facing-relative)
        public float moveStrafe; // +1 right .. -1 left (facing-relative)
        public bool up; // jump
        public bool light; // tap
        public bool heavy; // tap
        public bool special; // tap
        public bool meterAction; // install / transform / super modifier (tap)
        public bool block; // held
    }

    [System.Serializable]
    public class PlayerKeys3D
    {
        public KeyCode forward,
            back,
            left,
            right,
            up,
            light,
            heavy,
            special,
            meterAction,
            block;

        public static PlayerKeys3D P1() =>
            new PlayerKeys3D
            {
                forward = KeyCode.W,
                back = KeyCode.S,
                left = KeyCode.A,
                right = KeyCode.D,
                up = KeyCode.Space,
                light = KeyCode.F,
                heavy = KeyCode.G,
                special = KeyCode.H,
                meterAction = KeyCode.T,
                block = KeyCode.LeftShift,
            };

        public static PlayerKeys3D P2() =>
            new PlayerKeys3D
            {
                forward = KeyCode.UpArrow,
                back = KeyCode.DownArrow,
                left = KeyCode.LeftArrow,
                right = KeyCode.RightArrow,
                up = KeyCode.RightControl,
                light = KeyCode.Keypad1,
                heavy = KeyCode.Keypad2,
                special = KeyCode.Keypad3,
                meterAction = KeyCode.Keypad5,
                block = KeyCode.RightShift,
            };
    }

    public class InputReader3D
    {
        readonly PlayerKeys3D k;
        public bool aiControlled = false; // training dummy

        public InputReader3D(PlayerKeys3D keys)
        {
            k = keys;
        }

        public InputSnapshot3D Read()
        {
            var s = new InputSnapshot3D();
            if (aiControlled)
                return s;
            float f = 0,
                x = 0;
            if (Input.GetKey(k.forward))
                f += 1;
            if (Input.GetKey(k.back))
                f -= 1;
            if (Input.GetKey(k.right))
                x += 1;
            if (Input.GetKey(k.left))
                x -= 1;
            s.moveFwd = f;
            s.moveStrafe = x;
            s.up = Input.GetKeyDown(k.up);
            s.light = Input.GetKeyDown(k.light);
            s.heavy = Input.GetKeyDown(k.heavy);
            s.special = Input.GetKeyDown(k.special);
            s.meterAction = Input.GetKeyDown(k.meterAction);
            s.block = Input.GetKey(k.block);
            return s;
        }
    }
}
