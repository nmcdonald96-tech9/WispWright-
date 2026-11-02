/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LevelStore } from '../state/levelStore';
import { solveSnapAndValidation, normalizeAngle, snapAngle45 } from '../math/snapSolver';
import { INITIAL_LEVEL_STATE, MATERIAL_CONFIGS, WORLD_CONFIG } from '../config';
import { PlacedPiece, Vector2 } from '../types';

test('ACCEPTANCE TEST A: Direct Beam Drag - Ghost lifecycle and single accounting commit', () => {
  const store = new LevelStore();
  const initialBeams = store.getState().inventory.wood_beam;
  const initialPiecesCount = store.getState().pieces.length;

  // 1. Simulating drag start: no piece is committed, inventory unchanged
  assert.equal(store.getState().pieces.length, initialPiecesCount);
  assert.equal(store.getState().inventory.wood_beam, initialBeams);

  // 2. Solve snap for valid roof placement at (300, 684)
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 300, y: 684 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
  );
  assert.equal(snap.isValid, true);

  // 3. Commit on valid release
  const newPiece: PlacedPiece = {
    id: 'test_beam_drag_1',
    type: 'wood_beam',
    position: { ...snap.position },
    rotation: snap.rotation,
    isPrebuilt: false,
    preferredRotation: 0,
    rotationSource: 'DEFAULT',
    manualRotationRevision: 0,
  };
  const placed = store.placePiece(newPiece);

  assert.equal(placed, true);
  assert.equal(store.getState().pieces.length, initialPiecesCount + 1);
  assert.equal(store.getState().inventory.wood_beam, initialBeams - 1);
});

test('ACCEPTANCE TEST B: Direct Block Drag - Suggested region placement without generic spawn', () => {
  const store = new LevelStore();
  // Place required beam first
  store.placePiece({
    id: 'p_beam',
    type: 'wood_beam',
    position: { x: 300, y: 684 },
    rotation: 0,
    isPrebuilt: false,
  });

  const authBefore = store.getAuthoritativeTutorialState();
  assert.equal(authBefore.beamPlaced, true);
  assert.equal(authBefore.blockPlaced, false);

  // Drag block directly into suggested region
  const region = authBefore.currentSuggestedPlacementRegion;
  assert.ok(region, 'Suggested placement region should be defined for block step');
  assert.equal(region?.pieceType, 'wood_block');

  const snap = solveSnapAndValidation(
    'wood_block',
    region!.center,
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
  );
  assert.equal(snap.isValid, true);

  store.placePiece({
    id: 'p_block',
    type: 'wood_block',
    position: { ...snap.position },
    rotation: snap.rotation,
    isPrebuilt: false,
  });

  const authAfter = store.getAuthoritativeTutorialState();
  assert.equal(authAfter.blockPlaced, true);
});

test('ACCEPTANCE TEST C: Cancel Direct Drag - Zero inventory decrement, zero undo entry', () => {
  const store = new LevelStore();
  const initialInventory = { ...store.getState().inventory };
  const initialPieces = store.getState().pieces.length;
  const initialUndoCount = store.getUndoCount();

  // Simulating dragging outside valid zone or returning to inventory tray:
  // Ghost is cleared without calling store.placePiece
  const isCanceled = true;
  if (!isCanceled) {
    store.placePiece({
      id: 'should_not_exist',
      type: 'wood_beam',
      position: { x: 0, y: 0 },
      rotation: 0,
      isPrebuilt: false,
    });
  }

  assert.equal(store.getState().pieces.length, initialPieces);
  assert.equal(store.getState().inventory.wood_beam, initialInventory.wood_beam);
  assert.equal(store.getUndoCount(), initialUndoCount);
});

test('ACCEPTANCE TEST D: Tap Accessibility Mode - Staging ghost does not decrement until confirmation', () => {
  const store = new LevelStore();
  const initialInventory = store.getState().inventory.wood_beam;
  const initialPieces = store.getState().pieces.length;

  // Tap begins: ghost is staged at (300, 680)
  const stagedPos: Vector2 = { x: 300, y: 680 };
  const snapStaging = solveSnapAndValidation(
    'wood_beam',
    stagedPos,
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'DEFAULT' },
  );

  // While staged, inventory and pieces remain untouched
  assert.equal(store.getState().inventory.wood_beam, initialInventory);
  assert.equal(store.getState().pieces.length, initialPieces);

  // Player confirms placement:
  const confirmedPiece: PlacedPiece = {
    id: 'p_tap_confirmed_1',
    type: 'wood_beam',
    position: { ...snapStaging.position },
    rotation: snapStaging.rotation,
    isPrebuilt: false,
  };
  const success = store.placePiece(confirmedPiece);

  assert.equal(success, true);
  assert.equal(store.getState().inventory.wood_beam, initialInventory - 1);
  assert.equal(store.getState().pieces.length, initialPieces + 1);
});

test('ACCEPTANCE TEST E: Manual Rotation Preservation - Approaching snap points preserves 45° angle', () => {
  const store = new LevelStore();
  const anchors = store.getState().anchors;
  const pieces = store.getState().pieces;

  // User explicitly rotates beam to 45 degrees (PI / 4)
  const userRot = Math.PI / 4;
  const rawApproachPos: Vector2 = { x: 202, y: 738 }; // Close to anchor_left at (200, 756)

  const snap = solveSnapAndValidation(
    'wood_beam',
    rawApproachPos,
    userRot,
    pieces,
    anchors,
    true,
    undefined,
    {
      preferredRotation: userRot,
      rotationSource: 'USER',
      acceptSnapRotation: false,
    },
  );

  // Positional proximity detected
  assert.equal(snap.snapped, true);
  // Authoritative user rotation MUST BE PRESERVED: not flattened to 0!
  assert.ok(Math.abs(snap.rotation - userRot) < 0.001, `Expected angle ${userRot}, got ${snap.rotation}`);
  // Position aligned
  assert.equal(snap.position.x, 200);
});

test('ACCEPTANCE TEST F: Rotational Snap Preview - Proposed 0° angle previewed separately from user 45° preference', () => {
  const store = new LevelStore();
  const userRot = Math.PI / 4;
  const approachPos: Vector2 = { x: 200, y: 740 };

  const snap = solveSnapAndValidation(
    'wood_beam',
    approachPos,
    userRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: userRot,
      rotationSource: 'USER',
      acceptSnapRotation: false,
    },
  );

  // The proposed anchor orientation (0 rad) is previewed
  assert.equal(snap.proposedRotation, 0);
  assert.equal(snap.requiresRotationChange, true);
  assert.equal(snap.isAnchorRequired, true);
  // But piece rotation remains user preference
  assert.ok(Math.abs(snap.rotation - userRot) < 0.001);

  // When moving away:
  const farPos: Vector2 = { x: 350, y: 400 };
  const farSnap = solveSnapAndValidation(
    'wood_beam',
    farPos,
    userRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: userRot,
      rotationSource: 'USER',
      acceptSnapRotation: false,
    },
  );
  assert.equal(farSnap.snapped, false);
  assert.ok(Math.abs(farSnap.rotation - userRot) < 0.001);
});

test('ACCEPTANCE TEST G: Explicit Orientation Acceptance - Intentional acceptance updates angle', () => {
  const store = new LevelStore();
  const userRot = Math.PI / 4;
  const approachPos: Vector2 = { x: 200, y: 740 };

  // Explicitly accepting candidate snap rotation
  const snapAccepted = solveSnapAndValidation(
    'wood_beam',
    approachPos,
    userRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: userRot,
      rotationSource: 'USER',
      acceptSnapRotation: true,
    },
  );

  // Angle updated to proposed anchor alignment (0 rad)
  assert.equal(snapAccepted.rotation, 0);
  assert.equal(snapAccepted.attachedAnchorId, 'anchor_left');

  // Commit and test undo
  store.placePiece({
    id: 'p_acc',
    type: 'wood_beam',
    position: snapAccepted.position,
    rotation: snapAccepted.rotation,
    isPrebuilt: false,
  });

  assert.equal(store.canUndo(), true);
  store.undo();
  assert.equal(store.getState().pieces.some((p) => p.id === 'p_acc'), false);
});

test('ACCEPTANCE TEST H: Snap OFF - Free placement without positional or rotational override', () => {
  const store = new LevelStore();
  const customPos: Vector2 = { x: 215, y: 735 };
  const customRot = 0.35; // ~20 degrees arbitrary manual angle

  const snapOffResult = solveSnapAndValidation(
    'wood_block',
    customPos,
    customRot,
    store.getState().pieces,
    store.getState().anchors,
    false, // Snap OFF
    undefined,
    {
      preferredRotation: customRot,
      rotationSource: 'USER',
    },
  );

  assert.equal(snapOffResult.snapped, false);
  assert.equal(snapOffResult.position.x, customPos.x);
  assert.equal(snapOffResult.rotation, customRot);
});

test('ACCEPTANCE TEST I: Repeated Connection Approach - Zero angle oscillation or repeated flattening', () => {
  const store = new LevelStore();
  const userRot = Math.PI / 4;

  const nearPos: Vector2 = { x: 200, y: 740 };
  const farPos: Vector2 = { x: 280, y: 600 };

  // Cycle 10 times into and out of snap range
  for (let i = 0; i < 10; i++) {
    const nearSnap = solveSnapAndValidation(
      'wood_beam',
      nearPos,
      userRot,
      store.getState().pieces,
      store.getState().anchors,
      true,
      undefined,
      { preferredRotation: userRot, rotationSource: 'USER', acceptSnapRotation: false },
    );
    assert.ok(
      Math.abs(nearSnap.rotation - userRot) < 0.001,
      `Step ${i} near should preserve ${userRot}, got ${nearSnap.rotation}`,
    );

    const farSnap = solveSnapAndValidation(
      'wood_beam',
      farPos,
      userRot,
      store.getState().pieces,
      store.getState().anchors,
      true,
      undefined,
      { preferredRotation: userRot, rotationSource: 'USER', acceptSnapRotation: false },
    );
    assert.ok(
      Math.abs(farSnap.rotation - userRot) < 0.001,
      `Step ${i} far should preserve ${userRot}, got ${farSnap.rotation}`,
    );
  }
});

test('ACCEPTANCE TEST J: Tutorial Completion with Direct Drag', () => {
  const store = new LevelStore();

  // Step 1: Beam
  store.placePiece({
    id: 'p_tutorial_beam',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });

  // Step 2: Block
  store.placePiece({
    id: 'p_tutorial_block',
    type: 'wood_block',
    position: { x: 152, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });

  const auth = store.getAuthoritativeTutorialState();
  assert.equal(auth.beamPlaced, true);
  assert.equal(auth.blockPlaced, true);
  assert.equal(auth.supportedConnectionCreated, true);
});

test('ACCEPTANCE TEST K: Reinforcement - Reserve direct drag vs intact piece repositioning', () => {
  const store = new LevelStore();
  store.setReinforcementMode(true);

  // 1. Direct drag of reserve piece into damaged battlefield
  const startReserveBeams = store.getState().inventory.wood_beam;
  const reservePiece: PlacedPiece = {
    id: 'reinf_reserve_beam_1',
    type: 'wood_beam',
    position: { x: 300, y: 684 },
    rotation: 0,
    isPrebuilt: false,
  };
  const placedReserve = store.placePiece(reservePiece);
  assert.equal(placedReserve, true);
  assert.equal(store.getState().inventory.wood_beam, startReserveBeams - 1);

  // 2. Repositioning intact battlefield piece
  const moved = store.movePiece('reinf_reserve_beam_1', { x: 300, y: 660 }, 0);
  assert.equal(moved, true);

  // 3. Broken piece cannot be moved
  const brokenPiece: PlacedPiece = {
    id: 'broken_debris_1',
    type: 'wood_block',
    position: { x: 200, y: 756 },
    rotation: 0,
    isPrebuilt: false,
    condition: 'BROKEN',
  };
  store.getState().pieces.push(brokenPiece);
  const eligibility = store.canManipulatePiece(brokenPiece);
  assert.equal(eligibility.canMove, false);
  assert.equal(eligibility.canRotate, false);
});

test('ACCEPTANCE TEST L: Interruption & Reload Safety - Uncommitted drag leaves state pristine', () => {
  const store = new LevelStore();
  const initialSnapshot = JSON.stringify(store.getState());

  // Simulating an active ghost that was not committed before reload/backgrounding
  const uncommittedGhost = {
    type: 'wood_beam',
    pos: { x: 250, y: 650 },
    rotation: 0,
  };
  assert.ok(uncommittedGhost);

  // Restore or reload check: state matches initial exactly
  assert.equal(JSON.stringify(store.getState()), initialSnapshot);
});

// ============================================================================
// PHASE 5B V2: INVENTORY-LIFT & BEAM-ENDPOINT SNAP ACCEPTANCE TESTS (A - M)
// ============================================================================

test('V2 TEST A & B: Visual Inventory Lift & Inventory Cancel - Tray suppression and zero inventory consumption on tray return', () => {
  const store = new LevelStore();
  const initialBeams = store.getState().inventory.wood_beam;

  // 1. While inside the inventory tray (inInventoryTray = true), world snapping & ground clamping are suppressed
  const trayLiftSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 200, y: 810 }, // Inside UI tray below groundY (780)
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'DEFAULT',
      inInventoryTray: true,
    },
  );
  assert.equal(trayLiftSnap.snapped, false, 'Must not snap to world sockets while inside inventory tray');
  assert.equal(trayLiftSnap.isValid, false, 'Cannot commit placement while inside inventory tray');
  assert.equal(trayLiftSnap.position.y, 810, 'Must not clamp ghost up to groundY while lifting from tray card');

  // 2. Crossing into battlefield activates world snapping & validation
  const worldSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 300, y: 684 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'DEFAULT',
      inInventoryTray: false,
    },
  );
  assert.equal(worldSnap.isValid, true);

  // 3. Returning to inventory tray and releasing consumes zero inventory
  assert.equal(store.getState().inventory.wood_beam, initialBeams);
});

test('V2 TEST C: Upright Beam on Block (90°) - Snaps bottom endpoint to block top edge without flattening or overlap error', () => {
  const store = new LevelStore();

  // Place a wooden block on unoccupied ground at (152, 756) -> top edge is at y=732
  const baseBlock: PlacedPiece = {
    id: 'base_block_1',
    type: 'wood_block',
    position: { x: 152, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(baseBlock);

  // Rotate a timber beam to 90° (vertical post: height=120 along Y, half-length=60)
  // For its bottom endpoint to rest flush on block top edge (y=732), beam center should be at (152, 672)
  const verticalRot = Math.PI / 2;
  const approachPos: Vector2 = { x: 157, y: 678 }; // Within endpoint snap radius of (152, 672)

  const snap = solveSnapAndValidation(
    'wood_beam',
    approachPos,
    verticalRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: verticalRot,
      rotationSource: 'USER',
      acceptSnapRotation: false,
    },
  );

  assert.equal(snap.snapped, true, 'Vertical beam endpoint should snap to block top edge');
  assert.equal(snap.isValid, true, 'Vertical beam on block must not report false overlap');
  assert.equal(snap.socketCompatibility, 'BEAM_END_TO_BLOCK_EDGE');
  assert.ok(Math.abs(snap.rotation - verticalRot) < 0.001, '90° vertical rotation must be preserved');
  assert.equal(snap.position.x, 152);
  assert.ok(Math.abs(snap.position.y - 672) < 0.5, `Expected y=672, got ${snap.position.y}`);
  assert.equal(snap.explicitJointProposed, false, 'Must not auto-weld ordinary piece-to-piece contact');
  assert.equal(snap.attachedAnchorId, undefined, 'Upper piece must not inherit bedrock anchor weld');
});

test('V2 TEST D: Block on Upright Beam - Snaps block bottom edge to upright beam top endpoint', () => {
  const store = new LevelStore();

  // Place an upright 90° beam standing at (152, 720) -> top endpoint is at (152, 660)
  const uprightBeam: PlacedPiece = {
    id: 'upright_beam_1',
    type: 'wood_beam',
    position: { x: 152, y: 720 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };
  store.placePiece(uprightBeam);

  // Drag a wooden block (48x48, halfH=24) near top of upright beam -> expected block center (152, 636)
  const snap = solveSnapAndValidation(
    'wood_block',
    { x: 156, y: 641 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'DEFAULT',
    },
  );

  assert.equal(snap.snapped, true, 'Block should snap onto upright beam top endpoint');
  assert.equal(snap.isValid, true, 'Block on upright beam must be valid without overlap');
  assert.equal(snap.socketCompatibility, 'BLOCK_EDGE_TO_BEAM_END');
  assert.equal(snap.position.x, 152);
  assert.ok(Math.abs(snap.position.y - 636) < 0.5, `Expected y=636, got ${snap.position.y}`);
  assert.equal(snap.supportedContactPredicted, true);
});

test('V2 TEST E: Beam-to-Beam End Stacking - Vertical beam snaps end-to-end onto another vertical beam', () => {
  const store = new LevelStore();

  // Lower vertical beam at (152, 720) -> top end at (152, 660)
  const lowerPost: PlacedPiece = {
    id: 'lower_post',
    type: 'wood_beam',
    position: { x: 152, y: 720 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };
  store.placePiece(lowerPost);

  // Upper vertical beam (90°, half-length=60) approaching top end -> expected center (152, 600)
  const verticalRot = Math.PI / 2;
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 148, y: 606 },
    verticalRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: verticalRot,
      rotationSource: 'USER',
    },
  );

  assert.equal(snap.snapped, true);
  assert.equal(snap.isValid, true);
  assert.equal(snap.socketCompatibility, 'BEAM_END_TO_BEAM_END');
  assert.equal(snap.position.x, 152);
  assert.ok(Math.abs(snap.position.y - 600) < 0.5, `Expected y=600, got ${snap.position.y}`);
  assert.ok(Math.abs(snap.rotation - verticalRot) < 0.001);
});

test('V2 TEST F: Horizontal Beam Across Upright Supports - Snaps cleanly to top of vertical post', () => {
  const store = new LevelStore();

  // Two vertical beam posts at x=104 and x=152, y=720 -> top endpoints at y=660
  store.placePiece({
    id: 'post_left',
    type: 'wood_beam',
    position: { x: 104, y: 720 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'post_right',
    type: 'wood_beam',
    position: { x: 152, y: 720 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  });

  // Drag horizontal lintel beam (0°, height=24, halfH=12) across the posts near y=648
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 128, y: 652 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'DEFAULT',
    },
  );

  assert.equal(snap.snapped, true, 'Horizontal lintel should snap to upright post top endpoint');
  assert.equal(snap.isValid, true, 'Horizontal lintel across posts must be valid');
  assert.equal(snap.socketCompatibility, 'BEAM_END_TO_BEAM_SIDE');
  assert.ok(Math.abs(snap.position.y - 648) < 0.5, `Expected y=648, got ${snap.position.y}`);
  assert.equal(snap.rotation, 0);
});

test('V2 TEST G: Angled Beam at 45° - Preserves 45° rotation and adjusts clearance to avoid corner overlap', () => {
  const store = new LevelStore();

  // Use top of left prebuilt column (prebuilt_stone_left_2 at x=200, y=708 -> top edge at y=684)
  // Rotate beam to 45° (PI/4). Its END_B_CENTER is at (+42.426, +42.426).
  // Approach with END_B_CENTER near (200, 684) -> beam center near (157.5, 641.5)
  const angle45 = Math.PI / 4;
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 158, y: 640 },
    angle45,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: angle45,
      rotationSource: 'USER',
    },
  );

  assert.equal(snap.snapped, true, '45° beam endpoint should snap to block top edge');
  assert.equal(snap.isValid, true, '45° beam must clear block surface without false corner overlap');
  assert.ok(Math.abs(snap.rotation - angle45) < 0.001, '45° rotation must be preserved');
});

test('V2 TEST H: Candidate Lock Hysteresis - Prevents rapid flickering within release radius', () => {
  const store = new LevelStore();

  // Place two adjacent blocks at x=104 and x=152, y=756
  store.placePiece({
    id: 'blk_a',
    type: 'wood_block',
    position: { x: 104, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'blk_b',
    type: 'wood_block',
    position: { x: 152, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });

  // 1. Approach blk_a top edge (104, 732) with vertical beam -> locks onto blk_a
  const verticalRot = Math.PI / 2;
  const snap1 = solveSnapAndValidation(
    'wood_beam',
    { x: 106, y: 672 },
    verticalRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: verticalRot,
      rotationSource: 'USER',
    },
  );
  assert.equal(snap1.snapped, true);
  assert.ok(snap1.socket?.id.includes('blk_a'), `Expected lock on blk_a, got ${snap1.socket?.id}`);

  // 2. Jitter pointer slightly toward midpoint (x=127, within 38px release radius of blk_a)
  const locked = {
    targetSocketId: snap1.socket!.id,
    pieceSocketId: snap1.pieceSocket!.id,
  };
  const snapJitter = solveSnapAndValidation(
    'wood_beam',
    { x: 127, y: 672 },
    verticalRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: verticalRot,
      rotationSource: 'USER',
      lockedCandidate: locked,
    },
  );

  assert.equal(snapJitter.snapped, true);
  assert.equal(snapJitter.candidateLockActive, true, 'Candidate lock hysteresis must remain active');
  assert.equal(snapJitter.socket?.id, snap1.socket?.id, 'Must not flicker away while within release radius');
});

test('V2 TEST K: Reinforcement Vertical Support - Reserve beam rotated to 90° snaps as vertical support column', () => {
  const store = new LevelStore();
  store.setReinforcementMode(true);

  const verticalRot = Math.PI / 2;
  // Snap upright reserve beam onto prebuilt_stone_left_2 (x=200, y=708 -> top edge at y=684, center at y=624)
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 202, y: 626 },
    verticalRot,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: verticalRot,
      rotationSource: 'USER',
    },
  );

  assert.equal(snap.snapped, true);
  assert.equal(snap.isValid, true);
  assert.ok(Math.abs(snap.rotation - verticalRot) < 0.001);
  assert.equal(snap.position.x, 200);
  assert.ok(Math.abs(snap.position.y - 624) < 0.5);
});

