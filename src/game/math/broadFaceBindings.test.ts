/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE } from '../config';
import { PlacedPiece } from '../types';
import {
  findManualBindCandidatesForPiece,
  solveSnapAndValidation,
} from './snapSolver';

const fixedStone = INITIAL_LEVEL_STATE.pieces.find(
  (piece) => piece.id === 'prebuilt_stone_left_2',
)!;

function broadFaceCandidate(result: ReturnType<typeof solveSnapAndValidation>) {
  return result.proposedTimberJoints?.find(
    (joint) =>
      joint.sourceFaceId === 'BOTTOM_FACE' &&
      joint.targetFaceId === 'TOP_FACE',
  ) ?? (result.proposedTimberJoint?.sourceFaceId === 'BOTTOM_FACE' &&
  result.proposedTimberJoint?.targetFaceId === 'TOP_FACE'
    ? result.proposedTimberJoint
    : null);
}

test('Broad face binding: horizontal beam moved onto fixed Cut Stone snaps flush and proposes a face binding', () => {
  const expectedY = fixedStone.position.y - 24 - 12;
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: fixedStone.position.x + 28, y: expectedY - 5 },
    0,
    INITIAL_LEVEL_STATE.pieces,
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );

  assert.equal(result.isValid, true);
  assert.equal(result.snapped, true);
  assert.ok(Math.abs(result.position.y - expectedY) < 0.1);
  assert.ok(broadFaceCandidate(result), 'Expected BOTTOM_FACE to TOP_FACE binding');
});

test('Broad face binding: block moved beneath stationary horizontal beam discovers equivalent face relationship', () => {
  const beam: PlacedPiece = {
    id: 'stationary_lintel',
    type: 'wood_beam',
    position: { x: 340, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  const expectedBlockY = beam.position.y + 12 + 24;
  const result = solveSnapAndValidation(
    'stone_block',
    { x: beam.position.x - 30, y: expectedBlockY + 5 },
    0,
    [beam],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );

  assert.equal(result.isValid, true);
  assert.equal(result.snapped, true);
  assert.ok(Math.abs(result.position.y - expectedBlockY) < 0.1);
  const joint = result.proposedTimberJoints?.[0] ?? result.proposedTimberJoint;
  assert.ok(joint, 'Expected a symmetric broad-face proposal');
  assert.equal(joint.sourceFaceId, 'TOP_FACE');
  assert.equal(joint.targetFaceId, 'BOTTOM_FACE');
});

test('Broad face binding: offset overlap preserves horizontal intent and centers anchor on actual overlap', () => {
  const block: PlacedPiece = {
    id: 'offset_support',
    type: 'stone_block',
    position: { x: 360, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const beamX = 400;
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: beamX, y: 715 },
    0,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  const joint = broadFaceCandidate(result);
  assert.ok(joint);
  assert.ok(Math.abs(result.position.x - beamX) < 0.1, 'Surface snap must not recenter beam');
  // Beam span [328,472], block top [336,384], overlap midpoint = 360.
  assert.ok(Math.abs(joint.worldPosition.x - 360) < 0.1);
  assert.ok(Math.abs(joint.worldPosition.y - 732) < 0.1);
});

test('Broad face binding: tiny incidental overlap does not create a broad seam', () => {
  const block: PlacedPiece = {
    id: 'tiny_overlap_support',
    type: 'stone_block',
    position: { x: 360, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 454, y: 720 },
    0,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  assert.equal(broadFaceCandidate(result), null);
});

test('Broad face binding: Snap OFF remains free and creates no automatic proposal', () => {
  const block: PlacedPiece = {
    id: 'snap_off_support',
    type: 'stone_block',
    position: { x: 360, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 390, y: 720 },
    0,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    false,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  assert.equal(result.snapped, false);
  assert.equal(result.proposedTimberJoint, null);
});

test('Broad face binding: manual Bind Connection discovers a flush broad seam after Snap OFF placement', () => {
  const block: PlacedPiece = {
    id: 'manual_support',
    type: 'stone_block',
    position: { x: 360, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const beam: PlacedPiece = {
    id: 'manual_lintel',
    type: 'wood_beam',
    position: { x: 400, y: 720 },
    rotation: 0,
    isPrebuilt: false,
  };
  const candidates = findManualBindCandidatesForPiece(beam, [block, beam], []);
  const broad = candidates.find(
    (candidate) =>
      candidate.targetPieceId === block.id &&
      candidate.sourceFaceId === 'BOTTOM_FACE' &&
      candidate.targetFaceId === 'TOP_FACE',
  );
  assert.ok(broad, 'Expected manual broad-face binding candidate');
  assert.ok(Math.abs(broad.worldPosition.x - 360) < 0.1);
});

test('Broad face binding: fixed Ancient Cut Stone uses environmental face-binding profile', () => {
  const expectedY = fixedStone.position.y - 24 - 12;
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: fixedStone.position.x + 24, y: expectedY - 4 },
    0,
    INITIAL_LEVEL_STATE.pieces,
    INITIAL_LEVEL_STATE.anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  const joint = broadFaceCandidate(result);
  assert.ok(joint);
  assert.equal(joint.connectionSubtype, 'FACE_BINDING');
  assert.equal(joint.materialPairKey, 'WOOD_ENVIRONMENT');
  assert.equal(joint.isPrebuiltBinding, true);
});

test('Broad face binding: Snap OFF creates neither singular nor plural proposals', () => {
  const block: PlacedPiece = {
    id: 'strict_snap_off_support',
    type: 'stone_block',
    position: { x: 360, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const result = solveSnapAndValidation(
    'wood_beam',
    { x: 390, y: 720 },
    0,
    [block],
    INITIAL_LEVEL_STATE.anchors,
    false,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: [] },
  );
  assert.equal(result.proposedTimberJoint, null);
  assert.ok(!result.proposedTimberJoints || result.proposedTimberJoints.length === 0);
});
