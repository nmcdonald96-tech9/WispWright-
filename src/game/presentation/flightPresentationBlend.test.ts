/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveFlightPresentationBlend } from './flightPresentationBlend';

test('flight blend: authoritative velocity yields distinct smooth phases', () => {
  assert.equal(deriveFlightPresentationBlend({ projectileVelocityY: -5, distanceToTargetPx: 400, deltaSec: 0.16, reducedMotion: false }).phase, 'ASCENT');
  assert.equal(deriveFlightPresentationBlend({ projectileVelocityY: 0, distanceToTargetPx: 400, deltaSec: 0.16, reducedMotion: false }).phase, 'APEX');
  assert.equal(deriveFlightPresentationBlend({ projectileVelocityY: 5, distanceToTargetPx: 400, deltaSec: 0.16, reducedMotion: false }).phase, 'DESCENT');
});

test('flight blend: approach overrides pose without changing position', () => {
  const result = deriveFlightPresentationBlend({ projectileVelocityY: 4, distanceToTargetPx: 120, deltaSec: 0.16, reducedMotion: false });
  assert.equal(result.phase, 'FINAL_APPROACH');
  assert.ok(result.approachWeight > 0.8);
});

test('flight blend: apex weight eases instead of snapping', () => {
  const result = deriveFlightPresentationBlend({ projectileVelocityY: 0, distanceToTargetPx: 400, previousApexBlend: 0, deltaSec: 0.016, reducedMotion: false });
  assert.ok(result.apexWeight > 0 && result.apexWeight < 1);
});

test('flight blend: weights remain normalized and finite', () => {
  const result = deriveFlightPresentationBlend({ projectileVelocityY: Number.NaN, distanceToTargetPx: null, deltaSec: Number.NaN, reducedMotion: false });
  const total = result.ascentWeight + result.apexWeight + result.descentWeight;
  assert.ok(Math.abs(total - 1) < 0.0001);
  assert.ok(Number.isFinite(result.visualPitchRad));
});

test('flight blend: reduced motion limits pitch and trail intensity', () => {
  const full = deriveFlightPresentationBlend({ projectileVelocityY: 6, distanceToTargetPx: 350, deltaSec: 0.16, reducedMotion: false });
  const reduced = deriveFlightPresentationBlend({ projectileVelocityY: 6, distanceToTargetPx: 350, deltaSec: 0.16, reducedMotion: true });
  assert.ok(Math.abs(reduced.visualPitchRad) < Math.abs(full.visualPitchRad));
  assert.ok(reduced.trailScale < full.trailScale);
});
