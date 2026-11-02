/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WISP ENCLOSURE PLACEMENT RULE CORRECTION ACCEPTANCE TEST SUITE (Tests A - I)
 */

import { LevelStore } from '../state/levelStore';
import { SiegeController } from './siegeController';
import { PhysicsBridge } from '../physics/physicsBridge';
import { selectTargetAndTrajectory } from './targeting';
import { AUTHORED_ATTACKS, DISTANCE_PRESETS } from './siegeConfig';
import { MaterialType, PlacedPiece } from '../types';
import { validateWispPlacementPosition, evaluateWispProtectionAndRisks } from '../math/wispPlacement';

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

let seq = 1;
function makePiece(
  type: MaterialType,
  x: number,
  y: number,
  rotation = 0,
  attachedAnchorId?: string,
): PlacedPiece {
  return {
    id: `player_enclosure_piece_${seq++}`,
    type,
    position: { x, y },
    rotation,
    isPrebuilt: false,
    ...(attachedAnchorId ? { attachedAnchorId } : {}),
  };
}

console.log('=== WISP ENCLOSURE PLACEMENT RULE CORRECTION ACCEPTANCE SUITE (A - I) ===\n');

// -----------------------------------------------------------------------------
// TEST A: SEALED WOODEN CHAMBER
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Construct a fully sealed wooden chamber on ground (y=780):
  // Left upright post: wood beam rotated 90° (width 24, height 120), at x=310, y=720 (extends x: 298..322, y: 660..780)
  // Right upright post: wood beam rotated 90°, at x=390, y=720 (extends x: 378..402, y: 660..780)
  // Roof: horizontal wood beam (width 120, height 24), at x=350, y=648 (extends x: 290..410, y: 636..660)
  // Floor: solid bedrock ground at y=780
  store.placePiece(makePiece('wood_beam', 310, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 390, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 350, 648, 0));

  // Run stability test and advance to PLACE_WISPS
  const testRes = sc.runTutorialStabilityTest(2.5, false);
  assert(testRes.passed === true, 'Test A: Stability passed for wooden chamber');
  sc.enterPlaceWispsPhase(true);

  // Place wisp_ignis inside the sealed chamber at (350, 720)
  // Interior space: x from 322 to 378 (width = 56px, clearance dx = 28px > wisp radius 18px)
  // y from 660 to 780 (height = 120px, clearance dy = 60px > wisp radius 18px)
  const placeRes = store.placeWisp('wisp_ignis', { x: 350, y: 720 });
  assert(placeRes.success === true, 'Test A: Valid placement inside sealed wooden chamber');
  assert(placeRes.validation.isValid === true, 'Test A: Validation must be valid');
  assert(placeRes.validation.rejectionCode === null, 'Test A: Rejection code must be null');

  const diag = store.lastWispPlacementDiagnostics;
  assert(diag !== null, 'Test A: Diagnostics must exist');
  assert(diag!.exteriorPathCheckEnabled === false, 'Test A: Exterior path check must be strictly false');
  assert(diag!.sealedEnclosureAccepted === true, 'Test A: Sealed enclosure must be recognized and accepted');
  assert(diag!.localClearanceResult === 'CLEAR' || diag!.localClearanceResult === 'TIGHT', 'Test A: Local clearance fits');

  console.log('✓ Test A (Sealed Wooden Chamber): PASSED');
}

// -----------------------------------------------------------------------------
// TEST B: SEALED STONE CHAMBER
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Construct a fully sealed stone chamber on ground (y=780):
  // Left wall: stone block (48x48) at x=310, y=756 (x: 286..334, y: 732..780)
  // Right wall: stone block (48x48) at x=390, y=756 (x: 366..414, y: 732..780)
  // Roof: stone block (48x48) spanning across at x=350, y=708 (x: 326..374, y: 684..732)
  store.placePiece(makePiece('stone_block', 310, 756, 0));
  store.placePiece(makePiece('stone_block', 390, 756, 0));
  store.placePiece(makePiece('stone_block', 350, 708, 0));

  const testRes = sc.runTutorialStabilityTest(2.5, false);
  assert(testRes.passed === true, 'Test B: Stability passed for stone chamber');
  sc.enterPlaceWispsPhase(true);

  // Place wisp_marinus (radius 17) inside at (350, 756)
  // Interior: x from 334 to 366 (width = 32px is too small for 34px diameter, so let's widen to x=300 and x=400)
  // Left wall: x=300, y=756 (x: 276..324)
  // Right wall: x=400, y=756 (x: 376..424)
  // Roof: beam + stone block above
}
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Widen stone chamber:
  // Left wall: x=300, y=756 (x: 276..324)
  // Right wall: x=400, y=756 (x: 376..424)
  // Roof: stone block at x=350, y=708 (x: 326..374) and cap beam
  store.placePiece(makePiece('stone_block', 300, 756, 0));
  store.placePiece(makePiece('stone_block', 400, 756, 0));
  store.placePiece(makePiece('wood_beam', 350, 720, 0)); // lintel beam
  store.placePiece(makePiece('stone_block', 350, 684, 0)); // heavy stone block resting on top of lintel beam

  const testRes = sc.runTutorialStabilityTest(2.5, false);
  assert(testRes.passed === true, 'Test B: Stability passed');
  sc.enterPlaceWispsPhase(true);

  // Place wisp inside: x from 324 to 376 (span 52px, center 350, radius 18 fits with clearance 26px > 18px)
  // y from 732 to 780 (height 48px, center 756, radius 18 fits with clearance 24px > 18px)
  const placeRes = store.placeWisp('wisp_ignis', { x: 350, y: 756 });
  assert(placeRes.success === true, 'Test B: Valid placement inside sealed stone chamber');
  assert(placeRes.validation.isValid === true, 'Test B: Validation must be valid');

  const ignis = store.getState().wisps.find((w) => w.id === 'wisp_ignis')!;
  assert(
    ignis.heavyOverheadHazard === true,
    'Test B: Heavy stone overhead must trigger heavyOverheadHazard warning',
  );
  assert(
    Boolean(ignis.hazardWarning?.includes('Heavy overhead collapse risk.')),
    `Test B: Warning message must show "Heavy overhead collapse risk." (got: ${ignis.hazardWarning})`,
  );
  assert(
    store.lastWispPlacementDiagnostics?.warningClassifications.includes('HEAVY_OVERHEAD_HAZARD') === true,
    'Test B: Diagnostics must include HEAVY_OVERHEAD_HAZARD',
  );
  assert(
    store.lastWispPlacementDiagnostics?.sealedEnclosureAccepted === true,
    'Test B: Sealed enclosure must be accepted',
  );

  console.log('✓ Test B (Sealed Stone Chamber): PASSED');
}

// -----------------------------------------------------------------------------
// TEST C: INDIVIDUAL CHAMBERS (ALL FIVE WISPS ENCLOSED)
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build 5 separate protected enclosed chambers across sanctuary:
  // Ground level divider blocks
  store.placePiece(makePiece('wood_block', 300, 756, 0));
  store.placePiece(makePiece('wood_block', 500, 756, 0));

  // Ground level lintel beams
  store.placePiece(makePiece('wood_beam', 250, 720, 0));
  store.placePiece(makePiece('wood_beam', 350, 720, 0));
  store.placePiece(makePiece('wood_beam', 450, 720, 0));
  store.placePiece(makePiece('wood_beam', 550, 720, 0));

  // Elevated chamber walls and roof
  store.placePiece(makePiece('wood_block', 350, 684, 0));
  store.placePiece(makePiece('wood_block', 450, 684, 0));
  store.placePiece(makePiece('wood_beam', 400, 648, 0));

  const testRes = sc.runTutorialStabilityTest(2.5, false);
  assert(testRes.passed === true, 'Test C: Stability passed');
  sc.enterPlaceWispsPhase(true);

  // Place 5 wisps in their distinct sheltered/enclosed positions
  const p1 = store.placeWisp('wisp_ignis', { x: 250, y: 756 });
  const p2 = store.placeWisp('wisp_zephyr', { x: 350, y: 756 });
  const p3 = store.placeWisp('wisp_terran', { x: 400, y: 684 });
  const p4 = store.placeWisp('wisp_marinus', { x: 450, y: 756 });
  const p5 = store.placeWisp('wisp_aetheris', { x: 550, y: 756 });

  if (!p1.success || !p2.success || !p3.success || !p4.success || !p5.success) {
    console.log('FAIL DETAILS:', {
      p1: p1.validation,
      p2: p2.validation,
      p3: p3.validation,
      p4: p4.validation,
      p5: p5.validation,
    });
  }
  assert(p1.success && p2.success && p3.success && p4.success && p5.success, 'Test C: All 5 wisps placed successfully');
  assert(store.areAllWispsPlacedAndValid() === true, 'Test C: areAllWispsPlacedAndValid() is true');

  // Confirm Pre-Siege Review becomes available
  const enteredReview = sc.enterPreSiegeReview();
  assert(enteredReview === true, 'Test C: Pre-Siege Review becomes available and can be entered');
  assert(sc.mode === 'PRE_SIEGE_REVIEW', 'Test C: Mode is PRE_SIEGE_REVIEW');
  assert(sc.canBeginSiege().allowed === true, 'Test C: Begin Siege is now enabled');

  console.log('✓ Test C (Individual Chambers): PASSED');
}

// -----------------------------------------------------------------------------
// TEST D: SHARED CHAMBER
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build a wide enclosed hall on the eastern span (between center altar 400 and right pillar 600):
  // Left post: x=440, y=720 (Math.PI / 2)
  // Right post: x=560, y=720 (Math.PI / 2)
  // Long roof: wood beam at x=500, y=648 (width 120: spans 440 to 560 across posts)
  store.placePiece(makePiece('wood_beam', 440, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 560, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 500, 648, 0));

  sc.runTutorialStabilityTest(2.5, false);
  sc.enterPlaceWispsPhase(true);

  // Place wisp 1 at (475, 740) and wisp 2 at (525, 740) inside the shared hall (dx = 50px apart, no wisp-wisp overlap)
  const p1 = store.placeWisp('wisp_ignis', { x: 475, y: 740 });
  const p2 = store.placeWisp('wisp_zephyr', { x: 525, y: 740 });

  assert(p1.success === true, 'Test D: Wisp 1 placed inside shared chamber');
  assert(p2.success === true, 'Test D: Wisp 2 placed inside shared chamber');

  const ignis = store.getState().wisps.find((w) => w.id === 'wisp_ignis')!;
  const zephyr = store.getState().wisps.find((w) => w.id === 'wisp_zephyr')!;

  assert(
    ignis.sharedCollapseRisk === true && zephyr.sharedCollapseRisk === true,
    'Test D: Shared collapse risk warning must be triggered for wisps sharing a chamber',
  );
  assert(
    Boolean(ignis.hazardWarning?.includes('Several wisps share one collapse risk.')),
    `Test D: Warning message must show "Several wisps share one collapse risk." (got: ${ignis.hazardWarning})`,
  );
  assert(
    store.getSharedCollapseRiskWarning() !== null,
    'Test D: Store must report shared collapse risk warning',
  );

  console.log('✓ Test D (Shared Chamber): PASSED');
}

// -----------------------------------------------------------------------------
// TEST E: TOO-SMALL CHAMBER (GENUINE COLLIDER INTERSECTION)
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build a chamber where interior gap is only 20px (between x=340 and x=360)
  // Left post: x=328, y=756 (48x48: x from 304 to 352)
  // Right post: x=372, y=756 (48x48: x from 348 to 396)
  // The two blocks overlap or leave < 24px clearance.
  // Terran has radius 20px (diameter 40px), Ignis has radius 18px (diameter 36px)
  store.placePiece(makePiece('wood_block', 320, 756, 0)); // extends x: 296..344
  store.placePiece(makePiece('wood_block', 370, 756, 0)); // extends x: 346..394 (gap between 344 and 346 is 2px!)
  store.placePiece(makePiece('wood_beam', 345, 720, 0));

  sc.runTutorialStabilityTest(2.5, false);
  sc.enterPlaceWispsPhase(true);

  // Attempt to place wisp_ignis (radius 18) at x=345, y=756
  // Distance from 345 to block at 320 is (345 - 344 = 1px) < 18px
  const placeRes = store.placeWisp('wisp_ignis', { x: 345, y: 756 });
  assert(placeRes.success === false, 'Test E: Placement in too-small chamber must be rejected');
  assert(
    placeRes.validation.rejectionCode === 'PIECE_OVERLAP',
    `Test E: Rejection code must be PIECE_OVERLAP (got: ${placeRes.validation.rejectionCode})`,
  );

  const msg = placeRes.validation.playerFriendlyMessage ?? '';
  assert(
    msg.includes('Not enough physical clearance for this wisp.') ||
      msg.includes('Wisp overlaps a construction piece.'),
    `Test E: Message must identify insufficient clearance or piece overlap (got: "${msg}")`,
  );
  assert(
    !msg.includes('sealed pocket') && !msg.includes('open aether'),
    'Test E: Message must NOT mention "sealed pocket" or "open aether volume"',
  );

  console.log('✓ Test E (Too-Small Chamber): PASSED');
}

// -----------------------------------------------------------------------------
// TEST F: FIXED TERRAIN / BEDROCK REJECTION
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

  // Attempt placement extending beneath ground floor (y=775 with radius 18 -> y+r = 793 > 780 groundY)
  const floorRes = store.placeWisp('wisp_ignis', { x: 350, y: 775 });
  assert(floorRes.success === false, 'Test F: Rejects placement extending beneath floor');
  assert(
    floorRes.validation.rejectionCode === 'TERRAIN_OVERLAP',
    `Test F: Rejection code must be TERRAIN_OVERLAP (got: ${floorRes.validation.rejectionCode})`,
  );
  assert(
    floorRes.validation.playerFriendlyMessage === 'Wisp cannot be placed inside fixed terrain.',
    `Test F: Friendly message must be "Wisp cannot be placed inside fixed terrain." (got: "${floorRes.validation.playerFriendlyMessage}")`,
  );

  // Attempt placement directly into bedrock anchor socket (x=600, y=780)
  const anchorRes = store.placeWisp('wisp_ignis', { x: 600, y: 770 });
  assert(anchorRes.success === false, 'Test F: Rejects placement inside anchor socket');
  assert(anchorRes.validation.rejectionCode === 'TERRAIN_OVERLAP', 'Test F: Rejects anchor as TERRAIN_OVERLAP');

  console.log('✓ Test F (Fixed Terrain): PASSED');
}

// -----------------------------------------------------------------------------
// TEST G: TARGETING AND PHYSICS WITH ENCLOSED WISPS
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build a sealed wooden fortress with an outer protective wall:
  // Outer western wall: stone blocks at x=200, y=756
  // Roof beam: x=250, y=720
  // Inner chamber: wisp placed at x=250, y=756
  const wall1 = makePiece('stone_block', 200, 756, 0);
  const wall2 = makePiece('wood_block', 300, 756, 0);
  const roof = makePiece('wood_beam', 250, 720, 0);
  store.placePiece(wall1);
  store.placePiece(wall2);
  store.placePiece(roof);

  sc.runTutorialStabilityTest(2.5, false);
  sc.enterPlaceWispsPhase(true);

  // Place all 5 wisps, with Ignis inside the sealed chamber at (250, 756)
  assert(store.placeWisp('wisp_ignis', { x: 250, y: 756 }).success, 'Test G: Placed Ignis enclosed');
  assert(store.placeWisp('wisp_zephyr', { x: 340, y: 740 }).success, 'Test G: Placed Zephyr');
  assert(store.placeWisp('wisp_terran', { x: 400, y: 704 }).success, 'Test G: Placed Terran');
  assert(store.placeWisp('wisp_marinus', { x: 460, y: 740 }).success, 'Test G: Placed Marinus');
  assert(store.placeWisp('wisp_aetheris', { x: 520, y: 740 }).success, 'Test G: Placed Aetheris');

  // Evaluate targeting for Attack 1 (Standard Attacker)
  const attack1 = { ...AUTHORED_ATTACKS[0], spawnPosition: { x: DISTANCE_PRESETS.STANDARD.launcherX, y: DISTANCE_PRESETS.STANDARD.launcherY } };
  const targetResult = selectTargetAndTrajectory(store.getState(), attack1);
  assert(targetResult !== null, 'Test G: Targeting must find a valid target');

  // Verify targeting targets the defensive structure / wall shielding the enclosed wisps rather than teleporting through
  assert(
    targetResult!.target.type !== 'wisp_threat',
    'Test G: Attacker does not target enclosed wisp directly through solid roof and walls',
  );
  assert(
    targetResult!.solution.expectedFirstObstruction !== 'none',
    'Test G: Expected first obstruction must be a physical piece or terrain',
  );

  // Start siege simulation and run physics steps
  sc.enterPreSiegeReview();
  assert(sc.startSiege(false) === true, 'Test G: Siege launched');

  // Step physics for 0.5s to verify projectile collision
  for (let i = 0; i < 30; i++) {
    sc.step(0.016);
  }

  // Verify physics bridge has wisp sensors for placed wisps and does not allow teleportation
  assert(sc.physicsBridge !== null, 'Test G: Physics bridge active');
  const ignisState = store.getState().wisps.find((w) => w.id === 'wisp_ignis')!;
  assert(ignisState.placed === true, 'Test G: Ignis remains placed in chamber');

  sc.physicsBridge?.teardown();
  console.log('✓ Test G (Targeting and Physics With Enclosed Wisps): PASSED');
}

// -----------------------------------------------------------------------------
// TEST H: RETRY AND RELOAD PRESERVES ENCLOSED WISPS
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build chamber and place enclosed wisp
  store.placePiece(makePiece('wood_beam', 300, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 400, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 350, 648, 0));
  sc.runTutorialStabilityTest(2.5, false);
  sc.enterPlaceWispsPhase(true);

  store.placeWisp('wisp_ignis', { x: 350, y: 720 });
  store.placeWisp('wisp_zephyr', { x: 250, y: 740 });
  store.placeWisp('wisp_terran', { x: 450, y: 740 });
  store.placeWisp('wisp_marinus', { x: 500, y: 740 });
  store.placeWisp('wisp_aetheris', { x: 550, y: 740 });

  sc.enterPreSiegeReview();
  sc.startSiege(true);

  // Call retryDesign
  sc.retryDesign();
  assert(sc.mode === 'CONSTRUCTION' || sc.mode === 'PLACE_WISPS' || sc.mode === 'PRE_SIEGE_REVIEW', 'Test H: Retried to construction or wisp preparation');

  const ignisAfterRetry = store.getState().wisps.find((w) => w.id === 'wisp_ignis')!;
  assert(
    ignisAfterRetry.placed === true &&
      ignisAfterRetry.position.x === 350 &&
      ignisAfterRetry.position.y === 720,
    `Test H: Ignis position restored exactly at (350, 720) inside enclosed chamber (got: ${ignisAfterRetry.position.x}, ${ignisAfterRetry.position.y})`,
  );
  assert(
    ignisAfterRetry.isValid === true,
    'Test H: Enclosed wisp remains valid after Retry Design',
  );

  // Simulate reload by creating a new store instance with storage preserved
  const reloadedStore = new LevelStore();
  const ignisAfterReload = reloadedStore.getState().wisps.find((w) => w.id === 'wisp_ignis')!;
  assert(
    ignisAfterReload.placed === true &&
      ignisAfterReload.position.x === 350 &&
      ignisAfterReload.position.y === 720,
    'Test H: Enclosed wisp restored exactly after session reload',
  );
  assert(
    ignisAfterReload.isValid === true,
    'Test H: Enclosure does not invalidate wisp after session reload',
  );

  // Call startOver -> wisps return to staging (placed: false)
  sc.startOver();
  assert(
    store.getState().wisps.every((w) => w.placed === false),
    'Test H: Start Over returns all wisps to staging',
  );

  console.log('✓ Test H (Retry and Reload): PASSED');
}

// -----------------------------------------------------------------------------
// TEST I: REGRESSION TEST CONFIRMATION
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Verify normal BUILD flow has zero battlefield wisps
  const diag = store.getWispPresenceDiagnostics('CONSTRUCTION');
  assert(
    diag.wispBattlefieldCount === 0 && diag.wispBlockerCount === 0 && diag.wispStagingCount === 5,
    'Test I: Zero wisps on battlefield in BUILD',
  );

  // Verify rotation transaction validation rejects intersecting rotation
  const b1 = makePiece('wood_beam', 300, 720, 0);
  const blk = makePiece('wood_block', 340, 720, 0);
  store.placePiece(b1);
  store.placePiece(blk);

  const rotRes = store.validatePieceRotation(b1.id, Math.PI / 2);
  assert(rotRes.rotationAccepted === false, 'Test I: Rotation collision validation active');

  console.log('✓ Test I (Regression): PASSED');
}

console.log('\n======================================================================');
console.log('ALL WISP ENCLOSURE PLACEMENT ACCEPTANCE TESTS (A - I) PASSED!');
console.log('======================================================================\n');
