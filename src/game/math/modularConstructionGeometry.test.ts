/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MODULAR CONSTRUCTION GEOMETRY, CORNER JOINTS, AND SYMMETRIC ROOF REFINEMENT
 * Automated Verification Suite (Tests 1–35 & Acceptance Scenarios A–N)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCED_PEAK_MAX_CORRECTION,
  CONSTRUCTION_UNIT,
  GEOMETRY_SCHEMA_VERSION,
  INITIAL_LEVEL_STATE,
  MATERIAL_CONFIGS,
  PIECE_DEFINITIONS,
  TIMBER_JOINT_PROFILES,
} from '../config';
import {
  createOBB,
  getOBBPenetrationDepth,
  getPieceCorners,
  getPieceFaces,
  getPieceSnapSockets,
  Vec2,
} from './geometry';
import {
  buildCanonicalRelationship,
  computePlacementOrderHash,
  computeRoofSupportSummary,
  deriveStressFreeJointGeometryFromCommittedTransforms,
  solveBlockCornerSeat,
  solveBlockCornerSeatFromBlockDrag,
  solveSharedApexRoofPeak,
  solveTimberLCorner,
  verifyMirroredFeatureInvariants,
} from './modularJointSolver';
import { solveSnapAndValidation } from './snapSolver';
import { LevelStore } from '../state/levelStore';
import { PhysicsBridge } from '../physics/physicsBridge';
import { PlacedPiece } from '../types';

test('Tests 1–4 & Scenarios A–B: Authoritative Modular Unit System (48px unit, 1x1 blocks, 3x0.5 beams)', () => {
  assert.strictEqual(CONSTRUCTION_UNIT, 48, 'Base construction unit must be 48px');
  assert.strictEqual(GEOMETRY_SCHEMA_VERSION, 3, 'Geometry schema version must be 3');

  // Verify 1.0 x 1.0 unit blocks (48 x 48 px)
  for (const blockType of ['wood_block', 'stone_block', 'bullseye_block'] as const) {
    const def = PIECE_DEFINITIONS[blockType];
    assert.strictEqual(def.widthUnits, 1.0);
    assert.strictEqual(def.heightUnits, 1.0);
    assert.strictEqual(def.width, 48);
    assert.strictEqual(def.height, 48);
    assert.strictEqual(def.colliderWidth, 48);
    assert.strictEqual(def.colliderHeight, 48);
    assert.strictEqual(def.visualWidth, 48);
    assert.strictEqual(def.visualHeight, 48);
    assert.strictEqual(def.renderingScale, 1.0);
    assert.deepStrictEqual(def.localOrigin, { x: 0, y: 0 });
  }

  // Verify 3.0 x 0.5 unit Timber Beam (144 x 24 px)
  const beamDef = PIECE_DEFINITIONS.wood_beam;
  assert.strictEqual(beamDef.widthUnits, 3.0);
  assert.strictEqual(beamDef.heightUnits, 0.5);
  assert.strictEqual(beamDef.width, 144);
  assert.strictEqual(beamDef.height, 24);
  assert.strictEqual(beamDef.colliderWidth, 144);
  assert.strictEqual(beamDef.colliderHeight, 24);
  assert.strictEqual(beamDef.visualWidth, 144);
  assert.strictEqual(beamDef.visualHeight, 24);
  assert.strictEqual(beamDef.renderingScale, 1.0);

  // Scenario A: 3 adjacent blocks side-by-side equal 1 Timber Beam length (144px) with 0.0px overhang
  const b1: PlacedPiece = { id: 'b1', type: 'stone_block', position: { x: 200, y: 756 }, rotation: 0, isPrebuilt: false };
  const b2: PlacedPiece = { id: 'b2', type: 'stone_block', position: { x: 248, y: 756 }, rotation: 0, isPrebuilt: false };
  const b3: PlacedPiece = { id: 'b3', type: 'stone_block', position: { x: 296, y: 756 }, rotation: 0, isPrebuilt: false };
  const beam: PlacedPiece = { id: 'bm1', type: 'wood_beam', position: { x: 248, y: 720 }, rotation: 0, isPrebuilt: false };

  const leftBlockEdge = b1.position.x - MATERIAL_CONFIGS.stone_block.width / 2;
  const rightBlockEdge = b3.position.x + MATERIAL_CONFIGS.stone_block.width / 2;
  const leftBeamEdge = beam.position.x - MATERIAL_CONFIGS.wood_beam.width / 2;
  const rightBeamEdge = beam.position.x + MATERIAL_CONFIGS.wood_beam.width / 2;

  assert.strictEqual(rightBlockEdge - leftBlockEdge, 144, '3 blocks must span 144px');
  assert.strictEqual(leftBeamEdge, leftBlockEdge, 'Beam left edge aligns flush with block 1 left edge');
  assert.strictEqual(rightBeamEdge, rightBlockEdge, 'Beam right edge aligns flush with block 3 right edge');

  // Scenario B: 2 stacked horizontal beams equal 1 block height (48px)
  assert.strictEqual(beamDef.height * 2, PIECE_DEFINITIONS.wood_block.height);
});

test('Tests 5–6: Visual, collider, face, corner, and socket geometry derive from single authority', () => {
  const block: PlacedPiece = {
    id: 'test_blk',
    type: 'wood_block',
    position: { x: 300, y: 700 },
    rotation: 0,
    isPrebuilt: false,
  };
  const faces = getPieceFaces(block);
  const corners = getPieceCorners(block);
  const sockets = getPieceSnapSockets(block);

  assert.strictEqual(faces.length, 4);
  assert.strictEqual(corners.length, 4);

  const tlCorner = corners.find((c) => c.id === 'TOP_LEFT_CORNER')!;
  const trCorner = corners.find((c) => c.id === 'TOP_RIGHT_CORNER')!;
  assert.deepStrictEqual(tlCorner.worldPos, { x: 276, y: 676 });
  assert.deepStrictEqual(trCorner.worldPos, { x: 324, y: 676 });

  const cornerSockets = sockets.filter((s) => s.socketKind === 'block_corner');
  assert.strictEqual(cornerSockets.length, 4, 'Block must expose 4 corner sockets');

  const beam: PlacedPiece = {
    id: 'test_bm',
    type: 'wood_beam',
    position: { x: 300, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };
  const beamSockets = getPieceSnapSockets(beam);
  const endA = beamSockets.find((s) => s.localName === 'END_A_CENTER')!;
  const endB = beamSockets.find((s) => s.localName === 'END_B_CENTER')!;
  const sideBottomA = beamSockets.find((s) => s.localName === 'SIDE_BOTTOM_A')!;
  const sideBottomB = beamSockets.find((s) => s.localName === 'SIDE_BOTTOM_B')!;

  assert.deepStrictEqual(endA.worldPos, { x: 228, y: 600 });
  assert.deepStrictEqual(endB.worldPos, { x: 372, y: 600 });
  assert.deepStrictEqual(sideBottomA.worldPos, { x: 240, y: 612 });
  assert.deepStrictEqual(sideBottomB.worldPos, { x: 360, y: 612 });
});

test('Tests 7–11 & Scenarios C–D: Timber L-Corner (TIMBER_CORNER) left/right symmetry and placement-order independence', () => {
  // Scenario C (Order 1: Vertical post first, horizontal top beam second)
  const store1 = new LevelStore();
  store1.clearStorage();
  const leftPost: PlacedPiece = {
    id: 'post_l',
    type: 'wood_beam',
    position: { x: 240, y: 708 },
    rotation: Math.PI / 2, // END_A_CENTER at (240, 636), END_B_CENTER at (240, 780)
    isPrebuilt: false,
  };
  store1.placePiece(leftPost, false);

  // Horizontal beam whose left corner region (SIDE_BOTTOM_A at local (-60, +12)) sits on post top (240, 636) -> center at (300, 624)
  const snapHOnV = solveSnapAndValidation(
    'wood_beam',
    { x: 298, y: 626 },
    0,
    store1.getState().pieces,
    store1.getState().anchors,
    true,
    undefined,
    { preferredRotation: 0, existingJoints: store1.getJoints() },
  );

  assert.strictEqual(snapHOnV.isValid, true);
  assert.strictEqual(snapHOnV.proposedTimberJoint?.jointType, 'TIMBER_CORNER');
  assert.strictEqual(snapHOnV.connectionTaxonomy, 'TIMBER_CORNER');
  assert.strictEqual(snapHOnV.currentCandidateLabel, 'Timber Corner Joint');
  assert.strictEqual(snapHOnV.penetrationDepth, 0);
  assert.strictEqual(snapHOnV.seamSeparation, 0);
  // Outer left face of vertical post is at 240 - 12 = 228; outer left end of horizontal beam at x=300 is 300 - 72 = 228 (flush!)
  assert.ok(Math.abs(snapHOnV.position.x - 300) < 0.5, `Expected x=300, got ${snapHOnV.position.x}`);
  assert.ok(Math.abs(snapHOnV.position.y - 624) < 0.5, `Expected y=624, got ${snapHOnV.position.y}`);

  // Scenario C (Order 2: Horizontal top beam first, vertical post second)
  const store2 = new LevelStore();
  store2.clearStorage();
  const topBeam: PlacedPiece = {
    id: 'beam_top',
    type: 'wood_beam',
    position: { x: 300, y: 624 },
    rotation: 0,
    isPrebuilt: false,
  };
  store2.placePiece(topBeam, false);

  const snapVOnH = solveSnapAndValidation(
    'wood_beam',
    { x: 242, y: 706 },
    Math.PI / 2,
    store2.getState().pieces,
    store2.getState().anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, rotationSource: 'USER', existingJoints: store2.getJoints() },
  );

  assert.strictEqual(snapVOnH.isValid, true);
  assert.strictEqual(snapVOnH.proposedTimberJoint?.jointType, 'TIMBER_CORNER');
  assert.ok(Math.abs(snapVOnH.position.x - 240) < 0.5, `Expected x=240, got ${snapVOnH.position.x}`);
  assert.ok(Math.abs(snapVOnH.position.y - 708) < 0.5, `Expected y=708, got ${snapVOnH.position.y}`);

  // Scenario D: Mirrored Right L-Corner (right post at x=360, y=708 under horizontal beam at x=300, y=624)
  const snapRightPost = solveSnapAndValidation(
    'wood_beam',
    { x: 358, y: 706 },
    Math.PI / 2,
    store2.getState().pieces,
    store2.getState().anchors,
    true,
    undefined,
    { preferredRotation: Math.PI / 2, rotationSource: 'USER', existingJoints: store2.getJoints() },
  );
  assert.strictEqual(snapRightPost.isValid, true);
  assert.strictEqual(snapRightPost.proposedTimberJoint?.jointType, 'TIMBER_CORNER');
  assert.ok(Math.abs(snapRightPost.position.x - 360) < 0.5, `Expected mirrored x=360, got ${snapRightPost.position.x}`);
  assert.ok(Math.abs(snapRightPost.position.y - 708) < 0.5, `Expected mirrored y=708, got ${snapRightPost.position.y}`);
});

test('Tests 12–16 & Scenarios E–F: Block-Corner Rafter Seats (wood_block RAFTER_CORNER_SEAT vs stone_block Corner Supported)', () => {
  const store = new LevelStore();
  store.clearStorage();

  // Place a wood_block at (280, 756) -> TOP_RIGHT_CORNER at (304, 732), TOP_LEFT_CORNER at (256, 732)
  const woodBlock: PlacedPiece = {
    id: 'seat_wood_blk',
    type: 'wood_block',
    position: { x: 280, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(woodBlock, false);

  // Scenario E: Angled rafter (-35°) approaching wood_block TOP_RIGHT_CORNER (304, 732) with END_A_CENTER
  const slope = -35 * (Math.PI / 180);
  const approxCenter = {
    x: 304 + 72 * Math.cos(slope),
    y: 732 + 72 * Math.sin(slope),
  };

  const snapWoodCorner = solveSnapAndValidation(
    'wood_beam',
    approxCenter,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snapWoodCorner.isValid, true);
  assert.strictEqual(snapWoodCorner.snapped, true);
  assert.ok(Math.abs(snapWoodCorner.rotation - slope) < 1e-6, 'Manual rafter rotation must be preserved');
  assert.strictEqual(snapWoodCorner.requiresRotationChange, false);
  assert.strictEqual(snapWoodCorner.proposedTimberJoint?.jointType, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapWoodCorner.proposedTimberJoint?.strengthProfile, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapWoodCorner.connectionTaxonomy, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapWoodCorner.currentCandidateLabel, 'Corner Joint');
  assert.strictEqual(snapWoodCorner.targetFeatureType, 'corner');
  assert.strictEqual(snapWoodCorner.targetFeatureId, 'TOP_RIGHT_CORNER');
  assert.strictEqual(snapWoodCorner.penetrationDepth, 0);
  assert.strictEqual(snapWoodCorner.seamSeparation, 0);
  assert.ok(TIMBER_JOINT_PROFILES.RAFTER_CORNER_SEAT, 'RAFTER_CORNER_SEAT profile must exist');

  // Scenario F: Angled rafter (-35°) approaching prebuilt stone_block TOP_RIGHT_CORNER (prebuilt_stone_left_2 at (200, 708) -> TOP_RIGHT_CORNER at (224, 684))
  const stoneApproxCenter = {
    x: 224 + 72 * Math.cos(slope),
    y: 684 + 72 * Math.sin(slope),
  };
  const snapStoneCorner = solveSnapAndValidation(
    'wood_beam',
    stoneApproxCenter,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: store.getJoints() },
  );

  assert.strictEqual(snapStoneCorner.isValid, true);
  assert.strictEqual(snapStoneCorner.snapped, true);
  assert.ok(snapStoneCorner.proposedTimberJoint !== null, 'Prebuilt stone corner must create a universal breakable construction binding');
  assert.strictEqual(snapStoneCorner.proposedTimberJoint?.jointType, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapStoneCorner.proposedTimberJoint?.materialPairKey, 'WOOD_ENVIRONMENT');
  assert.strictEqual(snapStoneCorner.proposedTimberJoint?.strengthProfile, 'WOOD_ENVIRONMENT');
  assert.strictEqual(snapStoneCorner.connectionCategory, 'TIMBER_JOINT');
  assert.strictEqual(snapStoneCorner.connectionTaxonomy, 'RAFTER_CORNER_SEAT');
  assert.strictEqual(snapStoneCorner.currentCandidateLabel, 'Corner Joint');
  assert.strictEqual(snapStoneCorner.targetFeatureType, 'corner');
  assert.strictEqual(snapStoneCorner.targetFeatureId, 'TOP_RIGHT_CORNER');
  assert.strictEqual(snapStoneCorner.penetrationDepth, 0);
});

test('Tests 17–21 & Scenarios G–I: Shared-Apex Roof Peak (ROOF_PEAK) symmetry, placement-order independence, and asymmetric slopes', () => {
  const slope = 35 * (Math.PI / 180); // 35° roof pitch

  // Scenario G & H (Order 1: Left rafter first, Right rafter second)
  const storeLR = new LevelStore();
  storeLR.clearStorage();
  const supportL: PlacedPiece = {
    id: 'sup_l',
    type: 'wood_block',
    position: { x: 252, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const supportR: PlacedPiece = {
    id: 'sup_r',
    type: 'wood_block',
    position: { x: 444, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  storeLR.placePiece(supportL, false);
  storeLR.placePiece(supportR, false);

  // Place left rafter seated on supportL's TOP_RIGHT_CORNER (276, 732) at -35°
  const leftCornerSeatSnap = solveSnapAndValidation(
    'wood_beam',
    { x: 276 + 72 * Math.cos(-slope), y: 732 + 72 * Math.sin(-slope) },
    -slope,
    storeLR.getState().pieces,
    storeLR.getState().anchors,
    true,
    undefined,
    { preferredRotation: -slope, rotationSource: 'USER', existingJoints: storeLR.getJoints() },
  );
  const leftRafter: PlacedPiece = {
    id: 'rafter_l',
    type: 'wood_beam',
    position: leftCornerSeatSnap.position,
    rotation: leftCornerSeatSnap.rotation,
    isPrebuilt: false,
  };
  storeLR.placePiece(leftRafter, false, leftCornerSeatSnap.proposedTimberJoints);

  const apexL = {
    x: leftRafter.position.x + 72 * Math.cos(-slope),
    y: leftRafter.position.y + 72 * Math.sin(-slope),
  };
  const rightApproxCenter = {
    x: apexL.x + 72 * Math.cos(slope),
    y: apexL.y + 72 * Math.sin(slope),
  };

  const peakSnapLR = solveSnapAndValidation(
    'wood_beam',
    rightApproxCenter,
    slope,
    storeLR.getState().pieces,
    storeLR.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: storeLR.getJoints() },
  );

  assert.strictEqual(peakSnapLR.isValid, true);
  assert.strictEqual(peakSnapLR.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.strictEqual(peakSnapLR.connectionTaxonomy, 'ROOF_PEAK');
  assert.strictEqual(peakSnapLR.penetrationDepth, 0);
  assert.strictEqual(peakSnapLR.seamSeparation, 0);
  assert.ok(peakSnapLR.peakSymmetryDiagnostics, 'Must include peakSymmetryDiagnostics');
  assert.strictEqual(peakSnapLR.peakSymmetryDiagnostics?.isSymmetricSlope, true);
  assert.strictEqual(
    Math.abs(leftRafter.position.y - peakSnapLR.position.y) < 0.01,
    true,
    `Equal opposing slopes must have identical center elevation y_L (${leftRafter.position.y}) === y_R (${peakSnapLR.position.y})`,
  );

  const rightRafter: PlacedPiece = {
    id: 'rafter_r',
    type: 'wood_beam',
    position: peakSnapLR.position,
    rotation: peakSnapLR.rotation,
    isPrebuilt: false,
  };
  storeLR.placePiece(rightRafter, false, peakSnapLR.proposedTimberJoints);

  // Verify only ONE ROOF_PEAK joint connects rafter_l and rafter_r (no duplicate splice)
  const peakJoints = storeLR
    .getJoints()
    .filter(
      (j) =>
        (j.pieceAId === 'rafter_l' && j.pieceBId === 'rafter_r') ||
        (j.pieceAId === 'rafter_r' && j.pieceBId === 'rafter_l'),
    );
  assert.strictEqual(peakJoints.length, 1);
  assert.strictEqual(peakJoints[0].jointType, 'ROOF_PEAK');

  // Scenario H (Order 2: Right rafter at peakSnapLR.position first, Left rafter second -> identical apex!)
  const storeRL = new LevelStore();
  storeRL.clearStorage();
  storeRL.placePiece(supportL, false);
  storeRL.placePiece(supportR, false);
  storeRL.placePiece(rightRafter, false);

  const peakSnapRL = solveSnapAndValidation(
    'wood_beam',
    leftRafter.position,
    -slope,
    storeRL.getState().pieces,
    storeRL.getState().anchors,
    true,
    undefined,
    { preferredRotation: -slope, rotationSource: 'USER', existingJoints: storeRL.getJoints() },
  );

  assert.strictEqual(peakSnapRL.isValid, true);
  assert.strictEqual(peakSnapRL.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.ok(
    Vec2.distance(peakSnapRL.position, leftRafter.position) < 0.5,
    'Left-first and Right-first placement order must produce the exact same symmetric roof geometry',
  );
  assert.ok(
    Vec2.distance(
      peakSnapRL.proposedTimberJoint!.worldPosition,
      peakSnapLR.proposedTimberJoint!.worldPosition,
    ) < 0.5,
    'Shared apex world position must be invariant to placement order',
  );

  // Scenario I: Unequal valid rafter angles (-30° and +45°) form clean asymmetric ROOF_PEAK without forcing equal angles
  const asymSlopeR = Math.PI / 4; // +45°
  const asymCenterR = {
    x: apexL.x + 72 * Math.cos(asymSlopeR),
    y: apexL.y + 72 * Math.sin(asymSlopeR),
  };
  const asymSnap = solveSnapAndValidation(
    'wood_beam',
    asymCenterR,
    asymSlopeR,
    [leftRafter],
    storeLR.getState().anchors,
    true,
    undefined,
    { preferredRotation: asymSlopeR, rotationSource: 'USER', existingJoints: [] },
  );
  assert.strictEqual(asymSnap.isValid, true);
  assert.strictEqual(asymSnap.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.ok(Math.abs(asymSnap.rotation - asymSlopeR) < 1e-6, 'Asymmetric +45° angle must be preserved');
  assert.strictEqual(asymSnap.peakSymmetryDiagnostics?.isSymmetricSlope, false);
  assert.strictEqual(asymSnap.penetrationDepth, 0);
});

test('Tests 22–26 & Scenario J: Balanced Peak Adjustment preview, atomic commit, Undo/Redo, and Cancel restoration', () => {
  const store = new LevelStore();
  store.clearStorage();
  const slope = Math.PI / 4; // 45°

  // Place an unconstrained movable left rafter floating at (300, 580) with rotation -45°
  const origLeftPos = { x: 300, y: 580 };
  const leftRafter: PlacedPiece = {
    id: 'bal_rafter_l',
    type: 'wood_beam',
    position: { ...origLeftPos },
    rotation: -slope,
    isPrebuilt: false,
  };
  store.placePiece(leftRafter, true);

  // Exact apex for leftRafter at (300, 580)
  const apexX = origLeftPos.x + 72 * Math.cos(-slope);
  const apexY = origLeftPos.y + 72 * Math.sin(-slope);
  const exactRightCenter = {
    x: apexX + 72 * Math.cos(slope) + 12 * Math.SQRT2,
    y: apexY + 72 * Math.sin(slope),
  };

  // Approach with a small 8px horizontal offset (within BALANCED_PEAK_MAX_CORRECTION = 24px)
  const offsetRawPos = { x: exactRightCenter.x + 8, y: exactRightCenter.y };

  const snapBalanced = solveSnapAndValidation(
    'wood_beam',
    offsetRawPos,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    {
      preferredRotation: slope,
      rotationSource: 'USER',
      existingJoints: store.getJoints(),
      enableBalancedPeakAdjustment: true,
    },
  );

  assert.strictEqual(snapBalanced.isValid, true);
  assert.strictEqual(snapBalanced.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.strictEqual(snapBalanced.balancedAdjustmentActive, true, 'Balanced Peak Adjustment must activate for unconstrained partner rafter within 24px');
  assert.ok(snapBalanced.partnerPieceAdjustment, 'Must provide partnerPieceAdjustment preview');
  assert.strictEqual(snapBalanced.partnerPieceAdjustment?.pieceId, 'bal_rafter_l');
  assert.ok(
    Vec2.distance(snapBalanced.partnerPieceAdjustment!.beforePos, origLeftPos) < 1e-4,
    'partnerPieceAdjustment.beforePos must match original partner position',
  );
  const shiftMag = Vec2.distance(
    snapBalanced.partnerPieceAdjustment!.beforePos,
    snapBalanced.partnerPieceAdjustment!.afterPos,
  );
  assert.ok(
    shiftMag > 0.5 && shiftMag <= BALANCED_PEAK_MAX_CORRECTION * 0.5 + 0.5,
    `Expected half-correction shift in (0.5, 12.5], got ${shiftMag}`,
  );

  // Commit placement with proposedTimberJoints -> both pieces and the ROOF_PEAK joint commit atomically!
  const rightRafter: PlacedPiece = {
    id: 'bal_rafter_r',
    type: 'wood_beam',
    position: snapBalanced.position,
    rotation: snapBalanced.rotation,
    isPrebuilt: false,
  };
  const committedPartnerPos = { ...snapBalanced.partnerPieceAdjustment!.afterPos };
  store.placePiece(rightRafter, true, snapBalanced.proposedTimberJoints);

  const afterLeft = store.getState().pieces.find((p) => p.id === 'bal_rafter_l')!;
  assert.deepStrictEqual(afterLeft.position, committedPartnerPos, 'Partner rafter position must update atomically on commit');
  assert.strictEqual(store.getJoints().length, 1);
  assert.strictEqual(store.getJoints()[0].jointType, 'ROOF_PEAK');

  // Single Undo restores BOTH the placed right rafter AND the partner left rafter's original position!
  assert.strictEqual(store.undo(), true);
  assert.strictEqual(store.getState().pieces.some((p) => p.id === 'bal_rafter_r'), false);
  const undoneLeft = store.getState().pieces.find((p) => p.id === 'bal_rafter_l')!;
  assert.deepStrictEqual(undoneLeft.position, origLeftPos, 'Undo must restore partner rafter to exact original position');
  assert.strictEqual(store.getJoints().length, 0);

  // Single Redo reapplies BOTH transforms and the ROOF_PEAK joint!
  assert.strictEqual(store.redo(), true);
  assert.strictEqual(store.getState().pieces.some((p) => p.id === 'bal_rafter_r'), true);
  const redoneLeft = store.getState().pieces.find((p) => p.id === 'bal_rafter_l')!;
  assert.deepStrictEqual(redoneLeft.position, committedPartnerPos, 'Redo must reapply partner rafter adjustment');
  assert.strictEqual(store.getJoints().length, 1);

  // Verify Cancel during connected joint edit transaction restores partner transform as well
  store.beginJointEditTransaction('bal_rafter_r');
  afterLeft.position = { x: 295, y: 580 }; // simulated mid-drag partner preview
  store.cancelJointEditTransaction('USER_CANCELED');
  assert.deepStrictEqual(
    store.getState().pieces.find((p) => p.id === 'bal_rafter_l')!.position,
    committedPartnerPos,
    'Cancel transaction must restore partner piece transform cleanly',
  );
});

test('Tests 27–29 & Scenarios K–L: Roof Support Diagnostic Summary (supported vs unsupported lower rafter ends)', () => {
  const store = new LevelStore();
  store.clearStorage();
  const slope = Math.PI / 6; // 30°

  // Scenario L: Floating left rafter with NO lower supports on either side
  const floatingLeft: PlacedPiece = {
    id: 'float_l',
    type: 'wood_beam',
    position: { x: 300, y: 580 },
    rotation: -slope,
    isPrebuilt: false,
  };
  store.placePiece(floatingLeft, false);

  const apexX = 300 + 72 * Math.cos(-slope);
  const apexY = 580 + 72 * Math.sin(-slope);
  const rightPos = {
    x: apexX + 72 * Math.cos(slope),
    y: apexY + 72 * Math.sin(slope),
  };

  const unsupSnap = solveSnapAndValidation(
    'wood_beam',
    rightPos,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: [] },
  );

  assert.strictEqual(unsupSnap.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.strictEqual(unsupSnap.lowerSupportsDetected, false);
  assert.ok(unsupSnap.roofSupportSummary);
  assert.strictEqual(unsupSnap.roofSupportSummary?.leftLowerRafterSupported, false);
  assert.strictEqual(unsupSnap.roofSupportSummary?.rightLowerRafterSupported, false);
  assert.strictEqual(
    unsupSnap.roofSupportSummary?.summaryMessage,
    'Peak connected, but lower supports are missing (Left and right rafters unsupported)',
  );

  // Scenario K: Supported roof peak with both lower ends resting on support blocks
  const storeSup = new LevelStore();
  storeSup.clearStorage();
  const postL: PlacedPiece = {
    id: 'post_sup_l',
    type: 'wood_block',
    position: { x: 280, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  storeSup.placePiece(postL, false);

  const seatL = solveSnapAndValidation(
    'wood_beam',
    { x: 304 + 72 * Math.cos(-slope), y: 732 + 72 * Math.sin(-slope) },
    -slope,
    storeSup.getState().pieces,
    storeSup.getState().anchors,
    true,
    undefined,
    { preferredRotation: -slope, rotationSource: 'USER', existingJoints: [] },
  );
  const rafterSupL: PlacedPiece = {
    id: 'rafter_sup_l',
    type: 'wood_beam',
    position: seatL.position,
    rotation: seatL.rotation,
    isPrebuilt: false,
  };
  storeSup.placePiece(rafterSupL, false, seatL.proposedTimberJoints);

  const supApexX = rafterSupL.position.x + 72 * Math.cos(-slope) - 12 * Math.sin(-slope);
  const supApexY = rafterSupL.position.y + 72 * Math.sin(-slope) + 12 * Math.cos(-slope);
  const supRightCenter = {
    x: supApexX + 72 * Math.cos(slope) + 12 * Math.sin(slope),
    y: supApexY + 72 * Math.sin(slope) - 12 * Math.cos(slope),
  };
  const supRightLowerEnd = {
    x: supRightCenter.x + 72 * Math.cos(slope),
    y: supRightCenter.y + 72 * Math.sin(slope),
  };
  const postR: PlacedPiece = {
    id: 'post_sup_r',
    type: 'wood_block',
    position: { x: supRightLowerEnd.x + 24, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  storeSup.placePiece(postR, false);

  const supPeakSnap = solveSnapAndValidation(
    'wood_beam',
    supRightCenter,
    slope,
    storeSup.getState().pieces,
    storeSup.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', existingJoints: storeSup.getJoints() },
  );

  assert.strictEqual(supPeakSnap.proposedTimberJoint?.jointType, 'ROOF_PEAK');
  assert.strictEqual(supPeakSnap.lowerSupportsDetected, true);
  assert.strictEqual(supPeakSnap.roofSupportSummary?.leftLowerRafterSupported, true);
  assert.strictEqual(supPeakSnap.roofSupportSummary?.rightLowerRafterSupported, true);
  assert.strictEqual(
    supPeakSnap.roofSupportSummary?.summaryMessage,
    'Roof Peak connected — Both lower ends supported',
  );
});

test('Tests 30–32 & Scenario M: Deterministic Candidate Ranking Breakdown & Candidate Cycling', () => {
  const store = new LevelStore();
  store.clearStorage();

  const block: PlacedPiece = {
    id: 'cycle_blk',
    type: 'wood_block',
    position: { x: 300, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  store.placePiece(block, false);

  // Approach near top-right corner / top face with an angled (-35°) beam so multiple candidates (Corner Joint, Timber Face Joint, etc.) are within snap range
  const slope = -35 * (Math.PI / 180);
  const rawPos = {
    x: 314 + 72 * Math.cos(slope),
    y: 732 + 72 * Math.sin(slope),
  };

  const snap0 = solveSnapAndValidation(
    'wood_beam',
    rawPos,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', candidateCycleIndex: 0 },
  );

  assert.strictEqual(snap0.snapped, true);
  assert.ok(snap0.candidateRankingBreakdown, 'Must populate candidateRankingBreakdown');
  assert.ok((snap0.candidateCycleCount ?? 0) >= 2, `Expected at least 2 nearby candidates, got ${snap0.candidateCycleCount}`);
  assert.strictEqual(snap0.candidateCycleIndex, 0);

  const snap1 = solveSnapAndValidation(
    'wood_beam',
    rawPos,
    slope,
    store.getState().pieces,
    store.getState().anchors,
    true,
    undefined,
    { preferredRotation: slope, rotationSource: 'USER', candidateCycleIndex: 1 },
  );

  assert.strictEqual(snap1.snapped, true);
  assert.strictEqual(snap1.candidateCycleIndex, 1);
  assert.notDeepStrictEqual(
    { label: snap0.currentCandidateLabel, targetFeature: snap0.targetFeatureId },
    { label: snap1.currentCandidateLabel, targetFeature: snap1.targetFeatureId },
    'Cycling candidateCycleIndex from 0 to 1 must switch to the next distinct overlap-free connection candidate',
  );
});

test('Tests 33–35 & Scenario N: Geometry Schema v3 Migration preserves valid joints and removes invalid legacy joints', () => {
  const store = new LevelStore();
  store.clearStorage();

  // Construct a legacy geometrySchemaVersion=1 state with:
  // 1) A valid joint between two touching 144px beams (b_leg_1 at x=228, b_leg_2 at x=372 -> meeting at x=300)
  // 2) An invalid/disconnected legacy joint between two far-apart beams
  const legacyState = {
    ...JSON.parse(JSON.stringify(INITIAL_LEVEL_STATE)),
    geometrySchemaVersion: 1,
    pieces: [
      ...JSON.parse(JSON.stringify(INITIAL_LEVEL_STATE.pieces)),
      { id: 'b_leg_1', type: 'wood_beam', position: { x: 228, y: 600 }, rotation: 0, isPrebuilt: false },
      { id: 'b_leg_2', type: 'wood_beam', position: { x: 372, y: 600 }, rotation: 0, isPrebuilt: false },
    ],
    joints: [
      {
        jointId: 'tjoint__b_leg_1:END_B_CENTER__b_leg_2:END_A_CENTER',
        jointType: 'TIMBER_SPLICE',
        pieceAId: 'b_leg_1',
        pieceBId: 'b_leg_2',
        socketAId: 'b_leg_1_END_B_CENTER',
        socketBId: 'b_leg_2_END_A_CENTER',
        localAnchorA: { x: 60, y: 0 }, // legacy 120px local anchor -> should be updated to { x: 72, y: 0 }
        localAnchorB: { x: -60, y: 0 },
        worldPosition: { x: 300, y: 600 },
        restAngle: 0,
        restSeparation: 0,
        strengthProfile: 'TIMBER_SPLICE',
        state: 'INTACT',
        currentStress: 0,
        maxStressObserved: 0,
        createdInPhase: 'BUILD',
        brokenInPhase: null,
        brokenByAttackId: null,
        failureReason: null,
      },
      {
        jointId: 'tjoint__stale_invalid_joint',
        jointType: 'TIMBER_SPLICE',
        pieceAId: 'b_leg_1',
        pieceBId: 'prebuilt_stone_right_2', // non-joint-capable stone block far away
        socketAId: 'b_leg_1_END_A_CENTER',
        socketBId: 'prebuilt_stone_right_2_TOP_EDGE',
        localAnchorA: { x: -60, y: 0 },
        localAnchorB: { x: 0, y: -24 },
        worldPosition: { x: 400, y: 600 },
        restAngle: 0,
        restSeparation: 200,
        strengthProfile: 'TIMBER_SPLICE',
        state: 'INTACT',
        currentStress: 0,
        maxStressObserved: 0,
        createdInPhase: 'BUILD',
        brokenInPhase: null,
        brokenByAttackId: null,
        failureReason: null,
      },
    ],
  };

  const migrated = store.migratePersistedLevelState(legacyState);
  const diag = store.lastGeometryMigrationDiagnostics;

  assert.strictEqual(migrated.geometrySchemaVersion, GEOMETRY_SCHEMA_VERSION);
  assert.strictEqual(diag.migratedFromGeometrySchema, 1);
  assert.strictEqual(diag.migratedToGeometrySchema, 3);
  assert.strictEqual(diag.preservedJointCount, 1, 'Valid joint must be preserved and updated');
  assert.strictEqual(diag.invalidMigratedJointCount, 1, 'Invalid legacy joint must be cleaned up');
  assert.strictEqual(diag.result, 'MIGRATED_WITH_JOINT_CLEANUP');
  assert.deepStrictEqual(
    migrated.joints![0].localAnchorA,
    { x: 72, y: 0 },
    'Migrated joint localAnchorA must be updated to 144px beam half-width (72px)',
  );

  store.clearStorage();
});

test('Test 36 & Scenario O: Mirrored Feature Invariants, Canonical Relationship Equivalence, Foundation Advisory, and Zero-Preload Joint Derivation', () => {
  // 1. Verify mirrored local & world feature invariants
  const mirrorAudit = verifyMirroredFeatureInvariants();
  assert.strictEqual(
    mirrorAudit.valid,
    true,
    `Mirrored feature invariants must pass: ${JSON.stringify(mirrorAudit.checks)}`,
  );

  // 2. Verify canonical relationship mirrored equivalence for left vs right rafter corner seats
  const centerX = 500;
  const spanHalf = 96;
  const leftBlock: PlacedPiece = {
    id: 'canon_left_blk',
    type: 'wood_block',
    position: { x: centerX - spanHalf, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const rightBlock: PlacedPiece = {
    id: 'canon_right_blk',
    type: 'wood_block',
    position: { x: centerX + spanHalf, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };

  const theta = (-35 * Math.PI) / 180;
  const leftBlockSocks = getPieceSnapSockets('wood_block', leftBlock.position, 0);
  const rightBlockSocks = getPieceSnapSockets('wood_block', rightBlock.position, 0);
  const trSock = leftBlockSocks.find((s) => s.localName === 'TOP_RIGHT_CORNER')!;
  const tlSock = rightBlockSocks.find((s) => s.localName === 'TOP_LEFT_CORNER')!;

  const leftRafterRawPos = { x: centerX - 45, y: 710 };
  const rightRafterRawPos = { x: centerX + 45, y: 710 };
  const leftRafterSocks = getPieceSnapSockets('wood_beam', leftRafterRawPos, theta);
  const rightRafterSocks = getPieceSnapSockets('wood_beam', rightRafterRawPos, -theta);
  const leftEndA = leftRafterSocks.find((s) => s.localName === 'END_A_CENTER')!;
  const rightEndB = rightRafterSocks.find((s) => s.localName === 'END_B_CENTER')!;

  const seatL = solveBlockCornerSeat(leftRafterRawPos, theta, leftEndA, leftBlock, trSock)!;
  const seatR = solveBlockCornerSeat(rightRafterRawPos, -theta, rightEndB, rightBlock, tlSock)!;
  assert.ok(seatL && seatR);

  const canonL = buildCanonicalRelationship({
    pieceAId: 'rafter_l',
    pieceAType: 'wood_beam',
    pieceAPos: seatL.alignedPos,
    pieceARot: theta,
    featureAId: seatL.beamSocketName,
    pieceBId: leftBlock.id,
    pieceBType: leftBlock.type,
    pieceBPos: leftBlock.position,
    pieceBRot: leftBlock.rotation,
    featureBId: seatL.blockCornerId,
    connectionTaxonomy: 'RAFTER_CORNER_SEAT',
    jointProfileId: 'RAFTER_CORNER_SEAT',
  });
  const canonR = buildCanonicalRelationship({
    pieceAId: 'rafter_r',
    pieceAType: 'wood_beam',
    pieceAPos: seatR.alignedPos,
    pieceARot: -theta,
    featureAId: seatR.beamSocketName,
    pieceBId: rightBlock.id,
    pieceBType: rightBlock.type,
    pieceBPos: rightBlock.position,
    pieceBRot: rightBlock.rotation,
    featureBId: seatR.blockCornerId,
    connectionTaxonomy: 'RAFTER_CORNER_SEAT',
    jointProfileId: 'RAFTER_CORNER_SEAT',
  });
  assert.strictEqual(
    canonL.mirroredEquivalentKey,
    canonR.mirroredEquivalentKey,
    'Mirrored left and right rafter-to-block corner seats must produce identical mirroredEquivalentKey',
  );

  // 3. Verify Source/Target symmetry: dragging block corner to stationary rafter matches dragging rafter to block corner
  const stationaryRafter: PlacedPiece = {
    id: 'stat_rafter',
    type: 'wood_beam',
    position: seatL.alignedPos,
    rotation: theta,
    isPrebuilt: false,
  };
  const statRafterSocks = getPieceSnapSockets('wood_beam', stationaryRafter.position, theta);
  const statEndA = statRafterSocks.find((s) => s.localName === 'END_A_CENTER')!;
  const blockDragSol = solveBlockCornerSeatFromBlockDrag(
    { x: leftBlock.position.x - 4, y: leftBlock.position.y + 3 },
    0,
    'wood_block',
    trSock,
    stationaryRafter,
    statEndA,
    'drag_blk',
  );
  assert.ok(blockDragSol && blockDragSol.valid, 'Block-drag corner seat must solve cleanly');
  assert.ok(
    Vec2.distance(blockDragSol!.alignedPos, leftBlock.position) < 0.05,
    'Block-drag aligned position must match canonical relative transform',
  );

  // 4. Verify zero-preload committed joint derivation
  const stressFree = deriveStressFreeJointGeometryFromCommittedTransforms(
    {
      jointId: 'test_zero_preload',
      jointType: 'RAFTER_CORNER_SEAT',
      pieceAId: stationaryRafter.id,
      pieceBId: leftBlock.id,
      socketAId: 'END_A_CENTER',
      socketBId: 'TOP_RIGHT_CORNER',
      localAnchorA: seatL.localAnchorBeam,
      localAnchorB: seatL.localAnchorBlock,
      worldPosition: seatL.worldContactPoint,
      restAngle: 0,
      restSeparation: 0,
      strengthProfile: 'RAFTER_CORNER_SEAT',
      state: 'INTACT',
      currentStress: 0,
      maxStressObserved: 0,
      createdInPhase: 'BUILD',
    },
    stationaryRafter,
    leftBlock,
  );
  assert.strictEqual(stressFree.initialPositionalErrorPx, 0);
  assert.strictEqual(stressFree.initialAngularErrorRad, 0);
  assert.strictEqual(stressFree.initialConstraintEnergy, 0);
});

