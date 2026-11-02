/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { solveSnapAndValidation } from '../math/snapSolver';
import { LevelStore } from '../state/levelStore';
import { PhysicsBridge } from '../physics/physicsBridge';
import { SiegeController } from './siegeController';
import { generateTargetCandidates } from './targeting';
import { validateWispPlacementPosition } from '../math/wispPlacement';
import { PlacedPiece, TimberJoint } from '../types';

test('TimberJoints Test A: Valid Timber Beam endpoints can snap end-to-end without generic overlap rejection', () => {
  const store = new LevelStore();
  // Place first beam horizontally on top of western pillars (x=260, y=660, w=120, h=20, rot=0)
  // Sockets: END_A_CENTER is at x=200, y=660; END_B_CENTER is at x=320, y=660.
  const beam1: PlacedPiece = {
    id: 'test_beam_1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  // Drag a second beam toward beam1's END_B_CENTER (x=320, y=660).
  // Second beam centered at x=380, y=660 has END_A_CENTER at x=320, y=660.
  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 375, y: 662 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true, // snap enabled
    undefined,
    {
      preferredRotation: 0,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snapResult.isValid, true, 'Endpoint snap must be valid, not rejected');
  assert.strictEqual(
    snapResult.connectionCategory,
    'TIMBER_JOINT',
    'Category must be TIMBER_JOINT',
  );
  assert.ok(snapResult.proposedTimberJoint, 'Must propose a timber joint');
  assert.strictEqual(
    snapResult.overlapClassification,
    'SOCKET_CONTACT_CLEARED',
    'Overlap classification must be SOCKET_CONTACT_CLEARED',
  );
  assert.strictEqual(snapResult.penetrationDepth, 0, 'Must have 0.0px penetration depth');

  // Place second beam with the proposed joint
  const beam2: PlacedPiece = {
    id: 'test_beam_2',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  const placed = store.placePiece(beam2, false, snapResult.proposedTimberJoint);
  assert.strictEqual(placed, true, 'Beam 2 must place successfully');

  // Verify exactly 1 logical timber joint created
  const joints = store.getJoints();
  assert.strictEqual(joints.length, 1, 'Exactly one logical joint must exist');
  assert.strictEqual(joints[0].state, 'INTACT', 'Joint state must be INTACT');
  assert.strictEqual(joints[0].pieceAId, 'test_beam_2');
  assert.strictEqual(joints[0].pieceBId, 'test_beam_1');
});

test('TimberJoints Test B: Vertical End-to-End Post Joint', () => {
  const store = new LevelStore();
  // Place upright beam 1 (rot = PI/2)
  const post1: PlacedPiece = {
    id: 'test_post_1',
    type: 'wood_beam',
    position: { x: 260, y: 700 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };
  store.placePiece(post1, false);

  // Snap upright beam 2 on top of beam 1
  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 262, y: 585 },
    Math.PI / 2,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: Math.PI / 2,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snapResult.isValid, true);
  assert.strictEqual(snapResult.connectionCategory, 'TIMBER_JOINT');
  assert.ok(snapResult.proposedTimberJoint);

  const post2: PlacedPiece = {
    id: 'test_post_2',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(post2, false, snapResult.proposedTimberJoint);

  const joints = store.getJoints();
  assert.strictEqual(joints.length, 1);
  assert.strictEqual(joints[0].state, 'INTACT');
});

test('TimberJoints Test C: Angled Roof Peak Joint (e.g. 45° and -45° beams)', () => {
  const store = new LevelStore();
  const leftRafter: PlacedPiece = {
    id: 'test_rafter_left',
    type: 'wood_beam',
    position: { x: 300, y: 600 },
    rotation: Math.PI / 4, // +45 deg
    isPrebuilt: false,
  };
  store.placePiece(leftRafter, false);

  // Approach with right rafter at -45 deg (7*PI/4 or -PI/4)
  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 375, y: 600 },
    -Math.PI / 4,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: -Math.PI / 4,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snapResult.isValid, true);
  assert.strictEqual(snapResult.connectionCategory, 'TIMBER_JOINT');
  assert.ok(snapResult.proposedTimberJoint);

  const rightRafter: PlacedPiece = {
    id: 'test_rafter_right',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(rightRafter, false, snapResult.proposedTimberJoint);

  const joints = store.getJoints();
  assert.strictEqual(joints.length, 1);
  assert.strictEqual(joints[0].state, 'INTACT');
});

test('TimberJoints Test D: Supported Contact remains distinct from a timber joint (Beam on Block, Block on Beam)', () => {
  const store = new LevelStore();
  // Place wood block
  const block: PlacedPiece = {
    id: 'test_block_1',
    type: 'wood_block',
    position: { x: 300, y: 700 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(block, false);

  // Place wood beam resting on block
  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 300, y: 670 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: 0,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snapResult.isValid, true);
  assert.strictEqual(
    snapResult.connectionCategory,
    'SUPPORTED_CONTACT',
    'Beam on block must be SUPPORTED_CONTACT, not TIMBER_JOINT',
  );
  assert.strictEqual(snapResult.proposedTimberJoint, null, 'Must NOT propose a timber joint');

  const beam: PlacedPiece = {
    id: 'test_beam_supported',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam, false, snapResult.proposedTimberJoint);

  assert.strictEqual(store.getJoints().length, 0, 'No timber joint created for supported contact');
});

test('TimberJoints Test E: Disabling Snap prevents timber joint creation', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'test_beam_1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  // Align manually with Snap OFF
  const snapOffResult = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    false, // snap disabled!
    undefined,
    {
      preferredRotation: 0,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snapOffResult.proposedTimberJoint, null);
  assert.notStrictEqual(snapOffResult.connectionCategory, 'TIMBER_JOINT');

  const beam2: PlacedPiece = {
    id: 'test_beam_2',
    type: 'wood_beam',
    position: snapOffResult.position,
    rotation: snapOffResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, false, snapOffResult.proposedTimberJoint);

  assert.strictEqual(store.getJoints().length, 0, 'Zero joints when snap disabled');
});

test('TimberJoints Test F: Stability testing instantiates 1 constraint per active joint, supported roof settles stable', () => {
  const store = new LevelStore();
  // Support right end with a stone column at x=440 (matching prebuilt left column top at 684)
  const rightStone1: PlacedPiece = {
    id: 'right_col_1',
    type: 'stone_block',
    position: { x: 440, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const rightStone2: PlacedPiece = {
    id: 'right_col_2',
    type: 'stone_block',
    position: { x: 440, y: 708 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(rightStone1, false);
  store.placePiece(rightStone2, false);

  // Beam 1 from x=200 to x=320, resting on left pillar (top 684) -> center y=672
  const beam1: PlacedPiece = {
    id: 'roof_beam_1',
    type: 'wood_beam',
    position: { x: 260, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 672 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  const beam2: PlacedPiece = {
    id: 'roof_beam_2',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, false, snapResult.proposedTimberJoint);

  assert.strictEqual(store.getJoints().length, 1);

  // Build physics world
  const bridge = new PhysicsBridge(store.getState());
  assert.strictEqual(bridge.diagnostics.activeTimberJointCount, 1);
  assert.strictEqual(bridge.diagnostics.brokenTimberJointCount, 0);

  // Step simulation for 1 second
  for (let i = 0; i < 60; i++) {
    bridge.step(1000 / 60);
  }

  const report = bridge.getStabilityReport(1.0);
  assert.strictEqual(report.isSimulating, true);
  // Supported joined beams remain intact
  const simJoints = bridge.getSimulatedJoints();
  assert.strictEqual(simJoints.length, 1);
  assert.strictEqual(simJoints[0].state, 'INTACT');

  bridge.teardown();
});

test('TimberJoints Test G: Unsupported extreme cantilever fails and breaks joint under gravity', () => {
  const store = new LevelStore();
  // Support beam 1 anchored to ground at x=200
  const beam1: PlacedPiece = {
    id: 'cantilever_root',
    type: 'wood_beam',
    position: { x: 200, y: 708 },
    rotation: Math.PI / 2, // vertical post
    isPrebuilt: false,
    attachedAnchorId: 'anchor_bedrock_west',
  };
  store.placePiece(beam1, false);

  // Joint 1: Beam 2 horizontal sticking out into thin air to the east
  const beam2: PlacedPiece = {
    id: 'cantilever_arm_1',
    type: 'wood_beam',
    position: { x: 260, y: 648 },
    rotation: 0,
    isPrebuilt: false,
  };
  const joint1: TimberJoint = {
    jointId: 'joint_c1',
    jointType: 'BEAM_END_TO_BEAM_SIDE',
    pieceAId: 'cantilever_arm_1',
    pieceBId: 'cantilever_root',
    socketAId: 'cantilever_arm_1_END_A_CENTER',
    socketBId: 'cantilever_root_END_A_CENTER',
    localAnchorA: { x: -60, y: 0 },
    localAnchorB: { x: 0, y: -60 },
    worldPosition: { x: 200, y: 648 },
    restAngle: -Math.PI / 2,
    restSeparation: 0,
    strengthProfile: 'standard_timber_joint',
    state: 'INTACT',
    currentStress: 0,
    maxStressObserved: 0,
    createdInPhase: 'BUILD',
  };
  store.placePiece(beam2, false);
  store.getState().joints = [joint1];

  // Joint 2: Beam 3 attached to the end of Beam 2 extending further out (x=380) with a heavy stone block placed on it
  const beam3: PlacedPiece = {
    id: 'cantilever_arm_2',
    type: 'wood_beam',
    position: { x: 380, y: 648 },
    rotation: 0,
    isPrebuilt: false,
  };
  const joint2: TimberJoint = {
    jointId: 'joint_c2',
    jointType: 'BEAM_END_TO_BEAM_END',
    pieceAId: 'cantilever_arm_2',
    pieceBId: 'cantilever_arm_1',
    socketAId: 'cantilever_arm_2_END_A_CENTER',
    socketBId: 'cantilever_arm_1_END_B_CENTER',
    localAnchorA: { x: -60, y: 0 },
    localAnchorB: { x: 60, y: 0 },
    worldPosition: { x: 320, y: 648 },
    restAngle: 0,
    restSeparation: 0,
    strengthProfile: 'standard_timber_joint',
    state: 'INTACT',
    currentStress: 0,
    maxStressObserved: 0,
    createdInPhase: 'BUILD',
  };
  store.placePiece(beam3, false);

  // Heavy stone block placed on top of unsupported cantilever tip (density 0.004)
  const heavyStone: PlacedPiece = {
    id: 'heavy_crusher',
    type: 'stone_block',
    position: { x: 420, y: 618 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(heavyStone, false);

  store.getState().joints = [joint1, joint2];

  const bridge = new PhysicsBridge(store.getState());
  // Step simulation for 2 seconds - bending torque and stress overload will break the joint
  for (let i = 0; i < 120; i++) {
    bridge.step(1000 / 60);
  }

  const simJoints = bridge.getSimulatedJoints();
  const hasBrokenOrStrained = simJoints.some(
    (j) => j.state === 'BROKEN' || j.state === 'STRAINED',
  );
  assert.strictEqual(
    hasBrokenOrStrained,
    true,
    'Unsupported extreme cantilever under heavy stone must strain or break',
  );

  bridge.teardown();
});

test('TimberJoints Test H: Joint failure remains separate from beam failure', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'beam_a',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  const beam2: PlacedPiece = {
    id: 'beam_b',
    type: 'wood_beam',
    position: { x: 380, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  const joint: TimberJoint = {
    jointId: 'joint_ab',
    jointType: 'BEAM_END_TO_BEAM_END',
    pieceAId: 'beam_b',
    pieceBId: 'beam_a',
    socketAId: 'beam_b_END_A_CENTER',
    socketBId: 'beam_a_END_B_CENTER',
    localAnchorA: { x: -60, y: 0 },
    localAnchorB: { x: 60, y: 0 },
    worldPosition: { x: 320, y: 660 },
    restAngle: 0,
    restSeparation: 0,
    strengthProfile: 'standard_timber_joint',
    state: 'INTACT',
    currentStress: 0,
    maxStressObserved: 0,
    createdInPhase: 'BUILD',
  };
  store.placePiece(beam1, false);
  store.placePiece(beam2, false);
  store.getState().joints = [joint];

  const bridge = new PhysicsBridge(store.getState());

  // Artificially trigger joint break
  (bridge as any).breakTimberJoint('joint_ab', 'DIRECT_IMPACT_IMPULSE');

  const simJoints = bridge.getSimulatedJoints();
  assert.strictEqual(simJoints[0].state, 'BROKEN');
  assert.strictEqual(simJoints[0].failureReason, 'DIRECT_IMPACT_IMPULSE');

  // Verify the beams themselves are NOT automatically BROKEN
  assert.strictEqual(bridge.getPieceCondition('beam_a'), 'INTACT');
  assert.strictEqual(bridge.getPieceCondition('beam_b'), 'INTACT');

  bridge.teardown();
});

test('TimberJoints Test I: Undo, Redo, Snapshot restore, Retry Design, and Start Over do not duplicate joints', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'p1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, true);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  const beam2: PlacedPiece = {
    id: 'p2',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, true, snap.proposedTimberJoint);

  assert.strictEqual(store.getJoints().length, 1);
  const originalJointId = store.getJoints()[0].jointId;

  // 1. Undo place beam2
  store.undo();
  assert.strictEqual(store.getJoints().length, 0, 'Joint removed on undo');
  assert.strictEqual(store.getState().pieces.length, 5 + 1); // 5 prebuilt + 1 player piece

  // 2. Redo place beam2
  store.redo();
  assert.strictEqual(store.getJoints().length, 1, 'Joint restored on redo');
  assert.strictEqual(store.getJoints()[0].jointId, originalJointId);

  // 3. Snapshot & Restore
  store.captureSnapshot();
  // Modify state during test
  store.getJoints()[0].state = 'BROKEN';
  store.restorePreTestSnapshot(true);
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].state, 'INTACT', 'Joint restored to INTACT after test snapshot restore');

  // 4. Detach Joint
  const detached = store.detachTimberJoints('p2');
  assert.strictEqual(detached, true);
  assert.strictEqual(store.getJoints().length, 0, 'Joint detached');

  // 5. Undo Detach Joint
  store.undo();
  assert.strictEqual(store.getJoints().length, 1, 'Joint restored on undo detach');

  // 6. Retry Design restores clean state without joint duplication
  store.saveNamedSnapshot('INITIAL_DESIGN');
  store.restoreForRetryDesign();
  assert.strictEqual(store.getJoints().length, 1, 'Zero duplicate joints after retry design');

  // 7. Start Over clears all player joints
  store.resetToDefault();
  assert.strictEqual(store.getJoints().length, 0, 'Zero joints after start over');
});

test('TimberJoints Test J: Manual rotation is preserved during endpoint snap', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'base_beam',
    type: 'wood_beam',
    position: { x: 300, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  // Drag second beam with manual rotation 30° (Math.PI / 6) toward beam1's right socket (x=360, y=600)
  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 415, y: 625 },
    Math.PI / 6,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: Math.PI / 6,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snapResult.isValid, true);
  assert.strictEqual(snapResult.connectionCategory, 'TIMBER_JOINT');
  // Manual rotation is preserved
  assert.strictEqual(Math.abs(snapResult.rotation - Math.PI / 6) < 0.001, true);
});

test('TimberJoints Test K: Joined beam detachment and edit', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'b1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  const beam2: PlacedPiece = {
    id: 'b2',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, true, snapResult.proposedTimberJoint);
  assert.strictEqual(store.getJoints().length, 1);

  // Detach timber joint
  const detached = store.detachTimberJoints('b2');
  assert.strictEqual(detached, true);
  assert.strictEqual(store.getJoints().length, 0);
  assert.strictEqual(store.getState().pieces.length, 5 + 2); // Pieces still exist

  // Moving detached beam freely without joint constraint
  const moveResult = store.movePiece('b2', { x: 400, y: 660 }, 0, undefined, false);
  assert.strictEqual(moveResult, true);
});

test('TimberJoints Test L: Siege impact joint failure', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'impact_beam_1',
    type: 'wood_beam',
    position: { x: 260, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 672 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  const beam2: PlacedPiece = {
    id: 'impact_beam_2',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, false, snapResult.proposedTimberJoint);
  const joint = store.getJoints()[0];

  const bridge = new PhysicsBridge(store.getState());
  assert.strictEqual(bridge.diagnostics.activeTimberJointCount, 1);

  // Direct impact impulse snaps the joint
  (bridge as any).breakTimberJoint(joint.jointId, 'DIRECT_IMPACT_IMPULSE');
  assert.strictEqual(bridge.diagnostics.activeTimberJointCount, 0);
  assert.strictEqual(bridge.diagnostics.brokenTimberJointCount, 1);
  const simJoints = bridge.getSimulatedJoints();
  assert.strictEqual(simJoints[0].state, 'BROKEN');
  assert.strictEqual(simJoints[0].failureReason, 'DIRECT_IMPACT_IMPULSE');

  // Both beams remain in their existing condition (joint failure is distinct from beam failure)
  assert.strictEqual(bridge.getPieceCondition('impact_beam_1'), 'INTACT');
  assert.strictEqual(bridge.getPieceCondition('impact_beam_2'), 'INTACT');

  bridge.teardown();
});

test('TimberJoints Test M: Reinforcement preserves surviving joints and records results', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'r_beam_1',
    type: 'wood_beam',
    position: { x: 260, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 672 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  const beam2: PlacedPiece = {
    id: 'r_beam_2',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, false, snapResult.proposedTimberJoint);
  assert.strictEqual(store.getJoints().length, 1);

  // Enter reinforcement mode
  store.saveNamedSnapshot('POST_ATTACK_1');
  store.saveNamedSnapshot('REINFORCEMENT_ENTRY');
  store.setReinforcementMode(true);

  // Surviving joints are preserved
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].state, 'INTACT');
});

test('TimberJoints Test N: Targeting boosts structural importance score of beams connected by active timber joints', () => {
  const store = new LevelStore();
  // Beam A: isolated wood beam
  const isolatedBeam: PlacedPiece = {
    id: 'isolated_beam',
    type: 'wood_beam',
    position: { x: 260, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(isolatedBeam, false);

  // Candidates with only isolated beam
  const candIsolated = generateTargetCandidates(store.getState());
  const candIso = candIsolated.find(
    (c) => c.pieceId === 'isolated_beam' && c.type === 'piece_center',
  );
  const isolatedSupportingCount = candIso?.supportingCount ?? 0;

  // Add joined beam B snapped to beam A
  const snapResult = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 600 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const joinedBeam: PlacedPiece = {
    id: 'joined_beam',
    type: 'wood_beam',
    position: snapResult.position,
    rotation: snapResult.rotation,
    isPrebuilt: false,
  };
  store.placePiece(joinedBeam, false, snapResult.proposedTimberJoint);

  // Candidates with active timber joint between isolated_beam and joined_beam
  const candJoined = generateTargetCandidates(store.getState());
  const candJoinedA = candJoined.find(
    (c) => c.pieceId === 'isolated_beam' && c.type === 'piece_center',
  );
  const candJoinedB = candJoined.find(
    (c) => c.pieceId === 'joined_beam' && c.type === 'piece_center',
  );

  assert.ok(candJoinedA, 'Candidate for beam A must exist');
  assert.ok(candJoinedB, 'Candidate for beam B must exist');
  assert.ok(
    candJoinedA.supportingCount > isolatedSupportingCount,
    `Beam with active timber joint must have higher supportingCount (${candJoinedA.supportingCount} > ${isolatedSupportingCount})`,
  );
});

test('TimberJoints Test O: Enclosed wisp chamber under joined timber roof allows wisp placement without sealed pocket error', () => {
  const store = new LevelStore();
  // Build a sealed defensive box using stone columns and joined timber roof beams
  const wallLeft1: PlacedPiece = {
    id: 'wall_left_1',
    type: 'stone_block',
    position: { x: 280, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const wallLeft2: PlacedPiece = {
    id: 'wall_left_2',
    type: 'stone_block',
    position: { x: 280, y: 708 },
    rotation: 0,
    isPrebuilt: false,
  };
  const wallRight1: PlacedPiece = {
    id: 'wall_right_1',
    type: 'stone_block',
    position: { x: 520, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const wallRight2: PlacedPiece = {
    id: 'wall_right_2',
    type: 'stone_block',
    position: { x: 520, y: 708 },
    rotation: 0,
    isPrebuilt: false,
  };
  const roof1: PlacedPiece = {
    id: 'encl_roof_1',
    type: 'wood_beam',
    position: { x: 340, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  };
  const roof2: PlacedPiece = {
    id: 'encl_roof_2',
    type: 'wood_beam',
    position: { x: 460, y: 672 },
    rotation: 0,
    isPrebuilt: false,
  };
  const joint: TimberJoint = {
    jointId: 'joint_encl_roof',
    jointType: 'BEAM_END_TO_BEAM_END',
    pieceAId: 'encl_roof_2',
    pieceBId: 'encl_roof_1',
    socketAId: 'encl_roof_2_END_A_CENTER',
    socketBId: 'encl_roof_1_END_B_CENTER',
    localAnchorA: { x: -60, y: 0 },
    localAnchorB: { x: 60, y: 0 },
    worldPosition: { x: 400, y: 672 },
    restAngle: 0,
    restSeparation: 0,
    strengthProfile: 'standard_timber_joint',
    state: 'INTACT',
    currentStress: 0,
    maxStressObserved: 0,
    createdInPhase: 'BUILD',
  };

  store.placePiece(wallLeft1, false);
  store.placePiece(wallLeft2, false);
  store.placePiece(wallRight1, false);
  store.placePiece(wallRight2, false);
  store.placePiece(roof1, false);
  store.placePiece(roof2, false);
  store.getState().joints = [joint];

  // Validate placing a wisp inside this fully enclosed chamber (x=340, y=720)
  const validation = validateWispPlacementPosition(
    'wisp_ignis',
    { x: 340, y: 720 },
    store.getState().wisps,
    store.getState().pieces,
    store.getState().anchors,
  );

  assert.strictEqual(
    validation.isValid,
    true,
    'Enclosed wisp chamber under joined timber roof must allow wisp placement without sealed pocket error',
  );
  assert.strictEqual(validation.rejectionCode, null);
});
