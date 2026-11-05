/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveIncomingWispWarning } from './wispIncomingWarning';

const wispPosition = { x: 300, y: 580 };

test('incoming warning: distant approaching projectile is tracked without panic', () => {
  const result = deriveIncomingWispWarning({
    wispPosition,
    projectilePosition: { x: 0, y: 420 },
    projectileVelocity: { x: 4, y: 1.2 },
    tendency: 'BRAVE',
  });
  assert.equal(result.isApproaching, true);
  assert.equal(result.reactionState, 'WATCH_TRAJECTORY');
  assert.deepEqual(result.lookTarget, { x: 0, y: 420 });
});

test('incoming warning: brave wisp becomes alert before bracing', () => {
  const result = deriveIncomingWispWarning({
    wispPosition,
    projectilePosition: { x: 80, y: 520 },
    projectileVelocity: { x: 4, y: 0.6 },
    tendency: 'BRAVE',
  });
  assert.equal(result.reactionState, 'ALARMED_ALERT');
  assert.ok(result.closingSpeed > 0);
  assert.ok(result.timeToClosestApproachSec !== null);
});

test('incoming warning: nervous wisp cowers under imminent approach', () => {
  const result = deriveIncomingWispWarning({
    wispPosition,
    projectilePosition: { x: 175, y: 560 },
    projectileVelocity: { x: 5, y: 0.4 },
    tendency: 'NERVOUS',
  });
  assert.equal(result.reactionState, 'COWER');
});

test('incoming warning: non-nervous wisp braces under imminent approach', () => {
  const result = deriveIncomingWispWarning({
    wispPosition,
    projectilePosition: { x: 175, y: 560 },
    projectileVelocity: { x: 5, y: 0.4 },
    tendency: 'EASILY_DISTRACTED',
  });
  assert.equal(result.reactionState, 'BRACE_FOR_IMPACT');
});

test('incoming warning: nearby projectile moving away does not create a false brace', () => {
  const result = deriveIncomingWispWarning({
    wispPosition,
    projectilePosition: { x: 200, y: 570 },
    projectileVelocity: { x: -5, y: 0 },
    tendency: 'NERVOUS',
  });
  assert.equal(result.isApproaching, false);
  assert.equal(result.reactionState, 'WATCH_TRAJECTORY');
});

test('incoming warning: near pass outside the wisp corridor stays observational', () => {
  const result = deriveIncomingWispWarning({
    wispPosition,
    projectilePosition: { x: 120, y: 300 },
    projectileVelocity: { x: 5, y: 0 },
    tendency: 'NERVOUS',
  });
  assert.equal(result.isApproaching, true);
  assert.ok(result.closestApproachDistance > 190);
  assert.equal(result.reactionState, 'WATCH_TRAJECTORY');
});

test('incoming warning: invalid vectors are sanitized deterministically', () => {
  const input = {
    wispPosition,
    projectilePosition: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
    projectileVelocity: { x: Number.NaN, y: Number.NEGATIVE_INFINITY },
    tendency: 'CURIOUS' as const,
  };
  const first = deriveIncomingWispWarning(input);
  const second = deriveIncomingWispWarning(input);
  assert.deepEqual(first, second);
  assert.ok(Number.isFinite(first.distance));
  assert.ok(Number.isFinite(first.closestApproachDistance));
});
