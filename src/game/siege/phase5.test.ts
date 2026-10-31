/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PresentationDirector } from '../presentation/presentationDirector';
import { LevelStore, TUTORIAL_BULLSEYE_ID } from '../state/levelStore';
import { PlacedPiece } from '../types';
import { AUTHORED_ATTACKS } from './siegeConfig';
import { SiegeController } from './siegeController';
import {
  DEFAULT_LEVEL_1_DIFFICULTY_CONFIG,
  generateTargetCandidates,
  scoreCandidates,
  selectTargetAndTrajectory,
} from './targeting';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertValidStoreState(store: LevelStore, label: string): void {
  const s = store.getState();
  const seenIds = new Set<string>();
  for (const p of s.pieces) {
    assert(!seenIds.has(p.id), `${label}: Duplicate piece ID ${p.id}`);
    seenIds.add(p.id);
  }
  const bullseyePlaced = s.pieces.filter((p) => p.type === 'bullseye_block');
  assert(bullseyePlaced.length <= 1, `${label}: More than 1 bullseye_block placed (${bullseyePlaced.length})`);
  assert(
    s.inventory.bullseye_block >= 0 && s.inventory.bullseye_block <= 1,
    `${label}: Invalid bullseye_block inventory count ${s.inventory.bullseye_block}`,
  );
  assert(
    bullseyePlaced.length + s.inventory.bullseye_block === 1,
    `${label}: Total bullseye_block count (placed + inventory) must equal 1, got ${bullseyePlaced.length + s.inventory.bullseye_block}`,
  );
}

function makeBullseyePiece(x: number, y: number, id = 'player_piece_bullseye_test'): PlacedPiece {
  return {
    id,
    type: 'bullseye_block',
    position: { x, y },
    rotation: 0,
    isPrebuilt: false,
    condition: 'INTACT',
    ownership: 'PLAYER_OWNED',
    source: 'STARTING_RESERVE',
  };
}

function stepUntilMode(
  sc: SiegeController,
  targetModes: string[],
  maxSteps = 1500,
  pd?: PresentationDirector,
  store?: LevelStore,
): number {
  let steps = 0;
  let simTime = 0;
  while (!targetModes.includes(sc.mode) && steps < maxSteps) {
    if (pd && store) {
      pd.update(0.016, simTime, store.getState(), sc, sc.physicsBridge, sc.mode);
    }
    sc.step(0.016);
    simTime += 0.016;
    steps++;
  }
  assert(
    targetModes.includes(sc.mode),
    `Expected mode in [${targetModes.join(', ')}], got ${sc.mode} after ${steps} steps`,
  );
  return simTime;
}

console.log('=== PHASE 5: BULLSEYE BLOCK (TAUNT V1) & TACTICAL SCOPE ACCEPTANCE SUITE (A-M) ===\n');

// --- TEST A: Bullseye Placement and Inventory ---
{
  const store = new LevelStore();
  store.resetToDefault();

  assert(
    store.getState().inventory.bullseye_block === 1,
    'Test A: Level 1 must start with exactly 1 bullseye_block in inventory',
  );
  const initialBullseyeState = store.getBullseyeLogicalState();
  assert(
    initialBullseyeState.inventoryStatus === 'IN_RESERVE' && initialBullseyeState.position === null,
    'Test A: Initial Bullseye logical state must be IN_RESERVE and position === null',
  );

  // Place Bullseye
  const placedOk = store.placePiece(makeBullseyePiece(640, 756));
  const placed = store.getPlacedBullseyePiece();
  assert(placedOk === true && placed !== null, 'Test A: Placing Bullseye Block must succeed');
  assert(
    placed?.id === TUTORIAL_BULLSEYE_ID,
    `Test A: Bullseye ID must be deterministic (${TUTORIAL_BULLSEYE_ID}), got ${placed?.id}`,
  );
  assert(
    store.getState().inventory.bullseye_block === 0,
    'Test A: Inventory bullseye_block count must decrease to 0 after placement',
  );
  assert(
    placed?.bullseyeActive === true && placed?.bullseyeTriggered === false && placed?.bullseyeExpired === false,
    'Test A: Newly placed Bullseye must be active, not triggered, and not expired',
  );

  // Enforce One Active Bullseye Limit
  store.getState().inventory.bullseye_block = 1;
  const secondAttempt = store.placePiece(makeBullseyePiece(700, 756));
  assert(
    secondAttempt === false && store.bullseyeConflictDiagnostic !== null,
    'Test A: Placing a second Bullseye while one is already on the battlefield must be rejected with a conflict diagnostic',
  );
  // Restore exact inventory count
  store.getState().inventory.bullseye_block = 0;

  // Remove Bullseye
  const removed = store.removePiece(TUTORIAL_BULLSEYE_ID);
  assert(removed === true, 'Test A: Removing Bullseye must succeed');
  assert(
    store.getState().inventory.bullseye_block === 1,
    'Test A: Removing Bullseye must return inventory count to 1',
  );

  // Undo removal -> back on board, inventory = 0
  store.undo();
  assert(
    store.getState().inventory.bullseye_block === 0 && store.getPlacedBullseyePiece() !== null,
    'Test A: Undo after removal must restore Bullseye to board and inventory to 0',
  );

  // Undo placement -> back in inventory = 1
  store.undo();
  assert(
    store.getState().inventory.bullseye_block === 1 && store.getPlacedBullseyePiece() === null,
    'Test A: Undo after placement must return Bullseye to inventory (count = 1)',
  );

  // Redo placement -> back on board, inventory = 0
  store.redo();
  assert(
    store.getState().inventory.bullseye_block === 0 && store.getPlacedBullseyePiece() !== null,
    'Test A: Redo must re-place Bullseye and set inventory to 0',
  );

  assertValidStoreState(store, 'Test A');
  console.log('PASS [Test A]: Bullseye Placement, Deterministic ID, One-Active Limit, and Undo/Redo Inventory verified.');
}

// --- TEST B: Target Override ---
{
  const store = new LevelStore();
  store.resetToDefault();

  // 1. Evaluate without Bullseye
  const stateWithout = store.getState();
  const resWithout = selectTargetAndTrajectory(stateWithout, AUTHORED_ATTACKS[0]);
  assert(resWithout !== null, 'Test B: Targeting without Bullseye must succeed');
  const diagWithout = resWithout!.diagnostics;
  assert(
    diagWithout.bullseyeActive === false && diagWithout.bullseyeOverrideSelected === false,
    'Test B: Without Bullseye placed, bullseyeActive and bullseyeOverrideSelected must be false',
  );
  assert(
    resWithout!.target.pieceId !== TUTORIAL_BULLSEYE_ID,
    'Test B: Ordinary target must select a fortress structural component',
  );

  // 2. Place Bullseye at an exposed decoy position away from the main fortress
  store.placePiece(makeBullseyePiece(640, 756));
  const stateWith = store.getState();
  const resWith = selectTargetAndTrajectory(stateWith, AUTHORED_ATTACKS[0]);
  assert(resWith !== null, 'Test B: Targeting with Bullseye must succeed');
  const diagWith = resWith!.diagnostics;

  assert(
    diagWith.bullseyeActive === true &&
      diagWith.bullseyeReachableByCurrentAttacker === true &&
      diagWith.bullseyeOverrideSelected === true,
    'Test B: With reachable active Bullseye, bullseyeOverrideSelected must be true',
  );
  assert(
    resWith!.target.pieceId === TUTORIAL_BULLSEYE_ID &&
      diagWith.selectedTargetId.includes(TUTORIAL_BULLSEYE_ID),
    `Test B: Selected target must be the Bullseye override target, got ${diagWith.selectedTargetId}`,
  );
  assert(
    diagWith.ordinaryTargetWithoutOverride === diagWithout.selectedTargetId,
    `Test B: ordinaryTargetWithoutOverride (${diagWith.ordinaryTargetWithoutOverride}) must match ordinary target without Bullseye (${diagWithout.selectedTargetId})`,
  );

  console.log('PASS [Test B]: Target Override & Ordinary-vs-Bullseye Comparison verified.');
}

// --- TEST C: Decoy Redirection ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);
  const pd = new PresentationDirector();

  // Place Bullseye as a sacrificial decoy at x=128, y=756
  sc.devPlaceBullseyeExposedDecoy();

  sc.startSiege(true);
  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === true,
    'Test C: Attack 1 must lock onto the decoy Bullseye Block',
  );
  assert(
    Math.abs((sc.targetingDiagnostics?.targetWorldCoordinates.x ?? 0) - 128) < 30,
    'Test C: Aim point must be centered on the decoy Bullseye near x=128',
  );

  // Step through Enemy Introduction to verify attacker acknowledgment animation
  const seenStates = new Set<string>();
  while (sc.mode === 'ENEMY_INTRODUCTION') {
    pd.update(0.05, 0.5, store.getState(), sc, sc.physicsBridge, sc.mode);
    seenStates.add(pd.standardAttackerState);
    sc.step(0.05);
  }
  assert(
    seenStates.has('BULLSEYE_ACK_OFFENDED'),
    'Test C: Pyrite Spark must play BULLSEYE_ACK_OFFENDED reaction when taunted by Bullseye',
  );

  // Step until Attack 1 resolves into REINFORCEMENT_INTRO
  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500, pd, store);

  // Verify the projectile struck the decoy region rather than the central wisp sanctuary (x=400)
  const impactDist = sc.targetingDiagnostics?.distanceBetweenImpactAndBullseye ?? 999;
  assert(
    impactDist < 65,
    `Test C: Projectile must travel toward and impact the decoy Bullseye region (dist < 65), got ${impactDist}`,
  );

  const activeWisps = store.getState().wisps.filter((w) => !w.isDispersed).length;
  assert(
    activeWisps >= 4,
    `Test C: Redirecting Attack 1 to the sacrificial decoy must protect the main wisp cluster (>= 4 wisps stable), got ${activeWisps}`,
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test C]: Sacrificial Decoy Redirection & Attacker Acknowledgment verified.');
}

// --- TEST D: Reinforced Bullseye Absorption ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  // Place Bullseye at a reinforced front bastion position
  sc.devPlaceBullseyeReinforced();
  sc.startSiege(true);

  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === true,
    'Test D: Attack 1 must target the reinforced Bullseye position',
  );

  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);

  const impactDistD = sc.targetingDiagnostics?.distanceBetweenImpactAndBullseye ?? 999;
  const activeWispsAfterAbsorb = store.getState().wisps.filter((w) => !w.isDispersed).length;
  assert(
    impactDistD < 65 && activeWispsAfterAbsorb >= 4,
    `Test D: Reinforced Bullseye bastion must draw the attack (dist=${impactDistD}) and limit damage (>= 4 wisps stable, got ${activeWispsAfterAbsorb})`,
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test D]: Reinforced Bullseye Absorption verified.');
}

// --- TEST E: Single-Attack Expiration ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  sc.devPlaceBullseyeExposedDecoy();
  sc.startSiege(true);

  // Step until Attack 1 resolves and enters Reinforcement
  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);

  const bullseyeAfterAttack1 = store.getPlacedBullseyePiece();
  assert(
    bullseyeAfterAttack1 !== null &&
      bullseyeAfterAttack1.bullseyeTriggered === true &&
      bullseyeAfterAttack1.bullseyeExpired === true &&
      bullseyeAfterAttack1.bullseyeActive === false &&
      bullseyeAfterAttack1.consumedByAttackId === 'attack_1_standard',
    'Test E: Bullseye must expire immediately after Attack 1 resolves and record consumedByAttackId="attack_1_standard"',
  );

  // Verify expired Bullseye cannot be returned to reserve inventory to re-taunt
  const canManipulateExpired = store.canManipulatePiece(bullseyeAfterAttack1!);
  assert(
    canManipulateExpired.canRemoveToInventory === false,
    'Test E: Consumed/expired Bullseye cannot be returned to reserve inventory to reactivate Taunt',
  );

  // Advance to Attack 2 (Heavy Attacker)
  sc.finishReinforcement();
  sc.launchFinalAttack();

  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === false &&
      sc.targetingDiagnostics?.bullseyeExpired === true &&
      sc.targetingDiagnostics?.bullseyeActive === false,
    'Test E: Attack 2 must NOT use Bullseye override after single-attack expiration',
  );
  assert(
    !sc.targetingDiagnostics?.selectedTargetId.includes(TUTORIAL_BULLSEYE_ID),
    'Test E: Attack 2 must select a normal heavy target on the fortress rather than the expired Bullseye',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test E]: Single-Attack Expiration & Attack 2 Ordinary Targeting Resumption verified.');
}

// --- TEST F: Unreachable Bullseye ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  // Place Bullseye at high far-right corner { x: 920, y: 240 } where discriminant speed > maxAllowedSpeed
  sc.devPlaceBullseyeUnreachable();
  sc.startSiege(true);

  const diag = sc.targetingDiagnostics;
  assert(diag !== null, 'Test F: Targeting diagnostics must exist');
  assert(
    diag!.bullseyeActive === true &&
      diag!.bullseyeReachableByCurrentAttacker === false &&
      diag!.validBullseyeTrajectoryCount === 0 &&
      diag!.bullseyeOverrideSelected === false,
    'Test F: Unreachable Bullseye must report bullseyeReachableByCurrentAttacker=false, validBullseyeTrajectoryCount=0, and bullseyeOverrideSelected=false',
  );
  assert(
    diag!.overrideCancellationReason === 'UNREACHABLE_BY_CURRENT_ATTACKER',
    `Test F: Expected cancellation reason UNREACHABLE_BY_CURRENT_ATTACKER, got ${diag!.overrideCancellationReason}`,
  );
  assert(
    sc.bullseyeNotice === 'Bullseye noticed — no valid shot available.',
    `Test F: Expected unreachable player notice, got "${sc.bullseyeNotice}"`,
  );
  assert(
    !diag!.selectedTargetId.includes(TUTORIAL_BULLSEYE_ID),
    'Test F: Attacker must fall back to its normal reachable target when Bullseye is unreachable',
  );

  // Step until Reinforcement Phase and confirm the unreachable Bullseye was NOT consumed!
  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);
  const bullseyePiece = store.getPlacedBullseyePiece();
  assert(
    bullseyePiece !== null &&
      bullseyePiece.bullseyeActive === true &&
      bullseyePiece.bullseyeTriggered === false &&
      bullseyePiece.bullseyeExpired === false &&
      bullseyePiece.consumedByAttackId === null,
    'Test F: Unreachable Bullseye must NOT be consumed by an attack that could not target it',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test F]: Unreachable Bullseye Fallback & Non-Consumption verified.');
}

// --- TEST G: Bullseye Saved for Reinforcement ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);
  const pd = new PresentationDirector();

  // Do NOT place Bullseye before Attack 1 -> keep in reserve
  assert(
    store.getState().inventory.bullseye_block === 1,
    'Test G: Bullseye starts in reserve inventory for Attack 1',
  );

  sc.jumpToPostAttack1TestState();
  sc.beginActiveReinforcement();
  assert(
    sc.mode === 'REINFORCEMENT_ACTIVE' || sc.mode === 'EMERGENCY_DELIVERY',
    `Test G: Must be in REINFORCEMENT_ACTIVE, got ${sc.mode}`,
  );
  if (sc.mode === 'EMERGENCY_DELIVERY') {
    sc.acknowledgeEmergencyDelivery();
  }
  assert(
    store.getState().inventory.bullseye_block === 1,
    'Test G: Unused Bullseye must remain available in reserve inventory during Reinforcement',
  );

  // Place Bullseye during Reinforcement to draw Heavy Attack 2 away from the damaged fortress
  const placedInReinforce = store.placePiece(makeBullseyePiece(640, 756));
  assert(placedInReinforce === true, 'Test G: Placing reserve Bullseye during Reinforcement must succeed');

  sc.finishReinforcement();
  sc.launchFinalAttack();

  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === true &&
      sc.targetingDiagnostics?.selectedTargetId.includes(TUTORIAL_BULLSEYE_ID),
    'Test G: Heavy Attacker (Attack 2) must lock onto the Bullseye placed during Reinforcement',
  );

  // Verify Heavy Attacker plays delighted acknowledgment animation
  const seenHeavyStates = new Set<string>();
  while (sc.mode === 'ENEMY_INTRODUCTION') {
    pd.update(0.05, 5.0, store.getState(), sc, sc.physicsBridge, sc.mode);
    seenHeavyStates.add(pd.heavyAttackerState);
    sc.step(0.05);
  }
  assert(
    seenHeavyStates.has('BULLSEYE_ACK_DELIGHTED'),
    'Test G: Grom the Slag-Brute must play BULLSEYE_ACK_DELIGHTED when taunted by Bullseye',
  );

  stepUntilMode(sc, ['SEQUENCE_COMPLETE', 'RESULTS'], 1500, pd, store);

  const bullseyeAfterAttack2 = store.getPlacedBullseyePiece();
  assert(
    bullseyeAfterAttack2 !== null &&
      bullseyeAfterAttack2.bullseyeExpired === true &&
      bullseyeAfterAttack2.consumedByAttackId === 'attack_2_heavy',
    'Test G: Bullseye placed in Reinforcement must expire after Attack 2 and record consumedByAttackId="attack_2_heavy"',
  );
  assert(
    sc.level1Results?.bullseyeUsed === true && sc.level1Results?.bullseyeTargetHonored === true,
    'Test G: Level1Results must report bullseyeUsed=true and bullseyeTargetHonored=true',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test G]: Bullseye Saved in Reserve for Reinforcement & Heavy Attack 2 Redirection verified.');
}

// --- TEST H: Reposition Unused Bullseye ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  // Place Bullseye in unreachable position before Attack 1 so it remains unused and intact
  sc.devPlaceBullseyeUnreachable();
  sc.startSiege(true);
  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);
  sc.beginActiveReinforcement();

  const unusedBullseye = store.getPlacedBullseyePiece();
  assert(
    unusedBullseye !== null &&
      unusedBullseye.bullseyeActive === true &&
      unusedBullseye.bullseyeTriggered === false &&
      unusedBullseye.condition === 'INTACT',
    'Test H: Unreachable Bullseye remains active, un-triggered, and INTACT in Reinforcement',
  );

  // Reposition the unused Bullseye to a reachable decoy spot during Reinforcement
  const canMove = store.canManipulatePiece(unusedBullseye!);
  assert(canMove.canMove === true, 'Test H: Intact unused Bullseye must be eligible for repositioning in Reinforcement');

  const moved = store.movePiece(TUTORIAL_BULLSEYE_ID, { x: 128, y: 756 });
  assert(moved === true, 'Test H: Repositioning unused Bullseye to {x: 128, y: 756} must succeed');

  sc.finishReinforcement();
  sc.launchFinalAttack();

  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === true &&
      Math.abs((sc.targetingDiagnostics?.bullseyeWorldCoordinates?.x ?? 0) - 128) < 5,
    'Test H: Heavy Attacker (Attack 2) must target the newly repositioned Bullseye coordinates',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test H]: Repositioning Unused Intact Bullseye During Reinforcement verified.');
}

// --- TEST I: Destroyed Bullseye (Pre-Launch & Post-Impact) ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  // 1. Pre-launch destruction test: Place Bullseye, start siege, then mark BROKEN before projectile spawns
  sc.devPlaceBullseyeExposedDecoy();
  sc.startSiege(true);
  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === true,
    'Test I: Bullseye initially selected during ENEMY_INTRODUCTION',
  );

  // Simulate pre-launch structural collapse breaking the Bullseye before launch
  const placedBeforeLaunch = store.getPlacedBullseyePiece();
  assert(placedBeforeLaunch !== null, 'Test I: Bullseye must exist on board');
  placedBeforeLaunch!.condition = 'BROKEN';

  stepUntilMode(sc, ['PROJECTILE_IN_FLIGHT'], 400);

  const bullseyeBroken = store.getPlacedBullseyePiece();
  assert(
    bullseyeBroken !== null &&
      bullseyeBroken.bullseyeActive === false &&
      bullseyeBroken.overrideCancellationReason === 'BULLSEYE_BROKEN_OR_LOST_BEFORE_LAUNCH',
    'Test I: Breaking Bullseye before launch must cancel override with BULLSEYE_BROKEN_OR_LOST_BEFORE_LAUNCH',
  );
  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === false &&
      !sc.targetingDiagnostics?.selectedTargetId.includes(TUTORIAL_BULLSEYE_ID),
    'Test I: Pre-launch broken Bullseye must safely recalculate ordinary targeting before spawning projectile',
  );

  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);
  sc.beginActiveReinforcement();

  // 2. Verify broken Bullseye cannot be moved or removed during Reinforcement
  const brokenPieceInReinforce = store.getPlacedBullseyePiece();
  assert(brokenPieceInReinforce !== null, 'Test I: Broken Bullseye remains as debris');
  const canManipulateBroken = store.canManipulatePiece(brokenPieceInReinforce!);
  assert(
    canManipulateBroken.canMove === false && canManipulateBroken.canRemoveToInventory === false,
    'Test I: Broken Bullseye must not be movable or removable during Reinforcement',
  );

  // 3. Verify broken Bullseye cannot taunt in Attack 2
  sc.finishReinforcement();
  sc.launchFinalAttack();
  assert(
    sc.targetingDiagnostics?.bullseyeOverrideSelected === false,
    'Test I: Broken Bullseye cannot taunt in Attack 2',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test I]: Destroyed Bullseye Pre-Launch Cancellation & Reinforcement Lock verified.');
}

// --- TEST J: Retry Design ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  sc.devPlaceBullseyeExposedDecoy();
  const submittedPos = { ...store.getPlacedBullseyePiece()!.position };
  sc.startSiege(true);
  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);
  sc.finishReinforcement();
  sc.launchFinalAttack();
  stepUntilMode(sc, ['SEQUENCE_COMPLETE', 'RESULTS'], 1500);

  // At SEQUENCE_COMPLETE, Bullseye is expired
  assert(
    store.getPlacedBullseyePiece()?.bullseyeExpired === true,
    'Test J: Bullseye is expired at end of siege attempt',
  );

  // Trigger Retry Design
  sc.retryDesign();

  const restoredBullseye = store.getPlacedBullseyePiece();
  assert(
    restoredBullseye !== null &&
      Math.abs(restoredBullseye.position.x - submittedPos.x) < 1 &&
      Math.abs(restoredBullseye.position.y - submittedPos.y) < 1 &&
      restoredBullseye.bullseyeActive === true &&
      restoredBullseye.bullseyeTriggered === false &&
      restoredBullseye.bullseyeExpired === false &&
      restoredBullseye.consumedByAttackId === null &&
      restoredBullseye.condition === 'INTACT',
    'Test J: Retry Design must restore Bullseye to its exact submitted position and fresh active state',
  );
  assert(
    store.getState().inventory.bullseye_block === 0,
    'Test J: Retry Design must preserve submitted inventory count (0 in reserve when 1 was placed)',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test J]: Retry Design Restores Submitted Bullseye Position & Active State verified.');
}

// --- TEST K: Start Over ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  sc.devPlaceBullseyeExposedDecoy();
  sc.startSiege(true);
  stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);

  // Trigger Start Over
  sc.startOver();

  assert(
    store.getState().inventory.bullseye_block === 1 && store.getPlacedBullseyePiece() === null,
    'Test K: Start Over must restore Bullseye to initial template inventory state (1 in inventory, 0 on board)',
  );
  const bullseyeLogical = store.getBullseyeLogicalState();
  assert(
    bullseyeLogical.inventoryStatus === 'IN_RESERVE' &&
      !bullseyeLogical.active &&
      !bullseyeLogical.triggered &&
      !bullseyeLogical.expired,
    'Test K: Start Over must reset all Bullseye logical state flags cleanly',
  );

  sc.physicsBridge?.teardown();
  console.log('PASS [Test K]: Start Over Restores Initial Template Bullseye State verified.');
}

// --- TEST L: Camera and Presentation Compatibility ---
{
  const cameraModes = ['TACTICAL_WIDE', 'SIDE_FOLLOW', 'EXPERIMENTAL_POV'] as const;
  const resultsByMode: Array<{
    targetId: string | undefined;
    launchSpeed: number | undefined;
    launchAngleDeg: number | undefined;
    survivingWisps: number;
    bullseyeExpired: boolean;
    consumedBy: string | null | undefined;
  }> = [];

  for (const camMode of cameraModes) {
    const store = new LevelStore();
    store.resetToDefault();
    const sc = new SiegeController(store);
    const pd = new PresentationDirector();
    pd.updateSettings({ preferredFlightCamera: camMode });

    sc.devPlaceBullseyeExposedDecoy();
    sc.startSiege(true);

    stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500, pd, store);

    const bp = store.getPlacedBullseyePiece();
    resultsByMode.push({
      targetId: sc.targetingDiagnostics?.selectedTargetId,
      launchSpeed: sc.targetingDiagnostics?.launchSpeed,
      launchAngleDeg: sc.targetingDiagnostics?.launchAngle,
      survivingWisps: store.getState().wisps.filter((w) => !w.isDispersed).length,
      bullseyeExpired: Boolean(bp?.bullseyeExpired),
      consumedBy: bp?.consumedByAttackId,
    });

    sc.physicsBridge?.teardown();
  }

  const base = resultsByMode[0];
  for (let i = 1; i < resultsByMode.length; i++) {
    const curr = resultsByMode[i];
    assert(
      curr.targetId === base.targetId &&
        curr.launchSpeed === base.launchSpeed &&
        curr.launchAngleDeg === base.launchAngleDeg &&
        curr.survivingWisps === base.survivingWisps &&
        curr.bullseyeExpired === base.bullseyeExpired &&
        curr.consumedBy === base.consumedBy,
      `Test L: Camera mode ${cameraModes[i]} produced different gameplay/Bullseye result than ${cameraModes[0]}`,
    );
  }

  console.log('PASS [Test L]: Camera Mode Independence (Wide, Side Follow, Experimental POV) verified.');
}

// --- TEST M: Lifecycle and Repeat Runs (5 Consecutive Bullseye Siege Attempts) ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const sc = new SiegeController(store);

  for (let run = 1; run <= 5; run++) {
    sc.startOver();
    sc.devPlaceBullseyeReinforced();

    sc.startSiege(true);
    stepUntilMode(sc, ['REINFORCEMENT_INTRO', 'REINFORCEMENT_ACTIVE'], 1500);

    sc.finishReinforcement();
    sc.launchFinalAttack();
    stepUntilMode(sc, ['SEQUENCE_COMPLETE', 'RESULTS'], 1500);

    assertValidStoreState(store, `Test M (Run ${run})`);

    const bullseyePieces = store.getState().pieces.filter((p) => p.type === 'bullseye_block');
    assert(
      bullseyePieces.length === 1 && bullseyePieces[0].id === TUTORIAL_BULLSEYE_ID,
      `Test M (Run ${run}): Expected exactly 1 bullseye_block with ID ${TUTORIAL_BULLSEYE_ID}`,
    );
    assert(
      bullseyePieces[0].bullseyeExpired === true && bullseyePieces[0].bullseyeActive === false,
      `Test M (Run ${run}): Bullseye must be cleanly expired at end of run`,
    );
    assert(
      store.getState().inventory.bullseye_block === 0,
      `Test M (Run ${run}): Inventory bullseye_block count must remain 0 while placed`,
    );
  }

  sc.startOver();
  assert(
    sc.physicsBridge === null,
    'Test M: Physics bridge must be torn down and null after startOver',
  );
  console.log('PASS [Test M]: 5 Consecutive Bullseye Siege Runs & Lifecycle Hygiene verified.');
}

// --- TACTICAL SCOPE & ENEMY-OBJECTIVE CLARIFICATION CHECKS ---
{
  const store = new LevelStore();
  store.resetToDefault();
  const state = store.getState();

  // 1. Outside an active Bullseye override, verify Standard vs Heavy role-appropriate targeting
  const stdRes = selectTargetAndTrajectory(state, AUTHORED_ATTACKS[0]);
  const hvyRes = selectTargetAndTrajectory(state, AUTHORED_ATTACKS[1]);

  assert(
    stdRes !== null && hvyRes !== null,
    'Clarification Check: Both standard and heavy attackers must select valid targets',
  );
  assert(
    stdRes!.diagnostics.selectedTargetId !== hvyRes!.diagnostics.selectedTargetId,
    `Clarification Check: Standard (${stdRes!.diagnostics.selectedTargetId}) and Heavy (${hvyRes!.diagnostics.selectedTargetId}) attackers must prioritize distinct role-appropriate targets on the default fortress`,
  );

  // 2. Verify an expired Bullseye Block is evaluated identically to a normal stone_block
  store.placePiece(makeBullseyePiece(430, 696));
  store.markBullseyeTriggered();
  store.expireBullseyeForAttack('attack_1_standard');
  const stateWithExpiredBullseye = store.getState();

  const stateWithNormalStone = {
    ...stateWithExpiredBullseye,
    pieces: stateWithExpiredBullseye.pieces.map((p) =>
      p.id === TUTORIAL_BULLSEYE_ID ? { ...p, type: 'stone_block' as const } : p,
    ),
  };

  const launcherOrigin = AUTHORED_ATTACKS[1].spawnPosition;
  const expiredCandidates = generateTargetCandidates(stateWithExpiredBullseye, launcherOrigin);
  const stoneCandidates = generateTargetCandidates(stateWithNormalStone, launcherOrigin);

  const expiredScores = scoreCandidates(
    expiredCandidates,
    'heavy',
    stateWithExpiredBullseye,
    launcherOrigin,
  );
  const stoneScores = scoreCandidates(
    stoneCandidates,
    'heavy',
    stateWithNormalStone,
    launcherOrigin,
  );

  const expiredBullseyeScored = expiredScores.find(
    (s) => s.candidate.pieceId === TUTORIAL_BULLSEYE_ID,
  );
  const normalStoneScored = stoneScores.find(
    (s) => s.candidate.pieceId === TUTORIAL_BULLSEYE_ID,
  );

  assert(
    expiredBullseyeScored !== undefined &&
      normalStoneScored !== undefined &&
      Math.abs(expiredBullseyeScored.totalScore - normalStoneScored.totalScore) < 1e-6,
    'Clarification Check: Expired Bullseye Block must be scored identically to a normal stone_block with zero hidden taunt bonus',
  );

  // 3. Verify clean difficulty extension points exist
  assert(
    DEFAULT_LEVEL_1_DIFFICULTY_CONFIG.candidateScoringSophistication === 'tactical' &&
      DEFAULT_LEVEL_1_DIFFICULTY_CONFIG.defenderInformationLevel === 'full' &&
      DEFAULT_LEVEL_1_DIFFICULTY_CONFIG.projectileSequenceComplexity === 'tutorial_pair',
    'Clarification Check: DEFAULT_LEVEL_1_DIFFICULTY_CONFIG extension points must be present and configured for Level 1',
  );

  console.log('PASS [Tactical Scope & Enemy-Objective Clarification]: Role-based targeting, expired stone equivalence, and difficulty extension points verified.');
}

console.log('\n=== ALL PHASE 5 ACCEPTANCE & TACTICAL SCOPE TESTS PASSED (100%) ===');
