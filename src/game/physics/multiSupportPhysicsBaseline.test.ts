/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverSecondaryBroadFaceSeams } from '../math/snapSolver';
import { PhysicsBridge } from './physicsBridge';
import { LevelStore } from '../state/levelStore';
import { PlacedPiece } from '../types';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 360;

function beam(): PlacedPiece {
  return {
    id: 'baseline_beam',
    type: 'wood_beam',
    position: { x: 0, y: 720 },
    rotation: 0,
    isPrebuilt: false,
  };
}

function support(
  id: string,
  x: number,
  type: 'wood_block' | 'stone_block' = 'wood_block',
  isPrebuilt = false,
): PlacedPiece {
  return {
    id,
    type,
    position: { x, y: 756 },
    rotation: 0,
    isPrebuilt,
  };
}

function createBaseline(mixed = false) {
  const store = new LevelStore();
  store.clearStorage();
  const activeBeam = beam();
  const left = support(
    'support_left',
    -24,
    mixed ? 'stone_block' : 'wood_block',
    mixed,
  );
  const right = support('support_right', 24);
  const state = store.getState();
  state.pieces = [activeBeam, left, right];
  state.joints = [];
  state.wisps = [];

  const proposals = discoverSecondaryBroadFaceSeams({
    activePieceId: activeBeam.id,
    activeType: activeBeam.type,
    finalizedPos: activeBeam.position,
    finalizedRot: activeBeam.rotation,
    activeIsPrebuilt: false,
    validPieces: [left, right],
    proposedTimberJoints: [],
    preservedJoints: [],
  });
  assert.equal(proposals.length, 2);
  for (const proposal of proposals) {
    assert.ok(store.createOrUpdateTimberJointFromProposal(activeBeam.id, proposal));
  }
  return store;
}

function runToSettle(mixed = false) {
  const store = createBaseline(mixed);
  const bridge = new PhysicsBridge(store.getState());
  let report = bridge.getStabilityReport(0);
  let settledStep = report.isSettled ? 0 : -1;
  for (let step = 1; step <= MAX_STEPS && settledStep < 0; step++) {
    bridge.step(STEP_MS);
    report = bridge.getStabilityReport(1 / 60);
    if (report.isSettled) settledStep = step;
  }
  const transforms = bridge.getSimulatedTransforms(store.getState().pieces);
  const simulatedJoints = bridge.getSimulatedJoints();
  const beamTransform = transforms.find((entry) => entry.pieceId === 'baseline_beam')!;
  const measurements = {
    settledStep,
    report,
    beamDeflectionPx: Math.hypot(
      beamTransform.position.x,
      beamTransform.position.y - 720,
    ),
    beamRotationDeltaRad: Math.abs(beamTransform.rotation),
    joints: simulatedJoints
      .map((joint) => ({
        jointId: joint.jointId,
        initialPositionalErrorPx: joint.initialPositionalErrorPx,
        initialAngularErrorRad: joint.initialAngularErrorRad,
        initialConstraintEnergy: joint.initialConstraintEnergy,
        currentStress: joint.currentStress,
        maxStressObserved: joint.maxStressObserved,
        state: joint.state,
      }))
      .sort((a, b) => a.jointId.localeCompare(b.jointId)),
    activeTimberJointCount: bridge.diagnostics.activeTimberJointCount,
    activeFoundationAssistCount: bridge.diagnostics.activeFoundationAssistCount,
  };
  bridge.teardown();
  return measurements;
}

test('Phase B3 baseline: two-support seams start stress-free', () => {
  const store = createBaseline();
  const bridge = new PhysicsBridge(store.getState());
  const joints = bridge.getSimulatedJoints();

  assert.equal(joints.length, 2);
  assert.equal(bridge.diagnostics.activeTimberJointCount, 2);
  for (const joint of joints) {
    assert.equal(joint.initialPositionalErrorPx, 0);
    assert.equal(joint.initialAngularErrorRad, 0);
    assert.equal(joint.initialConstraintEnergy, 0);
    assert.equal(joint.state, 'INTACT');
  }
  bridge.teardown();
});

test('Phase B3 baseline: two-support structure settles without failure or material deflection', () => {
  const result = runToSettle();

  assert.ok(result.settledStep >= 0 && result.settledStep <= MAX_STEPS);
  assert.equal(result.report.fallenCount, 0);
  assert.equal(result.activeTimberJointCount, 2);
  assert.equal(result.joints.every((joint) => joint.state === 'INTACT'), true);
  assert.ok(result.beamDeflectionPx < 5);
  assert.ok(result.beamRotationDeltaRad < 0.05);
  assert.ok(Number.isFinite(result.report.totalKineticEnergy));
  assert.ok(Number.isFinite(result.report.maxVelocity));
});

test('Phase B3 baseline: repeated simulations produce deterministic measurement envelopes', () => {
  const first = runToSettle();
  const second = runToSettle();
  const third = runToSettle();

  for (const result of [second, third]) {
    assert.equal(result.settledStep, first.settledStep);
    assert.ok(Math.abs(result.beamDeflectionPx - first.beamDeflectionPx) < 0.001);
    assert.ok(Math.abs(result.beamRotationDeltaRad - first.beamRotationDeltaRad) < 0.0001);
    assert.deepEqual(result.joints, first.joints);
  }
});

test('Phase B3 baseline: mixed fixed stone and player support settles with independent seams', () => {
  const result = runToSettle(true);

  assert.ok(result.settledStep >= 0 && result.settledStep <= MAX_STEPS);
  assert.equal(result.report.fallenCount, 0);
  assert.equal(result.activeTimberJointCount, 2);
  assert.equal(result.joints.length, 2);
  assert.equal(new Set(result.joints.map((joint) => joint.jointId)).size, 2);
  assert.equal(result.joints.every((joint) => joint.state === 'INTACT'), true);
  assert.ok(result.activeFoundationAssistCount >= 1);
});
