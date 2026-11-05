/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ARCHITECTURAL_CLOSURE_CONFIG,
  GEOMETRY_SCHEMA_VERSION,
  INITIAL_LEVEL_STATE,
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
  CandidateRankingBreakdown,
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
  RotationRejectionReason,
  RotationSource,
  RotationValidationDiagnostics,
  SnapSocket,
  TimberJoint,
  TimberJointType,
  Vector2,
  VisualConnectionState,
  VisualJointCapType,
  WispEntity,
} from '../types';
import {
  checkOBBOverlap,
  createOBB,
  getAnchorSnapSockets,
  getClosestPointOnFace,
  getDistancePointToOBB,
  getOBBPenetrationDepth,
  getPieceCorners,
  getPieceCornersForTransform,
  getPieceFaces,
  getPieceSnapSockets,
  getPieceSnapSocketsForTransform,
  mapSocketToCornerId,
  mapSocketToFaceId,
  Vec2,
} from './geometry';
import {
  buildCanonicalRelationship,
  classifyArchitecturalClosure,
  classifySupportFoundation,
  computeRoofSupportSummary,
  getVisualJointCapType,
  ENDPOINT_FACE_CORNER_BAND_PX,
  MIN_BROAD_FACE_OVERLAP_PX,
  solveBlockCornerSeat,
  solveBlockCornerSeatFromBlockDrag,
  solveBroadFaceOverlap,
  solveContinuousEndpointFaceSeat,
  solveRoofAssemblyClosure,
  solveSharedApexRoofPeak,
  solveTimberLCorner,
} from './modularJointSolver';
import { checkPieceOverlapsWisps } from './wispPlacement';

export const CANDIDATE_LOCK_RELEASE_RADIUS = 38;
export const ENDPOINT_SNAP_RADIUS = 30;

export interface LockedSnapCandidate {
  pieceSocketId: string;
  targetSocketId: string;
}

export interface SnapSolveOptions {
  preferredRotation?: number;
  rotationSource?: RotationSource;
  acceptSnapRotation?: boolean;
  lockedCandidate?: LockedSnapCandidate | null;
  wisps?: WispEntity[];
  inInventoryTray?: boolean;
  hasEnteredWorld?: boolean;
  existingJoints?: TimberJoint[];
  candidateCycleIndex?: number;
  enableBalancedPeakAdjustment?: boolean;
  freeAdjustActive?: boolean;
  fineAdjustmentOffset?: Vector2 | null;
  commitAssistActive?: boolean;
}

export interface SnapResult {
  position: Vector2;
  rotation: number;
  snapped: boolean;
  socket?: SnapSocket;
  pieceSocket?: SnapSocket;
  isValid: boolean;
  attachedAnchorId?: string;
  overlappingPieceId?: string;
  // Separation of positional and rotational snap:
  proposedRotation: number;
  requiresRotationChange: boolean;
  isAnchorRequired: boolean;
  snapPositionAccepted: boolean;
  snapRotationAccepted: boolean;
  lastSnapRejectionReason?: string | null;
  playerFriendlyRejectionMessage?: string | null;
  // Enhanced diagnostics & socket pairing metadata:
  activePieceSocketId: string | null;
  activeTargetSocketId: string | null;
  socketCompatibility: string | null;
  candidateWorldDistance: number | null;
  candidateDistance: number | null;
  candidateLockActive: boolean;
  candidateLockReleaseRadius: number;
  positionCorrectionVector: Vector2;
  explicitJointProposed: boolean;
  proposedTimberJoint: ProposedTimberJoint | null;
  proposedTimberJoints?: ProposedTimberJoint[];
  preservedJoints?: TimberJoint[];
  removedJoints?: TimberJoint[];
  lowerSupportsDetected?: boolean;
  connectionTaxonomy?: ConnectionTaxonomyCategory;
  connectionCategory:
    | 'TIMBER_JOINT'
    | 'ENVIRONMENTAL_ANCHOR'
    | 'SUPPORTED_CONTACT'
    | 'POSITION_SNAP'
    | 'NONE';
  overlapClassification:
    | 'NONE'
    | 'SOCKET_CONTACT_CLEARED'
    | 'BODY_OVERLAP'
    | 'STEEP_ANGLE_CLEARANCE'
    | 'THIRD_PIECE_CONFLICT'
    | 'TERRAIN_CONFLICT'
    | 'OUT_OF_BOUNDS';
  supportedContactPredicted: boolean;
  placementRejectionReason: string | null;
  overlapColliderId: string | null;
  penetrationDepth: number;
  // Modular Construction Geometry, Corner Seats, Roof Peak & Candidate Cycling
  candidateCycleIndex?: number;
  candidateCycleCount?: number;
  availableCandidateLabels?: string[];
  currentCandidateLabel?: string | null;
  balancedAdjustmentActive?: boolean;
  partnerPieceAdjustment?: PartnerPieceAdjustment | null;
  partnerPieceAdjustments?: PartnerPieceAdjustment[];
  roofSupportSummary?: RoofSupportDiagnosticSummary | null;
  peakSymmetryDiagnostics?: PeakSymmetryDiagnostics | null;
  sourceFeatureType?: 'socket' | 'face' | 'corner' | 'apex' | null;
  sourceFeatureId?: string | null;
  targetFeatureType?: 'socket' | 'face' | 'corner' | 'apex' | null;
  targetFeatureId?: string | null;
  seamSeparation?: number | null;
  candidateRankingBreakdown?: CandidateRankingBreakdown | null;
  // Forgiving Architectural Snap & Roof Assembly Closure
  closureClassification?: ClosureClassification | null;
  canonicalRelationship?: CanonicalRelationshipDescription | null;
  roofAssemblyPreview?: RoofAssemblyPreview | null;
  visualConnectionState?: VisualConnectionState | null;
  visualJointCapType?: VisualJointCapType | null;
  playerFacingConnectionLabel?: string | null;
  freeAdjustActive?: boolean;
  fineAdjustmentOffsetPx?: Vector2 | null;
}

/**
 * Normalizes rotation to [0, 2pi)
 */
export function normalizeAngle(rad: number): number {
  let angle = rad % (Math.PI * 2);
  if (angle < 0) angle += Math.PI * 2;
  return angle;
}

/**
 * Computes shortest signed angle delta in (-PI, PI]
 */
export function shortestSignedAngleDelta(fromRad: number, toRad: number): number {
  const twoPi = Math.PI * 2;
  let diff = (toRad - fromRad) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff <= -Math.PI) diff += twoPi;
  return diff;
}

/**
 * Snaps angle to nearest 45 degrees (pi/4 radians)
 */
export function snapAngle45(rad: number): number {
  const step = Math.PI / 4;
  return Math.round(rad / step) * step;
}

/**
 * Builds a deterministic TimberJoint ID from the two piece/socket pairs.
 */
export function buildTimberJointId(
  pieceAId: string,
  socketAName: string,
  pieceBId: string,
  socketBName: string,
): string {
  const sideA = `${pieceAId}:${socketAName}`;
  const sideB = `${pieceBId}:${socketBName}`;
  return sideA < sideB ? `tjoint__${sideA}__${sideB}` : `tjoint__${sideB}__${sideA}`;
}

const BROAD_FACE_FAMILY = 'BROAD_FACE';
const FINALIZED_BROAD_FACE_NORMAL_DISTANCE_PX = 2.5;

function socketNamesForBroadFaceCheck(
  joint: ProposedTimberJoint | TimberJoint,
): [string, string] {
  if ('sourceSocketName' in joint) {
    return [joint.sourceSocketName, joint.targetSocketName];
  }
  return [joint.socketAId, joint.socketBId];
}

/** True only for a beam broad-side to block-edge TIMBER_FACE relationship. */
export function isBroadFaceTimberJoint(
  joint: ProposedTimberJoint | TimberJoint,
): boolean {
  if (joint.jointType !== 'TIMBER_FACE') {
    return false;
  }
  if (
    joint.connectionSubtype !== undefined &&
    joint.connectionSubtype !== 'FACE_BINDING'
  ) {
    return false;
  }
  const [a, b] = socketNamesForBroadFaceCheck(joint);
  const isBeamSide = (value: string) => value.includes('SIDE_TOP') || value.includes('SIDE_BOTTOM');
  const isBlockEdge = (value: string) =>
    value.endsWith('TOP_EDGE') ||
    value.endsWith('BOTTOM_EDGE') ||
    value.endsWith('LEFT_EDGE') ||
    value.endsWith('RIGHT_EDGE');
  return (isBeamSide(a) && isBlockEdge(b)) || (isBeamSide(b) && isBlockEdge(a));
}

/** Canonical preview/commit identity for one broad-face relationship. */
export function getBroadFaceRelationshipKey(pieceAId: string, pieceBId: string): string {
  const [idLow, idHigh] = pieceAId < pieceBId ? [pieceAId, pieceBId] : [pieceBId, pieceAId];
  return `${idLow}::${idHigh}::${BROAD_FACE_FAMILY}`;
}

interface DiscoverSecondaryBroadFaceSeamsInput {
  activePieceId: string;
  activeType: MaterialType;
  finalizedPos: Vector2;
  finalizedRot: number;
  activeIsPrebuilt: boolean;
  validPieces: readonly PlacedPiece[];
  proposedTimberJoints: readonly ProposedTimberJoint[];
  preservedJoints: readonly TimberJoint[];
}

/**
 * Queries the finalized transform for additional flush broad-face supports.
 * This helper cannot alter the active transform, candidate ranking, or lock state.
 */
export function discoverSecondaryBroadFaceSeams(
  input: DiscoverSecondaryBroadFaceSeamsInput,
): ProposedTimberJoint[] {
  const existingKeys = new Set<string>();
  for (const proposal of input.proposedTimberJoints) {
    if (isBroadFaceTimberJoint(proposal)) {
      existingKeys.add(getBroadFaceRelationshipKey(input.activePieceId, proposal.targetPieceId));
    }
  }
  for (const joint of input.preservedJoints) {
    if (isBroadFaceTimberJoint(joint)) {
      existingKeys.add(getBroadFaceRelationshipKey(joint.pieceAId, joint.pieceBId));
    }
  }

  const discovered: ProposedTimberJoint[] = [];
  for (const support of input.validPieces) {
    if (
      support.id === input.activePieceId ||
      support.condition === 'BROKEN' ||
      support.condition === 'LOST'
    ) {
      continue;
    }
    const key = getBroadFaceRelationshipKey(input.activePieceId, support.id);
    if (existingKeys.has(key)) continue;

    const solution = solveBroadFaceOverlap(
      input.activeType,
      input.finalizedPos,
      input.finalizedRot,
      support,
      input.activePieceId,
      {
        inPlace: true,
        maxNormalDistancePx: FINALIZED_BROAD_FACE_NORMAL_DISTANCE_PX,
        minOverlapPx: MIN_BROAD_FACE_OVERLAP_PX,
        dragIsPrebuilt: input.activeIsPrebuilt,
      },
    );
    if (!solution?.valid) {
      continue;
    }

    const canonicalRelationship = buildCanonicalRelationship({
      pieceAId: input.activePieceId,
      pieceAType: input.activeType,
      pieceAPos: input.finalizedPos,
      pieceARot: input.finalizedRot,
      featureAId: solution.sourceFaceId,
      pieceBId: support.id,
      pieceBType: support.type,
      pieceBPos: support.position,
      pieceBRot: support.rotation,
      featureBId: solution.targetFaceId,
      connectionTaxonomy: solution.taxonomy,
      jointProfileId: solution.strengthProfile,
    });

    discovered.push({
      targetPieceId: support.id,
      sourceSocketId: solution.sourceSocketId,
      targetSocketId: solution.targetSocketId,
      sourceSocketName: solution.sourceSocketName,
      targetSocketName: solution.targetSocketName,
      localAnchorA: solution.localAnchorA,
      localAnchorB: solution.localAnchorB,
      worldPosition: solution.worldContactPoint,
      jointType: 'TIMBER_FACE',
      connectionSubtype: solution.connectionSubtype,
      materialA: input.activeType,
      materialB: support.type,
      materialPairKey: solution.materialPairKey,
      isPrebuiltBinding: Boolean(input.activeIsPrebuilt || support.isPrebuilt),
      restAngle: solution.restAngle,
      restSeparation: 0,
      seamSeparation: solution.seamSeparation,
      strengthProfile: solution.strengthProfile,
      complianceProfile: solution.strengthProfile,
      creationReason: 'SNAP_COMMIT',
      connectionTaxonomy: solution.taxonomy,
      sourceFaceId: solution.sourceFaceId,
      targetFaceId: solution.targetFaceId,
      sourceCornerId: null,
      targetCornerId: null,
      sourceFeatureType: 'face',
      targetFeatureType: 'face',
      sourceFaceNormal: solution.sourceFaceNormal,
      targetFaceNormal: solution.targetFaceNormal,
      canonicalRelationship,
      visualConnectionState: 'CANDIDATE_PREVIEW',
      visualJointCapType: getVisualJointCapType('TIMBER_FACE', solution.taxonomy, solution.materialPairKey),
      playerFacingConnectionLabel: 'Timber Face Joint available',
    });
    existingKeys.add(key);
  }

  return discovered.sort((a, b) =>
    a.targetPieceId.localeCompare(b.targetPieceId) ||
    String(a.sourceFaceId ?? '').localeCompare(String(b.sourceFaceId ?? '')) ||
    String(a.targetFaceId ?? '').localeCompare(String(b.targetFaceId ?? '')),
  );
}

/**
 * Detects whether two beam endpoints meeting at an apex form a Roof Peak (ROOF_PEAK).
 */
export function isRoofPeakSocketPair(pSock: SnapSocket, tSock: SnapSocket): boolean {
  if (pSock.socketKind !== 'beam_end' || tSock.socketKind !== 'beam_end') {
    return false;
  }
  const absAy = Math.abs(pSock.normal.y);
  const absBy = Math.abs(tSock.normal.y);
  const minSin = Math.sin((TIMBER_JOINT_CONFIG.roofPeakMinSlopeDeg * Math.PI) / 180);
  const maxSin = Math.sin((TIMBER_JOINT_CONFIG.roofPeakMaxSlopeDeg * Math.PI) / 180);

  // Both beams must be sloped within roof pitch range (~20° to 70°)
  if (absAy < minSin || absAy > maxSin || absBy < minSin || absBy > maxSin) {
    return false;
  }
  // Their outward normals at the shared apex must point from opposite horizontal sides
  // and share vertical direction toward the apex
  return pSock.normal.x * tSock.normal.x < -0.1 && pSock.normal.y * tSock.normal.y > 0.08;
}

/**
 * Checks whether both rafters of a proposed or active ROOF_PEAK have lower support
 * (from ground, environmental anchor, another joint, or resting on a support piece).
 */
export function detectRoofPeakLowerSupports(
  rafterAPos: Vector2,
  rafterARot: number,
  rafterAPieceSocket: SnapSocket,
  rafterBPiece: PlacedPiece,
  rafterBSocket: SnapSocket,
  allValidPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  existingJoints: TimberJoint[],
  excludedPieceId?: string,
): boolean {
  const halfW = MATERIAL_CONFIGS.wood_beam.width / 2;
  // Other endpoint of Rafter A is opposite to rafterAPieceSocket.normal
  const otherEndA = Vec2.sub(rafterAPos, Vec2.scale(rafterAPieceSocket.normal, halfW));
  // Other endpoint of Rafter B is opposite to rafterBSocket.normal
  const otherEndB = Vec2.sub(rafterBPiece.position, Vec2.scale(rafterBSocket.normal, halfW));

  const hasSupportAtPoint = (pt: Vector2, selfPieceId?: string): boolean => {
    if (Math.abs(pt.y - WORLD_CONFIG.groundY) <= 22) return true;
    for (const anchor of anchors) {
      if (Vec2.distance(pt, anchor.position) <= anchor.radius + 20) return true;
    }
    for (const p of allValidPieces) {
      if (p.id === selfPieceId || p.id === rafterBPiece.id || p.id === excludedPieceId) continue;
      if (p.condition === 'BROKEN' || p.condition === 'LOST') continue;
      const cfg = MATERIAL_CONFIGS[p.type];
      const obb = createOBB(p.position, cfg.width, cfg.height, p.rotation);
      if (getDistancePointToOBB(pt, obb) <= 20) return true;
    }
    if (selfPieceId) {
      const hasOtherJoint = existingJoints.some(
        (j) =>
          j.state !== 'BROKEN' &&
          (j.pieceAId === selfPieceId || j.pieceBId === selfPieceId) &&
          j.pieceAId !== excludedPieceId &&
          j.pieceBId !== excludedPieceId,
      );
      if (hasOtherJoint) return true;
    }
    return false;
  };

  return hasSupportAtPoint(otherEndA, excludedPieceId) && hasSupportAtPoint(otherEndB, rafterBPiece.id);
}

/**
 * Detects whether two Timber Beam sockets are at the ends of two beams oriented at an L-corner angle (68°..112°).
 */
export function isTimberLCornerSocketPair(
  pSock: SnapSocket,
  tSock: SnapSocket,
  dragRot: number,
  targetRot: number,
): { isLCorner: boolean; dragEndSign: -1 | 1; targetEndSign: -1 | 1 } {
  const getEndSign = (sock: SnapSocket): -1 | 1 | 0 => {
    const name = sock.localName || '';
    if (name === 'END_A_CENTER' || name === 'SIDE_TOP_A' || name === 'SIDE_BOTTOM_A') return -1;
    if (name === 'END_B_CENTER' || name === 'SIDE_TOP_B' || name === 'SIDE_BOTTOM_B') return 1;
    return 0;
  };
  const dragEndSign = getEndSign(pSock);
  const targetEndSign = getEndSign(tSock);
  if (dragEndSign === 0 || targetEndSign === 0) {
    return { isLCorner: false, dragEndSign: -1, targetEndSign: -1 };
  }
  // At least one of the two sockets must be a primary beam_end (or both corner-region sockets)
  if (pSock.socketKind !== 'beam_end' && tSock.socketKind !== 'beam_end') {
    return { isLCorner: false, dragEndSign: -1, targetEndSign: -1 };
  }
  const axisA = { x: Math.cos(dragRot), y: Math.sin(dragRot) };
  const axisB = { x: Math.cos(targetRot), y: Math.sin(targetRot) };
  const absDot = Math.abs(Vec2.dot(axisA, axisB));
  const maxCos = Math.cos((TIMBER_JOINT_CONFIG.lCornerMinAngleDeg * Math.PI) / 180);
  if (absDot > maxCos) {
    return { isLCorner: false, dragEndSign: -1, targetEndSign: -1 };
  }
  // Must not be a sloped roof peak (where both beams are oblique in roof slope range)
  if (isRoofPeakSocketPair(pSock, tSock)) {
    return { isLCorner: false, dragEndSign: -1, targetEndSign: -1 };
  }
  // Require at least one of the two beams to be approximately cardinal (within ~25° of horizontal or vertical)
  const isACardinal = Math.abs(Math.sin(dragRot * 2)) <= 0.76;
  const isBCardinal = Math.abs(Math.sin(targetRot * 2)) <= 0.76;
  if (!isACardinal && !isBCardinal) {
    return { isLCorner: false, dragEndSign: -1, targetEndSign: -1 };
  }
  // If one of the sockets is a side corner-region socket (SIDE_TOP/BOTTOM_A/B),
  // require the two sockets to be within ENDPOINT_SNAP_RADIUS so a beam centered over two posts
  // does not get pulled by a distant corner socket instead of snapping at SIDE_BOTTOM_CENTER.
  if (pSock.socketKind === 'beam_side' || tSock.socketKind === 'beam_side') {
    if (Vec2.distance(pSock.worldPos, tSock.worldPos) > ENDPOINT_SNAP_RADIUS) {
      return { isLCorner: false, dragEndSign: -1, targetEndSign: -1 };
    }
  }
  return { isLCorner: true, dragEndSign, targetEndSign };
}

/**
 * Classifies a valid construction binding / timber joint connection into its specific
 * ConnectionTaxonomyCategory, TimberJointType, ConstructionBindingSubtype, MaterialPairProfileId,
 * and strengthProfile ID across all compatible piece types.
 */
export function classifyTimberJointConnection(
  sourceType: MaterialType,
  dragRot: number,
  pSock: SnapSocket,
  targetPiece: PlacedPiece,
  tSock: SnapSocket,
  hasSecondaryStructuralConnection = false,
  sourceIsPrebuilt = false,
): {
  jointType: TimberJointType;
  strengthProfile: string;
  taxonomy: ConnectionTaxonomyCategory;
  connectionSubtype: ConstructionBindingSubtype;
  materialPairKey: MaterialPairProfileId;
  sourceFaceId: PieceFaceId | null;
  targetFaceId: PieceFaceId | null;
  sourceCornerId: PieceCornerId | null;
  targetCornerId: PieceCornerId | null;
} {
  const sourceFaceId = mapSocketToFaceId(pSock.localName, sourceType);
  const targetFaceId = mapSocketToFaceId(tSock.localName, targetPiece.type);
  const sourceCornerId = mapSocketToCornerId(pSock.localName);
  const targetCornerId = mapSocketToCornerId(tSock.localName);
  const isSourceOblique = Math.abs(Math.sin(dragRot * 2)) > 0.32;
  const isTargetCardinal = Math.abs(Math.sin(targetPiece.rotation * 2)) <= 0.25;
  const isTargetVerticalPost =
    targetPiece.type === 'wood_beam' && Math.abs(Math.sin(targetPiece.rotation)) > 0.85;
  const targetIsPrebuilt = Boolean(targetPiece.isPrebuilt);

  const finalizeClassification = (
    jointType: TimberJointType,
    taxonomy: ConnectionTaxonomyCategory,
  ) => {
    const materialPairKey = resolveMaterialPairProfileId(
      sourceType,
      targetPiece.type,
      sourceIsPrebuilt,
      targetIsPrebuilt,
      jointType,
    );
    const connectionSubtype = resolveConnectionSubtype(
      jointType,
      sourceType,
      targetPiece.type,
      pSock.socketKind,
      tSock.socketKind,
    );
    const strengthProfile = resolveBindingStrengthProfile(
      jointType,
      sourceType,
      targetPiece.type,
      sourceIsPrebuilt,
      targetIsPrebuilt,
    );
    return {
      jointType,
      strengthProfile,
      taxonomy,
      connectionSubtype,
      materialPairKey,
      sourceFaceId,
      targetFaceId,
      sourceCornerId,
      targetCornerId,
    };
  };

  // 0. Timber Beam endpoint to any Block Corner (wood_block, stone_block, bullseye_block) -> RAFTER_CORNER_SEAT
  if (
    (sourceType === 'wood_beam' &&
      targetPiece.type !== 'wood_beam' &&
      pSock.socketKind === 'beam_end' &&
      tSock.socketKind === 'block_corner') ||
    (sourceType !== 'wood_beam' &&
      targetPiece.type === 'wood_beam' &&
      pSock.socketKind === 'block_corner' &&
      tSock.socketKind === 'beam_end')
  ) {
    return finalizeClassification('RAFTER_CORNER_SEAT', 'RAFTER_CORNER_SEAT');
  }

  // 0b. Block Corner to Block Corner -> CORNER_BINDING
  if (pSock.socketKind === 'block_corner' && tSock.socketKind === 'block_corner') {
    return finalizeClassification('CORNER_BINDING', 'CORNER_BINDING');
  }

  // 0c. Block Edge to Block Edge -> BLOCK_BINDING
  if (pSock.socketKind === 'block_edge' && tSock.socketKind === 'block_edge') {
    return finalizeClassification('BLOCK_BINDING', 'BLOCK_BINDING');
  }

  // 1. Endpoint-to-Endpoint between two Timber Beams
  if (
    sourceType === 'wood_beam' &&
    targetPiece.type === 'wood_beam' &&
    pSock.socketKind === 'beam_end' &&
    tSock.socketKind === 'beam_end'
  ) {
    if (isRoofPeakSocketPair(pSock, tSock)) {
      return finalizeClassification('ROOF_PEAK', 'ROOF_PEAK');
    }
    if (
      isSourceOblique &&
      isTargetCardinal &&
      (hasSecondaryStructuralConnection || isTargetVerticalPost)
    ) {
      return finalizeClassification('DIAGONAL_BRACE', 'DIAGONAL_BRACE');
    }
    const lCornerCheck = isTimberLCornerSocketPair(pSock, tSock, dragRot, targetPiece.rotation);
    if (lCornerCheck.isLCorner) {
      return finalizeClassification('TIMBER_CORNER', 'TIMBER_CORNER');
    }
    return finalizeClassification('TIMBER_SPLICE', 'TIMBER_SPLICE');
  }

  // 2. Timber Beam endpoint to any Block face (wood_block, stone_block, bullseye_block)
  if (
    (sourceType === 'wood_beam' &&
      targetPiece.type !== 'wood_beam' &&
      pSock.socketKind === 'beam_end' &&
      tSock.socketKind === 'block_edge') ||
    (sourceType !== 'wood_beam' &&
      targetPiece.type === 'wood_beam' &&
      pSock.socketKind === 'block_edge' &&
      tSock.socketKind === 'beam_end')
  ) {
    if (isSourceOblique && hasSecondaryStructuralConnection) {
      return finalizeClassification('DIAGONAL_BRACE', 'DIAGONAL_BRACE');
    }
    return finalizeClassification(
      'TIMBER_FACE',
      isStoneMaterial(sourceType) || isStoneMaterial(targetPiece.type)
        ? 'FACE_BINDING'
        : 'TIMBER_FACE',
    );
  }

  // 3. Timber Beam endpoint to Timber Beam side socket
  if (
    sourceType === 'wood_beam' &&
    targetPiece.type === 'wood_beam' &&
    ((pSock.socketKind === 'beam_end' && tSock.socketKind === 'beam_side') ||
      (pSock.socketKind === 'beam_side' && tSock.socketKind === 'beam_end'))
  ) {
    const relSin = Math.abs(Math.sin(dragRot - targetPiece.rotation));
    if (isSourceOblique && (hasSecondaryStructuralConnection || isTargetVerticalPost)) {
      return finalizeClassification('DIAGONAL_BRACE', 'DIAGONAL_BRACE');
    }
    const lCornerCheck = isTimberLCornerSocketPair(pSock, tSock, dragRot, targetPiece.rotation);
    if (lCornerCheck.isLCorner) {
      return finalizeClassification('TIMBER_CORNER', 'TIMBER_CORNER');
    }
    if (relSin >= 0.9) {
      return finalizeClassification('TIMBER_T_JOINT', 'TIMBER_T_JOINT');
    }
    return finalizeClassification('TIMBER_FACE', 'TIMBER_FACE');
  }

  return finalizeClassification('TIMBER_SPLICE', 'TIMBER_SPLICE');
}

/**
 * Evaluates compatibility between a dragged piece's local socket and a target world socket.
 * Supports universal breakable construction bindings across all compatible features:
 * - Timber Beam endpoint-to-endpoint connections (horizontal, vertical, angled, L-corner, roof peak)
 * - T-shaped endpoint-to-side framing
 * - Block-Corner Rafter Seats across wood_block, stone_block, and bullseye_block (including prebuilt)
 * - Flush Timber Beam endpoint-to-Block face connections across wood_block, stone_block, and bullseye_block
 * - Block-to-Block face bindings (BLOCK_BINDING) and corner-to-corner bindings (CORNER_BINDING)
 */
export function evaluateSocketCompatibility(
  pSock: SnapSocket,
  tSock: SnapSocket,
  _sourceType: MaterialType = 'wood_beam',
  _targetType: MaterialType = 'wood_beam',
): {
  compatible: boolean;
  label: string;
  priority: number;
  normalDot: number;
  isTimberJointEligible: boolean;
  timberJointType: TimberJointType | null;
} {
  if (pSock.socketKind === 'center' || tSock.socketKind === 'center') {
    return {
      compatible: false,
      label: 'INCOMPATIBLE_CENTER',
      priority: 0,
      normalDot: 0,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  const normalDot = Vec2.dot(pSock.normal, tSock.normal);
  const pk = pSock.socketKind;
  const tk = tSock.socketKind;

  if (tk === 'anchor') {
    if (
      normalDot <= -0.2 &&
      pSock.normal.y > 0.35 &&
      (pk === 'beam_end' || pk === 'beam_side' || pk === 'block_edge')
    ) {
      return {
        compatible: true,
        label: pk === 'beam_end' ? 'BEAM_END_TO_ANCHOR' : 'SURFACE_TO_ANCHOR',
        priority: 14,
        normalDot,
        isTimberJointEligible: false,
        timberJointType: null,
      };
    }
    return {
      compatible: false,
      label: 'INCOMPATIBLE_ANCHOR_ORIENTATION',
      priority: 0,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // First-Class Block Corner Seat: Beam Endpoint approaching Block Corner (or Block Corner approaching Beam Endpoint)
  // Universal across wood_block, stone_block, and bullseye_block
  if ((pk === 'beam_end' && tk === 'block_corner') || (pk === 'block_corner' && tk === 'beam_end')) {
    const beamSock = pk === 'beam_end' ? pSock : tSock;
    const cornerSock = pk === 'block_corner' ? pSock : tSock;
    // The beam body extends along -beamSock.normal; it must point generally outward from the block corner
    const beamBodyDir = Vec2.scale(beamSock.normal, -1);
    if (Vec2.dot(beamBodyDir, cornerSock.normal) >= -0.15) {
      return {
        compatible: true,
        label: pk === 'beam_end' ? 'BEAM_END_TO_BLOCK_CORNER' : 'BLOCK_CORNER_TO_BEAM_END',
        priority: 18,
        normalDot,
        isTimberJointEligible: true,
        timberJointType: 'RAFTER_CORNER_SEAT',
      };
    }
    return {
      compatible: false,
      label: 'INCOMPATIBLE_CORNER_DIRECTION',
      priority: 0,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // Block Corner to Block Corner binding (opposing diagonal corners)
  if (pk === 'block_corner' && tk === 'block_corner') {
    if (normalDot <= -0.85) {
      return {
        compatible: true,
        label: 'BLOCK_CORNER_TO_BLOCK_CORNER',
        priority: 14,
        normalDot,
        isTimberJointEligible: true,
        timberJointType: 'CORNER_BINDING',
      };
    }
    return {
      compatible: false,
      label: 'INCOMPATIBLE_CORNER_DIRECTION',
      priority: 0,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // Timber Beam Endpoint-to-Endpoint connection:
  // Compatible across collinear (normalDot ~ -1), 90° L-corner (normalDot ~ 0),
  // angled roof peak (normalDot in [-0.8, +0.5]), etc.
  if (pk === 'beam_end' && tk === 'beam_end') {
    const isFolded = normalDot > TIMBER_JOINT_CONFIG.minFoldedBodyCosine;
    const isPeak = isRoofPeakSocketPair(pSock, tSock);
    const lCorner = isTimberLCornerSocketPair(pSock, tSock, pSock.angle, tSock.angle);
    return {
      compatible: true,
      label: isPeak
        ? 'ROOF_PEAK'
        : lCorner.isLCorner
          ? 'TIMBER_CORNER'
          : 'BEAM_END_TO_BEAM_END',
      priority: isFolded ? 4 : isPeak ? 20 : lCorner.isLCorner ? 18 : normalDot <= 0.05 ? 16 : 13,
      normalDot,
      isTimberJointEligible: true,
      timberJointType: isPeak
        ? 'ROOF_PEAK'
        : lCorner.isLCorner
          ? 'TIMBER_CORNER'
          : 'TIMBER_SPLICE',
    };
  }

  // Timber Beam Endpoint-to-Side T-joint / L-corner / angled face framing connection:
  if ((pk === 'beam_end' && tk === 'beam_side') || (pk === 'beam_side' && tk === 'beam_end')) {
    if (normalDot <= -0.15) {
      const lCorner = isTimberLCornerSocketPair(pSock, tSock, pSock.angle, tSock.angle);
      return {
        compatible: true,
        label: 'BEAM_END_TO_BEAM_SIDE',
        priority: lCorner.isLCorner ? 18 : 15,
        normalDot,
        isTimberJointEligible: true,
        timberJointType: lCorner.isLCorner ? 'TIMBER_CORNER' : 'TIMBER_T_JOINT',
      };
    }
    return {
      compatible: false,
      label: 'INCOMPATIBLE_NORMAL_DIRECTION',
      priority: 0,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // Beam Endpoint to Block Edge:
  // Universal across wood_block, stone_block, and bullseye_block when beam_end approaches from outside the face (normalDot <= -0.15)
  if ((pk === 'beam_end' && tk === 'block_edge') || (pk === 'block_edge' && tk === 'beam_end')) {
    if (normalDot <= -0.15) {
      return {
        compatible: true,
        label: pk === 'beam_end' ? 'BEAM_END_TO_BLOCK_EDGE' : 'BLOCK_EDGE_TO_BEAM_END',
        priority: 15,
        normalDot,
        isTimberJointEligible: true,
        timberJointType: 'TIMBER_FACE',
      };
    }
    return {
      compatible: false,
      label: 'INCOMPATIBLE_NORMAL_DIRECTION',
      priority: 0,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // Non-timber-joint contacts require opposing outward normals (normalDot <= -0.2)
  if (normalDot > -0.2) {
    return {
      compatible: false,
      label: 'INCOMPATIBLE_NORMAL_DIRECTION',
      priority: 0,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // Beam Side resting on Block Edge remains SUPPORTED_CONTACT (not an automatic endpoint/block binding)
  if ((pk === 'beam_side' && tk === 'block_edge') || (pk === 'block_edge' && tk === 'beam_side')) {
    return {
      compatible: true,
      label: 'BEAM_SIDE_TO_BLOCK_EDGE',
      priority: 11,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  // Block Edge to Block Edge face binding (wood_block, stone_block, bullseye_block)
  if (pk === 'block_edge' && tk === 'block_edge') {
    const isFlushFace = normalDot <= -0.85;
    return {
      compatible: true,
      label: 'BLOCK_EDGE_TO_BLOCK_EDGE',
      priority: isFlushFace ? 15 : 11,
      normalDot,
      isTimberJointEligible: isFlushFace,
      timberJointType: isFlushFace ? 'BLOCK_BINDING' : null,
    };
  }

  if (pk === 'beam_side' && tk === 'beam_side') {
    return {
      compatible: true,
      label: 'BEAM_SIDE_TO_BEAM_SIDE',
      priority: 10,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }
  if (pk === 'beam_corner' || tk === 'beam_corner') {
    return {
      compatible: true,
      label: 'BEAM_CORNER_ALIGNMENT',
      priority: 6,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }

  return {
    compatible: false,
    label: 'INCOMPATIBLE_SOCKET_PAIR',
    priority: 0,
    normalDot,
    isTimberJointEligible: false,
    timberJointType: null,
  };
}

export interface TimberJointClearanceResult {
  valid: boolean;
  adjustedPos: Vector2;
  clearanceShift: number;
  restSeparation: number;
  restAngle: number;
  worldSocketA: Vector2;
  worldSocketB: Vector2;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  overlapClassification:
    | 'SOCKET_CONTACT_CLEARED'
    | 'BODY_OVERLAP'
    | 'STEEP_ANGLE_CLEARANCE';
  rejectionReason: string | null;
  friendlyMessage: string | null;
}

/**
 * Resolves socket-specific contact clearance for a proposed Timber Joint between two wooden pieces
 * (wood_beam to wood_beam, or wood_beam to wood_block).
 * Ensures that collinear, perpendicular (90°), angled (e.g. 30°, 45°, 60°), peaked-roof, face, and T-joint
 * connections meet flush at their sockets/faces with zero interior OBB penetration (penetrationDepth === 0),
 * while rejecting true body overlaps or impossible acute angles.
 */
export function solveTimberJointClearance(
  dragRot: number,
  pSock: SnapSocket,
  targetPiece: PlacedPiece,
  tSock: SnapSocket,
  initialAlignedPos: Vector2,
  sourceType: MaterialType = 'wood_beam',
): TimberJointClearanceResult {
  const sourceCfg = MATERIAL_CONFIGS[sourceType];
  const targetCfg = MATERIAL_CONFIGS[targetPiece.type];
  const localAnchorA = pSock.localPos ?? { x: 0, y: 0 };
  const localAnchorB = tSock.localPos ?? { x: 0, y: 0 };
  const restAngle = shortestSignedAngleDelta(dragRot, targetPiece.rotation);

  // 1. Check for folded collinear body overlap (two beams extending into the same space from the shared endpoint)
  if (pSock.socketKind === 'beam_end' && tSock.socketKind === 'beam_end') {
    const inwardA = Vec2.scale(pSock.normal, -1);
    const inwardB = Vec2.scale(tSock.normal, -1);
    if (Vec2.dot(inwardA, inwardB) > TIMBER_JOINT_CONFIG.minFoldedBodyCosine) {
      return {
        valid: false,
        adjustedPos: initialAlignedPos,
        clearanceShift: 0,
        restSeparation: 0,
        restAngle,
        worldSocketA: tSock.worldPos,
        worldSocketB: tSock.worldPos,
        localAnchorA,
        localAnchorB,
        overlapClassification: 'BODY_OVERLAP',
        rejectionReason: 'BEAM_BODY_OVERLAP',
        friendlyMessage: 'Beam bodies overlap beyond the endpoint.',
      };
    }
  }

  // Also check if a beam endpoint approaching a block/beam face has its body extending into the target piece interior
  if (pSock.socketKind === 'beam_end' && (tSock.socketKind === 'block_edge' || tSock.socketKind === 'beam_side')) {
    const inwardA = Vec2.scale(pSock.normal, -1);
    if (Vec2.dot(inwardA, tSock.normal) < -0.15) {
      return {
        valid: false,
        adjustedPos: initialAlignedPos,
        clearanceShift: 0,
        restSeparation: 0,
        restAngle,
        worldSocketA: tSock.worldPos,
        worldSocketB: tSock.worldPos,
        localAnchorA,
        localAnchorB,
        overlapClassification: 'BODY_OVERLAP',
        rejectionReason: 'BEAM_BODY_OVERLAP',
        friendlyMessage: 'Beam body penetrates the target face.',
      };
    }
  }

  const targetOBB = createOBB(
    targetPiece.position,
    targetCfg.width,
    targetCfg.height,
    targetPiece.rotation,
  );
  const initialOBB = createOBB(initialAlignedPos, sourceCfg.width, sourceCfg.height, dragRot);
  const initialPen = getOBBPenetrationDepth(initialOBB, targetOBB, 0);

  if (initialPen <= 0.01) {
    const worldSocketA = Vec2.add(initialAlignedPos, Vec2.rotate(localAnchorA, dragRot));
    const worldSocketB = tSock.worldPos;
    const sharedSeam = Vec2.scale(Vec2.add(worldSocketA, worldSocketB), 0.5);
    const stressFreeLocalA = Vec2.rotate(Vec2.sub(sharedSeam, initialAlignedPos), -dragRot);
    const stressFreeLocalB = Vec2.rotate(
      Vec2.sub(sharedSeam, targetPiece.position),
      -targetPiece.rotation,
    );
    return {
      valid: true,
      adjustedPos: initialAlignedPos,
      clearanceShift: 0,
      restSeparation: Number(Vec2.distance(worldSocketA, worldSocketB).toFixed(2)),
      restAngle,
      worldSocketA,
      worldSocketB,
      localAnchorA: stressFreeLocalA,
      localAnchorB: stressFreeLocalB,
      overlapClassification: 'SOCKET_CONTACT_CLEARED',
      rejectionReason: null,
      friendlyMessage: 'Timber endpoints can connect here.',
    };
  }

  // 2. Search outward socket-clearance directions for minimal shift that yields 0 OBB penetration
  const centerDelta = Vec2.sub(initialAlignedPos, targetPiece.position);
  const candidateDirs: Vector2[] = [
    tSock.normal,
    Vec2.scale(pSock.normal, -1),
    Vec2.normalize(Vec2.sub(tSock.normal, pSock.normal)),
    Vec2.normalize(centerDelta),
  ];

  for (const axis of [...targetOBB.axes, ...initialOBB.axes]) {
    const sign = Vec2.dot(centerDelta, axis) >= 0 ? 1 : -1;
    candidateDirs.push(Vec2.scale(axis, sign));
  }

  let bestShift = Infinity;
  let bestDir = tSock.normal;

  for (const rawDir of candidateDirs) {
    const d = Vec2.normalize(rawDir);
    if (Vec2.length(d) < 0.5) continue;

    let lo = 0;
    let hi = 24;
    let found = 24;
    for (let iter = 0; iter < 14; iter++) {
      const mid = (lo + hi) / 2;
      const testPos = Vec2.add(initialAlignedPos, Vec2.scale(d, mid));
      const testOBB = createOBB(testPos, sourceCfg.width, sourceCfg.height, dragRot);
      const pen = getOBBPenetrationDepth(testOBB, targetOBB, 0);
      if (pen <= 0) {
        found = mid;
        hi = mid;
      } else {
        lo = mid;
      }
    }

    if (found < bestShift) {
      bestShift = found;
      bestDir = d;
    }
  }

  if (bestShift <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance) {
    const appliedShift = bestShift > 0 ? bestShift + 0.15 : 0;
    const adjustedPos = Vec2.add(initialAlignedPos, Vec2.scale(bestDir, appliedShift));
    const worldSocketA = Vec2.add(adjustedPos, Vec2.rotate(localAnchorA, dragRot));
    const worldSocketB = tSock.worldPos;
    const restSeparation = Number(Vec2.distance(worldSocketA, worldSocketB).toFixed(2));
    const sharedSeam = Vec2.scale(Vec2.add(worldSocketA, worldSocketB), 0.5);
    const stressFreeLocalA = Vec2.rotate(Vec2.sub(sharedSeam, adjustedPos), -dragRot);
    const stressFreeLocalB = Vec2.rotate(
      Vec2.sub(sharedSeam, targetPiece.position),
      -targetPiece.rotation,
    );

    if (restSeparation <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 1.5) {
      return {
        valid: true,
        adjustedPos,
        clearanceShift: Number(appliedShift.toFixed(2)),
        restSeparation,
        restAngle,
        worldSocketA,
        worldSocketB,
        localAnchorA: stressFreeLocalA,
        localAnchorB: stressFreeLocalB,
        overlapClassification: 'SOCKET_CONTACT_CLEARED',
        rejectionReason: null,
        friendlyMessage: 'Timber endpoints can connect here.',
      };
    }
  }

  const isParallelBodyOverlap =
    sourceType === 'wood_beam' &&
    targetPiece.type === 'wood_beam' &&
    Math.abs(Math.sin(dragRot - targetPiece.rotation)) < 0.32;

  return {
    valid: false,
    adjustedPos: initialAlignedPos,
    clearanceShift: Number(bestShift.toFixed(2)),
    restSeparation: Number(bestShift.toFixed(2)),
    restAngle,
    worldSocketA: tSock.worldPos,
    worldSocketB: tSock.worldPos,
    localAnchorA,
    localAnchorB,
    overlapClassification: isParallelBodyOverlap ? 'BODY_OVERLAP' : 'STEEP_ANGLE_CLEARANCE',
    rejectionReason: isParallelBodyOverlap
      ? 'BEAM_BODY_OVERLAP'
      : 'INSUFFICIENT_ANGLE_CLEARANCE',
    friendlyMessage: isParallelBodyOverlap
      ? 'Beam bodies overlap beyond the endpoint.'
      : 'Not enough clearance for this angle.',
  };
}

/**
 * Solves magnetic snapping and validates collision bounds for a dragged or placed piece.
 * Positional snapping and rotational snapping are strictly separated so manual player
 * rotation is preserved by default near snap sockets.
 */
export function solveSnapAndValidation(
  type: MaterialType,
  rawPos: Vector2,
  rawRot: number,
  placedPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  snappingEnabled = true,
  excludedPieceId?: string,
  options?: SnapSolveOptions,
): SnapResult {
  const config = MATERIAL_CONFIGS[type];
  const halfH = config.height / 2;

  const preferredRot =
    options?.preferredRotation !== undefined
      ? options.preferredRotation
      : options?.rotationSource === 'USER'
        ? rawRot
        : snappingEnabled
          ? snapAngle45(rawRot)
          : rawRot;

  // If pointer is still inside the UI inventory tray, suppress world snapping & ground clamping
  if (options?.inInventoryTray) {
    const reason = options.hasEnteredWorld ? 'RETURNED_TO_INVENTORY' : 'IN_INVENTORY_TRAY';
    return {
      position: { ...rawPos },
      rotation: preferredRot,
      snapped: false,
      isValid: false,
      proposedRotation: preferredRot,
      requiresRotationChange: false,
      isAnchorRequired: false,
      snapPositionAccepted: false,
      snapRotationAccepted: false,
      lastSnapRejectionReason: reason,
      playerFriendlyRejectionMessage: options.hasEnteredWorld
        ? 'Release to return item to inventory'
        : 'Drag upward into the sanctuary to place',
      activePieceSocketId: null,
      activeTargetSocketId: null,
      socketCompatibility: null,
      candidateWorldDistance: null,
      candidateDistance: null,
      candidateLockActive: false,
      candidateLockReleaseRadius: CANDIDATE_LOCK_RELEASE_RADIUS,
      positionCorrectionVector: { x: 0, y: 0 },
      explicitJointProposed: false,
      proposedTimberJoint: null,
      connectionCategory: 'NONE',
      overlapClassification: 'NONE',
      supportedContactPredicted: false,
      placementRejectionReason: reason,
      overlapColliderId: null,
      penetrationDepth: 0,
      candidateCycleIndex: 0,
      candidateCycleCount: 0,
      availableCandidateLabels: [],
      currentCandidateLabel: null,
      balancedAdjustmentActive: false,
      partnerPieceAdjustment: null,
      roofSupportSummary: null,
      peakSymmetryDiagnostics: null,
      sourceFeatureType: null,
      sourceFeatureId: null,
      targetFeatureType: null,
      targetFeatureId: null,
      seamSeparation: null,
      candidateRankingBreakdown: null,
    };
  }

  let bestPos = { ...rawPos };
  let bestRot = preferredRot;
  let proposedRotation = preferredRot;
  let requiresRotationChange = false;
  let isAnchorRequired = false;
  let bestSocket: SnapSocket | undefined;
  let bestPieceSocket: SnapSocket | undefined;
  let attachedAnchorId: string | undefined;
  let proposedTimberJoint: ProposedTimberJoint | null = null;
  let overlapClassification: SnapResult['overlapClassification'] = 'NONE';
  let snapped = false;
  let lastSnapRejectionReason: string | null = null;
  let playerFriendlyRejectionMessage: string | null = null;
  let socketCompatibility: string | null = null;
  let candidateWorldDistance: number | null = null;
  let candidateLockActive = false;

  let candidateCycleIndex = 0;
  let candidateCycleCount = 0;
  let availableCandidateLabels: string[] = [];
  let currentCandidateLabel: string | null = null;
  let balancedAdjustmentActive = false;
  let partnerPieceAdjustment: PartnerPieceAdjustment | null = null;
  let roofSupportSummary: RoofSupportDiagnosticSummary | null = null;
  let peakSymmetryDiagnostics: PeakSymmetryDiagnostics | null = null;
  let sourceFeatureType: 'socket' | 'face' | 'corner' | 'apex' | null = null;
  let sourceFeatureId: string | null = null;
  let targetFeatureType: 'socket' | 'face' | 'corner' | 'apex' | null = null;
  let targetFeatureId: string | null = null;
  let seamSeparation: number | null = null;
  let candidateRankingBreakdown: CandidateRankingBreakdown | null = null;
  let isCornerSupportedContact = false;

  const validPieces = placedPieces.filter(
    (p) => p.id !== excludedPieceId && p.condition !== 'LOST',
  );
  const effectiveWisps = options?.wisps ?? [];
  const existingJoints = (options?.existingJoints ?? []).filter(
    (j) =>
      j.state !== 'BROKEN' &&
      excludedPieceId &&
      (j.pieceAId === excludedPieceId || j.pieceBId === excludedPieceId),
  );

  let bestRejectedTimberClearance: {
    clearance: TimberJointClearanceResult;
    rawDist: number;
    targetPieceId: string;
    pSock: SnapSocket;
    tSock: SnapSocket;
  } | null = null;

  if (snappingEnabled) {
    // 1. Check Environmental Anchors first (Priority 1 when near an anchor base)
    const anchorSockets = getAnchorSnapSockets(anchors);
    let minAnchorDist = WORLD_CONFIG.anchorSnapDistance;
    const isUpright90 = Math.abs(Math.sin(preferredRot)) > 0.92;
    const anchorVerticalOffset = isUpright90 ? config.width / 2 : halfH;

    for (const aSocket of anchorSockets) {
      const targetPos = {
        x: aSocket.worldPos.x,
        y: aSocket.worldPos.y - anchorVerticalOffset,
      };
      const d = Vec2.distance(rawPos, targetPos);
      if (d < minAnchorDist) {
        const anchorCandOBB = createOBB(targetPos, config.width, config.height, preferredRot);
        if (checkPieceOverlapsWisps(anchorCandOBB, effectiveWisps).overlaps) {
          continue; // Do not offer anchor snap candidate that intersects a wisp volume
        }

        minAnchorDist = d;
        bestSocket = aSocket;
        snapped = true;
        bestPos = targetPos;
        candidateWorldDistance = d;
        socketCompatibility = isUpright90 ? 'BEAM_END_TO_ANCHOR' : 'SURFACE_TO_ANCHOR';

        const candidateSockets = getPieceSnapSocketsForTransform(
          type,
          bestPos,
          preferredRot,
          'ghost',
        );
        bestPieceSocket =
          candidateSockets.find(
            (s) =>
              s.normal.y > 0.5 &&
              (s.socketKind === 'beam_end' ||
                s.socketKind === 'beam_side' ||
                s.socketKind === 'block_edge'),
          ) || candidateSockets[0];

        proposedRotation = isUpright90 ? preferredRot : 0;
        const normPref = normalizeAngle(preferredRot);
        const isVerticalAligned =
          normPref < 0.05 ||
          Math.abs(normPref - Math.PI * 2) < 0.05 ||
          (type === 'wood_beam' && Math.abs(normPref - Math.PI) < 0.05) ||
          isUpright90;

        if (isVerticalAligned) {
          bestRot = isUpright90 ? preferredRot : 0;
          requiresRotationChange = false;
          isAnchorRequired = false;
          attachedAnchorId = aSocket.anchorId;
        } else {
          requiresRotationChange = true;
          isAnchorRequired = true;
          if (options?.acceptSnapRotation) {
            bestRot = 0;
            attachedAnchorId = aSocket.anchorId;
          } else {
            bestRot = preferredRot;
            attachedAnchorId = undefined;
          }
        }
      }
    }

    // 2. Evaluate Socket-to-Socket Piece Candidates
    const anchorOccupied =
      snapped &&
      bestSocket &&
      validPieces.some((p) => {
        const pConfig = MATERIAL_CONFIGS[p.type];
        const pOBB = createOBB(p.position, pConfig.width, pConfig.height, p.rotation);
        const cOBB = createOBB(bestPos, config.width, config.height, bestRot);
        return checkOBBOverlap(cOBB, pOBB, 2.5);
      });

    if (!snapped || anchorOccupied) {
      const candidatePieceSockets = getPieceSnapSocketsForTransform(
        type,
        rawPos,
        preferredRot,
        'ghost',
      );
      const isObliqueAngle = Math.abs(Math.sin(preferredRot * 2)) > 0.25;

      interface EvaluatedCandidate {
        pSock: SnapSocket;
        tSock: SnapSocket;
        targetPiece: PlacedPiece;
        alignedPos: Vector2;
        rawDist: number;
        effectiveScore: number;
        compatLabel: string;
        humanLabel: string;
        normalDot: number;
        isLocked: boolean;
        isOverlapFree: boolean;
        conflictingThirdPieceId: string | null;
        timberJointProposal: ProposedTimberJoint | null;
        clearanceClassification: SnapResult['overlapClassification'];
        partnerAdjustment: PartnerPieceAdjustment | null;
        balancedActive: boolean;
        peakDiagnostics: PeakSymmetryDiagnostics | null;
        srcFeatureType: 'socket' | 'face' | 'corner' | 'apex';
        srcFeatureId: string;
        tgtFeatureType: 'socket' | 'face' | 'corner' | 'apex';
        tgtFeatureId: string;
        seamSep: number;
        cornerSupportedContact: boolean;
        rankingBreakdown: CandidateRankingBreakdown;
      }

      const candidates: EvaluatedCandidate[] = [];

      for (const piece of validPieces) {
        if (piece.condition === 'BROKEN') continue;
        const targetSockets = getPieceSnapSockets(piece);

        // Continuous beam-endpoint seating: preserve the chosen position along a finite block face.
        const endpointFaceSol = solveContinuousEndpointFaceSeat(
          type, rawPos, preferredRot, piece, excludedPieceId || 'ghost',
        );
        let endpointFaceHandledOnPiece = false;
        if (endpointFaceSol?.valid && endpointFaceSol.normalCorrectionPx <= WORLD_CONFIG.snapDistance) {
          const alignedPos = endpointFaceSol.alignedPos;
          const candOBB = createOBB(alignedPos, config.width, config.height, preferredRot);
          let isOverlapFree = true;
          let conflictingThirdPieceId: string | null = null;
          for (const other of validPieces) {
            const otherCfg = MATERIAL_CONFIGS[other.type];
            const otherOBB = createOBB(other.position, otherCfg.width, otherCfg.height, other.rotation);
            if (checkOBBOverlap(candOBB, otherOBB, other.id === piece.id ? 0.05 : 2.5)) {
              isOverlapFree = false;
              if (other.id !== piece.id) conflictingThirdPieceId = other.id;
              break;
            }
          }
          if (!checkPieceOverlapsWisps(candOBB, effectiveWisps).overlaps) {
            endpointFaceHandledOnPiece = true;
            const closure = classifyArchitecturalClosure({
              positionMismatchPx: endpointFaceSol.normalCorrectionPx,
              seamGapPx: endpointFaceSol.seamSeparation,
              hasColliderPenetration: !isOverlapFree,
            });
            const canon = buildCanonicalRelationship({
              pieceAId: excludedPieceId || 'ghost', pieceAType: type,
              pieceAPos: alignedPos, pieceARot: preferredRot,
              featureAId: endpointFaceSol.sourceFaceId,
              pieceBId: piece.id, pieceBType: piece.type,
              pieceBPos: piece.position, pieceBRot: piece.rotation,
              featureBId: endpointFaceSol.targetFaceId,
              connectionTaxonomy: endpointFaceSol.taxonomy,
              jointProfileId: endpointFaceSol.strengthProfile,
            });
            const proposal: ProposedTimberJoint = {
              targetPieceId: piece.id,
              sourceSocketId: endpointFaceSol.sourceSocketId,
              targetSocketId: endpointFaceSol.targetSocketId,
              sourceSocketName: endpointFaceSol.sourceSocketName,
              targetSocketName: endpointFaceSol.targetSocketName,
              localAnchorA: endpointFaceSol.localAnchorA,
              localAnchorB: endpointFaceSol.localAnchorB,
              worldPosition: endpointFaceSol.worldContactPoint,
              jointType: 'TIMBER_FACE',
              restAngle: endpointFaceSol.restAngle,
              restSeparation: 0,
              seamSeparation: endpointFaceSol.seamSeparation,
              strengthProfile: endpointFaceSol.strengthProfile,
              connectionTaxonomy: endpointFaceSol.taxonomy,
              connectionSubtype: endpointFaceSol.connectionSubtype,
              materialA: type,
              materialB: piece.type,
              materialPairKey: endpointFaceSol.materialPairKey,
              complianceProfile: endpointFaceSol.strengthProfile,
              isPrebuiltBinding: Boolean(piece.isPrebuilt),
              creationReason: 'SNAP_COMMIT',
              sourceFaceId: endpointFaceSol.sourceFaceId,
              targetFaceId: endpointFaceSol.targetFaceId,
              sourceCornerId: null,
              targetCornerId: null,
              sourceFeatureType: type === 'wood_beam' ? 'socket' : 'face',
              targetFeatureType: piece.type === 'wood_beam' ? 'socket' : 'face',
              sourceFaceNormal: endpointFaceSol.sourceFaceNormal,
              targetFaceNormal: endpointFaceSol.targetFaceNormal,
              closureClassification: closure,
              canonicalRelationship: canon,
              visualConnectionState: 'CANDIDATE_PREVIEW',
              visualJointCapType: getVisualJointCapType('TIMBER_FACE', endpointFaceSol.taxonomy, endpointFaceSol.materialPairKey),
              playerFacingConnectionLabel: 'Endpoint Face Joint available',
            };
            const pSock: SnapSocket = {
              id: endpointFaceSol.sourceSocketId, pieceId: excludedPieceId || 'ghost',
              localName: endpointFaceSol.sourceSocketName, localPos: endpointFaceSol.localAnchorA,
              localNormal: Vec2.rotate(endpointFaceSol.sourceFaceNormal, -preferredRot),
              worldPos: endpointFaceSol.worldContactPoint, normal: endpointFaceSol.sourceFaceNormal,
              type: 'edge', socketKind: type === 'wood_beam' ? 'beam_end' : 'block_edge', angle: preferredRot,
            };
            const tSock: SnapSocket = {
              id: endpointFaceSol.targetSocketId, pieceId: piece.id,
              localName: endpointFaceSol.targetSocketName, localPos: endpointFaceSol.localAnchorB,
              localNormal: Vec2.rotate(endpointFaceSol.targetFaceNormal, -piece.rotation),
              worldPos: endpointFaceSol.worldContactPoint, normal: endpointFaceSol.targetFaceNormal,
              type: 'edge', socketKind: piece.type === 'wood_beam' ? 'beam_end' : 'block_edge', angle: piece.rotation,
            };
            const isLocked = Boolean(
              options?.lockedCandidate &&
                options.lockedCandidate.pieceSocketId === endpointFaceSol.sourceSocketId &&
                options.lockedCandidate.targetSocketId === endpointFaceSol.targetSocketId,
            );
            const hysteresisBonus = isLocked ? 14 : 0;
            const effectiveScore =
              endpointFaceSol.normalCorrectionPx -
              16 -
              hysteresisBonus +
              (isOverlapFree ? 0 : 100);
            candidates.push({
              pSock, tSock, targetPiece: piece, alignedPos,
              rawDist: endpointFaceSol.normalCorrectionPx, effectiveScore,
              compatLabel: type === 'wood_beam' ? 'BEAM_END_TO_BLOCK_FACE' : 'BLOCK_FACE_TO_BEAM_END',
              humanLabel: 'Endpoint Face Joint', normalDot: -1,
              isLocked, isOverlapFree, conflictingThirdPieceId,
              timberJointProposal: proposal,
              clearanceClassification: isOverlapFree ? 'SOCKET_CONTACT_CLEARED' : 'THIRD_PIECE_CONFLICT',
              partnerAdjustment: null, balancedActive: false, peakDiagnostics: null,
              srcFeatureType: type === 'wood_beam' ? 'socket' : 'face', srcFeatureId: endpointFaceSol.sourceFaceId,
              tgtFeatureType: piece.type === 'wood_beam' ? 'socket' : 'face', tgtFeatureId: endpointFaceSol.targetFaceId,
              seamSep: 0, cornerSupportedContact: false,
              rankingBreakdown: {
                candidateLabel: 'Endpoint Face Joint', targetPieceId: piece.id,
                sourceFeatureId: endpointFaceSol.sourceFaceId, targetFeatureId: endpointFaceSol.targetFaceId,
                validGeometry: true, noColliderPenetration: isOverlapFree, rotationPreserved: true,
                pointerProximityPx: endpointFaceSol.normalCorrectionPx,
                totalPositionalCorrectionPx: endpointFaceSol.normalCorrectionPx,
                partnerMovementPx: 0, pointerDistanceScore: endpointFaceSol.normalCorrectionPx,
                angleCompatibilityScore: 4, specificityScore: 12,
                hysteresisBonus, supportCompletenessBonus: 0,
                totalScore: effectiveScore, closureClassification: closure,
                canonicalKey: canon.canonicalKey, mirroredEquivalentKey: canon.mirroredEquivalentKey,
              },
            });
          }
        }

        // Protect genuine oblique endpoint/corner intent from broad-face ownership.
        const endpointCornerIntent =
          Math.abs(Math.sin(preferredRot * 2)) > 0.25 &&
          candidatePieceSockets.some((socket) =>
            socket.socketKind === 'beam_end' &&
            targetSockets.some((target) =>
              target.socketKind === 'block_corner' &&
              Vec2.distance(socket.worldPos, target.worldPos) <= ENDPOINT_SNAP_RADIUS,
            ),
          );

        // Continuous architectural face placement: normal-only correction and overlap-centered anchor.
        const broadFaceSol = endpointCornerIntent ? null : solveBroadFaceOverlap(
          type, rawPos, preferredRot, piece, excludedPieceId || 'ghost',
        );
        let broadFaceHandledOnPiece = false;
        if (broadFaceSol?.valid && broadFaceSol.normalCorrectionPx <= WORLD_CONFIG.snapDistance) {
          const alignedPos = broadFaceSol.alignedPos;
          const candOBB = createOBB(alignedPos, config.width, config.height, preferredRot);
          let isOverlapFree = true;
          let conflictingThirdPieceId: string | null = null;
          for (const other of validPieces) {
            const otherCfg = MATERIAL_CONFIGS[other.type];
            const otherOBB = createOBB(other.position, otherCfg.width, otherCfg.height, other.rotation);
            if (checkOBBOverlap(candOBB, otherOBB, other.id === piece.id ? 0.05 : 2.5)) {
              isOverlapFree = false;
              if (other.id !== piece.id) conflictingThirdPieceId = other.id;
              break;
            }
          }
          if (!checkPieceOverlapsWisps(candOBB, effectiveWisps).overlaps) {
            broadFaceHandledOnPiece = true;
            const closure = classifyArchitecturalClosure({
              positionMismatchPx: broadFaceSol.normalCorrectionPx,
              seamGapPx: broadFaceSol.seamSeparation,
              hasColliderPenetration: !isOverlapFree,
            });
            const canon = buildCanonicalRelationship({
              pieceAId: excludedPieceId || 'ghost', pieceAType: type,
              pieceAPos: alignedPos, pieceARot: preferredRot,
              featureAId: broadFaceSol.sourceFaceId,
              pieceBId: piece.id, pieceBType: piece.type,
              pieceBPos: piece.position, pieceBRot: piece.rotation,
              featureBId: broadFaceSol.targetFaceId,
              connectionTaxonomy: broadFaceSol.taxonomy,
              jointProfileId: broadFaceSol.strengthProfile,
            });
            const proposal: ProposedTimberJoint = {
              targetPieceId: piece.id,
              sourceSocketId: broadFaceSol.sourceSocketId,
              targetSocketId: broadFaceSol.targetSocketId,
              sourceSocketName: broadFaceSol.sourceSocketName,
              targetSocketName: broadFaceSol.targetSocketName,
              localAnchorA: broadFaceSol.localAnchorA,
              localAnchorB: broadFaceSol.localAnchorB,
              worldPosition: broadFaceSol.worldContactPoint,
              jointType: 'TIMBER_FACE',
              restAngle: broadFaceSol.restAngle,
              restSeparation: 0,
              seamSeparation: broadFaceSol.seamSeparation,
              strengthProfile: broadFaceSol.strengthProfile,
              connectionTaxonomy: broadFaceSol.taxonomy,
              connectionSubtype: broadFaceSol.connectionSubtype,
              materialA: type,
              materialB: piece.type,
              materialPairKey: broadFaceSol.materialPairKey,
              complianceProfile: broadFaceSol.strengthProfile,
              isPrebuiltBinding: Boolean(piece.isPrebuilt),
              creationReason: 'SNAP_COMMIT',
              sourceFaceId: broadFaceSol.sourceFaceId,
              targetFaceId: broadFaceSol.targetFaceId,
              sourceCornerId: null,
              targetCornerId: null,
              sourceFeatureType: 'face',
              targetFeatureType: 'face',
              sourceFaceNormal: broadFaceSol.sourceFaceNormal,
              targetFaceNormal: broadFaceSol.targetFaceNormal,
              closureClassification: closure,
              canonicalRelationship: canon,
              visualConnectionState: 'CANDIDATE_PREVIEW',
              visualJointCapType: getVisualJointCapType('TIMBER_FACE', broadFaceSol.taxonomy, broadFaceSol.materialPairKey),
              playerFacingConnectionLabel: 'Timber Face Joint available',
            };
            const pSock: SnapSocket = {
              id: broadFaceSol.sourceSocketId, pieceId: excludedPieceId || 'ghost',
              localName: broadFaceSol.sourceSocketName, localPos: broadFaceSol.localAnchorA,
              localNormal: Vec2.rotate(broadFaceSol.sourceFaceNormal, -preferredRot),
              worldPos: broadFaceSol.worldContactPoint, normal: broadFaceSol.sourceFaceNormal,
              type: 'edge', socketKind: type === 'wood_beam' ? 'beam_side' : 'block_edge', angle: preferredRot,
            };
            const tSock: SnapSocket = {
              id: broadFaceSol.targetSocketId, pieceId: piece.id,
              localName: broadFaceSol.targetSocketName, localPos: broadFaceSol.localAnchorB,
              localNormal: Vec2.rotate(broadFaceSol.targetFaceNormal, -piece.rotation),
              worldPos: broadFaceSol.worldContactPoint, normal: broadFaceSol.targetFaceNormal,
              type: 'edge', socketKind: piece.type === 'wood_beam' ? 'beam_side' : 'block_edge', angle: piece.rotation,
            };
            const isLocked = Boolean(
              options?.lockedCandidate &&
                options.lockedCandidate.pieceSocketId === broadFaceSol.sourceSocketId &&
                options.lockedCandidate.targetSocketId === broadFaceSol.targetSocketId,
            );
            const hysteresisBonus = isLocked ? 14 : 0;
            const overlapBonus = Math.min(8, broadFaceSol.overlapLength / 8);
            const effectiveScore =
              broadFaceSol.normalCorrectionPx -
              6.75 -
              overlapBonus -
              hysteresisBonus +
              (isOverlapFree ? 0 : 100);
            candidates.push({
              pSock, tSock, targetPiece: piece, alignedPos,
              rawDist: broadFaceSol.normalCorrectionPx, effectiveScore,
              compatLabel: type === 'wood_beam' ? 'BEAM_SIDE_TO_BLOCK_EDGE' : 'BLOCK_EDGE_TO_BEAM_SIDE',
              humanLabel: 'Timber Face Joint', normalDot: -1,
              isLocked, isOverlapFree, conflictingThirdPieceId,
              timberJointProposal: proposal, clearanceClassification: isOverlapFree ? 'SOCKET_CONTACT_CLEARED' : 'THIRD_PIECE_CONFLICT',
              partnerAdjustment: null, balancedActive: false, peakDiagnostics: null,
              srcFeatureType: 'face', srcFeatureId: broadFaceSol.sourceFaceId,
              tgtFeatureType: 'face', tgtFeatureId: broadFaceSol.targetFaceId,
              seamSep: broadFaceSol.seamSeparation, cornerSupportedContact: false,
              rankingBreakdown: {
                candidateLabel: 'Timber Face Joint', targetPieceId: piece.id,
                sourceFeatureId: broadFaceSol.sourceFaceId, targetFeatureId: broadFaceSol.targetFaceId,
                validGeometry: true, noColliderPenetration: isOverlapFree, rotationPreserved: true,
                pointerProximityPx: broadFaceSol.normalCorrectionPx,
                totalPositionalCorrectionPx: broadFaceSol.normalCorrectionPx,
                partnerMovementPx: 0, pointerDistanceScore: broadFaceSol.normalCorrectionPx,
                angleCompatibilityScore: 2.5, specificityScore: 6.75,
                hysteresisBonus, supportCompletenessBonus: overlapBonus,
                totalScore: effectiveScore, closureClassification: closure,
                canonicalKey: canon.canonicalKey, mirroredEquivalentKey: canon.mirroredEquivalentKey,
              },
            });
          }
        }

        for (const tSock of targetSockets) {
          if (tSock.socketKind === 'center') continue;

          for (const pSock of candidatePieceSockets) {
            if (pSock.socketKind === 'center') continue;

            if (
              endpointFaceHandledOnPiece &&
              ((pSock.socketKind === 'beam_end' && tSock.socketKind === 'block_edge') ||
                (pSock.socketKind === 'block_edge' && tSock.socketKind === 'beam_end'))
            ) continue;
            if (
              broadFaceHandledOnPiece &&
              ((pSock.socketKind === 'beam_side' && tSock.socketKind === 'block_edge') ||
                (pSock.socketKind === 'block_edge' && tSock.socketKind === 'beam_side'))
            ) continue;
            const isTargetOblique = Math.abs(Math.sin(piece.rotation * 2)) > 0.25;
            const isBlockCornerToBlockCorner =
              pSock.socketKind === 'block_corner' && tSock.socketKind === 'block_corner';
            // Only use beam_corner or beam-to-block_corner sockets when at an oblique angle (for angled rafters/braces),
            // except allow block_corner <-> block_corner between two blocks at any angle.
            if (
              !isBlockCornerToBlockCorner &&
              (pSock.socketKind === 'beam_corner' ||
                tSock.socketKind === 'beam_corner' ||
                pSock.socketKind === 'block_corner' ||
                tSock.socketKind === 'block_corner') &&
              !isObliqueAngle &&
              !isTargetOblique
            ) {
              continue;
            }

            const compat = evaluateSocketCompatibility(pSock, tSock, type, piece.type);
            if (!compat.compatible) continue;

            // Phase C owns horizontal beam-end placement along a block's vertical
            // face continuously. The legacy endpoint <-> block-edge midpoint socket
            // otherwise acquires from the endpoint outer ring (up to ~48 px during
            // candidate evaluation), pulls the piece to face center, and can recapture
            // after continuous seating. Keep legacy discrete support behavior for
            // upright posts on horizontal block faces and for all corner candidates.
            const isBeamEndBlockEdgePair =
              (pSock.socketKind === 'beam_end' && tSock.socketKind === 'block_edge') ||
              (pSock.socketKind === 'block_edge' && tSock.socketKind === 'beam_end');
            const beamEndSocket = pSock.socketKind === 'beam_end' ? pSock : tSock;
            const blockEdgeSocket = pSock.socketKind === 'block_edge' ? pSock : tSock;
            const isHorizontalEndpointIntoVerticalFace =
              isBeamEndBlockEdgePair &&
              Math.abs(beamEndSocket.normal.x) >= 0.85 &&
              Math.abs(blockEdgeSocket.normal.x) >= 0.85;
            if (isHorizontalEndpointIntoVerticalFace) continue;

            const pOffset = Vec2.sub(pSock.worldPos, rawPos);
            let alignedPos = Vec2.sub(tSock.worldPos, pOffset);
            const rawInitialDist = Vec2.distance(rawPos, alignedPos);

            const isLocked = Boolean(
              options?.lockedCandidate &&
                options.lockedCandidate.pieceSocketId === pSock.id &&
                options.lockedCandidate.targetSocketId === tSock.id,
            );

            const maxAllowedRadius = isLocked
              ? CANDIDATE_LOCK_RELEASE_RADIUS
              : pSock.socketKind === 'beam_end' ||
                  tSock.socketKind === 'beam_end' ||
                  pSock.socketKind === 'block_corner' ||
                  tSock.socketKind === 'block_corner'
                ? ENDPOINT_SNAP_RADIUS
                : WORLD_CONFIG.snapDistance;

            if (rawInitialDist > maxAllowedRadius + 18) continue;

            let effectivePSock = pSock;
            let effectiveTSock = tSock;
            let timberJointProposal: ProposedTimberJoint | null = null;
            let clearanceClassification: SnapResult['overlapClassification'] = 'NONE';
            let candPartnerAdjustment: PartnerPieceAdjustment | null = null;
            let candBalancedActive = false;
            let candPeakDiagnostics: PeakSymmetryDiagnostics | null = null;
            let candSrcFeatureType: 'socket' | 'face' | 'corner' | 'apex' =
              pSock.socketKind === 'block_corner' || pSock.socketKind === 'beam_corner'
                ? 'corner'
                : 'socket';
            let candSrcFeatureId = pSock.localName || pSock.id;
            let candTgtFeatureType: 'socket' | 'face' | 'corner' | 'apex' =
              tSock.socketKind === 'block_corner' || tSock.socketKind === 'beam_corner'
                ? 'corner'
                : 'socket';
            let candTgtFeatureId = tSock.localName || tSock.id;
            let candSeamSep = 0;
            let candCornerSupported = false;

            const isCornerSeatPair =
              compat.label === 'BEAM_END_TO_BLOCK_CORNER' ||
              compat.label === 'BLOCK_CORNER_TO_BEAM_END' ||
              compat.label === 'RAFTER_CORNER_SEAT' ||
              compat.label === 'CORNER_SUPPORTED';
            const isTimberJointEligiblePair =
              compat.isTimberJointEligible && compat.timberJointType !== null;

            if (
              compat.timberJointType === 'ROOF_PEAK' &&
              type === 'wood_beam' &&
              piece.type === 'wood_beam'
            ) {
              const peakSolve = solveSharedApexRoofPeak(
                rawPos,
                preferredRot,
                pSock,
                piece,
                tSock,
                validPieces,
                anchors,
                options?.existingJoints ?? [],
                excludedPieceId || 'ghost',
                options?.enableBalancedPeakAdjustment ?? true,
              );
              if (!peakSolve || !peakSolve.valid) {
                continue;
              }

              alignedPos = peakSolve.alignedPos;
              clearanceClassification = 'SOCKET_CONTACT_CLEARED';
              candPartnerAdjustment = peakSolve.partnerPieceAdjustment;
              candBalancedActive = peakSolve.balancedAdjustmentActive;
              candPeakDiagnostics = peakSolve.peakSymmetryDiagnostics;
              candSrcFeatureType = 'apex';
              candSrcFeatureId = peakSolve.sourceCornerId;
              candTgtFeatureType = 'apex';
              candTgtFeatureId = peakSolve.targetCornerId;
              candSeamSep = peakSolve.seamSeparation;

              const lowerSupported =
                peakSolve.roofSupportSummary.leftLowerRafterSupported &&
                peakSolve.roofSupportSummary.rightLowerRafterSupported;

              timberJointProposal = {
                targetPieceId: piece.id,
                sourceSocketId: peakSolve.sourceSocketId,
                targetSocketId: peakSolve.targetSocketId,
                sourceSocketName: peakSolve.sourceSocketName,
                targetSocketName: peakSolve.targetSocketName,
                localAnchorA: peakSolve.localAnchorA,
                localAnchorB: peakSolve.localAnchorB,
                worldPosition: peakSolve.worldApexPoint,
                jointType: 'ROOF_PEAK',
                restAngle: peakSolve.restAngle,
                restSeparation: peakSolve.seamSeparation,
                seamSeparation: peakSolve.seamSeparation,
                strengthProfile: 'ROOF_PEAK',
                connectionTaxonomy: 'ROOF_PEAK',
                sourceFaceId: peakSolve.sourceFaceId,
                targetFaceId: peakSolve.targetFaceId,
                sourceCornerId: peakSolve.sourceCornerId,
                targetCornerId: peakSolve.targetCornerId,
                sourceFaceNormal: pSock.normal,
                targetFaceNormal: tSock.normal,
                lowerSupportsDetected: lowerSupported,
                partnerPieceAdjustment: candPartnerAdjustment ?? undefined,
              };
            } else if (
              compat.timberJointType === 'TIMBER_CORNER' &&
              type === 'wood_beam' &&
              piece.type === 'wood_beam'
            ) {
              const lCornerInfo = isTimberLCornerSocketPair(
                pSock,
                tSock,
                preferredRot,
                piece.rotation,
              );
              const cornerSolve = lCornerInfo.isLCorner
                ? solveTimberLCorner(
                    rawPos,
                    preferredRot,
                    lCornerInfo.dragEndSign,
                    piece,
                    lCornerInfo.targetEndSign,
                    excludedPieceId || 'ghost',
                  )
                : null;
              if (!cornerSolve || !cornerSolve.valid) {
                continue;
              }

              alignedPos = cornerSolve.alignedPos;
              const solvedDragSockets = getPieceSnapSocketsForTransform(
                type,
                alignedPos,
                preferredRot,
                excludedPieceId || 'ghost',
              );
              effectivePSock =
                solvedDragSockets.find((s) => s.localName === cornerSolve.sourceSocketName) ??
                pSock;
              effectiveTSock =
                targetSockets.find((s) => s.localName === cornerSolve.targetSocketName) ?? tSock;
              clearanceClassification = 'SOCKET_CONTACT_CLEARED';
              candSrcFeatureType = 'corner';
              candSrcFeatureId = cornerSolve.sourceSocketName;
              candTgtFeatureType = 'corner';
              candTgtFeatureId = cornerSolve.targetSocketName;
              candSeamSep = cornerSolve.seamSeparation;

              timberJointProposal = {
                targetPieceId: piece.id,
                sourceSocketId: cornerSolve.sourceSocketId,
                targetSocketId: cornerSolve.targetSocketId,
                sourceSocketName: cornerSolve.sourceSocketName,
                targetSocketName: cornerSolve.targetSocketName,
                localAnchorA: cornerSolve.localAnchorA,
                localAnchorB: cornerSolve.localAnchorB,
                worldPosition: cornerSolve.worldSeamPoint,
                jointType: 'TIMBER_CORNER',
                restAngle: cornerSolve.restAngle,
                restSeparation: cornerSolve.seamSeparation,
                seamSeparation: cornerSolve.seamSeparation,
                strengthProfile: 'TIMBER_CORNER',
                connectionTaxonomy: 'TIMBER_CORNER',
                sourceFaceId: cornerSolve.sourceFaceId,
                targetFaceId: cornerSolve.targetFaceId,
                sourceCornerId: null,
                targetCornerId: null,
                sourceFaceNormal: effectivePSock.normal,
                targetFaceNormal: effectiveTSock.normal,
              };
            } else if (
              isCornerSeatPair &&
              type === 'wood_beam' &&
              pSock.socketKind === 'beam_end' &&
              tSock.socketKind === 'block_corner'
            ) {
              const seatSolve = solveBlockCornerSeat(rawPos, preferredRot, pSock, piece, tSock);
              if (!seatSolve || !seatSolve.valid) {
                continue;
              }
              alignedPos = seatSolve.alignedPos;
              clearanceClassification = 'SOCKET_CONTACT_CLEARED';
              candSrcFeatureType = 'corner';
              candSrcFeatureId = seatSolve.beamCornerId || seatSolve.beamSocketName;
              candTgtFeatureType = 'corner';
              candTgtFeatureId = seatSolve.blockCornerId;
              candSeamSep = seatSolve.seamSeparation;

              if (seatSolve.isBreakableJoint) {
                timberJointProposal = {
                  targetPieceId: piece.id,
                  sourceSocketId: pSock.id,
                  targetSocketId: tSock.id,
                  sourceSocketName: pSock.localName || pSock.id,
                  targetSocketName: tSock.localName || tSock.id,
                  localAnchorA: seatSolve.localAnchorBeam,
                  localAnchorB: seatSolve.localAnchorBlock,
                  worldPosition: seatSolve.worldContactPoint,
                  jointType: 'RAFTER_CORNER_SEAT',
                  restAngle: shortestSignedAngleDelta(preferredRot, piece.rotation),
                  restSeparation: 0,
                  seamSeparation: seatSolve.seamSeparation,
                  strengthProfile: seatSolve.strengthProfile ?? 'RAFTER_CORNER_SEAT',
                  connectionTaxonomy: 'RAFTER_CORNER_SEAT',
                  sourceFaceId: mapSocketToFaceId(pSock.localName, type),
                  targetFaceId: mapSocketToFaceId(tSock.localName, piece.type),
                  sourceCornerId: seatSolve.beamCornerId,
                  targetCornerId: seatSolve.blockCornerId,
                  sourceFaceNormal: pSock.normal,
                  targetFaceNormal: tSock.normal,
                };
              } else {
                candCornerSupported = true;
              }
            } else if (
              isCornerSeatPair &&
              (type === 'wood_block' || type === 'stone_block' || type === 'bullseye_block') &&
              pSock.socketKind === 'block_corner' &&
              piece.type === 'wood_beam' &&
              tSock.socketKind === 'beam_end'
            ) {
              const seatSolve = solveBlockCornerSeatFromBlockDrag(
                rawPos,
                preferredRot,
                type,
                pSock,
                piece,
                tSock,
                excludedPieceId || 'ghost',
              );
              if (!seatSolve || !seatSolve.valid) {
                continue;
              }
              alignedPos = seatSolve.alignedPos;
              clearanceClassification = 'SOCKET_CONTACT_CLEARED';
              candSrcFeatureType = 'corner';
              candSrcFeatureId = seatSolve.blockCornerId;
              candTgtFeatureType = 'corner';
              candTgtFeatureId = seatSolve.beamCornerId || seatSolve.beamSocketName;
              candSeamSep = seatSolve.seamSeparation;

              if (seatSolve.isBreakableJoint) {
                timberJointProposal = {
                  targetPieceId: piece.id,
                  sourceSocketId: pSock.id,
                  targetSocketId: tSock.id,
                  sourceSocketName: pSock.localName || pSock.id,
                  targetSocketName: tSock.localName || tSock.id,
                  localAnchorA: seatSolve.localAnchorBlock,
                  localAnchorB: seatSolve.localAnchorBeam,
                  worldPosition: seatSolve.worldContactPoint,
                  jointType: 'RAFTER_CORNER_SEAT',
                  restAngle: shortestSignedAngleDelta(preferredRot, piece.rotation),
                  restSeparation: 0,
                  seamSeparation: seatSolve.seamSeparation,
                  strengthProfile: seatSolve.strengthProfile ?? 'RAFTER_CORNER_SEAT',
                  connectionTaxonomy: 'RAFTER_CORNER_SEAT',
                  sourceFaceId: mapSocketToFaceId(pSock.localName, type),
                  targetFaceId: mapSocketToFaceId(tSock.localName, piece.type),
                  sourceCornerId: seatSolve.blockCornerId,
                  targetCornerId: seatSolve.beamCornerId,
                  sourceFaceNormal: pSock.normal,
                  targetFaceNormal: tSock.normal,
                };
              } else {
                candCornerSupported = true;
              }
            } else if (isTimberJointEligiblePair && compat.timberJointType) {
              const clearance = solveTimberJointClearance(
                preferredRot,
                pSock,
                piece,
                tSock,
                alignedPos,
                type,
              );
              if (!clearance.valid) {
                if (
                  !bestRejectedTimberClearance ||
                  rawInitialDist < bestRejectedTimberClearance.rawDist
                ) {
                  bestRejectedTimberClearance = {
                    clearance,
                    rawDist: rawInitialDist,
                    targetPieceId: piece.id,
                    pSock,
                    tSock,
                  };
                }
                continue;
              }
              alignedPos = clearance.adjustedPos;
              clearanceClassification = 'SOCKET_CONTACT_CLEARED';
              const classified = classifyTimberJointConnection(
                type,
                preferredRot,
                pSock,
                piece,
                tSock,
                false,
              );
              candSrcFeatureType =
                pSock.socketKind === 'block_edge' || pSock.socketKind === 'beam_side'
                  ? 'face'
                  : pSock.socketKind === 'block_corner'
                    ? 'corner'
                    : 'socket';
              candSrcFeatureId = classified.sourceFaceId || classified.sourceCornerId || pSock.localName || pSock.id;
              candTgtFeatureType =
                tSock.socketKind === 'block_edge' || tSock.socketKind === 'beam_side'
                  ? 'face'
                  : tSock.socketKind === 'block_corner'
                    ? 'corner'
                    : 'socket';
              candTgtFeatureId = classified.targetFaceId || classified.targetCornerId || tSock.localName || tSock.id;
              candSeamSep = clearance.restSeparation;

              timberJointProposal = {
                targetPieceId: piece.id,
                sourceSocketId: pSock.id,
                targetSocketId: tSock.id,
                sourceSocketName: pSock.localName || pSock.id,
                targetSocketName: tSock.localName || tSock.id,
                localAnchorA: clearance.localAnchorA,
                localAnchorB: clearance.localAnchorB,
                worldPosition: Vec2.scale(
                  Vec2.add(clearance.worldSocketA, clearance.worldSocketB),
                  0.5,
                ),
                jointType: classified.jointType,
                restAngle: clearance.restAngle,
                restSeparation: 0,
                seamSeparation: clearance.restSeparation,
                strengthProfile: classified.strengthProfile,
                connectionTaxonomy: classified.taxonomy,
                connectionSubtype: classified.connectionSubtype,
                materialPairKey: classified.materialPairKey,
                sourceFaceId: classified.sourceFaceId,
                targetFaceId: classified.targetFaceId,
                sourceCornerId: classified.sourceCornerId,
                targetCornerId: classified.targetCornerId,
                sourceFaceNormal: pSock.normal,
                targetFaceNormal: tSock.normal,
              };
            } else if (compat.normalDot > -0.98 && pSock.socketKind === 'beam_end') {
              // Non-joint oblique beam end resting against a stone block edge:
              // Shift along tSock.normal by the corner protrusion so the beam rests cleanly on the block face
              const uPerp = { x: -Math.sin(preferredRot), y: Math.cos(preferredRot) };
              const cornerProtrusion =
                halfH * Math.abs(Vec2.dot(uPerp, tSock.normal)) + 0.5;
              alignedPos = Vec2.add(alignedPos, Vec2.scale(tSock.normal, cornerProtrusion));
            }

            const rawDist = Vec2.distance(rawPos, alignedPos);
            if (
              rawDist >
              maxAllowedRadius +
                (isTimberJointEligiblePair || isCornerSeatPair ? 10 : 0)
            ) {
              continue;
            }

            // Skip candidates that would push the piece outside the valid world build zone
            const absCos = Math.abs(Math.cos(preferredRot));
            const absSin = Math.abs(Math.sin(preferredRot));
            const candHalfExtentX = (config.width * absCos + config.height * absSin) / 2;
            const candHalfExtentY = (config.width * absSin + config.height * absCos) / 2;
            const candBZone = WORLD_CONFIG.buildZone;
            if (
              alignedPos.x - candHalfExtentX < candBZone.minX - 40 ||
              alignedPos.x + candHalfExtentX > candBZone.maxX + 40 ||
              alignedPos.y - candHalfExtentY < candBZone.minY - 40 ||
              alignedPos.y + candHalfExtentY > WORLD_CONFIG.groundY + 25
            ) {
              continue;
            }

            // Check if this aligned position intersects a wisp volume
            const candOBB = createOBB(alignedPos, config.width, config.height, preferredRot);
            if (checkPieceOverlapsWisps(candOBB, effectiveWisps).overlaps) {
              continue;
            }

            // Check if this aligned position is overlap-free against all valid pieces
            let isOverlapFree = true;
            let conflictingThirdPieceId: string | null = null;
            for (const other of validPieces) {
              const otherPos =
                candPartnerAdjustment && other.id === candPartnerAdjustment.pieceId
                  ? candPartnerAdjustment.afterPos
                  : other.position;
              const otherConfig = MATERIAL_CONFIGS[other.type];
              const otherOBB = createOBB(
                otherPos,
                otherConfig.width,
                otherConfig.height,
                other.rotation,
              );
              const tol =
                (timberJointProposal || candCornerSupported) && other.id === piece.id
                  ? 0.05
                  : 2.5;
              if (checkOBBOverlap(candOBB, otherOBB, tol)) {
                isOverlapFree = false;
                if (other.id !== piece.id) {
                  conflictingThirdPieceId = other.id;
                  clearanceClassification = 'THIRD_PIECE_CONFLICT';
                }
                break;
              }
            }

            // Adjust specificity priority for block_corner based on whether beam is oblique
            const effectivePriority =
              isCornerSeatPair && !isObliqueAngle && !isTargetOblique ? 12 : compat.priority;

            // Support completeness bonus: check if the opposite end of a wood_beam also lands on a support
            let supportCompletenessBonus = 0;
            if (isOverlapFree && type === 'wood_beam') {
              const solvedSocks = getPieceSnapSocketsForTransform(
                type,
                alignedPos,
                preferredRot,
                excludedPieceId || 'ghost',
              );
              const otherEnd = solvedSocks.find(
                (s) => s.socketKind === 'beam_end' && s.localName !== effectivePSock.localName,
              );
              if (otherEnd) {
                const hasOtherEndSupport = validPieces.some((p2) => {
                  if (p2.id === piece.id || p2.condition === 'BROKEN') return false;
                  return getPieceSnapSockets(p2).some(
                    (s2) =>
                      s2.socketKind !== 'center' &&
                      Vec2.distance(otherEnd.worldPos, s2.worldPos) <= 18.0,
                  );
                });
                if (hasOtherEndSupport) {
                  supportCompletenessBonus = 3.5;
                }
              }
            }

            const pointerDistanceScore = Number(rawDist.toFixed(3));
            const angleCompatibilityScore = Number(
              (compat.normalDot <= -0.98 || compat.timberJointType === 'ROOF_PEAK'
                ? 2.5
                : (isObliqueAngle || isTargetOblique) && isCornerSeatPair
                  ? 2.0
                  : 0
              ).toFixed(3),
            );
            const specificityScore = Number((effectivePriority * 0.45).toFixed(3));
            const hysteresisBonus = isLocked ? 14 : 0;

            let effectiveScore =
              rawDist -
              angleCompatibilityScore -
              specificityScore -
              hysteresisBonus -
              supportCompletenessBonus;
            if (!isOverlapFree) effectiveScore += 100;

            const humanLabel =
              timberJointProposal?.jointType === 'ROOF_PEAK'
                ? 'Roof Peak'
                : timberJointProposal?.jointType === 'TIMBER_CORNER'
                  ? 'Timber Corner Joint'
                  : timberJointProposal?.jointType === 'RAFTER_CORNER_SEAT' ||
                      timberJointProposal?.jointType === 'CORNER_BINDING'
                    ? 'Corner Joint'
                    : candCornerSupported
                      ? 'Corner Supported'
                      : timberJointProposal?.jointType === 'DIAGONAL_BRACE'
                        ? 'Diagonal Brace'
                        : timberJointProposal?.jointType === 'BLOCK_BINDING'
                          ? 'Block Binding'
                          : timberJointProposal?.jointType === 'TIMBER_FACE'
                            ? 'Timber Face Joint'
                            : timberJointProposal?.jointType === 'TIMBER_T_JOINT'
                              ? 'Timber T-Joint'
                              : timberJointProposal?.jointType === 'TIMBER_SPLICE'
                                ? 'Timber Splice'
                                : 'Supported Contact';

            const candClosure = classifyArchitecturalClosure({
              positionMismatchPx: rawDist,
              seamGapPx: candSeamSep,
              balancedCorrectionPx: candPartnerAdjustment
                ? Vec2.length(candPartnerAdjustment.correctionVector)
                : 0,
              committedPieceAdjustmentPx: candPartnerAdjustment
                ? Vec2.length(candPartnerAdjustment.correctionVector)
                : 0,
              hasColliderPenetration: !isOverlapFree,
            });

            if (timberJointProposal) {
              const matPairKey = resolveMaterialPairProfileId(
                type,
                piece.type,
                false,
                Boolean(piece.isPrebuilt),
                timberJointProposal.jointType,
              );
              const connSubtype =
                timberJointProposal.connectionSubtype ??
                resolveConnectionSubtype(
                  timberJointProposal.jointType,
                  type,
                  piece.type,
                  pSock.socketKind,
                  tSock.socketKind,
                );
              const resolvedProfile = resolveBindingStrengthProfile(
                timberJointProposal.jointType,
                type,
                piece.type,
                false,
                Boolean(piece.isPrebuilt),
              );
              timberJointProposal.strengthProfile = resolvedProfile;
              timberJointProposal.materialA = type;
              timberJointProposal.materialB = piece.type;
              timberJointProposal.materialPairKey = matPairKey;
              timberJointProposal.connectionSubtype = connSubtype;
              timberJointProposal.complianceProfile = resolvedProfile;
              timberJointProposal.isPrebuiltBinding = Boolean(piece.isPrebuilt);
              timberJointProposal.creationReason = 'SNAP_COMMIT';
            }

            const candCanon = buildCanonicalRelationship({
              pieceAId: excludedPieceId || 'ghost',
              pieceAType: type,
              pieceAPos: alignedPos,
              pieceARot: preferredRot,
              featureAId: candSrcFeatureId,
              pieceBId: piece.id,
              pieceBType: piece.type,
              pieceBPos:
                candPartnerAdjustment && candPartnerAdjustment.pieceId === piece.id
                  ? candPartnerAdjustment.afterPos
                  : piece.position,
              pieceBRot: piece.rotation,
              featureBId: candTgtFeatureId,
              connectionTaxonomy:
                timberJointProposal?.connectionTaxonomy ??
                (candCornerSupported ? 'RAFTER_CORNER_SEAT' : 'SUPPORTED_CONTACT'),
              jointProfileId:
                timberJointProposal?.strengthProfile ??
                (candCornerSupported ? 'CORNER_SUPPORTED' : 'SUPPORTED_CONTACT'),
            });

            if (timberJointProposal) {
              timberJointProposal.restSeparation = 0;
              timberJointProposal.closureClassification = candClosure;
              timberJointProposal.canonicalRelationship = candCanon;
              timberJointProposal.visualConnectionState = 'CANDIDATE_PREVIEW';
              timberJointProposal.visualJointCapType = getVisualJointCapType(
                timberJointProposal.jointType,
                timberJointProposal.connectionTaxonomy,
                timberJointProposal.materialPairKey,
              );
              timberJointProposal.playerFacingConnectionLabel =
                timberJointProposal.jointType === 'ROOF_PEAK'
                  ? 'Roof Peak available'
                  : timberJointProposal.jointType === 'RAFTER_CORNER_SEAT' ||
                      timberJointProposal.jointType === 'TIMBER_CORNER' ||
                      timberJointProposal.jointType === 'CORNER_BINDING'
                    ? 'Corner connection available'
                    : timberJointProposal.jointType === 'DIAGONAL_BRACE'
                      ? 'Brace connection available'
                      : timberJointProposal.jointType === 'BLOCK_BINDING'
                        ? 'Block connection available'
                        : 'Timber Joint available';
            }

            candidates.push({
              pSock: effectivePSock,
              tSock: effectiveTSock,
              targetPiece: piece,
              alignedPos,
              rawDist,
              effectiveScore,
              compatLabel: compat.label,
              humanLabel,
              normalDot: compat.normalDot,
              isLocked,
              isOverlapFree,
              conflictingThirdPieceId,
              timberJointProposal,
              clearanceClassification,
              partnerAdjustment: candPartnerAdjustment,
              balancedActive: candBalancedActive,
              peakDiagnostics: candPeakDiagnostics,
              srcFeatureType: candSrcFeatureType,
              srcFeatureId: candSrcFeatureId,
              tgtFeatureType: candTgtFeatureType,
              tgtFeatureId: candTgtFeatureId,
              seamSep: candSeamSep,
              cornerSupportedContact: candCornerSupported,
              rankingBreakdown: {
                candidateLabel: humanLabel,
                targetPieceId: piece.id,
                sourceFeatureId: candSrcFeatureId,
                targetFeatureId: candTgtFeatureId,
                validGeometry: true,
                noColliderPenetration: isOverlapFree,
                rotationPreserved: true,
                pointerProximityPx: Number(rawDist.toFixed(2)),
                totalPositionalCorrectionPx: Number(rawDist.toFixed(2)),
                partnerMovementPx: candPartnerAdjustment
                  ? Number(Vec2.length(candPartnerAdjustment.correctionVector).toFixed(2))
                  : 0,
                pointerDistanceScore: Number(pointerDistanceScore.toFixed(2)),
                angleCompatibilityScore: Number(angleCompatibilityScore.toFixed(2)),
                specificityScore: Number(specificityScore.toFixed(2)),
                hysteresisBonus,
                supportCompletenessBonus,
                totalScore: Number(effectiveScore.toFixed(2)),
                closureClassification: candClosure,
                canonicalKey: candCanon.canonicalKey,
                mirroredEquivalentKey: candCanon.mirroredEquivalentKey,
              },
            });
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          if (Math.abs(a.effectiveScore - b.effectiveScore) > 1e-4) {
            return a.effectiveScore - b.effectiveScore;
          }
          if (Math.abs(a.seamSep - b.seamSep) > 1e-4) {
            return a.seamSep - b.seamSep;
          }
          if (Math.abs(a.rawDist - b.rawDist) > 1e-4) {
            return a.rawDist - b.rawDist;
          }
          const pieceCmp = a.targetPiece.id.localeCompare(b.targetPiece.id);
          if (pieceCmp !== 0) return pieceCmp;
          return a.tSock.id.localeCompare(b.tSock.id);
        });

        // Build deduplicated list of distinct overlap-free candidates for candidate cycling
        const distinctOverlapFree: EvaluatedCandidate[] = [];
        const seenKeys = new Set<string>();
        for (const cand of candidates) {
          if (!cand.isOverlapFree) continue;
          const key = `${cand.targetPiece.id}:${cand.humanLabel}:${cand.tgtFeatureId}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            distinctOverlapFree.push(cand);
          }
        }

        candidateCycleCount = distinctOverlapFree.length;
        availableCandidateLabels = distinctOverlapFree.map((c) => c.humanLabel);
        const requestedCycle = options?.candidateCycleIndex ?? 0;
        candidateCycleIndex =
          candidateCycleCount > 0
            ? ((requestedCycle % candidateCycleCount) + candidateCycleCount) % candidateCycleCount
            : 0;

        const winner =
          distinctOverlapFree.length > 0
            ? distinctOverlapFree[candidateCycleIndex]
            : candidates[0];

        if (!snapped || (anchorOccupied && winner.isOverlapFree)) {
          bestPos = winner.alignedPos;
          bestSocket = winner.tSock;
          bestPieceSocket = winner.pSock;
          snapped = true;
          socketCompatibility = winner.compatLabel;
          candidateWorldDistance = winner.rawDist;
          candidateLockActive = winner.isLocked;
          isAnchorRequired = false;
          attachedAnchorId = undefined;
          proposedTimberJoint = winner.isOverlapFree ? winner.timberJointProposal : null;
          overlapClassification = winner.clearanceClassification;
          currentCandidateLabel = winner.humanLabel;
          balancedAdjustmentActive = winner.isOverlapFree && winner.balancedActive;
          partnerPieceAdjustment = winner.isOverlapFree ? winner.partnerAdjustment : null;
          peakSymmetryDiagnostics = winner.peakDiagnostics;
          sourceFeatureType = winner.srcFeatureType;
          sourceFeatureId = winner.srcFeatureId;
          targetFeatureType = winner.tgtFeatureType;
          targetFeatureId = winner.tgtFeatureId;
          seamSeparation = winner.seamSep;
          candidateRankingBreakdown = winner.rankingBreakdown;
          isCornerSupportedContact = winner.isOverlapFree && winner.cornerSupportedContact;

          // Preserve manual rotation ownership!
          // For any timber joint or overlap-free snap, keep preferredRot without forcing angle flattening.
          const isFlushOrTimberJoint =
            Boolean(winner.timberJointProposal) ||
            winner.isOverlapFree ||
            winner.normalDot <= -0.96;

          if (isFlushOrTimberJoint) {
            bestRot = preferredRot;
            proposedRotation = preferredRot;
            requiresRotationChange = false;
          } else {
            const sockProposedRot = snapAngle45(winner.tSock.angle);
            proposedRotation = sockProposedRot;
            requiresRotationChange = true;
            if (options?.acceptSnapRotation) {
              bestRot = sockProposedRot;
            } else {
              bestRot = preferredRot;
            }
          }

          if (!winner.isOverlapFree && winner.timberJointProposal && winner.conflictingThirdPieceId) {
            lastSnapRejectionReason = 'JOINT_BLOCKED_BY_THIRD_PIECE';
            playerFriendlyRejectionMessage = 'Joint blocked by another piece.';
          }
        }
      }
    }
  }

  // Handle Free Adjust modifier or fine adjustment offset while locked to a candidate
  const freeAdjustActive = Boolean(options?.freeAdjustActive);
  let fineAdjustmentOffsetPx: Vector2 | null = null;
  if (options?.fineAdjustmentOffset) {
    const rawOffset = options.fineAdjustmentOffset;
    const mag = Vec2.length(rawOffset);
    const maxFine = ARCHITECTURAL_CLOSURE_CONFIG.fineAdjustCandidateOffsetPx;
    fineAdjustmentOffsetPx =
      mag > maxFine ? Vec2.scale(Vec2.normalize(rawOffset), maxFine) : { ...rawOffset };
    if (!options?.commitAssistActive) {
      bestPos = Vec2.add(bestPos, fineAdjustmentOffsetPx);
    }
  }
  if (freeAdjustActive && !options?.commitAssistActive) {
    // Player is holding Free Adjust: move freely at rawPos while keeping nearby candidate preview
    // if rawPos is within forgiving closure range
    const distFromSnap = Vec2.distance(rawPos, bestPos);
    bestPos = { ...rawPos };
    if (distFromSnap > ARCHITECTURAL_CLOSURE_CONFIG.forgivingPositionTolerancePx) {
      snapped = false;
      proposedTimberJoint = null;
      partnerPieceAdjustment = null;
      balancedAdjustmentActive = false;
    }
  }

  // 3. Validate Collision, Wisp Clearance & World Boundaries
  const candidateOBB = createOBB(bestPos, config.width, config.height, bestRot);
  let isValid = true;
  let overlappingPieceId: string | undefined;
  let overlapColliderId: string | null = null;
  let maxPenetrationDepth = 0;

  const bZone = WORLD_CONFIG.buildZone;
  const halfExtent = Math.max(config.width, config.height) / 2;

  let lowestY = -Infinity;
  for (const v of candidateOBB.vertices) {
    if (v.y > lowestY) lowestY = v.y;
  }

  if (lowestY > WORLD_CONFIG.groundY + 1) {
    const penetration = lowestY - WORLD_CONFIG.groundY;
    if (penetration <= 28 && !proposedTimberJoint && !isCornerSupportedContact) {
      bestPos.y -= penetration;
      const adjustedOBB = createOBB(bestPos, config.width, config.height, bestRot);
      candidateOBB.center = adjustedOBB.center;
      candidateOBB.vertices = adjustedOBB.vertices;
      lowestY = WORLD_CONFIG.groundY;
    } else {
      isValid = false;
      proposedTimberJoint = null;
      partnerPieceAdjustment = null;
      balancedAdjustmentActive = false;
      overlapClassification = 'TERRAIN_CONFLICT';
      lastSnapRejectionReason = 'BELOW_GROUND';
      playerFriendlyRejectionMessage = 'Below sanctuary ground';
      overlapColliderId = 'ground_bedrock';
      maxPenetrationDepth = penetration;
    }
  }

  if (
    isValid &&
    (bestPos.x - halfExtent < bZone.minX - 40 ||
      bestPos.x + halfExtent > bZone.maxX + 40 ||
      bestPos.y - halfExtent < bZone.minY - 40 ||
      bestPos.y + halfExtent > WORLD_CONFIG.groundY + 25)
  ) {
    isValid = false;
    proposedTimberJoint = null;
    partnerPieceAdjustment = null;
    balancedAdjustmentActive = false;
    overlapClassification = 'OUT_OF_BOUNDS';
    lastSnapRejectionReason = 'OUT_OF_BOUNDS';
    playerFriendlyRejectionMessage = 'Move fully inside the build zone';
    overlapColliderId = 'world_build_zone';
  }

  // Wisp clearance check against active wisps
  if (isValid) {
    const wispOverlap = checkPieceOverlapsWisps(candidateOBB, effectiveWisps);
    if (wispOverlap.overlaps) {
      isValid = false;
      proposedTimberJoint = null;
      partnerPieceAdjustment = null;
      balancedAdjustmentActive = false;
      overlapColliderId = wispOverlap.wispId;
      maxPenetrationDepth = wispOverlap.penetrationDepth;
      lastSnapRejectionReason = 'WISP_OVERLAP';
      playerFriendlyRejectionMessage = 'Keep this space clear for the wisps.';
    }
  }

  // Overlap check against existing valid pieces
  if (isValid) {
    const candidateSockets =
      snappingEnabled && type === 'wood_beam'
        ? getPieceSnapSocketsForTransform(type, bestPos, bestRot, excludedPieceId || 'ghost').filter(
            (s) => s.socketKind === 'beam_end',
          )
        : [];

    for (const piece of validPieces) {
      const effectivePiecePos =
        partnerPieceAdjustment && piece.id === partnerPieceAdjustment.pieceId
          ? partnerPieceAdjustment.afterPos
          : piece.position;
      const pConfig = MATERIAL_CONFIGS[piece.type];
      const pieceOBB = createOBB(effectivePiecePos, pConfig.width, pConfig.height, piece.rotation);
      let tol =
        (proposedTimberJoint && piece.id === proposedTimberJoint.targetPieceId) ||
        (isCornerSupportedContact && bestSocket && bestSocket.id.startsWith(piece.id))
          ? 0.05
          : 2.5;

      // If this piece is a secondary endpoint joint partner for a spanning beam/brace/rafter,
      // allow standard endpoint corner bevel clearance
      if (
        snappingEnabled &&
        type === 'wood_beam' &&
        (piece.type === 'wood_beam' ||
          piece.type === 'wood_block' ||
          piece.type === 'stone_block' ||
          piece.type === 'bullseye_block') &&
        (!proposedTimberJoint || piece.id !== proposedTimberJoint.targetPieceId)
      ) {
        const otherSockets = getPieceSnapSockets(piece);
        const hasSecondarySocketMatch = candidateSockets.some((cs) =>
          otherSockets.some(
            (os) =>
              os.socketKind !== 'center' &&
              os.socketKind !== 'beam_corner' &&
              Vec2.distance(cs.worldPos, os.worldPos) <=
                TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 2.5 &&
              evaluateSocketCompatibility(cs, os, type, piece.type).compatible,
          ),
        );
        if (hasSecondarySocketMatch) {
          tol = Math.max(tol, config.height * 0.55);
        }
      }

      const depth = getOBBPenetrationDepth(candidateOBB, pieceOBB, tol);
      if (depth > 0) {
        isValid = false;
        overlappingPieceId = piece.id;
        overlapColliderId = piece.id;
        maxPenetrationDepth = depth;

        if (proposedTimberJoint && piece.id !== proposedTimberJoint.targetPieceId) {
          overlapClassification = 'THIRD_PIECE_CONFLICT';
          lastSnapRejectionReason = 'JOINT_BLOCKED_BY_THIRD_PIECE';
          playerFriendlyRejectionMessage = 'Joint blocked by another piece.';
        } else if (
          bestRejectedTimberClearance &&
          piece.id === bestRejectedTimberClearance.targetPieceId
        ) {
          overlapClassification = bestRejectedTimberClearance.clearance.overlapClassification;
          lastSnapRejectionReason = bestRejectedTimberClearance.clearance.rejectionReason;
          playerFriendlyRejectionMessage =
            bestRejectedTimberClearance.clearance.friendlyMessage;
          bestPieceSocket = bestRejectedTimberClearance.pSock;
          bestSocket = bestRejectedTimberClearance.tSock;
          socketCompatibility = 'BEAM_END_TO_BEAM_END';
        } else if (type === 'wood_beam' && piece.type === 'wood_beam') {
          const isParallelOverlap = Math.abs(Math.sin(bestRot - piece.rotation)) < 0.32;
          if (isParallelOverlap) {
            overlapClassification = 'BODY_OVERLAP';
            lastSnapRejectionReason = 'BEAM_BODY_OVERLAP';
            playerFriendlyRejectionMessage = 'Beam bodies overlap beyond the endpoint.';
          } else {
            overlapClassification = 'STEEP_ANGLE_CLEARANCE';
            lastSnapRejectionReason = 'INSUFFICIENT_ANGLE_CLEARANCE';
            playerFriendlyRejectionMessage = 'Not enough clearance for this angle.';
          }
        } else {
          lastSnapRejectionReason = 'OVERLAP_COLLISION';
          playerFriendlyRejectionMessage = 'Blocked by another piece';
        }
        proposedTimberJoint = null;
        partnerPieceAdjustment = null;
        balancedAdjustmentActive = false;
        break;
      }
    }
  }

  // 4. Transactional Connected-Piece Edit & Multi-Endpoint Joint Resolution:
  const proposedTimberJoints: ProposedTimberJoint[] = [];
  const preservedJoints: TimberJoint[] = [];
  const removedJoints: TimberJoint[] = [];
  const partnerPieceAdjustments: PartnerPieceAdjustment[] = [];
  if (partnerPieceAdjustment) {
    partnerPieceAdjustments.push(partnerPieceAdjustment);
  }

  if (isValid && snappingEnabled && proposedTimberJoint) {
    proposedTimberJoints.push(proposedTimberJoint);
  }

  if (isValid && existingJoints.length > 0 && excludedPieceId) {
    const newSockets = getPieceSnapSocketsForTransform(type, bestPos, bestRot, excludedPieceId);
    for (const joint of existingJoints) {
      const isPieceA = joint.pieceAId === excludedPieceId;
      const partnerId = isPieceA ? joint.pieceBId : joint.pieceAId;
      const partnerPiece = validPieces.find((p) => p.id === partnerId);
      if (!partnerPiece || partnerPiece.condition === 'BROKEN') {
        removedJoints.push(joint);
        continue;
      }

      const mySockId = isPieceA ? joint.socketAId : joint.socketBId;
      const partnerSockId = isPieceA ? joint.socketBId : joint.socketAId;
      const partnerSockets = getPieceSnapSockets(partnerPiece);
      const mySock = newSockets.find(
        (s) => s.id === mySockId || Boolean(s.localName && mySockId.endsWith('_' + s.localName)),
      );
      const pSock = partnerSockets.find(
        (s) =>
          s.id === partnerSockId ||
          Boolean(s.localName && partnerSockId.endsWith('_' + s.localName)),
      );
      const sockDist =
        mySock && pSock ? Vec2.distance(mySock.worldPos, pSock.worldPos) : Infinity;

      const compat =
        mySock && pSock
          ? evaluateSocketCompatibility(mySock, pSock, type, partnerPiece.type)
          : null;
      const isFolded =
        mySock &&
        pSock &&
        mySock.socketKind === 'beam_end' &&
        pSock.socketKind === 'beam_end' &&
        Vec2.dot(Vec2.scale(mySock.normal, -1), Vec2.scale(pSock.normal, -1)) >
          TIMBER_JOINT_CONFIG.minFoldedBodyCosine;

      if (
        mySock &&
        pSock &&
        compat?.isTimberJointEligible &&
        !isFolded &&
        sockDist <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 2.5
      ) {
        const classified = classifyTimberJointConnection(
          type,
          bestRot,
          mySock,
          partnerPiece,
          pSock,
          proposedTimberJoints.length > 0,
        );
        const sharedSeam = Vec2.scale(Vec2.add(mySock.worldPos, pSock.worldPos), 0.5);
        const updatedJoint: TimberJoint = {
          ...joint,
          jointType: classified.jointType,
          strengthProfile: classified.strengthProfile,
          connectionSubtype: classified.connectionSubtype,
          materialPairKey: classified.materialPairKey,
          complianceProfile: classified.strengthProfile,
          worldPosition: sharedSeam,
          localAnchorA: isPieceA
            ? Vec2.rotate(Vec2.sub(sharedSeam, bestPos), -bestRot)
            : Vec2.rotate(Vec2.sub(sharedSeam, partnerPiece.position), -partnerPiece.rotation),
          localAnchorB: isPieceA
            ? Vec2.rotate(Vec2.sub(sharedSeam, partnerPiece.position), -partnerPiece.rotation)
            : Vec2.rotate(Vec2.sub(sharedSeam, bestPos), -bestRot),
          restAngle: isPieceA
            ? shortestSignedAngleDelta(bestRot, partnerPiece.rotation)
            : shortestSignedAngleDelta(partnerPiece.rotation, bestRot),
          restSeparation: 0,
        };
        preservedJoints.push(updatedJoint);
      } else {
        removedJoints.push(joint);
      }
    }
  } else if (!isValid && existingJoints.length > 0) {
    removedJoints.push(...existingJoints);
  }

  // Secondary endpoint evaluation for wood_beam (e.g. diagonal brace or rafter spanning two supports/members)
  if (isValid && snappingEnabled && type === 'wood_beam') {
    const solvedSockets = getPieceSnapSocketsForTransform(
      type,
      bestPos,
      bestRot,
      excludedPieceId || 'ghost',
    );
    const solvedCorners = getPieceCornersForTransform(type, bestPos, bestRot);
    const endSockets = solvedSockets.filter((s) => s.socketKind === 'beam_end');
    for (const endSock of endSockets) {
      const alreadyUsedInProposed = proposedTimberJoints.some(
        (pj) => pj.sourceSocketName === endSock.localName || pj.sourceSocketId === endSock.id,
      );
      const alreadyUsedInPreserved = preservedJoints.some((j) => {
        const mySockId = j.pieceAId === excludedPieceId ? j.socketAId : j.socketBId;
        return endSock.id === mySockId || (endSock.localName && mySockId.endsWith(endSock.localName));
      });
      if (alreadyUsedInProposed || alreadyUsedInPreserved) continue;

      const isEndA = (endSock.localName || '').includes('END_A');
      const endCorners = solvedCorners.filter((c) =>
        c.id.startsWith(isEndA ? 'END_A' : 'END_B'),
      );

      let bestSecondary: ProposedTimberJoint | null = null;
      let bestSecondaryDist = TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 2.5;

      for (const piece2 of validPieces) {
        if (piece2.condition === 'BROKEN') continue;
        if (proposedTimberJoints.some((pj) => pj.targetPieceId === piece2.id)) continue;

        const isPiece2Oblique = Math.abs(Math.sin(piece2.rotation * 2)) > 0.25;
        const isBestRotOblique = Math.abs(Math.sin(bestRot * 2)) > 0.25;
        const targetSockets2 = getPieceSnapSockets(piece2);
        for (const tSock2 of targetSockets2) {
          if (tSock2.socketKind === 'center' || tSock2.socketKind === 'beam_corner') continue;
          if (tSock2.socketKind === 'block_corner' && !isBestRotOblique && !isPiece2Oblique) {
            continue;
          }
          const compat2 = evaluateSocketCompatibility(endSock, tSock2, type, piece2.type);
          if (!compat2.isTimberJointEligible) continue;

          // For block_corner or beam_side, measure distance from either end center or end corners
          let dist2 = Vec2.distance(endSock.worldPos, tSock2.worldPos);
          let matchedCorner: (typeof endCorners)[number] | null = null;
          if (tSock2.socketKind === 'block_corner' || tSock2.socketKind === 'beam_side') {
            for (const ec of endCorners) {
              const cd = Vec2.distance(ec.worldPos, tSock2.worldPos);
              if (cd < dist2) {
                dist2 = cd;
                matchedCorner = ec;
              }
            }
          }

          if (dist2 <= bestSecondaryDist) {
            bestSecondaryDist = dist2;
            const classified2 = classifyTimberJointConnection(
              type,
              bestRot,
              endSock,
              piece2,
              tSock2,
              true,
            );
            const sharedWorld2 = Vec2.scale(
              Vec2.add(matchedCorner?.worldPos ?? endSock.worldPos, tSock2.worldPos),
              0.5,
            );
            const stressFreeLocalA2 = Vec2.rotate(Vec2.sub(sharedWorld2, bestPos), -bestRot);
            const stressFreeLocalB2 = Vec2.rotate(
              Vec2.sub(sharedWorld2, piece2.position),
              -piece2.rotation,
            );
            bestSecondary = {
              targetPieceId: piece2.id,
              sourceSocketId: endSock.id,
              targetSocketId: tSock2.id,
              sourceSocketName: endSock.localName || endSock.id,
              targetSocketName: tSock2.localName || tSock2.id,
              localAnchorA: stressFreeLocalA2,
              localAnchorB: stressFreeLocalB2,
              worldPosition: sharedWorld2,
              jointType: classified2.jointType,
              restAngle: shortestSignedAngleDelta(bestRot, piece2.rotation),
              restSeparation: 0,
              seamSeparation: Number(dist2.toFixed(2)),
              strengthProfile: classified2.strengthProfile,
              connectionTaxonomy: classified2.taxonomy,
              connectionSubtype: classified2.connectionSubtype,
              materialA: type,
              materialB: piece2.type,
              materialPairKey: classified2.materialPairKey,
              complianceProfile: classified2.strengthProfile,
              isPrebuiltBinding: Boolean(piece2.isPrebuilt),
              creationReason: 'SNAP_COMMIT',
              sourceFaceId: classified2.sourceFaceId,
              targetFaceId: classified2.targetFaceId,
              sourceCornerId: matchedCorner?.id ?? classified2.sourceCornerId,
              targetCornerId: classified2.targetCornerId,
              sourceFaceNormal: endSock.normal,
              targetFaceNormal: tSock2.normal,
              visualConnectionState: 'CANDIDATE_PREVIEW',
              visualJointCapType: getVisualJointCapType(
                classified2.jointType,
                classified2.taxonomy,
                classified2.materialPairKey,
              ),
              playerFacingConnectionLabel:
                classified2.jointType === 'RAFTER_CORNER_SEAT'
                  ? 'Corner connection available'
                  : 'Timber Joint available',
            };
          }
        }

        // Also check flush face contact for angled braces/rafters whose second end meets a compatible face
        // slightly between discrete sockets
        if (!bestSecondary && Math.abs(Math.sin(bestRot * 2)) > 0.25) {
          const faces2 = getPieceFaces(piece2);
          for (const face2 of faces2) {
            if (!face2.jointCapable) continue;
            if (Vec2.dot(endSock.normal, face2.worldNormal) > -0.15) continue;
            const closest = getClosestPointOnFace(endSock.worldPos, face2);
            if (closest.distance <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 1.5) {
              const sharedWorldFace = Vec2.scale(Vec2.add(endSock.worldPos, closest.point), 0.5);
              const stressFreeLocalA2 = Vec2.rotate(Vec2.sub(sharedWorldFace, bestPos), -bestRot);
              const stressFreeLocalB2 = Vec2.rotate(
                Vec2.sub(sharedWorldFace, piece2.position),
                -piece2.rotation,
              );
              const sockName = `FACE_${face2.id}`;
              const matPair2 = resolveMaterialPairProfileId(
                type,
                piece2.type,
                false,
                Boolean(piece2.isPrebuilt),
                'DIAGONAL_BRACE',
              );
              const profile2 = resolveBindingStrengthProfile(
                'DIAGONAL_BRACE',
                type,
                piece2.type,
                false,
                Boolean(piece2.isPrebuilt),
              );
              bestSecondaryDist = closest.distance;
              bestSecondary = {
                targetPieceId: piece2.id,
                sourceSocketId: endSock.id,
                targetSocketId: `${piece2.id}_${sockName}`,
                sourceSocketName: endSock.localName || endSock.id,
                targetSocketName: sockName,
                localAnchorA: stressFreeLocalA2,
                localAnchorB: stressFreeLocalB2,
                worldPosition: sharedWorldFace,
                jointType: 'DIAGONAL_BRACE',
                restAngle: shortestSignedAngleDelta(bestRot, piece2.rotation),
                restSeparation: 0,
                seamSeparation: Number(closest.distance.toFixed(2)),
                strengthProfile: profile2,
                connectionTaxonomy: 'DIAGONAL_BRACE',
                connectionSubtype: 'DIAGONAL_BRACE',
                materialA: type,
                materialB: piece2.type,
                materialPairKey: matPair2,
                complianceProfile: profile2,
                isPrebuiltBinding: Boolean(piece2.isPrebuilt),
                creationReason: 'SNAP_COMMIT',
                sourceFaceId: mapSocketToFaceId(endSock.localName, type),
                targetFaceId: face2.id,
                sourceFaceNormal: endSock.normal,
                targetFaceNormal: face2.worldNormal,
                visualConnectionState: 'CANDIDATE_PREVIEW',
                visualJointCapType: getVisualJointCapType(
                  'DIAGONAL_BRACE',
                  'DIAGONAL_BRACE',
                  matPair2,
                ),
                playerFacingConnectionLabel: 'Brace connection available',
              };
            }
          }
        }
      }

      if (bestSecondary) {
        proposedTimberJoints.push(bestSecondary);
      }
    }

    // If an oblique beam connects at both ends (or has a proposed joint + a preserved joint)
    // and neither end is a ROOF_PEAK or RAFTER_CORNER_SEAT, upgrade the primary joint to DIAGONAL_BRACE if it bridges a frame
    const totalConnections = proposedTimberJoints.length + preservedJoints.length;
    const isObliqueBrace = Math.abs(Math.sin(bestRot * 2)) > 0.32;
    if (isObliqueBrace && totalConnections >= 2) {
      const hasRoofPeak = proposedTimberJoints.some((j) => j.jointType === 'ROOF_PEAK');
      for (const pj of proposedTimberJoints) {
        if (pj.jointType !== 'ROOF_PEAK' && pj.jointType !== 'RAFTER_CORNER_SEAT') {
          const targetP = validPieces.find((p) => p.id === pj.targetPieceId);
          if (targetP && !hasRoofPeak) {
            pj.jointType = 'DIAGONAL_BRACE';
            pj.connectionSubtype = 'DIAGONAL_BRACE';
            pj.strengthProfile = resolveBindingStrengthProfile(
              'DIAGONAL_BRACE',
              type,
              targetP.type,
              false,
              Boolean(targetP.isPrebuilt),
            );
            pj.complianceProfile = pj.strengthProfile;
            pj.connectionTaxonomy = 'DIAGONAL_BRACE';
          }
        }
      }
      for (const pj of proposedTimberJoints) {
        if (pj.jointType === 'ROOF_PEAK') {
          pj.lowerSupportsDetected = true;
        }
      }
    }
  }

  // 5. Roof-Assembly Closure Recognition & Atomic Multi-Joint Resolution
  let roofAssemblyPreview: RoofAssemblyPreview | null = null;
  if (isValid && snappingEnabled && type === 'wood_beam' && (!freeAdjustActive || options?.commitAssistActive)) {
    const primaryJ = proposedTimberJoints[0] ?? null;
    const secondaryJs = proposedTimberJoints.slice(1);
    const roofClosure = solveRoofAssemblyClosure({
      dragPieceId: excludedPieceId || 'ghost',
      dragPieceType: type,
      dragRawPos: rawPos,
      dragAlignedPos: bestPos,
      dragRot: bestRot,
      allValidPieces: validPieces,
      anchors,
      existingJoints: options?.existingJoints ?? [],
      primaryJoint: primaryJ,
      secondaryJoints: secondaryJs,
    });

    if (roofClosure.roofAssemblyPreview) {
      roofAssemblyPreview = roofClosure.roofAssemblyPreview;
      bestPos = roofClosure.adjustedDragPos;
      for (const adj of roofClosure.partnerAdjustments) {
        if (!partnerPieceAdjustments.some((a) => a.pieceId === adj.pieceId)) {
          partnerPieceAdjustments.push(adj);
        }
      }
      if (partnerPieceAdjustments.length > 0) {
        partnerPieceAdjustment = partnerPieceAdjustments[0];
        balancedAdjustmentActive = true;
      }
      for (const addJoint of roofClosure.additionalProposedJoints) {
        if (!proposedTimberJoints.some((pj) => pj.targetPieceId === addJoint.targetPieceId)) {
          proposedTimberJoints.push(addJoint);
        }
      }
    }
  }

  // Phase B1: discover additional broad-face support seams against the finalized,
  // post-roof-closure transform without changing primary acquisition or placement.
  if (
    isValid &&
    snappingEnabled &&
    !attachedAnchorId &&
    (!freeAdjustActive || options?.commitAssistActive)
  ) {
    const b1BroadFaceSeams = discoverSecondaryBroadFaceSeams({
      activePieceId: excludedPieceId || 'ghost',
      activeType: type,
      finalizedPos: bestPos,
      finalizedRot: bestRot,
      activeIsPrebuilt: Boolean(
        excludedPieceId && placedPieces.find((piece) => piece.id === excludedPieceId)?.isPrebuilt,
      ),
      validPieces,
      proposedTimberJoints,
      preservedJoints,
    });
    proposedTimberJoints.push(...b1BroadFaceSeams);
  }

  if (proposedTimberJoints.length > 0) {
    proposedTimberJoint = proposedTimberJoints[0];
    proposedTimberJoint.partnerPieceAdjustments = partnerPieceAdjustments;
    proposedTimberJoint.roofAssemblyPreview = roofAssemblyPreview;
  }

  // Compute Roof Support Status summary when a ROOF_PEAK is proposed
  if (
    isValid &&
    proposedTimberJoints.some((j) => j.jointType === 'ROOF_PEAK') &&
    bestPieceSocket &&
    bestSocket
  ) {
    const peakJ = proposedTimberJoints.find((j) => j.jointType === 'ROOF_PEAK')!;
    const partnerPiece = validPieces.find((p) => p.id === peakJ.targetPieceId);
    if (partnerPiece) {
      const partnerAdj = partnerPieceAdjustments.find((a) => a.pieceId === partnerPiece.id);
      const effectivePartner = partnerAdj
        ? { ...partnerPiece, position: partnerAdj.afterPos }
        : partnerPiece;
      roofSupportSummary = computeRoofSupportSummary(
        bestPos,
        bestRot,
        peakJ.sourceSocketName || bestPieceSocket.localName || bestPieceSocket.id,
        excludedPieceId,
        effectivePartner,
        peakJ.targetSocketName || bestSocket.localName || bestSocket.id,
        validPieces,
        anchors,
        options?.existingJoints ?? [],
        proposedTimberJoints,
      );
      peakJ.lowerSupportsDetected =
        roofSupportSummary.leftLowerRafterSupported &&
        roofSupportSummary.rightLowerRafterSupported;
      peakJ.roofSupportSummary = roofSupportSummary;
    }
  }

  // Predict whether the placed piece has a plausible physical support surface beneath it
  let supportedContactPredicted = Boolean(
    attachedAnchorId ||
      proposedTimberJoint ||
      isCornerSupportedContact ||
      preservedJoints.length > 0 ||
      Math.abs(lowestY - WORLD_CONFIG.groundY) <= 4,
  );
  if (!supportedContactPredicted) {
    const supportProbeOBB = createOBB(
      { x: bestPos.x, y: bestPos.y + 4 },
      config.width,
      config.height,
      bestRot,
    );
    for (const piece of validPieces) {
      if (piece.condition === 'BROKEN') continue;
      const pConfig = MATERIAL_CONFIGS[piece.type];
      const pieceOBB = createOBB(piece.position, pConfig.width, pConfig.height, piece.rotation);
      if (checkOBBOverlap(supportProbeOBB, pieceOBB, 0.5)) {
        supportedContactPredicted = true;
        break;
      }
    }
  }

  const connectionCategory: SnapResult['connectionCategory'] = attachedAnchorId
    ? 'ENVIRONMENTAL_ANCHOR'
    : proposedTimberJoint
      ? 'TIMBER_JOINT'
      : supportedContactPredicted
        ? 'SUPPORTED_CONTACT'
        : snapped
          ? 'POSITION_SNAP'
          : 'NONE';

  const connectionTaxonomy: ConnectionTaxonomyCategory = !snappingEnabled
    ? isValid
      ? 'FREE_CONTACT'
      : 'NONE'
    : attachedAnchorId
      ? 'ENVIRONMENTAL_ANCHOR'
      : proposedTimberJoint?.connectionTaxonomy
        ? proposedTimberJoint.connectionTaxonomy
        : isCornerSupportedContact
          ? 'RAFTER_CORNER_SEAT'
          : supportedContactPredicted
            ? 'SUPPORTED_CONTACT'
            : snapped
              ? 'POSITIONAL_SNAP'
              : isValid
                ? 'FREE_CONTACT'
                : 'NONE';

  const lowerSupportsDetected =
    proposedTimberJoint?.jointType === 'ROOF_PEAK'
      ? Boolean(proposedTimberJoint.lowerSupportsDetected)
      : undefined;

  if (isValid && proposedTimberJoint && !playerFriendlyRejectionMessage) {
    if (proposedTimberJoint.jointType === 'ROOF_PEAK') {
      playerFriendlyRejectionMessage =
        roofSupportSummary?.summaryMessage ||
        (lowerSupportsDetected
          ? 'Roof Peak — both rafters supported.'
          : 'Roof Peak — add lower supports so rafters do not spread.');
    } else if (proposedTimberJoint.jointType === 'TIMBER_CORNER') {
      playerFriendlyRejectionMessage = 'Timber Corner Joint — flush L-corner ready.';
    } else if (proposedTimberJoint.jointType === 'RAFTER_CORNER_SEAT') {
      const targetBlock = validPieces.find((p) => p.id === proposedTimberJoint!.targetPieceId) ?? null;
      const supportBlockPiece =
        type !== 'wood_beam'
          ? ({ id: excludedPieceId || 'ghost', type, position: bestPos, rotation: bestRot, isPrebuilt: false } as PlacedPiece)
          : targetBlock;
      const foundationClass = classifySupportFoundation(
        supportBlockPiece,
        'STRUCTURAL_JOINT',
        validPieces,
        anchors,
        options?.existingJoints ?? [],
        [excludedPieceId || 'ghost'],
      );
      if (foundationClass === 'FREE_STANDING_LOOSE_BLOCK' && !roofAssemblyPreview) {
        playerFriendlyRejectionMessage = 'Rafter connected; support block may tip.';
      } else if (supportBlockPiece && isStoneMaterial(supportBlockPiece.type)) {
        playerFriendlyRejectionMessage = 'Corner Joint — rafter bound to stone block corner.';
      } else {
        playerFriendlyRejectionMessage = 'Corner Joint — rafter seated on wooden block corner.';
      }
    } else if (proposedTimberJoint.jointType === 'CORNER_BINDING') {
      playerFriendlyRejectionMessage = 'Corner Binding — block corners bound.';
    } else if (proposedTimberJoint.jointType === 'BLOCK_BINDING') {
      playerFriendlyRejectionMessage = 'Block Binding — flush masonry/block connection ready.';
    } else if (proposedTimberJoint.jointType === 'DIAGONAL_BRACE') {
      playerFriendlyRejectionMessage =
        proposedTimberJoints.length >= 2
          ? 'Diagonal Brace — connected at both ends.'
          : 'Diagonal Brace connection ready.';
    } else if (proposedTimberJoint.jointType === 'TIMBER_FACE') {
      playerFriendlyRejectionMessage = 'Timber Face Joint — flush connection ready.';
    } else if (proposedTimberJoint.jointType === 'TIMBER_T_JOINT') {
      playerFriendlyRejectionMessage = 'T-Joint connection ready.';
    } else {
      playerFriendlyRejectionMessage = 'Timber Splice connection ready.';
    }
  } else if (isValid && isCornerSupportedContact && !playerFriendlyRejectionMessage) {
    playerFriendlyRejectionMessage = 'Corner Supported — rafter seated on stone corner.';
  }

  const positionCorrectionVector = Vec2.sub(bestPos, rawPos);
  const closureClassification: ClosureClassification | null = !isValid
    ? 'INVALID'
    : roofAssemblyPreview?.closureClassification ??
      candidateRankingBreakdown?.closureClassification ??
      (snapped
        ? classifyArchitecturalClosure({
            positionMismatchPx: Vec2.length(positionCorrectionVector),
            seamGapPx: seamSeparation ?? 0,
            balancedCorrectionPx: partnerPieceAdjustment
              ? Vec2.length(partnerPieceAdjustment.correctionVector)
              : 0,
            committedPieceAdjustmentPx: partnerPieceAdjustment
              ? Vec2.length(partnerPieceAdjustment.correctionVector)
              : 0,
            hasColliderPenetration: !isValid,
          })
        : null);

  const visualConnectionState: VisualConnectionState | null = !isValid
    ? null
    : attachedAnchorId || proposedTimberJoint
      ? 'CANDIDATE_PREVIEW'
      : isCornerSupportedContact || supportedContactPredicted
        ? 'SUPPORTED_CONTACT'
        : snapped
          ? 'POSITIONAL_ALIGNMENT'
          : null;

  const visualJointCapType: VisualJointCapType = getVisualJointCapType(
    proposedTimberJoint?.jointType,
    connectionTaxonomy,
    proposedTimberJoint?.materialPairKey,
  );

  const playerFacingConnectionLabel: string | null = !isValid
    ? null
    : attachedAnchorId
      ? 'Anchor available'
      : proposedTimberJoint?.playerFacingConnectionLabel ??
        (isCornerSupportedContact
          ? 'Corner Supported'
          : supportedContactPredicted
            ? 'Supported'
            : snapped
              ? 'Aligned'
              : null);

  const canonicalRelationship: CanonicalRelationshipDescription | null =
    proposedTimberJoint?.canonicalRelationship ?? null;

  return {
    position: bestPos,
    rotation: bestRot,
    snapped,
    socket: bestSocket,
    pieceSocket: bestPieceSocket,
    isValid,
    attachedAnchorId,
    overlappingPieceId,
    proposedRotation,
    requiresRotationChange,
    isAnchorRequired,
    snapPositionAccepted: snapped,
    snapRotationAccepted: Boolean(options?.acceptSnapRotation),
    lastSnapRejectionReason,
    playerFriendlyRejectionMessage,
    activePieceSocketId: bestPieceSocket?.id ?? null,
    activeTargetSocketId: bestSocket?.id ?? null,
    socketCompatibility,
    candidateWorldDistance,
    candidateDistance: candidateWorldDistance,
    candidateLockActive,
    candidateLockReleaseRadius: CANDIDATE_LOCK_RELEASE_RADIUS,
    positionCorrectionVector,
    explicitJointProposed: Boolean(attachedAnchorId || proposedTimberJoint),
    proposedTimberJoint: isValid && snappingEnabled ? proposedTimberJoint : null,
    proposedTimberJoints: isValid && snappingEnabled ? proposedTimberJoints : [],
    preservedJoints,
    removedJoints,
    lowerSupportsDetected,
    connectionTaxonomy,
    connectionCategory,
    overlapClassification,
    supportedContactPredicted,
    placementRejectionReason: lastSnapRejectionReason,
    overlapColliderId,
    penetrationDepth: Number(maxPenetrationDepth.toFixed(2)),
    candidateCycleIndex,
    candidateCycleCount,
    availableCandidateLabels,
    currentCandidateLabel,
    balancedAdjustmentActive,
    partnerPieceAdjustment,
    partnerPieceAdjustments,
    roofSupportSummary,
    peakSymmetryDiagnostics,
    sourceFeatureType,
    sourceFeatureId,
    targetFeatureType,
    targetFeatureId,
    seamSeparation,
    candidateRankingBreakdown,
    closureClassification,
    canonicalRelationship,
    roofAssemblyPreview,
    visualConnectionState,
    visualJointCapType,
    playerFacingConnectionLabel,
    freeAdjustActive,
    fineAdjustmentOffsetPx,
  };
}

/**
 * Evaluates which existing joints remain compatible, which become obsolete/removed,
 * and which new joints are formed when an already-placed piece is rotated or moved.
 */
export function evaluateJointsForPieceTransform(
  pieceId: string,
  pieceType: MaterialType,
  position: Vector2,
  rotation: number,
  allPieces: PlacedPiece[],
  existingJoints: TimberJoint[],
  snappingEnabled = true,
): {
  preservedJoints: TimberJoint[];
  removedJoints: TimberJoint[];
  newlyProposedJoints: ProposedTimberJoint[];
} {
  const selfPiece = allPieces.find((p) => p.id === pieceId);
  const selfIsPrebuilt = Boolean(selfPiece?.isPrebuilt);
  const validPieces = allPieces.filter(
    (p) => p.id !== pieceId && p.condition !== 'LOST' && p.condition !== 'BROKEN',
  );
  const pieceJoints = existingJoints.filter(
    (j) => j.state !== 'BROKEN' && (j.pieceAId === pieceId || j.pieceBId === pieceId),
  );
  const mySockets = getPieceSnapSocketsForTransform(pieceType, position, rotation, pieceId);
  const myCorners = getPieceCornersForTransform(pieceType, position, rotation);
  const preservedJoints: TimberJoint[] = [];
  const removedJoints: TimberJoint[] = [];
  const newlyProposedJoints: ProposedTimberJoint[] = [];

  for (const joint of pieceJoints) {
    const isPieceA = joint.pieceAId === pieceId;
    const partnerId = isPieceA ? joint.pieceBId : joint.pieceAId;
    const partnerPiece = validPieces.find((p) => p.id === partnerId);
    if (!partnerPiece) {
      removedJoints.push(joint);
      continue;
    }

    // Phase B2.2: broad-face seams are continuous finite-face relationships,
    // not discrete socket-center relationships. Re-evaluate the finalized
    // transform in place and preserve the original joint identity when valid.
    if (isBroadFaceTimberJoint(joint)) {
      const broadFace = solveBroadFaceOverlap(
        pieceType,
        position,
        rotation,
        partnerPiece,
        pieceId,
        {
          inPlace: true,
          maxNormalDistancePx: FINALIZED_BROAD_FACE_NORMAL_DISTANCE_PX,
          minOverlapPx: MIN_BROAD_FACE_OVERLAP_PX,
          dragIsPrebuilt: selfIsPrebuilt,
        },
      );
      if (!broadFace?.valid) {
        removedJoints.push(joint);
        continue;
      }

      const posA = isPieceA ? position : partnerPiece.position;
      const rotA = isPieceA ? rotation : partnerPiece.rotation;
      const posB = isPieceA ? partnerPiece.position : position;
      const rotB = isPieceA ? partnerPiece.rotation : rotation;
      const seamWorld = broadFace.worldContactPoint;
      const localAnchorA = Vec2.rotate(Vec2.sub(seamWorld, posA), -rotA);
      const localAnchorB = Vec2.rotate(Vec2.sub(seamWorld, posB), -rotB);

      preservedJoints.push({
        ...joint,
        connectionSubtype: broadFace.connectionSubtype,
        materialPairKey: broadFace.materialPairKey,
        strengthProfile: broadFace.strengthProfile,
        complianceProfile: broadFace.strengthProfile,
        localAnchorA: {
          x: Number(localAnchorA.x.toFixed(3)),
          y: Number(localAnchorA.y.toFixed(3)),
        },
        localAnchorB: {
          x: Number(localAnchorB.x.toFixed(3)),
          y: Number(localAnchorB.y.toFixed(3)),
        },
        worldPosition: {
          x: Number(seamWorld.x.toFixed(3)),
          y: Number(seamWorld.y.toFixed(3)),
        },
        restAngle: Number(shortestSignedAngleDelta(rotA, rotB).toFixed(4)),
        restSeparation: 0,
        sourceFaceId: isPieceA ? broadFace.sourceFaceId : broadFace.targetFaceId,
        targetFaceId: isPieceA ? broadFace.targetFaceId : broadFace.sourceFaceId,
        canonicalRelationship: buildCanonicalRelationship({
          pieceAId: joint.pieceAId,
          pieceAType: isPieceA ? pieceType : partnerPiece.type,
          pieceAPos: posA,
          pieceARot: rotA,
          featureAId: isPieceA ? broadFace.sourceFaceId : broadFace.targetFaceId,
          pieceBId: joint.pieceBId,
          pieceBType: isPieceA ? partnerPiece.type : pieceType,
          pieceBPos: posB,
          pieceBRot: rotB,
          featureBId: isPieceA ? broadFace.targetFaceId : broadFace.sourceFaceId,
          connectionTaxonomy: broadFace.taxonomy,
          jointProfileId: broadFace.strengthProfile,
        }),
        closureClassification: classifyArchitecturalClosure({
          positionMismatchPx: 0,
          seamGapPx: broadFace.seamSeparation,
          hasColliderPenetration: false,
        }),
        visualJointCapType: getVisualJointCapType(
          'TIMBER_FACE',
          broadFace.taxonomy,
          broadFace.materialPairKey,
        ),
        initialPositionalErrorPx: 0,
        initialAngularErrorRad: 0,
        initialConstraintEnergy: 0,
      });
      continue;
    }

    const mySockId = isPieceA ? joint.socketAId : joint.socketBId;
    const partnerSockId = isPieceA ? joint.socketBId : joint.socketAId;
    const partnerSockets = getPieceSnapSockets(partnerPiece);
    const mySock = mySockets.find(
      (s) => s.id === mySockId || Boolean(s.localName && mySockId.endsWith('_' + s.localName)),
    );
    const pSock = partnerSockets.find(
      (s) =>
        s.id === partnerSockId ||
        Boolean(s.localName && partnerSockId.endsWith('_' + s.localName)),
    );
    let sockDist =
      mySock && pSock ? Vec2.distance(mySock.worldPos, pSock.worldPos) : Infinity;
    if (
      mySock &&
      pSock &&
      (mySock.socketKind === 'block_corner' || pSock.socketKind === 'block_corner')
    ) {
      const partnerCorners = getPieceCorners(partnerPiece);
      for (const mc of myCorners) {
        const d1 = Vec2.distance(mc.worldPos, pSock.worldPos);
        if (d1 < sockDist) sockDist = d1;
      }
      for (const pc of partnerCorners) {
        const d2 = Vec2.distance(mySock.worldPos, pc.worldPos);
        if (d2 < sockDist) sockDist = d2;
      }
    }

    const compat =
      mySock && pSock
        ? evaluateSocketCompatibility(mySock, pSock, pieceType, partnerPiece.type)
        : null;
    const isFolded =
      mySock &&
      pSock &&
      mySock.socketKind === 'beam_end' &&
      pSock.socketKind === 'beam_end' &&
      Vec2.dot(Vec2.scale(mySock.normal, -1), Vec2.scale(pSock.normal, -1)) >
        TIMBER_JOINT_CONFIG.minFoldedBodyCosine;

    if (
      mySock &&
      pSock &&
      compat?.isTimberJointEligible &&
      !isFolded &&
      sockDist <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 2.5
    ) {
      const classified = classifyTimberJointConnection(
        pieceType,
        rotation,
        mySock,
        partnerPiece,
        pSock,
        false,
        selfIsPrebuilt,
      );
      const seamWorld =
        mySock.socketKind === 'block_corner'
          ? { ...mySock.worldPos }
          : pSock.socketKind === 'block_corner'
            ? { ...pSock.worldPos }
            : Vec2.scale(Vec2.add(mySock.worldPos, pSock.worldPos), 0.5);
      const posA = isPieceA ? position : partnerPiece.position;
      const rotA = isPieceA ? rotation : partnerPiece.rotation;
      const posB = isPieceA ? partnerPiece.position : position;
      const rotB = isPieceA ? partnerPiece.rotation : rotation;
      const localAnchorA = Vec2.rotate(Vec2.sub(seamWorld, posA), -rotA);
      const localAnchorB = Vec2.rotate(Vec2.sub(seamWorld, posB), -rotB);

      preservedJoints.push({
        ...joint,
        jointType: classified.jointType,
        strengthProfile: classified.strengthProfile,
        connectionSubtype: classified.connectionSubtype,
        materialPairKey: classified.materialPairKey,
        complianceProfile: classified.strengthProfile,
        localAnchorA: {
          x: Number(localAnchorA.x.toFixed(3)),
          y: Number(localAnchorA.y.toFixed(3)),
        },
        localAnchorB: {
          x: Number(localAnchorB.x.toFixed(3)),
          y: Number(localAnchorB.y.toFixed(3)),
        },
        worldPosition: {
          x: Number(seamWorld.x.toFixed(3)),
          y: Number(seamWorld.y.toFixed(3)),
        },
        restAngle: Number(
          (isPieceA
            ? shortestSignedAngleDelta(rotation, partnerPiece.rotation)
            : shortestSignedAngleDelta(partnerPiece.rotation, rotation)
          ).toFixed(4),
        ),
        restSeparation: 0,
        visualJointCapType: getVisualJointCapType(
          classified.jointType,
          classified.taxonomy,
          classified.materialPairKey,
        ),
      });
    } else {
      removedJoints.push(joint);
    }
  }

  if (snappingEnabled) {
    for (const mySock of mySockets) {
      if (mySock.socketKind === 'center' || mySock.socketKind === 'beam_corner') continue;
      if (
        pieceType === 'wood_beam' &&
        mySock.socketKind !== 'beam_end' &&
        mySock.socketKind !== 'beam_side'
      ) {
        continue;
      }

      const alreadyPreserved = preservedJoints.some((j) => {
        const sid = j.pieceAId === pieceId ? j.socketAId : j.socketBId;
        return sid === mySock.id || (mySock.localName && sid.endsWith(mySock.localName));
      });
      if (alreadyPreserved) continue;

      for (const other of validPieces) {
        const otherSockets = getPieceSnapSockets(other);
        const otherCorners = getPieceCorners(other);
        for (const tSock of otherSockets) {
          if (tSock.socketKind === 'center' || tSock.socketKind === 'beam_corner') continue;
          const compat = evaluateSocketCompatibility(mySock, tSock, pieceType, other.type);
          if (!compat.isTimberJointEligible) continue;
          let dist = Vec2.distance(mySock.worldPos, tSock.worldPos);
          if (tSock.socketKind === 'block_corner') {
            for (const mc of myCorners) {
              const cd = Vec2.distance(mc.worldPos, tSock.worldPos);
              if (cd < dist) dist = cd;
            }
          } else if (mySock.socketKind === 'block_corner') {
            for (const oc of otherCorners) {
              const cd = Vec2.distance(mySock.worldPos, oc.worldPos);
              if (cd < dist) dist = cd;
            }
          }
          if (dist <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 2.0) {
            const classified = classifyTimberJointConnection(
              pieceType,
              rotation,
              mySock,
              other,
              tSock,
              false,
              selfIsPrebuilt,
            );
            const seamWorld =
              mySock.socketKind === 'block_corner'
                ? { ...mySock.worldPos }
                : tSock.socketKind === 'block_corner'
                  ? { ...tSock.worldPos }
                  : Vec2.scale(Vec2.add(mySock.worldPos, tSock.worldPos), 0.5);
            const localAnchorA = Vec2.rotate(Vec2.sub(seamWorld, position), -rotation);
            const localAnchorB = Vec2.rotate(Vec2.sub(seamWorld, other.position), -other.rotation);
            newlyProposedJoints.push({
              targetPieceId: other.id,
              sourceSocketId: mySock.id,
              targetSocketId: tSock.id,
              sourceSocketName: mySock.localName || mySock.id,
              targetSocketName: tSock.localName || tSock.id,
              localAnchorA: {
                x: Number(localAnchorA.x.toFixed(3)),
                y: Number(localAnchorA.y.toFixed(3)),
              },
              localAnchorB: {
                x: Number(localAnchorB.x.toFixed(3)),
                y: Number(localAnchorB.y.toFixed(3)),
              },
              worldPosition: {
                x: Number(seamWorld.x.toFixed(3)),
                y: Number(seamWorld.y.toFixed(3)),
              },
              jointType: classified.jointType,
              restAngle: Number(shortestSignedAngleDelta(rotation, other.rotation).toFixed(4)),
              restSeparation: 0,
              seamSeparation: Number(dist.toFixed(2)),
              strengthProfile: classified.strengthProfile,
              connectionTaxonomy: classified.taxonomy,
              connectionSubtype: classified.connectionSubtype,
              materialA: pieceType,
              materialB: other.type,
              materialPairKey: classified.materialPairKey,
              complianceProfile: classified.strengthProfile,
              isPrebuiltBinding: Boolean(selfIsPrebuilt || other.isPrebuilt),
              creationReason: 'SNAP_COMMIT',
              sourceFaceId: classified.sourceFaceId,
              targetFaceId: classified.targetFaceId,
              sourceCornerId: classified.sourceCornerId,
              targetCornerId: classified.targetCornerId,
              visualJointCapType: getVisualJointCapType(
                classified.jointType,
                classified.taxonomy,
                classified.materialPairKey,
              ),
            });
            break;
          }
        }
      }
    }
  }

  if (snappingEnabled) {
    const brokenBroadFaceKeys = new Set(
      existingJoints
        .filter(
          (joint) =>
            joint.state === 'BROKEN' &&
            isBroadFaceTimberJoint(joint) &&
            (joint.pieceAId === pieceId || joint.pieceBId === pieceId),
        )
        .map((joint) => getBroadFaceRelationshipKey(joint.pieceAId, joint.pieceBId)),
    );
    const broadFaceProposals = discoverSecondaryBroadFaceSeams({
      activePieceId: pieceId,
      activeType: pieceType,
      finalizedPos: position,
      finalizedRot: rotation,
      activeIsPrebuilt: selfIsPrebuilt,
      validPieces,
      proposedTimberJoints: newlyProposedJoints,
      preservedJoints,
    }).filter(
      (proposal) =>
        !brokenBroadFaceKeys.has(
          getBroadFaceRelationshipKey(pieceId, proposal.targetPieceId),
        ),
    );
    newlyProposedJoints.push(...broadFaceProposals);
  }

  return { preservedJoints, removedJoints, newlyProposedJoints };
}

/**
 * Atomic Rotation Validation Transaction:
 * Validates a proposed rotation for an already-placed construction piece against:
 * 1. Explicit environmental anchor compatibility (attachedAnchorId)
 *    Note: Timber Joints do NOT block rotation! Incompatible timber joints are automatically
 *    replaced or removed during the atomic rotation transaction.
 * 2. Ground / terrain overlap
 * 3. Build-zone / world boundaries
 * 4. Active placed wisps (where wisp.placed === true && !wisp.isDispersed)
 * 5. Other active construction pieces (player-placed, prebuilt movable, prebuilt fixed)
 * 6. Intermediate swept angular path (5° steps) to prevent long beams from tunneling through solid colliders
 */
export function validatePieceRotationTransaction(
  piece: PlacedPiece,
  proposedAngle: number,
  allPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  wisps?: WispEntity[],
  _activeJoints?: TimberJoint[],
): RotationValidationDiagnostics {
  const currentAngle = piece.rotation;
  const config = MATERIAL_CONFIGS[piece.type];
  const validPieces = allPieces.filter(
    (p) =>
      p.id !== piece.id &&
      p.condition !== 'LOST' &&
      p.position.y < WORLD_CONFIG.lossBoundaryY,
  );
  const effectiveWisps = (wisps ?? []).filter(
    (w) => w.placed === true && !w.isDispersed,
  );

  // 1. Explicit environmental anchor compatibility check
  if (piece.attachedAnchorId) {
    const twoPi = Math.PI * 2;
    let norm = proposedAngle % twoPi;
    if (norm < 0) norm += twoPi;
    const quarterPi = Math.PI / 2;
    const distToCardinal = Math.abs(norm - Math.round(norm / quarterPi) * quarterPi);
    if (distToCardinal > 0.08) {
      return {
        selectedPieceId: piece.id,
        currentCommittedAngle: currentAngle,
        proposedAngle,
        rotationFinalOverlapCount: 0,
        rotationSweepOverlapCount: 0,
        conflictingColliderId: piece.attachedAnchorId,
        penetrationDepth: 0,
        connectionIncompatibility: true,
        rotationAccepted: false,
        lastRejectionReason: 'CONNECTION_INCOMPATIBLE',
        playerFriendlyMessage: 'Detach this connection before rotating.',
        timestamp: Date.now(),
      };
    }
  }

  const bZone = WORLD_CONFIG.buildZone;

  const connectedPartnerIds = new Set(
    (_activeJoints ?? [])
      .filter((j) => j.state !== 'BROKEN' && (j.pieceAId === piece.id || j.pieceBId === piece.id))
      .map((j) => (j.pieceAId === piece.id ? j.pieceBId : j.pieceAId)),
  );

  const evaluateAngleCollider = (
    angleRad: number,
    isSweepStep = false,
  ): {
    valid: boolean;
    reason: RotationRejectionReason;
    friendlyMessage: string | null;
    colliderId: string | null;
    depth: number;
    overlapCount: number;
  } => {
    const obb = createOBB(piece.position, config.width, config.height, angleRad);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of obb.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }

    // Ground / terrain check (allow 2.5px flush contact tolerance on groundY = 780)
    if (maxY > WORLD_CONFIG.groundY + 2.5) {
      const pen = maxY - WORLD_CONFIG.groundY;
      return {
        valid: false,
        reason: 'TERRAIN_OVERLAP',
        friendlyMessage: 'Rotation blocked by terrain.',
        colliderId: 'ground_bedrock',
        depth: Number(pen.toFixed(2)),
        overlapCount: 1,
      };
    }

    // Build-zone / world boundary check
    if (
      minX < bZone.minX - 40 ||
      maxX > bZone.maxX + 40 ||
      minY < bZone.minY - 40 ||
      maxY > WORLD_CONFIG.groundY + 25
    ) {
      return {
        valid: false,
        reason: 'OUT_OF_BOUNDS',
        friendlyMessage: 'Rotation blocked by terrain.',
        colliderId: 'world_build_zone',
        depth: Number(
          Math.max(
            0,
            bZone.minX - 40 - minX,
            maxX - (bZone.maxX + 40),
            bZone.minY - 40 - minY,
          ).toFixed(2),
        ),
        overlapCount: 1,
      };
    }

    // Placed wisp clearance check (only wisps where placed === true)
    if (effectiveWisps.length > 0) {
      const wispCheck = checkPieceOverlapsWisps(obb, effectiveWisps);
      if (wispCheck.overlaps) {
        return {
          valid: false,
          reason: 'WISP_OVERLAP',
          friendlyMessage: 'Keep this space clear for the wisps.',
          colliderId: wispCheck.wispId,
          depth: Number(wispCheck.penetrationDepth.toFixed(2)),
          overlapCount: 1,
        };
      }
    }

    // Active piece OBB overlap check (tolerance = 2.5px so flush edge contact is preserved;
    // during intermediate sweep, allow endpoint corner clearance of 14px for existing joint partners)
    let pieceOverlaps = 0;
    let firstColliderId: string | null = null;
    let maxDepth = 0;
    for (const other of validPieces) {
      const oCfg = MATERIAL_CONFIGS[other.type];
      const otherOBB = createOBB(other.position, oCfg.width, oCfg.height, other.rotation);
      const slop = isSweepStep && connectedPartnerIds.has(other.id) ? 14.0 : 2.5;
      const depth = getOBBPenetrationDepth(obb, otherOBB, slop);
      if (depth > 0) {
        pieceOverlaps++;
        if (!firstColliderId) firstColliderId = other.id;
        if (depth > maxDepth) maxDepth = depth;
      }
    }

    if (pieceOverlaps > 0) {
      return {
        valid: false,
        reason: 'PIECE_OVERLAP',
        friendlyMessage: 'Rotation blocked by another piece.',
        colliderId: firstColliderId,
        depth: Number(maxDepth.toFixed(2)),
        overlapCount: pieceOverlaps,
      };
    }

    return {
      valid: true,
      reason: 'VALID',
      friendlyMessage: null,
      colliderId: null,
      depth: 0,
      overlapCount: 0,
    };
  };

  // 2. Evaluate final proposed angle first
  const finalCheck = evaluateAngleCollider(proposedAngle, false);

  // 3. Evaluate swept intermediate angular path (5° steps) to prevent tunneling
  const deltaRad = shortestSignedAngleDelta(currentAngle, proposedAngle);
  const stepRad = (5 * Math.PI) / 180; // 5 degrees
  const numSteps = Math.max(1, Math.ceil(Math.abs(deltaRad) / stepRad));

  let sweepOverlapCount = 0;
  let firstSweepFailure: ReturnType<typeof evaluateAngleCollider> | null = null;

  for (let i = 1; i < numSteps; i++) {
    const t = i / numSteps;
    const intermediateAngle = currentAngle + deltaRad * t;
    const stepCheck = evaluateAngleCollider(intermediateAngle, true);
    if (!stepCheck.valid) {
      sweepOverlapCount += stepCheck.overlapCount;
      if (!firstSweepFailure) {
        firstSweepFailure = stepCheck;
      }
    }
  }

  if (!finalCheck.valid) {
    return {
      selectedPieceId: piece.id,
      currentCommittedAngle: currentAngle,
      proposedAngle,
      rotationFinalOverlapCount: finalCheck.overlapCount,
      rotationSweepOverlapCount: sweepOverlapCount,
      conflictingColliderId: finalCheck.colliderId,
      penetrationDepth: finalCheck.depth,
      connectionIncompatibility: false,
      rotationAccepted: false,
      lastRejectionReason: finalCheck.reason,
      playerFriendlyMessage: finalCheck.friendlyMessage,
      timestamp: Date.now(),
    };
  }

  if (firstSweepFailure) {
    return {
      selectedPieceId: piece.id,
      currentCommittedAngle: currentAngle,
      proposedAngle,
      rotationFinalOverlapCount: 0,
      rotationSweepOverlapCount: sweepOverlapCount,
      conflictingColliderId: firstSweepFailure.colliderId,
      penetrationDepth: firstSweepFailure.depth,
      connectionIncompatibility: false,
      rotationAccepted: false,
      lastRejectionReason: 'SWEEP_COLLISION',
      playerFriendlyMessage:
        firstSweepFailure.reason === 'WISP_OVERLAP'
          ? 'Keep this space clear for the wisps.'
          : firstSweepFailure.reason === 'TERRAIN_OVERLAP' ||
              firstSweepFailure.reason === 'OUT_OF_BOUNDS'
            ? 'Rotation blocked by terrain.'
            : 'Rotation blocked by another piece.',
      timestamp: Date.now(),
    };
  }

  return {
    selectedPieceId: piece.id,
    currentCommittedAngle: currentAngle,
    proposedAngle,
    rotationFinalOverlapCount: 0,
    rotationSweepOverlapCount: 0,
    conflictingColliderId: null,
    penetrationDepth: 0,
    connectionIncompatibility: false,
    rotationAccepted: true,
    lastRejectionReason: 'VALID',
    playerFriendlyMessage: null,
    timestamp: Date.now(),
  };
}

export const MANUAL_BIND_TOLERANCE_PX = 18.0;

/**
 * Finds all valid, overlap-free construction binding candidates within MANUAL_BIND_TOLERANCE_PX (<= 18px)
 * for an already-placed piece (for example, placed while Snap was disabled).
 * Allows the player to explicitly bind a free-placed piece via the contextual "Bind Connection" action.
 */
export function findManualBindCandidatesForPiece(
  piece: PlacedPiece,
  allPieces: PlacedPiece[],
  existingJoints: TimberJoint[],
): ProposedTimberJoint[] {
  if (!PIECE_DEFINITIONS[piece.type]?.jointCapable) return [];
  if (piece.condition === 'LOST' || piece.condition === 'BROKEN') return [];

  const myCfg = MATERIAL_CONFIGS[piece.type];
  const myOBB = createOBB(piece.position, myCfg.width, myCfg.height, piece.rotation);
  const mySockets = getPieceSnapSockets(piece);
  const myCorners = getPieceCorners(piece);
  const activeJoints = existingJoints.filter(
    (j) => j.state !== 'BROKEN' && (j.pieceAId === piece.id || j.pieceBId === piece.id),
  );
  const validPieces = allPieces.filter(
    (p) =>
      p.id !== piece.id &&
      p.condition !== 'LOST' &&
      p.condition !== 'BROKEN' &&
      PIECE_DEFINITIONS[p.type]?.jointCapable,
  );

  const candidates: ProposedTimberJoint[] = [];
  const seenKeys = new Set<string>();

  for (const other of validPieces) {
    const oCfg = MATERIAL_CONFIGS[other.type];
    const otherOBB = createOBB(other.position, oCfg.width, oCfg.height, other.rotation);
    // Reject if the two pieces have true interior body overlap (> 2.5px penetration)
    if (getOBBPenetrationDepth(myOBB, otherOBB, 2.5) > 0) {
      continue;
    }

    const otherSockets = getPieceSnapSockets(other);
    const otherCorners = getPieceCorners(other);

    if ((piece.type === 'wood_beam') !== (other.type === 'wood_beam')) {
      const endpoint = solveContinuousEndpointFaceSeat(
        piece.type, piece.position, piece.rotation, other, piece.id,
        { maxNormalDistancePx: MANUAL_BIND_TOLERANCE_PX, inPlace: true, dragIsPrebuilt: Boolean(piece.isPrebuilt) },
      );
      if (endpoint?.valid) {
        const key = `${other.id}:ENDPOINT_FACE:${endpoint.sourceFaceId}:${endpoint.targetFaceId}`;
        const alreadyBound = activeJoints.some((j) => {
          const partner = j.pieceAId === piece.id ? j.pieceBId : j.pieceAId;
          return partner === other.id && j.state !== 'BROKEN';
        });
        if (!alreadyBound && !seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({
            targetPieceId: other.id,
            sourceSocketId: endpoint.sourceSocketId, targetSocketId: endpoint.targetSocketId,
            sourceSocketName: endpoint.sourceSocketName, targetSocketName: endpoint.targetSocketName,
            localAnchorA: endpoint.localAnchorA, localAnchorB: endpoint.localAnchorB,
            worldPosition: endpoint.worldContactPoint, jointType: 'TIMBER_FACE',
            restAngle: endpoint.restAngle, restSeparation: 0, seamSeparation: 0,
            strengthProfile: endpoint.strengthProfile, connectionTaxonomy: endpoint.taxonomy,
            connectionSubtype: endpoint.connectionSubtype, materialA: piece.type, materialB: other.type,
            materialPairKey: endpoint.materialPairKey, complianceProfile: endpoint.strengthProfile,
            isPrebuiltBinding: Boolean(piece.isPrebuilt || other.isPrebuilt), creationReason: 'MANUAL_BIND_ACTION',
            sourceFaceId: endpoint.sourceFaceId, targetFaceId: endpoint.targetFaceId,
            sourceCornerId: null, targetCornerId: null,
            sourceFeatureType: piece.type === 'wood_beam' ? 'socket' : 'face',
            targetFeatureType: other.type === 'wood_beam' ? 'socket' : 'face',
            sourceFaceNormal: endpoint.sourceFaceNormal, targetFaceNormal: endpoint.targetFaceNormal,
            visualConnectionState: 'CANDIDATE_PREVIEW',
            visualJointCapType: getVisualJointCapType('TIMBER_FACE', endpoint.taxonomy, endpoint.materialPairKey),
            playerFacingConnectionLabel: 'Bind endpoint face joint',
          });
        }
      }

      const broad = solveBroadFaceOverlap(
        piece.type, piece.position, piece.rotation, other, piece.id,
        { maxNormalDistancePx: MANUAL_BIND_TOLERANCE_PX, minOverlapPx: MIN_BROAD_FACE_OVERLAP_PX, inPlace: true, dragIsPrebuilt: Boolean(piece.isPrebuilt) },
      );
      if (broad?.valid) {
        const key = `${other.id}:TIMBER_FACE:${broad.sourceFaceId}:${broad.targetFaceId}`;
        const alreadyBound = activeJoints.some((j) => {
          const partner = j.pieceAId === piece.id ? j.pieceBId : j.pieceAId;
          return partner === other.id && j.jointType === 'TIMBER_FACE' && j.state !== 'BROKEN';
        });
        if (!alreadyBound && !seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({
            targetPieceId: other.id,
            sourceSocketId: broad.sourceSocketId, targetSocketId: broad.targetSocketId,
            sourceSocketName: broad.sourceSocketName, targetSocketName: broad.targetSocketName,
            localAnchorA: broad.localAnchorA, localAnchorB: broad.localAnchorB,
            worldPosition: broad.worldContactPoint, jointType: 'TIMBER_FACE',
            restAngle: broad.restAngle, restSeparation: 0, seamSeparation: broad.seamSeparation,
            strengthProfile: broad.strengthProfile, connectionTaxonomy: broad.taxonomy,
            connectionSubtype: broad.connectionSubtype, materialA: piece.type, materialB: other.type,
            materialPairKey: broad.materialPairKey, complianceProfile: broad.strengthProfile,
            isPrebuiltBinding: Boolean(piece.isPrebuilt || other.isPrebuilt), creationReason: 'MANUAL_BIND_ACTION',
            sourceFaceId: broad.sourceFaceId, targetFaceId: broad.targetFaceId,
            sourceCornerId: null, targetCornerId: null,
            sourceFeatureType: 'face', targetFeatureType: 'face',
            sourceFaceNormal: broad.sourceFaceNormal, targetFaceNormal: broad.targetFaceNormal,
            visualConnectionState: 'CANDIDATE_PREVIEW',
            visualJointCapType: getVisualJointCapType('TIMBER_FACE', broad.taxonomy, broad.materialPairKey),
            playerFacingConnectionLabel: 'Bind face binding',
          });
        }
      }
    }

    for (const mySock of mySockets) {
      if (mySock.socketKind === 'center' || mySock.socketKind === 'beam_corner') continue;

      for (const tSock of otherSockets) {
        if (tSock.socketKind === 'center' || tSock.socketKind === 'beam_corner') continue;

        // Check if this specific socket pair is already bound
        const alreadyBound = activeJoints.some((j) => {
          const partnerId = j.pieceAId === piece.id ? j.pieceBId : j.pieceAId;
          if (partnerId !== other.id) return false;
          const sidA = j.pieceAId === piece.id ? j.socketAId : j.socketBId;
          const sidB = j.pieceAId === piece.id ? j.socketBId : j.socketAId;
          const matchMy =
            sidA === mySock.id || Boolean(mySock.localName && sidA.endsWith('_' + mySock.localName));
          const matchOther =
            sidB === tSock.id || Boolean(tSock.localName && sidB.endsWith('_' + tSock.localName));
          return matchMy && matchOther;
        });
        if (alreadyBound) continue;

        const compat = evaluateSocketCompatibility(mySock, tSock, piece.type, other.type);
        if (!compat.isTimberJointEligible) continue;

        let dist = Vec2.distance(mySock.worldPos, tSock.worldPos);
        let matchedMyCornerId: PieceCornerId | null = null;
        let matchedOtherCornerId: PieceCornerId | null = null;

        if (tSock.socketKind === 'block_corner') {
          for (const mc of myCorners) {
            const cd = Vec2.distance(mc.worldPos, tSock.worldPos);
            if (cd < dist) {
              dist = cd;
              matchedMyCornerId = mc.id;
            }
          }
        } else if (mySock.socketKind === 'block_corner') {
          for (const oc of otherCorners) {
            const cd = Vec2.distance(mySock.worldPos, oc.worldPos);
            if (cd < dist) {
              dist = cd;
              matchedOtherCornerId = oc.id;
            }
          }
        }

        if (dist <= MANUAL_BIND_TOLERANCE_PX) {
          const classified = classifyTimberJointConnection(
            piece.type,
            piece.rotation,
            mySock,
            other,
            tSock,
            false,
            Boolean(piece.isPrebuilt),
          );
          const seamWorld =
            mySock.socketKind === 'block_corner'
              ? { ...mySock.worldPos }
              : tSock.socketKind === 'block_corner'
                ? { ...tSock.worldPos }
                : Vec2.scale(Vec2.add(mySock.worldPos, tSock.worldPos), 0.5);
          const localAnchorA = Vec2.rotate(Vec2.sub(seamWorld, piece.position), -piece.rotation);
          const localAnchorB = Vec2.rotate(Vec2.sub(seamWorld, other.position), -other.rotation);
          const srcName = mySock.localName || mySock.id;
          const tgtName = tSock.localName || tSock.id;
          const dedupKey = `${other.id}:${classified.jointType}:${srcName}:${tgtName}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          candidates.push({
            targetPieceId: other.id,
            sourceSocketId: mySock.id,
            targetSocketId: tSock.id,
            sourceSocketName: srcName,
            targetSocketName: tgtName,
            localAnchorA: {
              x: Number(localAnchorA.x.toFixed(3)),
              y: Number(localAnchorA.y.toFixed(3)),
            },
            localAnchorB: {
              x: Number(localAnchorB.x.toFixed(3)),
              y: Number(localAnchorB.y.toFixed(3)),
            },
            worldPosition: {
              x: Number(seamWorld.x.toFixed(3)),
              y: Number(seamWorld.y.toFixed(3)),
            },
            jointType: classified.jointType,
            restAngle: Number(shortestSignedAngleDelta(piece.rotation, other.rotation).toFixed(4)),
            restSeparation: 0,
            seamSeparation: Number(dist.toFixed(2)),
            strengthProfile: classified.strengthProfile,
            connectionTaxonomy: classified.taxonomy,
            connectionSubtype: classified.connectionSubtype,
            materialA: piece.type,
            materialB: other.type,
            materialPairKey: classified.materialPairKey,
            complianceProfile: classified.strengthProfile,
            isPrebuiltBinding: Boolean(piece.isPrebuilt || other.isPrebuilt),
            creationReason: 'MANUAL_BIND_ACTION',
            sourceFaceId: classified.sourceFaceId,
            targetFaceId: classified.targetFaceId,
            sourceCornerId: matchedMyCornerId ?? classified.sourceCornerId,
            targetCornerId: matchedOtherCornerId ?? classified.targetCornerId,
            sourceFaceNormal: mySock.normal,
            targetFaceNormal: tSock.normal,
            visualConnectionState: 'CANDIDATE_PREVIEW',
            visualJointCapType: getVisualJointCapType(
              classified.jointType,
              classified.taxonomy,
              classified.materialPairKey,
            ),
            playerFacingConnectionLabel: `Bind ${classified.connectionSubtype.replace(/_/g, ' ').toLowerCase()}`,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => {
    const sepA = a.seamSeparation ?? 0;
    const sepB = b.seamSeparation ?? 0;
    if (Math.abs(sepA - sepB) > 1e-3) return sepA - sepB;
    const idCmp = a.targetPieceId.localeCompare(b.targetPieceId);
    if (idCmp !== 0) return idCmp;
    return a.targetSocketId.localeCompare(b.targetSocketId);
  });

  return candidates;
}


