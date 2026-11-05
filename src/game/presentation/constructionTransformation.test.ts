/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { TimberJoint } from '../types';
import {
  deriveConstructionTransformationState,
  derivePieceVisualDescriptor,
  deriveSeamVisualDescriptor,
  getPieceVisualSeed,
} from './constructionTransformation';

function seam(overrides: Partial<TimberJoint> = {}): TimberJoint {
  return {
    jointId: 'joint_1',
    jointType: 'TIMBER_FACE',
    pieceAId: 'beam_1',
    pieceBId: 'block_1',
    socketAId: 'beam_1_SIDE_BOTTOM_CENTER',
    socketBId: 'block_1_TOP_EDGE',
    localAnchorA: { x: 0, y: 12 },
    localAnchorB: { x: 0, y: -24 },
    worldPosition: { x: 0, y: 112 },
    restAngle: 0,
    restSeparation: 0,
    strengthProfile: 'TIMBER_FACE',
    state: 'INTACT',
    currentStress: 0,
    maxStressObserved: 0,
    createdInPhase: 'BUILD',
    ...overrides,
  };
}

test('C1: unaccepted and active construction modes remain prototype visuals', () => {
  assert.equal(
    deriveConstructionTransformationState({
      phase: 'PLACE_WISPS',
      acceptedRevisionId: null,
      currentConstructionRevision: 4,
    }).mode,
    'PROTOTYPE',
  );
  assert.equal(
    deriveConstructionTransformationState({
      phase: 'CONSTRUCTION',
      acceptedRevisionId: 4,
      currentConstructionRevision: 4,
    }).mode,
    'PROTOTYPE',
  );
});

test('C1: accepted design transforms in presentation phases', () => {
  const state = deriveConstructionTransformationState({
    phase: 'PLACE_WISPS',
    acceptedRevisionId: 4,
    currentConstructionRevision: 4,
    previousMode: 'PROTOTYPE',
  });
  assert.equal(state.mode, 'TRANSFORMING');
  assert.equal(state.isAcceptedRevision, true);
});

test('C1: reduced motion skips nonessential transformation animation', () => {
  const state = deriveConstructionTransformationState({
    phase: 'PLACE_WISPS',
    acceptedRevisionId: 4,
    currentConstructionRevision: 4,
    previousMode: 'PROTOTYPE',
    reducedMotion: true,
  });
  assert.deepEqual(state, {
    mode: 'TRANSFORMED',
    transformationProgress: 1,
    isAcceptedRevision: true,
  });
});

test('C1: piece visual variants are stable and independent of construction revision', () => {
  const first = getPieceVisualSeed('beam_1', 'wood_beam');
  const second = getPieceVisualSeed('beam_1', 'wood_beam');
  assert.equal(second, first);
  assert.notEqual(getPieceVisualSeed('beam_2', 'wood_beam'), first);

  const descriptor = derivePieceVisualDescriptor({
    pieceId: 'beam_1',
    materialType: 'wood_beam',
    condition: 'CRACKED',
    impactSeverity: 1.4,
    transformationProgress: 2,
  });
  assert.equal(descriptor.seed, first);
  assert.equal(descriptor.severity, 1);
  assert.equal(descriptor.transformationProgress, 1);
});

test('C1: broad-face and endpoint seams receive distinct visual families', () => {
  const broad = deriveSeamVisualDescriptor(seam(), 1);
  const endpoint = deriveSeamVisualDescriptor(
    seam({
      jointId: 'joint_2',
      socketAId: 'beam_1_END_A_CENTER',
      socketBId: 'block_1_LEFT_EDGE',
    }),
    1,
  );
  assert.equal(broad.family, 'BROAD_FACE_CLAMP');
  assert.equal(endpoint.family, 'ENDPOINT_SHOE');
});

test('C1: seam descriptors are deterministic by logical joint identity', () => {
  const joint = seam();
  assert.deepEqual(
    deriveSeamVisualDescriptor(joint, 1),
    deriveSeamVisualDescriptor(joint, 1),
  );
  assert.notEqual(
    deriveSeamVisualDescriptor(joint, 1).seed,
    deriveSeamVisualDescriptor(seam({ jointId: 'joint_other' }), 1).seed,
  );
});

test('C1: broken seam descriptor replaces active hardware with a persistent scar', () => {
  const descriptor = deriveSeamVisualDescriptor(
    seam({ state: 'BROKEN', currentStress: 12 }),
    1,
  );
  assert.equal(descriptor.persistentBrokenScar, true);
  assert.equal(descriptor.stressAlpha, 0);
});

test('C1: descriptor derivation does not mutate authoritative joint input', () => {
  const joint = seam({ state: 'STRAINED', currentStress: 8 });
  const before = JSON.stringify(joint);
  const descriptor = deriveSeamVisualDescriptor(joint, 0.5);
  assert.equal(JSON.stringify(joint), before);
  assert.equal(descriptor.stressAlpha, 0.8);
});
