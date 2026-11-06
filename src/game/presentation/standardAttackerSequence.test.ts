/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStandardAttackerSequence } from './standardAttackerSequence';

function derive(overrides: Partial<Parameters<typeof deriveStandardAttackerSequence>[0]> = {}) {
  return deriveStandardAttackerSequence({
    phase: 'INTRO',
    introElapsedSec: 0,
    introDurationSec: 2.2,
    aimingElapsedSec: 0,
    projectileVelocityY: null,
    distanceToTargetPx: null,
    brokenPieceCount: 0,
    crackedPieceCount: 0,
    bullseyeOverrideSelected: false,
    reducedMotion: false,
    ...overrides,
  });
}

test('standard sequence: intro contains arrival, boast, flourish, warmup, and loading', () => {
  assert.equal(derive({ introElapsedSec: 0.1 }).state, 'INTRO_HOP_IN');
  assert.equal(derive({ introElapsedSec: 0.55 }).state, 'PROUD_CHEST_PUFF');
  assert.equal(derive({ introElapsedSec: 1.05 }).state, 'SPARK_FLOURISH');
  assert.equal(derive({ introElapsedSec: 1.5 }).state, 'WARMUP_HOP');
  assert.equal(derive({ introElapsedSec: 2.0 }).state, 'LOAD_INTO_CRADLE');
});

test('standard sequence: bullseye acknowledgment replaces only warmup beat', () => {
  assert.equal(
    derive({ introElapsedSec: 1.5, bullseyeOverrideSelected: true }).state,
    'BULLSEYE_ACK_OFFENDED',
  );
  assert.equal(
    derive({ introElapsedSec: 1.05, bullseyeOverrideSelected: true }).state,
    'SPARK_FLOURISH',
  );
});

test('standard sequence: reduced motion removes hopping and flourish travel', () => {
  assert.equal(derive({ introElapsedSec: 0.1, reducedMotion: true }).state, 'PROUD_CHEST_PUFF');
  assert.equal(derive({ introElapsedSec: 2.0, reducedMotion: true }).state, 'LOAD_INTO_CRADLE');
});

test('standard sequence: aiming escalates strain into launch anticipation', () => {
  const early = derive({ phase: 'AIMING', aimingElapsedSec: 0.2 });
  const late = derive({ phase: 'AIMING', aimingElapsedSec: 1.0 });
  assert.equal(early.state, 'AIM_LEAN_FORWARD');
  assert.equal(late.state, 'LAUNCH_ANTICIPATION');
  assert.ok(late.launcherStrain > early.launcherStrain);
});

test('standard sequence: ascent, apex, descent, and impact brace are distinct', () => {
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: -4, distanceToTargetPx: 400 }).state, 'FLIGHT_CONFIDENT');
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: 0, distanceToTargetPx: 400 }).state, 'APEX_SURPRISE');
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: 4, distanceToTargetPx: 400 }).state, 'DESCENT_PANIC');
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: 4, distanceToTargetPx: 120 }).state, 'IMPACT_BRACE');
});

test('standard sequence: broken structure produces smug outcome', () => {
  assert.equal(derive({ phase: 'RESOLVED', brokenPieceCount: 1 }).state, 'SMUG_CELEBRATION');
});

test('standard sequence: cracked-only result produces defensive shrug', () => {
  assert.equal(derive({ phase: 'RESOLVED', crackedPieceCount: 1 }).state, 'WEAK_HIT_SHRUG');
});

test('standard sequence: no damage produces embarrassed miss', () => {
  assert.equal(derive({ phase: 'RESOLVED' }).state, 'EMBARRASSED_MISS');
});

test('standard sequence: invalid timing input remains finite and deterministic', () => {
  const result = derive({ introElapsedSec: Number.NaN, introDurationSec: 0 });
  assert.equal(result.state, 'INTRO_HOP_IN');
  assert.equal(Number.isFinite(result.launcherStrain), true);
});
