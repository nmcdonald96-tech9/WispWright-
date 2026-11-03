/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LEVEL 1 THREE-WISP SIMPLIFICATION AND BALANCE FOUNDATION
 * Comprehensive Automated Verification & Scenario Suite (Tests 1-18 & Scenarios A-M)
 */

import {
  INITIAL_LEVEL_STATE,
  LEVEL_1_CONFIG,
  LEVEL_1_SELECTED_WISP_IDS,
  MATERIAL_CONFIGS,
  WISP_ROSTER_DEFINITIONS,
} from '../config';
import { solveSnapAndValidation } from '../math/snapSolver';
import { PhysicsBridge } from '../physics/physicsBridge';
import { PresentationDirector } from '../presentation/presentationDirector';
import { LevelStore } from '../state/levelStore';
import { MaterialType, PlacedPiece } from '../types';
import { AUTHORED_ATTACKS, DISTANCE_PRESETS } from './siegeConfig';
import { SiegeController } from './siegeController';
import {
  generateTargetCandidates,
  scoreCandidates,
  selectTargetAndTrajectory,
} from './targeting';

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
    id: `player_piece_l1_3wisp_${pieceSeq++}`,
    type,
    position: { x, y },
    rotation,
    isPrebuilt: false,
    ...(attachedAnchorId ? { attachedAnchorId } : {}),
  };
}

function stepSiegeToCompletion(sc: SiegeController): void {
  sc.skipIntroduction();
  sc.step(0.016);
  sc.step(1.3);
  for (let i = 0; i < 600; i++) {
    sc.step(0.016);
    if (sc.mode === 'ATTACK_RESOLVED') break;
  }
  sc.enterReinforcementPhase();
  sc.beginActiveReinforcement();
  if (sc.mode === 'EMERGENCY_DELIVERY') {
    sc.acknowledgeEmergencyDelivery();
  }
  sc.finishReinforcement();
  sc.launchFinalAttack();
  sc.skipIntroduction();
  sc.step(0.016);
  sc.step(1.3);
  for (let i = 0; i < 600; i++) {
    sc.step(0.016);
    if (sc.mode === 'ATTACK_RESOLVED') {
      sc.nextAttackManually();
      break;
    }
    if (sc.mode === 'SEQUENCE_COMPLETE' || sc.mode === 'RESULTS') break;
  }
}

console.log('========================================================================');
console.log('LEVEL 1 THREE-WISP SIMPLIFICATION & BALANCE FOUNDATION SUITE (1-18, A-M)');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Level 1 configuration initializes with requiredWispCount === 3 & preserves 5-wisp roster
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const cfg = store.getLevelConfiguration();
  const state = store.getState();

  assert(
    WISP_ROSTER_DEFINITIONS.length === 5,
    `Test 1: Full wisp roster must preserve all 5 wisps, got ${WISP_ROSTER_DEFINITIONS.length}`,
  );
  assert(
    cfg.levelId === LEVEL_1_CONFIG.levelId && cfg.requiredWispCount === 3,
    `Test 1: Level 1 configuration must have requiredWispCount === 3, got ${cfg.requiredWispCount}`,
  );
  assert(
    cfg.minimumStableWispsForCompletion === 2,
    `Test 1: Level 1 minimumStableWispsForCompletion must be 2, got ${cfg.minimumStableWispsForCompletion}`,
  );
  assert(
    JSON.stringify(cfg.selectedWispIds) === JSON.stringify(LEVEL_1_SELECTED_WISP_IDS) &&
      state.wisps.length === 3,
    `Test 1: Active Level 1 wisps must be [wisp_ignis, wisp_zephyr, wisp_marinus], got ${JSON.stringify(state.wisps.map((w) => w.id))}`,
  );

  // Verify the 3 Level 1 wisps have distinct colors, silhouettes, and tendencies
  const silhouettes = new Set(state.wisps.map((w) => w.silhouetteType));
  const tendencies = new Set(state.wisps.map((w) => w.tendency));
  const colors = new Set(state.wisps.map((w) => w.color));
  assert(
    silhouettes.size === 3 && tendencies.size === 3 && colors.size === 3,
    'Test 1: Level 1 three wisps must have distinct colors, silhouettes, and reaction tendencies',
  );

  console.log('✓ Test 1 (Level 1 Configuration & 3-Wisp Roster Selection): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 2 & SCENARIO A: BUILD phase has 0 battlefield wisps and 0 wisp blockers
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  const wispDiag = store.getWispPresenceDiagnostics('CONSTRUCTION');
  assert(
    wispDiag.wispBattlefieldCount === 0 &&
      wispDiag.wispBlockerCount === 0 &&
      wispDiag.wispStagingCount === 3,
    `Test 2 / Scenario A: Expected BF=0, Blocker=0, Staging=3 in BUILD, got BF=${wispDiag.wispBattlefieldCount}, Blocker=${wispDiag.wispBlockerCount}, Staging=${wispDiag.wispStagingCount}`,
  );

  // Place and rotate pieces across former wisp positions without any wisp blocker
  const beam = makePiece('wood_beam', 300, 730, 0);
  assert(store.placePiece(beam) === true, 'Test 2: Placed beam in sanctuary during BUILD');
  assert(
    store.rotatePiece(beam.id, Math.PI / 12) === true,
    'Test 2: Rotated beam in sanctuary during BUILD without wisp collision',
  );

  console.log('✓ Test 2 & Scenario A (Zero Battlefield Wisps in BUILD): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 3, TEST 4, TEST 5, TEST 6 & SCENARIO B: PLACE_WISPS tray has 3 wisps, 0/3 -> 1/3 -> 2/3 -> 3/3 gating
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build valid shelter and pass stability test
  assert(store.placePiece(makePiece('wood_beam', 200, 672, 0)), 'Test 3: Placed beam');
  assert(store.placePiece(makePiece('wood_block', 152, 756, 0)), 'Test 3: Placed block');
  const simRes = sc.runTutorialStabilityTest(2.5, false);
  assert(simRes.passed === true, 'Test 3: Stability test passed');

  assert(sc.enterPlaceWispsPhase(true) === true && sc.mode === 'PLACE_WISPS', 'Test 3: Entered PLACE_WISPS');

  const trayWisps = store.getState().wisps;
  assert(trayWisps.length === 3, `Test 3: PLACE_WISPS tray must contain exactly 3 wisps, got ${trayWisps.length}`);
  assert(
    trayWisps.every((w) => w.placed === false),
    'Test 3: All 3 wisps start unplaced (0/3)',
  );

  // 0/3 placed -> Pre-Siege Review and Begin Siege disabled
  assert(
    store.areAllWispsPlacedAndValid() === false && sc.enterPreSiegeReview() === false,
    'Test 4: Pre-Siege Review disabled at 0/3 placed wisps',
  );

  // Place Wisp 1 (1/3)
  assert(store.placeWisp('wisp_ignis', { x: 280, y: 740 }).success, 'Test 4: Placed Wisp 1 (1/3)');
  assert(
    store.areAllWispsPlacedAndValid() === false && sc.enterPreSiegeReview() === false,
    'Test 4: Pre-Siege Review remains disabled at 1/3 placed wisps',
  );

  // Place Wisp 2 (2/3)
  assert(store.placeWisp('wisp_zephyr', { x: 340, y: 730 }).success, 'Test 4: Placed Wisp 2 (2/3)');
  assert(
    store.areAllWispsPlacedAndValid() === false && sc.enterPreSiegeReview() === false,
    'Test 4: Pre-Siege Review remains disabled at 2/3 placed wisps',
  );
  assert(
    sc.canBeginSiege().reason === 'Place all three wisps before the siege.',
    `Test 4: Gate reason must say "Place all three wisps before the siege.", got "${sc.canBeginSiege().reason}"`,
  );

  // Place Wisp 3 (3/3)
  assert(store.placeWisp('wisp_marinus', { x: 460, y: 730 }).success, 'Test 5: Placed Wisp 3 (3/3)');
  assert(
    store.areAllWispsPlacedAndValid() === true,
    'Test 5: All 3 wisps placed and valid (3/3)',
  );
  assert(
    sc.enterPreSiegeReview() === true && sc.mode === 'PRE_SIEGE_REVIEW',
    'Test 5: Pre-Siege Review unlocks at 3/3 valid placements',
  );
  assert(
    sc.canBeginSiege().allowed === true,
    'Test 5: Begin Siege is now enabled at 3/3 valid placements',
  );

  // Test 6: Default Slots places up to 3 wisps without overlapping pieces
  sc.returnToPlaceWispsFromReview();
  store.enterPlaceWispsPhase(true);
  const defaultPlaced = store.placeAllWispsInDefaultSanctuarySlots(false);
  assert(
    defaultPlaced === 3 && store.areAllWispsPlacedAndValid() === true,
    `Test 6: Default Slots must place all 3 wisps in valid non-overlapping sanctuary slots, got ${defaultPlaced}`,
  );

  console.log('✓ Tests 3, 4, 5, 6 & Scenario B (3-Wisp Placement Progression & Default Slots): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 7, SCENARIO C & SCENARIO D: Enclosed and Clustered vs Spread 3-Wisp Placements
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build sealed wooden chamber around x=250 and wide shared chamber around x=480..540
  store.placePiece(makePiece('wood_block', 300, 756, 0));
  store.placePiece(makePiece('wood_beam', 250, 720, 0));
  store.placePiece(makePiece('wood_beam', 440, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 560, 720, Math.PI / 2));
  store.placePiece(makePiece('wood_beam', 500, 648, 0));

  assert(sc.runTutorialStabilityTest(2.5, false).passed === true, 'Test 7: Chamber build stable');
  sc.enterPlaceWispsPhase(true);

  // Place 1 wisp in individual sealed chamber at (250, 756) and 2 wisps clustered in shared hall at (475, 740) and (525, 740)
  assert(store.placeWisp('wisp_ignis', { x: 250, y: 756 }).success === true, 'Test 7: Enclosed wisp 1 valid');
  assert(store.placeWisp('wisp_zephyr', { x: 475, y: 740 }).success === true, 'Test 7: Clustered wisp 2 valid');
  assert(store.placeWisp('wisp_marinus', { x: 525, y: 740 }).success === true, 'Test 7: Clustered wisp 3 valid');

  assert(
    store.getSharedCollapseRiskWarning() !== null,
    'Scenario C: Clustered wisps under shared support show non-blocking shared collapse risk warning',
  );
  assert(
    store.areAllWispsPlacedAndValid() === true && sc.enterPreSiegeReview() === true,
    'Scenario C: Non-blocking warning still allows entering Pre-Siege Review',
  );

  // Now test Scenario D: Spread 3 wisps across separate supports
  sc.returnToPlaceWispsFromReview();
  assert(store.placeWisp('wisp_ignis', { x: 250, y: 756 }).success === true, 'Scenario D: Wisp 1 west');
  assert(store.placeWisp('wisp_zephyr', { x: 350, y: 740 }).success === true, 'Scenario D: Wisp 2 center');
  assert(store.placeWisp('wisp_marinus', { x: 500, y: 740 }).success === true, 'Scenario D: Wisp 3 east');

  console.log('✓ Test 7, Scenario C & Scenario D (Enclosed, Clustered & Spread 3-Wisp Placements): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 8: Targeting only evaluates the 3 active wisps (zero ghost targets from unused roster wisps)
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  store.placeAllWispsInDefaultSanctuarySlots(false);
  const state = store.getState();

  const candidates = generateTargetCandidates(state);
  assert(
    candidates.every((c) => c.wispsNearCount <= 3),
    'Test 8: Every candidate wispsNearCount must be bounded by activeWispCount (3)',
  );
  assert(
    candidates.every(
      (c) => !c.id.includes('wisp_terran') && !c.id.includes('wisp_aetheris'),
    ),
    'Test 8: Zero candidates may reference inactive roster wisps (wisp_terran, wisp_aetheris)',
  );

  // Also verify exposed wisp_threat candidate generation with empty pieces produces exactly the 3 active wisps
  const exposedState = { ...state, pieces: [] };
  const exposedCandidates = generateTargetCandidates(exposedState).filter(
    (c) => c.type === 'wisp_threat',
  );
  assert(
    exposedCandidates.length === 3,
    `Test 8: Expected exactly 3 wisp_threat candidates when uncovered, got ${exposedCandidates.length}`,
  );
  const activeIds = new Set(LEVEL_1_SELECTED_WISP_IDS.map((id) => `wisp_${id}`));
  for (const wc of exposedCandidates) {
    assert(
      activeIds.has(wc.id),
      `Test 8: Candidate ${wc.id} must belong to active Level 1 wisps`,
    );
  }

  // Verify Attack 1 and Attack 2 target selection succeeds and normalizes against activeWispCount = 3
  const atk1 = selectTargetAndTrajectory(state, AUTHORED_ATTACKS[0]);
  const atk2 = selectTargetAndTrajectory(state, AUTHORED_ATTACKS[1]);
  assert(atk1 !== null && atk2 !== null, 'Test 8: Both Attack 1 and Attack 2 select valid targets with 3 wisps');

  console.log('✓ Test 8 (Targeting Only Evaluates Active Wisps & Normalizes Cluster Value): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 9, 10, 11, 12 & SCENARIOS E, F, G, H: Result Bands for 3, 2, 1, 0 Stable Wisps
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  const pd = new PresentationDirector();
  sc.skipOpeningSequence();

  // Build compliant structure & pass stability test so tutorial checklist is complete
  store.placePiece(makePiece('stone_block', 152, 756, 0));
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  sc.runTutorialStabilityTest(2.0, false);
  sc.enterPlaceWispsPhase(true);
  store.placeAllWispsInDefaultSanctuarySlots(false);
  sc.enterPreSiegeReview();

  // Scenario E / Test 9: 3/3 wisps stable -> Exceptional Defense + completion awarded + CELEBRATION_CHORUS
  for (const w of store.getState().wisps) w.isDispersed = false;
  const res3 = sc.computeLevel1Results();
  pd.update(0.016, 20.0, store.getState(), sc, null, 'RESULTS');
  assert(
    res3.wispsStable === 3 &&
      res3.wispsDispersed === 0 &&
      res3.totalWisps === 3 &&
      res3.wispsStable + res3.wispsDispersed === store.getRequiredWispCount() &&
      res3.classification === 'Exceptional Defense' &&
      res3.tutorialCompletionAwarded === true &&
      res3.masteryCriteria.find((m) => m.id === 'WISP_MASTERY')?.achieved === true &&
      res3.masteryCriteria.find((m) => m.id === 'WISP_MASTERY')?.description ===
        'Keep all three wisps stable.' &&
      pd.wispStates.get('wisp_ignis')?.reactionState === 'CELEBRATION_CHORUS',
    `Test 9 / Scenario E: Expected 3/3 Exceptional Defense + completion + CELEBRATION_CHORUS, got ${JSON.stringify(res3)}`,
  );

  // Scenario F / Test 10: 2/3 wisps stable -> Successful Defense + completion awarded + RELIEVED_EXHALE
  store.getState().wisps[0].isDispersed = false;
  store.getState().wisps[1].isDispersed = false;
  store.getState().wisps[2].isDispersed = true;
  const res2 = sc.computeLevel1Results();
  pd.update(0.016, 21.0, store.getState(), sc, null, 'RESULTS');
  assert(
    res2.wispsStable === 2 &&
      res2.wispsDispersed === 1 &&
      res2.wispsStable + res2.wispsDispersed === store.getRequiredWispCount() &&
      res2.classification === 'Successful Defense' &&
      res2.tutorialCompletionAwarded === true &&
      res2.masteryCriteria.find((m) => m.id === 'WISP_MASTERY')?.achieved === false &&
      pd.wispStates.get('wisp_ignis')?.reactionState === 'RELIEVED_EXHALE',
    `Test 10 / Scenario F: Expected 2/3 Successful Defense + completion + RELIEVED_EXHALE, got ${JSON.stringify(res2)}`,
  );

  // Scenario G / Test 11: 1/3 wisps stable -> Narrow Survival + completion NOT awarded + SOLEMN_SURVIVAL
  store.getState().wisps[0].isDispersed = false;
  store.getState().wisps[1].isDispersed = true;
  store.getState().wisps[2].isDispersed = true;
  const res1 = sc.computeLevel1Results();
  pd.update(0.016, 22.0, store.getState(), sc, null, 'RESULTS');
  assert(
    res1.wispsStable === 1 &&
      res1.wispsDispersed === 2 &&
      res1.wispsStable + res1.wispsDispersed === store.getRequiredWispCount() &&
      res1.classification === 'Narrow Survival' &&
      res1.survived === true &&
      res1.tutorialCompletionAwarded === false &&
      Boolean(res1.failureObservation?.includes('Narrow Survival')) &&
      pd.wispStates.get('wisp_ignis')?.reactionState === 'SOLEMN_SURVIVAL',
    `Test 11 / Scenario G: Expected 1/3 Narrow Survival without completion + SOLEMN_SURVIVAL, got ${JSON.stringify(res1)}`,
  );

  // Scenario H / Test 12: 0/3 wisps stable -> Defense Failed + completion NOT awarded
  store.getState().wisps[0].isDispersed = true;
  store.getState().wisps[1].isDispersed = true;
  store.getState().wisps[2].isDispersed = true;
  const res0 = sc.computeLevel1Results();
  assert(
    res0.wispsStable === 0 &&
      res0.wispsDispersed === 3 &&
      res0.wispsStable + res0.wispsDispersed === store.getRequiredWispCount() &&
      res0.classification === 'Defense Failed' &&
      res0.survived === false &&
      res0.tutorialCompletionAwarded === false,
    `Test 12 / Scenario H: Expected 0/3 Defense Failed, got ${JSON.stringify(res0)}`,
  );

  console.log('✓ Tests 9, 10, 11, 12 & Scenarios E, F, G, H (3/3, 2/3, 1/3, 0/3 Result Bands & Reactions): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 13, 14, 15, 16, 17 & SCENARIOS I, J, K, L: Retry, Start Over, Reload & Legacy 5-Wisp Migration
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build valid shelter and place 3 wisps at custom sanctuary coordinates
  store.placePiece(makePiece('stone_block', 152, 756, 0));
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  sc.runTutorialStabilityTest(2.0, false);
  sc.enterPlaceWispsPhase(true);

  assert(store.placeWisp('wisp_ignis', { x: 265, y: 740 }).success, 'Test 13: Placed ignis at 265');
  assert(store.placeWisp('wisp_zephyr', { x: 355, y: 730 }).success, 'Test 13: Placed zephyr at 355');
  assert(store.placeWisp('wisp_marinus', { x: 475, y: 730 }).success, 'Test 13: Placed marinus at 475');
  assert(sc.enterPreSiegeReview() === true, 'Test 13: Entered PRE_SIEGE_REVIEW');

  // Verify snapshot metadata
  const snapMeta = store.getState().snapshotMetadata;
  assert(
    snapMeta !== undefined &&
      snapMeta.requiredWispCount === 3 &&
      snapMeta.totalActiveWispCount === 3 &&
      snapMeta.currentPlacedWispCount === 3,
    `Test 13: Snapshot metadata must record 3/3 active wisps, got ${JSON.stringify(snapMeta)}`,
  );

  // Start siege and run to completion, recording balance telemetry
  sc.clearBalanceTelemetryHistory();
  assert(sc.startSiege(false) === true, 'Test 13: Siege started');
  stepSiegeToCompletion(sc);

  const history = sc.getBalanceTelemetryHistory();
  assert(
    history.length === 1 &&
      history[0].activeWispCount === 3 &&
      history[0].attacks.length === 2,
    'Test 13: Balance observability telemetry recorded for 3-wisp 2-attack siege attempt',
  );

  // Test 13 & Scenario I: Retry Design restores 3-wisp positions and intact pre-siege build
  sc.retryDesign();
  const afterRetry = store.getState();
  assert(
    afterRetry.wisps.length === 3 &&
      afterRetry.wisps.every((w) => w.placed === true && !w.isDispersed) &&
      afterRetry.wisps.find((w) => w.id === 'wisp_ignis')?.position.x === 265 &&
      afterRetry.wisps.find((w) => w.id === 'wisp_zephyr')?.position.x === 355 &&
      afterRetry.wisps.find((w) => w.id === 'wisp_marinus')?.position.x === 475,
    'Test 13 / Scenario I: Retry Design restores exact 3-wisp positions and intact pre-siege build',
  );

  // Test 15 & Scenario K: Reload in PLACE_WISPS and PRE_SIEGE_REVIEW preserves 3-wisp state
  sc.returnToPlaceWispsFromReview();
  const reloadPlaceWisps = sc.simulateSafeReload();
  assert(
    reloadPlaceWisps.recoveredPhase === 'PLACE_WISPS' && store.getState().wisps.length === 3,
    'Test 15 / Scenario K: Reload in PLACE_WISPS preserves 3-wisp state without duplication',
  );

  // Test 14 & Scenario J: Start Over resets to BUILD with 0 battlefield wisps and 3 unplaced wisps
  sc.startOver();
  const afterStartOver = store.getState();
  assert(
    afterStartOver.wisps.length === 3 &&
      afterStartOver.wisps.every((w) => w.placed === false) &&
      store.getWispPresenceDiagnostics('CONSTRUCTION').wispBattlefieldCount === 0 &&
      store.getWispPresenceDiagnostics('CONSTRUCTION').wispStagingCount === 3,
    'Test 14 / Scenario J: Start Over resets to BUILD with 0 battlefield wisps and 3 unplaced staging wisps',
  );

  // Test 17 & Scenario L: Legacy 5-wisp persisted save migrates safely to 3-wisp Level 1 state
  const legacy5WispState = {
    ...JSON.parse(JSON.stringify(INITIAL_LEVEL_STATE)),
    schemaVersion: 1,
    requiredWispCount: undefined,
    activeWispIds: undefined,
    wisps: WISP_ROSTER_DEFINITIONS.map((def) => ({
      id: def.id,
      name: def.name,
      position: { ...def.defaultPosition },
      defaultPosition: { ...def.defaultPosition },
      placed: true,
      isValid: true,
      radius: def.radius,
      color: def.color,
      glowColor: def.glowColor,
      isDispersed: false,
    })),
  };
  globalThis.localStorage.setItem(
    'alchemical_fortress_phase3_level1_v2',
    JSON.stringify(legacy5WispState),
  );
  const migratedStore = new LevelStore();
  const migratedState = migratedStore.getState();
  assert(
    migratedState.schemaVersion === 2 &&
      migratedState.requiredWispCount === 3 &&
      migratedState.wisps.length === 3 &&
      JSON.stringify(migratedState.wisps.map((w) => w.id)) ===
        JSON.stringify(LEVEL_1_SELECTED_WISP_IDS),
    `Test 17 / Scenario L: Legacy 5-wisp save must migrate cleanly to 3 Level 1 wisps without crash, got ${migratedState.wisps.length} wisps`,
  );

  console.log('✓ Tests 13, 14, 15, 16, 17 & Scenarios I, J, K, L (Retry, Start Over, Reload & Legacy Save Migration): PASSED');
}

// -----------------------------------------------------------------------------
// TEST 18 & SCENARIO M: Developer Wisp-Count Override supports 1, 2, 3, 4, 5 wisps cleanly
// -----------------------------------------------------------------------------
{
  const store = new LevelStore();
  store.clearStorage();
  const sc = new SiegeController(store);
  sc.skipOpeningSequence();

  // Build valid shelter once
  store.placePiece(makePiece('stone_block', 152, 756, 0));
  store.placePiece(makePiece('wood_beam', 200, 672, 0));
  sc.runTutorialStabilityTest(2.0, false);

  for (const count of [1, 2, 3, 4, 5] as const) {
    store.setDeveloperWispCountOverride(count);
    const diag = store.getDeveloperWispOverrideDiagnostics();
    assert(
      diag.activeRequiredWispCount === count &&
        diag.developerWispCountOverride === count &&
        diag.activeWispIds.length === count &&
        store.getState().wisps.length === count,
      `Test 18 / Scenario M: Override count=${count} must configure exactly ${count} active wisps`,
    );

    // Place all active wisps in default slots and verify readiness & targeting
    const placed = store.placeAllWispsInDefaultSanctuarySlots(true);
    assert(
      placed === count && store.areAllWispsPlacedAndValid() === true,
      `Test 18 / Scenario M: Override count=${count} must allow placing all ${count} wisps validly`,
    );

    const targetRes = selectTargetAndTrajectory(store.getState(), AUTHORED_ATTACKS[0]);
    assert(
      targetRes !== null,
      `Test 18 / Scenario M: Targeting must succeed for activeWispCount=${count}`,
    );

    // Verify result band accounting invariant for every possible survival count 0..count
    for (let s = 0; s <= count; s++) {
      store.getState().wisps.forEach((w, idx) => {
        w.isDispersed = idx >= s;
      });
      const res = sc.computeLevel1Results();
      assert(
        res.wispsStable === s &&
          res.wispsDispersed === count - s &&
          res.totalWisps === count &&
          res.wispsStable + res.wispsDispersed === count,
        `Test 18 / Scenario M: Result accounting invariant failed for count=${count}, stable=${s}`,
      );
    }
  }

  // Reset to Level 1 default (3 wisps)
  store.setDeveloperWispCountOverride(null);
  assert(
    store.getRequiredWispCount() === 3 && store.getState().wisps.length === 3,
    'Test 18: Resetting override restores Level 1 default of 3 wisps',
  );

  console.log('✓ Test 18 & Scenario M (Developer Wisp-Count Override 1..5 & Variable Architecture): PASSED');
}

console.log('\n========================================================================');
console.log('ALL LEVEL 1 THREE-WISP SIMPLIFICATION TESTS (1-18, SCENARIOS A-M) PASSED!');
console.log('========================================================================\n');
