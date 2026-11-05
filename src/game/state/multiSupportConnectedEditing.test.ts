/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoverSecondaryBroadFaceSeams,
  evaluateJointsForPieceTransform,
  isBroadFaceTimberJoint,
} from '../math/snapSolver';
import { PlacedPiece, ProposedTimberJoint, TimberJoint } from '../types';
import { LevelStore } from './levelStore';

function beam(position = { x: 0, y: 100 }): PlacedPiece {
  return {
    id: 'edit_beam',
    type: 'wood_beam',
    position: { ...position },
    rotation: 0,
    isPrebuilt: false,
  };
}

function support(id: string, x: number, y = 136): PlacedPiece {
  return {
    id,
    type: 'wood_block',
    position: { x, y },
    rotation: 0,
    isPrebuilt: false,
  };
}

function broadFaceProposals(
  activeBeam: PlacedPiece,
  supports: readonly PlacedPiece[],
): ProposedTimberJoint[] {
  return discoverSecondaryBroadFaceSeams({
    activePieceId: activeBeam.id,
    activeType: activeBeam.type,
    finalizedPos: activeBeam.position,
    finalizedRot: activeBeam.rotation,
    activeIsPrebuilt: false,
    validPieces: supports,
    proposedTimberJoints: [],
    preservedJoints: [],
  });
}

function createStore(
  activeBeam: PlacedPiece,
  supports: PlacedPiece[],
  initiallyBoundSupportIds: string[],
): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  const state = store.getState();
  state.pieces = [activeBeam, ...supports];
  state.joints = [];

  const proposals = broadFaceProposals(activeBeam, supports).filter((proposal) =>
    initiallyBoundSupportIds.includes(proposal.targetPieceId),
  );
  for (const proposal of proposals) {
    const created = store.createOrUpdateTimberJointFromProposal(activeBeam.id, proposal);
    assert.ok(created, `Expected initial broad-face joint for ${proposal.targetPieceId}`);
  }
  return store;
}

function activeBroadFaceJoints(store: LevelStore): TimberJoint[] {
  return store
    .getJointsForPiece('edit_beam')
    .filter((joint) => joint.state !== 'BROKEN' && isBroadFaceTimberJoint(joint));
}

function partnerId(joint: TimberJoint): string {
  return joint.pieceAId === 'edit_beam' ? joint.pieceBId : joint.pieceAId;
}

test('Phase B2.2: preserves an off-center broad-face seam by finite overlap', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const store = createStore(activeBeam, [a], ['support_a']);
  const original = activeBroadFaceJoints(store)[0];
  const finalPosition = { x: 50, y: 100 };

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    finalPosition,
    0,
    store.getState().pieces,
    store.getJoints(),
    true,
  );

  assert.deepEqual(result.removedJoints.map(partnerId), []);
  assert.deepEqual(result.preservedJoints.map(partnerId), ['support_a']);
  assert.equal(result.preservedJoints[0].jointId, original.jointId);
  assert.ok(Math.abs(result.preservedJoints[0].worldPosition.x - 1) < 0.001);
  assert.equal(result.preservedJoints[0].initialPositionalErrorPx, 0);
  assert.equal(result.preservedJoints[0].initialAngularErrorRad, 0);
});

test('Phase B2.2: removes a broad-face seam below the 12px overlap minimum', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const store = createStore(activeBeam, [a], ['support_a']);

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 85, y: 100 },
    0,
    store.getState().pieces,
    store.getJoints(),
    true,
  );

  assert.deepEqual(result.preservedJoints.map(partnerId), []);
  assert.deepEqual(result.removedJoints.map(partnerId), ['support_a']);
  assert.equal(result.newlyProposedJoints.some(
    (p) => p.targetPieceId === 'support_a' && isBroadFaceTimberJoint(p),
  ), false);
});

test('Phase B2.2: removes a broad-face seam outside finalized contact distance', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const store = createStore(activeBeam, [a], ['support_a']);

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 0, y: 97.4 },
    0,
    store.getState().pieces,
    store.getJoints(),
    true,
  );

  assert.deepEqual(result.preservedJoints.map(partnerId), []);
  assert.deepEqual(result.removedJoints.map(partnerId), ['support_a']);
});

test('Phase B2.2: preserves permitted 2.4px in-place penetration', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const store = createStore(activeBeam, [a], ['support_a']);

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 50, y: 102.4 },
    0,
    store.getState().pieces,
    store.getJoints(),
    true,
  );

  assert.deepEqual(result.preservedJoints.map(partnerId), ['support_a']);
  assert.deepEqual(result.removedJoints.map(partnerId), []);
});

test('Phase B2.2: one evaluation preserves A, discovers B, and removes C', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const c = support('support_c', -48);
  const store = createStore(activeBeam, [a, b, c], ['support_a', 'support_c']);

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 50, y: 100 },
    0,
    store.getState().pieces,
    store.getJoints(),
    true,
  );

  assert.deepEqual(result.preservedJoints.map(partnerId).sort(), ['support_a']);
  assert.deepEqual(result.removedJoints.map(partnerId).sort(), ['support_c']);
  assert.deepEqual(
    result.newlyProposedJoints.filter(isBroadFaceTimberJoint).map((p) => p.targetPieceId).sort(),
    ['support_b'],
  );
});

test('Phase B2.2: movePiece commits the plural seam update atomically', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const c = support('support_c', -48);
  const store = createStore(activeBeam, [a, b, c], ['support_a', 'support_c']);
  const finalPosition = { x: 50, y: 100 };

  assert.equal(store.movePiece(activeBeam.id, finalPosition, 0, undefined, true), true);
  assert.deepEqual(activeBroadFaceJoints(store).map(partnerId).sort(), ['support_a', 'support_b']);
  assert.equal(new Set(activeBroadFaceJoints(store).map((joint) => joint.jointId)).size, 2);
  assert.deepEqual(store.getState().pieces.find((piece) => piece.id === activeBeam.id)?.position, finalPosition);
});

test('Phase B2.2: secondary seam discovery never changes the requested transform', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const c = support('support_c', -48);
  const store = createStore(activeBeam, [a, b, c], ['support_a', 'support_c']);
  const finalPosition = { x: 50, y: 100 };
  const finalRotation = 0;

  assert.equal(store.movePiece(activeBeam.id, finalPosition, finalRotation, undefined, true), true);
  const committed = store.getState().pieces.find((piece) => piece.id === activeBeam.id)!;
  assert.deepEqual(committed.position, finalPosition);
  assert.equal(committed.rotation, finalRotation);
});

test('Phase B2.2: Undo and Redo restore the complete plural seam graph atomically', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const c = support('support_c', -48);
  const store = createStore(activeBeam, [a, b, c], ['support_a', 'support_c']);
  const originalPosition = { ...activeBeam.position };
  const finalPosition = { x: 50, y: 100 };
  const originalIds = activeBroadFaceJoints(store).map((joint) => joint.jointId).sort();

  assert.equal(store.movePiece(activeBeam.id, finalPosition, 0, undefined, true), true);
  assert.deepEqual(activeBroadFaceJoints(store).map(partnerId).sort(), ['support_a', 'support_b']);

  assert.equal(store.undo(), true);
  assert.deepEqual(
    store.getState().pieces.find((piece) => piece.id === activeBeam.id)?.position,
    originalPosition,
  );
  assert.deepEqual(activeBroadFaceJoints(store).map(partnerId).sort(), ['support_a', 'support_c']);
  assert.deepEqual(activeBroadFaceJoints(store).map((joint) => joint.jointId).sort(), originalIds);

  assert.equal(store.redo(), true);
  assert.deepEqual(
    store.getState().pieces.find((piece) => piece.id === activeBeam.id)?.position,
    finalPosition,
  );
  assert.deepEqual(activeBroadFaceJoints(store).map(partnerId).sort(), ['support_a', 'support_b']);
  assert.equal(new Set(activeBroadFaceJoints(store).map((joint) => joint.jointId)).size, 2);
});

test('Phase B2.2: cancel restores the transaction start transform and exact joint graph', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const c = support('support_c', -48);
  const store = createStore(activeBeam, [a, b, c], ['support_a', 'support_c']);
  assert.ok(store.beginJointEditTransaction(activeBeam.id));
  // Beginning an edit transaction normalizes optional transform metadata on the
  // active piece. Capture the authoritative transaction-start state afterward.
  const startBeam = store.getState().pieces.find(
    (piece) => piece.id === activeBeam.id,
  )!;
  const startPosition = { ...startBeam.position };
  const startRotation = startBeam.rotation;
  const beforeJoints = JSON.stringify(store.getJoints());
  const state = store.getState();
  state.pieces.find((piece) => piece.id === activeBeam.id)!.position = { x: 50, y: 100 };
  state.joints = [];

  assert.equal(store.cancelJointEditTransaction('B2_2_TEST_CANCEL'), true);
  const restoredBeam = store.getState().pieces.find(
    (piece) => piece.id === activeBeam.id,
  )!;
  assert.deepEqual(restoredBeam.position, startPosition);
  assert.equal(restoredBeam.rotation, startRotation);
  assert.equal(JSON.stringify(store.getJoints()), beforeJoints);
});

test('Phase B2.2: Snap Off preserves valid seams but discovers no new support', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const store = createStore(activeBeam, [a, b], ['support_a']);

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 50, y: 100 },
    0,
    store.getState().pieces,
    store.getJoints(),
    false,
  );

  assert.deepEqual(result.preservedJoints.map(partnerId), ['support_a']);
  assert.equal(
    result.newlyProposedJoints.some(
      (proposal) => proposal.targetPieceId === 'support_b' && isBroadFaceTimberJoint(proposal),
    ),
    false,
  );
});

test('Phase B2.2: a broken broad-face seam is not silently revived', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const store = createStore(activeBeam, [a], ['support_a']);
  store.getJoints()[0].state = 'BROKEN';

  const result = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 1, y: 100 },
    0,
    store.getState().pieces,
    store.getJoints(),
    true,
  );

  assert.equal(result.preservedJoints.length, 0);
  assert.equal(
    result.newlyProposedJoints.some(
      (proposal) => proposal.targetPieceId === 'support_a' && isBroadFaceTimberJoint(proposal),
    ),
    false,
  );
});

test('Phase B2.2: plural evaluation is deterministic across support enumeration order', () => {
  const activeBeam = beam();
  const a = support('support_a', 0);
  const b = support('support_b', 96);
  const c = support('support_c', -48);
  const store = createStore(activeBeam, [a, b, c], ['support_a', 'support_c']);
  const joints = store.getJoints();

  const forward = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 50, y: 100 },
    0,
    [activeBeam, a, b, c],
    joints,
    true,
  );
  const reverse = evaluateJointsForPieceTransform(
    activeBeam.id,
    activeBeam.type,
    { x: 50, y: 100 },
    0,
    [activeBeam, c, b, a],
    joints,
    true,
  );

  const summarize = (result: typeof forward) => ({
    preserved: result.preservedJoints.map((joint) => joint.jointId).sort(),
    removed: result.removedJoints.map((joint) => joint.jointId).sort(),
    proposed: result.newlyProposedJoints
      .filter(isBroadFaceTimberJoint)
      .map((proposal) => proposal.targetPieceId),
  });
  assert.deepEqual(summarize(reverse), summarize(forward));
});
