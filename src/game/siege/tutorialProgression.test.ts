/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Level 1 Tutorial Progression & Guided Placement Correction Acceptance Test Suite (Tests A - I)
 */

import { LevelStore } from '../state/levelStore';
import { SiegeController } from './siegeController';
import { Camera } from '../input/camera';
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
function makePiece(type: MaterialType, x: number, y: number, rotation = 0): PlacedPiece {
  return {
    id: `player_piece_test_${pieceSeq++}`,
    type,
    position: { x, y },
    rotation,
    isPrebuilt: false,
  };
}

function runFullTwoWaveSiege(siege: SiegeController, onReinforcement?: () => void): void {
  siege.skipIntroduction();
  siege.step(0.016);
  siege.step(1.3);
  for (let i = 0; i < 600; i++) {
    siege.step(0.016);
    if (siege.mode === 'ATTACK_RESOLVED') break;
  }
  assert(siege.mode === 'ATTACK_RESOLVED', `Expected ATTACK_RESOLVED after Wave 1, got ${siege.mode}`);

  siege.enterReinforcementPhase();
  siege.beginActiveReinforcement();
  if (onReinforcement) {
    onReinforcement();
  }
  siege.finishReinforcement();
  siege.launchFinalAttack();

  siege.skipIntroduction();
  siege.step(0.016);
  siege.step(1.3);
  // Allow final settlement, anticipation, celebration, and completion.
  for (let i = 0; i < 1800; i++) {
    siege.step(0.016);
    if (siege.mode === 'SEQUENCE_COMPLETE' || siege.mode === 'RESULTS') {
      break;
    }
  }

  assert(
    siege.mode === 'SEQUENCE_COMPLETE' || siege.mode === 'RESULTS',
    `Expected SEQUENCE_COMPLETE after Wave 2, got ${siege.mode}`,
  );
}

console.log('================================================================');
console.log('LEVEL 1 TUTORIAL PROGRESSION & GUIDED PLACEMENT ACCEPTANCE SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST A: Normal Guided Flow (Steps 1 -> 6 -> Accept Stable Design -> Siege)
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Initial state: Step 1 (Select Beam)
  let tut = store.getAuthoritativeTutorialState();
  assert(tut.currentGuidedStep === 'STEP_1_SELECT_BEAM', 'Test A: Starts at STEP_1_SELECT_BEAM');
  assert(
    tut.currentHighlightedItemId === 'wood_beam',
    'Test A: Highlights wood_beam in Step 1',
  );
  assert(!tut.siegeEligible && !sc.canBeginSiege().allowed, 'Test A: Begin Siege gated initially');

  // Player begins dragging a wood_beam -> advances to STEP_2_PLACE_BEAM
  store.setActiveDragTutorialContext('wood_beam', true);
  tut = store.getAuthoritativeTutorialState();
  assert(
    tut.currentGuidedStep === 'STEP_2_PLACE_BEAM',
    'Test A: Dragging wood_beam advances to STEP_2_PLACE_BEAM',
  );
  assert(
    tut.currentSuggestedPlacementRegion?.pieceType === 'wood_beam',
    'Test A: Suggested region active for wood_beam',
  );

  // Release drag and place beam across sanctuary piers at (200, 672)
  store.setActiveDragTutorialContext(null, true);
  const beamPiece = makePiece('wood_beam', 200, 672, 0);
  const beamPlacedOk = store.placePiece(beamPiece);
  assert(beamPlacedOk === true, 'Test A: Placed wood_beam');

  tut = store.getAuthoritativeTutorialState();
  assert(tut.beamPlaced === true, 'Test A: beamPlaced immediately true');
  assert(
    tut.supportedConnectionCreated === true,
    'Test A: Beam resting on piers satisfies supportedConnectionCreated',
  );
  assert(
    tut.currentGuidedStep === 'STEP_3_PLACE_BLOCK',
    'Test A: Advances immediately to STEP_3_PLACE_BLOCK',
  );
  assert(
    tut.currentHighlightedItemId === 'wood_block',
    'Test A: Highlights wood_block in Step 3',
  );
  assert(
    tut.currentSuggestedPlacementRegion?.pieceType === 'wood_block',
    'Test A: Suggested region active for wood_block',
  );

  // Place wood_block on western bastion step at (152, 756)
  const blockPiece = makePiece('wood_block', 152, 756, 0);
  const blockPlacedOk = store.placePiece(blockPiece);
  assert(blockPlacedOk === true, 'Test A: Placed wood_block');

  tut = store.getAuthoritativeTutorialState();
  assert(tut.blockPlaced === true, 'Test A: blockPlaced immediately true');
  assert(
    tut.currentGuidedStep === 'STEP_5_TEST_STABILITY',
    'Test A: Advances immediately to STEP_5_TEST_STABILITY once beam, block, and support exist',
  );
  assert(
    tut.currentHighlightedItemId === 'test_stability',
    'Test A: Highlights test_stability button in Step 5',
  );
  assert(!tut.stabilityTestPassed, 'Test A: stabilityTestPassed is false before running test');
  assert(!sc.canBeginSiege().allowed, 'Test A: Begin Siege still gated before stability test');

  // Run Test Stability (without auto-accepting yet to inspect Step 6 / Fortress Stable state)
  const simRes = sc.runTutorialStabilityTest(2.5, false);
  assert(simRes.passed === true && simRes.fallenCount === 0, 'Test A: Stability simulation passed');

  tut = store.getAuthoritativeTutorialState();
  assert(tut.stabilityTestPassed === true, 'Test A: stabilityTestPassed immediately true on settle');
  assert(
    tut.currentGuidedStep === 'STEP_6_ACCEPT_OR_REVISE',
    'Test A: Enters STEP_6_ACCEPT_OR_REVISE on Fortress Stable screen',
  );
  assert(
    tut.currentHighlightedItemId === 'accept_stable_design',
    'Test A: Highlights accept_stable_design CTA',
  );

  // Select "Accept Stable Design"
  sc.acceptStableDesignFromTest();
  tut = store.getAuthoritativeTutorialState();
  assert(tut.stableDesignAccepted === true, 'Test A: stableDesignAccepted is true');
  assert(tut.basicLessonComplete === true, 'Test A: basicLessonComplete is true');
  assert(tut.siegeEligible === true, 'Test A: siegeEligible is immediately true without reload');
  assert(tut.currentGuidedStep === 'COMPLETE', 'Test A: Guided step is COMPLETE');
  assert(
    tut.currentHighlightedItemId === 'begin_siege',
    'Test A: Highlights begin_siege once after accepting stable design',
  );
  assert(
    sc.canBeginSiege().allowed === true,
    'Test A: SiegeController.canBeginSiege().allowed is immediately true',
  );

  // Begin Siege immediately without reloading
  const started = sc.attemptBeginSiege();
  assert(started === true, 'Test A: attemptBeginSiege() succeeds immediately without reload');
  console.log('✓ Test A (Normal Guided Flow & Immediate Siege Readiness): PASSED');
}

// -----------------------------------------------------------------------------
// TEST B: Return to Build After Stability Test & Revision Invalidation
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  const blkOk = store.placePiece(makePiece('wood_block', 152, 756, 0));
  assert(blkOk === true, 'Test B: Placed beam and block');

  const revBeforeTest = store.currentConstructionRevision;
  const simRes = sc.runTutorialStabilityTest(2.5, false);
  assert(simRes.passed === true, 'Test B: Initial stability test passed');
  assert(
    store.getAuthoritativeTutorialState().stabilityTestPassed === true,
    'Test B: stabilityTestPassed true for tested revision',
  );

  // Choose "Return to Build"
  sc.returnToBuildFromStabilityTest();
  let tut = store.getAuthoritativeTutorialState();
  assert(
    tut.currentConstructionRevision === revBeforeTest,
    'Test B: Returning to build without edits preserves tested revision ID',
  );
  assert(
    tut.stabilityTestPassed === true,
    'Test B: Unmodified design after Return to Build retains stabilityTestPassed',
  );

  // Now modify the fortress (place another block) -> revision increments & invalidates prior stability test
  store.placePiece(makePiece('stone_block', 104, 756, 0));
  tut = store.getAuthoritativeTutorialState();
  assert(
    tut.currentConstructionRevision === revBeforeTest + 1,
    'Test B: Structural edit increments currentConstructionRevision',
  );
  assert(
    tut.stabilityTestPassed === false,
    'Test B: Structural edit marks prior stability test stale (stabilityTestPassed === false)',
  );
  assert(
    tut.stableDesignAccepted === false && tut.siegeEligible === false,
    'Test B: Structural edit requires re-testing stability before siege',
  );
  assert(
    tut.currentGuidedStep === 'STEP_5_TEST_STABILITY',
    'Test B: Guidance returns to STEP_5_TEST_STABILITY after post-test edit',
  );
  assert(
    Boolean(tut.lastTutorialBlockingReason?.startsWith('REVISION_STALE')),
    `Test B: Diagnostic blocking reason reports REVISION_STALE (got ${tut.lastTutorialBlockingReason})`,
  );

  // Re-run stability test and accept
  const simRes2 = sc.runTutorialStabilityTest(2.5, true);
  assert(simRes2.passed === true, 'Test B: Second stability test passed and accepted');
  tut = store.getAuthoritativeTutorialState();
  assert(
    tut.siegeEligible === true && sc.canBeginSiege().allowed,
    'Test B: Siege eligible after re-test',
  );
  console.log('✓ Test B (Return to Build & Revision Staleness Invalidation): PASSED');
}

// -----------------------------------------------------------------------------
// TEST C: Out-of-Order Actions & Bullseye Block Non-Block Classification
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // 1. Place Bullseye Block first -> must NOT satisfy blockPlaced
  const bullseyePiece = makePiece('bullseye_block', 152, 756, 0);
  const bullseyeOk = store.placePiece(bullseyePiece);
  assert(bullseyeOk === true, 'Test C: Placed bullseye_block');
  let tut = store.getAuthoritativeTutorialState();
  assert(
    tut.blockPlaced === false,
    'Test C: Bullseye Block does NOT satisfy tutorial blockPlaced requirement',
  );
  const placedBullseye = store.getPlacedBullseyePiece();
  if (placedBullseye) store.removePiece(placedBullseye.id);

  // 2. Place a structural wood_block first (out of order before beam)
  const blockPiece = makePiece('wood_block', 152, 756, 0);
  store.placePiece(blockPiece);
  tut = store.getAuthoritativeTutorialState();
  assert(tut.blockPlaced === true, 'Test C: Out-of-order block placement immediately recognized');
  assert(tut.beamPlaced === false, 'Test C: beamPlaced still false');
  assert(
    tut.currentGuidedStep === 'STEP_1_SELECT_BEAM',
    'Test C: Guidance points to earliest incomplete requirement (STEP_1_SELECT_BEAM)',
  );

  // 3. Place beam high in midair (unsupported) -> beamPlaced & blockPlaced true, but no support
  store.removePiece(blockPiece.id);
  const floatingBlock = makePiece('wood_block', 225, 420, 0);
  const floatingBeam = makePiece('wood_beam', 225, 340, 0);
  store.placePiece(floatingBlock);
  store.placePiece(floatingBeam);
  tut = store.getAuthoritativeTutorialState();
  assert(tut.beamPlaced && tut.blockPlaced, 'Test C: Both beam and block placed');
  assert(
    tut.supportedConnectionCreated === false,
    'Test C: Floating midair pieces do not satisfy supportedConnectionCreated',
  );
  assert(
    tut.currentGuidedStep === 'STEP_4_CREATE_SUPPORT',
    'Test C: Advances to STEP_4_CREATE_SUPPORT when beam & block placed without support',
  );

  // 4. Move beam onto sanctuary piers -> supportedConnectionCreated becomes true
  store.movePiece(floatingBeam.id, { x: 200, y: 672 });
  store.movePiece(floatingBlock.id, { x: 152, y: 756 });
  tut = store.getAuthoritativeTutorialState();
  assert(tut.supportedConnectionCreated === true, 'Test C: Support connection recognized');
  assert(
    tut.currentGuidedStep === 'STEP_5_TEST_STABILITY',
    'Test C: Advances to STEP_5_TEST_STABILITY',
  );
  console.log('✓ Test C (Out-of-Order Actions & Bullseye Classification): PASSED');
}

// -----------------------------------------------------------------------------
// TEST D: Unstable Test Detection & Pre-Test Restoration
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Place a supported beam & block, PLUS a high unsupported floating block that will plummet under gravity
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  const unstableFloating = makePiece('stone_block', 225, 350, 0);
  store.placePiece(unstableFloating);

  const simRes = sc.runTutorialStabilityTest(2.5, false);
  assert(
    simRes.passed === false && simRes.fallenCount > 0,
    `Test D: Unstable gravity test detected fallen piece (fallenCount=${simRes.fallenCount})`,
  );

  const tut = store.getAuthoritativeTutorialState();
  assert(tut.stabilityTestPassed === false, 'Test D: stabilityTestPassed remains false');
  assert(tut.siegeEligible === false, 'Test D: siegeEligible remains false');
  assert(tut.beamPlaced && tut.blockPlaced, 'Test D: Valid placed pieces remain recognized');
  assert(
    tut.unstableHint !== null && tut.unstableHint.includes('fell under gravity'),
    'Test D: Concise instability hint populated',
  );

  // Return to Build restores pre-test coordinates
  sc.returnToBuildFromStabilityTest();
  const restoredFloating = store
    .getState()
    .pieces.find((p) => p.id === unstableFloating.id);
  assert(
    restoredFloating !== undefined && Math.abs(restoredFloating.position.y - 350) < 1e-3,
    'Test D: Return to Build restores exact pre-test coordinates of fallen piece',
  );
  console.log('✓ Test D (Unstable Test Detection & Pre-Test Restoration): PASSED');
}

// -----------------------------------------------------------------------------
// TEST E: Undo and Redo Synchronization
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();

  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  assert(store.getAuthoritativeTutorialState().beamPlaced === true, 'Test E: Beam placed');

  store.undo();
  assert(
    store.getAuthoritativeTutorialState().beamPlaced === false,
    'Test E: Undo immediately clears beamPlaced',
  );
  assert(
    store.getAuthoritativeTutorialState().currentGuidedStep === 'STEP_1_SELECT_BEAM',
    'Test E: Undo reverts guided step to STEP_1_SELECT_BEAM',
  );

  store.redo();
  assert(
    store.getAuthoritativeTutorialState().beamPlaced === true,
    'Test E: Redo immediately restores beamPlaced',
  );
  assert(
    store.getAuthoritativeTutorialState().currentGuidedStep === 'STEP_3_PLACE_BLOCK',
    'Test E: Redo advances guided step back to STEP_3_PLACE_BLOCK',
  );
  console.log('✓ Test E (Undo and Redo Immediate Checklist Synchronization): PASSED');
}

// -----------------------------------------------------------------------------
// TEST F: Guidance Skip Behavior
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  store.setGuidanceSkipped(true);
  let tut = store.getAuthoritativeTutorialState();
  assert(tut.guidanceSkipped === true, 'Test F: guidanceSkipped is true');
  assert(
    tut.currentHighlightedItemId === null && tut.currentSuggestedPlacementRegion === null,
    'Test F: Skipping guidance suppresses glowing item highlights and world placement suggestions',
  );
  assert(
    tut.siegeEligible === false && !sc.canBeginSiege().allowed,
    'Test F: Skipping guidance still enforces the required checklist before Begin Siege',
  );

  // Complete build and stability test while guidance is skipped
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  sc.runTutorialStabilityTest(2.5, true);

  tut = store.getAuthoritativeTutorialState();
  assert(
    tut.siegeEligible === true && sc.canBeginSiege().allowed,
    'Test F: Completing requirements while guidance is skipped enables Begin Siege',
  );
  console.log('✓ Test F (Skip Guidance Preserves Checklist Gate): PASSED');
}

// -----------------------------------------------------------------------------
// TEST G: Reload Recovery Across All 5 Tutorial States
// -----------------------------------------------------------------------------
{
  // G1: Partially completed tutorial
  const s1 = new LevelStore();
  s1.clearStorage();
  s1.placePiece(makePiece('wood_beam', 200, 672, 0));
  const s1Reloaded = new LevelStore();
  const t1 = s1Reloaded.getAuthoritativeTutorialState();
  assert(
    t1.beamPlaced === true && t1.blockPlaced === false && t1.currentGuidedStep === 'STEP_3_PLACE_BLOCK',
    'Test G1: Reload during partial tutorial preserves beamPlaced and STEP_3_PLACE_BLOCK',
  );

  // G2: Completed placement before stability test
  s1Reloaded.placePiece(makePiece('wood_block', 152, 756, 0));
  const s2Reloaded = new LevelStore();
  const t2 = s2Reloaded.getAuthoritativeTutorialState();
  assert(
    t2.beamPlaced &&
      t2.blockPlaced &&
      t2.supportedConnectionCreated &&
      !t2.stabilityTestPassed &&
      t2.currentGuidedStep === 'STEP_5_TEST_STABILITY',
    'Test G2: Reload before stability test preserves STEP_5_TEST_STABILITY',
  );

  // G3: Reload during active stability test (TESTING_SIMULATION)
  s2Reloaded.recordStabilityTestStarted();
  s2Reloaded.setSavedPhase('TESTING_SIMULATION');
  const s3Reloaded = new LevelStore();
  const sc3 = new SiegeController(s3Reloaded);
  sc3.simulateSafeReload();
  const t3 = s3Reloaded.getAuthoritativeTutorialState();
  assert(
    sc3.mode === 'CONSTRUCTION' && !t3.stabilityTestPassed && t3.beamPlaced && t3.blockPlaced,
    'Test G3: Reload during TESTING_SIMULATION restores editable pre-test state safely',
  );

  // G4: Reload on Fortress Stable screen (SETTLED after passing stability test)
  const sc4Prep = new SiegeController(s3Reloaded);
  sc4Prep.runTutorialStabilityTest(2.5, false); // settles and passes, not yet accepted
  s3Reloaded.setSavedPhase('SETTLED');
  const s4Reloaded = new LevelStore();
  const sc4 = new SiegeController(s4Reloaded);
  sc4.simulateSafeReload();
  const t4 = s4Reloaded.getAuthoritativeTutorialState();
  assert(
    sc4.mode === 'CONSTRUCTION' &&
      t4.stabilityTestPassed === true &&
      t4.stableDesignAccepted === true &&
      t4.siegeEligible === true &&
      sc4.canBeginSiege().allowed,
    'Test G4: Reload on SETTLED after passing stability test preserves completion and enables Begin Siege',
  );

  // G5: Reload in ready-for-siege state (CONSTRUCTION_READY)
  const s5Reloaded = new LevelStore();
  const t5 = s5Reloaded.getAuthoritativeTutorialState();
  assert(
    t5.siegeEligible === true && t5.basicLessonComplete === true,
    'Test G5: Reload in ready-for-siege state preserves siegeEligible === true',
  );
  console.log('✓ Test G (Safe Reload Recovery Across All 5 Tutorial States): PASSED');
}

// -----------------------------------------------------------------------------
// TEST H: Active Drag Camera Non-Interference
// -----------------------------------------------------------------------------
{
  const cam = new Camera();
  cam.resize(390, 844); // Mobile portrait viewport
  const initialCenterX = cam.currentCenter.x;
  const initialCenterY = cam.currentCenter.y;

  // Request a camera framing change while user is actively dragging
  cam.isUserInteracting = true;
  cam.setFraming({ x: 350, y: 600 }, 520, 460, 'CONSTRUCTION_CAMERA', false);
  cam.update(0.5);

  assert(
    cam.currentCenter.x === initialCenterX && cam.currentCenter.y === initialCenterY,
    'Test H: Camera never auto-pans or overrides view while isUserInteracting is true',
  );
  console.log('✓ Test H (Mobile Viewport & Active Drag Non-Interference): PASSED');
}

// -----------------------------------------------------------------------------
// TEST I: Regressions Across Phases 1 - 5
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build valid shelter + Bullseye decoy
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  store.placePiece(makePiece('wood_block', 152, 756, 0));
  store.placePiece(makePiece('bullseye_block', 152, 718, 0));
  sc.runTutorialStabilityTest(2.5, true);

  const started = sc.attemptBeginSiege(true);
  assert(started === true, 'Test I: Siege starts after passing guided lesson');
  runFullTwoWaveSiege(sc, () => {
    store.placePiece(makePiece('stone_block', 152, 756, 0));
  });
  assert(sc.level1Results !== null, 'Test I: Full Level 1 two-wave siege + reinforcement completes');
  console.log('✓ Test I (Phases 1-5 Regressions & Full Two-Wave Siege): PASSED');
}

console.log('\nALL TESTS (A - I) PASSED SUCCESSFULLY.');
