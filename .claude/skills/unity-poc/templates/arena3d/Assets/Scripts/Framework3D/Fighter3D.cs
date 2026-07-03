using UnityEngine;

namespace Fighter3D
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

    // One playable 3D fighter. Custom kinematic motion on the XZ plane (no Rigidbody), fixed 60fps
    // frame logic. Combat uses sphere volumes (see MoveData3D) so there are no rotated-box edge
    // cases. Renders a primitive capsule immediately and swaps in a glTFast model if one loads.
    public class Fighter3D : MonoBehaviour
    {
        public CharacterDef3D def;
        public Fighter3D opponent;
        public CombatSystem3D combat; // set by spawner; used to launch projectiles
        public const float Fps = 60f;
        public const float ArenaRadius = 8.5f;

        // Live state
        public FState state = FState.Idle;
        public int health;
        public int meter; // 0..100
        public Vector3 vel;
        public bool grounded = true;
        Vector3 facingDir = Vector3.forward; // unit, XZ plane
        public Vector3 Facing => facingDir;

        // Attack timeline
        public MoveData3D move;
        int moveFrame;
        bool moveHasHit;

        int stunTimer;

        // Install / stance
        public bool installed;
        float installTimer;
        public bool stanceB;
        int stanceCooldown;

        // Dash
        int dashTimer;
        int lastFwdTapFrame = -999;
        bool fwdHeldLast;
        int frameNo;

        float flash;

        // Visuals
        Transform visualRoot;
        MeshRenderer body;
        GameObject modelRoot;

        public bool Alive => state != FState.Dead;
        public float DamageMult => installed ? def.installDamageMult : 1f;
        public float SpeedMult => installed ? def.installSpeedMult : 1f;

        public void Init(CharacterDef3D d, Vector3 startPos, Vector3 faceDir)
        {
            def = d;
            health = d.maxHealth;
            meter = 0;
            transform.position = new Vector3(startPos.x, 0f, startPos.z);
            facingDir = Flatten(faceDir);
            BuildVisual();
            ApplyFacing();
        }

        void BuildVisual()
        {
            visualRoot = new GameObject("visual").transform;
            visualRoot.SetParent(transform, false);
            body = PrimitiveArt3D.Capsule(visualRoot, def.bodyColor, def.height, def.radius);
            // facing marker (small accent "nose" on +Z)
            var nose = PrimitiveArt3D.Cube(
                visualRoot,
                def.accentColor,
                new Vector3(def.radius * 0.7f, def.radius * 0.4f, def.radius * 0.6f),
                new Vector3(0, def.height * 0.78f, def.radius * 0.8f)
            );
            _ = nose;
            // Try to swap in a real GLB; on success hide the primitive body but keep the marker off.
            ModelLoader.TryLoad(
                visualRoot,
                def,
                loaded =>
                {
                    modelRoot = loaded;
                    if (body != null)
                        body.enabled = false;
                }
            );
        }

        static Vector3 Flatten(Vector3 v)
        {
            v.y = 0f;
            return v.sqrMagnitude < 1e-6f ? Vector3.forward : v.normalized;
        }

        // ---- world-space volumes ----
        public Vector3 HurtCenter() => transform.position + Vector3.up * (def.height * 0.5f);

        public float HurtRadius() => def.radius + def.height * 0.28f;

        public bool HitboxActive =>
            state == FState.Attack
            && move != null
            && !move.projectile
            && moveFrame >= move.startup
            && moveFrame < move.startup + move.active
            && !moveHasHit;

        public Vector3 HitCenter() =>
            transform.position + facingDir * move.reach + Vector3.up * move.height;

        public float HitRadius() => move.radius;

        public void MarkHit() => moveHasHit = true;

        public bool IsBlockingNow => state == FState.Block || state == FState.Blockstun;

        // ---- per-frame ----
        public void Tick(InputSnapshot3D inp, float dt)
        {
            frameNo++;
            if (flash > 0)
            {
                flash -= dt * 4f;
                if (flash <= 0)
                    RefreshColor();
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
            Decide(inp, dt);
            Physics(dt);
        }

        void FaceOpponent()
        {
            if (state == FState.Attack || state == FState.Hitstun || state == FState.KnockDown)
                return;
            if (opponent == null)
                return;
            var to = Flatten(opponent.transform.position - transform.position);
            facingDir = to;
            ApplyFacing();
        }

        void ApplyFacing()
        {
            if (visualRoot)
                visualRoot.rotation = Quaternion.LookRotation(facingDir, Vector3.up);
        }

        Vector3 Right() => Vector3.Cross(Vector3.up, facingDir);

        void Decide(InputSnapshot3D inp, float dt)
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
                        state = FState.Idle;
                    return;
                case FState.Attack:
                    AdvanceMove();
                    return;
                case FState.Dead:
                    return;
            }

            if (inp.meterAction)
                DoInstall();

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

            if (grounded && inp.up)
            {
                Jump();
                return;
            }

            bool wantBlock = inp.block || (grounded && inp.moveFwd < -0.5f);
            if (grounded && wantBlock && Mathf.Abs(inp.moveStrafe) < 0.5f && inp.moveFwd <= 0.001f)
            {
                state = FState.Block;
                vel.x = 0;
                vel.z = 0;
                return;
            }

            // Dash: double-tap forward.
            bool fwd = inp.moveFwd > 0.5f;
            if (grounded && fwd && !fwdHeldLast && WasFwdTap())
                dashTimer = 12;
            fwdHeldLast = fwd;

            Vector3 planar = Vector3.zero;
            if (grounded)
            {
                if (dashTimer > 0)
                {
                    dashTimer--;
                    planar = facingDir * def.dashSpeed * SpeedMult;
                    state = FState.Walk;
                }
                else
                {
                    float fwdSpeed = inp.moveFwd >= 0 ? def.walkSpeed : def.backSpeed;
                    planar =
                        facingDir * (inp.moveFwd * fwdSpeed * SpeedMult)
                        + Right() * (inp.moveStrafe * def.strafeSpeed * SpeedMult);
                    state = planar.sqrMagnitude > 0.01f ? FState.Walk : FState.Idle;
                }
                vel.x = planar.x;
                vel.z = planar.z;
            }
        }

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

        void StartMove(MoveData3D m)
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
            vel.z = 0;
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
                AddMeter(move.meterGainWhiff);
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
            Color c = def.bodyColor;
            if (def.installType == InstallType.StanceSwap && stanceB)
                c = def.stanceBColor;
            if (installed)
                c = def.installColor;
            if (body != null && body.enabled)
                PrimitiveArt3D.Tint(body, c);
        }

        // ---- physics ----
        void Physics(float dt)
        {
            if (!grounded)
                vel.y -= def.gravity * dt;
            var p = transform.position + vel * dt;
            if (p.y <= 0f)
            {
                p.y = 0f;
                vel.y = 0;
                grounded = true;
                if (state == FState.Jump)
                    state = FState.Idle;
            }
            else
                grounded = false;

            // keep both fighters inside a circular arena
            var planar = new Vector2(p.x, p.z);
            if (planar.magnitude > ArenaRadius)
            {
                planar = planar.normalized * ArenaRadius;
                p.x = planar.x;
                p.z = planar.y;
            }
            transform.position = p;
        }

        // ---- receiving hits (called by CombatSystem3D). dir = XZ unit, attacker -> defender ----
        public void TakeHit(MoveData3D m, Vector3 dir, bool blocked)
        {
            dir = Flatten(dir);
            if (blocked)
            {
                state = FState.Blockstun;
                stunTimer = m.blockstun;
                vel.x = dir.x * (m.knockback * 0.4f);
                vel.z = dir.z * (m.knockback * 0.4f);
                AddMeter(m.meterGainBlock);
                DoFlash(new Color(0.6f, 0.8f, 1f));
                return;
            }
            health = Mathf.Max(0, health - Mathf.RoundToInt(m.damage));
            vel.x = dir.x * m.knockback;
            vel.z = dir.z * m.knockback;
            if (m.launch > 0f)
            {
                vel.y = m.launch;
                grounded = false;
            }
            DoFlash(new Color(1f, 0.5f, 0.5f));
            if (health <= 0)
            {
                state = FState.Dead;
                vel = new Vector3(dir.x * 3f, 6f, dir.z * 3f);
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

        public void AddMeter(int amt) => meter = Mathf.Clamp(meter + amt, 0, 100);

        void DoFlash(Color c)
        {
            flash = 1f;
            if (body != null && body.enabled)
                PrimitiveArt3D.Tint(body, c);
        }

        public void ResetForRound(Vector3 startPos, Vector3 faceDir)
        {
            health = def.maxHealth;
            meter = 0;
            vel = Vector3.zero;
            installed = false;
            stanceB = false;
            installTimer = 0;
            stanceCooldown = 0;
            state = FState.Idle;
            move = null;
            grounded = true;
            facingDir = Flatten(faceDir);
            transform.position = new Vector3(startPos.x, 0f, startPos.z);
            ApplyFacing();
            RefreshColor();
        }
    }
}
