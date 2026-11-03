/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// In-memory polyfill for localStorage in Node.js test environment
if (typeof globalThis.localStorage === 'undefined') {
  const memStorage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => memStorage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memStorage.set(k, String(v));
    },
    removeItem: (k: string) => {
      memStorage.delete(k);
    },
    clear: () => {
      memStorage.clear();
    },
    key: (i: number) => Array.from(memStorage.keys())[i] ?? null,
    get length() {
      return memStorage.size;
    },
  } as unknown as Storage;
}

import { LevelStore } from '../state/levelStore';
import { SiegeController } from './siegeController';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

export interface ScenarioRunResult {
  wispsAfterAttack1: number;
  wispsAfterAttack2: number;
  attack1Target: string;
  attack1FirstImpact: string;
  attack2Target: string;
  attack2FirstImpact: string;
  classification: string;
  bullseyeTriggered?: boolean;
  bullseyeExpired?: boolean;
}

export function executeScenario(
  setupFn: (store: LevelStore) => void,
  reinforceFn?: (store: LevelStore, siege: SiegeController) => void,
  devBypass = false,
): ScenarioRunResult {
  const store = new LevelStore();
  store.clearStorage();
  const siege = new SiegeController(store);
  if (devBypass) {
    siege.setDevBypassTutorialRequirements(true);
  }
  setupFn(store);
  if (!devBypass) {
    siege.runTutorialStabilityTest(1.0);
  }
  const started = siege.attemptBeginSiege(true);
  assert(started, 'Failed to begin siege in test scenario');

  // --- Attack 1 ---
  siege.skipIntroduction();
  siege.step(0.016);
  siege.step(1.3);
  for (let i = 0; i < 600; i++) {
    siege.step(0.016);
    if (siege.mode === 'ATTACK_RESOLVED') break;
  }
  assert(siege.mode === 'ATTACK_RESOLVED', `Expected ATTACK_RESOLVED after Attack 1, got ${siege.mode}`);
  const state1 = store.getState();
  const w1 = state1.wisps.filter((w) => !w.isDispersed).length;
  const t1 = siege.targetingDiagnostics?.selectedTargetId || 'unknown';
  const imp1 = siege.physicsBridge?.diagnostics.firstImpactTargetLabel || 'none';

  // --- Reinforcement Phase ---
  siege.enterReinforcementPhase();
  siege.beginActiveReinforcement();
  if (reinforceFn) {
    reinforceFn(store, siege);
  }
  siege.finishReinforcement();
  siege.launchFinalAttack();

  // --- Attack 2 ---
  const t2 = siege.targetingDiagnostics?.selectedTargetId || 'unknown';
  const bullseyeTriggered = siege.targetingDiagnostics?.bullseyeTriggered;
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
  const state2 = store.getState();
  const w2 = state2.wisps.filter((w) => !w.isDispersed).length;
  const imp2 = siege.physicsBridge?.diagnostics.firstImpactTargetLabel || 'none';
  const bullseyeExpired = siege.targetingDiagnostics?.bullseyeExpired;
  const classification = siege.level1Results?.classification || 'Unknown';

  return {
    wispsAfterAttack1: w1,
    wispsAfterAttack2: w2,
    attack1Target: t1,
    attack1FirstImpact: imp1,
    attack2Target: t2,
    attack2FirstImpact: imp2,
    classification,
    bullseyeTriggered,
    bullseyeExpired,
  };
}

async function runBalanceMatrixTests(): Promise<void> {
  console.log('================================================================');
  console.log('LEVEL 1 REINFORCEMENT RELEVANCE TUNING: EMPIRICAL BALANCE MATRIX');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // BASELINE: Developer No-Build Baseline (0 Wisps Stable -> Defense Failed)
  // ---------------------------------------------------------------------------
  console.log('Running Developer No-Build Baseline...');
  const resNoBuild = executeScenario(() => {}, undefined, true);
  console.log(`  -> Attack 1 Target: ${resNoBuild.attack1Target}, Wisps: ${resNoBuild.wispsAfterAttack1}/3`);
  console.log(`  -> Attack 2 Target: ${resNoBuild.attack2Target}, Wisps: ${resNoBuild.wispsAfterAttack2}/3`);
  console.log(`  -> Classification: "${resNoBuild.classification}"`);
  assert(resNoBuild.wispsAfterAttack2 === 0, `Expected 0 wisps in No-Build, got ${resNoBuild.wispsAfterAttack2}`);
  assert(resNoBuild.classification === 'Defense Failed', `Expected Defense Failed, got ${resNoBuild.classification}`);
  console.log('  PASS: Developer No-Build Baseline verified (0/3 wisps stable -> Defense Failed)\n');

  // ---------------------------------------------------------------------------
  // SCENARIO A: Minimal Guided Build, No Reinforcement
  // ---------------------------------------------------------------------------
  console.log('Running Scenario A: Minimal Guided Build (No Reinforcement)...');
  const resA = executeScenario((store) => {
    store.placePiece({
      id: 'guided_beam_1',
      type: 'wood_beam',
      position: { x: 200, y: 672 },
      rotation: 0,
      isPrebuilt: false,
    });
    store.placePiece({
      id: 'guided_block_1',
      type: 'wood_block',
      position: { x: 152, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
  });
  console.log(`  -> Attack 1 Target: ${resA.attack1Target}, First Impact: ${resA.attack1FirstImpact}, Wisps: ${resA.wispsAfterAttack1}/3`);
  console.log(`  -> Attack 2 Target: ${resA.attack2Target}, First Impact: ${resA.attack2FirstImpact}, Wisps: ${resA.wispsAfterAttack2}/3`);
  console.log(`  -> Classification: "${resA.classification}"`);
  assert(
    resA.wispsAfterAttack1 >= 2 && resA.wispsAfterAttack1 <= 3,
    `Scenario A: Expected 2-3 wisps after Attack 1, got ${resA.wispsAfterAttack1}`,
  );
  assert(
    resA.wispsAfterAttack2 >= 1 && resA.wispsAfterAttack2 <= 2,
    `Scenario A: Expected 1-2 wisps after Attack 2, got ${resA.wispsAfterAttack2}`,
  );
  console.log(`  PASS: Scenario A verified (${resA.wispsAfterAttack2}/3 wisps after unreinforced Attack 2 -> ${resA.classification})\n`);

  // ---------------------------------------------------------------------------
  // SCENARIO B: Minimal Guided Build + 1 Sensible Reinforcement Piece
  // ---------------------------------------------------------------------------
  console.log('Running Scenario B: Minimal Guided Build + 1 Reinforcement (Brace Block)...');
  const resB = executeScenario(
    (store) => {
      store.placePiece({
        id: 'guided_beam_1',
        type: 'wood_beam',
        position: { x: 200, y: 672 },
        rotation: 0,
        isPrebuilt: false,
      });
      store.placePiece({
        id: 'guided_block_1',
        type: 'wood_block',
        position: { x: 152, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    },
    (store) => {
      // 1 sensible reinforcement piece: brace block supporting the western breach
      store.placePiece({
        id: 'reinf_brace_1',
        type: 'stone_block',
        position: { x: 152, y: 708 },
        rotation: 0,
        isPrebuilt: false,
      });
    },
  );
  console.log(`  -> Attack 1 Target: ${resB.attack1Target}, First Impact: ${resB.attack1FirstImpact}, Wisps: ${resB.wispsAfterAttack1}/3`);
  console.log(`  -> Attack 2 Target: ${resB.attack2Target}, First Impact: ${resB.attack2FirstImpact}, Wisps: ${resB.wispsAfterAttack2}/3`);
  console.log(`  -> Classification: "${resB.classification}"`);
  assert(
    resB.wispsAfterAttack1 >= 2 && resB.wispsAfterAttack1 <= 3,
    `Scenario B: Expected 2-3 wisps after Attack 1, got ${resB.wispsAfterAttack1}`,
  );
  assert(
    resB.wispsAfterAttack2 >= 2 && resB.wispsAfterAttack2 <= 3,
    `Scenario B: Expected 2-3 wisps after Attack 2 (Successful/Exceptional Defense), got ${resB.wispsAfterAttack2}`,
  );
  assert(
    resB.wispsAfterAttack2 > resA.wispsAfterAttack2,
    `Scenario B: 1 Reinforcement (${resB.wispsAfterAttack2} wisps) must be measurably better than doing nothing (${resA.wispsAfterAttack2} wisps)`,
  );
  console.log(
    `  PASS: Scenario B verified (${resB.wispsAfterAttack2}/3 wisps stable -> Measurable reinforcement benefit: +${resB.wispsAfterAttack2 - resA.wispsAfterAttack2} wisp saved!)\n`,
  );

  // ---------------------------------------------------------------------------
  // SCENARIO C: Full Initial Inventory, No Reinforcement
  // ---------------------------------------------------------------------------
  console.log('Running Scenario C: Full Initial Inventory (No Reinforcement)...');
  const resC = executeScenario((store) => {
    store.placePiece({
      id: 'full_s1',
      type: 'stone_block',
      position: { x: 152, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    store.placePiece({
      id: 'full_s2',
      type: 'stone_block',
      position: { x: 104, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    store.placePiece({
      id: 'full_w1',
      type: 'wood_block',
      position: { x: 152, y: 708 },
      rotation: 0,
      isPrebuilt: false,
    });
    store.placePiece({
      id: 'full_w2',
      type: 'wood_block',
      position: { x: 152, y: 660 },
      rotation: 0,
      isPrebuilt: false,
    });
    store.placePiece({
      id: 'full_w3',
      type: 'wood_block',
      position: { x: 104, y: 660 },
      rotation: 0,
      isPrebuilt: false,
    });
    store.placePiece({
      id: 'full_b1',
      type: 'wood_beam',
      position: { x: 684, y: 768 },
      rotation: 0,
      isPrebuilt: false,
    });
  });
  console.log(`  -> Attack 1 Target: ${resC.attack1Target}, Wisps: ${resC.wispsAfterAttack1}/3`);
  console.log(`  -> Attack 2 Target: ${resC.attack2Target}, Wisps: ${resC.wispsAfterAttack2}/3`);
  console.log(`  -> Classification: "${resC.classification}"`);
  assert(
    resC.wispsAfterAttack2 >= 2 && resC.wispsAfterAttack2 <= 3,
    `Scenario C: Expected 2-3 wisps after Attack 2, got ${resC.wispsAfterAttack2}`,
  );
  console.log('  PASS: Scenario C verified (2-3 wisps stable -> Successful/Exceptional Defense)\n');

  // ---------------------------------------------------------------------------
  // SCENARIO D: Reserved Inventory Used Mid-Siege in Reinforcement
  // ---------------------------------------------------------------------------
  console.log('Running Scenario D: Reserved Inventory Used in Reinforcement...');
  const resD = executeScenario(
    (store) => {
      // Conservative start: guided shelter
      store.placePiece({
        id: 'res_beam_1',
        type: 'wood_beam',
        position: { x: 200, y: 672 },
        rotation: 0,
        isPrebuilt: false,
      });
      store.placePiece({
        id: 'res_block_1',
        type: 'wood_block',
        position: { x: 152, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    },
    (store) => {
      // Use reserved stone blocks & beam during reinforcement to heavily fortify
      store.placePiece({
        id: 'res_stone_brace',
        type: 'stone_block',
        position: { x: 152, y: 708 },
        rotation: 0,
        isPrebuilt: false,
      });
      store.placePiece({
        id: 'res_stone_buf',
        type: 'stone_block',
        position: { x: 104, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    },
  );
  console.log(`  -> Attack 1 Target: ${resD.attack1Target}, Wisps: ${resD.wispsAfterAttack1}/3`);
  console.log(`  -> Attack 2 Target: ${resD.attack2Target}, Wisps: ${resD.wispsAfterAttack2}/3`);
  console.log(`  -> Classification: "${resD.classification}"`);
  assert(
    resD.wispsAfterAttack2 >= 2 && resD.wispsAfterAttack2 <= 3,
    `Scenario D: Expected 2-3 wisps with reserved reinforcement, got ${resD.wispsAfterAttack2}`,
  );
  console.log('  PASS: Scenario D verified (2-3 wisps stable -> Successful/Exceptional Defense)\n');

  // ---------------------------------------------------------------------------
  // SCENARIO E: Optional Bullseye Block Decoy in Reinforcement
  // ---------------------------------------------------------------------------
  console.log('Running Scenario E: Optional Bullseye Block Decoy...');
  const resE = executeScenario(
    (store) => {
      store.placePiece({
        id: 'b_beam_1',
        type: 'wood_beam',
        position: { x: 200, y: 672 },
        rotation: 0,
        isPrebuilt: false,
      });
      store.placePiece({
        id: 'b_block_1',
        type: 'wood_block',
        position: { x: 152, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    },
    (store) => {
      // Place Bullseye Block as a decoy buffer block
      store.placePiece({
        id: 'player_bullseye_decoy',
        type: 'bullseye_block',
        position: { x: 104, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    },
  );
  console.log(`  -> Attack 2 Target: ${resE.attack2Target}, Bullseye Triggered: ${resE.bullseyeTriggered}`);
  console.log(`  -> Wisps: ${resE.wispsAfterAttack2}/3, Bullseye Expired: ${resE.bullseyeExpired}`);
  assert(resE.bullseyeTriggered === true, 'Scenario E: Bullseye override must be triggered');
  assert(resE.bullseyeExpired === true, 'Scenario E: Bullseye must expire after 1 attack');
  assert(resE.wispsAfterAttack2 >= 2, `Scenario E: Expected >= 2 wisps with Bullseye decoy, got ${resE.wispsAfterAttack2}`);
  console.log('  PASS: Scenario E verified (Bullseye reliably redirected attack and expired after 1 attack)\n');

  // ---------------------------------------------------------------------------
  // SCENARIO F: Repeatability Across 3 Independent Runs (Scenarios A & B)
  // ---------------------------------------------------------------------------
  console.log('Running Scenario F: Repeatability Verification (3 Runs of A and B)...');
  const runsA: ScenarioRunResult[] = [];
  const runsB: ScenarioRunResult[] = [];

  for (let i = 1; i <= 3; i++) {
    const runA = executeScenario((store) => {
      store.placePiece({
        id: 'g_beam',
        type: 'wood_beam',
        position: { x: 200, y: 672 },
        rotation: 0,
        isPrebuilt: false,
      });
      store.placePiece({
        id: 'g_block',
        type: 'wood_block',
        position: { x: 152, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    });
    runsA.push(runA);

    const runB = executeScenario(
      (store) => {
        store.placePiece({
          id: 'g_beam',
          type: 'wood_beam',
          position: { x: 200, y: 672 },
          rotation: 0,
          isPrebuilt: false,
        });
        store.placePiece({
          id: 'g_block',
          type: 'wood_block',
          position: { x: 152, y: 756 },
          rotation: 0,
          isPrebuilt: false,
        });
      },
      (store) => {
        store.placePiece({
          id: 'reinf_brace',
          type: 'stone_block',
          position: { x: 152, y: 708 },
          rotation: 0,
          isPrebuilt: false,
        });
      },
    );
    runsB.push(runB);

    console.log(`  Run ${i}: Scenario A Wisps = ${runA.wispsAfterAttack1} -> ${runA.wispsAfterAttack2} (${runA.classification}) | Scenario B Wisps = ${runB.wispsAfterAttack1} -> ${runB.wispsAfterAttack2} (${runB.classification})`);
  }

  // Verify byte-identical determinism
  assert(
    runsA[0].wispsAfterAttack2 === runsA[1].wispsAfterAttack2 &&
      runsA[1].wispsAfterAttack2 === runsA[2].wispsAfterAttack2,
    'Scenario F: Scenario A must be 100% deterministic across all 3 runs',
  );
  assert(
    runsB[0].wispsAfterAttack2 === runsB[1].wispsAfterAttack2 &&
      runsB[1].wispsAfterAttack2 === runsB[2].wispsAfterAttack2,
    'Scenario F: Scenario B must be 100% deterministic across all 3 runs',
  );
  assert(
    runsB[0].wispsAfterAttack2 > runsA[0].wispsAfterAttack2,
    'Scenario F: Scenario B wisp count must consistently exceed Scenario A',
  );
  console.log('  PASS: Scenario F verified (100% deterministic across 3 independent runs)\n');

  console.log('================================================================');
  console.log('ALL BALANCE MATRIX SCENARIOS (A - F) COMPLETED & VERIFIED 100%');
  console.log('================================================================\n');
}

runBalanceMatrixTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
