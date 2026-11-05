/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { isBroadFaceTimberJoint } from '../math/snapSolver';
import { PlacedPiece } from '../types';
import { LevelStore } from './levelStore';

function horizontalBeam(id = 'manual_beam'): PlacedPiece {
  return {
    id,
    type: 'wood_beam',
    position: { x: 0, y: 100 },
    rotation: 0,
    isPrebuilt: false,
  };
}

function support(id: string, x: number): PlacedPiece {
  return {
    id,
    type: 'wood_block',
    position: { x, y: 136 },
    rotation: 0,
    isPrebuilt: false,
  };
}

function createTwoSupportStore(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  const state = store.getState();
  state.pieces = [horizontalBeam(), support('support_a', -24), support('support_b', 24)];
  state.joints = [];
  return store;
}

function activeBeamJoints(store: LevelStore) {
  return store
    .getJointsForPiece('manual_beam')
    .filter((joint) => joint.state !== 'BROKEN');
}

test('Phase B2.1: sequential Manual Bind creates one broad-face seam per action', () => {
  const store = createTwoSupportStore();

  const initialCandidates = store
    .getManualBindCandidates('manual_beam')
    .filter(isBroadFaceTimberJoint);
  assert.deepEqual(
    initialCandidates.map((candidate) => candidate.targetPieceId).sort(),
    ['support_a', 'support_b'],
  );

  const firstBroadIndex = store
    .getManualBindCandidates('manual_beam')
    .findIndex(isBroadFaceTimberJoint);
  assert.ok(firstBroadIndex >= 0);
  const first = store.bindPieceConnection('manual_beam', firstBroadIndex, true);
  assert.ok(first && isBroadFaceTimberJoint(first));
  assert.equal(activeBeamJoints(store).length, 1);

  const remaining = store.getManualBindCandidates('manual_beam');
  const remainingBroad = remaining.filter(isBroadFaceTimberJoint);
  assert.equal(remainingBroad.length, 1);
  assert.notEqual(remainingBroad[0].targetPieceId, first.pieceBId);

  const secondBroadIndex = remaining.findIndex(isBroadFaceTimberJoint);
  const second = store.bindPieceConnection('manual_beam', secondBroadIndex, true);
  assert.ok(second && isBroadFaceTimberJoint(second));
  assert.equal(activeBeamJoints(store).length, 2);
  assert.deepEqual(
    activeBeamJoints(store).map((joint) => joint.pieceBId).sort(),
    ['support_a', 'support_b'],
  );

  assert.equal(
    store.getManualBindCandidates('manual_beam').filter(isBroadFaceTimberJoint).length,
    0,
  );
});

test('Phase B2.1: sequential Manual Bind Undo and Redo restore one seam at a time', () => {
  const store = createTwoSupportStore();

  for (let count = 0; count < 2; count++) {
    const candidates = store.getManualBindCandidates('manual_beam');
    const broadIndex = candidates.findIndex(isBroadFaceTimberJoint);
    assert.ok(broadIndex >= 0);
    assert.ok(store.bindPieceConnection('manual_beam', broadIndex, true));
  }
  assert.equal(activeBeamJoints(store).length, 2);

  assert.equal(store.undo(), true);
  assert.equal(activeBeamJoints(store).length, 1);
  assert.equal(store.getManualBindCandidates('manual_beam').filter(isBroadFaceTimberJoint).length, 1);

  assert.equal(store.undo(), true);
  assert.equal(activeBeamJoints(store).length, 0);
  assert.equal(store.getManualBindCandidates('manual_beam').filter(isBroadFaceTimberJoint).length, 2);

  assert.equal(store.redo(), true);
  assert.equal(activeBeamJoints(store).length, 1);

  assert.equal(store.redo(), true);
  assert.equal(activeBeamJoints(store).length, 2);
  assert.equal(store.getManualBindCandidates('manual_beam').filter(isBroadFaceTimberJoint).length, 0);
});

test('Phase B2.1: repeated Manual Bind cannot duplicate an existing support seam', () => {
  const store = createTwoSupportStore();
  const candidates = store.getManualBindCandidates('manual_beam');
  const broadIndex = candidates.findIndex(isBroadFaceTimberJoint);
  assert.ok(broadIndex >= 0);
  const first = store.bindPieceConnection('manual_beam', broadIndex, true);
  assert.ok(first);

  const sameSupportStillOffered = store
    .getManualBindCandidates('manual_beam')
    .filter(isBroadFaceTimberJoint)
    .some((candidate) => candidate.targetPieceId === first.pieceBId);
  assert.equal(sameSupportStillOffered, false);

  const jointIds = activeBeamJoints(store).map((joint) => joint.jointId);
  assert.equal(new Set(jointIds).size, jointIds.length);
});
