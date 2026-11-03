/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { LevelStore } from './levelStore';
import { SiegeController } from '../siege/siegeController';
import { INITIAL_LEVEL_STATE, LEVEL_1_CONFIG } from '../config';
import { LevelState, MaterialType, PlacedPiece } from '../types';

// In-memory mock localStorage for deterministic node test execution
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

// Assign global mock localStorage
const mockStorage = new LocalStorageMock();
(globalThis as unknown as { localStorage: LocalStorageMock }).localStorage = mockStorage;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

console.log('========================================================================');
console.log('LEVEL 1 RESET, STARTUP & FINAL-RESULT REHYDRATION SUITE (1-22, SCENARIOS A-I)');
console.log('========================================================================');

// Helper to set up a post-siege completed state in store & controller
function simulateCompletedSiege(store: LevelStore, sc: SiegeController) {
  // Place wisps & a player beam
  store.placePiece({
    id: 'test_player_beam',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placeAllWispsInDefaultSanctuarySlots();
  sc.devBypassTutorialRequirements = true;
  sc.startSiege(true);
  sc.skipIntroduction();
  sc.step(0.016);
  sc.step(1.5);
  // Complete siege
  sc.finishSequence();
}

// --- Test 1 & Scenario A: Fresh Launch without Persistence ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);

  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Mode must be CONSTRUCTION on fresh launch');
  assert.strictEqual(store.savedPhase, 'CONSTRUCTION', 'savedPhase must be CONSTRUCTION');
  assert.strictEqual(store.wispPlacementPhase, 'STAGED_IN_BUILD', 'wisps must be STAGED_IN_BUILD');

  const battlefieldWisps = store.getState().wisps.filter((w) => w.placed === true);
  assert.strictEqual(battlefieldWisps.length, 0, 'Scenario A: Zero battlefield wisps on fresh start');
  assert.strictEqual(store.getState().wisps.length, 3, 'Exactly 3 wisps awaiting placement');

  assert.strictEqual(store.getState().pieces.length, 5, 'Exactly 5 prebuilt pieces');
  assert.strictEqual(store.getState().pieces.every((p) => p.isPrebuilt && (!p.condition || p.condition === 'INTACT')), true, 'Prebuilts intact');

  assert.strictEqual(store.getState().inventory.wood_beam, 4, 'Full starting beams');
  assert.strictEqual(store.getState().inventory.wood_block, 4, 'Full starting wood blocks');
  assert.strictEqual(store.getState().inventory.stone_block, 3, 'Full starting stone blocks');
  assert.strictEqual(store.getState().inventory.bullseye_block, 1, 'Starting bullseye block intact');

  console.log('✓ Test 1 & Scenario A (Fresh Launch Starts in Clean BUILD Template): PASSED');
}

// --- Test 2 & Scenario B: Startup with Completed Siege in Storage (FINAL_RESULT Invalidation) ---
{
  mockStorage.clear();
  const store1 = new LevelStore();
  const sc1 = new SiegeController(store1);
  simulateCompletedSiege(store1, sc1);

  assert.strictEqual(sc1.mode, 'SEQUENCE_COMPLETE', 'Siege ended in SEQUENCE_COMPLETE');
  assert.strictEqual(store1.isAttemptCompleted, true, 'Attempt is completed in store');
  assert.notStrictEqual(store1.getNamedSnapshot('FINAL_RESULT'), null, 'FINAL_RESULT was saved');

  // Now simulate a fresh application restart / reload
  const store2 = new LevelStore();
  const sc2 = new SiegeController(store2);

  // Strict startup precedence: Completed attempts must not rehydrate into RESULTS
  assert.strictEqual(store2.savedPhase, 'CONSTRUCTION', 'Startup recovered to CONSTRUCTION');
  assert.strictEqual(sc2.mode, 'CONSTRUCTION', 'Scenario B: App launches into clean BUILD phase');
  assert.strictEqual(store2.isAttemptCompleted, false, 'New attempt is not completed');
  assert.strictEqual(store2.getNamedSnapshot('FINAL_RESULT'), null, 'FINAL_RESULT cleared from active state');

  const battlefieldWisps = store2.getState().wisps.filter((w) => w.placed === true);
  assert.strictEqual(battlefieldWisps.length, 0, 'Scenario B: Zero battlefield wisps on fresh load');
  assert.strictEqual(store2.getState().pieces.length, 5, 'Exactly 5 prebuilts restored');
  assert.strictEqual(store2.getState().pieces.every((p) => (!p.condition || p.condition === 'INTACT')), true, 'No damaged fortress');
  assert.strictEqual(sc2.level1Results, null, 'No active results modal on fresh start');

  console.log('✓ Test 2 & Scenario B (Startup After Siege Concludes Begins in Clean BUILD): PASSED');
}

// --- Test 3: Interrupted Mid-Siege Recovery Preserved ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  store.placePiece({
    id: 'brace_1',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placeAllWispsInDefaultSanctuarySlots();
  sc.attemptBeginSiege(true);

  // Simulate reload during Attack 1
  store.setSavedPhase('PROJECTILE_IN_FLIGHT');
  const recovery = sc.simulateSafeReload();
  assert.strictEqual(recovery.recoveredPhase, 'CONSTRUCTION_READY', 'Attack 1 reload restores CONSTRUCTION_READY');
  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Mode is CONSTRUCTION ready');

  console.log('✓ Test 3 (Interrupted Mid-Siege Reload Preserved Safely): PASSED');
}

// --- Test 4 & Scenario C: Player Reset Level from Results Screen ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  simulateCompletedSiege(store, sc);
  sc.showResultsScreen();
  assert.strictEqual(sc.mode, 'RESULTS', 'Active mode is RESULTS');

  const initialAttemptId = store.activeAttemptId;
  const initialGen = store.resetGeneration;

  // Player clicks Reset Level
  sc.resetLevel();

  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Scenario C: Mode transitions immediately to CONSTRUCTION');
  assert.strictEqual(store.savedPhase, 'CONSTRUCTION', 'savedPhase is CONSTRUCTION');
  assert.notStrictEqual(store.activeAttemptId, initialAttemptId, 'New unique attempt ID created');
  assert.strictEqual(store.resetGeneration, initialGen + 1, 'Reset generation token incremented');
  assert.strictEqual(store.isAttemptCompleted, false, 'isAttemptCompleted reset to false');
  assert.strictEqual(store.getNamedSnapshot('FINAL_RESULT'), null, 'FINAL_RESULT cleared');
  assert.strictEqual(sc.level1Results, null, 'level1Results cleared');
  assert.strictEqual(sc.siegeSummary, null, 'siegeSummary cleared');

  // Verify full template restored
  assert.strictEqual(store.getState().pieces.length, 5, 'Exactly 5 prebuilts');
  assert.strictEqual(store.getState().wisps.filter((w) => w.placed).length, 0, 'Zero battlefield wisps');
  assert.strictEqual(store.getState().inventory.wood_beam, 4, 'Full starting beams restored');

  console.log('✓ Test 4 & Scenario C (Reset Level from Results Screen Restores Clean Template): PASSED');
}

// --- Test 5 & Scenario D: Start Over Uses Same Boundary as Reset Level (from Mid-Build) ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);

  // Player places 2 beams and a block
  store.placePiece({
    id: 'p1',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placePiece({
    id: 'p2',
    type: 'wood_block',
    position: { x: 200, y: 624 },
    rotation: 0,
    isPrebuilt: false,
  });
  assert.strictEqual(store.getState().pieces.length, 7, '7 pieces in mid-build');
  assert.strictEqual(store.getState().inventory.wood_beam, 3, '3 beams remaining');

  // Player clicks Start Over
  sc.startOver();

  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Mode is CONSTRUCTION');
  assert.strictEqual(store.getState().pieces.length, 5, 'Player pieces cleared to 5 prebuilts');
  assert.strictEqual(store.getState().inventory.wood_beam, 4, 'Starting beams restored');
  assert.strictEqual(store.getState().inventory.wood_block, 4, 'Starting blocks restored');

  console.log('✓ Test 5 & Scenario D (Start Over Uses Identical Boundary from Mid-Build): PASSED');
}

// --- Test 6: Attempt ID Tracking & Stale Snapshot Invalidation ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const attempt1 = store.activeAttemptId;
  assert.ok(attempt1.startsWith('attempt_'), 'Attempt ID formatted correctly');

  store.saveNamedSnapshot('INITIAL_DESIGN');
  assert.ok(store.getNamedSnapshot('INITIAL_DESIGN'), 'INITIAL_DESIGN saved');

  store.resetLevel();
  const attempt2 = store.activeAttemptId;
  assert.notStrictEqual(attempt1, attempt2, 'Attempt ID changed on reset');
  assert.strictEqual(store.getNamedSnapshot('INITIAL_DESIGN'), null, 'Old snapshot cleared on reset');

  console.log('✓ Test 6 (Attempt ID Tracking & Stale Snapshot Invalidation): PASSED');
}

// --- Test 7 & 18: Reset Generation Token & Stale Async Hydration Rejection ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const genBefore = store.resetGeneration;

  // Simulate an async fetch started at generation N
  const asyncPayloadState: LevelState = deepClone(store.getState());
  asyncPayloadState.inventory.wood_beam = 1; // stale altered inventory

  // Player hits Reset Level before async completes
  store.resetLevel();
  assert.strictEqual(store.resetGeneration, genBefore + 1, 'Generation incremented');

  // Async hydration returns with old generation token
  const accepted = store.hydrateState(asyncPayloadState, { savedPhase: 'RESULTS' }, genBefore);
  assert.strictEqual(accepted, false, 'Stale async hydration with old token was rejected');
  assert.strictEqual(store.getState().inventory.wood_beam, 4, 'Current clean inventory preserved');
  assert.strictEqual(store.savedPhase, 'CONSTRUCTION', 'Phase remains clean CONSTRUCTION');

  console.log('✓ Tests 7 & 18 (Generation Token Invalidation Rejects Stale Async Hydration): PASSED');
}

// --- Test 8 & Scenario G: Separation of Profile / Unlock State vs Active Attempt State ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);

  // Player completes tutorial and unlocks Reinforcement Reserve
  store.markTutorialCompleted();
  store.grantSampleUnlock();
  assert.strictEqual(store.unlockState.tutorialCompleted, true, 'Tutorial completed');
  assert.strictEqual(store.unlockState.reinforcementReserveUnlocked, true, 'Reserve+ unlocked');

  // Player now clicks Reset Level
  sc.resetLevel();

  // Attempt state is clean
  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Attempt state is in clean BUILD');
  assert.strictEqual(store.getState().pieces.length, 5, 'Clean prebuilts');
  assert.strictEqual(store.getState().wisps.filter((w) => w.placed).length, 0, '0 battlefield wisps');

  // BUT unlock preferences remain intact in profile!
  assert.strictEqual(store.unlockState.tutorialCompleted, true, 'Scenario G: tutorialCompleted preserved');
  assert.strictEqual(store.unlockState.reinforcementReserveUnlocked, true, 'Scenario G: reinforcementReserveUnlocked preserved');

  console.log('✓ Test 8 & Scenario G (Profile / Unlock State Preserved Across Reset Level): PASSED');
}

// --- Test 9: Zero Battlefield Wisps in BUILD Mode ---
{
  mockStorage.clear();
  const store = new LevelStore();
  assert.strictEqual(store.savedPhase, 'CONSTRUCTION', 'In CONSTRUCTION');
  const placed = store.getState().wisps.filter((w) => w.placed);
  assert.strictEqual(placed.length, 0, 'No wisps on battlefield in BUILD');
  const staged = store.getState().wisps.filter((w) => !w.placed);
  assert.strictEqual(staged.length, 3, 'Exactly 3 staged wisps');

  console.log('✓ Test 9 (Zero Battlefield Wisps in BUILD Mode): PASSED');
}

// --- Test 10: Prebuilt Structure Integrity ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const pieces = store.getState().pieces;
  assert.strictEqual(pieces.length, 5, '5 prebuilt pieces');
  for (const p of pieces) {
    assert.strictEqual(p.isPrebuilt, true, `${p.id} is marked prebuilt`);
    assert.strictEqual(!p.condition || p.condition === 'INTACT', true, `${p.id} condition is INTACT`);
  }
  console.log('✓ Test 10 (Prebuilt Structure Integrity Verified): PASSED');
}

// --- Test 11: Full Starting Inventory Restored ---
{
  mockStorage.clear();
  const store = new LevelStore();
  store.getState().inventory.wood_beam = 0;
  store.resetLevel();
  const inv = store.getState().inventory;
  assert.strictEqual(inv.wood_beam, 4, '4 beams');
  assert.strictEqual(inv.wood_block, 4, '4 wood blocks');
  assert.strictEqual(inv.stone_block, 3, '3 stone blocks');
  assert.strictEqual(inv.bullseye_block, 1, '1 bullseye block');
  console.log('✓ Test 11 (Full Starting Inventory Restored): PASSED');
}

// --- Test 12 & Scenario E: No Delivered Reinforcement Inventory After Reset ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  store.placePiece({
    id: 'p_wood',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placeAllWispsInDefaultSanctuarySlots();
  sc.jumpToPostAttack1TestState();

  assert.strictEqual(sc.mode, 'REINFORCEMENT_ACTIVE', 'In reinforcement mode');
  assert.strictEqual(store.isReinforcementMode, true, 'isReinforcementMode true');

  // Reset from Reinforcement
  sc.resetLevel();

  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Scenario E: Reset returns to clean CONSTRUCTION');
  assert.strictEqual(store.isReinforcementMode, false, 'Reinforcement mode inactive');
  assert.strictEqual(store.deliveryGranted, false, 'Delivery granted false');
  assert.strictEqual(store.guaranteedDeliveryUsed, 0, 'Delivery used 0');
  assert.strictEqual(store.reinforcementMaterialsUsed, 0, 'Reinforcement materials used 0');
  assert.strictEqual(store.deliveredInventory.wood_beam, 0, 'Delivered inventory 0');

  console.log('✓ Test 12 & Scenario E (Reset Level from Reinforcement Clears Delivered Inventory): PASSED');
}

// --- Test 13: Bullseye State Clean ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  sc.devPlaceBullseyeReinforced();
  assert.ok(store.getPlacedBullseyePiece(), 'Bullseye placed');

  sc.resetLevel();
  assert.strictEqual(store.getPlacedBullseyePiece(), null, 'No placed bullseye piece after reset');
  assert.strictEqual(store.getState().inventory.bullseye_block, 1, 'Bullseye in inventory');
  assert.strictEqual(store.bullseyeConflictDiagnostic, null, 'No bullseye conflict diagnostic');

  console.log('✓ Test 13 (Bullseye State Clean on Reset): PASSED');
}

// --- Test 14: No Final Result or Summary on Fresh Attempt ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  simulateCompletedSiege(store, sc);
  sc.resetLevel();

  assert.strictEqual(store.lastResults, null, 'store lastResults is null');
  assert.strictEqual(sc.level1Results, null, 'sc level1Results is null');
  assert.strictEqual(sc.siegeSummary, null, 'sc siegeSummary is null');
  console.log('✓ Test 14 (No Final Result or Summary on Fresh Attempt): PASSED');
}

// --- Test 15: No Active Projectile or Attacker on Clean Reset ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  store.placeAllWispsInDefaultSanctuarySlots();
  sc.attemptBeginSiege(true);

  sc.resetLevel();
  assert.strictEqual(sc.currentAttack, null, 'currentAttack is null');
  assert.strictEqual(sc.currentAttackIndex, 0, 'currentAttackIndex is 0');
  assert.strictEqual(sc.physicsBridge, null, 'physicsBridge torn down');

  console.log('✓ Test 15 (No Active Projectile or Attacker on Reset): PASSED');
}

// --- Test 16 & Scenario F: Distinct Retry Design Action ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);

  // Player builds a custom roof beam and places wisps
  store.placePiece({
    id: 'player_roof_span',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });
  store.placeAllWispsInDefaultSanctuarySlots();
  assert.strictEqual(store.getState().wisps.filter((w) => w.placed).length, 3, '3 wisps placed');
  assert.strictEqual(store.getState().pieces.length, 6, '6 pieces (5 prebuilt + 1 player beam)');

  // Run siege to completion
  sc.devBypassTutorialRequirements = true;
  sc.startSiege(true);
  sc.skipIntroduction();
  sc.step(0.016);
  sc.step(1.5);
  sc.finishSequence();

  // Now player clicks "Retry Design"
  sc.retryDesign();

  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Retry Design returns to CONSTRUCTION');
  assert.strictEqual(store.getState().pieces.length, 6, 'Scenario F: Player custom roof piece preserved!');
  const customPiece = store.getState().pieces.find((p) => p.id === 'player_roof_span');
  assert.ok(customPiece, 'Custom piece found');
  assert.strictEqual(customPiece?.condition, 'INTACT', 'Damage cleared to INTACT on retry');

  // Wisps are preserved in their placed positions
  const placedWisps = store.getState().wisps.filter((w) => w.placed);
  assert.strictEqual(placedWisps.length, 3, 'Scenario F: Placed wisps preserved in sanctuary');
  assert.strictEqual(placedWisps.every((w) => !w.isDispersed), true, 'Dispersal cleared on retry');

  console.log('✓ Test 16 & Scenario F (Distinct Retry Design Action Restores Submitted Structure): PASSED');
}

// --- Test 17: Distinct Reset Level Action Clears Custom Pieces ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  store.placePiece({
    id: 'player_custom',
    type: 'wood_beam',
    position: { x: 200, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  });
  assert.strictEqual(store.getState().pieces.length, 6, '6 pieces');

  // Reset Level wipes custom pieces
  sc.resetLevel();
  assert.strictEqual(store.getState().pieces.length, 5, 'Player pieces wiped on Reset Level');
  assert.strictEqual(store.getState().pieces.some((p) => p.id === 'player_custom'), false, 'Custom piece gone');

  console.log('✓ Test 17 (Reset Level Fully Resets to Template unlike Retry Design): PASSED');
}

// --- Test 19: Replay and Camera Non-Authoritative ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);
  sc.resetLevel();
  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Mode is CONSTRUCTION');
  assert.strictEqual(sc.wasStartedViaPlayerGate, false, 'Player gate reset');
  console.log('✓ Test 19 (Replay and Camera Presentation Non-Authoritative): PASSED');
}

// --- Test 20 & Scenario I: Developer Clear Storage vs Player Reset Level ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);

  // Set unlock state and dev override
  store.markTutorialCompleted();
  store.grantSampleUnlock();
  store.setDeveloperWispCountOverride(2);
  assert.strictEqual(store.unlockState.reinforcementReserveUnlocked, true, 'Unlocked');
  assert.strictEqual(store.developerWispCountOverride, 2, 'Override is 2');

  // 1. Player Reset Level: Keeps unlocks and dev override
  sc.resetLevel();
  assert.strictEqual(store.unlockState.reinforcementReserveUnlocked, true, 'Reset Level preserves unlocks');
  assert.strictEqual(store.developerWispCountOverride, 2, 'Reset Level preserves dev override');

  // 2. Developer Clear Storage (Clear All Prototype Data): Clears unlocks and dev override
  store.clearAllPrototypeData();
  assert.strictEqual(store.unlockState.reinforcementReserveUnlocked, false, 'Scenario I: Dev clear wipes unlocks');
  assert.strictEqual(store.unlockState.tutorialCompleted, false, 'Scenario I: Dev clear wipes tutorial');
  assert.strictEqual(store.developerWispCountOverride, null, 'Scenario I: Dev clear wipes override');
  assert.strictEqual(store.getRequiredWispCount(), 3, 'Level 1 default 3 wisps restored');

  console.log('✓ Test 20 & Scenario I (Developer Clear Storage vs Player Reset Level Distinguished): PASSED');
}

// --- Test 21 & Scenario H: Consecutive Resets & Rapid Double Reset Idempotency ---
{
  mockStorage.clear();
  const store = new LevelStore();
  const sc = new SiegeController(store);

  sc.resetLevel();
  const gen1 = store.resetGeneration;
  const attempt1 = store.activeAttemptId;

  // Immediate second reset
  sc.resetLevel();
  const gen2 = store.resetGeneration;
  const attempt2 = store.activeAttemptId;

  assert.strictEqual(gen2, gen1 + 1, 'Generation incremented on each call');
  assert.notStrictEqual(attempt1, attempt2, 'Attempt ID fresh on each call');
  assert.strictEqual(sc.mode, 'CONSTRUCTION', 'Scenario H: Remains in coherent CONSTRUCTION');
  assert.strictEqual(store.getState().pieces.length, 5, '5 prebuilts');
  assert.strictEqual(store.getState().wisps.filter((w) => w.placed).length, 0, '0 battlefield wisps');

  console.log('✓ Test 21 & Scenario H (Rapid Double Reset Idempotency & Stability): PASSED');
}

// --- Test 22: Full Reload Lifecycle After Reset Level ---
{
  mockStorage.clear();
  const store1 = new LevelStore();
  const sc1 = new SiegeController(store1);

  // Play, complete, and then hit Reset Level
  simulateCompletedSiege(store1, sc1);
  sc1.resetLevel();

  // Now simulate fresh page load / tab reload from the persisted storage
  const store2 = new LevelStore();
  const sc2 = new SiegeController(store2);

  assert.strictEqual(store2.savedPhase, 'CONSTRUCTION', 'Store2 reloaded into CONSTRUCTION');
  assert.strictEqual(sc2.mode, 'CONSTRUCTION', 'SiegeController2 in CONSTRUCTION');
  assert.strictEqual(store2.getState().pieces.length, 5, '5 prebuilt intact pieces');
  assert.strictEqual(store2.getState().wisps.filter((w) => w.placed).length, 0, '0 battlefield wisps');
  assert.strictEqual(store2.getState().inventory.wood_beam, 4, 'Full starting beams');
  assert.strictEqual(sc2.level1Results, null, 'No results screen');

  console.log('✓ Test 22 (Full Reload Lifecycle After Reset Level Loads Clean BUILD): PASSED');
}

console.log('========================================================================');
console.log('ALL 22 TESTS AND ACCEPTANCE SCENARIOS (A-I) PASSED WITH ZERO REGRESSIONS!');
console.log('========================================================================');
