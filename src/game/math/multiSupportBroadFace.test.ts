/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { PlacedPiece, ProposedTimberJoint, TimberJoint } from '../types';
import {
  discoverSecondaryBroadFaceSeams,
  getBroadFaceRelationshipKey,
  isBroadFaceTimberJoint,
} from './snapSolver';

const beamPosition = { x: 0, y: 100 };

function support(id: string, x: number, y = 136, isPrebuilt = false): PlacedPiece {
  return {
    id,
    type: isPrebuilt ? 'stone_block' : 'wood_block',
    position: { x, y },
    rotation: 0,
    isPrebuilt,
  };
}

function discover(
  supports: readonly PlacedPiece[],
  proposedTimberJoints: readonly ProposedTimberJoint[] = [],
  preservedJoints: readonly TimberJoint[] = [],
) {
  return discoverSecondaryBroadFaceSeams({
    activePieceId: 'beam_active',
    activeType: 'wood_beam',
    finalizedPos: beamPosition,
    finalizedRot: 0,
    activeIsPrebuilt: false,
    validPieces: supports,
    proposedTimberJoints,
    preservedJoints,
  });
}

function asPreservedJoint(proposal: ProposedTimberJoint): TimberJoint {
  return {
    jointId: `preserved_${proposal.targetPieceId}`,
    bindingId: `preserved_${proposal.targetPieceId}`,
    jointType: proposal.jointType,
    connectionSubtype: proposal.connectionSubtype,
    pieceAId: 'beam_active',
    pieceBId: proposal.targetPieceId,
    socketAId: `beam_active_${proposal.sourceSocketName}`,
    socketBId: `${proposal.targetPieceId}_${proposal.targetSocketName}`,
    localAnchorA: { ...proposal.localAnchorA },
    localAnchorB: { ...proposal.localAnchorB },
    worldPosition: { ...proposal.worldPosition },
    restAngle: proposal.restAngle,
    restSeparation: proposal.restSeparation,
    strengthProfile: proposal.strengthProfile,
    state: 'INTACT',
    currentStress: 0,
    maxStressObserved: 0,
    createdInPhase: 'BUILD',
  };
}

test('Phase B1: discovers one continuous broad-face seam per distinct support', () => {
  const seams = discover([support('support_b', 48), support('support_a', -48)]);

  assert.deepEqual(seams.map((seam) => seam.targetPieceId), ['support_a', 'support_b']);
  assert.equal(new Set(seams.map((seam) => seam.targetPieceId)).size, 2);
  assert.ok(seams.every(isBroadFaceTimberJoint));
});

test('Phase B1: scales to three distinct supports with deterministic ordering', () => {
  const seams = discover([
    support('support_c', 48),
    support('support_a', -48),
    support('support_b', 0),
  ]);

  assert.deepEqual(seams.map((seam) => seam.targetPieceId), [
    'support_a',
    'support_b',
    'support_c',
  ]);
});

test('Phase B1: anchors each seam at the actual finite-overlap midpoint', () => {
  const seams = discover([support('partial_left', -60), support('full_right', 48)]);
  const byId = new Map(seams.map((seam) => [seam.targetPieceId, seam]));

  // Beam span [-72, 72]; partial block span [-84, -36] => midpoint -54.
  assert.ok(Math.abs(byId.get('partial_left')!.worldPosition.x - (-54)) < 0.001);
  // Beam span [-72, 72]; right block span [24, 72] => midpoint 48.
  assert.ok(Math.abs(byId.get('full_right')!.worldPosition.x - 48) < 0.001);
  assert.ok(seams.every((seam) => Math.abs(seam.worldPosition.y - 112) < 0.001));
});

test('Phase B1: discovery is read-only with respect to finalized transforms', () => {
  const supports = [support('support_a', -48), support('support_b', 48)];
  const before = JSON.stringify({ beamPosition, supports });

  discover(supports);

  assert.equal(JSON.stringify({ beamPosition, supports }), before);
});

test('Phase B1: support enumeration order does not change the canonical seam set', () => {
  const a = support('support_a', -48);
  const b = support('support_b', 48);
  const forward = discover([a, b]);
  const reverse = discover([b, a]);

  assert.deepEqual(reverse, forward);
});

test('Phase B1: finalized contact accepts 2.4px gap but rejects 2.6px gap', () => {
  const accepted = discover([support('gap_2_4', 0, 138.4)]);
  const rejected = discover([support('gap_2_6', 0, 138.6)]);

  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 0);
});

test('Phase B1: finalized contact accepts 2.4px penetration but rejects 2.6px penetration', () => {
  const accepted = discover([support('penetration_2_4', 0, 133.6)]);
  const rejected = discover([support('penetration_2_6', 0, 133.4)]);

  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 0);
});

test('Phase B1: an already proposed support is not rediscovered', () => {
  const a = support('support_a', -48);
  const b = support('support_b', 48);
  const primary = discover([a])[0];
  const secondary = discover([a, b], [primary]);

  assert.deepEqual(secondary.map((seam) => seam.targetPieceId), ['support_b']);
});

test('Phase B1: a preserved support is not reproposed while a new support is discovered', () => {
  const a = support('support_a', -48);
  const b = support('support_b', 48);
  const preserved = asPreservedJoint(discover([a])[0]);
  const secondary = discover([a, b], [], [preserved]);

  assert.deepEqual(secondary.map((seam) => seam.targetPieceId), ['support_b']);
});

test('Phase B1: broad-face classifier tolerates absent subtype but rejects endpoint sockets', () => {
  const proposal = discover([support('support_a', 0)])[0];
  const withoutSubtype = { ...proposal, connectionSubtype: undefined };
  const endpoint = {
    ...withoutSubtype,
    sourceSocketName: 'END_A_CENTER',
    sourceSocketId: 'beam_active_END_A_CENTER',
  };

  assert.equal(isBroadFaceTimberJoint(withoutSubtype), true);
  assert.equal(isBroadFaceTimberJoint(endpoint), false);
});

test('Phase B1: canonical relationship key is symmetric and instance-specific', () => {
  assert.equal(
    getBroadFaceRelationshipKey('beam_active', 'support_a'),
    getBroadFaceRelationshipKey('support_a', 'beam_active'),
  );
  assert.notEqual(
    getBroadFaceRelationshipKey('beam_active', 'support_a'),
    getBroadFaceRelationshipKey('beam_active', 'support_b'),
  );
});

test('Phase B1: reverse block-to-beam discovery produces the same logical relationship key', () => {
  const stationaryBeam: PlacedPiece = {
    id: 'beam_stationary',
    type: 'wood_beam',
    position: { ...beamPosition },
    rotation: 0,
    isPrebuilt: false,
  };
  const seams = discoverSecondaryBroadFaceSeams({
    activePieceId: 'block_active',
    activeType: 'wood_block',
    finalizedPos: { x: -48, y: 136 },
    finalizedRot: 0,
    activeIsPrebuilt: false,
    validPieces: [stationaryBeam],
    proposedTimberJoints: [],
    preservedJoints: [],
  });

  assert.equal(seams.length, 1);
  assert.equal(isBroadFaceTimberJoint(seams[0]), true);
  assert.equal(
    getBroadFaceRelationshipKey('block_active', 'beam_stationary'),
    getBroadFaceRelationshipKey('beam_stationary', 'block_active'),
  );
});

test('Phase B1: prebuilt support retains environment material profile', () => {
  const seams = discover([support('ancient_cut_stone', 0, 136, true)]);

  assert.equal(seams.length, 1);
  assert.equal(seams[0].materialPairKey, 'WOOD_ENVIRONMENT');
  assert.equal(seams[0].isPrebuiltBinding, true);
});
