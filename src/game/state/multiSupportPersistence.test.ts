/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { PhysicsBridge } from '../physics/physicsBridge';
import { discoverSecondaryBroadFaceSeams, isBroadFaceTimberJoint } from '../math/snapSolver';
import { PlacedPiece, TimberJoint } from '../types';
import { LevelStore } from './levelStore';

function beam(): PlacedPiece {
  return {
    id: 'persist_beam',
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
  const activeBeam = beam();
  const a = support('support_a', -24);
  const b = support('support_b', 24);
  const state = store.getState();
  state.pieces = [activeBeam, a, b];
  state.joints = [];

  const proposals = discoverSecondaryBroadFaceSeams({
    activePieceId: activeBeam.id,
    activeType: activeBeam.type,
    finalizedPos: activeBeam.position,
    finalizedRot: activeBeam.rotation,
    activeIsPrebuilt: false,
    validPieces: [a, b],
    proposedTimberJoints: [],
    preservedJoints: [],
  });
  assert.equal(proposals.length, 2);
  for (const proposal of proposals) {
    assert.ok(store.createOrUpdateTimberJointFromProposal(activeBeam.id, proposal));
  }
  return store;
}

function broadFaceJoints(store: LevelStore): TimberJoint[] {
  return store
    .getJointsForPiece('persist_beam', true)
    .filter(isBroadFaceTimberJoint)
    .sort((a, b) => a.jointId.localeCompare(b.jointId));
}

function graphSignature(joints: readonly TimberJoint[]) {
  return joints
    .map((joint) => ({
      jointId: joint.jointId,
      pair: [joint.pieceAId, joint.pieceBId].sort(),
      socketAId: joint.socketAId,
      socketBId: joint.socketBId,
      localAnchorA: joint.localAnchorA,
      localAnchorB: joint.localAnchorB,
      worldPosition: joint.worldPosition,
      canonicalRelationship: joint.canonicalRelationship,
      state: joint.state,
    }))
    .sort((a, b) => a.jointId.localeCompare(b.jointId));
}

test('Phase B2.3: pre-test snapshot restores the exact plural seam graph', () => {
  const store = createTwoSupportStore();
  const expected = graphSignature(broadFaceJoints(store));
  store.captureSnapshot();

  const live = store.getState();
  live.pieces.find((piece) => piece.id === 'persist_beam')!.position.x = 40;
  live.joints = [
    {
      ...live.joints![0],
      localAnchorA: { x: 999, y: 999 },
      worldPosition: { x: 999, y: 999 },
    },
  ];

  assert.equal(store.restorePreTestSnapshot(), true);
  assert.deepEqual(graphSignature(broadFaceJoints(store)), expected);
  assert.equal(new Set(broadFaceJoints(store).map((joint) => joint.jointId)).size, 2);
});

test('Phase B2.3: Retry Design restores the exact canonical plural seam graph', () => {
  const store = createTwoSupportStore();
  const expected = graphSignature(broadFaceJoints(store));
  store.saveNamedSnapshot('INITIAL_DESIGN');

  const live = store.getState();
  live.joints = [live.joints![0]];
  live.pieces.find((piece) => piece.id === 'persist_beam')!.position.x = 60;

  assert.equal(store.restoreForRetryDesign(), true);
  assert.deepEqual(graphSignature(broadFaceJoints(store)), expected);
  assert.deepEqual(
    store.getState().pieces.find((piece) => piece.id === 'persist_beam')!.position,
    { x: 0, y: 100 },
  );
});

test('Phase B2.3: repeated Retry Design restoration is idempotent', () => {
  const store = createTwoSupportStore();
  store.saveNamedSnapshot('INITIAL_DESIGN');
  const expectedGraph = graphSignature(broadFaceJoints(store));
  const expectedPosition = {
    ...store.getState().pieces.find((piece) => piece.id === 'persist_beam')!.position,
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    store.getState().joints!.push({ ...store.getState().joints![0], jointId: `duplicate_${attempt}` });
    assert.equal(store.restoreForRetryDesign(), true);
    assert.deepEqual(graphSignature(broadFaceJoints(store)), expectedGraph);
    assert.deepEqual(
      store.getState().pieces.find((piece) => piece.id === 'persist_beam')!.position,
      expectedPosition,
    );
  }
});

test('Phase B2.3: repeated physics construction creates one active constraint per seam', () => {
  const store = createTwoSupportStore();
  store.saveNamedSnapshot('INITIAL_DESIGN');
  assert.equal(store.restoreForRetryDesign(), true);

  const bridgeA = new PhysicsBridge(store.getState());
  const bridgeB = new PhysicsBridge(store.getState());
  for (const bridge of [bridgeA, bridgeB]) {
    const joints = bridge.getSimulatedJoints().filter((joint) => joint.state !== 'BROKEN');
    assert.equal(bridge.diagnostics.activeTimberJointCount, 2);
    assert.equal(joints.length, 2);
    assert.equal(new Set(joints.map((joint) => joint.jointId)).size, 2);
  }
});

test('Phase B2.3: pre-test snapshot losslessly restores a captured broken seam', () => {
  const store = createTwoSupportStore();
  const broken = broadFaceJoints(store)[1];
  broken.state = 'BROKEN';
  broken.currentStress = 4.25;
  broken.maxStressObserved = 8.5;
  broken.failureReason = 'TEST_BREAK';
  broken.brokenInPhase = 'STABILITY_TEST';
  store.captureSnapshot();

  broken.state = 'INTACT';
  broken.currentStress = 0;
  broken.failureReason = null;
  assert.equal(store.restorePreTestSnapshot(), true);

  const restored = broadFaceJoints(store).find((joint) => joint.jointId === broken.jointId)!;
  assert.equal(restored.state, 'BROKEN');
  assert.equal(restored.currentStress, 4.25);
  assert.equal(restored.maxStressObserved, 8.5);
  assert.equal(restored.failureReason, 'TEST_BREAK');
  assert.equal(restored.brokenInPhase, 'STABILITY_TEST');
});

test('Phase B2.3: Retry Design preserves identity while clearing damage diagnostics', () => {
  const store = createTwoSupportStore();
  store.saveNamedSnapshot('INITIAL_DESIGN');
  const expectedIdentity = graphSignature(broadFaceJoints(store)).map(({ state: _state, ...rest }) => rest);

  for (const joint of broadFaceJoints(store)) {
    joint.state = 'BROKEN';
    joint.currentStress = 5;
    joint.maxStressObserved = 10;
    joint.failureReason = 'TEST_DAMAGE';
    joint.brokenInPhase = 'ATTACK_1';
    joint.brokenByAttackId = 'attack_test';
  }

  assert.equal(store.restoreForRetryDesign(), true);
  const restored = broadFaceJoints(store);
  assert.deepEqual(
    graphSignature(restored).map(({ state: _state, ...rest }) => rest),
    expectedIdentity,
  );
  for (const joint of restored) {
    assert.equal(joint.state, 'INTACT');
    assert.equal(joint.currentStress, 0);
    assert.equal(joint.maxStressObserved, 0);
    assert.equal(joint.failureReason, null);
    assert.equal(joint.brokenInPhase, null);
    assert.equal(joint.brokenByAttackId, null);
  }
});
