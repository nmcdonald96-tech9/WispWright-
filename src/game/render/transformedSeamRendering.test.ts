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

test('C1 visible seams: prototype mode keeps transformed hardware invisible', () => {
  const style = getTransformedSeamDecorationStyle(joint(), 0);
  assert.equal(style.alpha, 0);
  assert.equal(style.family, 'BROAD_FACE_CLAMP');
});

test('C1 visible seams: broad-face and endpoint relationships use distinct hardware', () => {
  const broad = getTransformedSeamDecorationStyle(joint(), 1);
  const endpoint = getTransformedSeamDecorationStyle(
    joint({ socketAId: 'beam_1_END_A_CENTER', socketBId: 'block_1_LEFT_EDGE' }), 1,
  );
  assert.equal(broad.family, 'BROAD_FACE_CLAMP');
  assert.equal(endpoint.family, 'ENDPOINT_SHOE');
});

test('C1 visible seams: strained seams retain active hardware and stress intensity', () => {
  const style = getTransformedSeamDecorationStyle(
    joint({ state: 'STRAINED', currentStress: 8 }), 1,
  );
  assert.equal(style.persistentBrokenScar, false);
  assert.equal(style.stressAlpha, 0.8);
});

test('C1 visible seams: broken seams request persistent scar presentation', () => {
  const style = getTransformedSeamDecorationStyle(joint({ state: 'BROKEN' }), 1);
  assert.equal(style.persistentBrokenScar, true);
  assert.equal(style.alpha, 1);
});

test('C1 visible seams: transition opacity follows presentation progress', () => {
  assert.equal(getTransformedSeamDecorationStyle(joint(), 0.35).alpha, 0.35);
});
