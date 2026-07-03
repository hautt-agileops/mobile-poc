using UnityEngine;

namespace Fighter
{
    // Per-player snapshot of intent. Uses legacy Input (works in WebGL, no package).
    public struct InputSnapshot
    {
        public float moveX; // -1 back .. +1 forward (raw, not facing-adjusted)
        public bool up;
        public bool down;
        public bool light; // tap
        public bool heavy; // tap
        public bool special; // tap
        public bool meterAction; // install / transform / super modifier (tap)
        public bool block; // held (also implied by holding away)
    }

    [System.Serializable]
    public class PlayerKeys
    {
        public KeyCode left,
            right,
            up,
            down,
            light,
            heavy,
            special,
            meterAction,
            block;

        public static PlayerKeys P1() =>
            new PlayerKeys
            {
                left = KeyCode.A,
                right = KeyCode.D,
                up = KeyCode.W,
                down = KeyCode.S,
                light = KeyCode.F,
                heavy = KeyCode.G,
                special = KeyCode.H,
                meterAction = KeyCode.T,
                block = KeyCode.LeftShift,
            };

        public static PlayerKeys P2() =>
            new PlayerKeys
            {
                left = KeyCode.LeftArrow,
                right = KeyCode.RightArrow,
                up = KeyCode.UpArrow,
                down = KeyCode.DownArrow,
                light = KeyCode.Keypad1,
                heavy = KeyCode.Keypad2,
                special = KeyCode.Keypad3,
                meterAction = KeyCode.Keypad5,
                block = KeyCode.RightControl,
            };
    }

    public class InputReader
    {
        readonly PlayerKeys k;
        public bool aiControlled = false; // training dummy

        public InputReader(PlayerKeys keys)
        {
            k = keys;
        }

        public InputSnapshot Read()
        {
            var s = new InputSnapshot();
            if (aiControlled)
                return s; // dummy: stands still (RoundManager may override to block)
            float x = 0;
            if (Input.GetKey(k.left))
                x -= 1;
            if (Input.GetKey(k.right))
                x += 1;
            s.moveX = x;
            s.up = Input.GetKey(k.up);
            s.down = Input.GetKey(k.down);
            s.light = Input.GetKeyDown(k.light);
            s.heavy = Input.GetKeyDown(k.heavy);
            s.special = Input.GetKeyDown(k.special);
            s.meterAction = Input.GetKeyDown(k.meterAction);
            s.block = Input.GetKey(k.block);
            return s;
        }
    }
}
