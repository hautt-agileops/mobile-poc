using System.Collections.Generic;
using UnityEngine;

namespace Fighter
{
    public enum FState
    {
        Idle,
        Walk,
        Jump,
        Attack,
        Block,
        Hitstun,
        Blockstun,
        KnockDown,
        Dead,
    }

    // One playable fighter. Custom kinematic physics, fixed 60fps frame logic. No Rigidbody.
    public class Fighter : MonoBehaviour
    {
        public CharacterDef def;
        public Fighter opponent;
        public CombatSystem combat; // set by spawner; used to launch projectiles
        public int facing = 1; // +1 faces right
        public float groundY = 0f;
        public const float Fps = 60f;

        // Live state
        public FState state = FState.Idle;
        public int health;
        public int meter; // 0..100
        public Vector2 vel;
        public bool grounded = true;

        // Attack timeline
        public MoveData move;
        int moveFrame;
        bool moveHasHit;

        // Stun timers (frames)
        int stunTimer;

        // Install / stance
        public bool installed;
        float installTimer;
        public bool stanceB;
        int stanceCooldown;

        // Dash
        int dashTimer;
        int lastFwdTapFrame = -999;
        int frameNo;

        // Flash feedback
        float flash;

        // Visuals
        SpriteRenderer body;
        SpriteRenderer outline;
        public Transform visualRoot;

        // Generated-sprite art path (guarded by useArt). When a "<id>_idle" PNG exists
        // the fighter renders animated sprites instead of PrimitiveArt boxes; otherwise
        // the box path is untouched. Purely visual — never affects logic or the gate.
        bool useArt;
        readonly Dictionary<string, Sprite[]> _frameCache = new Dictionary<string, Sprite[]>();
        string _animKey = "";
        int _animIdx;
        float _animClock;
        const float ArtFps = 10f;

        public bool Alive => state != FState.Dead;
        public float DamageMult => installed ? def.installDamageMult : 1f;
        public float SpeedMult => installed ? def.installSpeedMult : 1f;

        public void Init(CharacterDef d, int face, float startX, float floorY)
        {
            def = d;
            facing = face;
            groundY = floorY;
            health = d.maxHealth;
            meter = 0;
            transform.position = new Vector3(startX, floorY, 0);
            BuildVisual();
        }

        void BuildVisual()
        {
            visualRoot = new GameObject("visual").transform;
            visualRoot.SetParent(transform, false);
            // Apply the initial facing now. FaceOpponent only flips on a CHANGE, and a
            // fighter that spawns already facing its final direction (e.g. P2 at -1)
            // would otherwise never get mirrored — invisible with symmetric boxes,
            // obvious with directional sprites.
            visualRoot.localScale = new Vector3(facing, 1f, 1f);

            // Art path: if the character's idle sprite was generated, render a single
            // animated SpriteRenderer (swapped per state in UpdateArt) and skip the
            // boxes. `body` points at it so the existing flash/tint code still works.
            // Probe via Frames() (not Has) — idle is usually a spritesheet, so the
            // files are "<id>_idle_0.png…", and there is no bare "<id>_idle.png".
            useArt = Frames(def.id + "_idle").Length > 0;
            if (useArt)
            {
                var artGo = new GameObject("art");
                artGo.transform.SetParent(visualRoot, false);
                body = artGo.AddComponent<SpriteRenderer>();
                body.sortingOrder = 5;
                body.color = Color.white;
                SetArtSprite(FirstFrame(def.id + "_idle"));
                return;
            }

            outline = PrimitiveArt.Box(
                visualRoot,
                def.accentColor,
                new Vector2(def.width + 0.12f, def.height + 0.12f),
                4
            );
            body = PrimitiveArt.Box(
                visualRoot,
                def.bodyColor,
                new Vector2(def.width, def.height),
                5
            );
            // simple "head" facing marker
            var head = PrimitiveArt.Box(
                visualRoot,
                def.accentColor,
                new Vector2(def.width * 0.45f, 0.18f),
                6,
                false
            );
            head.transform.localPosition = new Vector3(def.width * 0.18f, def.height * 0.82f, 0);
        }

        // ---- world-space boxes ----
        public Rect Hurtbox()
        {
            var p = transform.position;
            return new Rect(p.x - def.width * 0.5f, p.y, def.width, def.height);
        }

        public bool HitboxActive =>
            state == FState.Attack
            && move != null
            && !move.projectile
            && moveFrame >= move.startup
            && moveFrame < move.startup + move.active
            && !moveHasHit;

        public Rect Hitbox()
        {
            var r = move.hitbox;
            var p = transform.position;
            float x = p.x + (facing > 0 ? r.x : -r.x - r.width);
            return new Rect(x, p.y + r.y, r.width, r.height);
        }

        public void MarkHit()
        {
            moveHasHit = true;
        }

        public bool IsBlockingNow => state == FState.Block || state == FState.Blockstun;

        // ---- per-frame ----
        public void Tick(InputSnapshot inp, float dt)
        {
            frameNo++;
            if (flash > 0)
            {
                flash -= dt * 4f;
                ApplyTint();
            }
            if (stanceCooldown > 0)
                stanceCooldown--;
            if (installed)
            {
                installTimer -= dt;
                if (installTimer <= 0)
                    SetInstalled(false);
            }

            FaceOpponent();
            Decide(inp);
            Physics(dt);
            UpdateArt(dt);
        }

        // ---- generated-sprite animation (only when useArt) ----
        void UpdateArt(float dt)
        {
            if (!useArt) return;
            string key = def.id + "_" + StateTag();
            var fr = Frames(key);
            if (fr.Length == 0) { key = def.id + "_idle"; fr = Frames(key); }
            if (fr.Length == 0) return;
            if (key != _animKey) { _animKey = key; _animIdx = 0; _animClock = 0f; }
            _animClock += dt;
            if (_animClock >= 1f / ArtFps)
            {
                _animClock = 0f;
                if (LoopingState()) _animIdx = (_animIdx + 1) % fr.Length;
                else if (_animIdx < fr.Length - 1) _animIdx++;
            }
            SetArtSprite(fr[Mathf.Clamp(_animIdx, 0, fr.Length - 1)]);
        }

        // Sprite-state suffix for the current FState. Attack uses the move's spriteKey
        // (e.g. "lp"/"hp"/"special_blade"); a missing sheet falls back to idle upstream.
        string StateTag()
        {
            switch (state)
            {
                case FState.Dead:
                case FState.KnockDown: return "ko";
                case FState.Hitstun: return "hurt";
                case FState.Block:
                case FState.Blockstun: return "block";
                case FState.Jump: return "jump";
                case FState.Walk: return "walk";
                case FState.Attack:
                    return (move != null && !string.IsNullOrEmpty(move.spriteKey))
                        ? move.spriteKey : "special";
                default: return installed ? "ascendant" : "idle";
            }
        }

        bool LoopingState() =>
            state == FState.Idle || state == FState.Walk || state == FState.Jump;

        // Loads "<key>_0.._n" (spritesheet) or "<key>" (single), cached per key.
        Sprite[] Frames(string key)
        {
            if (_frameCache.TryGetValue(key, out var cached)) return cached;
            var list = new List<Sprite>();
            for (int i = 0; i < 16; i++)
            {
                var s = SpriteLoader.Get(key + "_" + i);
                if (s == null) break;
                list.Add(s);
            }
            if (list.Count == 0)
            {
                var one = SpriteLoader.Get(key);
                if (one != null) list.Add(one);
            }
            var arr = list.ToArray();
            _frameCache[key] = arr;
            return arr;
        }

        Sprite FirstFrame(string key)
        {
            var fr = Frames(key);
            return fr.Length > 0 ? fr[0] : null;
        }

        void SetArtSprite(Sprite s)
        {
            if (s == null || body == null) return;
            body.sprite = s;
            float target = def.artHeight > 0f ? def.artHeight : def.height * 1.4f;
            float h = s.bounds.size.y;
            float k = h > 0f ? target / h : 1f;
            body.transform.localScale = new Vector3(k, k, 1f);
            body.transform.localPosition = new Vector3(0f, target * 0.5f, 0f);
        }

        void FaceOpponent()
        {
            if (state == FState.Attack || state == FState.Hitstun || state == FState.KnockDown)
                return;
            if (opponent == null)
                return;
            int want = opponent.transform.position.x >= transform.position.x ? 1 : -1;
            if (want != facing)
            {
                facing = want;
                ApplyFacing();
            }
        }

        void ApplyFacing()
        {
            if (visualRoot)
                visualRoot.localScale = new Vector3(facing, 1, 1);
        }

        void Decide(InputSnapshot inp)
        {
            switch (state)
            {
                case FState.Hitstun:
                case FState.Blockstun:
                    if (--stunTimer <= 0)
                        state = grounded ? FState.Idle : FState.Jump;
                    return;
                case FState.KnockDown:
                    if (--stunTimer <= 0)
                    {
                        state = FState.Idle;
                    }
                    return;
                case FState.Attack:
                    AdvanceMove();
                    return;
                case FState.Dead:
                    return;
            }

            // Meter action: install / transform
            if (inp.meterAction)
                DoInstall();

            // Attacks (ground only for this slice)
            if (grounded)
            {
                if (inp.special)
                {
                    StartSpecialOrSuper();
                    return;
                }
                if (inp.heavy)
                {
                    StartMove(def.ResolveHeavy(stanceB));
                    return;
                }
                if (inp.light)
                {
                    StartMove(def.ResolveLight(stanceB));
                    return;
                }
            }

            // Movement / block
            bool wantBlock = inp.block || (grounded && AwayFromOpponent(inp.moveX));
            if (grounded && inp.up)
            {
                Jump();
                return;
            }

            if (grounded && wantBlock && inp.moveX <= 0.001f)
            {
                state = FState.Block;
                vel.x = 0;
                return;
            }

            // Dash detection (double tap toward opponent)
            float towards = facing; // +1 means opponent to right
            bool fwd = (inp.moveX * facing) > 0.5f;
            bool back = (inp.moveX * facing) < -0.5f;
            if (grounded)
            {
                if (fwd && WasFwdTap())
                {
                    dashTimer = 12;
                }
                if (dashTimer > 0)
                {
                    dashTimer--;
                    vel.x = facing * def.dashSpeed * SpeedMult;
                    state = FState.Walk;
                    return;
                }
                if (fwd)
                {
                    vel.x = facing * def.walkForward * SpeedMult;
                    state = FState.Walk;
                }
                else if (back)
                {
                    vel.x = -facing * def.walkBack;
                    state = FState.Walk;
                }
                else
                {
                    vel.x = 0;
                    state = FState.Idle;
                }
            }
        }

        bool AwayFromOpponent(float moveX) => (moveX * facing) < -0.5f;

        bool WasFwdTap()
        {
            bool recent = (frameNo - lastFwdTapFrame) <= 14;
            lastFwdTapFrame = frameNo;
            return recent;
        }

        void Jump()
        {
            grounded = false;
            vel.y = def.jumpVelocity;
            state = FState.Jump;
        }

        void StartSpecialOrSuper()
        {
            if (meter >= 100 && def.super != null)
            {
                meter -= 100;
                StartMove(def.super);
            }
            else
                StartMove(def.ResolveSpecial(stanceB));
        }

        void StartMove(MoveData m)
        {
            if (m == null)
                return;
            if (meter < m.meterCost)
                return;
            meter -= m.meterCost;
            move = m;
            moveFrame = 0;
            moveHasHit = false;
            state = FState.Attack;
            vel.x = 0;
        }

        void AdvanceMove()
        {
            moveFrame++;
            if (moveFrame == move.startup)
            {
                DoFlash(move.flash);
                if (move.projectile && combat != null)
                    combat.SpawnProjectile(this, move);
            }
            if (moveFrame >= move.Total)
            {
                AddMeter(move.meterGainWhiff); // whiff trickle handled on resolve; keep small here
                state = grounded ? FState.Idle : FState.Jump;
                move = null;
            }
        }

        void DoInstall()
        {
            if (def.installType == InstallType.MeterBuff)
            {
                if (!installed && meter >= def.installMeterCost)
                {
                    meter -= def.installMeterCost;
                    SetInstalled(true);
                }
            }
            else if (def.installType == InstallType.StanceSwap)
            {
                if (stanceCooldown <= 0)
                {
                    stanceB = !stanceB;
                    stanceCooldown = 24;
                    RefreshColor();
                    DoFlash(Color.white);
                }
            }
        }

        void SetInstalled(bool on)
        {
            installed = on;
            installTimer = on ? def.installDuration : 0;
            RefreshColor();
            if (on)
                DoFlash(def.installColor);
        }

        void RefreshColor()
        {
            if (!body) return;
            // Art mode: rest white so the sprite shows its own colors; only tint
            // lightly while installed (Ascendant glow). Box mode: full color swap.
            if (useArt)
            {
                body.color = installed
                    ? Color.Lerp(Color.white, def.installColor, 0.45f)
                    : Color.white;
                return;
            }
            Color c = def.bodyColor;
            if (def.installType == InstallType.StanceSwap && stanceB)
                c = def.stanceBColor;
            if (installed)
                c = def.installColor;
            body.color = c;
        }

        // ---- physics ----
        void Physics(float dt)
        {
            if (!grounded)
            {
                vel.y -= def.gravity * dt;
            }
            var p = (Vector2)transform.position + vel * dt;
            if (p.y <= groundY)
            {
                p.y = groundY;
                vel.y = 0;
                if (!grounded) { }
                grounded = true;
                if (state == FState.Jump)
                    state = FState.Idle;
            }
            else
                grounded = false;
            // stage bounds
            p.x = Mathf.Clamp(p.x, -8.2f, 8.2f);
            transform.position = new Vector3(p.x, p.y, 0);
        }

        // ---- receiving hits (called by CombatSystem) ----
        public void TakeHit(MoveData m, int dir, bool blocked)
        {
            if (blocked)
            {
                state = FState.Blockstun;
                stunTimer = m.blockstun;
                vel.x = dir * (m.knockback * 0.4f);
                AddMeter(m.meterGainBlock);
                DoFlash(new Color(0.6f, 0.8f, 1f));
                return;
            }
            int dmg = Mathf.RoundToInt(m.damage);
            health = Mathf.Max(0, health - dmg);
            vel.x = dir * m.knockback;
            if (m.launch > 0f)
            {
                vel.y = m.launch;
                grounded = false;
            }
            DoFlash(new Color(1f, 0.5f, 0.5f));
            if (health <= 0)
            {
                state = FState.Dead;
                vel = new Vector2(dir * 3f, 6f);
                grounded = false;
                return;
            }
            if (m.knockdown || m.launch > 0f)
            {
                state = FState.KnockDown;
                stunTimer = Mathf.Max(m.hitstun, 24);
            }
            else
            {
                state = FState.Hitstun;
                stunTimer = m.hitstun;
            }
        }

        public void AddMeter(int amt)
        {
            meter = Mathf.Clamp(meter + amt, 0, 100);
        }

        void DoFlash(Color c)
        {
            flash = 1f;
            if (body)
                body.color = c;
        }

        void ApplyTint()
        {
            if (flash <= 0)
                RefreshColor();
        }

        public void ResetForRound(float startX)
        {
            health = def.maxHealth;
            meter = 0;
            vel = Vector2.zero;
            installed = false;
            stanceB = false;
            installTimer = 0;
            stanceCooldown = 0;
            state = FState.Idle;
            move = null;
            grounded = true;
            transform.position = new Vector3(startX, groundY, 0);
            RefreshColor();
        }
    }
}
