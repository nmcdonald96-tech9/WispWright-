/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  INITIAL_LEVEL_STATE,
  MATERIAL_CONFIGS,
  TIMBER_JOINT_CONFIG,
  WORLD_CONFIG,
} from '../config';
import {
  EnvironmentalAnchor,
  MaterialType,
  PlacedPiece,
  ProposedTimberJoint,
  RotationRejectionReason,
  RotationSource,
  RotationValidationDiagnostics,
  SnapSocket,
  TimberJoint,
  TimberJointType,
  Vector2,
  WispEntity,
} from '../types';
import {
  checkOBBOverlap,
  createOBB,
  getAnchorSnapSockets,
  getOBBPenetrationDepth,
  getPieceSnapSockets,
  getPieceSnapSocketsForTransform,
  Vec2,
} from './geometry';
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

/**
 * Evaluates compatibility between a dragged piece's local socket and a target world socket.
 * Supports Timber Beam endpoint-to-endpoint connections across horizontal, vertical,
 * angled, and peaked roof orientations, as well as T-shaped endpoint-to-side framing.
 */
export function evaluateSocketCompatibility(
  pSock: SnapSocket,
  tSock: SnapSocket,
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

  // Timber Beam Endpoint-to-Endpoint connection:
  // Compatible across collinear (normalDot ~ -1), 90° corner (normalDot ~ 0),
  // angled roof peak (normalDot in [-0.8, +0.5]), etc.
  // We allow all endpoint-to-endpoint pairs into clearance evaluation and boost priority
  // when normals do not fold back onto each other.
  if (pk === 'beam_end' && tk === 'beam_end') {
    const isFolded = normalDot > TIMBER_JOINT_CONFIG.minFoldedBodyCosine;
    return {
      compatible: true,
      label: 'BEAM_END_TO_BEAM_END',
      priority: isFolded ? 4 : normalDot <= 0.05 ? 16 : 13,
      normalDot,
      isTimberJointEligible: true,
      timberJointType: 'BEAM_END_TO_BEAM_END',
    };
  }

  // Timber Beam Endpoint-to-Side T-joint framing connection:
  // Requires outward normal of the beam end to oppose the side face normal (normalDot <= -0.25)
  // so the beam approaches the target beam from the outside of that face.
  if ((pk === 'beam_end' && tk === 'beam_side') || (pk === 'beam_side' && tk === 'beam_end')) {
    if (normalDot <= TIMBER_JOINT_CONFIG.sideJoinNormalDotLimit) {
      return {
        compatible: true,
        label: 'BEAM_END_TO_BEAM_SIDE',
        priority: 14,
        normalDot,
        isTimberJointEligible: true,
        timberJointType: 'BEAM_END_TO_BEAM_SIDE',
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

  if ((pk === 'beam_end' && tk === 'block_edge') || (pk === 'block_edge' && tk === 'beam_end')) {
    return {
      compatible: true,
      label: pk === 'beam_end' ? 'BEAM_END_TO_BLOCK_EDGE' : 'BLOCK_EDGE_TO_BEAM_END',
      priority: 13,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
    };
  }
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
  if (pk === 'block_edge' && tk === 'block_edge') {
    return {
      compatible: true,
      label: 'BLOCK_EDGE_TO_BLOCK_EDGE',
      priority: 11,
      normalDot,
      isTimberJointEligible: false,
      timberJointType: null,
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
 * Resolves socket-specific contact clearance for a proposed Timber Joint between two wood_beam pieces.
 * Ensures that collinear, perpendicular (90°), angled (e.g. 45°), peaked-roof, and T-joint connections
 * meet cleanly at their sockets with zero interior OBB penetration (penetrationDepth === 0), while
 * rejecting true body overlaps or impossible acute angles.
 */
export function solveTimberJointClearance(
  dragRot: number,
  pSock: SnapSocket,
  targetPiece: PlacedPiece,
  tSock: SnapSocket,
  initialAlignedPos: Vector2,
): TimberJointClearanceResult {
  const beamCfg = MATERIAL_CONFIGS.wood_beam;
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

  const targetOBB = createOBB(
    targetPiece.position,
    beamCfg.width,
    beamCfg.height,
    targetPiece.rotation,
  );
  const initialOBB = createOBB(initialAlignedPos, beamCfg.width, beamCfg.height, dragRot);
  const initialPen = getOBBPenetrationDepth(initialOBB, targetOBB, 0);

  if (initialPen <= 0.01) {
    const worldSocketA = Vec2.add(initialAlignedPos, Vec2.rotate(localAnchorA, dragRot));
    const worldSocketB = tSock.worldPos;
    return {
      valid: true,
      adjustedPos: initialAlignedPos,
      clearanceShift: 0,
      restSeparation: Number(Vec2.distance(worldSocketA, worldSocketB).toFixed(2)),
      restAngle,
      worldSocketA,
      worldSocketB,
      localAnchorA,
      localAnchorB,
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
      const testOBB = createOBB(testPos, beamCfg.width, beamCfg.height, dragRot);
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

    if (restSeparation <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 1.0) {
      return {
        valid: true,
        adjustedPos,
        clearanceShift: Number(appliedShift.toFixed(2)),
        restSeparation,
        restAngle,
        worldSocketA,
        worldSocketB,
        localAnchorA,
        localAnchorB,
        overlapClassification: 'SOCKET_CONTACT_CLEARED',
        rejectionReason: null,
        friendlyMessage: 'Timber endpoints can connect here.',
      };
    }
  }

  const isParallelBodyOverlap =
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
        normalDot: number;
        isLocked: boolean;
        isOverlapFree: boolean;
        conflictingThirdPieceId: string | null;
        timberJointProposal: ProposedTimberJoint | null;
        clearanceClassification: SnapResult['overlapClassification'];
      }

      const candidates: EvaluatedCandidate[] = [];

      for (const piece of validPieces) {
        if (piece.condition === 'BROKEN') continue;
        const targetSockets = getPieceSnapSockets(piece);

        for (const tSock of targetSockets) {
          if (tSock.socketKind === 'center') continue;

          for (const pSock of candidatePieceSockets) {
            if (pSock.socketKind === 'center') continue;
            // Only use corner sockets when at an oblique angle
            if (
              (pSock.socketKind === 'beam_corner' || tSock.socketKind === 'beam_corner') &&
              !isObliqueAngle
            ) {
              continue;
            }

            const compat = evaluateSocketCompatibility(pSock, tSock);
            if (!compat.compatible) continue;

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
              : pSock.socketKind === 'beam_end' || tSock.socketKind === 'beam_end'
                ? ENDPOINT_SNAP_RADIUS
                : WORLD_CONFIG.snapDistance;

            if (rawInitialDist > maxAllowedRadius + 6) continue;

            let timberJointProposal: ProposedTimberJoint | null = null;
            let clearanceClassification: SnapResult['overlapClassification'] = 'NONE';

            const isBothTimberBeams =
              type === 'wood_beam' &&
              piece.type === 'wood_beam' &&
              compat.isTimberJointEligible &&
              compat.timberJointType !== null;

            if (isBothTimberBeams && compat.timberJointType) {
              const clearance = solveTimberJointClearance(
                preferredRot,
                pSock,
                piece,
                tSock,
                alignedPos,
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
                jointType: compat.timberJointType,
                restAngle: clearance.restAngle,
                restSeparation: clearance.restSeparation,
                strengthProfile: 'standard_timber_joint',
              };
            } else if (compat.normalDot > -0.98 && pSock.socketKind === 'beam_end') {
              // Non-joint oblique beam end resting against a block edge:
              // Shift along tSock.normal by the corner protrusion so the beam rests cleanly on the block face
              const uPerp = { x: -Math.sin(preferredRot), y: Math.cos(preferredRot) };
              const cornerProtrusion =
                halfH * Math.abs(Vec2.dot(uPerp, tSock.normal)) + 0.5;
              alignedPos = Vec2.add(alignedPos, Vec2.scale(tSock.normal, cornerProtrusion));
            }

            const rawDist = Vec2.distance(rawPos, alignedPos);
            if (rawDist > maxAllowedRadius + (isBothTimberBeams ? 8 : 0)) continue;

            // Check if this aligned position intersects a wisp volume
            const candOBB = createOBB(alignedPos, config.width, config.height, preferredRot);
            if (checkPieceOverlapsWisps(candOBB, effectiveWisps).overlaps) {
              continue;
            }

            // Check if this aligned position is overlap-free against all valid pieces
            // (For a valid timber joint, targetPiece is already verified with 0.0px OBB penetration)
            let isOverlapFree = true;
            let conflictingThirdPieceId: string | null = null;
            for (const other of validPieces) {
              const otherConfig = MATERIAL_CONFIGS[other.type];
              const otherOBB = createOBB(
                other.position,
                otherConfig.width,
                otherConfig.height,
                other.rotation,
              );
              const tol =
                timberJointProposal && other.id === piece.id ? 0.05 : 2.5;
              if (checkOBBOverlap(candOBB, otherOBB, tol)) {
                isOverlapFree = false;
                if (other.id !== piece.id) {
                  conflictingThirdPieceId = other.id;
                  clearanceClassification = 'THIRD_PIECE_CONFLICT';
                }
                break;
              }
            }

            // Rank score (lower is better):
            // 1. Valid non-overlapping candidates strongly preferred
            // 2. Locked candidate hysteresis bonus (-10px)
            // 3. Socket compatibility priority bonus
            // 4. Flush normal bonus
            let effectiveScore = rawDist;
            if (!isOverlapFree) effectiveScore += 100;
            if (isLocked) effectiveScore -= 10;
            effectiveScore -= compat.priority * 0.45;
            if (compat.normalDot <= -0.98) effectiveScore -= 2.5;

            candidates.push({
              pSock,
              tSock,
              targetPiece: piece,
              alignedPos,
              rawDist,
              effectiveScore,
              compatLabel: compat.label,
              normalDot: compat.normalDot,
              isLocked,
              isOverlapFree,
              conflictingThirdPieceId,
              timberJointProposal,
              clearanceClassification,
            });
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          if (Math.abs(a.effectiveScore - b.effectiveScore) > 0.01) {
            return a.effectiveScore - b.effectiveScore;
          }
          const pieceCmp = a.targetPiece.id.localeCompare(b.targetPiece.id);
          if (pieceCmp !== 0) return pieceCmp;
          return a.tSock.id.localeCompare(b.tSock.id);
        });

        const winner = candidates[0];
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
    if (penetration <= 28 && !proposedTimberJoint) {
      bestPos.y -= penetration;
      const adjustedOBB = createOBB(bestPos, config.width, config.height, bestRot);
      candidateOBB.center = adjustedOBB.center;
      candidateOBB.vertices = adjustedOBB.vertices;
      lowestY = WORLD_CONFIG.groundY;
    } else {
      isValid = false;
      proposedTimberJoint = null;
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
      overlapColliderId = wispOverlap.wispId;
      maxPenetrationDepth = wispOverlap.penetrationDepth;
      lastSnapRejectionReason = 'WISP_OVERLAP';
      playerFriendlyRejectionMessage = 'Keep this space clear for the wisps.';
    }
  }

  // Overlap check against existing valid pieces
  if (isValid) {
    for (const piece of validPieces) {
      const pConfig = MATERIAL_CONFIGS[piece.type];
      const pieceOBB = createOBB(piece.position, pConfig.width, pConfig.height, piece.rotation);
      const tol =
        proposedTimberJoint && piece.id === proposedTimberJoint.targetPieceId ? 0.05 : 2.5;
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
        break;
      }
    }
  }

  // 4. Connected-Beam Edit Validation:
  // If moving an already-placed beam that participates in active TimberJoint(s), verify that every
  // existing active joint on that beam remains within valid socket clearance or is updated cleanly.
  if (isValid && existingJoints.length > 0 && excludedPieceId) {
    const newSockets = getPieceSnapSocketsForTransform(type, bestPos, bestRot, excludedPieceId);
    for (const joint of existingJoints) {
      const partnerId = joint.pieceAId === excludedPieceId ? joint.pieceBId : joint.pieceAId;
      const staysConnectedViaProposed =
        proposedTimberJoint && proposedTimberJoint.targetPieceId === partnerId;

      if (!staysConnectedViaProposed) {
        // Check if the specific sockets of this joint are still within valid clearance
        const mySockId = joint.pieceAId === excludedPieceId ? joint.socketAId : joint.socketBId;
        const partnerSockId =
          joint.pieceAId === excludedPieceId ? joint.socketBId : joint.socketAId;
        const partnerPiece = validPieces.find((p) => p.id === partnerId);
        if (partnerPiece) {
          const partnerSockets = getPieceSnapSockets(partnerPiece);
          const mySock = newSockets.find(
            (s) => s.id === mySockId || s.localName === mySockId.split('_').slice(-3).join('_'),
          );
          const pSock = partnerSockets.find(
            (s) =>
              s.id === partnerSockId ||
              s.localName === partnerSockId.split('_').slice(-3).join('_'),
          );
          const sockDist =
            mySock && pSock ? Vec2.distance(mySock.worldPos, pSock.worldPos) : Infinity;

          if (sockDist > TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 1.5) {
            isValid = false;
            proposedTimberJoint = null;
            overlapColliderId = partnerId;
            lastSnapRejectionReason = 'JOINT_DETACH_REQUIRED';
            playerFriendlyRejectionMessage =
              'Connected by Timber Joint — tap Detach Joint to move separately.';
            break;
          }
        }
      }
    }
  }

  // Predict whether the placed piece has a plausible physical support surface beneath it
  let supportedContactPredicted = Boolean(
    attachedAnchorId ||
      proposedTimberJoint ||
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

  if (isValid && proposedTimberJoint && !playerFriendlyRejectionMessage) {
    playerFriendlyRejectionMessage = 'Timber endpoints can connect here.';
  }

  const positionCorrectionVector = Vec2.sub(bestPos, rawPos);

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
    connectionCategory,
    overlapClassification,
    supportedContactPredicted,
    placementRejectionReason: lastSnapRejectionReason,
    overlapColliderId,
    penetrationDepth: Number(maxPenetrationDepth.toFixed(2)),
  };
}

/**
 * Atomic Rotation Validation Transaction:
 * Validates a proposed rotation for an already-placed construction piece against:
 * 1. Explicit connection / environmental anchor compatibility (attachedAnchorId) & active TimberJoints
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
  activeJoints?: TimberJoint[],
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

  // 1a. Explicit connection / environmental anchor compatibility check
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

  // 1b. Active TimberJoint compatibility check:
  // Rotating a connected beam in-place around its center must not stretch its joined endpoint
  // away from the partner socket or cause overlap.
  const pieceJoints = (activeJoints ?? []).filter(
    (j) =>
      j.state !== 'BROKEN' && (j.pieceAId === piece.id || j.pieceBId === piece.id),
  );
  if (pieceJoints.length > 0) {
    for (const joint of pieceJoints) {
      const isPieceA = joint.pieceAId === piece.id;
      const partnerId = isPieceA ? joint.pieceBId : joint.pieceAId;
      const partnerPiece = validPieces.find((p) => p.id === partnerId);
      if (!partnerPiece) continue;

      const myLocalAnchor = isPieceA ? joint.localAnchorA : joint.localAnchorB;
      const partnerLocalAnchor = isPieceA ? joint.localAnchorB : joint.localAnchorA;

      const newWorldSocket = Vec2.add(
        piece.position,
        Vec2.rotate(myLocalAnchor, proposedAngle),
      );
      const partnerWorldSocket = Vec2.add(
        partnerPiece.position,
        Vec2.rotate(partnerLocalAnchor, partnerPiece.rotation),
      );
      const newSeparation = Vec2.distance(newWorldSocket, partnerWorldSocket);

      if (newSeparation > TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 1.5) {
        return {
          selectedPieceId: piece.id,
          currentCommittedAngle: currentAngle,
          proposedAngle,
          rotationFinalOverlapCount: 0,
          rotationSweepOverlapCount: 0,
          conflictingColliderId: partnerId,
          penetrationDepth: Number(newSeparation.toFixed(2)),
          connectionIncompatibility: true,
          rotationAccepted: false,
          lastRejectionReason: 'CONNECTION_INCOMPATIBLE',
          playerFriendlyMessage: 'Detach Joint before rotating away from connected endpoint.',
          timestamp: Date.now(),
        };
      }
    }
  }

  const bZone = WORLD_CONFIG.buildZone;

  const evaluateAngleCollider = (
    angleRad: number,
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

    // Active piece OBB overlap check (tolerance = 2.5px so flush edge contact is preserved)
    let pieceOverlaps = 0;
    let firstColliderId: string | null = null;
    let maxDepth = 0;
    for (const other of validPieces) {
      const oCfg = MATERIAL_CONFIGS[other.type];
      const otherOBB = createOBB(other.position, oCfg.width, oCfg.height, other.rotation);
      const depth = getOBBPenetrationDepth(obb, otherOBB, 2.5);
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
  const finalCheck = evaluateAngleCollider(proposedAngle);

  // 3. Evaluate swept intermediate angular path (5° steps) to prevent tunneling
  const deltaRad = shortestSignedAngleDelta(currentAngle, proposedAngle);
  const stepRad = (5 * Math.PI) / 180; // 5 degrees
  const numSteps = Math.max(1, Math.ceil(Math.abs(deltaRad) / stepRad));

  let sweepOverlapCount = 0;
  let firstSweepFailure: ReturnType<typeof evaluateAngleCollider> | null = null;

  for (let i = 1; i < numSteps; i++) {
    const t = i / numSteps;
    const intermediateAngle = currentAngle + deltaRad * t;
    const stepCheck = evaluateAngleCollider(intermediateAngle);
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

