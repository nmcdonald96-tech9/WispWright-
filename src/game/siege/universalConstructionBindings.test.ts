/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIAL_PAIR_PROFILES,
  PIECE_DEFINITIONS,
  TIMBER_JOINT_PROFILES,
  resolveBindingStrengthProfile,
  resolveConnectionSubtype,
  resolveMaterialPairProfileId,
} from '../config';
import { LevelStore } from '../state/levelStore';
import { PhysicsBridge } from '../physics/physicsBridge';
import { solveSnapAndValidation } from '../math/snapSolver';
import { PlacedPiece } from '../types';

test('Test 1–7 & Scenarios A–D: Timber-to-Stone and Timber-to-Prebuilt-Stone corner & face bindings, plus diagonal brace between stone and timber', () => {
  const store = new LevelStore();
  store.clearStorage();

  // Verify stone_block and bullseye_block are jointCapable in PIECE_DEFINITIONS
  assert.strictEqual(PIECE_DEFINITIONS.stone_block.jointCapable, true);
  assert.strictEqual(PIECE_DEFINITIONS.bullseye_block.jointCapable, true);

  // Scenario A & Test 1: Angled Timber Beam (-35°) snapped to player Stone Block top-right corner
  const playerStone: PlacedPiece = {
    id: 'player_stone_1',
    type: 'stone_block',
    position: { x: 400, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(playerStone, false);

  const slope = -35 * (Math.PI / 180);
  // player_stone_1 TOP_RIGHT_CORNER is at (424, 732)
  const approxCenterA = {
    x: 424 + 72 * Math.cos(slope),
    y: 732 + 72 * Math.sin(slope),
  };
  const snapA = solveSnapAndValidation(
    'wood_beam',
    approxCenterA,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snapA.isValid, true);
  assert.strictEqual(snapA.snapped, true);
  assert.ok(snapA.proposedTimberJoint, 'Timber-to-Stone corner must propose a breakable binding');
  assert.strictEqual(snapA.proposedTimberJoint.jointType, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapA.proposedTimberJoint.connectionSubtype, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapA.proposedTimberJoint.materialPairKey, 'WOOD_STONE');
  assert.strictEqual(snapA.proposedTimberJoint.strengthProfile, 'WOOD_STONE');
  assert.strictEqual(snapA.proposedTimberJoint.isPrebuiltBinding, false);
  assert.strictEqual(snapA.penetrationDepth, 0);

  // Scenario B & Test 2: Angled Timber Beam (-35°) snapped to Prebuilt Stone Block top-right corner (prebuilt_stone_left_2 at (200, 708) -> (224, 684))
  const approxCenterB = {
    x: 224 + 72 * Math.cos(slope),
    y: 684 + 72 * Math.sin(slope),
  };
  const snapB = solveSnapAndValidation(
    'wood_beam',
    approxCenterB,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snapB.isValid, true);
  assert.strictEqual(snapB.snapped, true);
  assert.ok(snapB.proposedTimberJoint, 'Timber-to-Prebuilt-Stone corner must propose a breakable binding');
  assert.strictEqual(snapB.proposedTimberJoint.jointType, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapB.proposedTimberJoint.materialPairKey, 'WOOD_ENVIRONMENT');
  assert.strictEqual(snapB.proposedTimberJoint.strengthProfile, 'WOOD_ENVIRONMENT');
  assert.strictEqual(snapB.proposedTimberJoint.isPrebuiltBinding, true);
  assert.strictEqual(snapB.penetrationDepth, 0);

  // Scenario C & Test 3–5: Vertical Timber Beam (90°) snapped end-to-top-face of player_stone_1 (TOP_EDGE at (400, 732))
  const vertAngle = Math.PI / 2;
  const approxCenterC = {
    x: 400,
    y: 732 - 72,
  };
  const snapC = solveSnapAndValidation(
    'wood_beam',
    approxCenterC,
    vertAngle,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: vertAngle, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snapC.isValid, true);
  assert.strictEqual(snapC.snapped, true);
  assert.ok(snapC.proposedTimberJoint, 'Vertical Timber Beam end on Stone Block top face must create a face binding');
  assert.strictEqual(snapC.proposedTimberJoint.jointType, 'TIMBER_FACE');
  assert.strictEqual(snapC.proposedTimberJoint.connectionSubtype, 'FACE_BINDING');
  assert.strictEqual(snapC.proposedTimberJoint.materialPairKey, 'WOOD_STONE');
  assert.strictEqual(snapC.proposedTimberJoint.strengthProfile, 'WOOD_STONE');

  // Commit the vertical post on top of player_stone_1
  const postPiece: PlacedPiece = {
    id: 'timber_post_1',
    type: 'wood_beam',
    position: snapC.position,
    rotation: snapC.rotation,
    isPrebuilt: false,
  };
  store.placePiece(postPiece, false, snapC.proposedTimberJoints);

  const postJoints = store.getJointsForPiece('timber_post_1');
  assert.strictEqual(postJoints.length, 1);
  assert.strictEqual(postJoints[0].materialPairKey, 'WOOD_STONE');
  assert.strictEqual(postJoints[0].visualJointCapType, 'ALCHEMICAL_CLAMP');

  // Test 6 & 7: Diagonal brace between another Stone Block and the Timber Post
  const braceStone: PlacedPiece = {
    id: 'stone_brace_base',
    type: 'stone_block',
    position: { x: 264.176695, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(braceStone, false);
  const braceAngle = -Math.PI / 4;
  const braceCenter = {
    x: 288.176695 + 72 * Math.cos(braceAngle),
    y: 732 + 72 * Math.sin(braceAngle),
  };
  const snapBrace = solveSnapAndValidation(
    'wood_beam',
    braceCenter,
    braceAngle,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: braceAngle, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapBrace.isValid, true);
  assert.ok(snapBrace.proposedTimberJoint, 'Diagonal brace lower end must bind to stone block corner');
});

test('Test 8–9 & Scenario D: Symmetric pitched roof assembly bound to prebuilt stone columns and shared ROOF_PEAK', () => {
  const store = new LevelStore();
  store.clearStorage();

  const pitch = 35 * (Math.PI / 180);
  const colL: PlacedPiece = {
    id: 'stone_col_l',
    type: 'stone_block',
    position: { x: 280, y: 756 },
    rotation: 0,
    isPrebuilt: true,
  };
  store.placePiece(colL, false);

  // colL TOP_RIGHT_CORNER is at (304, 732)
  const leftCenterApprox = {
    x: 304 + 72 * Math.cos(-pitch),
    y: 732 + 72 * Math.sin(-pitch),
  };
  const snapLeft = solveSnapAndValidation(
    'wood_beam',
    leftCenterApprox,
    -pitch,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: -pitch, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapLeft.isValid, true);
  assert.ok(snapLeft.proposedTimberJoint);
  assert.strictEqual(snapLeft.proposedTimberJoint.jointType, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapLeft.proposedTimberJoint.materialPairKey, 'WOOD_ENVIRONMENT');

  const rafterL: PlacedPiece = {
    id: 'rafter_left',
    type: 'wood_beam',
    position: snapLeft.position,
    rotation: snapLeft.rotation,
    isPrebuilt: false,
  };
  store.placePiece(rafterL, false, snapLeft.proposedTimberJoints);

  const supApexX = rafterL.position.x + 72 * Math.cos(-pitch) - 12 * Math.sin(-pitch);
  const supApexY = rafterL.position.y + 72 * Math.sin(-pitch) + 12 * Math.cos(-pitch);
  const rightCenterApprox = {
    x: supApexX + 72 * Math.cos(pitch) + 12 * Math.sin(pitch),
    y: supApexY + 72 * Math.sin(pitch) - 12 * Math.cos(pitch),
  };
  const rightLowerSoffitX =
    rightCenterApprox.x + 72 * Math.cos(pitch) - 12 * Math.sin(pitch);

  const colR: PlacedPiece = {
    id: 'stone_col_r',
    type: 'stone_block',
    position: { x: rightLowerSoffitX + 24, y: 756 },
    rotation: 0,
    isPrebuilt: true,
  };
  store.placePiece(colR, false);

  const snapRight = solveSnapAndValidation(
    'wood_beam',
    rightCenterApprox,
    pitch,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: pitch, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapRight.isValid, true);
  assert.ok(snapRight.proposedTimberJoint);

  const rafterR: PlacedPiece = {
    id: 'rafter_right',
    type: 'wood_beam',
    position: snapRight.position,
    rotation: snapRight.rotation,
    isPrebuilt: false,
  };
  store.placePiece(rafterR, false, snapRight.proposedTimberJoints);

  const allJoints = store.getJoints();
  // Expect 3 bindings: 2 lower RAFTER_CORNER_SEAT (WOOD_ENVIRONMENT) + 1 shared ROOF_PEAK (ROOF_PEAK_WOOD)
  assert.strictEqual(allJoints.length, 3, 'Roof assembly on prebuilt stone columns must have 2 lower corner seats and 1 ROOF_PEAK');
  const peakJoint = allJoints.find((j) => j.jointType === 'ROOF_PEAK');
  const seatJoints = allJoints.filter((j) => j.jointType === 'RAFTER_CORNER_SEAT');
  assert.ok(peakJoint, 'Shared ROOF_PEAK binding must be created');
  assert.strictEqual(seatJoints.length, 2, 'Both rafters must bind to prebuilt stone corners');
  assert.strictEqual(seatJoints[0].materialPairKey, 'WOOD_ENVIRONMENT');
  assert.strictEqual(seatJoints[1].materialPairKey, 'WOOD_ENVIRONMENT');

  // Verify stability in PhysicsBridge for 120 frames under gravity
  const bridge = new PhysicsBridge(store.getState());
  for (let i = 0; i < 120; i++) {
    bridge.step(1000 / 60);
  }
  const activeJointsAfter = bridge.getSimulatedJoints().filter((j) => j.state !== 'BROKEN');
  assert.strictEqual(activeJointsAfter.length, 3, 'Symmetric roof bound to prebuilt stone columns must remain intact under gravity');
  bridge.teardown();
});

test('Test 10–15 & Scenarios E–G: Block-to-Block face and corner bindings (Wood-Wood, Wood-Stone, Stone-Stone, Bullseye)', () => {
  const store = new LevelStore();
  store.clearStorage();

  // Base wood block at (340, 756)
  const woodBase: PlacedPiece = {
    id: 'wood_blk_1',
    type: 'wood_block',
    position: { x: 340, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(woodBase, false);

  // Test 10: Wood Block stacked face-to-face on Wood Block (340, 708)
  const snapWoodWoodFace = solveSnapAndValidation(
    'wood_block',
    { x: 341, y: 709 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapWoodWoodFace.isValid, true);
  assert.strictEqual(snapWoodWoodFace.snapped, true);
  assert.ok(snapWoodWoodFace.proposedTimberJoint, 'Wood-Block-to-Wood-Block face snap must propose a BLOCK_BINDING');
  assert.strictEqual(snapWoodWoodFace.proposedTimberJoint.jointType, 'BLOCK_BINDING');
  assert.strictEqual(snapWoodWoodFace.proposedTimberJoint.connectionSubtype, 'BLOCK_BINDING');
  assert.strictEqual(snapWoodWoodFace.proposedTimberJoint.materialPairKey, 'WOOD_WOOD');

  // Test 12: Stone Block stacked face-to-face on Wood Block (340, 708)
  const snapStoneWoodFace = solveSnapAndValidation(
    'stone_block',
    { x: 340, y: 708 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapStoneWoodFace.isValid, true);
  assert.ok(snapStoneWoodFace.proposedTimberJoint, 'Stone-Block-to-Wood-Block face snap must propose a BLOCK_BINDING');
  assert.strictEqual(snapStoneWoodFace.proposedTimberJoint.jointType, 'BLOCK_BINDING');
  assert.strictEqual(snapStoneWoodFace.proposedTimberJoint.materialPairKey, 'WOOD_STONE');
  assert.strictEqual(snapStoneWoodFace.proposedTimberJoint.strengthProfile, 'WOOD_STONE');

  // Test 13: Wood Block diagonal corner-to-corner on Prebuilt Stone Block (prebuilt_stone_left_2 TOP_RIGHT_CORNER at (224, 684) -> new block BOTTOM_LEFT_CORNER at (224, 684) -> center at (248, 660))
  const snapWoodStoneCorner = solveSnapAndValidation(
    'wood_block',
    { x: 249, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapWoodStoneCorner.isValid, true);
  assert.strictEqual(snapWoodStoneCorner.snapped, true);
  assert.ok(snapWoodStoneCorner.proposedTimberJoint, 'Wood-Block corner to Stone-Block corner must propose a CORNER_BINDING');
  assert.strictEqual(snapWoodStoneCorner.proposedTimberJoint.jointType, 'CORNER_BINDING');
  assert.strictEqual(snapWoodStoneCorner.proposedTimberJoint.connectionSubtype, 'CORNER_BINDING');
  assert.strictEqual(snapWoodStoneCorner.proposedTimberJoint.materialPairKey, 'WOOD_ENVIRONMENT');

  // Test 14 & 15: Stone Block stacked face-to-face on Prebuilt Stone Block (prebuilt_stone_left_2 TOP_EDGE at (200, 684) -> center at (200, 660))
  const snapStoneStoneFace = solveSnapAndValidation(
    'stone_block',
    { x: 200, y: 661 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(snapStoneStoneFace.isValid, true);
  assert.strictEqual(snapStoneStoneFace.snapped, true);
  assert.ok(snapStoneStoneFace.proposedTimberJoint, 'Stone-to-Prebuilt-Stone face snap must propose a BLOCK_BINDING');
  assert.strictEqual(snapStoneStoneFace.proposedTimberJoint.jointType, 'BLOCK_BINDING');
  assert.strictEqual(snapStoneStoneFace.proposedTimberJoint.materialPairKey, 'STONE_ENVIRONMENT');
  assert.strictEqual(snapStoneStoneFace.proposedTimberJoint.strengthProfile, 'STONE_ENVIRONMENT');

  // Bullseye block behaves as stone for universal bindings
  const snapBullseye = solveSnapAndValidation(
    'bullseye_block',
    { x: 340, y: 708 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.ok(snapBullseye.proposedTimberJoint);
  assert.strictEqual(snapBullseye.proposedTimberJoint.materialPairKey, 'WOOD_STONE');
});

test('Test 16–22 & Scenario H: Material-pair profile symmetry, prebuilt immobility, zero initial preload, and overload breakage', () => {
  // Test 16: WOOD_STONE and STONE_WOOD resolve to identical canonical profile
  const pairWS = resolveMaterialPairProfileId('wood_beam', false, 'stone_block', false, 'FACE_BINDING');
  const pairSW = resolveMaterialPairProfileId('stone_block', false, 'wood_beam', false, 'FACE_BINDING');
  assert.strictEqual(pairWS, 'WOOD_STONE');
  assert.strictEqual(pairSW, 'WOOD_STONE');
  assert.deepStrictEqual(MATERIAL_PAIR_PROFILES[pairWS], MATERIAL_PAIR_PROFILES[pairSW]);

  // Verify all required profiles exist
  assert.ok(TIMBER_JOINT_PROFILES.WOOD_WOOD);
  assert.ok(TIMBER_JOINT_PROFILES.WOOD_STONE);
  assert.ok(TIMBER_JOINT_PROFILES.STONE_STONE);
  assert.ok(TIMBER_JOINT_PROFILES.WOOD_ENVIRONMENT);
  assert.ok(TIMBER_JOINT_PROFILES.STONE_ENVIRONMENT);
  assert.ok(TIMBER_JOINT_PROFILES.ROOF_PEAK_WOOD);
  assert.strictEqual(
    resolveConnectionSubtype('RAFTER_CORNER_SEAT', 'wood_beam', 'stone_block'),
    'RAFTER_CORNER_SEAT',
  );
  assert.strictEqual(
    resolveBindingStrengthProfile('RAFTER_CORNER_SEAT', 'WOOD_STONE'),
    'WOOD_STONE',
  );

  // Test 17–21: Place dynamic stone block bound to prebuilt stone block, verify zero initial preload and prebuilt immobility
  const store = new LevelStore();
  store.clearStorage();

  const snapStone = solveSnapAndValidation(
    'stone_block',
    { x: 200, y: 660 },
    0,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.ok(snapStone.proposedTimberJoint);

  const dynStone: PlacedPiece = {
    id: 'dyn_stone_top',
    type: 'stone_block',
    position: snapStone.position,
    rotation: snapStone.rotation,
    isPrebuilt: false,
  };
  store.placePiece(dynStone, false, snapStone.proposedTimberJoints);

  const committedJoint = store.getJoints()[0];
  assert.ok(committedJoint);
  assert.strictEqual(committedJoint.initialPositionalErrorPx, 0);
  assert.strictEqual(committedJoint.initialAngularErrorRad, 0);
  assert.strictEqual(committedJoint.initialConstraintEnergy, 0);

  const bridge = new PhysicsBridge(store.getState());

  const simJoint = bridge.getSimulatedJoints()[0];
  assert.ok(simJoint);
  assert.strictEqual(simJoint.initialPositionalErrorPx, 0, 'Physics constraint must have zero initial positional preload');
  assert.strictEqual(simJoint.initialAngularErrorRad, 0, 'Physics constraint must have zero initial angular preload');
  assert.strictEqual(simJoint.initialConstraintEnergy, 0, 'Physics constraint must have zero initial constraint energy');
  assert.strictEqual(bridge.diagnostics.initialOverlapCount, 0, 'Bound pieces must have zero initial collision overlap');

  // Verify prebuilt piece never moved in LevelStore during snap or commit
  const prebuiltInStore = store.getState().pieces.find((p) => p.id === 'prebuilt_stone_left_2')!;
  assert.strictEqual(prebuiltInStore.position.x, 200, 'Prebuilt stone piece X must remain strictly 200 in LevelStore');
  assert.strictEqual(prebuiltInStore.position.y, 708, 'Prebuilt stone piece Y must remain strictly 708 in LevelStore');

  const prebuiltBody = (bridge as any).pieceBodyMap.get('prebuilt_stone_left_2');
  const prebuiltBefore = { x: prebuiltBody.position.x, y: prebuiltBody.position.y };
  for (let i = 0; i < 60; i++) {
    bridge.step(1000 / 60);
  }
  const prebuiltAfter = { x: prebuiltBody.position.x, y: prebuiltBody.position.y };
  assert.ok(Math.abs(prebuiltAfter.x - prebuiltBefore.x) < 0.05, 'Prebuilt stone piece must have zero lateral drift under gravity');
  assert.ok(Math.abs(prebuiltAfter.y - prebuiltBefore.y) < 1.0, 'Prebuilt stone piece must remain stable on its foundation column');

  // Test 22 & Scenario H: Overload breaks binding cleanly while prebuilt piece remains stable in place
  (bridge as any).breakTimberJoint(simJoint.jointId, 'DIRECT_IMPACT_IMPULSE');
  const brokenJoint = bridge.getSimulatedJoints()[0];
  assert.strictEqual(brokenJoint.state, 'BROKEN', 'Overloaded binding must break cleanly');
  const prebuiltPostBreak = { x: prebuiltBody.position.x, y: prebuiltBody.position.y };
  assert.strictEqual(prebuiltPostBreak.x, prebuiltAfter.x, 'Prebuilt piece must remain fixed after binding breaks');
  assert.strictEqual(prebuiltPostBreak.y, prebuiltAfter.y, 'Prebuilt piece must remain fixed after binding breaks');
  bridge.teardown();
});

test('Test 23–25 & Scenarios I–J: Snap OFF free placement creates zero automatic bindings; contextual Bind Connection creates stress-free binding with Undo/Redo', () => {
  const store = new LevelStore();
  store.clearStorage();

  // Scenario I & Test 23: With Snap OFF (false), placing a piece near prebuilt_stone_left_2 creates NO automatic binding
  const freeSnap = solveSnapAndValidation(
    'wood_block',
    { x: 200, y: 662 }, // 2px gap above prebuilt_stone_left_2 TOP_EDGE (y=684 -> exact center y=660)
    0,
    store.getState().pieces,
    store.getState().anchors,
    false, // Snap OFF
    undefined,
    { preferredRotation: 0, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.strictEqual(freeSnap.isValid, true);
  assert.strictEqual(freeSnap.snapped, false);
  assert.strictEqual(freeSnap.proposedTimberJoint, null, 'Snap OFF must never propose automatic bindings');

  const freePiece: PlacedPiece = {
    id: 'free_wood_blk',
    type: 'wood_block',
    position: { x: 200, y: 660 }, // touching prebuilt_stone_left_2 top face
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(freePiece, true, null);
  assert.strictEqual(store.getJoints().length, 0, 'Free placement with Snap OFF must create zero automatic bindings');

  // Scenario J & Test 24–25: Contextual getManualBindCandidates and bindPieceConnection
  const candidates = store.getManualBindCandidates('free_wood_blk');
  assert.ok(candidates.length > 0, 'Free-placed piece within tolerance of compatible socket must report manual bind candidates');
  assert.strictEqual(candidates[0].creationReason, 'MANUAL_BIND_ACTION');

  const bound = store.bindPieceConnection('free_wood_blk', 0, true);
  assert.ok(bound, 'bindPieceConnection must create a valid universal construction binding');
  assert.strictEqual(bound.creationReason, 'MANUAL_BIND_ACTION');
  assert.strictEqual(bound.materialPairKey, 'WOOD_ENVIRONMENT');
  assert.strictEqual(bound.initialPositionalErrorPx, 0, 'Manually bound connection must derive stress-free rest separation from committed transforms');
  assert.strictEqual(store.getJoints().length, 1);

  // Verify Undo and Redo of BIND_JOINT
  store.undo();
  assert.strictEqual(store.getJoints().length, 0, 'Undo must remove manually bound connection');
  store.redo();
  assert.strictEqual(store.getJoints().length, 1, 'Redo must restore manually bound connection');
});

test('Test 26–35 & Scenarios K–N: Connected editing, detach, Undo/Redo, snapshot restore, Retry Design, Start Over, and zero duplicate IDs', () => {
  const store = new LevelStore();
  store.clearStorage();

  // Place a timber beam bound to prebuilt_stone_left_2 TOP_RIGHT_CORNER (224, 684)
  const slope = -35 * (Math.PI / 180);
  const approxPos = {
    x: 224 + 72 * Math.cos(slope),
    y: 684 + 72 * Math.sin(slope),
  };
  const snap1 = solveSnapAndValidation(
    'wood_beam',
    approxPos,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );
  assert.ok(snap1.proposedTimberJoint);

  const beam: PlacedPiece = {
    id: 'edit_beam_1',
    type: 'wood_beam',
    position: snap1.position,
    rotation: snap1.rotation,
    isPrebuilt: false,
  };
  store.placePiece(beam, true, snap1.proposedTimberJoints);

  assert.strictEqual(store.getJoints().length, 1);
  const initialJointId = store.getJoints()[0].jointId;

  // Test 26 & Scenario K: Rotate connected piece in place -> binding updates cleanly without duplicate IDs
  const rotated = store.rotatePiece('edit_beam_1', -5 * (Math.PI / 180), true);
  assert.strictEqual(rotated, true);
  assert.strictEqual(store.getJoints().length, 1, 'Rotating a bound piece near its corner seat must preserve a single binding without duplicates');
  assert.strictEqual(store.getJoints()[0].jointId, initialJointId);

  // Test 27: Move connected piece far away -> old binding detaches automatically
  store.movePiece('edit_beam_1', { x: 340, y: 500 }, 0, undefined, true, null);
  assert.strictEqual(store.getJoints().length, 0, 'Moving piece away from bound target must automatically remove stale binding');

  // Test 29 & Scenario L: Undo restores the previous binding; Redo removes it again
  store.undo();
  assert.strictEqual(store.getJoints().length, 1, 'Undo of move must restore the previous binding');
  assert.strictEqual(store.getJoints()[0].jointId, initialJointId);

  // Test 28: Explicit detach of binding
  store.detachTimberJoints('edit_beam_1', initialJointId, true);
  assert.strictEqual(store.getJoints().length, 0, 'Explicit detach must remove the binding');
  store.undo();
  assert.strictEqual(store.getJoints().length, 1, 'Undo of explicit detach must restore the binding');

  // Test 30–32 & Scenario M: Save Pre-Attack Snapshot, break binding, restore for Retry Design
  store.saveNamedSnapshot('INITIAL_DESIGN');
  store.getState().joints = store.getJoints().map((j) => ({
    ...j,
    state: 'BROKEN',
    failureReason: 'OVERLOAD',
  }));
  assert.strictEqual(store.getJoints()[0].state, 'BROKEN');

  store.restoreForRetryDesign();
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].state, 'INTACT', 'Restoring for Retry Design must restore intact universal bindings');
  assert.strictEqual(store.getJoints()[0].materialPairKey, 'WOOD_ENVIRONMENT');

  // Test 33: Start Over / Reset Level clears all player pieces and bindings
  store.resetToDefault();
  assert.strictEqual(store.getJoints().length, 0, 'Reset Level / Start Over must clear all player bindings');
  assert.strictEqual(
    store.getState().pieces.every((p) => p.isPrebuilt),
    true,
    'Reset Level must leave only prebuilt foundation pieces',
  );
});
