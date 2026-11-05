/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { TimberJoint } from '../types';
import { getTransformedSeamDecorationStyle } from './renderGizmos';

function joint(overrides: Partial<TimberJoint> = {}): TimberJoint {
  return {
    jointId: 'joint_1', jointType: 'TIMBER_FACE', pieceAId: 'beam_1', pieceBId: 'block_1',
    socketAId: 'beam_1_SIDE_BOTTOM_CENTER', socketBId: 'block_1_TOP_EDGE',
    localAnchorA: { x: 0, y: 12 }, localAnchorB: { x: 0, y: -24 },
    worldPosition: { x: 0, y: 112 }, restAngle: 0, restSeparation: 0,
    strengthProfile: 'TIMBER_FACE', state: 'INTACT', currentStress: 0,
    maxStressObserved: 0, createdInPhase: 'BUILD', ...overrides,
  };
}

test('C1.2 seam depth: prototype seams remain flat', () => {
  const style = getTransformedSeamDecorationStyle(joint(), 0);
  assert.equal(style.depth.alpha, 0);
  assert.deepEqual(style.depth.depthVector, { x: 0, y: 0 });
  assert.equal(style.depth.hardwareLiftPx, 0);
});

test('C1.2 seam depth: broad-face clamps use the deeper hardware profile', () => {
  const broad = getTransformedSeamDecorationStyle(joint(), 1);
  assert.equal(broad.family, 'BROAD_FACE_CLAMP');
  assert.deepEqual(broad.depth.depthVector, { x: 3.3, y: -3.3 });
  assert.equal(broad.depth.hardwareLiftPx, 3.6);
});

test('C1.2 seam depth: endpoint shoes remain shallower than broad-face clamps', () => {
  const broad = getTransformedSeamDecorationStyle(joint(), 1);
  const endpoint = getTransformedSeamDecorationStyle(
    joint({ socketAId: 'beam_1_END_A_CENTER', socketBId: 'block_1_LEFT_EDGE' }), 1,
  );
  assert.equal(endpoint.family, 'ENDPOINT_SHOE');
  assert.deepEqual(endpoint.depth.depthVector, { x: 2.7, y: -2.7 });
  assert.ok(endpoint.depth.hardwareLiftPx < broad.depth.hardwareLiftPx);
});

test('C1.2 seam depth: transition progress scales hardware extrusion', () => {
  const half = getTransformedSeamDecorationStyle(joint(), 0.5);
  assert.deepEqual(half.depth.depthVector, { x: 1.65, y: -1.65 });
  assert.equal(half.depth.hardwareLiftPx, 1.8);
});

test('C1.2 seam depth: broken fittings preserve family and select damaged depth', () => {
  const broken = getTransformedSeamDecorationStyle(joint({ state: 'BROKEN' }), 1);
  assert.equal(broken.family, 'BROAD_FACE_CLAMP');
  assert.equal(broken.persistentBrokenScar, true);
  assert.equal(broken.depth.damagedHardware, true);
});
