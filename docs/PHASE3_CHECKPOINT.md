# Phase 3 Accepted Checkpoint — Reinforcement and Complete Level 1 Loop

## Status: ACCEPTED & LOCKED

### Validated Capabilities
- **Stable Construction Physics**: Fixed 60Hz Matter.js simulation with zero initial overlap (`0.00px` penetration) and clean energy dissipation to `100.0%` settled state.
- **Hybrid Snapping & Environmental Anchors**: Magnetic snap solver prioritizing bedrock/ruin anchors (rigid weld constraints) over ordinary surface contact (friction-only). `BROKEN` debris and `LOST` pieces are excluded from providing snap sockets.
- **Accurate Inventory Accounting**: Explicit inventory and piece categorization (`STARTING_RESERVE`, `PLACED_INTACT`, `PLACED_CRACKED`, `BROKEN_DEBRIS`, `LOST`, `GUARANTEED_DELIVERY`, `PREBUILT_FIXED`, `PREBUILT_MOVABLE`).
- **Deterministic Targeting & Ballistic Trajectories**: World-space target candidate evaluation and parabolic trajectory solving invariant to viewport size, DPR, and camera zoom/pan.
- **Meaningful Launcher Distance**: `STANDARD` (`x = -460`, `660px` range), `NEAR` (`x = -160`, `360px` range), and `FAR` (`x = -760`, `960px` range) presets with unobstructed ballistic flight corridors.
- **Standard & Heavy Attacker Differentiation**:
  - Attack 1 (`Pyrite Spark`, standard): Targets outer/upper defenses and timber spans.
  - Attack 2 (`Grom the Slag-Brute`, heavy): Targets lower load-bearing foundations and pillar supports.
- **Persistent Damage Between Attacks**: Dynamic transforms and piece conditions (`INTACT`, `CRACKED`, `BROKEN`, `LOST`) persist from Attack 1 into the Reinforcement phase and Attack 2.
- **Wisp Contact & Dispersal**: Direct projectile strikes or high-impulse falling debris disperse unprotected wisps.
- **Post-Impact Settlement**: Kinetic energy and velocity settlement detection before transitioning to `ATTACK_RESOLVED`.
- **Reinforcement Phase & Piece Eligibility**:
  - Unused `STARTING_RESERVE` and mentor-delivered items can be placed.
  - Eligible `INTACT` player-owned pieces can be moved, rotated, snapped, or returned to reserve.
  - `CRACKED` pieces remain load-bearing and locked in place (`⚠️ CRK`).
  - `BROKEN` pieces remain non-reusable physical debris (`⚡ DEBRIS`).
  - `LOST` pieces are excluded from active manipulation and Attack 2 body creation.
- **Guaranteed Mentor Delivery**: Idempotent `+1 Timber Beam` and `+1 Cut Stone Block` granted once during `REINFORCEMENT_ACTIVE` (`deliveryGranted` flag + `REINFORCEMENT_ENTRY` snapshot).
- **Isolated Reinforcement Undo/Redo**: `reinforcementUndoStack` and `reinforcementRedoStack` operate exclusively on reinforcement actions without reverting Attack 1 damage or duplicating delivered items.
- **Dynamic Heavy Retargeting**: Heavy Attack 2 re-evaluates the reinforced structure after `finishReinforcement()`.
- **Accurate Final Results, Mastery & Sample Unlock**:
  - 5-tier classification (`Exceptional Defense`, `Strong Defense`, `Successful Defense`, `Narrow Survival`, `Defense Failed` with structural observation).
  - 3-part Mastery Evaluation (`Sanctuary Held`, `Chorus Preserved`, `Master Mason`).
  - Immediate Sample Unlock (`Reinforcement Reserve Unlocked`) persisted to local profile upon survival.
- **Named Snapshots & Restoration**:
  - `LEVEL_TEMPLATE`, `INITIAL_DESIGN`, `POST_ATTACK_1`, `REINFORCEMENT_ENTRY`, `REINFORCEMENT_COMPLETE`, `FINAL_RESULT`.
  - **Retry Design (`RETRY_RESTORING`)**: Restores `INITIAL_DESIGN` snapshot prior to Attack 1.
  - **Start Over (`FRESH_START_RESTORING`)**: Restores clean `LEVEL_TEMPLATE` and full starting inventory.
- **Safe Reload Recovery**: Recovers cleanly to the nearest safe phase (`INITIAL_CONSTRUCTION`, `CONSTRUCTION_READY`, `REINFORCEMENT_ACTIVE`, `FINAL_ATTACK_READY`, `RESULTS`) without duplicating pieces or inventory.
- **Zero Resource Leaks**: Physics bodies, weld constraints, collision listeners, and animation loops are cleanly torn down on every phase transition and restore cycle.
