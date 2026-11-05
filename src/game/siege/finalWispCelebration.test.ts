/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceFinalWispCelebration,
  FINAL_WISP_ANTICIPATION_SEC,
  FINAL_WISP_CELEBRATION_SEC,
  startFinalWispCelebration,
} from './finalWispCelebration';

test('final celebration: defeat skips celebration', () => {
  assert.equal(startFinalWispCelebration(0, 3).phase, 'COMPLETE');
});

test('final celebration: survivors begin with anticipation', () => {
  const state = startFinalWispCelebration(3, 3);
  assert.equal(state.phase, 'ANTICIPATION');
  assert.equal(state.fullChorus, true);
});

test('final celebration: anticipation must complete before chorus', () => {
  let state = startFinalWispCelebration(3, 3);
  state = advanceFinalWispCelebration(state, FINAL_WISP_ANTICIPATION_SEC - 0.01);
  assert.equal(state.phase, 'ANTICIPATION');
  state = advanceFinalWispCelebration(state, 0.01);
  assert.equal(state.phase, 'CELEBRATING');
});

test('final celebration: results cannot advance before full celebration duration', () => {
  let state = startFinalWispCelebration(3, 3);
  state = advanceFinalWispCelebration(state, FINAL_WISP_ANTICIPATION_SEC);
  state = advanceFinalWispCelebration(state, FINAL_WISP_CELEBRATION_SEC - 0.01);
  assert.equal(state.phase, 'CELEBRATING');
  state = advanceFinalWispCelebration(state, 0.01);
  assert.equal(state.phase, 'COMPLETE');
});

test('final celebration: partial survival is not a full chorus', () => {
  const state = startFinalWispCelebration(1, 3);
  assert.equal(state.phase, 'ANTICIPATION');
  assert.equal(state.fullChorus, false);
  assert.equal(state.survivingWispCount, 1);
});

test('final celebration: negative frame delta cannot advance the sequence', () => {
  const state = startFinalWispCelebration(2, 3);
  assert.deepEqual(advanceFinalWispCelebration(state, -1), state);
});
