/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverSecondaryBroadFaceSeams, isBroadFaceTimberJoint } from '../math/snapSolver';
import { PlacedPiece, TimberJoint } from '../types';
import { LevelStore } from '../state/levelStore';

function beam(): PlacedPiece {
  return {
    id: 'display_beam',
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

function createStore(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  const activeBeam = beam();
  const supports = [support('support_b', 48), support('support_a', -48)];
  store.getState().pieces = [activeBeam, ...supports];
  store.getState().joints = [];
  const proposals = discoverSecondaryBroadFaceSeams({
    activePieceId: activeBeam.id,
    activeType: activeBeam.type,
    finalizedPos: activeBeam.position,
    finalizedRot: activeBeam.rotation,
    activeIsPrebuilt: false,
    validPieces: supports,
    proposedTimberJoints: [],
    preservedJoints: [],
  });
  for (const proposal of proposals) {
    assert.ok(store.createOrUpdateTimberJointFromProposal(activeBeam.id, proposal));
  }
  return store;
}

function markerSignature(joints: readonly TimberJoint[]) {
  return joints
    .filter((joint) => joint.state !== 'BROKEN')
    .map((joint) => ({
      jointId: joint.jointId,
      state: joint.state,
      x: joint.worldPosition.x,
      y: joint.worldPosition.y,
    }))
    .sort((a, b) => a.jointId.localeCompare(b.jointId));
}

test('Phase B5: selected piece reports two active logical broad-face bindings', () => {
  const store = createStore();
  const active = store.getJointsForPiece('display_beam');

  assert.equal(active.length, 2);
  assert.equal(active.every(isBroadFaceTimberJoint), true);
  assert.equal(new Set(active.map((joint) => joint.jointId)).size, 2);
});

test('Phase B5: strained seams remain active while broken seams leave the BOUND count', () => {
  const store = createStore();
  const all = store.getJointsForPiece('display_beam', true);
  all[0].state = 'STRAINED';
  all[1].state = 'BROKEN';

  const active = store.getJointsForPiece('display_beam');
  assert.equal(active.length, 1);
  assert.equal(active[0].state, 'STRAINED');
  assert.equal(store.getJointsForPiece('display_beam', true).length, 2);
});

test('Phase B5: each logical seam produces one deterministic marker identity', () => {
  const store = createStore();
  const forward = markerSignature(store.getJointsForPiece('display_beam', true));
  const reverse = markerSignature([...store.getJointsForPiece('display_beam', true)].reverse());

  assert.deepEqual(reverse, forward);
  assert.equal(new Set(forward.map((marker) => marker.jointId)).size, forward.length);
});

test('Phase B5: markers remain anchored at distinct finite-overlap seam midpoints', () => {
  const store = createStore();
  const markers = markerSignature(store.getJointsForPiece('display_beam'));

  assert.deepEqual(markers.map((marker) => marker.x).sort((a, b) => a - b), [-48, 48]);
  assert.deepEqual(markers.map((marker) => marker.y), [112, 112]);
});

test('Phase B5: broken seam markers are excluded while surviving markers remain stable', () => {
  const store = createStore();
  const all = store.getJointsForPiece('display_beam', true);
  const survivingId = all[0].jointId;
  const survivingPosition = { ...all[0].worldPosition };
  all[1].state = 'BROKEN';

  const visible = markerSignature(store.getJointsForPiece('display_beam', true));
  assert.deepEqual(visible, [
    {
      jointId: survivingId,
      state: 'INTACT',
      x: survivingPosition.x,
      y: survivingPosition.y,
    },
  ]);
});
