# Phase 4 Checkpoint: Character & Presentation Vertical Slice

## 1. Presentation Architecture & Read-Only Boundary
- `PresentationDirector` (`/src/game/presentation/presentationDirector.ts`) observes `LevelStore`, `SiegeController`, and `PhysicsBridge` through a strict read-only boundary.
- Presentation systems never mutate `LevelState`, `PlacedPiece`, `WispEntity.isDispersed`, `TargetCandidate`, `TrajectorySolution`, or `Matter.Body` transforms.
- Cosmetic camera shake (`shakeOffset`) is applied exclusively in `CanvasRenderer.render()` and never inside `Camera.effectiveOffset` or `Camera.screenToWorld()`, guaranteeing that pointer/touch input and world-space physics remain 100% independent of visual presentation.

## 2. Formal Camera Director (13 Explicit Modes)
- `CONSTRUCTION_CAMERA`: Frames the sanctuary build zone during initial construction and stability testing.
- `THREAT_PREVIEW_CAMERA`: Frames the full battlefield corridor from launcher to sanctuary.
- `ATTACKER_INTRO_CAMERA`: Focuses on the attacker staging platform during the first portion of `ENEMY_INTRODUCTION`.
- `TARGET_REVEAL_CAMERA`: Pans to the selected structural objective and ballistic sightline during the second portion of `ENEMY_INTRODUCTION`.
- `AIMING_CAMERA`: Wide tactical framing of launcher and fortress during `AIMING_PREVIEW` and `FINAL_ATTACK_READY` (or when `TACTICAL_WIDE` flight camera is selected).
- `PROJECTILE_SIDE_FOLLOW_CAMERA`: Default readable flight camera tracking the projectile while keeping the target region inside the right side of the frame.
- `PROJECTILE_POV_CAMERA`: Optional experimental projectile POV camera riding along the projectile velocity vector and automatically cutting away to `IMPACT_CAMERA` (`distToTarget < 175px`) before collision, with safe fallback to `PROJECTILE_SIDE_FOLLOW_CAMERA`.
- `IMPACT_CAMERA`: Frames the target impact zone at collision.
- `COLLAPSE_CAMERA`: Frames active structural collapse when post-impact kinetic energy is elevated.
- `SETTLEMENT_CAMERA`: Frames the sanctuary as debris settles to rest.
- `REINFORCEMENT_CAMERA`: Frames the sanctuary during mid-siege reinforcement and mentor emergency delivery.
- `RESULTS_CAMERA`: Frames the final battlefield state during Level 1 results.
- `REPLAY_CAMERA`: Frames recorded read-only visual keyframes during optional cinematic replay.

## 3. Character & Wisp Systems
- **Standard Attacker (`Pyrite Spark`)**: 18-state animation model covering hop-in, proud chest puff, warmup hop, cradle load, aim lean, launch anticipation, confident ascent, apex surprise, descent panic, impact brace, and post-impact reactions.
- **Heavy Attacker (`Grom the Slag-Brute`)**: 15-state animation model covering heavy step-in, ground thump with dust ring, mechanical helper clamp mount, deep compression, full launcher strain, surprised release, heavy momentum, airborne delight, impact brace, and post-impact reactions.
- **Hero Wisp (`wisp_ignis` — Brave) & 4 Companion Wisps (`wisp_zephyr`, `wisp_terran`, `wisp_marinus`, `wisp_aetheris`)**: Distinct silhouettes, vapor tails, orbiting rune armor fragments, crests, facial proportions, idle cadences, and a 20-state priority-ordered reaction system plus a harmless one-time 4-stage dispersal animation (`DISPERSING_GATHER` -> `DISPERSING_SWIRL` -> `DISPERSING_ASCEND` -> `DISPERSED_FADING`).

## 4. Safe Visual Replay & Original Web Audio Synthesis
- **Safe Visual Replay**: Records up to 260 read-only `ReplayKeyframe` snapshots at 30Hz during live flight/impact and plays them back in `REPLAY_CAMERA` mode without spawning Matter.js bodies or re-running simulation.
- **Original Web Audio Synthesizer (`/src/game/audio/synth.ts`)**: 15 original synthesized sound cues and fictional gibberish vocalizations with 75ms collision rate-limiting, separate SFX and Voice volume sliders, reduced intensity mode, and mute toggle.
