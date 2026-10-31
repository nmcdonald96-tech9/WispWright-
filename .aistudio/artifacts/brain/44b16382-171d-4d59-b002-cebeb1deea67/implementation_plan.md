# Architecture & Implementation Plan: Wispwright (Prototype Vertical Slice)

A mobile-first 2D physics siege and fortress-defense prototype set in an alchemical fantasy world. The prototype answers a single core question: *Is it satisfying, stable, and intuitive to construct a small physics-based fortress on a smartphone?*

---

## User Review & Critical Decisions

> [!IMPORTANT]
> This document proposes the full technical architecture and execution blueprint for the initial playable vertical slice. The design focuses strictly on touch-first construction feel, physical stability testing, and lossless restoration without implementing out-of-scope combat, enemies, or progression systems.

- **Physics Engine Decision**: **Matter.js** is recommended over WASM-based Rapier2D or Box2D ports for this vertical slice. It provides zero-bundle WASM overhead, complete deterministic memory re-initialization during Test ↔ Edit cycles, robust constraint (joint/pin) mechanics, and effortless state serialization.
- **Construction Separation**: The application maintains a strict **Two-World Architecture**:
  1. *Geometric Build State (Static/Kinematic)*: Pure data model where pieces are freely translated, rotated, and snapped with zero gravity collapse or jitter.
  2. *Physical Simulation World (Dynamic)*: Spawned on-demand when entering "Test Stability" mode, simulated with realistic mass, friction, gravity, and constraint breaking thresholds, and completely torn down on "Reset/Edit".
- **Mobile Touch Usability**: To avoid finger occlusion on mobile screens, dragged pieces utilize an ergonomic **lift offset** (hovering 45px above the touch contact point), accompanied by high-contrast snap reticles and a magnetic alignment threshold.

---

## 1. Recommended Technology & Physics Approach

### 2D Physics Solution Evaluation

| Engine | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- |
| **Matter.js** *(Recommended)* | Pure JavaScript, zero WASM loading friction, robust constraint/spring model, native collision filters, straightforward state serialization, trivial memory teardown between iterations. | Requires tuned position/velocity iterations (8–10) to prevent resting jitter on heavy vertical stacks. | **Selected**: Best fit for rapid mobile web iteration, instant reset cycles, and zero GC leaks. |
| **Rapier2D (WASM)** | Modern XPBD solver, exceptional stacking stability for heavy stone on wood, high performance. | Asynchronous WASM initialization complexity, difficult manual body state hot-reloads, higher bundle footprint and cross-origin isolation quirks in some embedded webviews. | Deferred to production phase if stacking complexity exceeds Matter.js capabilities. |
| **Planck.js (Box2D)** | Classic Box2D physics, good stacking stability. | Verbose C++-style JS API, difficult serialization/deserialization for undo/redo, less active maintenance. | Not recommended. |

### Physics Configuration for Materials

To deliver tactile contrast between wood and stone without tunneling or jitter:
- **Wood Beam (`120 x 20 px`)**: Density $0.001$, Friction $0.8$, Restitution $0.05$. Responsive, lightweight, easy to bridge gaps.
- **Wood Block (`40 x 40 px`)**: Density $0.001$, Friction $0.8$, Restitution $0.05$. Compact structural filler.
- **Stone Block (`40 x 40 px`)**: Density $0.004$ (4x heavier than wood), Friction $0.95$, Restitution $0.01$. Highly stable under vertical compression, but will crush or topple unbraced wooden spans.
- **Solver Iterations**: 10 position iterations, 8 velocity iterations, resting velocity sleep threshold (`sleepThreshold: 60`).

---

## 2. Major Architecture Decisions

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React UI Shell                                │
│   Top HUD: [Undo] [Redo] [Clear] [Snap: ON] [TEST STABILITY / EDIT]    │
│   Bottom Tray: [Wood Beam (x6)] [Wood Block (x8)] [Stone Block (x4)]   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ State Dispatch
┌────────────────────────────────────▼───────────────────────────────────┐
│                        Level State Store (Pure)                        │
│   • Schema Version: 1               • Placed Pieces Array              │
│   • Inventory Count Map             • Environmental Anchors            │
│   • History Stack (Undo / Redo)     • Protected Wisps Array            │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │ Edit & Snap Math                         │ Test Mode Init
┌──────────────▼──────────────────────────┐  ┌────────────▼──────────────┐
│       Construction System (Build)       │  │   Physics Simulation      │
│  • Touch / Pointer Gestures             │  │   • Matter.js Engine      │
│  • Magnetic Surface Snapping            │  │   • Active Gravity        │
│  • Anchor Socket Alignment              │  │   • Rigid Constraints     │
│  • Kinematic Preview & Collision Check  │  │   • Stability Detector    │
└──────────────┬──────────────────────────┘  └────────────┬──────────────┘
               │                                          │
               └─────────────────────┬────────────────────┘
                                     │ Render Feed
┌────────────────────────────────────▼───────────────────────────────────┐
│                     Canvas2D Renderer (60 FPS Loop)                    │
│   Layer 0: Alchemical Sky & Distant Parallax Citadel                   │
│   Layer 1: Stable Ground Surface & Environmental Anchor Sockets        │
│   Layer 2: Prebuilt Frame & Placed Defense Pieces                      │
│   Layer 3: 5 Elemental Wisps (Idle animation, gaze tracking)           │
│   Layer 4: Snap Indicators, Ghost Drag Preview, Connection Links       │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Decoupled 60fps Canvas Loop**: The Canvas renders directly via `requestAnimationFrame` with zero React re-renders during active dragging or physical simulation. React only updates when discrete events occur (e.g., inventory count changes, mode toggle).
2. **Two-World Clean Boundary**: 
   - In **Construction Mode**, the physics engine is paused or unmounted. Pieces are static kinematic rectangles positioned purely by mathematical transformations and snapping logic.
   - In **Test Mode**, a clean Matter.js world is created from the snapshot. Rigid bodies with actual mass, friction, and joint constraints are simulated.
3. **Lossless Snapshot & Restoration**: Before any stability test begins, an immutable JSON snapshot of the level state is captured. Entering "Edit" destroys all physics bodies and reloads the exact pre-test geometry.
4. **Coordinate Space Independence**: All game logic operates in fixed **World Space** coordinates ($800 \times 1200$ virtual units). The Camera subsystem handles viewport scale, pan, pinch-zoom, and transforms screen pointer events (`clientX`, `clientY`) into world coordinates.

---

## 3. Proposed File and Module Structure

```
src/
├── game/
│   ├── types.ts                  # Pure TypeScript interfaces & schemas
│   ├── config.ts                 # Material physics properties, dimensions, world bounds
│   ├── state/
│   │   ├── levelState.ts         # Level store, history manager (undo/redo), inventory
│   │   └── defaultLevel.ts       # Starting level: 5 wisps, ground, anchors, prebuilt frame
│   ├── math/
│   │   ├── geometry.ts           # Vector2D, OBB (Oriented Bounding Box), ray-box intersections
│   │   └── snapSolver.ts         # Surface snapping, corner alignment, anchor socket locking
│   ├── physics/
│   │   ├── physicsBridge.ts      # Instantiates Matter.js world from LevelState
│   │   ├── materials.ts          # Friction, density, restitution factories
│   │   └── stabilityDetector.ts  # Measures total kinetic energy & body settling
│   ├── input/
│   │   ├── gestureController.ts  # Touch/pointer tracking, drag lift offset, pinch-zoom
│   │   └── camera.ts             # World-to-screen transform, zoom clamping, boundary pan
│   └── render/
│       ├── canvasRenderer.ts     # Main 60fps render loop
│       ├── renderEnvironment.ts  # Alchemical backdrop, ground, anchor points, boundary
│       ├── renderPieces.ts       # Texturing/shading for Wood Beam, Wood Block, Stone Block
│       ├── renderWisps.ts        # Original vaporous elemental wisps with gaze tracking
│       └── renderGizmos.ts       # Snap reticles, connection indicators, drag lift ghosts
├── components/
│   ├── GameShell.tsx             # Root container, orientation guardian, viewport sizing
│   ├── TopHUD.tsx                # Undo, Redo, Snap toggle, Reset, Test/Edit primary button
│   ├── InventoryTray.tsx         # Mobile-first bottom drawer with draggable material cards
│   ├── PieceControls.tsx         # Floating quick-rotate (45°/90°) & delete actions
│   └── StabilityFeedback.tsx     # Motion gauge & settlement indicator during testing
├── App.tsx                       # App entry point
└── main.tsx                      # React root
```

---

## 4. Game-State Model

```typescript
export type MaterialType = 'wood_beam' | 'wood_block' | 'stone_block';

export interface Vector2 {
  x: number;
  y: number;
}

export interface SnapSocket {
  id: string;
  localPosition: Vector2;
  normal: Vector2; // Outward surface normal
  type: 'surface' | 'anchor';
}

export interface PlacedPiece {
  id: string;
  type: MaterialType;
  position: Vector2;
  rotation: number; // In radians
  isPrebuilt: boolean; // Immutable starting frame pieces
  anchorAttachmentId?: string; // ID of environmental anchor if secured
}

export interface WispEntity {
  id: string;
  name: string;
  element: 'ignis' | 'terra' | 'aer' | 'aqua' | 'aether';
  position: Vector2;
  radius: number;
  idlePhase: number;
}

export interface EnvironmentalAnchor {
  id: string;
  position: Vector2;
  type: 'ground_bedrock' | 'cliff_wall';
}

export interface LevelState {
  schemaVersion: 1;
  levelId: string;
  worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
  lossBoundaryY: number; // Falling below this marks piece as lost
  anchors: EnvironmentalAnchor[];
  wisps: WispEntity[];
  pieces: PlacedPiece[];
  inventory: Record<MaterialType, number>;
}

export interface LevelSnapshot {
  timestamp: number;
  levelState: LevelState;
}
```

---

## 5. Construction-Mode State Machine

```
              ┌───────────────┐
              │     IDLE      │◄─────────────────────────────┐
              └──┬─────────┬──┘                              │
                 │         │                                 │
     PointerDown │         │ PointerDown                     │
     on New Card │         │ on Existing Piece               │
                 ▼         ▼                                 │
      ┌────────────┐     ┌────────────────┐                  │
      │DRAGGING_NEW│     │DRAGGING_PLACED │                  │
      └──────┬─────┘     └────────┬───────┘                  │
             │                    │                          │
             └──────────┬─────────┘                          │
                        │                                    │
                        ▼                                    │
              ┌──────────────────┐                           │
              │  SOLVING_SNAPS   │                           │
              │  (Find nearest   │                           │
              │   anchor/edge)   │                           │
              └─────────┬────────┘                           │
                        │                                    │
                        ▼ PointerUp                          │
              ┌──────────────────┐                           │
              │ PLACE_OR_RETURN  │───────────────────────────┤
              │ (Valid bounds?   │                           │
              │  No overlap?)    │                           │
              └──────────────────┘                           │
                                                             │
   [TEST STABILITY] Clicked                                  │
                 │                                           │
                 ▼                                           │
       ┌────────────────────┐                                │
       │ SIMULATING_PHYSICS │                                │
       │ (Active Gravity,   │                                │
       │  Kinetic Monitor)  │                                │
       └─────────┬──────────┘                                │
                 │                                           │
                 ▼ Motion < Threshold                        │
       ┌────────────────────┐                                │
       │ SETTLED_SUCCESSFUL │                                │
       └─────────┬──────────┘                                │
                 │                                           │
                 └─────────► [EDIT / RESTORE] ───────────────┘
```

1. **`IDLE`**: Free camera pan/pinch; tapping a placed piece selects it and reveals rotate/delete affordances.
2. **`DRAGGING_NEW`**: Instantiated from inventory tray; item follows pointer with an upward vertical offset of $45\text{px}$.
3. **`DRAGGING_PLACED`**: Moves existing piece; original position preserved in temporary memory for cancel/invalid placement.
4. **`SOLVING_SNAPS`**: Computes distance to all candidate sockets within $24\text{px}$. Snaps position and rotational angle ($0^\circ, 45^\circ, 90^\circ$).
5. **`SIMULATING_PHYSICS`**: Input locks out piece editing; Matter.js steps at 60Hz; kinetic velocity monitored.
6. **`SETTLED`**: Structure proved stable; displays celebratory resonance shimmer across the wisps.

---

## 6. Input & Gesture Model

- **Unified Pointer Events**: Using `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` on the canvas to seamlessly support touchscreens, pens, and desktop mouse dragging without event duplication.
- **Finger Occlusion Offset (Lift Preview)**: On touch screens, dragging a piece directly under the fingertip hides the contact boundaries. The system offsets the target position upward by $45\text{px}$ in screen coordinates while a drag is active.
- **Multi-Touch Disambiguation**:
  - `1 pointer on piece`: Piece dragging and snap calculation.
  - `1 pointer on empty terrain`: Smooth world camera panning with velocity damping.
  - `2 pointers anywhere`: Dual-touch pinch-to-zoom (clamped between $0.6\times$ and $1.8\times$) and two-finger pan.
- **Rotation Affordances**:
  - Tapping a selected piece reveals a radial mini-toolbar with `⟲ 45°`, `⟳ 45°`, and `🗑 Return to Inventory`.
  - Desktop keyboard shortcuts: `R` (rotate $45^\circ$), `Delete`/`Backspace` (return to inventory), `Ctrl+Z` (undo), `Ctrl+Y` (redo), `Space` (toggle test mode).

---

## 7. Snapping and Connection Model

### Snapping Math & Hierarchy
1. **Environmental Anchor Points (Highest Priority)**:
   - Fixed points on ground bedrock or ancient ruins.
   - Snapping distance: $30\text{px}$.
   - Creates a **Rigid Physical Weld** in simulation mode, anchoring the piece to the static earth.
2. **Surface & Edge Snapping (Medium Priority)**:
   - Beams and blocks expose modular contact sockets along their perimeter:
     - Wood Beam: 3 sockets along long edges (left, center, right), 1 on each end cap.
     - Wood/Stone Block: 1 socket centered on each of the 4 faces, plus 4 corner alignments.
   - Snapping distance: $20\text{px}$.
   - Snaps position and snaps orientation to orthogonal / $45^\circ$ angles.
3. **Physics Reality Principle**:
   - Snapping aligns geometry neatly, but in simulation mode, pieces touching without an anchor socket rely on **realistic dry friction and normal contact forces**.
   - If two pieces are snapped edge-to-edge and supported by an anchor, a rigid joint constraint with finite stiffness is created in Matter.js, allowing players to build cantilevered structures that can still bend or snap under excessive torque.
4. **Snap Toggle**:
   - A persistent HUD toggle (`Snap: ON / OFF`) allows players to disable snapping for freeform, organic stacking.

---

## 8. Save, Snapshot, and Restoration Strategy

### Pre-Test Snapshotting
1. When the player taps **"Test Stability"**, the application captures an in-memory clone of `LevelState`.
2. The UI state switches to `SIMULATING_PHYSICS`.
3. Matter.js receives rigid bodies mapped 1-to-1 from the `pieces` array.
4. While simulating, pieces may tumble, shift, or fall below `lossBoundaryY`.
5. Tapping **"Edit / Reset"** triggers:
   ```typescript
   function restorePreTestDesign() {
     teardownPhysicsWorld();
     activeLevelState = deepClone(savedSnapshot.levelState);
     recomputeRenderBuffers();
     mode = 'CONSTRUCTION';
   }
   ```
6. **100% Deterministic Restoration**: Because the simulation world is strictly transient and discarded upon return to edit mode, not a single pixel of coordinate drift occurs.

### Undo / Redo Architecture
- Implemented as an immutable command stack with a maximum depth of 50 steps:
  - `PlacePieceCommand`
  - `MovePieceCommand`
  - `RotatePieceCommand`
  - `RemovePieceCommand`
- Each command contains `undo()` and `redo()` actions that manipulate `LevelState` and update inventory counts symmetrically.

---

## 9. Mobile Performance Considerations

- **Direct Canvas 2D Pipeline**: Avoid DOM-based pieces or SVG trees which trigger costly layout recalcs during drag operations.
- **Zero-Allocation Render Loop**: Vector objects, transform matrices, and bounding boxes are recycled from a pre-allocated pool rather than garbage-collected every frame.
- **DPI Capping**: High-density mobile displays ($3\times$ Retina) are clamped to `Math.min(window.devicePixelRatio, 2.0)` to eliminate mobile GPU fill-rate thermal throttling.
- **Viewport Safe Areas**: UI docks and HUD bars observe `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` so buttons are never obscured by mobile home bars or camera notches.

---

## 10. Technical Risks & Proposed Mitigations

| Risk | Severity | Mitigation |
| :--- | :--- | :--- |
| **Physics Stacking Jitter** (pieces vibrating on top of each other) | High | Set `sleepThreshold: 60` in Matter.js, raise position solver iterations to 10, and zero out restitution ($e = 0.01$) for stone and wood. |
| **Mobile Touch Hijack** (browser pulling page to refresh or scrolling) | High | Apply `touch-action: none` to the entire game viewport canvas and prevent default touchmove gestures. |
| **Overlap / Collision Tunneling** during placement | Medium | Run an instantaneous Separating Axis Theorem (SAT) check during drag; if an invalid overlap occurs, render the preview in translucent red and prohibit dropping. |
| **Memory Bloat across Test/Edit Cycles** | Medium | Explicitly call `Composite.clear(world, false, true)` and remove all constraints and event listeners when switching back to edit mode. |

---

## 11. Phase 1 Implementation Sequence

1. **Step 1: Core Schemas & Math Engine**
   - Implement `types.ts`, `geometry.ts` (SAT overlap checks, OBB math), and `snapSolver.ts`.
   - Add unit tests via `node:test` verifying snap distance math, rotation clamping, and undo/redo state preservation.
2. **Step 2: Canvas Rendering & World Coordinate System**
   - Implement `camera.ts` with responsive world scaling.
   - Render the environment (alchemical sky, stone platform, anchor sockets, and boundary markers).
   - Render original procedural animated wisps (vaporous core, pulsing glow, eye tracking pointer).
3. **Step 3: Construction & Gesture Interaction**
   - Build `gestureController.ts` handling single-touch drag with lift offset, two-touch pinch/pan.
   - Implement snapping feedback (glowing alignment guides, magnetic socket locks).
   - Add piece selection, rotation, and inventory returns.
4. **Step 4: UI Shell & Inventory Tray**
   - Create mobile-friendly React HUD (Undo, Redo, Snap Toggle, Clear, Test Mode).
   - Create bottom inventory dock with live piece counts and draggable cards.
5. **Step 5: Physics Simulation & Settlement Detector**
   - Integrate Matter.js bridge mapping `PlacedPiece` to rigid bodies with wood/stone mass properties.
   - Construct rigid constraints for anchor attachments.
   - Implement stability evaluation meter that tracks kinetic energy until the structure comes to rest.
6. **Step 6: Lossless Restoration & Playtesting Polish**
   - Implement instant snapshot restoration on "Edit / Reset".
   - Add procedural Web Audio synth clicks for snapping, rotation, and stone/wood clacks.
   - Verify touch usability across mobile viewport sizes.

---

## 12. Questions & Assumptions

### Operational Assumptions
1. **Scope Boundaries**: Combat projectiles, enemy spawners, damage points, and wisp dispersal remain entirely out of scope for this vertical slice, allowing 100% focus on touch feel and construction stability.
2. **Prebuilt Frame**: The level will load with a partial prebuilt stone foundation and two vertical pillars anchored to bedrock, demonstrating how player pieces interface with existing structures.
3. **Sound**: Mild alchemical synth sounds (chimes, clicks, wood clacks) will be generated cleanly via the native Web Audio API without external audio files.

Implementation is unblocked and ready to proceed upon your review and approval.
