/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase C1 acceptance contract: continuous beam-endpoint-to-block-face seating.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE } from '../config';
import { getPieceSnapSockets, getPieceSnapSocketsForTransform } from './geometry';
import { PlacedPiece, ProposedTimberJoint } from '../types';
import {
  findManualBindCandidatesForPiece,
  solveSnapAndValidation,
} from './snapSolver';

function proposalOf(result: ReturnType<typeof solveSnapAndValidation>): ProposedTimberJoint | null {
  return result.proposedTimberJoints?.[0] ?? result.proposedTimberJoint ?? null;
}

function playerBlock(
  id: string,
  type: 'wood_block' | 'stone_block' = 'wood_block',
): PlacedPiece {
  return {
    id,
    type,
    position: { x: 300, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
}

test('Phase C1: vertical beam endpoint seats off-center along a block top face without face-center pulling', () => {
  const block = playerBlock('endpoint_top_support');
  const intendedX = 310;

  // At +90 degrees, END_B_CENTER is the lower endpoint. Flush center y is 660:
  // 660 + 72 = block top y 732.
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: intendedX, y: 655 },
    Math.PI / 2,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, rotationSource: 'USER', existingJoints: [] },
  );

  const joint = proposalOf(result);
  assert.equal(result.isValid, true);
  assert.equal(result.snapped, true);
  assert.ok(Math.abs(result.position.x - intendedX) < 0.1, 'Face tangent position must be preserved');
  assert.ok(Math.abs(result.position.y - 660) < 0.1, `Expected flush y=660, got ${result.position.y}`);
  assert.ok(joint, 'Expected endpoint-to-face proposal');
  assert.ok(Math.abs(joint.worldPosition.x - intendedX) < 0.1);
  assert.ok(Math.abs(joint.worldPosition.y - 732) < 0.1);
  assert.equal(joint.targetFaceId, 'TOP_FACE');
});

test('Phase C1: horizontal beam endpoint seats off-center along a block side face', () => {
  const block = playerBlock('endpoint_side_support');
  block.position.y = 600;
  const intendedY = 588;

  // END_A_CENTER approaches the elevated block RIGHT_FACE at x=324.
  // The chosen y=588 is an off-center interior point on its side face.
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 401, y: intendedY },
    0,
    [block],
    [],
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );

  const joint = proposalOf(result);
  assert.equal(result.isValid, true);
  assert.equal(result.snapped, true);
  assert.ok(Math.abs(result.position.x - 396) < 0.1, `Expected flush x=396, got ${result.position.x}`);
  assert.ok(Math.abs(result.position.y - intendedY) < 0.1, 'Face tangent position must be preserved');
  assert.ok(joint, 'Expected endpoint-to-side-face proposal');
  assert.ok(Math.abs(joint.worldPosition.x - 324) < 0.1);
  assert.ok(Math.abs(joint.worldPosition.y - intendedY) < 0.1);
  assert.equal(joint.targetFaceId, 'RIGHT_FACE');
});

test('Phase C1: endpoint near a true block corner remains a corner-seat relationship', () => {
  const block = playerBlock('corner_owner_support');
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 225.088, y: 681.088 },
    Math.PI / 4,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 4, rotationSource: 'USER', existingJoints: [] },
  );

  const joint = proposalOf(result);
  assert.ok(joint, 'Expected a committed corner-owned proposal');
  assert.ok(
    joint.jointType === 'RAFTER_CORNER_SEAT' || joint.connectionTaxonomy === 'RAFTER_CORNER_SEAT',
    `Expected corner-seat ownership, got ${joint.jointType}/${joint.connectionTaxonomy}`,
  );
});

test('Phase C1: broad-side overlap remains owned by Phase A rather than endpoint seating', () => {
  const block = playerBlock('phase_a_owner_support', 'stone_block');
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 338, y: 716 },
    0,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );

  const joint = proposalOf(result);
  assert.ok(joint);
  assert.equal(joint.sourceFaceId, 'BOTTOM_FACE');
  assert.equal(joint.targetFaceId, 'TOP_FACE');
  assert.equal(joint.jointType, 'TIMBER_FACE');
  assert.equal(joint.connectionSubtype, 'FACE_BINDING');
});

test('Phase C1: moving a block to a stationary vertical beam endpoint preserves the chosen top-face position', () => {
  const beam: PlacedPiece = {
    id: 'stationary_vertical_beam',
    type: 'wood_beam',
    position: { x: 310, y: 660 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };

  const result = solveSnapAndValidation(
    'wood_block',
    { x: 300, y: 761 },
    0,
    [beam],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );

  const joint = proposalOf(result);
  assert.equal(result.isValid, true);
  assert.equal(result.snapped, true);
  assert.ok(Math.abs(result.position.x - 300) < 0.1, 'Block tangent position must remain player-selected');
  assert.ok(Math.abs(result.position.y - 756) < 0.1);
  assert.ok(joint, 'Expected source/target symmetric endpoint seat');
  assert.ok(Math.abs(joint.worldPosition.x - 310) < 0.1);
  assert.ok(Math.abs(joint.worldPosition.y - 732) < 0.1);
});

test('Phase C1: fixed Ancient Cut Stone supports an off-center endpoint face seat with environment profile', () => {
  const fixedStone = INITIAL_LEVEL_STATE.pieces.find(
    (piece) => piece.id === 'prebuilt_stone_left_2',
  );
  assert.ok(fixedStone);
  const intendedX = fixedStone.position.x + 10;
  const topY = fixedStone.position.y - 24;

  const result = solveSnapAndValidation(
    'wood_beam',
    { x: intendedX, y: topY - 77 },
    Math.PI / 2,
    INITIAL_LEVEL_STATE.pieces,
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, rotationSource: 'USER', existingJoints: [] },
  );

  const joint = proposalOf(result);
  assert.ok(joint);
  assert.ok(Math.abs(joint.worldPosition.x - intendedX) < 0.1);
  assert.equal(joint.materialPairKey, 'WOOD_ENVIRONMENT');
  assert.equal(joint.connectionSubtype, 'FACE_BINDING');
  assert.equal(joint.isPrebuiltBinding, true);
});

test('Phase C1: Snap OFF preserves free endpoint placement and creates no proposal', () => {
  const block = playerBlock('endpoint_snap_off_support');
  const raw = { x: 310, y: 655 };
  const result = solveSnapAndValidation(
    'wood_beam',
    raw,
    Math.PI / 2,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    false,
    undefined,
    { preferredRotation: Math.PI / 2, rotationSource: 'USER', existingJoints: [] },
  );

  assert.equal(result.snapped, false);
  assert.deepEqual(result.position, raw);
  assert.equal(result.proposedTimberJoint, null);
  assert.ok(!result.proposedTimberJoints || result.proposedTimberJoints.length === 0);
});

test('Phase C1: Manual Bind Connection discovers a free-placed off-center endpoint face seat', () => {
  const block = playerBlock('manual_endpoint_support');
  const beam: PlacedPiece = {
    id: 'manual_endpoint_beam',
    type: 'wood_beam',
    position: { x: 310, y: 660 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };

  const candidates = findManualBindCandidatesForPiece(beam, [block, beam], []);
  const endpointSeat = candidates.find(
    (candidate) =>
      candidate.targetPieceId === block.id &&
      candidate.targetFaceId === 'TOP_FACE' &&
      Math.abs(candidate.worldPosition.x - 310) < 0.1,
  );

  assert.ok(endpointSeat, 'Expected manual continuous endpoint-to-face candidate');
  assert.equal(endpointSeat.jointType, 'TIMBER_FACE');
  assert.equal(endpointSeat.connectionSubtype, 'FACE_BINDING');
});

test('Phase C1 feel: a locked endpoint-face candidate follows tangent movement immediately', () => {
  const block = playerBlock('endpoint_drag_lock_support');
  block.position.y = 600;

  const acquired = solveSnapAndValidation(
    'wood_beam',
    { x: 401, y: 588 },
    0,
    [block],
    [],
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  assert.ok(acquired.socket && acquired.pieceSocket);

  const slid = solveSnapAndValidation(
    'wood_beam',
    { x: 401, y: 604 },
    0,
    [block],
    [],
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'USER',
      existingJoints: [],
      lockedCandidate: {
        pieceSocketId: acquired.pieceSocket.id,
        targetSocketId: acquired.socket.id,
      },
    },
  );

  assert.equal(slid.currentCandidateLabel, 'Endpoint Face Joint');
  assert.ok(Math.abs(slid.position.x - 396) < 0.1);
  assert.ok(Math.abs(slid.position.y - 604) < 0.1, 'Locked endpoint seat must follow tangent input immediately');
});

test('Phase C1 feel: a locked Phase A broad-face candidate follows horizontal movement immediately', () => {
  const block = playerBlock('broad_drag_lock_support', 'stone_block');

  const acquired = solveSnapAndValidation(
    'wood_beam',
    { x: 300, y: 716 },
    0,
    [block],
    [],
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  assert.ok(acquired.socket && acquired.pieceSocket);

  const slid = solveSnapAndValidation(
    'wood_beam',
    { x: 334, y: 716 },
    0,
    [block],
    [],
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'USER',
      existingJoints: [],
      lockedCandidate: {
        pieceSocketId: acquired.pieceSocket.id,
        targetSocketId: acquired.socket.id,
      },
    },
  );

  assert.equal(slid.currentCandidateLabel, 'Timber Face Joint');
  assert.ok(Math.abs(slid.position.x - 334) < 0.1, 'Locked broad face must follow tangent input immediately');
  assert.ok(Math.abs(slid.position.y - 720) < 0.1);
});

test('Phase C1 feel: moving a locked block along a stationary beam endpoint preserves tangent input', () => {
  const beam: PlacedPiece = {
    id: 'stationary_endpoint_for_lock_test',
    type: 'wood_beam',
    position: { x: 310, y: 500 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };

  const acquired = solveSnapAndValidation(
    'wood_block',
    { x: 300, y: 601 },
    0,
    [beam],
    [],
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  assert.ok(acquired.socket && acquired.pieceSocket);

  const slid = solveSnapAndValidation(
    'wood_block',
    { x: 318, y: 601 },
    0,
    [beam],
    [],
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'USER',
      existingJoints: [],
      lockedCandidate: {
        pieceSocketId: acquired.pieceSocket.id,
        targetSocketId: acquired.socket.id,
      },
    },
  );

  assert.equal(slid.currentCandidateLabel, 'Endpoint Face Joint');
  assert.ok(Math.abs(slid.position.x - 318) < 0.1, 'Locked block seat must follow tangent input immediately');
});

test('Phase C1 takeover: continuous endpoint seat replaces an equivalent discrete face-center lock', () => {
  const block = playerBlock('endpoint_center_lock_support');
  block.position.y = 600;

  const centerBeamPos = { x: 401, y: 600 };
  const beamEnd = getPieceSnapSocketsForTransform(
    'wood_beam',
    centerBeamPos,
    0,
    'ghost',
  ).find((socket) => socket.localName === 'END_A_CENTER');
  const blockFaceCenter = getPieceSnapSockets(block).find(
    (socket) => socket.localName === 'RIGHT_EDGE',
  );
  assert.ok(beamEnd && blockFaceCenter);

  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 401, y: 588 },
    0,
    [block],
    [],
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'USER',
      existingJoints: [],
      lockedCandidate: {
        pieceSocketId: beamEnd.id,
        targetSocketId: blockFaceCenter.id,
      },
    },
  );

  assert.equal(result.currentCandidateLabel, 'Endpoint Face Joint');
  assert.equal(result.candidateLockActive, true, 'Continuous successor should inherit the lock');
  assert.ok(Math.abs(result.position.x - 396) < 0.1);
  assert.ok(Math.abs(result.position.y - 588) < 0.1, 'Discrete center lock must not recenter tangent position');
  assert.ok(Math.abs(result.proposedTimberJoint!.worldPosition.y - 588) < 0.1);
});

test('Phase C1 takeover: continuous broad-face seat replaces an equivalent discrete top-center lock', () => {
  const block = playerBlock('broad_center_lock_support', 'stone_block');

  const centerBeamPos = { x: 300, y: 716 };
  const beamBottomCenter = getPieceSnapSocketsForTransform(
    'wood_beam',
    centerBeamPos,
    0,
    'ghost',
  ).find((socket) => socket.localName === 'SIDE_BOTTOM_CENTER');
  const blockTopCenter = getPieceSnapSockets(block).find(
    (socket) => socket.localName === 'TOP_EDGE',
  );
  assert.ok(beamBottomCenter && blockTopCenter);

  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 334, y: 716 },
    0,
    [block],
    [],
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'USER',
      existingJoints: [],
      lockedCandidate: {
        pieceSocketId: beamBottomCenter.id,
        targetSocketId: blockTopCenter.id,
      },
    },
  );

  assert.equal(result.currentCandidateLabel, 'Timber Face Joint');
  assert.equal(result.candidateLockActive, true, 'Continuous successor should inherit the lock');
  assert.ok(Math.abs(result.position.x - 334) < 0.1, 'Discrete top-center lock must not recenter beam');
  assert.ok(Math.abs(result.position.y - 720) < 0.1);
});

test('Phase C1 takeover: reverse block drag replaces an equivalent discrete face-center lock', () => {
  const beam: PlacedPiece = {
    id: 'stationary_vertical_center_lock_beam',
    type: 'wood_beam',
    position: { x: 310, y: 500 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };

  const blockCenterPos = { x: 310, y: 601 };
  const blockTopCenter = getPieceSnapSocketsForTransform(
    'wood_block',
    blockCenterPos,
    0,
    'ghost',
  ).find((socket) => socket.localName === 'TOP_EDGE');
  const beamEnd = getPieceSnapSockets(beam).find(
    (socket) => socket.localName === 'END_B_CENTER',
  );
  assert.ok(blockTopCenter && beamEnd);

  const result = solveSnapAndValidation(
    'wood_block',
    { x: 318, y: 601 },
    0,
    [beam],
    [],
    true,
    undefined,
    {
      preferredRotation: 0,
      rotationSource: 'USER',
      existingJoints: [],
      lockedCandidate: {
        pieceSocketId: blockTopCenter.id,
        targetSocketId: beamEnd.id,
      },
    },
  );

  assert.equal(result.currentCandidateLabel, 'Endpoint Face Joint');
  assert.equal(result.candidateLockActive, true, 'Continuous successor should inherit the lock');
  assert.ok(Math.abs(result.position.x - 318) < 0.1, 'Discrete center lock must not recenter active block');
});
