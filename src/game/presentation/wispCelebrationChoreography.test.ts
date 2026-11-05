/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveWispCelebrationPose,
  WISP_CELEBRATION_STAGGER_SEC,
} from './wispCelebrationChoreography';

const base = {
  survivorCount: 3,
  totalWispCount: 3,
  reducedMotion: false,
};

test('wisp choreography: survivor staggering is deterministic', () => {
  const first = deriveWispCelebrationPose({
    ...base,
    wispId: 'wisp_ignis',
    elapsedSec: 0,
    survivorIndex: 0,
  });
  const secondBefore = deriveWispCelebrationPose({
    ...base,
    wispId: 'wisp_zephyr',
    elapsedSec: WISP_CELEBRATION_STAGGER_SEC - 0.001,
    survivorIndex: 1,
  });
  const secondAt = deriveWispCelebrationPose({
    ...base,
    wispId: 'wisp_zephyr',
    elapsedSec: WISP_CELEBRATION_STAGGER_SEC,
    survivorIndex: 1,
  });

  assert.equal(first.hasStarted, true);
  assert.equal(secondBefore.hasStarted, false);
  assert.equal(secondAt.hasStarted, true);
});

test('wisp choreography: level-one personalities produce distinct paths', () => {
  const common = {
    ...base,
    elapsedSec: 0.8,
    survivorIndex: 0,
  };

  const ignis = deriveWispCelebrationPose({
    ...common,
    wispId: 'wisp_ignis',
  });
  const zephyr = deriveWispCelebrationPose({
    ...common,
    wispId: 'wisp_zephyr',
  });
  const marinus = deriveWispCelebrationPose({
    ...common,
    wispId: 'wisp_marinus',
  });

  assert.equal(ignis.style, 'IGNIS');
  assert.equal(zephyr.style, 'ZEPHYR');
  assert.equal(marinus.style, 'MARINUS');
  assert.notDeepEqual(
    [ignis.offsetX, ignis.offsetY, ignis.rotationRad],
    [zephyr.offsetX, zephyr.offsetY, zephyr.rotationRad],
  );
  assert.notDeepEqual(
    [zephyr.offsetX, zephyr.offsetY, zephyr.rotationRad],
    [marinus.offsetX, marinus.offsetY, marinus.rotationRad],
  );
  assert.ok(marinus.ringProgress > 0);
});

test('wisp choreography: lone survivor uses restrained displacement', () => {
  const chorus = deriveWispCelebrationPose({
    ...base,
    wispId: 'wisp_ignis',
    elapsedSec: 0.55,
    survivorIndex: 0,
  });
  const lone = deriveWispCelebrationPose({
    ...base,
    wispId: 'wisp_ignis',
    elapsedSec: 0.55,
    survivorIndex: 0,
    survivorCount: 1,
  });

  assert.ok(Math.abs(lone.offsetY) < Math.abs(chorus.offsetY));
  assert.ok(Math.abs(lone.rotationRad) < Math.abs(chorus.rotationRad));
});

test('wisp choreography: reduced motion preserves readability without travel', () => {
  const pose = deriveWispCelebrationPose({
    ...base,
    wispId: 'wisp_zephyr',
    elapsedSec: 0.7,
    survivorIndex: 0,
    reducedMotion: true,
  });

  assert.equal(pose.offsetX, 0);
  assert.equal(pose.rotationRad, 0);
  assert.ok(Math.abs(pose.offsetY) <= 1.5);
  assert.ok(pose.scale >= 0.975 && pose.scale <= 1.025);
  assert.ok(pose.glowMultiplier > 1);
});

test('wisp choreography: timing is clamped and repeatable', () => {
  const input = {
    ...base,
    wispId: 'wisp_marinus',
    elapsedSec: 99,
    survivorIndex: 2,
  };

  const first = deriveWispCelebrationPose(input);
  const second = deriveWispCelebrationPose(input);

  assert.deepEqual(first, second);
  assert.equal(first.progress, 1);
  assert.ok(Number.isFinite(first.offsetX));
  assert.ok(Number.isFinite(first.offsetY));
  assert.ok(Number.isFinite(first.rotationRad));
});
