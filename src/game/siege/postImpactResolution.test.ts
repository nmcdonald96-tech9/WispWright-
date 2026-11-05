/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advancePostImpactResolution,
  createPostImpactResolutionState,
  FINAL_POST_IMPACT_TIMING,
  ORDINARY_POST_IMPACT_TIMING,
} from './postImpactResolution';

function advance(
  seconds: number,
  settled: boolean,
  finalAttack = false,
  state = createPostImpactResolutionState(),
) {
  let current = state;
  const timing = finalAttack ? FINAL_POST_IMPACT_TIMING : ORDINARY_POST_IMPACT_TIMING;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.25) {
    current = advancePostImpactResolution({
      state: current,
      dt: Math.min(0.25, seconds - elapsed),
      stabilitySettled: settled,
      fallenCount: 0,
      brokenJointCount: 0,
      timing,
    });
  }
  return current;
}

test('post-impact gate: ordinary attack cannot resolve before 2.5 seconds', () => {
  const state = advance(2.25, true);
  assert.equal(state.readyToResolve, false);
});

test('post-impact gate: final attack cannot resolve before 3.5 seconds', () => {
  const state = advance(3.25, true, true);
  assert.equal(state.readyToResolve, false);
});

test('post-impact gate: stable final attack resolves after observation and sustained settlement', () => {
  const state = advance(3.5, true, true);
  assert.equal(state.readyToResolve, true);
  assert.equal(state.resolvedByTimeout, false);
  assert.ok(state.continuouslySettledSec >= 1.25);
});

test('post-impact gate: renewed motion resets the continuous settlement window', () => {
  let state = advance(3.25, true, true);
  state = advancePostImpactResolution({
    state, dt: 0.25, stabilitySettled: false,
    fallenCount: 0, brokenJointCount: 0,
    timing: FINAL_POST_IMPACT_TIMING,
  });
  assert.equal(state.continuouslySettledSec, 0);
  assert.equal(state.readyToResolve, false);
});

test('post-impact gate: delayed joint break resets settlement even during a quiet report', () => {
  let state = advance(3.25, true, true);
  state = advancePostImpactResolution({
    state, dt: 0.25, stabilitySettled: true,
    fallenCount: 0, brokenJointCount: 1,
    timing: FINAL_POST_IMPACT_TIMING,
  });
  assert.equal(state.continuouslySettledSec, 0);
  assert.equal(state.readyToResolve, false);
});

test('post-impact gate: fallen-piece count change resets settlement', () => {
  let state = advance(2.25, true, false);
  state = advancePostImpactResolution({
    state, dt: 0.25, stabilitySettled: true,
    fallenCount: 1, brokenJointCount: 0,
    timing: ORDINARY_POST_IMPACT_TIMING,
  });
  assert.equal(state.continuouslySettledSec, 0);
  assert.equal(state.readyToResolve, false);
});

test('post-impact gate: ordinary timeout prevents an endless unresolved structure', () => {
  const state = advance(8, false);
  assert.equal(state.readyToResolve, true);
  assert.equal(state.resolvedByTimeout, true);
});

test('post-impact gate: final timeout allows ten seconds for delayed collapse', () => {
  const before = advance(9.75, false, true);
  const atLimit = advance(0.25, false, true, before);
  assert.equal(before.readyToResolve, false);
  assert.equal(atLimit.readyToResolve, true);
  assert.equal(atLimit.resolvedByTimeout, true);
});
