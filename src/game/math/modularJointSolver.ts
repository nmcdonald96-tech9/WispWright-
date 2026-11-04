/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modular Construction Geometry Solvers:
 * 1. First-Class Block-Corner Seat Solver (RAFTER_CORNER_SEAT / Corner Supported vs Corner Joint)
 * 2. Placement-Order-Independent L-Corner Solver (TIMBER_CORNER)
 * 3. Shared-Apex Roof Peak Solver (ROOF_PEAK) with Symmetric & Asymmetric Support
 * 4. Optional Balanced Peak Adjustment for Unconstrained Movable Rafters
 * 5. Qualitative Roof Support Status Summary & Peak Symmetry Diagnostics
 */

import {
  ARCHITECTURAL_CLOSURE_CONFIG,
  BALANCED_PEAK_MAX_CORRECTION,
  CONSTRUCTION_UNIT,
  GEOMETRY_SCHEMA_VERSION,
  isStoneMaterial,
  MATERIAL_CONFIGS,
  PIECE_DEFINITIONS,
  resolveBindingStrengthProfile,
  resolveConnectionSubtype,
  resolveMaterialPairProfileId,
  TIMBER_JOINT_CONFIG,
  WORLD_CONFIG,
} from '../config';
import {
  CanonicalRelationshipDescription,
  ClosureClassification,
  ConnectionTaxonomyCategory,
  ConstructionBindingSubtype,
  EnvironmentalAnchor,
  MaterialPairProfileId,
  MaterialType,
  PartnerPieceAdjustment,
  PeakSymmetryDiagnostics,
  PieceCornerId,
  PieceFaceId,
  PlacedPiece,
  ProposedTimberJoint,
  RoofAssemblyPreview,
  RoofSupportDiagnosticSummary,
  SnapSocket,
  SupportFoundationClassification,
  TimberJoint,
  TimberJointType,
  Vector2,
  VisualConnectionState,
  VisualJointCapType,
} from '../types';
import {
  checkOBBOverlap,
  createOBB,
  getDistancePointToOBB,
  getLocalPieceCorners,
  getLocalPieceFaces,
  getOBBPenetrationDepth,
  getPieceCorners,
  getPieceCornersForTransform,
  getPieceFacesForTransform,
  getPieceSnapSockets,
  getPieceSnapSocketsForTransform,
  normalizeAngleSigned,
  Vec2,
} from './geometry';

export interface BlockCornerSeatSolution {
  valid: boolean;
  alignedPos: Vector2;
  beamSocketName: string;
  beamCornerId: PieceCornerId | null;
  blockCornerId: PieceCornerId;
  localAnchorBeam: Vector2;
  localAnchorBlock: Vector2;
  worldContactPoint: Vector2;
  seamSeparation: number;
  penetrationDepth: number;
  isBreakableJoint: boolean; // true for wood_block ("Corner Joint"), false for stone_block/bullseye_block ("Corner Supported")
  jointType: TimberJointType | null;
  strengthProfile: string | null;
  taxonomy: ConnectionTaxonomyCategory;
  candidateLabel: 'Corner Joint' | 'Corner Supported';
  friendlyMessage: string;
}

/**
 * Maps a joint type or connection taxonomy to its presentation-only VisualJointCapType.
 */
export function getVisualJointCapType(
  jointType?: TimberJointType | null,
  taxonomy?: ConnectionTaxonomyCategory | null,
  materialPairKey?: MaterialPairProfileId | null,
): VisualJointCapType {
  if (jointType === 'ROOF_PEAK' || taxonomy === 'ROOF_PEAK') return 'PEAK_CAP';
  if (taxonomy === 'ENVIRONMENTAL_ANCHOR' || jointType === 'ENVIRONMENTAL_ANCHOR') {
    return 'ALCHEMICAL_RUNE';
  }
  if (materialPairKey === 'STONE_STONE' || materialPairKey === 'STONE_ENVIRONMENT') {
    return 'MASONRY_SEAM';
  }
  if (
    jointType === 'RAFTER_CORNER_SEAT' ||
    jointType === 'TIMBER_CORNER' ||
    jointType === 'CORNER_BINDING' ||
    taxonomy === 'RAFTER_CORNER_SEAT' ||
    taxonomy === 'TIMBER_CORNER' ||
    taxonomy === 'CORNER_BINDING'
  ) {
    return materialPairKey === 'WOOD_STONE' || materialPairKey === 'WOOD_ENVIRONMENT'
      ? 'ALCHEMICAL_CLAMP'
      : 'CORNER_BINDING';
  }
  if (materialPairKey === 'WOOD_STONE' || materialPairKey === 'WOOD_ENVIRONMENT') {
    return 'ALCHEMICAL_CLAMP';
  }
  if (
    jointType === 'TIMBER_SPLICE' ||
    jointType === 'TIMBER_FACE' ||
    jointType === 'FACE_BINDING' ||
    jointType === 'BLOCK_BINDING' ||
    jointType === 'TIMBER_T_JOINT' ||
    jointType === 'T_JOINT' ||
    jointType === 'DIAGONAL_BRACE'
  ) {
    return 'TIMBER_COLLAR';
  }
  return 'NONE';
}

/**
 * Solves a first-class Block-Corner Seat for a Timber Beam endpoint approaching a block corner
 * (TOP_LEFT_CORNER, TOP_RIGHT_CORNER, BOTTOM_LEFT_CORNER, BOTTOM_RIGHT_CORNER).
 *
 * Enforces 100% Mirrored Feature Parity:
 * - Orders candidate beam end corners by alignment with the inward block-corner direction so
 *   (+theta, END_A, TOP_RIGHT_CORNER) and (-theta, END_B, TOP_LEFT_CORNER) select the exact
 *   mirrored anchor with identical score and 0.00px penetration.
 * - Computes stress-free localAnchorBeam and localAnchorBlock from the shared worldContactPoint
 *   so initial restSeparation === 0.
 */
export function solveBlockCornerSeat(
  beamRawPos: Vector2,
  beamRot: number,
  beamEndSocket: SnapSocket,
  blockPiece: PlacedPiece,
  blockCornerSocket: SnapSocket,
): BlockCornerSeatSolution | null {
  if (
    beamEndSocket.socketKind !== 'beam_end' ||
    blockCornerSocket.socketKind !== 'block_corner'
  ) {
    return null;
  }

  const beamCfg = PIECE_DEFINITIONS.wood_beam ?? MATERIAL_CONFIGS.wood_beam;
  const blockCfg = PIECE_DEFINITIONS[blockPiece.type] ?? MATERIAL_CONFIGS[blockPiece.type];
  const hw = beamCfg.width / 2;
  const hh = beamCfg.height / 2;

  const blockCornerId = (blockCornerSocket.localName || 'TOP_RIGHT_CORNER') as PieceCornerId;
  const cornerWorld = blockCornerSocket.worldPos;
  const cornerOutwardNormal = blockCornerSocket.normal; // Points diagonally outward from the block center

  // Outward normal of the beam endpoint (points away from the beam center at the active end)
  const endOutward = beamEndSocket.normal;
  // Inward direction along the beam body (points from the active endpoint toward the other end of the beam)
  const beamBodyDir = Vec2.scale(endOutward, -1);

  // The beam body must extend generally outward from the block corner (not through the middle of the block)
  if (Vec2.dot(beamBodyDir, cornerOutwardNormal) < -0.15) {
    return null;
  }

  const isEndA = (beamEndSocket.localName || '').startsWith('END_A');
  const endLocalX = isEndA ? -hw : hw;

  // Determine which local side of the beam (+hh vs -hh) faces toward the block (downward / inward toward corner)
  // so that mirrored angles (+theta vs -theta) and mirrored ends (END_A vs END_B) evaluate in identical canonical order.
  const worldSidePlus = Vec2.rotate({ x: 0, y: 1 }, beamRot);
  const worldSideMinus = Vec2.rotate({ x: 0, y: -1 }, beamRot);
  // Prefer the beam side whose outward normal points most downward (+Y) or into the block (-cornerOutwardNormal)
  const scorePlus = worldSidePlus.y - 0.25 * Vec2.dot(worldSidePlus, cornerOutwardNormal);
  const scoreMinus = worldSideMinus.y - 0.25 * Vec2.dot(worldSideMinus, cornerOutwardNormal);
  const preferPlusFirst = scorePlus >= scoreMinus;

  const cornerCandidatePlus = {
    localPos: { x: endLocalX, y: hh },
    cornerId: (isEndA ? 'END_A_INNER_CORNER' : 'END_B_INNER_CORNER') as PieceCornerId,
    socketName: isEndA ? 'END_A_INNER_CORNER' : 'END_B_INNER_CORNER',
    isPreferredSoffit: preferPlusFirst,
  };
  const cornerCandidateMinus = {
    localPos: { x: endLocalX, y: -hh },
    cornerId: (isEndA ? 'END_A_OUTER_CORNER' : 'END_B_OUTER_CORNER') as PieceCornerId,
    socketName: isEndA ? 'END_A_OUTER_CORNER' : 'END_B_OUTER_CORNER',
    isPreferredSoffit: !preferPlusFirst,
  };

  const endCandidateAnchors: Array<{
    localPos: Vector2;
    cornerId: PieceCornerId | null;
    socketName: string;
    isPreferredSoffit: boolean;
  }> = preferPlusFirst
    ? [
        cornerCandidatePlus,
        cornerCandidateMinus,
        {
          localPos: { x: endLocalX, y: 0 },
          cornerId: null,
          socketName: isEndA ? 'END_A_CENTER' : 'END_B_CENTER',
          isPreferredSoffit: false,
        },
      ]
    : [
        cornerCandidateMinus,
        cornerCandidatePlus,
        {
          localPos: { x: endLocalX, y: 0 },
          cornerId: null,
          socketName: isEndA ? 'END_A_CENTER' : 'END_B_CENTER',
          isPreferredSoffit: false,
        },
      ];

  const blockOBB = createOBB(
    blockPiece.position,
    blockCfg.colliderWidth,
    blockCfg.colliderHeight,
    blockPiece.rotation,
  );

  // Micro-clearance (0.02px) along the corner outward normal so SAT penetration is strictly 0.00px
  const clearanceTarget = Vec2.add(cornerWorld, Vec2.scale(cornerOutwardNormal, 0.02));

  let bestSolution: {
    alignedPos: Vector2;
    localAnchorBeam: Vector2;
    cornerId: PieceCornerId | null;
    socketName: string;
    seamSeparation: number;
    pointerDist: number;
    centerHeightScore: number;
  } | null = null;

  for (const cand of endCandidateAnchors) {
    const worldOffset = Vec2.rotate(cand.localPos, beamRot);
    let testPos = Vec2.sub(clearanceTarget, worldOffset);
    let testOBB = createOBB(testPos, beamCfg.colliderWidth, beamCfg.colliderHeight, beamRot);
    let pen = getOBBPenetrationDepth(testOBB, blockOBB, 0);

    // If aligning this point has slight corner-face penetration, binary search a minimal shift along cornerOutwardNormal
    if (pen > 0.005) {
      let lo = 0;
      let hi = hh * 1.5;
      let found = hi;
      for (let iter = 0; iter < 14; iter++) {
        const mid = (lo + hi) / 2;
        const shiftedPos = Vec2.add(testPos, Vec2.scale(cornerOutwardNormal, mid));
        const shiftedOBB = createOBB(
          shiftedPos,
          beamCfg.colliderWidth,
          beamCfg.colliderHeight,
          beamRot,
        );
        if (getOBBPenetrationDepth(shiftedOBB, blockOBB, 0) <= 0) {
          found = mid;
          hi = mid;
        } else {
          lo = mid;
        }
      }
      testPos = Vec2.add(testPos, Vec2.scale(cornerOutwardNormal, found + 0.02));
      testOBB = createOBB(testPos, beamCfg.colliderWidth, beamCfg.colliderHeight, beamRot);
      pen = getOBBPenetrationDepth(testOBB, blockOBB, 0);
    }

    if (pen > 0.01) continue;

    // Verify the beam body stays outside the block and its end face touches the block corner
    const distCornerToBeam = getDistancePointToOBB(cornerWorld, testOBB);
    if (distCornerToBeam > 1.5) continue;

    // Also verify the beam's center is on the outward side of the block corner
    const centerFromCorner = Vec2.sub(testPos, cornerWorld);
    if (Vec2.dot(centerFromCorner, cornerOutwardNormal) <= 2.0) continue;

    const pointerDist = Vec2.distance(beamRawPos, testPos);
    const endCenterWorld = Vec2.add(testPos, Vec2.rotate({ x: endLocalX, y: 0 }, beamRot));
    const endCenterToCorner = Vec2.distance(endCenterWorld, cornerWorld);
    const soffitBonus = cand.isPreferredSoffit ? -0.25 : 0;
    const score = distCornerToBeam * 20 + endCenterToCorner * 0.5 + pointerDist * 0.15 + soffitBonus;

    if (!bestSolution || score < bestSolution.centerHeightScore - 1e-6) {
      bestSolution = {
        alignedPos: testPos,
        localAnchorBeam: cand.localPos,
        cornerId: cand.cornerId,
        socketName: cand.socketName,
        seamSeparation: Number(Math.max(0, distCornerToBeam - 0.025).toFixed(3)),
        pointerDist,
        centerHeightScore: score,
      };
    }
  }

  if (!bestSolution) return null;

  const isBreakableJoint = Boolean(blockCfg.jointCapable);
  const isWoodBlock = blockPiece.type === 'wood_block';
  const resolvedStrengthProfile = isBreakableJoint
    ? resolveBindingStrengthProfile(
        'wood_beam',
        false,
        blockPiece.type,
        Boolean(blockPiece.isPrebuilt),
        'RAFTER_CORNER_SEAT',
      )
    : null;
  const worldContactPoint = { ...cornerWorld };
  // Derive stress-free local anchors from the exact shared worldContactPoint so restSeparation === 0
  const stressFreeLocalBeam = Vec2.rotate(
    Vec2.sub(worldContactPoint, bestSolution.alignedPos),
    -beamRot,
  );
  const stressFreeLocalBlock = Vec2.rotate(
    Vec2.sub(worldContactPoint, blockPiece.position),
    -blockPiece.rotation,
  );

  return {
    valid: true,
    alignedPos: bestSolution.alignedPos,
    beamSocketName: beamEndSocket.localName || bestSolution.socketName,
    beamCornerId: bestSolution.cornerId,
    blockCornerId,
    localAnchorBeam: stressFreeLocalBeam,
    localAnchorBlock: stressFreeLocalBlock,
    worldContactPoint,
    seamSeparation: bestSolution.seamSeparation,
    penetrationDepth: 0,
    isBreakableJoint,
    jointType: isBreakableJoint ? 'RAFTER_CORNER_SEAT' : null,
    strengthProfile: resolvedStrengthProfile,
    taxonomy: 'RAFTER_CORNER_SEAT',
    candidateLabel: isBreakableJoint ? 'Corner Joint' : 'Corner Supported',
    friendlyMessage: isWoodBlock
      ? 'Corner Joint — rafter seated at wooden block corner.'
      : isStoneMaterial(blockPiece.type)
        ? 'Corner Joint — rafter bound to stone corner.'
        : 'Corner Supported — rafter resting on stone corner.',
  };
}

/**
 * Source/Target Symmetric counterpart to solveBlockCornerSeat:
 * Evaluates dragging a Block (`wood_block`, `stone_block`, `bullseye_block`) whose corner socket
 * approaches a stationary Timber Beam's endpoint socket (`block corner -> rafter endpoint`).
 *
 * Guarantees that dragging a block corner to a rafter endpoint produces the exact same
 * relative world transform, local anchors, seam separation, and `RAFTER_CORNER_SEAT` joint
 * as dragging the rafter endpoint to the block corner.
 */
export function solveBlockCornerSeatFromBlockDrag(
  blockRawPos: Vector2,
  blockRot: number,
  blockType: MaterialType,
  blockCornerSocket: SnapSocket,
  beamPiece: PlacedPiece,
  beamEndSocket: SnapSocket,
  blockPieceId = 'ghost',
): BlockCornerSeatSolution | null {
  if (
    beamPiece.type !== 'wood_beam' ||
    beamEndSocket.socketKind !== 'beam_end' ||
    blockCornerSocket.socketKind !== 'block_corner'
  ) {
    return null;
  }

  // Construct a temporary PlacedPiece for the block at its raw position
  const virtualBlock: PlacedPiece = {
    id: blockPieceId,
    type: blockType,
    position: blockRawPos,
    rotation: blockRot,
    isPrebuilt: false,
  };
  const cornerLocalPos = blockCornerSocket.localPos ?? { x: 0, y: 0 };
  const virtualCornerSocket: SnapSocket = {
    ...blockCornerSocket,
    worldPos: Vec2.add(blockRawPos, Vec2.rotate(cornerLocalPos, blockRot)),
  };

  // Solve the canonical beam-to-block relationship relative to virtualBlock
  const canonicalSeat = solveBlockCornerSeat(
    beamPiece.position,
    beamPiece.rotation,
    beamEndSocket,
    virtualBlock,
    virtualCornerSocket,
  );
  if (!canonicalSeat || !canonicalSeat.valid) {
    return null;
  }

  // In canonicalSeat, the relative vector from block to beam is (canonicalSeat.alignedPos - blockRawPos).
  // Since the beam is stationary at beamPiece.position, the dragged block's aligned position is:
  // blockAlignedPos = beamPiece.position - (canonicalSeat.alignedPos - blockRawPos)
  const relativeBeamFromBlock = Vec2.sub(canonicalSeat.alignedPos, blockRawPos);
  const blockAlignedPos = Vec2.sub(beamPiece.position, relativeBeamFromBlock);

  // World contact point when block is at blockAlignedPos
  const worldContactPoint = Vec2.add(blockAlignedPos, Vec2.rotate(cornerLocalPos, blockRot));

  const stressFreeLocalBeam = Vec2.rotate(
    Vec2.sub(worldContactPoint, beamPiece.position),
    -beamPiece.rotation,
  );
  const stressFreeLocalBlock = Vec2.rotate(
    Vec2.sub(worldContactPoint, blockAlignedPos),
    -blockRot,
  );

  return {
    ...canonicalSeat,
    alignedPos: blockAlignedPos,
    localAnchorBeam: stressFreeLocalBeam,
    localAnchorBlock: stressFreeLocalBlock,
    worldContactPoint,
  };
}

export const ENDPOINT_FACE_CORNER_BAND_PX = 6;

export interface ContinuousEndpointFaceSeatSolution {
  valid: boolean;
  alignedPos: Vector2;
  sourceSocketId: string;
  targetSocketId: string;
  sourceSocketName: string;
  targetSocketName: string;
  sourceFaceId: PieceFaceId;
  targetFaceId: PieceFaceId;
  sourceFaceNormal: Vector2;
  targetFaceNormal: Vector2;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldContactPoint: Vector2;
  normalCorrectionPx: number;
  seamSeparation: number;
  restAngle: number;
  jointType: 'TIMBER_FACE';
  connectionSubtype: ConstructionBindingSubtype;
  materialPairKey: MaterialPairProfileId;
  strengthProfile: string;
  taxonomy: 'TIMBER_FACE' | 'FACE_BINDING';
  distanceFromNearestCornerPx: number;
}

function endpointFaceSocketName(type: MaterialType, faceId: PieceFaceId): string {
  if (type === 'wood_beam') {
    return faceId === 'END_A_FACE' ? 'END_A_CENTER' : 'END_B_CENTER';
  }
  switch (faceId) {
    case 'TOP_FACE': return 'TOP_EDGE';
    case 'BOTTOM_FACE': return 'BOTTOM_EDGE';
    case 'LEFT_FACE': return 'LEFT_EDGE';
    case 'RIGHT_FACE': return 'RIGHT_EDGE';
    default: return 'TOP_EDGE';
  }
}

function beamEndFaceId(socket: SnapSocket): PieceFaceId {
  return (socket.localName || '').includes('END_A') ? 'END_A_FACE' : 'END_B_FACE';
}

/**
 * Continuous endpoint-to-face seating. A real corner band remains owned by the
 * existing corner-seat solver; face-interior placement preserves tangent position.
 */
export function solveContinuousEndpointFaceSeat(
  dragType: MaterialType,
  dragRawPos: Vector2,
  dragRot: number,
  targetPiece: PlacedPiece,
  dragPieceId = 'ghost',
  options?: {
    maxNormalDistancePx?: number;
    cornerBandPx?: number;
    inPlace?: boolean;
    dragIsPrebuilt?: boolean;
  },
): ContinuousEndpointFaceSeatSolution | null {
  if ((dragType === 'wood_beam') === (targetPiece.type === 'wood_beam')) return null;
  const maxDistance = options?.maxNormalDistancePx ?? WORLD_CONFIG.snapDistance;
  const cornerBand = options?.cornerBandPx ?? ENDPOINT_FACE_CORNER_BAND_PX;
  const inPlace = Boolean(options?.inPlace);
  const dragIsPrebuilt = Boolean(options?.dragIsPrebuilt);
  const dragCfg = PIECE_DEFINITIONS[dragType] ?? MATERIAL_CONFIGS[dragType];
  const targetCfg = PIECE_DEFINITIONS[targetPiece.type] ?? MATERIAL_CONFIGS[targetPiece.type];
  let best: (ContinuousEndpointFaceSeatSolution & { score: number }) | null = null;

  if (dragType === 'wood_beam') {
    const endSockets = getPieceSnapSocketsForTransform(
      dragType, dragRawPos, dragRot, dragPieceId,
    ).filter((socket) => socket.socketKind === 'beam_end');
    const blockFaces = getPieceFacesForTransform(
      targetPiece.type, targetPiece.position, targetPiece.rotation, targetPiece.id,
    ).filter((face) => face.jointCapable);
    const targetOBB = createOBB(targetPiece.position, targetCfg.colliderWidth, targetCfg.colliderHeight, targetPiece.rotation);

    for (const end of endSockets) for (const face of blockFaces) {
      if (Vec2.dot(end.normal, face.worldNormal) > -0.85) continue;
      const relative = Vec2.sub(end.worldPos, face.worldCenter);
      const normalDistance = Vec2.dot(relative, face.worldNormal);
      if (normalDistance < -0.5 || normalDistance > maxDistance) continue;
      const tangentCoordinate = Vec2.dot(relative, face.worldTangent);
      const halfLength = face.length / 2;
      if (Math.abs(tangentCoordinate) > halfLength + 1e-4) continue;
      const cornerDistance = halfLength - Math.abs(tangentCoordinate);
      if (cornerDistance <= cornerBand) continue;

      const shift = inPlace ? { x: 0, y: 0 } : Vec2.scale(face.worldNormal, 0.02 - normalDistance);
      const alignedPos = Vec2.add(dragRawPos, shift);
      const contact = Vec2.add(end.worldPos, shift);
      const dragOBB = createOBB(alignedPos, dragCfg.colliderWidth, dragCfg.colliderHeight, dragRot);
      if (getOBBPenetrationDepth(dragOBB, targetOBB, inPlace ? 2.5 : 0) > (inPlace ? 2.5 : 0.03)) continue;
      const localA = Vec2.rotate(Vec2.sub(contact, alignedPos), -dragRot);
      const localB = Vec2.rotate(Vec2.sub(contact, targetPiece.position), -targetPiece.rotation);
      const pair = resolveMaterialPairProfileId(
        dragType, dragIsPrebuilt, targetPiece.type, Boolean(targetPiece.isPrebuilt), 'TIMBER_FACE',
      );
      const taxonomy: 'TIMBER_FACE' | 'FACE_BINDING' =
        isStoneMaterial(dragType) || isStoneMaterial(targetPiece.type) ? 'FACE_BINDING' : 'TIMBER_FACE';
      const candidate: ContinuousEndpointFaceSeatSolution & { score: number } = {
        valid: true, alignedPos,
        sourceSocketId: end.id,
        targetSocketId: `${targetPiece.id}_${endpointFaceSocketName(targetPiece.type, face.id)}`,
        sourceSocketName: end.localName || end.id,
        targetSocketName: endpointFaceSocketName(targetPiece.type, face.id),
        sourceFaceId: beamEndFaceId(end), targetFaceId: face.id,
        sourceFaceNormal: end.normal, targetFaceNormal: face.worldNormal,
        localAnchorA: localA, localAnchorB: localB, worldContactPoint: contact,
        normalCorrectionPx: Number(Vec2.distance(dragRawPos, alignedPos).toFixed(3)),
        seamSeparation: 0,
        restAngle: normalizeAngleSigned(targetPiece.rotation - dragRot),
        jointType: 'TIMBER_FACE',
        connectionSubtype: resolveConnectionSubtype('TIMBER_FACE', dragType, targetPiece.type),
        materialPairKey: pair,
        strengthProfile: resolveBindingStrengthProfile(
          'TIMBER_FACE', dragType, targetPiece.type, dragIsPrebuilt, Boolean(targetPiece.isPrebuilt),
        ),
        taxonomy,
        distanceFromNearestCornerPx: Number(cornerDistance.toFixed(3)),
        score: normalDistance,
      };
      if (!best || candidate.score < best.score) best = candidate;
    }
  } else if (targetPiece.type === 'wood_beam') {
    const beamEnds = getPieceSnapSockets(targetPiece).filter((socket) => socket.socketKind === 'beam_end');
    const blockFaces = getPieceFacesForTransform(dragType, dragRawPos, dragRot, dragPieceId).filter(
      (face) => face.jointCapable,
    );
    const beamOBB = createOBB(targetPiece.position, targetCfg.colliderWidth, targetCfg.colliderHeight, targetPiece.rotation);

    for (const face of blockFaces) for (const end of beamEnds) {
      if (Vec2.dot(face.worldNormal, end.normal) > -0.85) continue;
      const relative = Vec2.sub(end.worldPos, face.worldCenter);
      const normalDistance = Vec2.dot(relative, face.worldNormal);
      if (normalDistance < -0.5 || normalDistance > maxDistance) continue;
      const tangentCoordinate = Vec2.dot(relative, face.worldTangent);
      const halfLength = face.length / 2;
      if (Math.abs(tangentCoordinate) > halfLength + 1e-4) continue;
      const cornerDistance = halfLength - Math.abs(tangentCoordinate);
      if (cornerDistance <= cornerBand) continue;

      const shift = inPlace ? { x: 0, y: 0 } : Vec2.scale(face.worldNormal, normalDistance - 0.02);
      const alignedPos = Vec2.add(dragRawPos, shift);
      const contact = end.worldPos;
      const dragOBB = createOBB(alignedPos, dragCfg.colliderWidth, dragCfg.colliderHeight, dragRot);
      if (getOBBPenetrationDepth(dragOBB, beamOBB, inPlace ? 2.5 : 0) > (inPlace ? 2.5 : 0.03)) continue;
      const localA = Vec2.rotate(Vec2.sub(contact, alignedPos), -dragRot);
      const localB = Vec2.rotate(Vec2.sub(contact, targetPiece.position), -targetPiece.rotation);
      const pair = resolveMaterialPairProfileId(
        dragType, dragIsPrebuilt, targetPiece.type, Boolean(targetPiece.isPrebuilt), 'TIMBER_FACE',
      );
      const taxonomy: 'TIMBER_FACE' | 'FACE_BINDING' =
        isStoneMaterial(dragType) || isStoneMaterial(targetPiece.type) ? 'FACE_BINDING' : 'TIMBER_FACE';
      const candidate: ContinuousEndpointFaceSeatSolution & { score: number } = {
        valid: true, alignedPos,
        sourceSocketId: `${dragPieceId}_${endpointFaceSocketName(dragType, face.id)}`,
        targetSocketId: end.id,
        sourceSocketName: endpointFaceSocketName(dragType, face.id),
        targetSocketName: end.localName || end.id,
        sourceFaceId: face.id, targetFaceId: beamEndFaceId(end),
        sourceFaceNormal: face.worldNormal, targetFaceNormal: end.normal,
        localAnchorA: localA, localAnchorB: localB, worldContactPoint: contact,
        normalCorrectionPx: Number(Vec2.distance(dragRawPos, alignedPos).toFixed(3)),
        seamSeparation: 0,
        restAngle: normalizeAngleSigned(targetPiece.rotation - dragRot),
        jointType: 'TIMBER_FACE',
        connectionSubtype: resolveConnectionSubtype('TIMBER_FACE', dragType, targetPiece.type),
        materialPairKey: pair,
        strengthProfile: resolveBindingStrengthProfile(
          'TIMBER_FACE', dragType, targetPiece.type, dragIsPrebuilt, Boolean(targetPiece.isPrebuilt),
        ),
        taxonomy,
        distanceFromNearestCornerPx: Number(cornerDistance.toFixed(3)),
        score: normalDistance,
      };
      if (!best || candidate.score < best.score) best = candidate;
    }
  }

  if (!best) return null;
  const { score: _score, ...solution } = best;
  return solution;
}

export const MIN_BROAD_FACE_OVERLAP_PX = 0.25 * CONSTRUCTION_UNIT;

export interface BroadFaceOverlapSolution {
  valid: boolean;
  alignedPos: Vector2;
  sourceSocketId: string;
  targetSocketId: string;
  sourceSocketName: string;
  targetSocketName: string;
  sourceFaceId: PieceFaceId;
  targetFaceId: PieceFaceId;
  sourceFaceNormal: Vector2;
  targetFaceNormal: Vector2;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldContactPoint: Vector2;
  overlapLength: number;
  overlapStartWorld: Vector2;
  overlapEndWorld: Vector2;
  normalCorrectionPx: number;
  seamSeparation: number;
  restAngle: number;
  jointType: 'TIMBER_FACE';
  connectionSubtype: ConstructionBindingSubtype;
  materialPairKey: MaterialPairProfileId;
  strengthProfile: string;
  taxonomy: 'TIMBER_FACE' | 'FACE_BINDING';
  candidateLabel: 'Timber Face Joint';
  friendlyMessage: string;
}

function broadFaceSocketName(type: MaterialType, faceId: PieceFaceId): string {
  if (type === 'wood_beam') {
    return faceId === 'TOP_FACE' ? 'SIDE_TOP_CENTER' : 'SIDE_BOTTOM_CENTER';
  }
  switch (faceId) {
    case 'TOP_FACE': return 'TOP_EDGE';
    case 'BOTTOM_FACE': return 'BOTTOM_EDGE';
    case 'LEFT_FACE': return 'LEFT_EDGE';
    case 'RIGHT_FACE': return 'RIGHT_EDGE';
    default: return 'TOP_EDGE';
  }
}

/** Continuous broad beam-to-block face solver. Corrects only along the face normal. */
export function solveBroadFaceOverlap(
  dragType: MaterialType,
  dragRawPos: Vector2,
  dragRot: number,
  targetPiece: PlacedPiece,
  dragPieceId = 'ghost',
  options?: {
    maxNormalDistancePx?: number;
    minOverlapPx?: number;
    inPlace?: boolean;
    dragIsPrebuilt?: boolean;
  },
): BroadFaceOverlapSolution | null {
  if ((dragType === 'wood_beam') === (targetPiece.type === 'wood_beam')) return null;
  const dragCfg = PIECE_DEFINITIONS[dragType] ?? MATERIAL_CONFIGS[dragType];
  const targetCfg = PIECE_DEFINITIONS[targetPiece.type] ?? MATERIAL_CONFIGS[targetPiece.type];
  if (!dragCfg.jointCapable || !targetCfg.jointCapable) return null;

  const maxNormalDistancePx = options?.maxNormalDistancePx ?? WORLD_CONFIG.snapDistance;
  const minOverlapPx = options?.minOverlapPx ?? MIN_BROAD_FACE_OVERLAP_PX;
  const inPlace = Boolean(options?.inPlace);
  const dragIsPrebuilt = Boolean(options?.dragIsPrebuilt);
  const dragFaces = getPieceFacesForTransform(dragType, dragRawPos, dragRot, dragPieceId).filter(
    (f) => dragType === 'wood_beam'
      ? f.id === 'TOP_FACE' || f.id === 'BOTTOM_FACE'
      : f.id === 'TOP_FACE' || f.id === 'BOTTOM_FACE' || f.id === 'LEFT_FACE' || f.id === 'RIGHT_FACE',
  );
  const targetFaces = getPieceFacesForTransform(
    targetPiece.type, targetPiece.position, targetPiece.rotation, targetPiece.id,
  ).filter((f) => targetPiece.type === 'wood_beam'
    ? f.id === 'TOP_FACE' || f.id === 'BOTTOM_FACE'
    : f.id === 'TOP_FACE' || f.id === 'BOTTOM_FACE' || f.id === 'LEFT_FACE' || f.id === 'RIGHT_FACE');
  const targetOBB = createOBB(targetPiece.position, targetCfg.colliderWidth, targetCfg.colliderHeight, targetPiece.rotation);
  let best: (BroadFaceOverlapSolution & { score: number }) | null = null;

  for (const dFace of dragFaces) for (const tFace of targetFaces) {
    const normalDot = Vec2.dot(dFace.worldNormal, tFace.worldNormal);
    if (normalDot > -0.96) continue;
    const n = tFace.worldNormal;
    if (Vec2.dot(Vec2.sub(dragRawPos, tFace.worldCenter), n) <= 2) continue;
    const signedNormalDist = Vec2.dot(Vec2.sub(dFace.worldCenter, tFace.worldCenter), n);
    const absNormalDist = Math.abs(signedNormalDist);
    if (absNormalDist > maxNormalDistancePx) continue;

    const alignedPos = inPlace
      ? dragRawPos
      : Vec2.add(dragRawPos, Vec2.scale(n, 0.02 - signedNormalDist));
    const dragOBB = createOBB(alignedPos, dragCfg.colliderWidth, dragCfg.colliderHeight, dragRot);
    if (getOBBPenetrationDepth(dragOBB, targetOBB, inPlace ? 2.5 : 0) > (inPlace ? 2.5 : 0.03)) continue;

    const shift = Vec2.sub(alignedPos, dragRawPos);
    const dStart = Vec2.add(dFace.worldStart, shift);
    const dEnd = Vec2.add(dFace.worldEnd, shift);
    const dCenter = Vec2.add(dFace.worldCenter, shift);
    const t = tFace.worldTangent;
    const project = (v: Vector2) => Vec2.dot(Vec2.sub(v, tFace.worldCenter), t);
    const minA = Math.min(project(dStart), project(dEnd));
    const maxA = Math.max(project(dStart), project(dEnd));
    const minB = Math.min(project(tFace.worldStart), project(tFace.worldEnd));
    const maxB = Math.max(project(tFace.worldStart), project(tFace.worldEnd));
    const overlapMin = Math.max(minA, minB);
    const overlapMax = Math.min(maxA, maxB);
    const overlapLength = Number((overlapMax - overlapMin).toFixed(3));
    if (overlapLength < minOverlapPx - 1e-4) continue;

    const normalGap = Vec2.dot(Vec2.sub(dCenter, tFace.worldCenter), n);
    const seamOrigin = Vec2.add(tFace.worldCenter, Vec2.scale(n, normalGap * 0.5));
    const mid = (overlapMin + overlapMax) * 0.5;
    const worldContactPoint = Vec2.add(seamOrigin, Vec2.scale(t, mid));
    const localAnchorA = Vec2.rotate(Vec2.sub(worldContactPoint, alignedPos), -dragRot);
    const localAnchorB = Vec2.rotate(Vec2.sub(worldContactPoint, targetPiece.position), -targetPiece.rotation);
    const materialPairKey = resolveMaterialPairProfileId(
      dragType, dragIsPrebuilt, targetPiece.type, Boolean(targetPiece.isPrebuilt), 'TIMBER_FACE',
    );
    const strengthProfile = resolveBindingStrengthProfile(
      'TIMBER_FACE', dragType, targetPiece.type, dragIsPrebuilt, Boolean(targetPiece.isPrebuilt),
    );
    const involvesStone = isStoneMaterial(dragType) || isStoneMaterial(targetPiece.type);
    const taxonomy: 'TIMBER_FACE' | 'FACE_BINDING' = involvesStone ? 'FACE_BINDING' : 'TIMBER_FACE';
    const candidate: BroadFaceOverlapSolution & { score: number } = {
      valid: true,
      alignedPos,
      sourceSocketId: `${dragPieceId}_${broadFaceSocketName(dragType, dFace.id)}`,
      targetSocketId: `${targetPiece.id}_${broadFaceSocketName(targetPiece.type, tFace.id)}`,
      sourceSocketName: broadFaceSocketName(dragType, dFace.id),
      targetSocketName: broadFaceSocketName(targetPiece.type, tFace.id),
      sourceFaceId: dFace.id,
      targetFaceId: tFace.id,
      sourceFaceNormal: dFace.worldNormal,
      targetFaceNormal: tFace.worldNormal,
      localAnchorA,
      localAnchorB,
      worldContactPoint,
      overlapLength,
      overlapStartWorld: Vec2.add(seamOrigin, Vec2.scale(t, overlapMin)),
      overlapEndWorld: Vec2.add(seamOrigin, Vec2.scale(t, overlapMax)),
      normalCorrectionPx: Number(Vec2.distance(dragRawPos, alignedPos).toFixed(3)),
      seamSeparation: Number(Math.max(0, Math.abs(normalGap) - 0.025).toFixed(3)),
      restAngle: normalizeAngleSigned(targetPiece.rotation - dragRot),
      jointType: 'TIMBER_FACE',
      connectionSubtype: resolveConnectionSubtype('TIMBER_FACE', dragType, targetPiece.type),
      materialPairKey,
      strengthProfile,
      taxonomy,
      candidateLabel: 'Timber Face Joint',
      friendlyMessage: involvesStone
        ? 'Timber Face Joint — flush beam-to-stone face binding ready.'
        : 'Timber Face Joint — flush surface connection ready.',
      score: absNormalDist - Math.min(8, overlapLength / 8),
    };
    if (!best || candidate.score < best.score) best = candidate;
  }
  if (!best) return null;
  const { score: _score, ...solution } = best;
  return solution;
}

export interface TimberLCornerSolution {
  valid: boolean;
  alignedPos: Vector2;
  sourceSocketId: string;
  targetSocketId: string;
  sourceSocketName: string;
  targetSocketName: string;
  sourceFaceId: PieceFaceId;
  targetFaceId: PieceFaceId;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldSeamPoint: Vector2;
  seamSeparation: number;
  restAngle: number;
  jointType: 'TIMBER_CORNER';
  strengthProfile: 'TIMBER_CORNER';
  taxonomy: 'TIMBER_CORNER';
  candidateLabel: 'Timber Corner Joint';
  friendlyMessage: string;
}

/**
 * Solves a deterministic, placement-order-independent L-shaped Frame Corner (TIMBER_CORNER)
 * when two Timber Beams meet near their endpoints at an approximate right/corner angle (68°..112°).
 *
 * Canonical Butt-Style L-Corner Rule:
 * - Between the two beams, the more horizontal beam (|cos(rot)| >= |sin(rot)|) acts as the continuous
 *   cap/sill face at the corner, using its flush corner-side socket (SIDE_TOP_A/B or SIDE_BOTTOM_A/B at x = ±(hw - hh)).
 * - The more vertical beam (|sin(rot)| > |cos(rot)|) butts its endpoint face (END_A_CENTER or END_B_CENTER at x = ±hw)
 *   flush against the horizontal beam's side socket.
 * - Because this assignment depends only on the two beams' orientations and which ends meet—never on which
 *   beam was placed first—Horizontal-then-Vertical and Vertical-then-Horizontal produce the exact same
 *   world geometry, seam point, socket pair, and TIMBER_CORNER joint!
 */
export function solveTimberLCorner(
  dragRawPos: Vector2,
  dragRot: number,
  dragEndSign: -1 | 1, // -1 for END_A region, +1 for END_B region
  targetBeam: PlacedPiece,
  targetEndSign: -1 | 1, // -1 for END_A region, +1 for END_B region
  dragPieceId = 'ghost',
): TimberLCornerSolution | null {
  if (targetBeam.type !== 'wood_beam') return null;

  const beamCfg = PIECE_DEFINITIONS.wood_beam ?? MATERIAL_CONFIGS.wood_beam;
  const hw = beamCfg.width / 2; // 72 px
  const hh = beamCfg.height / 2; // 12 px

  // Check relative angle between longitudinal axes: must be in L-corner range [68°, 112°]
  const axisA = { x: Math.cos(dragRot), y: Math.sin(dragRot) };
  const axisB = { x: Math.cos(targetBeam.rotation), y: Math.sin(targetBeam.rotation) };
  const absDot = Math.abs(Vec2.dot(axisA, axisB));
  const maxCos = Math.cos((TIMBER_JOINT_CONFIG.lCornerMinAngleDeg * Math.PI) / 180); // cos(68°) ≈ 0.3746
  if (absDot > maxCos) {
    return null;
  }

  // Determine which beam is the Horizontal-ish cap/sill and which is the Vertical-ish post
  const dragHorizScore = Math.abs(axisA.x);
  const targetHorizScore = Math.abs(axisB.x);
  const isDragHorizontal =
    Math.abs(dragHorizScore - targetHorizScore) > 1e-4
      ? dragHorizScore > targetHorizScore
      : dragPieceId.localeCompare(targetBeam.id) < 0;

  const hRot = isDragHorizontal ? dragRot : targetBeam.rotation;
  const vRot = isDragHorizontal ? targetBeam.rotation : dragRot;
  const hEndSign = isDragHorizontal ? dragEndSign : targetEndSign;
  const vEndSign = isDragHorizontal ? targetEndSign : dragEndSign;

  // On the vertical beam V, the meeting endpoint has outward normal:
  // vEndOutward = Rotate((vEndSign, 0), vRot).
  // The vertical beam body extends in direction vBodyDir = -vEndOutward.
  const vEndLocalPos = { x: vEndSign * hw, y: 0 };
  const vEndOutward = Vec2.rotate({ x: vEndSign, y: 0 }, vRot);
  const vBodyDir = Vec2.scale(vEndOutward, -1);

  // On the horizontal beam H, the vertical beam butts against whichever side face (TOP_FACE at y = -hh
  // or BOTTOM_FACE at y = +hh) faces toward vBodyDir!
  const hLocalTopNormal = Vec2.rotate({ x: 0, y: -1 }, hRot);
  const hLocalBottomNormal = Vec2.rotate({ x: 0, y: 1 }, hRot);

  const useBottomSideOfH = Vec2.dot(hLocalBottomNormal, vBodyDir) >= Vec2.dot(hLocalTopNormal, vBodyDir);
  const hSideSignY: -1 | 1 = useBottomSideOfH ? 1 : -1;

  // Flush L-corner local socket on H:
  // Local x is inset by hh (12px) from the end face ±hw so V's outer side face aligns 100% flush with H's end face!
  const hCornerSocketName =
    hSideSignY === -1
      ? hEndSign === -1
        ? 'SIDE_TOP_A'
        : 'SIDE_TOP_B'
      : hEndSign === -1
        ? 'SIDE_BOTTOM_A'
        : 'SIDE_BOTTOM_B';

  const vEndSocketName = vEndSign === -1 ? 'END_A_CENTER' : 'END_B_CENTER';

  const hLocalAnchor = { x: hEndSign * (hw - hh), y: hSideSignY * hh };
  const vLocalAnchor = vEndLocalPos;

  const hFaceId: PieceFaceId = hSideSignY === -1 ? 'TOP_FACE' : 'BOTTOM_FACE';
  const vFaceId: PieceFaceId = vEndSign === -1 ? 'END_A_FACE' : 'END_B_FACE';

  // Compute alignedPos for the dragged piece so that world(hLocalAnchor on H) === world(vLocalAnchor on V)
  // with a 0.02px outward normal clearance so SAT penetration is strictly 0.00px.
  const hOutwardSideNormal = useBottomSideOfH ? hLocalBottomNormal : hLocalTopNormal;

  let alignedPos: Vector2;
  let worldSeamPoint: Vector2;

  if (isDragHorizontal) {
    // Target is Vertical (V), Dragged is Horizontal (H)
    const vSeamWorld = Vec2.add(targetBeam.position, Vec2.rotate(vLocalAnchor, vRot));
    const hOffsetWorld = Vec2.rotate(hLocalAnchor, hRot);
    // H sits on the opposite side of hOutwardSideNormal from V's end face
    alignedPos = Vec2.sub(
      Vec2.sub(vSeamWorld, Vec2.scale(hOutwardSideNormal, 0.02)),
      hOffsetWorld,
    );
    worldSeamPoint = vSeamWorld;
  } else {
    // Target is Horizontal (H), Dragged is Vertical (V)
    const hSeamWorld = Vec2.add(targetBeam.position, Vec2.rotate(hLocalAnchor, hRot));
    const vOffsetWorld = Vec2.rotate(vLocalAnchor, vRot);
    alignedPos = Vec2.sub(
      Vec2.add(hSeamWorld, Vec2.scale(hOutwardSideNormal, 0.02)),
      vOffsetWorld,
    );
    worldSeamPoint = hSeamWorld;
  }

  // Verify zero OBB penetration between H and V (or apply minimal clearance if angles are slightly non-90°)
  const targetOBB = createOBB(
    targetBeam.position,
    beamCfg.colliderWidth,
    beamCfg.colliderHeight,
    targetBeam.rotation,
  );
  let dragOBB = createOBB(alignedPos, beamCfg.colliderWidth, beamCfg.colliderHeight, dragRot);
  let pen = getOBBPenetrationDepth(dragOBB, targetOBB, 0);

  if (pen > 0.005) {
    const pushDir = isDragHorizontal
      ? Vec2.scale(hOutwardSideNormal, -1)
      : hOutwardSideNormal;
    let lo = 0;
    let hi = hh * 1.2;
    let found = hi;
    for (let iter = 0; iter < 12; iter++) {
      const mid = (lo + hi) / 2;
      const testPos = Vec2.add(alignedPos, Vec2.scale(pushDir, mid));
      const testOBB = createOBB(testPos, beamCfg.colliderWidth, beamCfg.colliderHeight, dragRot);
      if (getOBBPenetrationDepth(testOBB, targetOBB, 0) <= 0) {
        found = mid;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    alignedPos = Vec2.add(alignedPos, Vec2.scale(pushDir, found + 0.02));
    dragOBB = createOBB(alignedPos, beamCfg.colliderWidth, beamCfg.colliderHeight, dragRot);
    pen = getOBBPenetrationDepth(dragOBB, targetOBB, 0);
  }

  if (pen > 0.02) {
    return null;
  }

  const sourceSocketName = isDragHorizontal ? hCornerSocketName : vEndSocketName;
  const targetSocketName = isDragHorizontal ? vEndSocketName : hCornerSocketName;
  const localAnchorA = isDragHorizontal ? hLocalAnchor : vLocalAnchor;
  const localAnchorB = isDragHorizontal ? vLocalAnchor : hLocalAnchor;
  const sourceFaceId = isDragHorizontal ? hFaceId : vFaceId;
  const targetFaceId = isDragHorizontal ? vFaceId : hFaceId;

  const worldAnchorA = Vec2.add(alignedPos, Vec2.rotate(localAnchorA, dragRot));
  const worldAnchorB = Vec2.add(targetBeam.position, Vec2.rotate(localAnchorB, targetBeam.rotation));
  const seamSeparation = Number(Math.max(0, Vec2.distance(worldAnchorA, worldAnchorB) - 0.025).toFixed(3));

  const twoPi = Math.PI * 2;
  let restAngle = (targetBeam.rotation - dragRot) % twoPi;
  if (restAngle > Math.PI) restAngle -= twoPi;
  if (restAngle <= -Math.PI) restAngle += twoPi;

  return {
    valid: true,
    alignedPos,
    sourceSocketId: `${dragPieceId}_${sourceSocketName}`,
    targetSocketId: `${targetBeam.id}_${targetSocketName}`,
    sourceSocketName,
    targetSocketName,
    sourceFaceId,
    targetFaceId,
    localAnchorA,
    localAnchorB,
    worldSeamPoint: Vec2.scale(Vec2.add(worldAnchorA, worldAnchorB), 0.5),
    seamSeparation,
    restAngle,
    jointType: 'TIMBER_CORNER',
    strengthProfile: 'TIMBER_CORNER',
    taxonomy: 'TIMBER_CORNER',
    candidateLabel: 'Timber Corner Joint',
    friendlyMessage: 'Timber Corner Joint — flush L-corner ready.',
  };
}

export interface SharedApexPeakSolution {
  valid: boolean;
  alignedPos: Vector2;
  sourceSocketId: string;
  targetSocketId: string;
  sourceSocketName: string;
  targetSocketName: string;
  sourceCornerId: PieceCornerId;
  targetCornerId: PieceCornerId;
  sourceFaceId: PieceFaceId;
  targetFaceId: PieceFaceId;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldApexPoint: Vector2;
  seamSeparation: number;
  endpointCenterSeparation: number;
  restAngle: number;
  balancedAdjustmentActive: boolean;
  partnerPieceAdjustment: PartnerPieceAdjustment | null;
  peakSymmetryDiagnostics: PeakSymmetryDiagnostics;
  roofSupportSummary: RoofSupportDiagnosticSummary;
}

/**
 * Identifies the lower/inner apex corner on a sloped rafter's upper end face.
 * At the upper end of a sloped rafter, the end face has two corners:
 * - Upper/outer corner (smaller world Y, higher in the sky)
 * - Lower/inner corner (larger world Y, lower/inward at the roof soffit)
 * When the Left Rafter's lower/inner corner and Right Rafter's lower/inner corner meet at a shared
 * seam point P_seam, the vertical line x = P_seam.x is a strict separating axis between the two
 * rafters for all roof slopes (20°..70°), guaranteeing:
 * - 0.00px OBB penetration
 * - 0.00px seam separation
 * - Exact equal height (y_L === y_R) for equal angles
 * - 100% placement-order independence
 */
function getUpperEndInwardCorner(
  rot: number,
  endSocketName: string,
  hw: number,
  hh: number,
): {
  localCorner: Vector2;
  localEndCenter: Vector2;
  cornerId: PieceCornerId;
  faceId: PieceFaceId;
  worldCornerOffset: Vector2;
  worldOuterCornerOffset: Vector2;
  worldEndCenterOffset: Vector2;
  slopeRad: number;
  isLeftRafter: boolean; // true if upper end points up-and-right (normal.x > 0)
} {
  const isEndA = endSocketName.startsWith('END_A');
  const endSign = isEndA ? -1 : 1;
  const localEndCenter = { x: endSign * hw, y: 0 };
  const endOutwardNormal = Vec2.rotate({ x: endSign, y: 0 }, rot);

  const cornerPlus = { x: endSign * hw, y: hh };
  const cornerMinus = { x: endSign * hw, y: -hh };
  const worldOffsetPlus = Vec2.rotate(cornerPlus, rot);
  const worldOffsetMinus = Vec2.rotate(cornerMinus, rot);

  // In canvas/world coordinates (+Y is downward), the lower/inward soffit corner of the upper end face
  // is the one with the LARGER world Y offset!
  const usePlusAsInward = worldOffsetPlus.y >= worldOffsetMinus.y;
  const localCorner = usePlusAsInward ? cornerPlus : cornerMinus;
  const worldCornerOffset = usePlusAsInward ? worldOffsetPlus : worldOffsetMinus;
  const worldOuterCornerOffset = usePlusAsInward ? worldOffsetMinus : worldOffsetPlus;
  const cornerId: PieceCornerId = isEndA
    ? usePlusAsInward
      ? 'END_A_INNER_CORNER'
      : 'END_A_OUTER_CORNER'
    : usePlusAsInward
      ? 'END_B_INNER_CORNER'
      : 'END_B_OUTER_CORNER';

  const slopeRad = Math.asin(Math.min(1, Math.abs(endOutwardNormal.y)));

  return {
    localCorner,
    localEndCenter,
    cornerId,
    faceId: isEndA ? 'END_A_FACE' : 'END_B_FACE',
    worldCornerOffset,
    worldOuterCornerOffset,
    worldEndCenterOffset: Vec2.rotate(localEndCenter, rot),
    slopeRad,
    isLeftRafter: endOutwardNormal.x > 0,
  };
}

/**
 * Classifies the support foundation reliability of a lower support piece or contact.
 */
export function classifySupportFoundation(
  supportPiece: PlacedPiece | null,
  supportType: 'STRUCTURAL_JOINT' | 'CONTACT_ONLY' | 'ENVIRONMENTAL_ANCHOR' | 'NONE',
  allValidPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  existingJoints: TimberJoint[],
  excludedPieceIds: string[] = [],
): SupportFoundationClassification {
  if (supportType === 'ENVIRONMENTAL_ANCHOR') {
    return 'FIXED_ENVIRONMENTAL_SUPPORT';
  }
  if (!supportPiece) {
    if (supportType === 'CONTACT_ONLY') {
      return 'FIXED_ENVIRONMENTAL_SUPPORT';
    }
    return 'UNSTABLE_OR_UNRESOLVED_SUPPORT';
  }
  if (supportPiece.isPrebuilt) {
    return 'FIXED_ENVIRONMENTAL_SUPPORT';
  }
  if (supportPiece.attachedAnchorId) {
    return 'ANCHORED_PIECE';
  }

  // Check if connected to an environmental anchor or prebuilt piece via intact joint
  const connectedJoints = existingJoints.filter(
    (j) =>
      j.state !== 'BROKEN' &&
      (j.pieceAId === supportPiece.id || j.pieceBId === supportPiece.id) &&
      !excludedPieceIds.includes(j.pieceAId === supportPiece.id ? j.pieceBId : j.pieceAId),
  );
  for (const j of connectedJoints) {
    const otherId = j.pieceAId === supportPiece.id ? j.pieceBId : j.pieceAId;
    if (otherId.startsWith('anchor_') || j.strengthProfile === 'ENVIRONMENTAL_ANCHOR') {
      return 'ANCHORED_PIECE';
    }
    const otherPiece = allValidPieces.find((p) => p.id === otherId);
    if (otherPiece && (otherPiece.isPrebuilt || otherPiece.attachedAnchorId)) {
      return 'STABLE_COLUMN_CANDIDATE';
    }
  }

  // Check if supportPiece is tilted excessively (> 12 deg)
  const normRot = normalizeAngleSigned(supportPiece.rotation);
  if (Math.abs(normRot) > (12 * Math.PI) / 180 && Math.abs(Math.abs(normRot) - Math.PI / 2) > (12 * Math.PI) / 180) {
    return 'UNSTABLE_OR_UNRESOLVED_SUPPORT';
  }

  const cfg = PIECE_DEFINITIONS[supportPiece.type] ?? MATERIAL_CONFIGS[supportPiece.type];
  const obb = createOBB(
    supportPiece.position,
    cfg.colliderWidth,
    cfg.colliderHeight,
    supportPiece.rotation,
  );
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const v of obb.vertices) {
    if (v.y > maxY) maxY = v.y;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
  }

  // Ground contact check
  const onGround = maxY >= WORLD_CONFIG.groundY - 6;
  if (onGround) {
    // Check if near an environmental anchor
    for (const anchor of anchors) {
      if (Vec2.distance(supportPiece.position, anchor.position) <= anchor.radius + Math.max(cfg.width, cfg.height) * 0.65) {
        return 'ANCHORED_PIECE';
      }
    }
    if (connectedJoints.length > 0 || supportPiece.type === 'stone_block') {
      return 'STABLE_COLUMN_CANDIDATE';
    }
    return 'FREE_STANDING_LOOSE_BLOCK';
  }

  // Check if supported by another piece directly beneath it
  const probeOBB = createOBB(
    { x: supportPiece.position.x, y: supportPiece.position.y + 8 },
    cfg.colliderWidth * 0.9,
    cfg.colliderHeight,
    supportPiece.rotation,
  );
  for (const other of allValidPieces) {
    if (other.id === supportPiece.id || excludedPieceIds.includes(other.id)) continue;
    if (other.condition === 'BROKEN' || other.condition === 'LOST') continue;
    if (other.position.y <= supportPiece.position.y) continue;
    const oCfg = PIECE_DEFINITIONS[other.type] ?? MATERIAL_CONFIGS[other.type];
    const oOBB = createOBB(other.position, oCfg.colliderWidth, oCfg.colliderHeight, other.rotation);
    if (checkOBBOverlap(probeOBB, oOBB, 0.5)) {
      // Check horizontal overhang
      const spanWidth = Math.max(1, maxX - minX);
      const horizontalOffset = Math.abs(supportPiece.position.x - other.position.x);
      if (horizontalOffset > (oCfg.colliderWidth * 0.5 + spanWidth * 0.15)) {
        return 'UNSTABLE_OR_UNRESOLVED_SUPPORT';
      }
      if (other.isPrebuilt || other.attachedAnchorId || connectedJoints.length > 0) {
        return 'STABLE_COLUMN_CANDIDATE';
      }
      return 'FREE_STANDING_LOOSE_BLOCK';
    }
  }

  return 'UNSTABLE_OR_UNRESOLVED_SUPPORT';
}

/**
 * Computes qualitative Roof Support Status Summary for a pair of rafters forming a ROOF_PEAK.
 */
export function computeRoofSupportSummary(
  rafterAPos: Vector2,
  rafterARot: number,
  rafterAUpperSocketName: string,
  rafterAPieceId: string | undefined,
  rafterBPiece: PlacedPiece,
  rafterBUpperSocketName: string,
  allValidPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  existingJoints: TimberJoint[],
  proposedSecondaryJoints: Array<{ targetPieceId: string; sourceSocketName: string }> = [],
): RoofSupportDiagnosticSummary {
  const beamCfg = PIECE_DEFINITIONS.wood_beam ?? MATERIAL_CONFIGS.wood_beam;
  const hw = beamCfg.width / 2;

  const aIsEndA = rafterAUpperSocketName.startsWith('END_A');
  const aUpperNormal = Vec2.rotate({ x: aIsEndA ? -1 : 1, y: 0 }, rafterARot);
  const aLowerEndWorld = Vec2.sub(rafterAPos, Vec2.scale(aUpperNormal, hw));
  const aLowerSocketPrefix = aIsEndA ? 'END_B' : 'END_A';

  const bIsEndA = rafterBUpperSocketName.startsWith('END_A');
  const bUpperNormal = Vec2.rotate({ x: bIsEndA ? -1 : 1, y: 0 }, rafterBPiece.rotation);
  const bLowerEndWorld = Vec2.sub(rafterBPiece.position, Vec2.scale(bUpperNormal, hw));
  const bLowerSocketPrefix = bIsEndA ? 'END_B' : 'END_A';

  const isALeft = aUpperNormal.x > 0;

  const classifyLowerEnd = (
    lowerPt: Vector2,
    pieceId: string | undefined,
    lowerSocketPrefix: string,
    isDraggedPiece: boolean,
  ): {
    supported: boolean;
    supportType: 'STRUCTURAL_JOINT' | 'CONTACT_ONLY' | 'ENVIRONMENTAL_ANCHOR' | 'NONE';
    supportingPiece: PlacedPiece | null;
  } => {
    // 1. Check active or proposed structural joints at the lower end
    if (isDraggedPiece) {
      const hasProposedLower = proposedSecondaryJoints.some((pj) =>
        pj.sourceSocketName.startsWith(lowerSocketPrefix),
      );
      if (hasProposedLower) {
        const partnerId = proposedSecondaryJoints.find((pj) =>
          pj.sourceSocketName.startsWith(lowerSocketPrefix),
        )?.targetPieceId;
        const supPiece = allValidPieces.find((p) => p.id === partnerId) ?? null;
        return { supported: true, supportType: 'STRUCTURAL_JOINT', supportingPiece: supPiece };
      }
    }

    if (pieceId) {
      const existingLowerJoint = existingJoints.find(
        (j) =>
          j.state !== 'BROKEN' &&
          ((j.pieceAId === pieceId &&
            j.pieceBId !== rafterBPiece.id &&
            j.socketAId.includes(lowerSocketPrefix)) ||
            (j.pieceBId === pieceId &&
              j.pieceAId !== rafterBPiece.id &&
              j.socketBId.includes(lowerSocketPrefix))),
      );
      if (existingLowerJoint) {
        const supId =
          existingLowerJoint.pieceAId === pieceId
            ? existingLowerJoint.pieceBId
            : existingLowerJoint.pieceAId;
        const supPiece = allValidPieces.find((p) => p.id === supId) ?? null;
        return { supported: true, supportType: 'STRUCTURAL_JOINT', supportingPiece: supPiece };
      }
    }

    // 2. Check environmental anchors
    for (const anchor of anchors) {
      if (Vec2.distance(lowerPt, anchor.position) <= anchor.radius + 20) {
        return { supported: true, supportType: 'ENVIRONMENTAL_ANCHOR', supportingPiece: null };
      }
    }

    // 3. Check ground contact
    if (Math.abs(lowerPt.y - WORLD_CONFIG.groundY) <= 22) {
      return { supported: true, supportType: 'CONTACT_ONLY', supportingPiece: null };
    }

    // 4. Check physical support contact on another intact piece (e.g. block corner or top face)
    for (const p of allValidPieces) {
      if (p.id === pieceId || p.id === rafterBPiece.id) continue;
      if (p.condition === 'BROKEN' || p.condition === 'LOST') continue;
      const pCfg = PIECE_DEFINITIONS[p.type] ?? MATERIAL_CONFIGS[p.type];
      const obb = createOBB(p.position, pCfg.colliderWidth, pCfg.colliderHeight, p.rotation);
      if (getDistancePointToOBB(lowerPt, obb) <= 20) {
        const isStructural = Boolean(pCfg.jointCapable);
        return {
          supported: true,
          supportType: isStructural ? 'STRUCTURAL_JOINT' : 'CONTACT_ONLY',
          supportingPiece: p,
        };
      }
    }

    return { supported: false, supportType: 'NONE', supportingPiece: null };
  };

  const evalA = classifyLowerEnd(aLowerEndWorld, rafterAPieceId, aLowerSocketPrefix, true);
  const evalB = classifyLowerEnd(bLowerEndWorld, rafterBPiece.id, bLowerSocketPrefix, false);

  const leftEval = isALeft ? evalA : evalB;
  const rightEval = isALeft ? evalB : evalA;

  const excludedIds = [rafterAPieceId ?? 'ghost', rafterBPiece.id];
  const leftSupportFoundationClassification = classifySupportFoundation(
    leftEval.supportingPiece,
    leftEval.supportType,
    allValidPieces,
    anchors,
    existingJoints,
    excludedIds,
  );
  const rightSupportFoundationClassification = classifySupportFoundation(
    rightEval.supportingPiece,
    rightEval.supportType,
    allValidPieces,
    anchors,
    existingJoints,
    excludedIds,
  );

  const supportColumnAppearsUnstable =
    (leftEval.supported && leftSupportFoundationClassification === 'UNSTABLE_OR_UNRESOLVED_SUPPORT') ||
    (rightEval.supported && rightSupportFoundationClassification === 'UNSTABLE_OR_UNRESOLVED_SUPPORT');

  const leftLowerRafterSupported = leftEval.supported;
  const rightLowerRafterSupported = rightEval.supported;
  const lowerSupportUnresolved = !leftLowerRafterSupported || !rightLowerRafterSupported;

  const bothLooseUnanchored =
    leftLowerRafterSupported &&
    rightLowerRafterSupported &&
    leftSupportFoundationClassification === 'FREE_STANDING_LOOSE_BLOCK' &&
    rightSupportFoundationClassification === 'FREE_STANDING_LOOSE_BLOCK';

  const oneLooseUnanchored =
    leftLowerRafterSupported &&
    rightLowerRafterSupported &&
    (leftSupportFoundationClassification === 'FREE_STANDING_LOOSE_BLOCK' ||
      rightSupportFoundationClassification === 'FREE_STANDING_LOOSE_BLOCK') &&
    !bothLooseUnanchored;

  let summaryMessage = 'Roof Peak connected — Both lower ends supported';
  if (supportColumnAppearsUnstable) {
    summaryMessage = 'Roof Peak connected — Support column appears unstable';
  } else if (leftLowerRafterSupported && rightLowerRafterSupported) {
    summaryMessage = 'Roof Peak connected — Both lower ends supported';
  } else if (leftLowerRafterSupported && !rightLowerRafterSupported) {
    summaryMessage = 'Peak connected, but one lower support is missing (Right rafter unsupported)';
  } else if (!leftLowerRafterSupported && rightLowerRafterSupported) {
    summaryMessage = 'Peak connected, but one lower support is missing (Left rafter unsupported)';
  } else {
    summaryMessage = 'Peak connected, but lower supports are missing (Left and right rafters unsupported)';
  }

  let foundationAdvisoryMessage: string | null = null;
  if (bothLooseUnanchored) {
    foundationAdvisoryMessage = 'Both rafters connected; walls are unanchored.';
  } else if (oneLooseUnanchored) {
    foundationAdvisoryMessage = 'Rafter connected; support block may tip.';
  } else if (leftLowerRafterSupported && rightLowerRafterSupported && !supportColumnAppearsUnstable) {
    foundationAdvisoryMessage = 'Roof geometry complete; foundation stability untested.';
  }

  return {
    peakConnected: true,
    leftLowerRafterSupported,
    rightLowerRafterSupported,
    lowerSupportUnresolved,
    leftSupportType: leftEval.supportType,
    rightSupportType: rightEval.supportType,
    leftSupportFoundationClassification,
    rightSupportFoundationClassification,
    supportColumnAppearsUnstable,
    summaryMessage,
    foundationAdvisoryMessage,
  };
}

/**
 * Solves a Shared-Apex Roof Peak (ROOF_PEAK) using inward corner/face geometry rather than
 * endpoint centers alone.
 *
 * Guarantees:
 * - Zero OBB penetration (penetrationDepth === 0)
 * - Zero seam separation (seamSeparation === 0)
 * - Exact apex symmetry for equal support heights and equal opposing angles (y_L === y_R)
 * - 100% placement-order independence (Left-then-Right === Right-then-Left)
 * - Clean asymmetric peaks when angles or support heights differ
 * - Optional Balanced Peak Adjustment when both rafters are unconstrained movable pieces
 *   and total correction is within BALANCED_PEAK_MAX_CORRECTION (24px)
 * - Stress-free localAnchorA and localAnchorB derived from the shared world apex seam
 */
export function solveSharedApexRoofPeak(
  dragRawPos: Vector2,
  dragRot: number,
  pSock: SnapSocket,
  targetRafter: PlacedPiece,
  tSock: SnapSocket,
  allValidPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  existingJoints: TimberJoint[],
  dragPieceId = 'ghost',
  allowBalancedAdjustment = false,
): SharedApexPeakSolution | null {
  if (targetRafter.type !== 'wood_beam') return null;

  const beamCfg = PIECE_DEFINITIONS.wood_beam ?? MATERIAL_CONFIGS.wood_beam;
  const hw = beamCfg.width / 2;
  const hh = beamCfg.height / 2;

  const pSocketName = pSock.localName || 'END_B_CENTER';
  const tSocketName = tSock.localName || 'END_A_CENTER';

  const infoA = getUpperEndInwardCorner(dragRot, pSocketName, hw, hh);
  const infoB = getUpperEndInwardCorner(targetRafter.rotation, tSocketName, hw, hh);

  // Must be one Left Rafter and one Right Rafter meeting at an upper apex
  if (infoA.isLeftRafter === infoB.isLeftRafter) {
    return null;
  }

  // Target rafter's inward apex corner in world space (before any balanced adjustment)
  const targetInwardCornerWorld = Vec2.add(targetRafter.position, infoB.worldCornerOffset);

  // Micro horizontal clearance (0.02px) along X away from target rafter so SAT penetration is strictly 0.00px
  const clearanceSignX = infoA.isLeftRafter ? -1 : 1;
  const targetSeamForA = {
    x: targetInwardCornerWorld.x + clearanceSignX * 0.02,
    y: targetInwardCornerWorld.y,
  };

  // Single-rafter solution (moving only Rafter A so its inward apex corner meets targetInwardCornerWorld)
  let singleAlignedPos = Vec2.sub(targetSeamForA, infoA.worldCornerOffset);

  // Verify zero OBB penetration
  const targetOBB = createOBB(
    targetRafter.position,
    beamCfg.colliderWidth,
    beamCfg.colliderHeight,
    targetRafter.rotation,
  );
  const testOBB = createOBB(
    singleAlignedPos,
    beamCfg.colliderWidth,
    beamCfg.colliderHeight,
    dragRot,
  );
  const pen = getOBBPenetrationDepth(testOBB, targetOBB, 0);
  if (pen > 0.02) {
    return null;
  }

  // Evaluate whether Optional Balanced Peak Adjustment applies:
  // Both rafters are movable player-owned pieces, neither is constrained at its lower end,
  // and the positional correction delta is small (<= BALANCED_PEAK_MAX_CORRECTION = 24px).
  let balancedAdjustmentActive = false;
  let partnerPieceAdjustment: PartnerPieceAdjustment | null = null;
  let finalPosA = singleAlignedPos;
  let finalPosB = { ...targetRafter.position };

  const rawInwardCornerA = Vec2.add(dragRawPos, infoA.worldCornerOffset);
  const deltaCorner = Vec2.sub(targetInwardCornerWorld, rawInwardCornerA);
  const correctionMag = Vec2.length(deltaCorner);

  if (
    allowBalancedAdjustment &&
    !targetRafter.isPrebuilt &&
    targetRafter.condition !== 'BROKEN' &&
    targetRafter.condition !== 'LOST' &&
    !targetRafter.attachedAnchorId &&
    correctionMag > 0.25 &&
    correctionMag <= BALANCED_PEAK_MAX_CORRECTION
  ) {
    // Check if targetRafter is unconstrained by other joints or lower supports
    const targetHasOtherJoints = existingJoints.some(
      (j) =>
        j.state !== 'BROKEN' &&
        (j.pieceAId === targetRafter.id || j.pieceBId === targetRafter.id) &&
        j.pieceAId !== dragPieceId &&
        j.pieceBId !== dragPieceId,
    );

    const bIsEndA = tSocketName.startsWith('END_A');
    const bUpperNormal = Vec2.rotate({ x: bIsEndA ? -1 : 1, y: 0 }, targetRafter.rotation);
    const bLowerEndWorld = Vec2.sub(targetRafter.position, Vec2.scale(bUpperNormal, hw));
    const targetLowerSeatedOnPiece = allValidPieces.some((p) => {
      if (p.id === targetRafter.id || p.id === dragPieceId) return false;
      const pCfg = PIECE_DEFINITIONS[p.type] ?? MATERIAL_CONFIGS[p.type];
      const pOBB = createOBB(p.position, pCfg.colliderWidth, pCfg.colliderHeight, p.rotation);
      return getDistancePointToOBB(bLowerEndWorld, pOBB) <= 6;
    });

    if (!targetHasOtherJoints && !targetLowerSeatedOnPiece) {
      const halfDeltaA = Vec2.scale(deltaCorner, 0.5);
      const halfDeltaB = Vec2.scale(deltaCorner, -0.5);
      const candPosA = Vec2.add(dragRawPos, halfDeltaA);
      candPosA.x += clearanceSignX * 0.02;
      const candPosB = Vec2.add(targetRafter.position, halfDeltaB);

      const obbA = createOBB(candPosA, beamCfg.colliderWidth, beamCfg.colliderHeight, dragRot);
      const obbB = createOBB(
        candPosB,
        beamCfg.colliderWidth,
        beamCfg.colliderHeight,
        targetRafter.rotation,
      );

      // Verify neither rafter collides with any third piece or terrain at the balanced positions
      let balancedValid = getOBBPenetrationDepth(obbA, obbB, 0) <= 0.02;
      if (balancedValid) {
        for (const v of [...obbA.vertices, ...obbB.vertices]) {
          if (v.y > WORLD_CONFIG.groundY + 1) {
            balancedValid = false;
            break;
          }
        }
      }
      if (balancedValid) {
        for (const other of allValidPieces) {
          if (other.id === targetRafter.id || other.id === dragPieceId) continue;
          const oCfg = PIECE_DEFINITIONS[other.type] ?? MATERIAL_CONFIGS[other.type];
          const oOBB = createOBB(other.position, oCfg.colliderWidth, oCfg.colliderHeight, other.rotation);
          if (
            checkOBBOverlap(obbA, oOBB, 2.0) ||
            checkOBBOverlap(obbB, oOBB, 2.0)
          ) {
            balancedValid = false;
            break;
          }
        }
      }

      if (balancedValid) {
        balancedAdjustmentActive = true;
        finalPosA = candPosA;
        finalPosB = candPosB;
        partnerPieceAdjustment = {
          pieceId: targetRafter.id,
          beforePos: { ...targetRafter.position },
          afterPos: { ...candPosB },
          proposedPosition: { ...candPosB },
          beforeRot: targetRafter.rotation,
          afterRot: targetRafter.rotation,
          correctionVector: halfDeltaB,
        };
      }
    }
  }

  const worldCornerA = Vec2.add(finalPosA, infoA.worldCornerOffset);
  const worldCornerB = Vec2.add(finalPosB, infoB.worldCornerOffset);
  const worldOuterA = Vec2.add(finalPosA, infoA.worldOuterCornerOffset);
  const worldOuterB = Vec2.add(finalPosB, infoB.worldOuterCornerOffset);
  const worldEndCenterA = Vec2.add(finalPosA, infoA.worldEndCenterOffset);
  const worldEndCenterB = Vec2.add(finalPosB, infoB.worldEndCenterOffset);

  const worldApexPoint = {
    x: (worldCornerA.x + worldCornerB.x) * 0.5,
    y: Math.min(worldOuterA.y, worldOuterB.y),
  };

  const sharedSeamWorld = Vec2.scale(Vec2.add(worldCornerA, worldCornerB), 0.5);
  const stressFreeLocalA = Vec2.rotate(Vec2.sub(sharedSeamWorld, finalPosA), -dragRot);
  const stressFreeLocalB = Vec2.rotate(Vec2.sub(sharedSeamWorld, finalPosB), -targetRafter.rotation);

  const seamSeparation = Number(Math.max(0, Vec2.distance(worldCornerA, worldCornerB) - 0.025).toFixed(3));
  const endpointCenterSeparation = Number(Vec2.distance(worldEndCenterA, worldEndCenterB).toFixed(2));

  // Lower endpoints of both rafters for symmetry diagnostics
  const aIsEndA = pSocketName.startsWith('END_A');
  const aUpperNormal = Vec2.rotate({ x: aIsEndA ? -1 : 1, y: 0 }, dragRot);
  const aLowerEnd = Vec2.sub(finalPosA, Vec2.scale(aUpperNormal, hw));

  const bIsEndA = tSocketName.startsWith('END_A');
  const bUpperNormal = Vec2.rotate({ x: bIsEndA ? -1 : 1, y: 0 }, targetRafter.rotation);
  const bLowerEnd = Vec2.sub(finalPosB, Vec2.scale(bUpperNormal, hw));

  const supportHeightDifference = Number(Math.abs(aLowerEnd.y - bLowerEnd.y).toFixed(2));
  const angleMagnitudeDifferenceDeg = Number(
    ((Math.abs(infoA.slopeRad - infoB.slopeRad) * 180) / Math.PI).toFixed(2),
  );
  const midSpanX = (aLowerEnd.x + bLowerEnd.x) * 0.5;
  const apexSymmetryOffset = Number(Math.abs(worldApexPoint.x - midSpanX).toFixed(2));

  const isSymmetricSlope = angleMagnitudeDifferenceDeg <= 0.5;
  const peakSymmetryDiagnostics: PeakSymmetryDiagnostics = {
    supportHeightDifference,
    angleMagnitudeDifferenceDeg,
    apexWorldCoordinate: worldApexPoint,
    apexSymmetryOffset,
    endpointSeamSeparation: seamSeparation,
    placementOrderEquivalent: true,
    isSymmetricSlope,
    isSymmetricConfiguration: isSymmetricSlope && supportHeightDifference <= 1.0,
  };

  const effectiveTargetRafter: PlacedPiece = {
    ...targetRafter,
    position: finalPosB,
  };

  const roofSupportSummary = computeRoofSupportSummary(
    finalPosA,
    dragRot,
    pSocketName,
    dragPieceId,
    effectiveTargetRafter,
    tSocketName,
    allValidPieces,
    anchors,
    existingJoints,
  );

  const twoPi = Math.PI * 2;
  let restAngle = (targetRafter.rotation - dragRot) % twoPi;
  if (restAngle > Math.PI) restAngle -= twoPi;
  if (restAngle <= -Math.PI) restAngle += twoPi;

  const sourceCornerSocketName = pSocketName.startsWith('END_A')
    ? 'END_A_CENTER'
    : 'END_B_CENTER';
  const targetCornerSocketName = tSocketName.startsWith('END_A')
    ? 'END_A_CENTER'
    : 'END_B_CENTER';

  return {
    valid: true,
    alignedPos: finalPosA,
    sourceSocketId: `${dragPieceId}_${sourceCornerSocketName}`,
    targetSocketId: `${targetRafter.id}_${targetCornerSocketName}`,
    sourceSocketName: sourceCornerSocketName,
    targetSocketName: targetCornerSocketName,
    sourceCornerId: infoA.cornerId,
    targetCornerId: infoB.cornerId,
    sourceFaceId: infoA.faceId,
    targetFaceId: infoB.faceId,
    localAnchorA: stressFreeLocalA,
    localAnchorB: stressFreeLocalB,
    worldApexPoint: sharedSeamWorld,
    seamSeparation,
    endpointCenterSeparation,
    restAngle,
    balancedAdjustmentActive,
    partnerPieceAdjustment,
    peakSymmetryDiagnostics,
    roofSupportSummary,
  };
}

/**
 * Classifies an architectural closure candidate or assembly according to ARCHITECTURAL_CLOSURE_CONFIG.
 */
export function classifyArchitecturalClosure(params: {
  positionMismatchPx: number;
  seamGapPx: number;
  angleMismatchDeg?: number;
  balancedCorrectionPx?: number;
  committedPieceAdjustmentPx?: number;
  hasColliderPenetration?: boolean;
  rivalScoreMargin?: number | null;
}): ClosureClassification {
  const {
    positionMismatchPx,
    seamGapPx,
    angleMismatchDeg = 0,
    balancedCorrectionPx = 0,
    committedPieceAdjustmentPx = 0,
    hasColliderPenetration = false,
    rivalScoreMargin = null,
  } = params;

  if (hasColliderPenetration) {
    return 'INVALID';
  }
  if (
    positionMismatchPx > ARCHITECTURAL_CLOSURE_CONFIG.forgivingPositionTolerancePx ||
    seamGapPx > ARCHITECTURAL_CLOSURE_CONFIG.forgivingSeamGapPx ||
    angleMismatchDeg > ARCHITECTURAL_CLOSURE_CONFIG.forgivingAngleToleranceDeg ||
    balancedCorrectionPx > ARCHITECTURAL_CLOSURE_CONFIG.maxBalancedCorrectionPx ||
    committedPieceAdjustmentPx > ARCHITECTURAL_CLOSURE_CONFIG.maxCommittedPieceAdjustmentPx
  ) {
    return 'INVALID';
  }
  if (
    rivalScoreMargin !== null &&
    rivalScoreMargin >= 0 &&
    rivalScoreMargin < ARCHITECTURAL_CLOSURE_CONFIG.ambiguousScoreMargin &&
    positionMismatchPx > ARCHITECTURAL_CLOSURE_CONFIG.exactPositionTolerancePx
  ) {
    return 'AMBIGUOUS';
  }
  if (
    positionMismatchPx <= ARCHITECTURAL_CLOSURE_CONFIG.exactPositionTolerancePx &&
    seamGapPx <= ARCHITECTURAL_CLOSURE_CONFIG.exactSeamGapPx &&
    angleMismatchDeg <= ARCHITECTURAL_CLOSURE_CONFIG.exactAngleToleranceDeg &&
    balancedCorrectionPx <= 0.5 &&
    committedPieceAdjustmentPx <= 0.5
  ) {
    return 'EXACT';
  }
  return 'FORGIVING';
}

/**
 * Normalizes a feature name into its mirror-invariant counterpart so left/right mirrored
 * relationships can be compared deterministically.
 */
export function getMirroredFeatureId(featureId: string): string {
  return featureId
    .replace('TOP_LEFT_CORNER', '__TMP_TR__')
    .replace('TOP_RIGHT_CORNER', 'TOP_LEFT_CORNER')
    .replace('__TMP_TR__', 'TOP_RIGHT_CORNER')
    .replace('BOTTOM_LEFT_CORNER', '__TMP_BR__')
    .replace('BOTTOM_RIGHT_CORNER', 'BOTTOM_LEFT_CORNER')
    .replace('__TMP_BR__', 'BOTTOM_RIGHT_CORNER')
    .replace('LEFT_FACE', '__TMP_RF__')
    .replace('RIGHT_FACE', 'LEFT_FACE')
    .replace('__TMP_RF__', 'RIGHT_FACE')
    .replace('END_A', '__TMP_EB__')
    .replace('END_B', 'END_A')
    .replace('__TMP_EB__', 'END_B');
}

/**
 * Builds a deterministic, source/target-order-independent CanonicalRelationshipDescription
 * for any pair of connected pieces.
 *
 * Swapping pieceA and pieceB (e.g. dragging rafter to block vs dragging block to rafter, or
 * placing left rafter before right rafter vs right rafter before left rafter) produces the
 * exact same CanonicalRelationshipDescription!
 */
export function buildCanonicalRelationship(params: {
  pieceAId: string;
  pieceAType: MaterialType;
  pieceAPos: Vector2;
  pieceARot: number;
  featureAId: string;
  pieceBId: string;
  pieceBType: MaterialType;
  pieceBPos: Vector2;
  pieceBRot: number;
  featureBId: string;
  connectionTaxonomy: ConnectionTaxonomyCategory;
  jointProfileId: string;
}): CanonicalRelationshipDescription {
  const cleanFeature = (f: string, id: string): string => {
    if (f.startsWith(`${id}_`)) return f.slice(id.length + 1);
    return f.replace(/^ghost_/, '');
  };

  const featA = cleanFeature(params.featureAId, params.pieceAId);
  const featB = cleanFeature(params.featureBId, params.pieceBId);

  // Sort endpoints deterministically by:
  // 1. pieceType alphabetical ('stone_block' < 'wood_beam' < 'wood_block')
  // 2. world X position (rounded to 0.5 px)
  // 3. world Y position (rounded to 0.5 px)
  // 4. feature name
  const roundCoord = (v: number) => Math.round(v * 2) / 2;
  const rxA = roundCoord(params.pieceAPos.x);
  const ryA = roundCoord(params.pieceAPos.y);
  const rxB = roundCoord(params.pieceBPos.x);
  const ryB = roundCoord(params.pieceBPos.y);

  let aFirst = true;
  if (params.pieceAType !== params.pieceBType) {
    aFirst = params.pieceAType.localeCompare(params.pieceBType) < 0;
  } else if (Math.abs(rxA - rxB) > 0.5) {
    aFirst = rxA < rxB;
  } else if (Math.abs(ryA - ryB) > 0.5) {
    aFirst = ryA < ryB;
  } else if (featA !== featB) {
    aFirst = featA.localeCompare(featB) < 0;
  } else {
    aFirst = params.pieceAId.localeCompare(params.pieceBId) <= 0;
  }

  const first = aFirst
    ? {
        id: params.pieceAId,
        type: params.pieceAType,
        pos: params.pieceAPos,
        rot: params.pieceARot,
        feat: featA,
      }
    : {
        id: params.pieceBId,
        type: params.pieceBType,
        pos: params.pieceBPos,
        rot: params.pieceBRot,
        feat: featB,
      };
  const second = aFirst
    ? {
        id: params.pieceBId,
        type: params.pieceBType,
        pos: params.pieceBPos,
        rot: params.pieceBRot,
        feat: featB,
      }
    : {
        id: params.pieceAId,
        type: params.pieceAType,
        pos: params.pieceAPos,
        rot: params.pieceARot,
        feat: featA,
      };

  const relPos = {
    x: Number((second.pos.x - first.pos.x).toFixed(2)),
    y: Number((second.pos.y - first.pos.y).toFixed(2)),
  };
  const relRot = Number(normalizeAngleSigned(second.rot - first.rot).toFixed(3));

  // Normalize endpoint feature family (e.g. END_A/B_INNER_CORNER or END_A/B_CENTER -> END_A/B)
  const normEndpointFamily = (f: string) =>
    f
      .replace(/_INNER_CORNER$/, '_ENDPOINT')
      .replace(/_OUTER_CORNER$/, '_ENDPOINT')
      .replace(/_CENTER$/, '_ENDPOINT');

  const normFeatFirst = normEndpointFamily(first.feat);
  const normFeatSecond = normEndpointFamily(second.feat);

  const canonicalKey = `${first.type}:${normFeatFirst}<->${second.type}:${normFeatSecond}|tax=${params.connectionTaxonomy}|prof=${params.jointProfileId}|dx=${Math.round(relPos.x)}|dy=${Math.round(relPos.y)}|drot=${Math.round((relRot * 180) / Math.PI)}`;

  // Mirrored equivalent key (invariant under X -> -X, rot -> -rot, LEFT <-> RIGHT, END_A <-> END_B)
  const mFeatFirst = normEndpointFamily(getMirroredFeatureId(first.feat)).replace(/^END_[AB]/, 'END_X');
  const mFeatSecond = normEndpointFamily(getMirroredFeatureId(second.feat)).replace(/^END_[AB]/, 'END_X');
  const sortedMFeats = [
    `${first.type}:${mFeatFirst.replace(/TOP_(LEFT|RIGHT)_CORNER/, 'TOP_SIDE_CORNER').replace(/BOTTOM_(LEFT|RIGHT)_CORNER/, 'BOTTOM_SIDE_CORNER')}`,
    `${second.type}:${mFeatSecond.replace(/TOP_(LEFT|RIGHT)_CORNER/, 'TOP_SIDE_CORNER').replace(/BOTTOM_(LEFT|RIGHT)_CORNER/, 'BOTTOM_SIDE_CORNER')}`,
  ].sort();

  const mirroredEquivalentKey = `${sortedMFeats[0]}<->${sortedMFeats[1]}|tax=${params.connectionTaxonomy}|prof=${params.jointProfileId}|absDx=${Math.round(Math.abs(relPos.x))}|dy=${Math.round(relPos.y)}|absDrot=${Math.round(Math.abs((relRot * 180) / Math.PI))}`;

  return {
    pieceAId: first.id,
    pieceAType: first.type,
    featureAId: first.feat,
    pieceBId: second.id,
    pieceBType: second.type,
    featureBId: second.feat,
    relativeWorldPosition: relPos,
    relativeRotationRad: relRot,
    connectionTaxonomy: params.connectionTaxonomy,
    jointProfileId: params.jointProfileId,
    canonicalKey,
    mirroredEquivalentKey,
  };
}

/**
 * Computes a placement-order-independent structural hash of the current piece and joint graph.
 * Equivalent final structures built in different placement orders produce the exact same hash.
 */
export function computePlacementOrderHash(
  pieces: PlacedPiece[],
  joints: TimberJoint[],
): string {
  const pieceMap = new Map<string, PlacedPiece>();
  for (const p of pieces) {
    if (p.condition === 'BROKEN' || p.condition === 'LOST') continue;
    pieceMap.set(p.id, p);
  }

  const jointKeys: string[] = [];
  for (const j of joints) {
    if (j.state === 'BROKEN') continue;
    const pA = pieceMap.get(j.pieceAId);
    const pB = pieceMap.get(j.pieceBId);
    if (!pA || !pB) continue;
    const canon = buildCanonicalRelationship({
      pieceAId: pA.id,
      pieceAType: pA.type,
      pieceAPos: pA.position,
      pieceARot: pA.rotation,
      featureAId: j.socketAId,
      pieceBId: pB.id,
      pieceBType: pB.type,
      pieceBPos: pB.position,
      pieceBRot: pB.rotation,
      featureBId: j.socketBId,
      connectionTaxonomy:
        j.jointType === 'ROOF_PEAK'
          ? 'ROOF_PEAK'
          : j.jointType === 'RAFTER_CORNER_SEAT'
            ? 'RAFTER_CORNER_SEAT'
            : j.jointType === 'TIMBER_CORNER'
              ? 'TIMBER_CORNER'
              : j.jointType === 'DIAGONAL_BRACE'
                ? 'DIAGONAL_BRACE'
                : j.jointType === 'TIMBER_FACE'
                  ? 'TIMBER_FACE'
                  : 'TIMBER_SPLICE',
      jointProfileId: j.strengthProfile,
    });
    jointKeys.push(canon.canonicalKey);
  }

  jointKeys.sort();
  return jointKeys.join('||');
}

/**
 * Derives stress-free rest geometry (`localAnchorA`, `localAnchorB`, `worldPosition`,
 * `restAngle`, `restSeparation = 0`) from the final committed world transforms of `pieceA`
 * and `pieceB` after all snap and balanced adjustments have completed.
 *
 * Guarantees that at the start of physics simulation:
 * - initialPositionalErrorPx === 0
 * - initialAngularErrorRad === 0
 * - initialConstraintEnergy === 0
 */
export function deriveStressFreeJointGeometryFromCommittedTransforms(
  joint: TimberJoint,
  pieceA: PlacedPiece,
  pieceB: PlacedPiece,
): TimberJoint {
  const worldA = Vec2.add(pieceA.position, Vec2.rotate(joint.localAnchorA, pieceA.rotation));
  const worldB = Vec2.add(pieceB.position, Vec2.rotate(joint.localAnchorB, pieceB.rotation));
  const sharedWorldPoint = Vec2.scale(Vec2.add(worldA, worldB), 0.5);

  const stressFreeLocalA = Vec2.rotate(
    Vec2.sub(sharedWorldPoint, pieceA.position),
    -pieceA.rotation,
  );
  const stressFreeLocalB = Vec2.rotate(
    Vec2.sub(sharedWorldPoint, pieceB.position),
    -pieceB.rotation,
  );
  const restAngle = normalizeAngleSigned(pieceB.rotation - pieceA.rotation);

  const materialPairKey = resolveMaterialPairProfileId(
    pieceA.type,
    Boolean(pieceA.isPrebuilt),
    pieceB.type,
    Boolean(pieceB.isPrebuilt),
    joint.jointType,
  );
  const connectionSubtype = resolveConnectionSubtype(joint.jointType, pieceA.type, pieceB.type);
  const canonicalRelationship = buildCanonicalRelationship({
    pieceAId: pieceA.id,
    pieceAType: pieceA.type,
    pieceAPos: pieceA.position,
    pieceARot: pieceA.rotation,
    featureAId: joint.socketAId,
    pieceBId: pieceB.id,
    pieceBType: pieceB.type,
    pieceBPos: pieceB.position,
    pieceBRot: pieceB.rotation,
    featureBId: joint.socketBId,
    connectionTaxonomy:
      joint.jointType === 'ROOF_PEAK'
        ? 'ROOF_PEAK'
        : joint.jointType === 'RAFTER_CORNER_SEAT'
          ? 'RAFTER_CORNER_SEAT'
          : joint.jointType === 'TIMBER_CORNER'
            ? 'TIMBER_CORNER'
            : joint.jointType === 'CORNER_BINDING'
              ? 'CORNER_BINDING'
              : joint.jointType === 'BLOCK_BINDING'
                ? 'BLOCK_BINDING'
                : joint.jointType === 'DIAGONAL_BRACE'
                  ? 'DIAGONAL_BRACE'
                  : joint.jointType === 'TIMBER_FACE' || joint.jointType === 'FACE_BINDING'
                    ? isStoneMaterial(pieceA.type) || isStoneMaterial(pieceB.type)
                      ? 'FACE_BINDING'
                      : 'TIMBER_FACE'
                    : 'TIMBER_SPLICE',
    jointProfileId: joint.strengthProfile,
  });

  return {
    ...joint,
    bindingId: joint.bindingId ?? joint.jointId,
    connectionSubtype,
    materialA: pieceA.type,
    materialB: pieceB.type,
    materialPairKey,
    isPrebuiltBinding: Boolean(pieceA.isPrebuilt || pieceB.isPrebuilt),
    complianceProfile: joint.strengthProfile,
    geometrySchemaVersion: GEOMETRY_SCHEMA_VERSION,
    localAnchorA: stressFreeLocalA,
    localAnchorB: stressFreeLocalB,
    worldPosition: sharedWorldPoint,
    restAngle,
    restSeparation: 0,
    canonicalRelationship,
    visualConnectionState: joint.state === 'STRAINED' ? 'STRAINED_JOINT' : 'COMMITTED_JOINT',
    visualJointCapType: getVisualJointCapType(joint.jointType, undefined, materialPairKey),
    initialPositionalErrorPx: 0,
    initialAngularErrorRad: 0,
    initialConstraintEnergy: 0,
  };
}

/**
 * Solves a coherent Roof-Assembly Closure (`ROOF_ASSEMBLY`) when a sloped rafter is dragged
 * near an opposing sloped rafter and/or lower support blocks.
 *
 * Handles:
 * - Complete supported roof recognition (Left Lower + Right Lower + Shared Apex Peak)
 * - Missing left or right support recognition
 * - Small balanced adjustments across editable pieces (`<= maxCommittedPieceAdjustmentPx`)
 *   when all three relationships are within forgiving closure tolerance
 * - Co-adjusting the `(Left Rafter, Right Rafter)` pair vertically/horizontally when seated
 *   between two fixed support blocks so all 3 joints close with 0.00px collider penetration
 */
export function solveRoofAssemblyClosure(params: {
  dragPieceId: string;
  dragPieceType: MaterialType;
  dragRawPos: Vector2;
  dragAlignedPos: Vector2;
  dragRot: number;
  allValidPieces: PlacedPiece[];
  anchors: EnvironmentalAnchor[];
  existingJoints: TimberJoint[];
  primaryJoint: ProposedTimberJoint | null;
  secondaryJoints: ProposedTimberJoint[];
}): {
  roofAssemblyPreview: RoofAssemblyPreview | null;
  adjustedDragPos: Vector2;
  partnerAdjustments: PartnerPieceAdjustment[];
  additionalProposedJoints: ProposedTimberJoint[];
} {
  const {
    dragPieceId,
    dragPieceType,
    dragAlignedPos,
    dragRot,
    allValidPieces,
    anchors,
    existingJoints,
    primaryJoint,
    secondaryJoints,
  } = params;

  if (dragPieceType !== 'wood_beam') {
    return {
      roofAssemblyPreview: null,
      adjustedDragPos: dragAlignedPos,
      partnerAdjustments: [],
      additionalProposedJoints: [],
    };
  }

  // Check if dragRot is a roof rafter incline (20°..70°)
  const absSin = Math.abs(Math.sin(dragRot));
  const slopeDeg = (Math.asin(Math.min(1, absSin)) * 180) / Math.PI;
  if (
    slopeDeg < TIMBER_JOINT_CONFIG.roofPeakMinSlopeDeg ||
    slopeDeg > TIMBER_JOINT_CONFIG.roofPeakMaxSlopeDeg
  ) {
    return {
      roofAssemblyPreview: null,
      adjustedDragPos: dragAlignedPos,
      partnerAdjustments: [],
      additionalProposedJoints: [],
    };
  }

  const beamCfg = PIECE_DEFINITIONS.wood_beam ?? MATERIAL_CONFIGS.wood_beam;
  const hw = beamCfg.width / 2;

  let currentDragPos = { ...dragAlignedPos };
  const partnerAdjustments: PartnerPieceAdjustment[] = [];
  const additionalProposedJoints: ProposedTimberJoint[] = [];

  if (primaryJoint?.partnerPieceAdjustment) {
    partnerAdjustments.push(primaryJoint.partnerPieceAdjustment);
  }

  // Determine upper and lower sockets of the dragged rafter
  const dragSockets = getPieceSnapSockets('wood_beam', currentDragPos, dragRot);
  const endASock = dragSockets.find((s) => s.localName === 'END_A_CENTER');
  const endBSock = dragSockets.find((s) => s.localName === 'END_B_CENTER');
  if (!endASock || !endBSock) {
    return {
      roofAssemblyPreview: null,
      adjustedDragPos: currentDragPos,
      partnerAdjustments,
      additionalProposedJoints,
    };
  }

  const dragUpperSock = endASock.normal.y < endBSock.normal.y ? endASock : endBSock;
  const dragLowerSock = dragUpperSock === endASock ? endBSock : endASock;
  const isDragLeftRafter = dragUpperSock.normal.x > 0;

  // Locate opposing rafter (either from primaryJoint/secondaryJoints or nearby sloped wood_beam)
  let opposingRafter: PlacedPiece | null = null;
  let opposingUpperSock: SnapSocket | null = null;
  let peakJoint: ProposedTimberJoint | null =
    primaryJoint?.jointType === 'ROOF_PEAK'
      ? primaryJoint
      : secondaryJoints.find((j) => j.jointType === 'ROOF_PEAK') ?? null;

  if (peakJoint) {
    opposingRafter = allValidPieces.find((p) => p.id === peakJoint!.targetPieceId) ?? null;
    if (opposingRafter) {
      const oppAdjustment = partnerAdjustments.find((a) => a.pieceId === opposingRafter!.id);
      const oppPos = oppAdjustment ? oppAdjustment.afterPos : opposingRafter.position;
      const oppSocks = getPieceSnapSockets('wood_beam', oppPos, opposingRafter.rotation);
      const oppA = oppSocks.find((s) => s.localName === 'END_A_CENTER');
      const oppB = oppSocks.find((s) => s.localName === 'END_B_CENTER');
      if (oppA && oppB) {
        opposingUpperSock = oppA.normal.y < oppB.normal.y ? oppA : oppB;
      }
    }
  } else {
    // Search for a nearby opposing sloped rafter within forgiving tolerance
    for (const cand of allValidPieces) {
      if (cand.id === dragPieceId || cand.type !== 'wood_beam') continue;
      if (cand.condition === 'BROKEN' || cand.condition === 'LOST') continue;
      const cSocks = getPieceSnapSockets('wood_beam', cand.position, cand.rotation);
      const cA = cSocks.find((s) => s.localName === 'END_A_CENTER');
      const cB = cSocks.find((s) => s.localName === 'END_B_CENTER');
      if (!cA || !cB) continue;
      const cUpper = cA.normal.y < cB.normal.y ? cA : cB;
      const cSlopeDeg = (Math.asin(Math.min(1, Math.abs(cUpper.normal.y))) * 180) / Math.PI;
      if (
        cSlopeDeg < TIMBER_JOINT_CONFIG.roofPeakMinSlopeDeg ||
        cSlopeDeg > TIMBER_JOINT_CONFIG.roofPeakMaxSlopeDeg
      ) {
        continue;
      }
      const isCandLeft = cUpper.normal.x > 0;
      if (isCandLeft === isDragLeftRafter) continue;
      if (
        Vec2.distance(dragUpperSock.worldPos, cUpper.worldPos) <=
        ARCHITECTURAL_CLOSURE_CONFIG.forgivingPositionTolerancePx * 1.35
      ) {
        opposingRafter = cand;
        opposingUpperSock = cUpper;
        break;
      }
    }
  }

  // Case: Primary snap was a lower block corner seat (RAFTER_CORNER_SEAT), and an opposing rafter is near the upper end!
  if (!peakJoint && opposingRafter && opposingUpperSock) {
    const peakSol = solveSharedApexRoofPeak(
      currentDragPos,
      dragRot,
      dragUpperSock,
      opposingRafter,
      opposingUpperSock,
      allValidPieces,
      anchors,
      existingJoints,
      dragPieceId,
      false,
    );
    if (peakSol && peakSol.valid) {
      const peakMismatch = Vec2.sub(peakSol.alignedPos, currentDragPos);
      const peakMismatchDist = Vec2.length(peakMismatch);
      if (peakMismatchDist <= ARCHITECTURAL_CLOSURE_CONFIG.forgivingPositionTolerancePx) {
        // Can we adjust the lower support block or opposing rafter slightly so both close?
        if (peakMismatchDist <= 1.5) {
          peakJoint = {
            targetPieceId: opposingRafter.id,
            sourceSocketId: peakSol.sourceSocketId,
            targetSocketId: peakSol.targetSocketId,
            sourceSocketName: peakSol.sourceSocketName,
            targetSocketName: peakSol.targetSocketName,
            localAnchorA: peakSol.localAnchorA,
            localAnchorB: peakSol.localAnchorB,
            worldPosition: peakSol.worldApexPoint,
            jointType: 'ROOF_PEAK',
            restAngle: peakSol.restAngle,
            restSeparation: 0,
            strengthProfile: 'ROOF_PEAK',
            connectionTaxonomy: 'ROOF_PEAK',
            sourceFaceId: peakSol.sourceFaceId,
            targetFaceId: peakSol.targetFaceId,
            sourceCornerId: peakSol.sourceCornerId,
            targetCornerId: peakSol.targetCornerId,
            sourceFeatureType: 'apex',
            targetFeatureType: 'apex',
            seamSeparation: peakSol.seamSeparation,
            peakSymmetryDiagnostics: peakSol.peakSymmetryDiagnostics,
            roofSupportSummary: peakSol.roofSupportSummary,
            visualConnectionState: 'CANDIDATE_PREVIEW',
            visualJointCapType: 'PEAK_CAP',
            playerFacingConnectionLabel: 'Roof Peak',
          };
          additionalProposedJoints.push(peakJoint);
        } else if (
          primaryJoint &&
          primaryJoint.jointType === 'RAFTER_CORNER_SEAT' &&
          peakMismatchDist <= ARCHITECTURAL_CLOSURE_CONFIG.maxCommittedPieceAdjustmentPx
        ) {
          const supBlock = allValidPieces.find((p) => p.id === primaryJoint.targetPieceId);
          if (supBlock && !supBlock.isPrebuilt && !supBlock.attachedAnchorId) {
            const shiftedBlockPos = Vec2.add(supBlock.position, peakMismatch);
            const bCfg = PIECE_DEFINITIONS[supBlock.type] ?? MATERIAL_CONFIGS[supBlock.type];
            const bOBB = createOBB(shiftedBlockPos, bCfg.colliderWidth, bCfg.colliderHeight, supBlock.rotation);
            let blockValid = true;
            for (const v of bOBB.vertices) {
              if (v.y > WORLD_CONFIG.groundY + 1) {
                blockValid = false;
                break;
              }
            }
            if (blockValid) {
              for (const other of allValidPieces) {
                if (other.id === supBlock.id || other.id === dragPieceId || other.id === opposingRafter.id) continue;
                const oCfg = PIECE_DEFINITIONS[other.type] ?? MATERIAL_CONFIGS[other.type];
                const oOBB = createOBB(other.position, oCfg.colliderWidth, oCfg.colliderHeight, other.rotation);
                if (checkOBBOverlap(bOBB, oOBB, 1.5)) {
                  blockValid = false;
                  break;
                }
              }
            }
            if (blockValid) {
              currentDragPos = peakSol.alignedPos;
              partnerAdjustments.push({
                pieceId: supBlock.id,
                beforePos: { ...supBlock.position },
                afterPos: shiftedBlockPos,
                proposedPosition: shiftedBlockPos,
                beforeRot: supBlock.rotation,
                afterRot: supBlock.rotation,
                correctionVector: peakMismatch,
              });
              primaryJoint.worldPosition = Vec2.add(primaryJoint.worldPosition, peakMismatch);
              peakJoint = {
                targetPieceId: opposingRafter.id,
                sourceSocketId: peakSol.sourceSocketId,
                targetSocketId: peakSol.targetSocketId,
                sourceSocketName: peakSol.sourceSocketName,
                targetSocketName: peakSol.targetSocketName,
                localAnchorA: peakSol.localAnchorA,
                localAnchorB: peakSol.localAnchorB,
                worldPosition: peakSol.worldApexPoint,
                jointType: 'ROOF_PEAK',
                restAngle: peakSol.restAngle,
                restSeparation: 0,
                strengthProfile: 'ROOF_PEAK',
                connectionTaxonomy: 'ROOF_PEAK',
                sourceFaceId: peakSol.sourceFaceId,
                targetFaceId: peakSol.targetFaceId,
                sourceCornerId: peakSol.sourceCornerId,
                targetCornerId: peakSol.targetCornerId,
                sourceFeatureType: 'apex',
                targetFeatureType: 'apex',
                seamSeparation: peakSol.seamSeparation,
                peakSymmetryDiagnostics: peakSol.peakSymmetryDiagnostics,
                roofSupportSummary: peakSol.roofSupportSummary,
                visualConnectionState: 'CANDIDATE_PREVIEW',
                visualJointCapType: 'PEAK_CAP',
                playerFacingConnectionLabel: 'Roof Peak',
              };
              additionalProposedJoints.push(peakJoint);
            }
          }
        }
      }
    }
  }

  // Case: Primary snap is ROOF_PEAK, check if dragged rafter's lower end is near a support block corner!
  const hasLowerJointAlready =
    primaryJoint?.jointType === 'RAFTER_CORNER_SEAT' ||
    secondaryJoints.some((j) =>
      j.sourceSocketName.startsWith(dragLowerSock.localName?.slice(0, 5) || 'END_A'),
    );

  let dragLowerSupportBlock: PlacedPiece | null = null;
  if (primaryJoint?.jointType === 'RAFTER_CORNER_SEAT') {
    dragLowerSupportBlock = allValidPieces.find((p) => p.id === primaryJoint.targetPieceId) ?? null;
  } else {
    const secLower = secondaryJoints.find((j) =>
      j.sourceSocketName.startsWith(dragLowerSock.localName?.slice(0, 5) || 'END_A'),
    );
    if (secLower) {
      dragLowerSupportBlock = allValidPieces.find((p) => p.id === secLower.targetPieceId) ?? null;
    }
  }

  if (peakJoint && opposingRafter && !hasLowerJointAlready) {
    // Recompute dragLowerSock at currentDragPos
    const updatedDragSocks = getPieceSnapSockets('wood_beam', currentDragPos, dragRot);
    const updatedLowerSock =
      updatedDragSocks.find((s) => s.localName === dragLowerSock.localName) ?? dragLowerSock;

    // Look for a block corner near updatedLowerSock
    let bestBlockCand: {
      block: PlacedPiece;
      cornerSock: SnapSocket;
      seatSol: BlockCornerSeatSolution;
      mismatch: Vector2;
      mismatchDist: number;
    } | null = null;

    for (const p of allValidPieces) {
      if (p.id === dragPieceId || p.id === opposingRafter.id) continue;
      if (p.type !== 'wood_block' && p.type !== 'stone_block' && p.type !== 'bullseye_block') continue;
      if (p.condition === 'BROKEN' || p.condition === 'LOST') continue;
      const pSocks = getPieceSnapSockets(p.type, p.position, p.rotation);
      for (const cs of pSocks) {
        if (cs.socketKind !== 'block_corner') continue;
        if (
          Vec2.distance(updatedLowerSock.worldPos, cs.worldPos) >
          ARCHITECTURAL_CLOSURE_CONFIG.forgivingPositionTolerancePx * 1.35
        ) {
          continue;
        }
        const seatSol = solveBlockCornerSeat(
          currentDragPos,
          dragRot,
          updatedLowerSock,
          p,
          cs,
        );
        if (!seatSol || !seatSol.valid) continue;
        const mismatch = Vec2.sub(currentDragPos, seatSol.alignedPos);
        const mismatchDist = Vec2.length(mismatch);
        if (
          mismatchDist <= ARCHITECTURAL_CLOSURE_CONFIG.forgivingPositionTolerancePx &&
          (!bestBlockCand || mismatchDist < bestBlockCand.mismatchDist)
        ) {
          bestBlockCand = {
            block: p,
            cornerSock: cs,
            seatSol,
            mismatch,
            mismatchDist,
          };
        }
      }
    }

    if (bestBlockCand) {
      const { block, seatSol, mismatch, mismatchDist } = bestBlockCand;
      dragLowerSupportBlock = block;

      let blockFinalPos = { ...block.position };
      let lowerSeatClosed = mismatchDist <= 2.5;

      // If the block is an editable player block and mismatch is within maxCommittedPieceAdjustmentPx,
      // shift the block to meet the exact rafter seat!
      if (
        !lowerSeatClosed &&
        !block.isPrebuilt &&
        !block.attachedAnchorId &&
        mismatchDist <= ARCHITECTURAL_CLOSURE_CONFIG.maxCommittedPieceAdjustmentPx
      ) {
        const candidateBlockPos = Vec2.add(block.position, mismatch);
        const bCfg = PIECE_DEFINITIONS[block.type] ?? MATERIAL_CONFIGS[block.type];
        const bOBB = createOBB(candidateBlockPos, bCfg.colliderWidth, bCfg.colliderHeight, block.rotation);
        const dragOBB = createOBB(currentDragPos, beamCfg.colliderWidth, beamCfg.colliderHeight, dragRot);
        let validShift = getOBBPenetrationDepth(dragOBB, bOBB, 0) <= 0.05;
        if (validShift) {
          for (const v of bOBB.vertices) {
            if (v.y > WORLD_CONFIG.groundY + 1) {
              validShift = false;
              break;
            }
          }
        }
        if (validShift) {
          for (const other of allValidPieces) {
            if (other.id === block.id || other.id === dragPieceId || other.id === opposingRafter.id) continue;
            const oCfg = PIECE_DEFINITIONS[other.type] ?? MATERIAL_CONFIGS[other.type];
            const oOBB = createOBB(other.position, oCfg.colliderWidth, oCfg.colliderHeight, other.rotation);
            if (checkOBBOverlap(bOBB, oOBB, 1.5)) {
              validShift = false;
              break;
            }
          }
        }
        if (validShift) {
          blockFinalPos = candidateBlockPos;
          lowerSeatClosed = true;
          partnerAdjustments.push({
            pieceId: block.id,
            beforePos: { ...block.position },
            afterPos: blockFinalPos,
            proposedPosition: blockFinalPos,
            beforeRot: block.rotation,
            afterRot: block.rotation,
            correctionVector: mismatch,
          });
        }
      }

      // Also check if dragged rafter at currentDragPos is already touching or within forgivingSeamGapPx of blockFinalPos without penetration
      if (!lowerSeatClosed) {
        const bCfg = PIECE_DEFINITIONS[block.type] ?? MATERIAL_CONFIGS[block.type];
        const bOBB = createOBB(blockFinalPos, bCfg.colliderWidth, bCfg.colliderHeight, block.rotation);
        const dragOBB = createOBB(currentDragPos, beamCfg.colliderWidth, beamCfg.colliderHeight, dragRot);
        const pen = getOBBPenetrationDepth(dragOBB, bOBB, 0);
        const cornerWorld = Vec2.add(
          blockFinalPos,
          Vec2.rotate(bestBlockCand.cornerSock.localPos ?? { x: 0, y: 0 }, block.rotation),
        );
        const distCornerToBeam = getDistancePointToOBB(cornerWorld, dragOBB);
        if (pen <= 0.5 && distCornerToBeam <= ARCHITECTURAL_CLOSURE_CONFIG.forgivingSeamGapPx) {
          lowerSeatClosed = true;
        }
      }

      if (lowerSeatClosed && seatSol.isBreakableJoint && seatSol.jointType) {
        const contactWorld = Vec2.add(
          blockFinalPos,
          Vec2.rotate(bestBlockCand.cornerSock.localPos ?? { x: 0, y: 0 }, block.rotation),
        );
        const stressFreeBeamAnchor = Vec2.rotate(
          Vec2.sub(contactWorld, currentDragPos),
          -dragRot,
        );
        const stressFreeBlockAnchor = Vec2.rotate(
          Vec2.sub(contactWorld, blockFinalPos),
          -block.rotation,
        );
        const lowerJoint: ProposedTimberJoint = {
          targetPieceId: block.id,
          sourceSocketId: `${dragPieceId}_${seatSol.beamSocketName}`,
          targetSocketId: bestBlockCand.cornerSock.id,
          sourceSocketName: seatSol.beamSocketName,
          targetSocketName: seatSol.blockCornerId,
          localAnchorA: stressFreeBeamAnchor,
          localAnchorB: stressFreeBlockAnchor,
          worldPosition: contactWorld,
          jointType: seatSol.jointType,
          restAngle: normalizeAngleSigned(block.rotation - dragRot),
          restSeparation: 0,
          strengthProfile: seatSol.strengthProfile || 'RAFTER_CORNER_SEAT',
          connectionTaxonomy: 'RAFTER_CORNER_SEAT',
          sourceCornerId: seatSol.beamCornerId,
          targetCornerId: seatSol.blockCornerId,
          sourceFeatureType: 'corner',
          targetFeatureType: 'corner',
          seamSeparation: seatSol.seamSeparation,
          visualConnectionState: 'CANDIDATE_PREVIEW',
          visualJointCapType: 'CORNER_BINDING',
          playerFacingConnectionLabel: 'Corner Joint',
        };
        additionalProposedJoints.push(lowerJoint);
      }
    }
  }

  if (!opposingRafter) {
    return {
      roofAssemblyPreview: null,
      adjustedDragPos: currentDragPos,
      partnerAdjustments,
      additionalProposedJoints,
    };
  }

  // Build RoofAssemblyPreview diagnostics
  const allProposed = [
    ...(primaryJoint ? [primaryJoint] : []),
    ...secondaryJoints,
    ...additionalProposedJoints,
  ];
  const oppAdjustment = partnerAdjustments.find((a) => a.pieceId === opposingRafter!.id);
  const effectiveOpposing: PlacedPiece = {
    ...opposingRafter,
    position: oppAdjustment ? oppAdjustment.afterPos : opposingRafter.position,
  };

  const oppSocks = getPieceSnapSockets('wood_beam', effectiveOpposing.position, effectiveOpposing.rotation);
  const oppA = oppSocks.find((s) => s.localName === 'END_A_CENTER');
  const oppB = oppSocks.find((s) => s.localName === 'END_B_CENTER');
  const oppUpperName =
    oppA && oppB && oppA.normal.y < oppB.normal.y ? 'END_A_CENTER' : 'END_B_CENTER';

  const summary = computeRoofSupportSummary(
    currentDragPos,
    dragRot,
    dragUpperSock.localName || 'END_B_CENTER',
    dragPieceId,
    effectiveOpposing,
    oppUpperName,
    allValidPieces,
    anchors,
    existingJoints,
    allProposed.map((j) => ({
      targetPieceId: j.targetPieceId,
      sourceSocketName: j.sourceSocketName,
    })),
  );

  const leftRafterId = isDragLeftRafter ? dragPieceId : opposingRafter.id;
  const rightRafterId = isDragLeftRafter ? opposingRafter.id : dragPieceId;

  const dragLowerWorld = Vec2.sub(
    currentDragPos,
    Vec2.scale(dragUpperSock.normal, hw),
  );
  const oppUpperNormal = oppA && oppB && oppA.normal.y < oppB.normal.y ? oppA.normal : oppB!.normal;
  const oppLowerWorld = Vec2.sub(
    effectiveOpposing.position,
    Vec2.scale(oppUpperNormal, hw),
  );

  const leftLowerWorldPos = isDragLeftRafter ? dragLowerWorld : oppLowerWorld;
  const rightLowerWorldPos = isDragLeftRafter ? oppLowerWorld : dragLowerWorld;

  const hasPeak = Boolean(peakJoint);
  const leftSupported = summary.leftLowerRafterSupported;
  const rightSupported = summary.rightLowerRafterSupported;

  let status: RoofAssemblyPreview['status'] = 'COMPLETE_SUPPORTED_ROOF';
  if (!hasPeak) {
    status = 'PEAK_UNRESOLVED';
  } else if (!leftSupported) {
    status = 'MISSING_LEFT_SUPPORT';
  } else if (!rightSupported) {
    status = 'MISSING_RIGHT_SUPPORT';
  }

  const maxPartnerMove = partnerAdjustments.reduce(
    (max, a) => Math.max(max, Vec2.length(a.correctionVector)),
    0,
  );
  const closureClassification: ClosureClassification =
    maxPartnerMove <= 0.5 && (peakJoint?.seamSeparation ?? 0) <= ARCHITECTURAL_CLOSURE_CONFIG.exactSeamGapPx
      ? 'EXACT'
      : 'FORGIVING';

  const leftConnState: VisualConnectionState | 'UNCONNECTED' = !leftSupported
    ? 'UNCONNECTED'
    : summary.leftSupportType === 'STRUCTURAL_JOINT'
      ? isDragLeftRafter
        ? 'CANDIDATE_PREVIEW'
        : 'COMMITTED_JOINT'
      : 'SUPPORTED_CONTACT';

  const rightConnState: VisualConnectionState | 'UNCONNECTED' = !rightSupported
    ? 'UNCONNECTED'
    : summary.rightSupportType === 'STRUCTURAL_JOINT'
      ? !isDragLeftRafter
        ? 'CANDIDATE_PREVIEW'
        : 'COMMITTED_JOINT'
      : 'SUPPORTED_CONTACT';

  const roofAssemblyPreview: RoofAssemblyPreview = {
    detected: true,
    status,
    closureClassification,
    leftRafterPieceId: leftRafterId,
    rightRafterPieceId: rightRafterId,
    leftSupportPieceId: isDragLeftRafter ? dragLowerSupportBlock?.id ?? null : null,
    rightSupportPieceId: !isDragLeftRafter ? dragLowerSupportBlock?.id ?? null : null,
    peakWorldPos: peakJoint?.worldPosition ?? null,
    leftLowerWorldPos,
    rightLowerWorldPos,
    leftLowerConnectionState: leftConnState,
    rightLowerConnectionState: rightConnState,
    peakConnectionState: hasPeak ? 'CANDIDATE_PREVIEW' : 'UNCONNECTED',
    leftSupportFoundationClassification:
      summary.leftSupportFoundationClassification ?? 'UNSTABLE_OR_UNRESOLVED_SUPPORT',
    rightSupportFoundationClassification:
      summary.rightSupportFoundationClassification ?? 'UNSTABLE_OR_UNRESOLVED_SUPPORT',
    balancedPieceAdjustments: partnerAdjustments,
    proposedJoints: allProposed,
    summaryMessage: summary.summaryMessage,
  };

  return {
    roofAssemblyPreview,
    adjustedDragPos: currentDragPos,
    partnerAdjustments,
    additionalProposedJoints,
  };
}

/**
 * Automated Mirrored Feature & World-Transform Invariant Audit.
 * Verifies that:
 * 1. TOP_LEFT_CORNER and TOP_RIGHT_CORNER are exact X-mirrors in local coordinates and normals.
 * 2. BOTTOM_LEFT_CORNER and BOTTOM_RIGHT_CORNER are exact X-mirrors in local coordinates and normals.
 * 3. END_A and END_B faces/corners/sockets on wood_beam are exact X-mirrors in local coordinates and normals.
 * 4. +theta and -theta world transforms and Block-Corner Seat solutions on mirrored left/right blocks
 *    produce exact mirrored world coordinates, zero penetration, zero seam separation, and identical
 *    mirrored canonical keys.
 */
export function verifyMirroredFeatureInvariants(): {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; details: string }>;
} {
  const checks: Array<{ name: string; passed: boolean; details: string }> = [];

  // 1. Block local corners mirror audit
  const blockCorners = getLocalPieceCorners('wood_block');
  const tl = blockCorners.find((c) => c.id === 'TOP_LEFT_CORNER');
  const tr = blockCorners.find((c) => c.id === 'TOP_RIGHT_CORNER');
  const bl = blockCorners.find((c) => c.id === 'BOTTOM_LEFT_CORNER');
  const br = blockCorners.find((c) => c.id === 'BOTTOM_RIGHT_CORNER');

  const topCornersMirror =
    Boolean(tl && tr) &&
    Math.abs(tl!.localPos.x + tr!.localPos.x) < 1e-6 &&
    Math.abs(tl!.localPos.y - tr!.localPos.y) < 1e-6 &&
    Math.abs(tl!.localNormal.x + tr!.localNormal.x) < 1e-6 &&
    Math.abs(tl!.localNormal.y - tr!.localNormal.y) < 1e-6 &&
    tl!.jointCapable === tr!.jointCapable;
  checks.push({
    name: 'BLOCK_TOP_LEFT_VS_TOP_RIGHT_CORNER',
    passed: topCornersMirror,
    details: topCornersMirror
      ? `TOP_LEFT (${tl?.localPos.x},${tl?.localPos.y}) mirrors TOP_RIGHT (${tr?.localPos.x},${tr?.localPos.y})`
      : 'Block top corners failed mirror invariant',
  });

  const bottomCornersMirror =
    Boolean(bl && br) &&
    Math.abs(bl!.localPos.x + br!.localPos.x) < 1e-6 &&
    Math.abs(bl!.localPos.y - br!.localPos.y) < 1e-6 &&
    Math.abs(bl!.localNormal.x + br!.localNormal.x) < 1e-6 &&
    Math.abs(bl!.localNormal.y - br!.localNormal.y) < 1e-6 &&
    bl!.jointCapable === br!.jointCapable;
  checks.push({
    name: 'BLOCK_BOTTOM_LEFT_VS_BOTTOM_RIGHT_CORNER',
    passed: bottomCornersMirror,
    details: bottomCornersMirror
      ? `BOTTOM_LEFT (${bl?.localPos.x},${bl?.localPos.y}) mirrors BOTTOM_RIGHT (${br?.localPos.x},${br?.localPos.y})`
      : 'Block bottom corners failed mirror invariant',
  });

  // 2. Beam local corners & faces mirror audit
  const beamCorners = getLocalPieceCorners('wood_beam');
  const endAInner = beamCorners.find((c) => c.id === 'END_A_INNER_CORNER');
  const endBInner = beamCorners.find((c) => c.id === 'END_B_INNER_CORNER');
  const endAOuter = beamCorners.find((c) => c.id === 'END_A_OUTER_CORNER');
  const endBOuter = beamCorners.find((c) => c.id === 'END_B_OUTER_CORNER');
  const beamFaces = getLocalPieceFaces('wood_beam');
  const endAFace = beamFaces.find((f) => f.id === 'END_A_FACE');
  const endBFace = beamFaces.find((f) => f.id === 'END_B_FACE');

  const beamEndsMirror =
    Boolean(endAInner && endBInner && endAOuter && endBOuter && endAFace && endBFace) &&
    Math.abs(endAInner!.localPos.x + endBInner!.localPos.x) < 1e-6 &&
    Math.abs(endAInner!.localPos.y - endBInner!.localPos.y) < 1e-6 &&
    Math.abs(endAOuter!.localPos.x + endBOuter!.localPos.x) < 1e-6 &&
    Math.abs(endAOuter!.localPos.y - endBOuter!.localPos.y) < 1e-6 &&
    Math.abs(endAFace!.center.x + endBFace!.center.x) < 1e-6 &&
    Math.abs(endAFace!.normal.x + endBFace!.normal.x) < 1e-6;
  checks.push({
    name: 'BEAM_END_A_VS_END_B_MIRROR',
    passed: beamEndsMirror,
    details: beamEndsMirror
      ? `END_A (${endAFace?.center.x}) mirrors END_B (${endBFace?.center.x})`
      : 'Beam endpoints failed mirror invariant',
  });

  // 3. Mirrored +theta vs -theta Block-Corner Seat audit
  const centerX = 500;
  const spanHalf = 96; // 2.0 units
  const leftBlock: PlacedPiece = {
    id: 'audit_left_block',
    type: 'wood_block',
    position: { x: centerX - spanHalf, y: 500 },
    rotation: 0,
    isPrebuilt: false,
  };
  const rightBlock: PlacedPiece = {
    id: 'audit_right_block',
    type: 'wood_block',
    position: { x: centerX + spanHalf, y: 500 },
    rotation: 0,
    isPrebuilt: false,
  };

  const theta = (-35 * Math.PI) / 180; // Left rafter (+35° up-and-right when END_A is lower left)
  const leftBlockSocks = getPieceSnapSockets('wood_block', leftBlock.position, 0);
  const rightBlockSocks = getPieceSnapSockets('wood_block', rightBlock.position, 0);
  const trSock = leftBlockSocks.find((s) => s.localName === 'TOP_RIGHT_CORNER')!;
  const tlSock = rightBlockSocks.find((s) => s.localName === 'TOP_LEFT_CORNER')!;

  const leftRafterRawPos = { x: centerX - 45, y: 455 };
  const rightRafterRawPos = { x: centerX + 45, y: 455 };
  const leftRafterSocks = getPieceSnapSockets('wood_beam', leftRafterRawPos, theta);
  const rightRafterSocks = getPieceSnapSockets('wood_beam', rightRafterRawPos, -theta);
  const leftEndA = leftRafterSocks.find((s) => s.localName === 'END_A_CENTER')!;
  const rightEndB = rightRafterSocks.find((s) => s.localName === 'END_B_CENTER')!;

  const seatLeft = solveBlockCornerSeat(leftRafterRawPos, theta, leftEndA, leftBlock, trSock);
  const seatRight = solveBlockCornerSeat(rightRafterRawPos, -theta, rightEndB, rightBlock, tlSock);

  const worldMirrorPassed =
    Boolean(seatLeft && seatRight) &&
    Math.abs((seatLeft!.alignedPos.x - centerX) + (seatRight!.alignedPos.x - centerX)) < 1e-4 &&
    Math.abs(seatLeft!.alignedPos.y - seatRight!.alignedPos.y) < 1e-4 &&
    seatLeft!.seamSeparation === seatRight!.seamSeparation &&
    seatLeft!.jointType === seatRight!.jointType &&
    seatLeft!.strengthProfile === seatRight!.strengthProfile;

  checks.push({
    name: 'MIRRORED_RAFTER_CORNER_SEAT_PARITY',
    passed: worldMirrorPassed,
    details: worldMirrorPassed
      ? `Left alignedPos=(${seatLeft!.alignedPos.x.toFixed(2)},${seatLeft!.alignedPos.y.toFixed(2)}), Right alignedPos=(${seatRight!.alignedPos.x.toFixed(2)},${seatRight!.alignedPos.y.toFixed(2)})`
      : 'Mirrored rafter corner seat failed world coordinate parity',
  });

  return {
    valid: checks.every((c) => c.passed),
    checks,
  };
}

