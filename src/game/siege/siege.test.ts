/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_LEVEL_STATE, MATERIAL_CONFIGS, WORLD_CONFIG } from '../config';
import { PhysicsBridge } from '../physics/physicsBridge';
import { AUTHORED_ATTACKS, DAMAGE_THRESHOLDS } from './siegeConfig';
import { SiegeController } from './siegeController';
import { LevelStore } from '../state/levelStore';
import { LevelState } from '../types';

function runPhase1RegressionTest(): boolean {
  console.log('\n--- 1. Phase 1 Stability Regression Test ---');
  const levelStore = new LevelStore();
  levelStore.resetToDefault();
  const state = levelStore.getState();

  const bridge = new PhysicsBridge(state);
  console.log('Initial Overlap Count:', bridge.diagnostics.initialOverlapCount);
  console.log('Max Initial Penetration:', bridge.diagnostics.maxInitialPenetration);

  if (bridge.diagnostics.initialOverlapCount !== 0) {
    console.error('FAIL: Initial overlap count is not 0');
    return false;
  }

  // Simulate 120 steps (2 seconds)
  let report = bridge.getStabilityReport(0);
  for (let frame = 1; frame <= 120; frame++) {
    bridge.step(16.666);
    report = bridge.getStabilityReport(1 / 60);
  }

  console.log('Total KE after 2s:', report.totalKineticEnergy.toFixed(5), 'J');
  console.log('Settled Ratio:', (report.settledRatio * 100).toFixed(1) + '%');
  console.log('Is Settled:', report.isSettled);

  bridge.teardown();

  if (!report.isSettled) {
    console.error('FAIL: Untouched Phase 1 preset did not reach settled state!');
    return false;
  }
  console.log('PASS: Untouched Phase 1 preset reaches Stable (100%)');
  return true;
}

function runThreeConsecutiveCyclesTest(): boolean {
  console.log('\n--- 2. Three Consecutive Test Fortress -> Restore Cycles ---');
  const levelStore = new LevelStore();
  levelStore.resetToDefault();

  const initialPieceCount = levelStore.getState().pieces.length;
  const initialInventory = { ...levelStore.getState().inventory };

  for (let cycle = 1; cycle <= 3; cycle++) {
    levelStore.captureSnapshot();
    const bridge = new PhysicsBridge(levelStore.getState());
    for (let f = 1; f <= 60; f++) {
      bridge.step(16.666);
    }
    bridge.teardown();
    levelStore.restorePreTestSnapshot();

    const currentPieceCount = levelStore.getState().pieces.length;
    const currentInventory = levelStore.getState().inventory;

    if (currentPieceCount !== initialPieceCount) {
      console.error(`FAIL: Cycle ${cycle} altered piece count: ${currentPieceCount} vs ${initialPieceCount}`);
      return false;
    }
    if (
      currentInventory.wood_beam !== initialInventory.wood_beam ||
      currentInventory.wood_block !== initialInventory.wood_block ||
      currentInventory.stone_block !== initialInventory.stone_block
    ) {
      console.error(`FAIL: Cycle ${cycle} altered inventory counts`);
      return false;
    }
    console.log(`Cycle ${cycle} OK: Piece count=${currentPieceCount}, Inventory preserved`);
  }
  console.log('PASS: Three consecutive cycles preserved exact state');
  return true;
}

function runPhase2SiegeLifecycleTest(): boolean {
  console.log('\n--- 3. Phase 2 Scripted Siege Lifecycle Test ---');
  const levelStore = new LevelStore();
  levelStore.resetToDefault();

  // Add one wood beam on top of the left pillars to test damage
  levelStore.placePiece({
    id: 'test_roof_beam',
    type: 'wood_beam',
    position: { x: 260, y: 684 },
    rotation: 0,
    isPrebuilt: false,
  });

  const siege = new SiegeController(levelStore);
  const getMode = () => siege.mode;

  const started = siege.startSiege();
  if (!started || getMode() !== 'ENEMY_INTRODUCTION') {
    console.error('FAIL: Siege failed to start in ENEMY_INTRODUCTION mode');
    return false;
  }
  console.log('Siege started successfully in ENEMY_INTRODUCTION mode');

  // Skip intro to go to AIMING_PREVIEW
  siege.skipIntroduction();
  siege.step(0.016);
  if (getMode() !== 'AIMING_PREVIEW') {
    console.error(`FAIL: Expected AIMING_PREVIEW, got ${getMode()}`);
    return false;
  }
  console.log('Mode transitioned to AIMING_PREVIEW');

  // Advance aiming timer
  siege.step(1.3);
  if (getMode() !== 'PROJECTILE_IN_FLIGHT') {
    console.error(`FAIL: Expected PROJECTILE_IN_FLIGHT, got ${getMode()}`);
    return false;
  }
  console.log('Mode transitioned to PROJECTILE_IN_FLIGHT. Projectile active:', Boolean(siege.physicsBridge?.getActiveProjectile()));

  // Step flight and impact until settled (includes ~50 frames flight time at STANDARD distance)
  for (let frame = 1; frame <= 500; frame++) {
    siege.step(0.016);
    if (getMode() === 'ATTACK_RESOLVED') {
      break;
    }
  }

  if (getMode() !== 'ATTACK_RESOLVED') {
    console.error(`FAIL: Attack 1 did not reach ATTACK_RESOLVED, got ${getMode()}`);
    return false;
  }
  console.log('Attack 1 resolved. Outcomes recorded:', siege.outcomes.length);
  const out1 = siege.outcomes[0];
  console.log(`Attack 1 Outcome: Wisps dispersed=${out1.wispsDispersed}, Pieces cracked=${out1.piecesCracked}, broken=${out1.piecesBroken}, lost=${out1.piecesLost}`);

  // Advance intermission to Attack 2
  siege.nextAttackManually();
  siege.step(0.016);
  if (getMode() !== 'ENEMY_INTRODUCTION' || siege.currentAttackIndex !== 1) {
    console.error(`FAIL: Expected Attack 2 in ENEMY_INTRODUCTION, got ${getMode()}, attack ${siege.currentAttackIndex}`);
    return false;
  }
  console.log('Attack 2 (Grom the Slag-Brute) introduced. Beginning from resolved state of Attack 1.');

  // Skip intro and advance aiming
  siege.skipIntroduction();
  siege.step(0.016);
  siege.step(1.3);

  // Step Attack 2 until sequence complete
  for (let frame = 1; frame <= 500; frame++) {
    siege.step(0.016);
    if (getMode() === 'ATTACK_RESOLVED') {
      siege.nextAttackManually();
      siege.step(0.016);
    }
    if (getMode() === 'SEQUENCE_COMPLETE') {
      break;
    }
  }

  if (getMode() !== 'SEQUENCE_COMPLETE') {
    console.error(`FAIL: Expected SEQUENCE_COMPLETE, got ${getMode()}`);
    return false;
  }
  console.log('Siege Sequence Complete!');
  const summary = siege.siegeSummary;
  if (!summary) {
    console.error('FAIL: No siege summary produced');
    return false;
  }

  console.log(`Summary: Wisps Stable=${summary.wispsStable}/${summary.totalWisps}, Intact=${summary.piecesIntact}, Cracked=${summary.piecesCracked}, Broken=${summary.piecesBroken}, Lost=${summary.piecesLost}`);

  // Test Restore Design
  siege.restoreDesign();
  if (siege.mode !== 'CONSTRUCTION') {
    console.error(`FAIL: Restore design did not return to CONSTRUCTION, got ${siege.mode}`);
    return false;
  }

  const restoredPieces = levelStore.getState().pieces;
  const testPiece = restoredPieces.find((p) => p.id === 'test_roof_beam');
  if (!testPiece || testPiece.position.x !== 260 || testPiece.position.y !== 684) {
    console.error('FAIL: Pre-siege piece was not restored to exact coordinates');
    return false;
  }
  if (testPiece.condition && testPiece.condition !== 'INTACT') {
    console.error(`FAIL: Restored piece condition is ${testPiece.condition}, expected INTACT`);
    return false;
  }

  console.log('PASS: Restore Design accurately restored exact pre-siege coordinates and INTACT condition');
  return true;
}

function runAll() {
  const p1 = runPhase1RegressionTest();
  const p2 = runThreeConsecutiveCyclesTest();
  const p3 = runPhase2SiegeLifecycleTest();

  if (p1 && p2 && p3) {
    console.log('\n=======================================');
    console.log('ALL PHASE 1 & PHASE 2 VERIFICATIONS PASSED');
    console.log('=======================================\n');
    process.exit(0);
  } else {
    console.error('\nTESTS FAILED');
    process.exit(1);
  }
}

runAll();
