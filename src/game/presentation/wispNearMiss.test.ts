/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceWispNearMissTracker,
  createWispNearMissTrackerState,
  WISP_NEAR_MISS_HOLD_SEC,
} from './wispNearMiss';

const wispPosition = { x: 300, y: 580 };

function frame(
  state: ReturnType<typeof createWispNearMissTrackerState>,
  projectilePosition: { x: number; y: number } | null,
  projectileVelocity: { x: number; y: number } | null,
  overrides: Partial<Parameters<typeof advanceWispNearMissTracker>[0]> = {},
) {
  return advanceWispNearMissTracker({
    state,
    deltaSec: 1 / 60,
    wispPosition,
    projectilePosition,
    projectileVelocity,
    projectileHasImpacted: false,
    wispWasContacted: false,
    wispIsDispersed: false,
    ...overrides,
  });
}

test('near miss: approaching projectile does not trigger before closest approach', () => {
  const result = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 560 },
    { x: 5, y: 0 },
  );
  assert.equal(result.confirmedThisFrame, false);
  assert.equal(result.state.wasApproaching, true);
});

test('near miss: safe close pass triggers only after closest approach is crossed', () => {
  const approaching = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 560 },
    { x: 5, y: 0 },
  );
  const passed = frame(
    approaching.state,
    { x: 340, y: 560 },
    { x: 5, y: 0 },
  );
  assert.equal(passed.confirmedThisFrame, true);
  assert.equal(passed.reactionActive, true);
  assert.equal(passed.state.reactionRemainingSec, WISP_NEAR_MISS_HOLD_SEC);
});

test('near miss: distant pass does not trigger', () => {
  const approaching = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 300 },
    { x: 5, y: 0 },
  );
  const passed = frame(
    approaching.state,
    { x: 340, y: 300 },
    { x: 5, y: 0 },
  );
  assert.equal(passed.confirmedThisFrame, false);
  assert.equal(passed.reactionActive, false);
});

test('near miss: direct wisp contact suppresses the reaction', () => {
  const approaching = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 580 },
    { x: 5, y: 0 },
  );
  const contacted = frame(
    approaching.state,
    { x: 340, y: 580 },
    { x: 5, y: 0 },
    { wispWasContacted: true },
  );
  assert.equal(contacted.confirmedThisFrame, false);
  assert.equal(contacted.reactionActive, false);
});

test('near miss: structural impact before passage suppresses confirmation', () => {
  const approaching = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 560 },
    { x: 5, y: 0 },
  );
  const impacted = frame(
    approaching.state,
    { x: 280, y: 560 },
    { x: -2, y: 0 },
    { projectileHasImpacted: true },
  );
  assert.equal(impacted.confirmedThisFrame, false);
});

test('near miss: one pass confirms at most once', () => {
  const approaching = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 560 },
    { x: 5, y: 0 },
  );
  const passed = frame(approaching.state, { x: 340, y: 560 }, { x: 5, y: 0 });
  const later = frame(passed.state, { x: 400, y: 560 }, { x: 5, y: 0 });
  assert.equal(passed.confirmedThisFrame, true);
  assert.equal(later.confirmedThisFrame, false);
  assert.equal(later.reactionActive, true);
});

test('near miss: reaction expires deterministically', () => {
  const activeState = {
    ...createWispNearMissTrackerState(),
    hasConfirmedNearMiss: true,
    reactionRemainingSec: 0.1,
  };
  const result = frame(activeState, null, null, { deltaSec: 0.11 });
  assert.equal(result.reactionActive, false);
  assert.equal(result.state.reactionRemainingSec, 0);
});

test('near miss: dispersed wisp cannot react', () => {
  const result = frame(
    createWispNearMissTrackerState(),
    { x: 220, y: 560 },
    { x: 5, y: 0 },
    { wispIsDispersed: true },
  );
  assert.equal(result.confirmedThisFrame, false);
  assert.equal(result.reactionActive, false);
});
