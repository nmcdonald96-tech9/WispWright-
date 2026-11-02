/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_LEVEL_STATE, MATERIAL_CONFIGS } from '../config';
import { LevelStore } from '../state/levelStore';
import { AUTHORED_ATTACKS } from './siegeConfig';
import { SiegeController } from './siegeController';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function runFullTwoWaveSiege(siege: SiegeController, onReinforcement?: () => void): void {
  // Attack 1
  siege.skipIntroduction();
  siege.step(0.016);
  siege.step(1.3);
  for (let i = 0; i < 600; i++) {
    siege.step(0.016);
    if (siege.mode === 'ATTACK_RESOLVED') break;
  }
  assert(siege.mode === 'ATTACK_RESOLVED', `Expected ATTACK_RESOLVED after Wave 1, got ${siege.mode}`);

  // Enter Reinforcement
  siege.enterReinforcementPhase();
  siege.beginActiveReinforcement();
  if (onReinforcement) {
    onReinforcement();
  }
  siege.finishReinforcement();
  siege.launchFinalAttack();

  // Attack 2
  siege.skipIntroduction();
  siege.step(0.016);
  siege.step(1.3);
  for (let i = 0; i < 600; i++) {
    siege.step(0.016);
    if (siege.mode === 'ATTACK_RESOLVED') {
      siege.nextAttackManually();
      break;
    }
    if (siege.mode === 'SEQUENCE_COMPLETE' || siege.mode === 'RESULTS') break;
  }
  assert(
    siege.mode === 'SEQUENCE_COMPLETE' || siege.mode === 'RESULTS',
    `Expected SEQUENCE_COMPLETE after Wave 2, got ${siege.mode}`,
  );
}

async function runTests(): Promise<void> {
  console.log('=== LEVEL 1 CONSTRUCTION RELEVANCE & BASELINE ACCEPTANCE TESTS (A - H) ===\n');

  const store = new LevelStore();
  const siege = new SiegeController(store);

  // ---------------------------------------------------------------------------
  // TEST A: Player No-Build Attempt
  // ---------------------------------------------------------------------------
  console.log('Running Test A: Player No-Build Attempt...');
  store.clearStorage();
  siege.startOver();
  siege.setDevBypassTutorialRequirements(false);

  const checklistA = store.getTutorialChecklist();
  assert(!checklistA.placedBeam, 'Test A: placedBeam should be false on untouched level');
  assert(!checklistA.placedBlock, 'Test A: placedBlock should be false on untouched level');
  assert(
    !checklistA.hasSupportedConnection,
    'Test A: hasSupportedConnection should be false on untouched level',
  );
  assert(!checklistA.stabilityTested, 'Test A: stabilityTested should be false on untouched level');
  assert(!checklistA.isComplete, 'Test A: checklist.isComplete should be false on untouched level');

  const canBeginA = siege.canBeginSiege();
  assert(!canBeginA.allowed, 'Test A: canBeginSiege should be false on untouched level');

  const startedA = siege.attemptBeginSiege(true);
  assert(!startedA, 'Test A: attemptBeginSiege should block siege start when checklist is incomplete');
  assert(
    siege.mode === 'CONSTRUCTION',
    `Test A: Siege mode must remain CONSTRUCTION when blocked, got ${siege.mode}`,
  );
  assert(
    siege.checklistHighlightActive === true,
    'Test A: checklistHighlightActive must be true after early Begin Siege tap',
  );
  assert(
    siege.tutorialGateWarning === 'Complete the basic shelter lesson before beginning the siege.',
    `Test A: Unexpected tutorialGateWarning: ${siege.tutorialGateWarning}`,
  );
  console.log(
    `  PASS: Begin Siege blocked (allowed=${canBeginA.allowed}), checklistHighlighted=${siege.checklistHighlightActive}, guidance="${siege.tutorialGateWarning}"\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST B: Developer No-Build Baseline
  // ---------------------------------------------------------------------------
  console.log('Running Test B: Developer No-Build Baseline...');
  store.clearStorage();
  siege.startOver();
  siege.setDevBypassTutorialRequirements(true);

  const canBeginB = siege.canBeginSiege();
  assert(canBeginB.allowed, 'Test B: canBeginSiege must be allowed when devBypass is enabled');

  const startedB = siege.attemptBeginSiege(true);
  assert(startedB, 'Test B: attemptBeginSiege must start when devBypass is enabled');

  runFullTwoWaveSiege(siege);

  const resB = siege.level1Results!;
  const telB = resB.constructionTelemetry!;
  assert(telB.playerPiecesPlacedBeforeAttack1 === 0, 'Test B: Expected 0 player pieces placed');
  assert(telB.noBuildDevBypassUsed === true, 'Test B: Expected noBuildDevBypassUsed === true');
  assert(
    telB.wispsAfterAttack1 !== null && telB.wispsAfterAttack2 !== null,
    'Test B: Expected wisp counts recorded after Attack 1 and Attack 2',
  );
  assert(
    resB.tutorialCompletionAwarded === false,
    'Test B: No-build baseline must NEVER award tutorialCompletionAwarded',
  );
  assert(
    store.unlockState.tutorialCompleted === false,
    'Test B: store.unlockState.tutorialCompleted must remain false on no-build baseline',
  );
  console.log(
    `  PASS: Dev No-Build Baseline -> Wisps After Atk1=${telB.wispsAfterAttack1}/5, After Atk2=${telB.wispsAfterAttack2}/5, Band="${telB.finalResultBand}", tutorialCompletionAwarded=${resB.tutorialCompletionAwarded}\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST C: Minimal Compliant Build
  // ---------------------------------------------------------------------------
  console.log('Running Test C: Minimal Compliant Build (1 Beam + 1 Block + Stability Test)...');
  store.clearStorage();
  siege.startOver();
  siege.setDevBypassTutorialRequirements(false);

  // Place 1 stone block braced against western foundation (x=152, y=756) and 1 beam on eastern ground (x=620, y=768)
  const placedBlockC = store.placePiece({
    id: 'player_piece_min_block_1',
    type: 'stone_block',
    position: { x: 152, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });
  const placedBeamC = store.placePiece({
    id: 'player_piece_min_beam_1',
    type: 'wood_beam',
    position: { x: 684, y: 768 },
    rotation: 0,
    isPrebuilt: false,
  });
  assert(placedBlockC && placedBeamC, 'Test C: Failed to place minimal 1 block + 1 beam');

  const checklistBeforeStabilityC = store.getTutorialChecklist();
  assert(checklistBeforeStabilityC.placedBeam, 'Test C: placedBeam should be true');
  assert(checklistBeforeStabilityC.placedBlock, 'Test C: placedBlock should be true');
  assert(
    checklistBeforeStabilityC.hasSupportedConnection,
    'Test C: hasSupportedConnection should be true',
  );
  assert(
    !checklistBeforeStabilityC.stabilityTested,
    'Test C: stabilityTested should be false before running Test Stability',
  );
  assert(
    !siege.canBeginSiege().allowed,
    'Test C: Begin Siege should still be gated before running Test Stability',
  );

  // Run Test Stability and restore/accept design
  const stabilityResultC = siege.runTutorialStabilityTest(1.0);
  assert(
    stabilityResultC.checklist.stabilityTested,
    'Test C: stabilityTested should be true after running Test Stability',
  );
  assert(
    stabilityResultC.checklist.isComplete,
    'Test C: checklist.isComplete should be true after Test Stability',
  );
  assert(
    siege.canBeginSiege().allowed,
    'Test C: Begin Siege must become available after completing checklist',
  );

  const startedC = siege.attemptBeginSiege(true);
  assert(startedC, 'Test C: Minimal compliant build must start siege');

  runFullTwoWaveSiege(siege);
  const resC = siege.level1Results!;
  const telC = resC.constructionTelemetry!;
  assert(telC.playerPiecesPlacedBeforeAttack1 === 2, 'Test C: Expected 2 player pieces placed');
  assert(telC.stabilityTestCompleted === true, 'Test C: Expected stabilityTestCompleted === true');
  console.log(
    `  PASS: Minimal Compliant Build -> Wisps After Atk1=${telC.wispsAfterAttack1}/5, After Atk2=${telC.wispsAfterAttack2}/5, Band="${resC.classification}", tutorialCompletionAwarded=${resC.tutorialCompletionAwarded}\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST D: Full-Inventory Build
  // ---------------------------------------------------------------------------
  console.log('Running Test D: Full-Inventory Defensive Build...');
  store.clearStorage();
  siege.startOver();
  siege.setDevBypassTutorialRequirements(false);

  // Build a double-thick western bastion outside the wisp sanctuary (x=104 and x=152) + eastern roof span
  store.placePiece({
    id: 'player_piece_d_stone_1',
    type: 'stone_block',
    position: { x: 152, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_d_stone_2',
    type: 'stone_block',
    position: { x: 152, y: 708 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_d_stone_3',
    type: 'stone_block',
    position: { x: 104, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_d_wood_1',
    type: 'wood_block',
    position: { x: 104, y: 708 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_d_wood_2',
    type: 'wood_block',
    position: { x: 152, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_d_wood_3',
    type: 'wood_block',
    position: { x: 104, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_d_beam_1',
    type: 'wood_beam',
    position: { x: 684, y: 768 },
    rotation: 0,
    isPrebuilt: false,
  });

  siege.runTutorialStabilityTest(1.0);
  const startedD = siege.attemptBeginSiege(true);
  assert(startedD, 'Test D: Full-inventory build must start siege');

  runFullTwoWaveSiege(siege);
  const resD = siege.level1Results!;
  const telD = resD.constructionTelemetry!;
  assert(
    resD.wispsStable > telB.wispsAfterAttack2!,
    `Test D: Full build wisp survival (${resD.wispsStable}) must be measurably better than no-build baseline (${telB.wispsAfterAttack2})`,
  );
  assert(
    resD.wispsStable >= 3,
    `Test D: Expected at least 3 wisps stable on full build, got ${resD.wispsStable}`,
  );
  assert(
    resD.tutorialCompletionAwarded === true,
    'Test D: Full-inventory build with 3+ wisps must award tutorialCompletionAwarded = true',
  );
  console.log(
    `  PASS: Full-Inventory Build -> Placed=${telD.playerPiecesPlacedBeforeAttack1}, Wisps After Atk1=${telD.wispsAfterAttack1}/5, After Atk2=${telD.wispsAfterAttack2}/5 (vs No-Build ${telB.wispsAfterAttack2}/5), Band="${resD.classification}", tutorialCompletionAwarded=${resD.tutorialCompletionAwarded}\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST E: Reserved-Inventory Build (Partial Pre-Attack-1 + Mid-Siege Reinforcement)
  // ---------------------------------------------------------------------------
  console.log('Running Test E: Reserved-Inventory Build + Mid-Siege Reinforcement...');
  store.clearStorage();
  siege.startOver();
  siege.setDevBypassTutorialRequirements(false);

  // Place 1 stone block + 1 wood block + 1 beam before Attack 1, retaining 9 pieces in reserve
  store.placePiece({
    id: 'player_piece_e_stone_1',
    type: 'stone_block',
    position: { x: 152, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_e_wood_1',
    type: 'wood_block',
    position: { x: 152, y: 708 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_e_beam_1',
    type: 'wood_beam',
    position: { x: 684, y: 768 },
    rotation: 0,
    isPrebuilt: false,
  });

  siege.runTutorialStabilityTest(1.0);
  const startedE = siege.attemptBeginSiege(true);
  assert(startedE, 'Test E: Reserved-inventory build must start siege');

  runFullTwoWaveSiege(siege, () => {
    // During Reinforcement phase, place reserved stone blocks to brace the base against Grom's heavy shot
    const placedReinf1 = store.placePiece({
      id: 'player_piece_e_reinf_stone_1',
      type: 'stone_block',
      position: { x: 248, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    const placedReinf2 = store.placePiece({
      id: 'player_piece_e_reinf_stone_2',
      type: 'stone_block',
      position: { x: 104, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    assert(placedReinf1 && placedReinf2, 'Test E: Reserve pieces should be placeable during reinforcement');
  });

  const resE = siege.level1Results!;
  const telE = resE.constructionTelemetry!;
  assert(
    telE.piecesRetainedInReserveBeforeAttack1 === 9,
    `Test E: Expected 9 pieces retained in reserve before Attack 1, got ${telE.piecesRetainedInReserveBeforeAttack1}`,
  );
  assert(
    resE.reinforcementMaterialsUsed === 2,
    `Test E: Expected 2 reinforcement materials used, got ${resE.reinforcementMaterialsUsed}`,
  );
  assert(
    resE.wispsStable >= 3,
    `Test E: Expected >= 3 wisps stable after reinforcement, got ${resE.wispsStable}`,
  );
  assert(
    resE.tutorialCompletionAwarded === true,
    'Test E: Compliant reserved-inventory build with 3+ wisps must award tutorialCompletionAwarded = true',
  );
  console.log(
    `  PASS: Reserved-Inventory Build -> ReserveBeforeAtk1=${telE.piecesRetainedInReserveBeforeAttack1}, ReinfUsed=${resE.reinforcementMaterialsUsed}, WispsAfterAtk2=${resE.wispsStable}/5, Band="${resE.classification}", tutorialCompletionAwarded=${resE.tutorialCompletionAwarded}\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST F: Narrow Survival (1-2 Wisps Survive)
  // ---------------------------------------------------------------------------
  console.log('Running Test F: Narrow Survival Boundary (1-2 Wisps)...');
  store.clearStorage();
  siege.startOver();
  siege.setDevBypassTutorialRequirements(false);

  // Place a minimal compliant build (1 lower stone block at x=150, y=756 + 1 beam at x=684, y=768)
  // without upper bracing or mid-siege reinforcement, producing a 2/5 Narrow Survival result.
  store.placePiece({
    id: 'player_piece_f_west_block',
    type: 'stone_block',
    position: { x: 150, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'player_piece_f_east_beam',
    type: 'wood_beam',
    position: { x: 684, y: 768 },
    rotation: 0,
    isPrebuilt: false,
  });
  siege.runTutorialStabilityTest(1.0);
  assert(store.getTutorialChecklist().isComplete, 'Test F: Checklist must be complete');

  const startedF = siege.attemptBeginSiege(true);
  assert(startedF, 'Test F: Siege should start');
  runFullTwoWaveSiege(siege);

  const resF = siege.level1Results!;
  assert(
    resF.wispsStable === 1 || resF.wispsStable === 2,
    `Test F: Expected 1 or 2 wisps stable for Narrow Survival, got ${resF.wispsStable}`,
  );
  assert(resF.survived === true, 'Test F: Physical survival must be true for 1-2 wisps');
  assert(
    resF.classification === 'Narrow Survival',
    `Test F: Expected classification 'Narrow Survival', got '${resF.classification}'`,
  );
  assert(
    resF.tutorialCompletionAwarded === false,
    'Test F: Narrow Survival (1-2 wisps) must NOT award full Level 1 tutorial completion',
  );
  assert(
    Boolean(resF.failureObservation && resF.failureObservation.includes('Narrow Survival')),
    'Test F: Narrow Survival must provide a concise structural hint',
  );

  // Verify Retry Design restores the submitted design immediately
  siege.retryDesign();
  assert(
    store.getPlayerPlacedPieces().length === 2,
    'Test F: Retry Design must preserve the 2 submitted player pieces',
  );
  console.log(
    `  PASS: Narrow Survival (${resF.wispsStable}/5 wisps) -> survived=${resF.survived}, classification="${resF.classification}", tutorialCompletionAwarded=${resF.tutorialCompletionAwarded}, Hint="${resF.failureObservation}"\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST G: Successful Defense (3+ Wisps + Checklist Complete)
  // ---------------------------------------------------------------------------
  console.log('Running Test G: Successful Defense & Tutorial Completion Award...');
  assert(
    resD.wispsStable >= 3 && resD.tutorialCompletionAwarded === true,
    'Test G: Full defense with 3+ wisps and completed checklist must award tutorialCompletionAwarded',
  );
  assert(
    resD.sampleUnlockGranted === true,
    'Test G: First successful tutorial completion must grant sampleUnlockGranted',
  );
  console.log(
    `  PASS: Successful Defense -> wispsStable=${resD.wispsStable}/5, classification="${resD.classification}", tutorialCompletionAwarded=${resD.tutorialCompletionAwarded}, sampleUnlockGranted=${resD.sampleUnlockGranted}\n`,
  );

  // ---------------------------------------------------------------------------
  // TEST H: Regression & Physics Balance Preservation
  // ---------------------------------------------------------------------------
  console.log('Running Test H: Regression & Physics Balance Verification...');
  // Verify projectile mass, speed, and material durability were NOT modified
  assert(
    AUTHORED_ATTACKS[0].radius === 16 && AUTHORED_ATTACKS[0].mass === 2.8,
    'Test H: Standard projectile radius/mass must remain unchanged',
  );
  assert(
    AUTHORED_ATTACKS[1].radius === 24 && AUTHORED_ATTACKS[1].mass === 10.5,
    'Test H: Heavy projectile radius/mass must remain unchanged',
  );
  assert(
    MATERIAL_CONFIGS.wood_beam.density === 0.0012 &&
      MATERIAL_CONFIGS.wood_block.density === 0.0012 &&
      MATERIAL_CONFIGS.stone_block.density === 0.0068 &&
      MATERIAL_CONFIGS.bullseye_block.density === 0.0068,
    'Test H: Material densities must remain unchanged',
  );
  assert(
    INITIAL_LEVEL_STATE.inventory.wood_beam === 4 &&
      INITIAL_LEVEL_STATE.inventory.wood_block === 4 &&
      INITIAL_LEVEL_STATE.inventory.stone_block === 3 &&
      INITIAL_LEVEL_STATE.inventory.bullseye_block === 1,
    'Test H: Starting inventory counts must remain unchanged',
  );

  // Verify Start Over resets checklist & restores template
  siege.startOver();
  assert(
    store.getPlayerPlacedPieces().length === 0 && !store.getTutorialChecklist().isComplete,
    'Test H: Start Over must reset player pieces and tutorial checklist',
  );
  siege.teardown();
  console.log(
    '  PASS: Physics parameters, material durability, starting inventory, Retry Design, and Start Over verified unchanged.\n',
  );

  console.log('=== ALL ACCEPTANCE TESTS (A - H) PASSED 100% ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
