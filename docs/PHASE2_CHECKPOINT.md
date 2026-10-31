# Wispwright: Phase 2 Scripted Attack & Survival Architecture & Specification

## 1. Phase 2 Overview & Objectives

Phase 2 builds directly upon the accepted Phase 1 construction sandbox, adding a deterministic, scripted two-projectile siege sequence. It validates:
- Reliable, predictable projectile delivery and collision responses without physics glitches.
- Progressive piece damage classification (`INTACT` $\to$ `CRACKED` $\to$ `BROKEN` $\to$ `LOST`).
- Wisp hazard detection (direct projectile strikes and falling debris) triggering non-violent dispersal.
- Post-impact physics settlement with cumulative battlefield damage carryover between sequential attacks.
- Exact pre-siege snapshot preservation and zero-drift restoration via **Restore Design**.
- Complete lifecycle hygiene: single-projectile containment, bounded trajectory lifetimes, and zero listener/body/constraint leakage.

---

## 2. Architecture & State Ownership

```
┌─────────────────────────────────────────────────────────────┐
│                 Authoritative Logical State                 │
│                        (LevelStore)                         │
│  • Schema Version 1          • PlacedPieces (with Condition)│
│  • Inventory Counts          • Wisps (Status & Dispersal)   │
│  • Pre-Siege Deep Snapshot   • Undo / Redo History          │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│   Construction / Edit Mode   │ │       SiegeController       │
│  • Interactive Gizmos        │ │  • 10-Phase State Machine   │
│  • Snapping & Anchors        │ │  • Authored Projectile Queue│
│  • Zero-Stress Placement     │ │  • Damage & Hazard Arbiters │
└──────────────────────────────┘ └─────────────┬───────────────┘
                                               │
                                               ▼
                                 ┌─────────────────────────────┐
                                 │   Matter.js Physics Bridge  │
                                 │  • Fixed 60Hz Step (16.6ms) │
                                 │  • Single Active Projectile │
                                 │  • Impulse Collision Hooks  │
                                 │  • Non-Colliding Wisp Sensor│
                                 │  • Settling Energy Monitor  │
                                 └─────────────┬───────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Decoupled Canvas2D Renderer                 │
│                 (60 FPS RequestAnimationFrame)              │
│  Layer 0: Alchemical Sky, Celestial Glyphs, Backdrop        │
│  Layer 1: Ground Bedrock, Loss Boundary, Bedrock Anchors    │
│  Layer 2: Pieces (Intact / Cracked Fissures / Splintered)   │
│  Layer 3: Wisps (Eye Tracking Active Projectile / Dispersal)│
│  Layer 4: Pneumatic Western Launcher, Trajectory & Reticle  │
│  Layer 5: Active Flying Projectile & Spark / Molten Trails  │
│  Layer 6: Comic Intro Dialogue & Dynamic Speech Bubbles     │
└─────────────────────────────────────────────────────────────┘
```

### Cumulative Inter-Attack World State
1. **Pre-Siege Snapshot**: Captured immutably before the first attack begins.
2. **Attack 1 Resolution**: When the Pyrite Spark impacts and the fortress settles, remaining piece positions, rotations, and condition states (`CRACKED` / `BROKEN`) are synchronized back to the `LevelStore`.
3. **Attack 2 Inheritance**: Grom the Slag-Brute is launched against the already-damaged, altered fortress structure, demonstrating true cumulative siege dynamics.
4. **Lossless Restoration**: Calling **Restore Design** reverts all pieces and wisps back to their pre-siege snapshot with 0.0px coordinate drift and intact conditions.

---

## 3. Siege State Machine

The `SiegeController` executes a strict 10-phase sequence:

```
[PRE_ATTACK_VALIDATION]
        │
        ▼
[ENEMY_INTRODUCTION] (1.2s character dialogue & banner)
        │
        ▼
[AIMING_PREVIEW]     (1.0s pneumatic wind-up & dashed arc)
        │
        ▼
[PROJECTILE_IN_FLIGHT] (Matter.js body flying along ballistic arc)
        │
        ▼ (on first solid impact)
[IMPACT_RESOLUTION]  (Impulse measurement, damage transitions, audio cues)
        │
        ▼
[SETTLING]           (Monitoring total kinetic energy until threshold < 0.05 J)
        │
        ▼
[ATTACK_RESOLVED]    (Sync transforms & piece conditions to LevelStore)
        │
        ├─► [INTERMISSION] ──► (Next attack queued) ──► [ENEMY_INTRODUCTION]
        │
        └─► [SEQUENCE_COMPLETE] (All attacks done) ──► [SiegeCompleteModal]
```

---

## 4. Authored Projectiles Specification

| Parameter | Attack 1: Pyrite Spark | Attack 2: Grom the Slag-Brute |
| :--- | :--- | :--- |
| **Archetype** | Fast, standard-mass kinetic projectile | Heavy, dense, devastating siege boulder |
| **Origin Point** | $(120, 480)$ | $(120, 500)$ |
| **Launch Velocity** | $(14.2, -7.8)\text{ px/tick}$ | $(13.2, -5.2)\text{ px/tick}$ |
| **Radius** | $14\text{ px}$ | $22\text{ px}$ |
| **Mass** | $2.8\text{ kg}$ | $10.5\text{ kg}$ ($\approx 3.75\times$ mass) |
| **Friction / Restitution**| $0.4 / 0.15$ | $0.8 / 0.05$ |
| **Visuals** | Fiery orange core, brass goggles, golden comet tail | Molten slag sphere, iron nosecone, volcanic smoke motes |
| **Audio Voice** | High-velocity whistle & sharp metallic clack | Deep volcanic rumble & booming earth-shattering thud |

---

## 5. Damage Thresholds & Condition Transitions

Collision impulses are evaluated in Matter.js collision events using normal and tangential relative impact velocities multiplied by reduced mass.

| Material | Cracked Threshold ($J_{\text{crack}}$) | Broken Threshold ($J_{\text{break}}$) | Lost Threshold |
| :--- | :--- | :--- | :--- |
| **Timber Beam** | $12.0\text{ Ns}$ | $28.0\text{ Ns}$ | $y > 960\text{ px}$ (Fallen into void) |
| **Wood Block** | $15.0\text{ Ns}$ | $32.0\text{ Ns}$ | $y > 960\text{ px}$ |
| **Cut Stone Block**| $35.0\text{ Ns}$ | $75.0\text{ Ns}$ | $y > 960\text{ px}$ |

### Visual Piece State Manifestations
- **`INTACT`**: Pristine alchemical runes, clean wood grain or smooth dressed stone.
- **`CRACKED`**: Procedural hairline fractures etched across the surface, structural integrity intact.
- **`BROKEN`**: Jagged fissures, splintered corners, chipped stone fragments.
- **`LOST`**: Removed from simulation after crossing loss boundary $y > 960\text{ px}$.

---

## 6. Wisp Hazard Detection & Dispersal

Wisps are non-colliding circular sensor bodies (`isSensor: true`, `collisionFilter: { mask: 0 }`) positioned at radius $20\text{ px}$.

Dispersal occurs if:
1. **Direct Projectile Hit**: An active projectile enters the wisp sensor boundary.
2. **Falling Debris Hit**: A fortress piece enters the wisp sensor with kinetic velocity $v > 1.5\text{ px/tick}$ or calculated impact impulse $> 3.5\text{ Ns}$.

### Non-Violent Dispersal Behavior
- Wisps do not splatter or explode violently.
- Upon contact, the wisp gasps with cartoon surprise eyes, releases an ethereal upward vapor ring, and dissipates into a gentle sparkle constellation accompanied by an alchemical wind-chime audio tone.
- Dispersed wisps are marked `isDispersed = true` and update the live HUD counter (`Wisps: X / 5`).

---

## 7. Acceptance Test Results (10 Scenarios)

All 10 Phase 2 acceptance scenarios pass autonomously:

- **Scenario A (Untouched Preset under Attack 1)**: Pyrite Spark strikes upper lintel; structure deflects shot; wisps survive; state reaches Stable.
- **Scenario B (Untouched Preset under Cumulative Attack 2)**: Grom strikes lower tier; weakened joints collapse under heavy mass; remaining wisps evaluated.
- **Scenario C (Solid Fortified Shelter)**: Player reinforced double-lintel roof completely protects all 5 wisps with zero dispersals.
- **Scenario D (Heavy Stone Barrier)**: Stone block absorbs direct impact from Pyrite Spark without cracking ($J < 35.0\text{ Ns}$).
- **Scenario E (Cantilever Collapse)**: Overhanging unsupported beam rotates and topples upon impact.
- **Scenario F (Direct Wisp Hit)**: Exposed wisp struck directly by projectile triggers immediate peaceful dispersal.
- **Scenario G (Debris Wisp Hit)**: Heavy stone falling at speed onto wisp triggers contact dispersal.
- **Scenario H (Cascading Collapse)**: Attack 1 creates cracked joints and slight tilt; Attack 2 causes catastrophic cumulative structural failure.
- **Scenario I (Multi-Cycle Replay Determinism)**: Consecutive runs from the same initial design yield byte-identical outcomes.
- **Scenario J (Restore Design Zero Drift)**: Restoring pre-siege design matches original snapshot with 0.0px coordinate difference.

---

## 8. Checkpoint Acceptance

Phase 2 is fully validated, architecturally sound, and locked as a stable baseline for future phases.
