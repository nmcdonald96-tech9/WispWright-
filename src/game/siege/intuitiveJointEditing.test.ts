/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { solveSnapAndValidation } from '../math/snapSolver';
import { getLocalFaceDefinitions, getPieceFacesForTransform } from '../math/geometry';
import { LevelStore } from '../state/levelStore';
import { PhysicsBridge } from '../physics/physicsBridge';
import { TIMBER_JOINT_PROFILES } from '../config';
import { PlacedPiece } from '../types';

test('Test 1 (Scenario A): Dragging a connected beam enters joint-edit preview without manual detach and commits cleanly', () => {
  const store = new LevelStore();
  const beamA: PlacedPiece = {
    id: 'beam_a',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beamA, false);

  const initialSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 380, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beamB: PlacedPiece = {
    id: 'beam_b',
    type: 'wood_beam',
    position: initialSnap.position,
    rotation: initialSnap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beamB, true, initialSnap.proposedTimberJoint);
  assert.strictEqual(store.getJoints().length, 1);

  // Begin drag edit transaction without clicking Detach Joint
  const snapshot = store.beginJointEditTransaction('beam_b');
  assert.ok(snapshot, 'Joint edit transaction snapshot must be captured');
  assert.strictEqual(snapshot.affectedJoints.length, 1);

  // Drag beam_b away to free space (x=420, y=540)
  const dragSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 420, y: 540 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    'beam_b',
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  assert.strictEqual(dragSnap.isValid, true, 'Connected beam must not be blocked by JOINT_DETACH_REQUIRED');
  assert.strictEqual(dragSnap.placementRejectionReason ?? null, null);
  assert.strictEqual(dragSnap.removedJoints?.length, 1, 'Original joint should be marked for removal in preview');

  // Commit move without manual detach
  const moved = store.movePiece(
    'beam_b',
    dragSnap.position,
    dragSnap.rotation,
    undefined,
    true,
    dragSnap.proposedTimberJoints,
  );
  assert.strictEqual(moved, true, 'Move must succeed without manual detachment');
  assert.strictEqual(store.getJoints().length, 0, 'Obsolete joint automatically removed on commit');
  assert.strictEqual(store.activeJointEditTransaction, null, 'Transaction cleared on commit');
});

test('Test 2 (Scenario C): Rotating a connected beam in place works without manual detach and updates joint state', () => {
  const store = new LevelStore();
  const beamA: PlacedPiece = {
    id: 'rot_beam_a',
    type: 'wood_beam',
    position: { x: 260, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beamA, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 400, y: 600 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beamB: PlacedPiece = {
    id: 'rot_beam_b',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beamB, true, snap.proposedTimberJoint);
  assert.strictEqual(store.getJoints().length, 1);

  // Rotate connected beamB by +45 deg around its center without manual detach
  const rotated = store.rotatePiece('rot_beam_b', Math.PI / 4, true);
  assert.strictEqual(rotated, true, 'Connected beam must rotate without manual detach');
  // Since rotating around center pulls END_A_CENTER away from beam_a's END_B_CENTER, obsolete joint is removed
  assert.strictEqual(store.getJoints().length, 0, 'Incompatible joint after center rotation is automatically removed');

  // Undo restores both original angle and original joint
  store.undo();
  const restoredB = store.getState().pieces.find((p) => p.id === 'rot_beam_b')!;
  assert.ok(Math.abs(restoredB.rotation - 0) < 0.001);
  assert.strictEqual(store.getJoints().length, 1, 'Undo restores original joint');
});

test('Test 3 (Scenario B): Cancelled edit restores original transform and original joints with zero history/revision changes', () => {
  const store = new LevelStore();
  const beamA: PlacedPiece = {
    id: 'cancel_a',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beamA, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 400, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beamB: PlacedPiece = {
    id: 'cancel_b',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beamB, true, snap.proposedTimberJoint);

  const origPos = { ...beamB.position };
  const origJointId = store.getJoints()[0].jointId;
  const origUndoCount = store.getUndoCount();
  const origRevision = store.currentConstructionRevision;

  // Start transaction and mutate piece during preview
  store.beginJointEditTransaction('cancel_b');
  beamB.position = { x: 500, y: 500 };
  beamB.rotation = Math.PI / 3;

  // Cancel transaction
  const cancelled = store.cancelJointEditTransaction('USER_CANCELLED');
  assert.strictEqual(cancelled, true);

  const afterB = store.getState().pieces.find((p) => p.id === 'cancel_b')!;
  assert.deepStrictEqual(afterB.position, origPos);
  assert.strictEqual(afterB.rotation, 0);
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].jointId, origJointId);
  assert.strictEqual(store.getUndoCount(), origUndoCount, 'Cancel must not push undo entry');
  assert.strictEqual(store.currentConstructionRevision, origRevision, 'Cancel must not increment revision');
});

test('Test 4 (Scenario D): Invalid release restores original transform and original joints', () => {
  const store = new LevelStore();
  const beamA: PlacedPiece = {
    id: 'inv_a',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beamA, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 400, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beamB: PlacedPiece = {
    id: 'inv_b',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beamB, true, snap.proposedTimberJoint);
  const origPos = { ...beamB.position };

  store.beginJointEditTransaction('inv_b');

  // Drag directly into ground / overlapping beam body with snap disabled (invalid overlap)
  const invalidSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 260, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    false,
    'inv_b',
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  assert.strictEqual(invalidSnap.isValid, false, 'Overlapping another beam body must be invalid');

  // Release on invalid position triggers transaction cancel
  store.cancelJointEditTransaction('INVALID_RELEASE_LOCATION');
  const restored = store.getState().pieces.find((p) => p.id === 'inv_b')!;
  assert.deepStrictEqual(restored.position, origPos);
  assert.strictEqual(store.getJoints().length, 1);
});

test('Test 5 (Scenario E): Multi-joint piece edit preserves still-valid joints and removes only obsolete joints', () => {
  const store = new LevelStore();
  // Left beam at x=216, y=600 (END_B_CENTER at x=288, y=600)
  const leftBeam: PlacedPiece = {
    id: 'multi_left',
    type: 'wood_beam',
    position: { x: 216, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  // Right beam at x=504, y=600 (END_A_CENTER at x=432, y=600)
  const rightBeam: PlacedPiece = {
    id: 'multi_right',
    type: 'wood_beam',
    position: { x: 504, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(leftBeam, false);
  store.placePiece(rightBeam, false);

  // Center beam at x=360, y=600 spans from x=288 (END_A_CENTER) to x=432 (END_B_CENTER), connecting to BOTH!
  const snapCenter = solveSnapAndValidation(
    'wood_beam',
    { x: 360, y: 600 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapCenter.isValid, true);
  assert.strictEqual(
    snapCenter.proposedTimberJoints?.length,
    2,
    'Center bridge beam must propose joints at BOTH ends simultaneously',
  );

  const centerBeam: PlacedPiece = {
    id: 'multi_center',
    type: 'wood_beam',
    position: snapCenter.position,
    rotation: snapCenter.rotation,
    isPrebuilt: false,
  };
  store.placePiece(centerBeam, true, snapCenter.proposedTimberJoints);
  assert.strictEqual(store.getJoints().length, 2, 'Both joints must be created');

  // Now move rightBeam away so only leftBeam remains at x=300, and add a top T-joint on multi_center so multi_center has 2 joints:
  store.removePiece('multi_right', false);
  const topPostSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 360, y: 530 },
    Math.PI / 2,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, existingJoints: store.getJoints() },
  );
  const topPost: PlacedPiece = {
    id: 'multi_top_post',
    type: 'wood_beam',
    position: topPostSnap.position,
    rotation: topPostSnap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(topPost, false, topPostSnap.proposedTimberJoints);
  assert.strictEqual(store.getJointsForPiece('multi_center').length, 2);

  // Move multi_top_post slightly away from center socket but snap to multi_left's END_A_CENTER (144, 600 -> center at 144, 528)
  const movedPostSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 144, y: 528 },
    Math.PI / 2,
    store.getState().pieces,
    store.getState().anchors,
    true,
    'multi_top_post',
    { preferredRotation: Math.PI / 2, existingJoints: store.getJoints() },
  );
  store.movePiece(
    'multi_top_post',
    movedPostSnap.position,
    movedPostSnap.rotation,
    undefined,
    true,
    movedPostSnap.proposedTimberJoints,
  );

  // Verify the original joint between multi_center and multi_left is untouched
  const remainingCenterJoints = store.getJointsForPiece('multi_center');
  assert.strictEqual(remainingCenterJoints.length, 1);
  assert.ok(
    remainingCenterJoints[0].pieceAId === 'multi_left' ||
      remainingCenterJoints[0].pieceBId === 'multi_left',
  );
});

test('Test 6 (Scenario F): Horizontal end-to-end splice creates TIMBER_SPLICE', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'splice_h1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 398, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionTaxonomy, 'TIMBER_SPLICE');
  assert.strictEqual(snap.proposedTimberJoint?.jointType, 'TIMBER_SPLICE');
  assert.strictEqual(snap.proposedTimberJoint?.strengthProfile, 'TIMBER_SPLICE');
  assert.strictEqual(snap.penetrationDepth, 0);
});

test('Test 7 (Scenario G): Vertical post splice creates TIMBER_SPLICE', () => {
  const store = new LevelStore();
  const post1: PlacedPiece = {
    id: 'splice_v1',
    type: 'wood_beam',
    position: { x: 260, y: 700 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };
  store.placePiece(post1, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 260, y: 562 },
    Math.PI / 2,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionTaxonomy, 'TIMBER_SPLICE');
  assert.strictEqual(snap.proposedTimberJoint?.jointType, 'TIMBER_SPLICE');
  assert.strictEqual(snap.penetrationDepth, 0);
});

test('Test 8 (Scenario H): Angled beam to flat top face of wood_block creates flush TIMBER_FACE with 0.0px penetration', () => {
  const store = new LevelStore();
  const block: PlacedPiece = {
    id: 'flat_wood_block',
    type: 'wood_block',
    position: { x: 300, y: 700 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(block, false);

  // Verify face geometry helper exposes local & world faces
  const localFaces = getLocalFaceDefinitions('wood_block');
  assert.strictEqual(localFaces.length, 4);
  const worldFaces = getPieceFacesForTransform('wood_block', block.position, block.rotation, block.id);
  assert.ok(worldFaces.some((f) => f.faceId === 'TOP_FACE'));

  // Bring a 45° rotated wood_beam endpoint near the wood_block's TOP_EDGE (x=300, y=676)
  const angle45 = -Math.PI / 4;
  // With END_A_CENTER at (300, 676) and rotation -45°, center is at (300 + 60*cos(-45°), 676 + 60*sin(-45°)) = (342.4, 633.6)
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 342, y: 634 },
    angle45,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: angle45, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true, '45° angled beam on wood_block top face must be valid');
  assert.strictEqual(snap.connectionCategory, 'TIMBER_JOINT');
  assert.ok(
    snap.connectionTaxonomy === 'TIMBER_FACE' || snap.connectionTaxonomy === 'DIAGONAL_BRACE',
  );
  assert.ok(snap.proposedTimberJoint, 'Must propose a timber joint to wood_block');
  assert.strictEqual(snap.penetrationDepth, 0, 'Flush clearance must yield 0.0px interior penetration');
  assert.ok(Math.abs(snap.rotation - angle45) < 0.001, 'Manual 45° angle must be preserved');
});

test('Test 9 (Scenario H): Angled beam to vertical timber post face creates flush DIAGONAL_BRACE / TIMBER_FACE', () => {
  const store = new LevelStore();
  const post: PlacedPiece = {
    id: 'vert_post',
    type: 'wood_beam',
    position: { x: 260, y: 700 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };
  store.placePiece(post, false);

  // Bring a 45° beam's END_A_CENTER toward post's END_A_CENTER (x=260, y=640)
  const angle = -Math.PI / 4;
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 260 + 60 * Math.cos(angle), y: 640 + 60 * Math.sin(angle) },
    angle,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: angle, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionCategory, 'TIMBER_JOINT');
  assert.strictEqual(snap.connectionTaxonomy, 'DIAGONAL_BRACE');
  assert.strictEqual(snap.proposedTimberJoint?.jointType, 'DIAGONAL_BRACE');
  assert.strictEqual(snap.penetrationDepth, 0);
});

test('Test 10 (Scenario I): Two opposed angled rafters (e.g. +35° and -35°) create a ROOF_PEAK joint', () => {
  const store = new LevelStore();
  const slope = (35 * Math.PI) / 180; // 35 deg (within 20°–70° roof peak range)
  const leftRafter: PlacedPiece = {
    id: 'rafter_left',
    type: 'wood_beam',
    position: { x: 300, y: 600 },
    rotation: -slope, // rises up-right to END_B_CENTER
    isPrebuilt: false,
  };
  store.placePiece(leftRafter, false);

  // leftRafter END_B_CENTER is at (300 + 72*cos(-35°), 600 + 72*sin(-35°))
  const apexX = 300 + 72 * Math.cos(-slope);
  const apexY = 600 + 72 * Math.sin(-slope);

  // Right rafter at +35° has END_A_CENTER at apex, so center is at (apexX + 72*cos(35°), apexY + 72*sin(35°))
  const rightCenter = {
    x: apexX + 72 * Math.cos(slope),
    y: apexY + 72 * Math.sin(slope),
  };

  const snap = solveSnapAndValidation(
    'wood_beam',
    rightCenter,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionCategory, 'TIMBER_JOINT');
  assert.strictEqual(snap.connectionTaxonomy, 'ROOF_PEAK');
  assert.strictEqual(snap.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.strictEqual(snap.proposedTimberJoint?.strengthProfile, 'ROOF_PEAK');
});

test('Test 11 (Scenario I): Supported roof peak settles stably under physics', () => {
  const store = new LevelStore();
  const slope = Math.PI / 6; // 30° pitched roof
  // Left support post on ground at x=290, y=756 (top face at y=732)
  const leftPost: PlacedPiece = {
    id: 'sup_post_l',
    type: 'wood_block',
    position: { x: 290, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(leftPost, false);

  // Left rafter with lower end resting on leftPost and joined to it
  const leftRafterSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 290 + 72 * Math.cos(-slope), y: 722 + 72 * Math.sin(-slope) },
    -slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: -slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  const leftRafter: PlacedPiece = {
    id: 'sup_rafter_l',
    type: 'wood_beam',
    position: leftRafterSnap.position,
    rotation: leftRafterSnap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(leftRafter, false, leftRafterSnap.proposedTimberJoints);

  const apexX = leftRafter.position.x + 72 * Math.cos(leftRafter.rotation);
  const apexY = leftRafter.position.y + 72 * Math.sin(leftRafter.rotation);
  const rightCenter = {
    x: apexX + 72 * Math.cos(slope),
    y: apexY + 72 * Math.sin(slope),
  };
  const lowerRightEnd = {
    x: rightCenter.x + 72 * Math.cos(slope),
    y: rightCenter.y + 72 * Math.sin(slope),
  };

  // Support right rafter lower end with a wood block post on ground
  const supportBlock: PlacedPiece = {
    id: 'sup_post_r',
    type: 'wood_block',
    position: { x: lowerRightEnd.x, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(supportBlock, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    rightCenter,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snap.connectionTaxonomy, 'ROOF_PEAK');
  assert.strictEqual(snap.lowerSupportsDetected, true);

  const rightRafter: PlacedPiece = {
    id: 'sup_rafter_r',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(rightRafter, false, snap.proposedTimberJoints);
  assert.ok(store.getJoints().some((j) => j.jointType === 'ROOF_PEAK'));

  const bridge = new PhysicsBridge(store.getState());
  for (let i = 0; i < 60; i++) {
    bridge.step(1000 / 60);
  }
  const simJoints = bridge.getSimulatedJoints().filter((j) => j.jointType === 'ROOF_PEAK');
  assert.strictEqual(simJoints.length, 1);
  assert.notStrictEqual(simJoints[0].state, 'BROKEN', 'Supported roof peak must not break under gravity');
  bridge.teardown();
});

test('Test 12 (Scenario J): Unsupported roof peak spreads or collapses naturally under gravity', () => {
  const store = new LevelStore();
  const slope = Math.PI / 4; // 45° rafters floating in air with no lower support on right rafter
  // Left rafter rests on a narrow pivot block, right rafter has no lower support at all
  const pivotPost: PlacedPiece = {
    id: 'pivot_post',
    type: 'stone_block',
    position: { x: 280, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(pivotPost, false);

  const leftRafter: PlacedPiece = {
    id: 'unsup_rafter_l',
    type: 'wood_beam',
    position: { x: 330, y: 650 },
    rotation: -slope,
    isPrebuilt: false,
  };
  store.placePiece(leftRafter, false);

  const apexX = 330 + 72 * Math.cos(-slope);
  const apexY = 650 + 72 * Math.sin(-slope);
  const rightCenter = {
    x: apexX + 72 * Math.cos(slope),
    y: apexY + 72 * Math.sin(slope),
  };

  const snap = solveSnapAndValidation(
    'wood_beam',
    rightCenter,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, existingJoints: store.getJoints() },
  );
  assert.strictEqual(snap.connectionTaxonomy, 'ROOF_PEAK');
  assert.strictEqual(snap.lowerSupportsDetected, false, 'Unsupported roof peak must report lowerSupportsDetected=false');

  const rightRafter: PlacedPiece = {
    id: 'unsup_rafter_r',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(rightRafter, false, snap.proposedTimberJoint);

  const bridge = new PhysicsBridge(store.getState());
  const startY = rightRafter.position.y;
  for (let i = 0; i < 60; i++) {
    bridge.step(1000 / 60);
  }
  const transforms = bridge.getSimulatedTransforms(store.getState().pieces);
  const afterRight = transforms.find((t) => t.pieceId === 'unsup_rafter_r')!;
  assert.ok(
    afterRight.position.y > startY + 25,
    'Unsupported roof peak must fall/spread under gravity rather than floating rigidly',
  );
  bridge.teardown();
});

test('Test 13 (Scenario K): Diagonal brace creates intentional DIAGONAL_BRACE joints at both ends when spanning post and lintel', () => {
  const store = new LevelStore();
  const angle = -Math.PI / 4; // 45° brace rising from bottom-left to top-right
  const span = 120; // distance between END_A_CENTER (-60, 0) and END_B_CENTER (+60, 0)
  const startSocketPos = { x: 260, y: 660 };
  const endSocketPos = {
    x: startSocketPos.x + span * Math.cos(angle),
    y: startSocketPos.y + span * Math.sin(angle),
  };

  // Post with END_A_CENTER at startSocketPos (260, 660) -> center at (260, 720), rot = PI/2
  const post: PlacedPiece = {
    id: 'brace_post',
    type: 'wood_beam',
    position: { x: startSocketPos.x, y: startSocketPos.y + 60 },
    rotation: Math.PI / 2,
    isPrebuilt: false,
  };
  // Horizontal beam with END_A_CENTER at endSocketPos -> center at (endSocketPos.x + 60, endSocketPos.y), rot = 0
  const lintel: PlacedPiece = {
    id: 'brace_lintel',
    type: 'wood_beam',
    position: { x: endSocketPos.x + 60, y: endSocketPos.y },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(post, false);
  store.placePiece(lintel, false);

  const braceCenter = {
    x: (startSocketPos.x + endSocketPos.x) * 0.5,
    y: (startSocketPos.y + endSocketPos.y) * 0.5,
  };

  const snap = solveSnapAndValidation(
    'wood_beam',
    braceCenter,
    angle,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: angle, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionTaxonomy, 'DIAGONAL_BRACE');
  assert.strictEqual(
    snap.proposedTimberJoints?.length,
    2,
    'Diagonal brace spanning post and lintel sockets must propose joints at BOTH ends',
  );

  const brace: PlacedPiece = {
    id: 'diag_brace',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(brace, true, snap.proposedTimberJoints);
  assert.strictEqual(store.getJoints().length, 2, 'Two DIAGONAL_BRACE joints created');
  assert.ok(store.getJoints().every((j) => j.jointType === 'DIAGONAL_BRACE'));
});

test('Test 14 (Scenario L): T-joint at beam center socket creates TIMBER_T_JOINT', () => {
  const store = new LevelStore();
  const horizontalBeam: PlacedPiece = {
    id: 't_horiz',
    type: 'wood_beam',
    position: { x: 320, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(horizontalBeam, false);

  // Bring vertical post's END_A_CENTER (or END_B_CENTER) to horizontalBeam's SIDE_BOTTOM_CENTER (320, 611)
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 320, y: 681 },
    Math.PI / 2,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionCategory, 'TIMBER_JOINT');
  assert.strictEqual(snap.connectionTaxonomy, 'TIMBER_T_JOINT');
  assert.strictEqual(snap.proposedTimberJoint?.jointType, 'TIMBER_T_JOINT');
  assert.strictEqual(snap.proposedTimberJoint?.strengthProfile, 'TIMBER_T_JOINT');
});

test('Test 15 (Scenario M): Snap-enabled broad beam contact on stone_block creates a breakable face binding', () => {
  const store = new LevelStore();
  const stone: PlacedPiece = {
    id: 'stone_support',
    type: 'stone_block',
    position: { x: 300, y: 700 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(stone, false);

  // Place either horizontal or angled wood_beam on stone_block
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 300, y: 665 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  assert.strictEqual(snap.isValid, true);
  assert.strictEqual(snap.connectionCategory, 'TIMBER_JOINT');
  assert.strictEqual(snap.connectionTaxonomy, 'FACE_BINDING');
  assert.strictEqual(snap.proposedTimberJoint?.jointType, 'TIMBER_FACE');
  assert.strictEqual(snap.proposedTimberJoint?.connectionSubtype, 'FACE_BINDING');
  assert.strictEqual(snap.proposedTimberJoint?.materialPairKey, 'WOOD_STONE');
});

test('Test 16 (Scenario N): Snap OFF prevents automatic joint creation', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'snap_off_1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snapOff = solveSnapAndValidation(
    'wood_beam',
    { x: 425, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    false, // Snap OFF
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );

  assert.strictEqual(snapOff.proposedTimberJoint, null);
  assert.strictEqual(snapOff.proposedTimberJoints?.length ?? 0, 0);
  assert.strictEqual(snapOff.connectionTaxonomy, 'FREE_CONTACT');
});

test('Test 17 (Scenario O): Undo/Redo of automatic connected-piece edit restores exact prior state atomically', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'undo_b1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snap1 = solveSnapAndValidation(
    'wood_beam',
    { x: 400, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beam2: PlacedPiece = {
    id: 'undo_b2',
    type: 'wood_beam',
    position: snap1.position,
    rotation: snap1.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, true, snap1.proposedTimberJoint);
  const origPos = { ...beam2.position };
  const origJointId = store.getJoints()[0].jointId;

  // Move connected beam2 to a new T-joint on beam1's top center (260, 649 -> center at 260, 579, rot = PI/2)
  const snap2 = solveSnapAndValidation(
    'wood_beam',
    { x: 260, y: 579 },
    Math.PI / 2,
    store.getState().pieces,
    store.getState().anchors,
    true,
    'undo_b2',
    { preferredRotation: Math.PI / 2, existingJoints: store.getJoints() },
  );
  const undoBeforeMove = store.getUndoCount();
  store.movePiece('undo_b2', snap2.position, snap2.rotation, undefined, true, snap2.proposedTimberJoints);
  assert.strictEqual(store.getUndoCount(), undoBeforeMove + 1, 'Connected edit must record 1 atomic undo action');
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].jointType, 'TIMBER_T_JOINT');

  // Single Undo restores original splice joint and original horizontal transform
  store.undo();
  const restored = store.getState().pieces.find((p) => p.id === 'undo_b2')!;
  assert.deepStrictEqual(restored.position, origPos);
  assert.strictEqual(restored.rotation, 0);
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].jointId, origJointId);
  assert.strictEqual(store.getJoints()[0].jointType, 'TIMBER_SPLICE');

  // Single Redo re-applies the T-joint edit
  store.redo();
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].jointType, 'TIMBER_T_JOINT');
});

test('Test 18 (Scenario O): Retry Design and Start Over do not duplicate joints after automatic edits', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'retry_b1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 400, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beam2: PlacedPiece = {
    id: 'retry_b2',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, true, snap.proposedTimberJoint);
  store.saveNamedSnapshot('INITIAL_DESIGN');

  // Simulate joint breaking during siege and then Retry Design
  store.getJoints()[0].state = 'BROKEN';
  store.restoreForRetryDesign();
  assert.strictEqual(store.getJoints().length, 1, 'Retry Design must restore exactly 1 joint without duplicates');
  assert.strictEqual(store.getJoints()[0].state, 'INTACT');

  // Start Over clears all joints
  store.resetToDefault();
  assert.strictEqual(store.getJoints().length, 0);
});

test('Test 19 (Scenario H / P): Manual rotation is never overwritten by snap preview unless explicitly accepted', () => {
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'rot_own_1',
    type: 'wood_beam',
    position: { x: 300, y: 650 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const userAngle = -Math.PI / 3; // -60° manual rotation
  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 370 + 70 * Math.cos(userAngle), y: 650 + 70 * Math.sin(userAngle) },
    userAngle,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: userAngle,
      rotationSource: 'USER',
      acceptSnapRotation: false,
      existingJoints: store.getJoints(),
    },
  );

  assert.strictEqual(snap.isValid, true);
  assert.ok(
    Math.abs(snap.rotation - userAngle) < 0.0001,
    'Committed rotation must equal user preferredRotation (-60°)',
  );
});

test('Test 20 (Scenario P): Centralized TIMBER_JOINT_PROFILES and one-time non-blocking connection discovery hints', () => {
  // Verify all required centralized profiles exist in config
  assert.ok(TIMBER_JOINT_PROFILES.TIMBER_SPLICE);
  assert.ok(TIMBER_JOINT_PROFILES.TIMBER_FACE);
  assert.ok(TIMBER_JOINT_PROFILES.ROOF_PEAK);
  assert.ok(TIMBER_JOINT_PROFILES.DIAGONAL_BRACE);
  assert.ok(TIMBER_JOINT_PROFILES.TIMBER_T_JOINT);
  assert.ok(TIMBER_JOINT_PROFILES.ENVIRONMENTAL_ANCHOR);

  // Verify one-time discovery hints trigger once per category and can be dismissed
  const store = new LevelStore();
  const beam1: PlacedPiece = {
    id: 'hint_b1',
    type: 'wood_beam',
    position: { x: 260, y: 660 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(beam1, false);

  const snap = solveSnapAndValidation(
    'wood_beam',
    { x: 400, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store.getJoints() },
  );
  const beam2: PlacedPiece = {
    id: 'hint_b2',
    type: 'wood_beam',
    position: snap.position,
    rotation: snap.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam2, true, snap.proposedTimberJoint);
  assert.ok(store.activeConnectionHint, 'First splice should set a non-blocking discovery hint');
  store.dismissConnectionHint();
  assert.strictEqual(store.activeConnectionHint, null, 'Dismissing hint clears activeConnectionHint');
});
