/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Build-Phase Wisp Removal, Post-Construction Wisp Placement & Atomic Rotation-Collision
 * Acceptance Test Suite (Tests A - M)
 */

import { LevelStore } from '../state/levelStore';
import { SiegeController } from './siegeController';
import { PhysicsBridge } from '../physics/physicsBridge';
import { solveSnapAndValidation } from '../math/snapSolver';
import { checkOBBOverlap, getOBBFromPiece } from '../math/geometry';
import { selectTargetAndTrajectory } from './targeting';
import { AUTHORED_ATTACKS, DISTANCE_PRESETS } from './siegeConfig';
import { MaterialType, PlacedPiece } from '../types';

if (typeof (globalThis as any).localStorage === 'undefined') {
  const storageMap = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => storageMap.set(key, String(val)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

let pieceSeq = 1;
function makePiece(
  type: MaterialType,
  x: number,
  y: number,
  rotation = 0,
  attachedAnchorId?: string,
): PlacedPiece {
  return {
    id: `player_piece_wisp_rot_test_${pieceSeq++}`,
    type,
    position: { x, y },
    rotation,
    isPrebuilt: false,
    ...(attachedAnchorId ? { attachedAnchorId } : {}),
  };
}

console.log('======================================================================');
console.log('BUILD-PHASE WISP REMOVAL & ROTATION-COLLISION ACCEPTANCE SUITE (A - M)');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// TEST A: NO WISPS IN BUILD
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const state = store.getState();
  const wispDiag = store.getWispPresenceDiagnostics('CONSTRUCTION');

  assert(
    wispDiag.wispBattlefieldCount === 0,
    `Test A: Expected wispBattlefieldCount === 0 in BUILD, got ${wispDiag.wispBattlefieldCount}`,
  );
  assert(
    wispDiag.wispBlockerCount === 0,
    `Test A: Expected wispBlockerCount === 0 in BUILD, got ${wispDiag.wispBlockerCount}`,
  );
  assert(
    wispDiag.wispStagingCount === 3,
    `Test A: Expected wispStagingCount === 3 in BUILD, got ${wispDiag.wispStagingCount}`,
  );
  assert(
    state.wisps.every((w) => w.placed === false),
    'Test A: Every wisp must have placed === false during BUILD',
  );

  // Confirm construction pieces can be placed and rotated directly at former wisp default coordinates
  const formerWispCoords = [
    { x: 280, y: 740 },
    { x: 340, y: 730 },
    { x: 400, y: 704 },
    { x: 460, y: 730 },
    { x: 520, y: 740 },
  ];

  for (const coord of formerWispCoords) {
    const snapRes = solveSnapAndValidation(
      'wood_block',
      coord,
      0,
      store.getState().pieces,
      store.getState().anchors,
      true,
      undefined,
      { wisps: store.getState().wisps },
    );
    assert(
      snapRes.isValid === true,
      `Test A: Placement at former wisp coordinate (${coord.x}, ${coord.y}) must be valid during BUILD`,
    );
  }

  // Place a beam at (300, 730) directly across former wisp positions and rotate it in BUILD
  const beam = makePiece('wood_beam', 300, 730, 0);
  assert(store.placePiece(beam) === true, 'Test A: Placed beam in sanctuary during BUILD');
  assert(
    store.rotatePiece(beam.id, Math.PI / 12) === true,
    'Test A: Rotated beam in sanctuary during BUILD without wisp blocker',
  );

  console.log('✓ Test A (No Wisps in BUILD): PASSED');
}

// -----------------------------------------------------------------------------
// TEST B: STABILITY TEST WITHOUT WISPS
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build valid shelter
  assert(store.placePiece(makePiece('wood_beam', 200, 672, 0)), 'Test B: Placed beam');
  assert(store.placePiece(makePiece('wood_block', 152, 756, 0)), 'Test B: Placed block');

  // Verify PhysicsBridge creates zero wisp bodies when wisps are unplaced in BUILD
  const bridge = new PhysicsBridge(store.getState());
  const expectedBodyCount = store.getState().pieces.length + 1 + store.getState().anchors.length;
  assert(
    bridge.diagnostics.physicsBodyCount === expectedBodyCount,
    `Test B: PhysicsBridge must include 0 wisps during BUILD stability test (expected ${expectedBodyCount} bodies, got ${bridge.diagnostics.physicsBodyCount})`,
  );
  for (let i = 0; i < 60; i++) {
    bridge.step(16.67);
  }
  assert(
    bridge.getDispersedWisps().size === 0,
    'Test B: Zero wisps can be dispersed during BUILD stability testing',
  );
  bridge.teardown();

  const simRes = sc.runTutorialStabilityTest(2.5, false);
  assert(simRes.passed === true, 'Test B: Stability test passed');

  // Accepting stable shelter advances to PLACE_WISPS
  const entered = sc.enterPlaceWispsPhase(true);
  assert(entered === true && sc.mode === 'PLACE_WISPS', 'Test B: Advanced to PLACE_WISPS');

  console.log('✓ Test B (Stability Test Without Wisps): PASSED');
}

// -----------------------------------------------------------------------------
// TEST C: ENTERING PLACE_WISPS
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  sc.runTutorialStabilityTest(2.5, false);

  const entered = sc.enterPlaceWispsPhase(true);
  assert(entered === true, 'Test C: Entered PLACE_WISPS');

  const diag = store.getWispPresenceDiagnostics(sc.mode);
  assert(
    diag.wispBattlefieldCount === 0 && diag.wispStagingCount === 3,
    `Test C: Placed-wisp count starts at 0/3 with all 3 in staging (got BF=${diag.wispBattlefieldCount}, Stg=${diag.wispStagingCount})`,
  );
  assert(
    store.getState().wisps.every((w) => w.placed === false),
    'Test C: All 3 wisps are unplaced in the staging tray',
  );
  assert(
    sc.enterPreSiegeReview() === false,
    'Test C: Pre-Siege Review remains disabled until all 3 wisps are placed',
  );
  assert(
    sc.canBeginSiege().allowed === false,
    'Test C: Begin Siege remains disabled until all 3 wisps are placed',
  );

  console.log('✓ Test C (Entering PLACE_WISPS): PASSED');
}

// -----------------------------------------------------------------------------
// TEST D: DEFAULT SLOTS RESPECT BUILT PIECES
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Place tutorial beam & block, plus a block directly over wisp_ignis default slot (280, 740)
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  const blockerBlock = makePiece('wood_block', 280, 756, 0); // covers y: 732..780 at x=280, blocking (280, 740)
  assert(store.placePiece(blockerBlock) === true, 'Test D: Placed block at (280, 756) in BUILD');

  const simRes = sc.runTutorialStabilityTest(2.5, false);
  assert(simRes.passed === true, 'Test D: Stability passed');
  sc.enterPlaceWispsPhase(true);

  // Tap Default Slots (allowFallbackOffsets = false)
  const placedCount = store.placeAllWispsInDefaultSanctuarySlots(false);
  assert(
    placedCount === 2,
    `Test D: Expected 2 unblocked default slots to be placed and 1 blocked slot skipped, got ${placedCount}`,
  );

  const ignis = store.getState().wisps.find((w) => w.id === 'wisp_ignis')!;
  assert(
    ignis.placed === false,
    'Test D: Blocked default slot wisp_ignis must NOT be placed inside the player block',
  );
  assert(
    store.lastDefaultSlotPlacementReport !== null &&
      store.lastDefaultSlotPlacementReport.unplacedWispIds.includes('wisp_ignis') &&
      Boolean(store.lastDefaultSlotPlacementReport.message),
    'Test D: Default Slots reports which wisp remains unplaced',
  );

  console.log('✓ Test D (Default Slots Respect Built Pieces): PASSED');
}

// -----------------------------------------------------------------------------
// TEST E: WISP PLACEMENT VALIDATION
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  sc.runTutorialStabilityTest(2.5, false);
  sc.enterPlaceWispsPhase(true);

  // 1. Over a piece at (200, 672)
  const overPiece = store.placeWisp('wisp_ignis', { x: 200, y: 672 });
  assert(
    !overPiece.success && overPiece.validation.rejectionCode === 'PIECE_OVERLAP',
    'Test E: Rejects wisp placement over a construction piece',
  );

  // 2. Into terrain / ground (y=770)
  const intoTerrain = store.placeWisp('wisp_ignis', { x: 400, y: 770 });
  assert(
    !intoTerrain.success && intoTerrain.validation.rejectionCode === 'TERRAIN_OVERLAP',
    'Test E: Rejects wisp placement into terrain',
  );

  // 3. Outside sanctuary (x=100, y=500) and in launcher zone (x=20, y=650)
  const outsideSanctuary = store.placeWisp('wisp_ignis', { x: 100, y: 500 });
  assert(
    !outsideSanctuary.success &&
      outsideSanctuary.validation.rejectionCode === 'OUTSIDE_SANCTUARY_ZONE',
    'Test E: Rejects wisp placement outside sanctuary',
  );
  const inLauncher = store.validateWispPlacement('wisp_ignis', { x: 20, y: 650 });
  assert(
    !inLauncher.isValid && inLauncher.rejectionCode === 'IN_LAUNCHER_ZONE',
    'Test E: Rejects wisp placement in launcher zone',
  );

  // 4. Place first wisp validly, then attempt to place second wisp overlapping it
  assert(store.placeWisp('wisp_ignis', { x: 280, y: 740 }).success, 'Test E: Placed wisp_ignis');
  const overWisp = store.placeWisp('wisp_zephyr', { x: 292, y: 740 });
  assert(
    !overWisp.success && overWisp.validation.rejectionCode === 'WISP_OVERLAP',
    'Test E: Rejects wisp placement overlapping another placed wisp',
  );

  // 5. Place remaining 2 wisps in valid sanctuary space
  assert(store.placeWisp('wisp_zephyr', { x: 345, y: 725 }).success, 'Test E: Placed wisp_zephyr');
  assert(store.placeWisp('wisp_marinus', { x: 460, y: 725 }).success, 'Test E: Placed wisp_marinus');

  assert(store.areAllWispsPlacedAndValid() === true, 'Test E: All 3 wisps validly placed');
  assert(sc.enterPreSiegeReview() === true, 'Test E: Entered PRE_SIEGE_REVIEW');
  assert(sc.canBeginSiege().allowed === true, 'Test E: Siege is now allowed');

  console.log('✓ Test E (Wisp Placement Validation): PASSED');
}

// -----------------------------------------------------------------------------
// TEST F: RETURN FROM PLACE_WISPS TO BUILD
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  sc.runTutorialStabilityTest(2.5, false);
  sc.acceptStableDesignFromTest();

  const stableRevision = store.currentConstructionRevision;
  sc.enterPlaceWispsPhase(true);
  assert(store.placeWisp('wisp_ignis', { x: 280, y: 740 }).success, 'Test F: Placed wisp_ignis');
  assert(store.placeWisp('wisp_zephyr', { x: 340, y: 730 }).success, 'Test F: Placed wisp_zephyr');

  // Tap Return to Build
  sc.returnFromWispPhaseToBuild();
  assert(sc.mode === 'CONSTRUCTION', 'Test F: Returned to CONSTRUCTION (BUILD)');

  const diag = store.getWispPresenceDiagnostics(sc.mode);
  assert(
    diag.wispBattlefieldCount === 0 &&
      diag.wispBlockerCount === 0 &&
      diag.wispStagingCount === 3,
    `Test F: All wisps returned to staging (BF=${diag.wispBattlefieldCount}, Blk=${diag.wispBlockerCount}, Stg=${diag.wispStagingCount})`,
  );
  assert(
    store.getState().wisps.every((w) => w.placed === false),
    'Test F: No wisps remain placed on the battlefield in BUILD',
  );

  // Confirm player can place a piece right where wisp_ignis was just placed (280, 740)
  const editAtFormerWisp = store.placePiece(makePiece('wood_block', 280, 756, 0));
  assert(
    editAtFormerWisp === true,
    'Test F: Player can edit fortress where wisps had just been placed',
  );
  assert(
    store.currentConstructionRevision > stableRevision,
    'Test F: Structural edit incremented construction revision',
  );
  assert(
    sc.enterPlaceWispsPhase(true) === false,
    'Test F: Structural edit requires re-running stability test before re-entering PLACE_WISPS',
  );

  console.log('✓ Test F (Return From PLACE_WISPS to BUILD): PASSED');
}

// -----------------------------------------------------------------------------
// TEST G: ROTATION INTO PIECE IS REJECTED
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  // Place a horizontal beam at (280, 648) and a wood_block directly below its center at (280, 688)
  // At 0°: beam y-range is [636, 660], block y-range is [664, 712] -> 4px gap, valid!
  // At +45° or +90°: beam half-height becomes ~51px or 60px -> y-range [588, 708], overlapping the block!
  const beam = makePiece('wood_beam', 280, 648, 0);
  const block = makePiece('wood_block', 280, 688, 0);
  assert(store.placePiece(beam) === true, 'Test G: Placed beam at (280, 648)');
  assert(store.placePiece(block) === true, 'Test G: Placed adjacent block at (280, 688)');

  const revBefore = store.currentConstructionRevision;
  const undoBefore = store.getUndoCount();
  const invBefore = { ...store.getState().inventory };

  const rotated = store.rotatePiece(beam.id, Math.PI / 4); // +45°
  assert(rotated === false, 'Test G: Intersecting rotation into adjacent piece must be rejected');

  const committedBeam = store.getState().pieces.find((p) => p.id === beam.id)!;
  assert(
    Math.abs(committedBeam.rotation - 0) < 1e-6,
    `Test G: Beam must remain at its last valid angle (0), got ${committedBeam.rotation}`,
  );
  assert(
    checkOBBOverlap(getOBBFromPiece(committedBeam), getOBBFromPiece(block), 2.5) === false,
    'Test G: No intersecting geometry is committed',
  );
  assert(
    store.currentConstructionRevision === revBefore,
    'Test G: Rejected rotation must not increment construction revision',
  );
  assert(
    store.getUndoCount() === undoBefore,
    'Test G: Rejected rotation must not create an undo entry',
  );
  assert(
    store.getState().inventory.wood_beam === invBefore.wood_beam,
    'Test G: Rejected rotation must preserve inventory',
  );
  assert(
    store.lastRotationDiagnostics?.rotationAccepted === false &&
      store.lastRotationDiagnostics?.lastRejectionReason === 'PIECE_OVERLAP' &&
      store.lastRotationDiagnostics?.conflictingColliderId === block.id,
    'Test G: Rotation diagnostics record PIECE_OVERLAP and conflicting block ID',
  );

  console.log('✓ Test G (Rotation Into Piece Is Rejected): PASSED');
}

// -----------------------------------------------------------------------------
// TEST H: ROTATION INTO TERRAIN OR BOUNDARY IS REJECTED
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  // 1. Place horizontal beam near ground at (300, 756).
  // At 0°: bottom is 756 + 12 = 768 <= groundY (780), valid!
  // At +45°: bottom is 756 + 50.9 = 806.9 > groundY (780) -> TERRAIN_OVERLAP!
  const lowBeam = makePiece('wood_beam', 300, 756, 0);
  assert(store.placePiece(lowBeam) === true, 'Test H: Placed low horizontal beam at (300, 756)');

  const rotGround = store.rotatePiece(lowBeam.id, Math.PI / 4);
  assert(rotGround === false, 'Test H: Rotation into ground bedrock must be rejected');
  assert(
    store.lastRotationDiagnostics?.lastRejectionReason === 'TERRAIN_OVERLAP',
    `Test H: Expected TERRAIN_OVERLAP, got ${store.lastRotationDiagnostics?.lastRejectionReason}`,
  );
  assert(
    Math.abs(store.getState().pieces.find((p) => p.id === lowBeam.id)!.rotation - 0) < 1e-6,
    'Test H: Last valid angle preserved after terrain rejection',
  );

  // 2. Place vertical beam near right build boundary at (695, 620, rotation = PI/2).
  // At 90°: x-range is [683, 707] <= maxX (720), valid!
  // Rotating to 0° makes x-range [635, 755] > maxX (720) -> OUT_OF_BOUNDS!
  const edgeBeam = makePiece('wood_beam', 695, 620, Math.PI / 2);
  assert(store.placePiece(edgeBeam) === true, 'Test H: Placed vertical beam near right boundary');

  const rotBounds = store.setPieceRotation(edgeBeam.id, 0);
  assert(rotBounds === false, 'Test H: Rotation outside build-zone boundary must be rejected');
  assert(
    store.lastRotationDiagnostics?.lastRejectionReason === 'OUT_OF_BOUNDS',
    `Test H: Expected OUT_OF_BOUNDS, got ${store.lastRotationDiagnostics?.lastRejectionReason}`,
  );
  assert(
    Math.abs(
      store.getState().pieces.find((p) => p.id === edgeBeam.id)!.rotation - Math.PI / 2,
    ) < 1e-6,
    'Test H: Last valid angle preserved after boundary rejection',
  );

  console.log('✓ Test H (Rotation Into Terrain or Boundary Is Rejected): PASSED');
}

// -----------------------------------------------------------------------------
// TEST I: SWEPT ROTATION ANTI-TUNNELING
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  // Place a beam at (300, 600) at 0° (horizontal: x in [240, 360], y in [588, 612]).
  // Place a block at (342, 642) (x in [318, 366], y in [618, 666]).
  // Notice:
  // - At 0° (initial): beam y-max is 612 < block y-min 618 -> NO overlap!
  // - At +90° (final vertical): beam x-range is [288, 312] < block x-min 318 -> NO overlap at final angle!
  // - At +45° (intermediate sweep): beam diagonal extends from (300, 600) through (342, 642), directly colliding with the block!
  const sweepBeam = makePiece('wood_beam', 300, 600, 0);
  const obstacleBlock = makePiece('wood_block', 342, 642, 0);
  assert(store.placePiece(sweepBeam) === true, 'Test I: Placed sweep beam at (300, 600)');
  assert(store.placePiece(obstacleBlock) === true, 'Test I: Placed obstacle block at (342, 642)');

  const tunnelAttempt = store.setPieceRotation(sweepBeam.id, Math.PI / 2);
  assert(
    tunnelAttempt === false,
    'Test I: Coarse +90° rotation that sweeps through an obstacle block must be rejected',
  );
  assert(
    store.lastRotationDiagnostics?.lastRejectionReason === 'SWEEP_COLLISION' &&
      (store.lastRotationDiagnostics?.rotationSweepOverlapCount ?? 0) > 0,
    `Test I: Expected SWEEP_COLLISION with rotationSweepOverlapCount > 0, got ${store.lastRotationDiagnostics?.lastRejectionReason}`,
  );
  assert(
    Math.abs(store.getState().pieces.find((p) => p.id === sweepBeam.id)!.rotation - 0) < 1e-6,
    'Test I: Beam remains at 0° after swept collision rejection',
  );

  console.log('✓ Test I (Swept Rotation Anti-Tunneling): PASSED');
}

// -----------------------------------------------------------------------------
// TEST J: CONNECTED PIECE ROTATION
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  // Attach a beam to environmental anchor_center (400, 780) at (400, 600)
  const anchoredBeam = makePiece('wood_beam', 400, 600, 0, 'anchor_center');
  assert(store.placePiece(anchoredBeam) === true, 'Test J: Placed anchored beam');

  // Attempt to rotate +45° while attached to anchor_mid (anchors only permit cardinal 90° alignments)
  const rotWhileAnchored = store.rotatePiece(anchoredBeam.id, Math.PI / 4);
  assert(
    rotWhileAnchored === false,
    'Test J: Rotation incompatible with attached anchor must be rejected',
  );
  assert(
    store.lastRotationDiagnostics?.connectionIncompatibility === true &&
      store.lastRotationDiagnostics?.lastRejectionReason === 'CONNECTION_INCOMPATIBLE' &&
      store.lastRotationDiagnostics?.playerFriendlyMessage ===
        'Detach this connection before rotating.',
    `Test J: Expected CONNECTION_INCOMPATIBLE and "Detach this connection before rotating.", got ${store.lastRotationDiagnostics?.lastRejectionReason}`,
  );

  // Explicitly detach connection, then rotate +45°
  const detached = store.detachPieceConnection(anchoredBeam.id);
  assert(detached === true, 'Test J: Explicit detachPieceConnection succeeded');
  const rotAfterDetach = store.rotatePiece(anchoredBeam.id, Math.PI / 4);
  assert(rotAfterDetach === true, 'Test J: Rotation succeeds after detaching connection');

  console.log('✓ Test J (Connected Piece Rotation): PASSED');
}

// -----------------------------------------------------------------------------
// TEST K: VALID ROTATION COMMITS AND UNDOES CLEANLY
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  const freeBeam = makePiece('wood_beam', 300, 560, 0);
  assert(store.placePiece(freeBeam) === true, 'Test K: Placed beam in open valid space');

  const revBefore = store.currentConstructionRevision;
  const undoBefore = store.getUndoCount();

  const rotOk = store.rotatePiece(freeBeam.id, Math.PI / 4);
  assert(rotOk === true, 'Test K: Valid rotation in open space committed');
  assert(
    store.lastRotationDiagnostics?.rotationAccepted === true &&
      store.lastRotationDiagnostics?.lastRejectionReason === 'VALID',
    'Test K: Rotation diagnostics confirm VALID accepted rotation',
  );
  assert(
    Math.abs(store.getState().pieces.find((p) => p.id === freeBeam.id)!.rotation - Math.PI / 4) <
      1e-6,
    'Test K: Committed angle is +45°',
  );
  assert(
    store.currentConstructionRevision === revBefore + 1,
    'Test K: Construction revision incremented by 1',
  );
  assert(store.getUndoCount() === undoBefore + 1, 'Test K: One undo entry added');

  // Undo restores previous angle (0°)
  assert(store.undo() === true, 'Test K: Undo succeeded');
  assert(
    Math.abs(store.getState().pieces.find((p) => p.id === freeBeam.id)!.rotation - 0) < 1e-6,
    'Test K: Undo restored previous angle (0°)',
  );

  // Redo reapplies valid angle (+45°)
  assert(store.redo() === true, 'Test K: Redo succeeded');
  assert(
    Math.abs(store.getState().pieces.find((p) => p.id === freeBeam.id)!.rotation - Math.PI / 4) <
      1e-6,
    'Test K: Redo reapplied +45° angle',
  );

  console.log('✓ Test K (Valid Rotation Commits and Undoes Cleanly): PASSED');
}

// -----------------------------------------------------------------------------
// TEST L: REINFORCEMENT ROTATION AGAINST SURVIVING WISPS
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  // Place wisps before siege and enter reinforcement mode
  store.enterPlaceWispsPhase(true);
  store.placeAllWispsInDefaultSanctuarySlots(false);
  store.lockWispsForSiege();
  store.setReinforcementMode(true);

  // Place a horizontal beam at (305, 695) above and slightly west of surviving wisp_zephyr at (340, 730)
  // At 0°: beam y-max is 707 (distance to wisp center (340, 730) is 23px > 18px clearance), valid!
  // At +45°: beam's right half swings down through (340, 730), colliding directly with wisp_zephyr!
  const reinfBeam = makePiece('wood_beam', 305, 695, 0);
  assert(
    store.placePiece(reinfBeam) === true,
    'Test L: Placed horizontal beam above surviving wisp_zephyr in REINFORCEMENT',
  );

  // Attempt to rotate beam +45° so it swings down into surviving wisp_zephyr at (340, 730)
  const rotIntoWisp = store.rotatePiece(reinfBeam.id, Math.PI / 4);
  assert(
    rotIntoWisp === false,
    'Test L: Rotating a piece into a surviving placed wisp during REINFORCEMENT must be rejected',
  );
  assert(
    store.lastRotationDiagnostics?.lastRejectionReason === 'WISP_OVERLAP' &&
      store.lastRotationDiagnostics?.playerFriendlyMessage ===
        'Keep this space clear for the wisps.',
    `Test L: Expected WISP_OVERLAP, got ${store.lastRotationDiagnostics?.lastRejectionReason}`,
  );

  // If wisp_zephyr is dispersed, rotating into its former space is allowed
  const zephyr = store.getState().wisps.find((w) => w.id === 'wisp_zephyr')!;
  zephyr.isDispersed = true;
  const rotAfterDispersed = store.rotatePiece(reinfBeam.id, Math.PI / 4);
  assert(
    rotAfterDispersed === true,
    'Test L: Dispersed wisp does not block rotation during REINFORCEMENT',
  );

  console.log('✓ Test L (Reinforcement Rotation Against Surviving Wisps): PASSED');
}

// -----------------------------------------------------------------------------
// TEST M: RELOAD AND RESTORE (BUILD, PLACE_WISPS, PRE_SIEGE_REVIEW, REINFORCEMENT)
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // 1. Reload during BUILD -> 0 battlefield wisps
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  const buildReload = sc.simulateSafeReload();
  assert(
    buildReload.recoveredPhase === 'INITIAL_CONSTRUCTION',
    'Test M: Reload during BUILD recovers INITIAL_CONSTRUCTION',
  );
  assert(
    store.getWispPresenceDiagnostics('CONSTRUCTION').wispBattlefieldCount === 0 &&
      store.getState().wisps.every((w) => w.placed === false),
    'Test M: BUILD reload has zero battlefield wisps',
  );

  // 2. Pass stability, enter PLACE_WISPS, place 2 wisps, reload
  sc.runTutorialStabilityTest(2.5, false);
  sc.enterPlaceWispsPhase(true);
  assert(store.placeWisp('wisp_ignis', { x: 280, y: 740 }).success, 'Test M: Placed ignis');
  assert(store.placeWisp('wisp_zephyr', { x: 350, y: 725 }).success, 'Test M: Placed zephyr');

  const placeWispsReload = sc.simulateSafeReload();
  assert(
    placeWispsReload.recoveredPhase === 'PLACE_WISPS' && sc.mode === 'PLACE_WISPS',
    'Test M: Reload during PLACE_WISPS restores PLACE_WISPS',
  );
  assert(store.getState().wisps.length === 3, 'Test M: No wisp duplication on reload (3 active wisps)');
  assert(
    store.getWispPresenceDiagnostics('PLACE_WISPS').wispBattlefieldCount === 2 &&
      store.getWispPresenceDiagnostics('PLACE_WISPS').wispStagingCount === 1,
    'Test M: PLACE_WISPS reload preserves 2 placed wisps and 1 unplaced wisp',
  );

  // 3. Complete wisp placement, enter PRE_SIEGE_REVIEW, reload, then Begin Siege & Retry Design
  assert(store.placeWisp('wisp_marinus', { x: 460, y: 725 }).success, 'Test M: Placed marinus');
  assert(sc.enterPreSiegeReview() === true, 'Test M: Entered PRE_SIEGE_REVIEW');

  const reviewReload = sc.simulateSafeReload();
  assert(
    reviewReload.recoveredPhase === 'PRE_SIEGE_REVIEW',
    'Test M: Reload during PRE_SIEGE_REVIEW restores PRE_SIEGE_REVIEW',
  );

  sc.startSiege(true);
  sc.retryDesign();
  const afterRetry = store.getState();
  assert(
    store.getPlayerPlacedPieces().length === 2 &&
      afterRetry.wisps.every((w) => w.placed === true) &&
      afterRetry.wisps.find((w) => w.id === 'wisp_marinus')!.position.x === 460,
    'Test M: Retry Design restores submitted fortress and submitted wisp arrangement',
  );

  // 4. Start Over returns all 3 wisps to staging (placed: false) and clears player pieces
  sc.startOver();
  assert(
    store.getPlayerPlacedPieces().length === 0 &&
      store.getState().wisps.every((w) => w.placed === false) &&
      store.getWispPresenceDiagnostics('CONSTRUCTION').wispBattlefieldCount === 0 &&
      store.getWispPresenceDiagnostics('CONSTRUCTION').wispStagingCount === 3,
    'Test M: Start Over restores original prebuilt environment and returns all 3 wisps to staging (placed: false)',
  );

  console.log('✓ Test M (Reload and Restore): PASSED');
}

console.log('\n======================================================================');
console.log('ALL BUILD-PHASE WISP REMOVAL & ROTATION-COLLISION TESTS (A - M) PASSED!');
console.log('======================================================================');
