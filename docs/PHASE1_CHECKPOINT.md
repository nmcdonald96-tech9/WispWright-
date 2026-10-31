# Wispwright: Phase 1 Construction Sandbox Architecture & Specification

## 1. Project Architecture & State Ownership

Wispwright follows a strict **Two-World Architecture** separating logical design state from ephemeral physics simulation:

```
┌─────────────────────────────────────────────────────────────┐
│                 Authoritative Logical State                 │
│                      (LevelStore)                           │
│  • Schema Version 1          • PlacedPieces Array           │
│  • Inventory Counts          • Bedrock Anchors              │
│  • Protected Wisps Array     • Undo / Redo Command History  │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│   Construction / Edit Mode   │ │    Stability Simulation     │
│  • Touch / Pointer Gestures  │ │  • Matter.js Dynamic World  │
│  • Lift Offset (48px)        │ │  • Fixed 60Hz Step (16.6ms) │
│  • Magnetic Sockets & SAT    │ │  • Bedrock Anchor Welds     │
│  • Zero-Stress Placement     │ │  • Settlement Detector      │
└──────────────┬───────────────┘ └─────────────┬───────────────┘
               │                               │
               └───────────────┬───────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                Decoupled Canvas2D Renderer                  │
│                 (60 FPS RequestAnimationFrame)              │
│  Layer 0: Alchemical Sky, Celestial Glyphs, Backdrop        │
│  Layer 1: Ground Bedrock, Anchor Sockets, Loss Boundary     │
│  Layer 2: Prebuilt Pillars & Player Placed Pieces           │
│  Layer 3: 5 Elemental Wisps (Idle Bobbing & Eye Tracking)   │
│  Layer 4: Gizmos (Lift Tether, Snap Guidance, Overlap Ring) │
└─────────────────────────────────────────────────────────────┘
```

### Authoritative State Ownership
- The **`LevelStore`** is the single source of truth for the editable fortress design.
- **Physics bodies are strictly derived projections**: They are created on-demand when entering "Test Fortress" and completely destroyed upon returning to construction mode. Live physical transforms are never saved back into the logical layout.
- **Lossless Restoration**: A deep clone snapshot of `LevelState` is captured immediately before entering simulation. When restoring, the physics world is torn down and the saved snapshot is rehydrated, guaranteeing 0.0px coordinate drift.

---

## 2. Construction-Mode State Machine

```
   [IDLE] ─── PointerDown on Tray Card ──────► [DRAGGING_NEW]
     │                                              │
     ├─── PointerDown on Placed Piece (>8px) ──► [DRAGGING_PLACED]
     │                                              │
     ├─── Tap on Placed Piece (<=8px) ─────────► [PIECE_SELECTED] (Rotate / Return)
     │                                              │
     └─── [TEST FORTRESS] Click ───────────────► [TESTING_SIMULATION]
                                                    │
                                                    ▼
                                          [SETTLED_EVALUATION]
                                                    │
                                                    ▼
                                         [RESTORE_PRE_TEST_DESIGN] ──► [IDLE]
```

---

## 3. Piece & Material Definitions

| Material | Dimensions | Density | Friction | Restitution | Role & Physical Characteristics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Timber Beam** | $120 \times 24\text{ px}$ | $0.0012$ | $0.85$ | $0.02$ | Lightweight span. Ideal for lintels, ceilings, and horizontal bridges. |
| **Wood Block** | $48 \times 48\text{ px}$ | $0.0012$ | $0.88$ | $0.02$ | Lightweight spacer, vertical riser, or wooden foundation block. |
| **Cut Stone Block** | $48 \times 48\text{ px}$ | $0.0068$ | $0.98$ | $0.00$ | Heavy quarried granite ($\approx 5.5\times$ wood mass). High compression stability; will topple or crush unsupported wooden spans. |

---

## 4. Snapping vs. Environmental Anchors

A critical architectural distinction is maintained between **Surface Snapping** and **Environmental Anchors**:

1. **Surface Snapping (Alignment Aid Only)**:
   - Pieces expose perimeter face sockets (face centers, corner cap alignments).
   - Approaching within $26\text{px}$ snaps position and orthogonally snaps rotation ($0^\circ, 45^\circ, 90^\circ$).
   - **Physics Reality**: Snapping merely positions pieces touching flush. In simulation mode, un-anchored stacked pieces rely purely on normal contact force and dry friction; they can slide, tilt, or topple when disturbed.
2. **Environmental Anchors (Rigid Welds)**:
   - Three fixed bedrock socket points at $y = 780$ (Western, Center, Eastern pylons).
   - Approaching within $32\text{px}$ locks the piece with a cyan runic reticle.
   - **Physics Reality**: In simulation mode, anchored pieces receive a rigid `Constraint` pinning their bottom edge directly to the bedrock socket (`length: 0`, `stiffness: 1.0`), allowing cantilevered overhangs.
   - Anchor bodies are configured as non-colliding static sensors (`isSensor: true`, `collisionFilter: { mask: 0 }`), preventing overlapping contact explosions.

---

## 5. Undo & Redo Operation Model

- The `LevelStore` maintains an immutable command history stack (depth $\le 50$):
  - `PLACE`: Deducts inventory $\rightarrow$ adds piece. Undo: returns piece to inventory.
  - `MOVE`: Updates piece position/rotation/anchor. Undo: reverts to previous transform.
  - `ROTATE`: Rotates piece in $45^\circ$ or $5^\circ$ steps. Undo: reverts angle.
  - `REMOVE`: Removes piece from board $\rightarrow$ increments inventory. Undo: re-places piece.
- Symmetrical inventory balance is guaranteed across all undo, redo, and reset cycles.

---

## 6. Physics-Test & Simulation Lifecycle

1. **Test Start (`setMode('TESTING_SIMULATION')`)**:
   - Takes immutable pre-test snapshot via `store.captureSnapshot()`.
   - Clears existing bodies/constraints via `physicsBridge.teardown()`.
   - Derives new `Matter.World`:
     - Static ground at $y = 780$.
     - Static anchor sensors at $y = 780$.
     - Dynamic bodies for each piece with initial velocities $(0, 0)$ and zero initial impulses.
     - Rigid constraints for pieces attached to anchors.
   - Pre-simulation inspection runs via `Detector.collisions()` verifying zero invalid overlaps.
2. **Fixed Timestep Simulation (`physicsBridge.step(16.666)`)**:
   - Updates Matter.js using a fixed $16.666\text{ ms}$ ($60\text{Hz}$) delta step.
   - Monitored by the Stability Detector: tracks total kinetic energy $\sum \frac{1}{2}mv^2 + \frac{1}{2}I\omega^2$.
   - When kinetic energy remains $< 0.05\text{ J}$ for consecutively $0.8\text{s}$, the structure enters `SETTLED`.
3. **Restore Design (`setMode('CONSTRUCTION')`)**:
   - Discards all dynamic physics bodies via `teardown()`.
   - Restores the saved pre-test snapshot to `LevelStore`.
   - Reset timing and return to interactive editing with 0.0px coordinate drift.

---

## 7. Local Persistence Schema

- **Key**: `wispwright_level_save_v1` in `localStorage`.
- **Validation**:
  - `schemaVersion === 1`
  - Array validation on `pieces`, `anchors`, `wisps`.
  - Non-negative integer validation on `inventory.wood_beam`, `inventory.wood_block`, `inventory.stone_block`.
- **Safe Fallback**: If loaded JSON is corrupt, altered, or fails schema validation, the store logs a warning and restores `INITIAL_LEVEL_STATE` automatically.
- **Clear Control**: Accessible via Developer Diagnostics (`Clear Saved Prototype`).

---

## 8. Mobile Input Model

- **Unified Pointer Events**: Touch, pen, and mouse unified via `pointerdown`, `pointermove`, `pointerup`, `pointercancel`.
- **Lift Offset ($48\text{px}$)**: When dragging on a touchscreen, the ghost piece hovers $48\text{px}$ above the fingertip so contact edges remain visible.
- **Drag Threshold ($8\text{px}$)**: Movement below $8\text{px}$ selects the piece (opening rotation controls); movement beyond $8\text{px}$ engages repositioning. Empty ground engages camera pan.
- **Visible Controls**: Dual-touch pinch-to-zoom is supported, alongside accessible visible `[+]`, `[-]`, and `[Reset View]` buttons.

---

## 9. Known Prototype Limitations

1. **Material Set**: Currently limited to Timber Beam, Wood Block, and Stone Block.
2. **Wisps in Passive Observation**: Wisps animate with idle breathing and eye tracking, but do not interact with debris.
3. **No Dynamic Joints between Arbitrary Player Pieces**: Pieces stacked in mid-air rely on friction and normal forces; cross-piece nailing or rope tying is reserved for future brace mechanics.
