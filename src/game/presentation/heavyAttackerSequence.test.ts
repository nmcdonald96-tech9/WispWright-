/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveHeavyAttackerSequence } from './heavyAttackerSequence';

function derive(overrides: Partial<Parameters<typeof deriveHeavyAttackerSequence>[0]> = {}) {
  return deriveHeavyAttackerSequence({
    phase: 'INTRO', introElapsedSec: 0, introDurationSec: 3.4, aimingElapsedSec: 0,
    projectileVelocityY: null, distanceToTargetPx: null, brokenPieceCount: 0,
    crackedPieceCount: 0, bullseyeOverrideSelected: false, reducedMotion: false,
    ...overrides,
  });
}

test('heavy sequence: intro contains entrance, thump, creak-load, mount, and ready pose', () => {
  assert.equal(derive({ introElapsedSec: 0.1 }).state, 'HEAVY_STEP_IN');
  assert.equal(derive({ introElapsedSec: 0.95 }).state, 'GROUND_THUMP');
  assert.equal(derive({ introElapsedSec: 1.65 }).state, 'LAUNCHER_CREAK_LOAD');
  assert.equal(derive({ introElapsedSec: 2.3 }).state, 'ASSISTED_MOUNT');
  assert.equal(derive({ introElapsedSec: 3.0 }).state, 'HEAVY_READY_POSE');
});

test('heavy sequence: bullseye acknowledgment replaces only creak-load beat', () => {
  assert.equal(derive({ introElapsedSec: 1.65, bullseyeOverrideSelected: true }).state, 'BULLSEYE_ACK_DELIGHTED');
  assert.equal(derive({ introElapsedSec: 2.3, bullseyeOverrideSelected: true }).state, 'ASSISTED_MOUNT');
});

test('heavy sequence: reduced motion removes traveling entrance', () => {
  assert.equal(derive({ introElapsedSec: 0.1, reducedMotion: true }).state, 'GROUND_THUMP');
  assert.equal(derive({ introElapsedSec: 3.0, reducedMotion: true }).state, 'HEAVY_READY_POSE');
});

test('heavy sequence: exposes deterministic progress within each intro beat', () => {
  const earlyMount = derive({ introElapsedSec: 2.05 });
  const lateMount = derive({ introElapsedSec: 2.6 });
  assert.equal(earlyMount.state, 'ASSISTED_MOUNT');
  assert.equal(lateMount.state, 'ASSISTED_MOUNT');
  assert.ok(lateMount.beatProgress > earlyMount.beatProgress);
  assert.ok(earlyMount.introProgress < lateMount.introProgress);
});

test('heavy sequence: aiming escalates from compression to full strain', () => {
  const early = derive({ phase: 'AIMING', aimingElapsedSec: 0.2 });
  const late = derive({ phase: 'AIMING', aimingElapsedSec: 1.0 });
  assert.equal(early.state, 'DEEP_COMPRESSION');
  assert.equal(late.state, 'LAUNCHER_FULL_STRAIN');
  assert.ok(late.launcherStrain > early.launcherStrain);
  assert.ok(late.launcherStrain >= 0.95);
});

test('heavy sequence: ascent, apex, descent, and impact brace are distinct', () => {
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: -4, distanceToTargetPx: 400 }).state, 'RELEASE_SURPRISE');
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: 0, distanceToTargetPx: 400 }).state, 'AIRBORNE_DELIGHT');
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: 4, distanceToTargetPx: 400 }).state, 'HEAVY_FLIGHT_MOMENTUM');
  assert.equal(derive({ phase: 'FLIGHT', projectileVelocityY: 4, distanceToTargetPx: 120 }).state, 'HEAVY_IMPACT_BRACE');
});

test('heavy sequence: broken structure produces triumph', () => {
  assert.equal(derive({ phase: 'RESOLVED', brokenPieceCount: 1 }).state, 'POST_IMPACT_TRIUMPH');
});

test('heavy sequence: cracked-only result produces grumble', () => {
  assert.equal(derive({ phase: 'RESOLVED', crackedPieceCount: 1 }).state, 'WEAK_HIT_GRUMBLE');
});

test('heavy sequence: no damage produces stunned outcome', () => {
  assert.equal(derive({ phase: 'RESOLVED' }).state, 'POST_IMPACT_STUNNED');
});

test('heavy sequence: invalid timing remains finite and deterministic', () => {
  const result = derive({ introElapsedSec: Number.NaN, introDurationSec: 0 });
  assert.equal(result.state, 'HEAVY_STEP_IN');
  assert.equal(Number.isFinite(result.launcherStrain), true);
});
