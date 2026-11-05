/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { C1_TRANSFORMATION_DURATION_SEC } from './constructionTransformation';
import { PresentationDirector } from './presentationDirector';

test('C1 runtime owner: PresentationDirector begins in prototype mode', () => {
  const director = new PresentationDirector();
  assert.deepEqual(director.getConstructionTransformationState(), {
    mode: 'PROTOTYPE',
    transformationProgress: 0,
    isAcceptedRevision: false,
  });
});

test('C1 runtime owner: accepted design reveal advances frame by frame', () => {
  const director = new PresentationDirector();
  director.updateConstructionTransformation(
    C1_TRANSFORMATION_DURATION_SEC / 2,
    'PLACE_WISPS',
    4,
    4,
  );
  let state = director.getConstructionTransformationState();
  assert.equal(state.mode, 'TRANSFORMING');
  assert.ok(Math.abs(state.transformationProgress - 0.5) < 0.0001);

  director.updateConstructionTransformation(
    C1_TRANSFORMATION_DURATION_SEC / 2,
    'PLACE_WISPS',
    4,
    4,
  );
  state = director.getConstructionTransformationState();
  assert.equal(state.mode, 'TRANSFORMED');
  assert.equal(state.transformationProgress, 1);
});

test('C1 runtime owner: Return to Build immediately restores prototype mode', () => {
  const director = new PresentationDirector();
  director.initializeConstructionTransformation('PRE_SIEGE_REVIEW', 4, 4);
  assert.equal(director.getConstructionTransformationState().mode, 'TRANSFORMED');
  director.updateConstructionTransformation(0, 'CONSTRUCTION', 4, 4);
  assert.equal(director.getConstructionTransformationState().mode, 'PROTOTYPE');
});

test('C1 runtime owner: hydration reconstructs accepted presentation as transformed', () => {
  const director = new PresentationDirector();
  director.initializeConstructionTransformation('PRE_SIEGE_REVIEW', 9, 9);
  assert.deepEqual(director.getConstructionTransformationState(), {
    mode: 'TRANSFORMED',
    transformationProgress: 1,
    isAcceptedRevision: true,
  });
});

test('C1 runtime owner: reinforcement retains transformed committed construction', () => {
  const director = new PresentationDirector();
  director.initializeConstructionTransformation('PRE_SIEGE_REVIEW', 9, 9);
  director.updateConstructionTransformation(0.25, 'REINFORCEMENT_ACTIVE', 9, 9);
  assert.equal(director.getConstructionTransformationState().mode, 'TRANSFORMED');
});

test('C1 runtime owner: reduced motion skips the reveal animation', () => {
  const director = new PresentationDirector();
  director.settings.reducedMotion = true;
  director.updateConstructionTransformation(0, 'PLACE_WISPS', 3, 3);
  assert.deepEqual(director.getConstructionTransformationState(), {
    mode: 'TRANSFORMED',
    transformationProgress: 1,
    isAcceptedRevision: true,
  });
});

test('C1 runtime owner: authoritative revision inputs remain unchanged', () => {
  const director = new PresentationDirector();
  const acceptedRevisionId = 6;
  const currentConstructionRevision = 6;
  director.updateConstructionTransformation(
    0.1,
    'PLACE_WISPS',
    acceptedRevisionId,
    currentConstructionRevision,
  );
  assert.equal(acceptedRevisionId, 6);
  assert.equal(currentConstructionRevision, 6);
  assert.equal(director.getConstructionTransformationState().isAcceptedRevision, true);
});
