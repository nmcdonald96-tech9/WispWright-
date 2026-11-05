/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { TIMBER_JOINT_PROFILES } from '../config';
import { discoverSecondaryBroadFaceSeams, isBroadFaceTimberJoint } from '../math/snapSolver';
import { LevelStore } from '../state/levelStore';
import { PlacedPiece, TimberJoint, Vector2 } from '../types';
import { PhysicsBridge } from './physicsBridge';

function beam(): PlacedPiece {
  return {
    id: 'impact_beam',
    type: 'wood_beam',
    position: { x: 0, y: 720 },
    rotation: 0,
    isPrebuilt: false,
  };
}

function support(id: string, x: number): PlacedPiece {
  return {
    id,
    type: 'wood_block',
    position: { x, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
}

function createBridge(reverseSupports = false): PhysicsBridge {
  const store = new LevelStore();
  store.clearStorage();
  const activeBeam = beam();
  const left = support('support_left', -48);
  const right = support('support_right', 48);
  const supports = reverseSupports ? [right, left] : [left, right];
  store.getState().pieces = [activeBeam, ...supports];
  store.getState().joints = [];
  store.getState().wisps = [];

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
  assert.equal(proposals.length, 2);
  for (const proposal of proposals) {
    assert.ok(store.createOrUpdateTimberJointFromProposal(activeBeam.id, proposal));
  }
  return new PhysicsBridge(store.getState());
}

function activeSeams(bridge: PhysicsBridge): TimberJoint[] {
  return bridge
    .getSimulatedJoints()
    .filter((joint) => joint.state !== 'BROKEN' && isBroadFaceTimberJoint(joint));
}

function seamBySupport(bridge: PhysicsBridge, supportId: string): TimberJoint {
  return activeSeams(bridge).find(
    (joint) => joint.pieceAId === supportId || joint.pieceBId === supportId,
  )!;
}

function shockImpulse(bridge: PhysicsBridge): number {
  const joint = activeSeams(bridge)[0];
  const profile =
    TIMBER_JOINT_PROFILES[joint.strengthProfile] ??
    TIMBER_JOINT_PROFILES.standard_timber_joint;
  return profile.breakImpulseThreshold * 0.7;
}

function applyDamage(
  bridge: PhysicsBridge,
  pieceId: string,
  impulse: number,
  impactPoint?: Vector2,
): void {
  const testAccess = bridge as unknown as {
    applyPieceDamage: (
      damagedPieceId: string,
      impactImpulse: number,
      worldImpactPoint?: Vector2,
    ) => void;
  };
  testAccess.applyPieceDamage(pieceId, impulse, impactPoint);
}

function stressPair(bridge: PhysicsBridge) {
  return {
    left: seamBySupport(bridge, 'support_left').currentStress,
    right: seamBySupport(bridge, 'support_right').currentStress,
  };
}

test('Phase B4: an impact near the left seam loads it more than the distant right seam', () => {
  const bridge = createBridge();
  const impulse = shockImpulse(bridge);

  applyDamage(bridge, 'impact_beam', impulse, { x: -48, y: 708 });
  const stress = stressPair(bridge);

  assert.ok(stress.left > stress.right);
  assert.ok(stress.left > 0);
  assert.ok(stress.right >= 0);
  bridge.teardown();
});

test('Phase B4: mirroring impact location mirrors seam stress distribution', () => {
  const leftBridge = createBridge();
  const rightBridge = createBridge();
  const impulse = shockImpulse(leftBridge);

  applyDamage(leftBridge, 'impact_beam', impulse, { x: -48, y: 708 });
  applyDamage(rightBridge, 'impact_beam', impulse, { x: 48, y: 708 });
  const leftImpact = stressPair(leftBridge);
  const rightImpact = stressPair(rightBridge);

  assert.ok(Math.abs(leftImpact.left - rightImpact.right) < 0.0001);
  assert.ok(Math.abs(leftImpact.right - rightImpact.left) < 0.0001);
  assert.ok(leftImpact.left > leftImpact.right);
  assert.ok(rightImpact.right > rightImpact.left);
  leftBridge.teardown();
  rightBridge.teardown();
});

test('Phase B4: a centered impact loads symmetric seams equally', () => {
  const bridge = createBridge();
  const impulse = shockImpulse(bridge);

  applyDamage(bridge, 'impact_beam', impulse, { x: 0, y: 708 });
  const stress = stressPair(bridge);

  assert.ok(stress.left > 0);
  assert.ok(Math.abs(stress.left - stress.right) < 0.0001);
  bridge.teardown();
});

test('Phase B4: support enumeration order does not change localized stress', () => {
  const forward = createBridge(false);
  const reverse = createBridge(true);
  const impulse = shockImpulse(forward);

  applyDamage(forward, 'impact_beam', impulse, { x: -48, y: 708 });
  applyDamage(reverse, 'impact_beam', impulse, { x: -48, y: 708 });

  assert.deepEqual(stressPair(reverse), stressPair(forward));
  forward.teardown();
  reverse.teardown();
});

test('Phase B4: missing impact location preserves deterministic legacy fallback', () => {
  const first = createBridge();
  const second = createBridge();
  const impulse = shockImpulse(first);

  applyDamage(first, 'impact_beam', impulse);
  applyDamage(second, 'impact_beam', impulse);

  assert.deepEqual(stressPair(second), stressPair(first));
  assert.ok(stressPair(first).left > 0);
  assert.equal(stressPair(first).left, stressPair(first).right);
  first.teardown();
  second.teardown();
});

test('Phase B4: a near-seam hit can break the local seam while the distant seam survives', () => {
  const bridge = createBridge();
  const left = seamBySupport(bridge, 'support_left');
  const profile =
    TIMBER_JOINT_PROFILES[left.strengthProfile] ??
    TIMBER_JOINT_PROFILES.standard_timber_joint;
  const localizedBreakImpulse = profile.breakImpulseThreshold * 1.02;

  applyDamage(bridge, 'impact_beam', localizedBreakImpulse, { x: -48, y: 708 });
  const joints = bridge.getSimulatedJoints();
  const leftAfter = joints.find(
    (joint) => joint.pieceAId === 'support_left' || joint.pieceBId === 'support_left',
  )!;
  const rightAfter = joints.find(
    (joint) => joint.pieceAId === 'support_right' || joint.pieceBId === 'support_right',
  )!;

  assert.equal(leftAfter.state, 'BROKEN');
  assert.notEqual(rightAfter.state, 'BROKEN');
  assert.equal(leftAfter.failureReason, 'DIRECT_IMPACT_IMPULSE');
  bridge.teardown();
});

test('Phase B4: mirroring a localized break mirrors which support seam survives', () => {
  const leftBridge = createBridge();
  const rightBridge = createBridge();
  const profile =
    TIMBER_JOINT_PROFILES[seamBySupport(leftBridge, 'support_left').strengthProfile] ??
    TIMBER_JOINT_PROFILES.standard_timber_joint;
  const localizedBreakImpulse = profile.breakImpulseThreshold * 1.02;

  applyDamage(leftBridge, 'impact_beam', localizedBreakImpulse, { x: -48, y: 708 });
  applyDamage(rightBridge, 'impact_beam', localizedBreakImpulse, { x: 48, y: 708 });

  const stateFor = (bridge: PhysicsBridge, supportId: string) =>
    bridge.getSimulatedJoints().find(
      (joint) => joint.pieceAId === supportId || joint.pieceBId === supportId,
    )!.state;
  assert.equal(stateFor(leftBridge, 'support_left'), 'BROKEN');
  assert.notEqual(stateFor(leftBridge, 'support_right'), 'BROKEN');
  assert.equal(stateFor(rightBridge, 'support_right'), 'BROKEN');
  assert.notEqual(stateFor(rightBridge, 'support_left'), 'BROKEN');
  leftBridge.teardown();
  rightBridge.teardown();
});

test('Phase B4: missing impact location preserves legacy equal-break behavior', () => {
  const bridge = createBridge();
  const profile =
    TIMBER_JOINT_PROFILES[seamBySupport(bridge, 'support_left').strengthProfile] ??
    TIMBER_JOINT_PROFILES.standard_timber_joint;
  const breakImpulse = profile.breakImpulseThreshold * 1.02;

  applyDamage(bridge, 'impact_beam', breakImpulse);
  const states = bridge.getSimulatedJoints().map((joint) => joint.state);

  assert.deepEqual(states.sort(), ['BROKEN', 'BROKEN']);
  bridge.teardown();
});

test('Phase B4: repeated identical localized impacts remain deterministic', () => {
  const run = () => {
    const bridge = createBridge();
    const impulse = shockImpulse(bridge);
    applyDamage(bridge, 'impact_beam', impulse, { x: -48, y: 708 });
    const result = bridge
      .getSimulatedJoints()
      .map((joint) => ({
        jointId: joint.jointId,
        currentStress: joint.currentStress,
        maxStressObserved: joint.maxStressObserved,
        state: joint.state,
        failureReason: joint.failureReason,
      }))
      .sort((a, b) => a.jointId.localeCompare(b.jointId));
    bridge.teardown();
    return result;
  };

  assert.deepEqual(run(), run());
});
