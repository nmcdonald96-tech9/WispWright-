/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_LEVEL_STATE, MATERIAL_CONFIGS, WORLD_CONFIG } from '../config';
import {
  EnvironmentalAnchor,
  PlacedPiece,
  Vector2,
  WispEntity,
  WispPlacementDiagnostics,
  WispProtectionTag,
  WispShelterStatus,
} from '../types';
import {
  checkCircleOBBOverlap,
  createOBB,
  getDistancePointToOBB,
  OBB,
  Vec2,
} from './geometry';

/**
 * Documented small placement tolerance (1.0px) for sub-pixel numerical stability.
 * Local clearance means the authoritative wisp collider fits without intersection.
 */
export const WISP_PLACEMENT_TOLERANCE = 1.0;
export const WISP_PIECE_CLEARANCE_RADIUS = 7.5;
export const WISP_MIN_CENTER_SPACING_MARGIN = 2.0;
export const WISP_SHARED_COLLAPSE_RADIUS = 105.0;

export const WISP_SANCTUARY_ZONE = {
  minX: 150,
  maxX: 650,
  minY: 420,
  maxY: 762,
};

export interface WispPlacementValidationResult {
  isValid: boolean;
  rejectionCode:
    | 'IN_LAUNCHER_ZONE'
    | 'BEYOND_LOSS_BOUNDARY'
    | 'TERRAIN_OVERLAP'
    | 'OUTSIDE_SANCTUARY_ZONE'
    | 'PIECE_OVERLAP'
    | 'WISP_OVERLAP'
    | null;
  playerFriendlyMessage: string | null;
  overlappingId: string | null;
  diagnostics?: WispPlacementDiagnostics;
}

export interface WispProtectionEvaluation {
  shelterStatus: WispShelterStatus;
  sharedCollapseRisk: boolean;
  heavyOverheadHazard: boolean;
  limitedClearance: boolean;
  elevatedChamber: boolean;
  protectionTags: WispProtectionTag[];
  hazardWarning: string | null;
  overheadPieceIds: string[];
}

/**
 * Returns the canonical default sanctuary position for a wisp ID.
 */
export function getDefaultWispPosition(wispId: string): Vector2 {
  const found = INITIAL_LEVEL_STATE.wisps.find((w) => w.id === wispId);
  return found ? { ...found.position } : { x: 400, y: 720 };
}

/**
 * Checks whether a candidate construction piece OBB overlaps any active placed wisp.
 * Unplaced wisps (wisp.placed !== true) during BUILD or in staging never block construction.
 */
export function checkPieceOverlapsWisps(
  pieceOBB: OBB,
  wisps?: WispEntity[],
): { overlaps: boolean; wispId: string | null; penetrationDepth: number } {
  if (!wisps || wisps.length === 0) {
    return { overlaps: false, wispId: null, penetrationDepth: 0 };
  }

  for (const wisp of wisps) {
    if (wisp.isDispersed || wisp.placed !== true) continue;
    const check = checkCircleOBBOverlap(wisp.position, WISP_PIECE_CLEARANCE_RADIUS, pieceOBB);
    if (check.overlaps) {
      return {
        overlaps: true,
        wispId: wisp.id,
        penetrationDepth: check.penetrationDepth,
      };
    }
  }

  return { overlaps: false, wispId: null, penetrationDepth: 0 };
}

/**
 * Determines whether a position is enclosed inside a player-built chamber.
 * Fully enclosed chambers are completely valid for wisp placement.
 * This is used for developer telemetry and qualitative feedback, NEVER as a blocking rule.
 */
export function checkIsSealedEnclosure(pos: Vector2, pieces: PlacedPiece[]): boolean {
  const activePieces = pieces.filter((p) => p.condition !== 'LOST' && p.condition !== 'BROKEN');
  if (activePieces.length === 0) return false;

  let hasWest = false;
  let hasEast = false;
  let hasNorth = false;
  let hasSouth = pos.y >= WORLD_CONFIG.groundY - 30; // Solid ground/bedrock floor provides bottom boundary

  for (const p of activePieces) {
    const cfg = MATERIAL_CONFIGS[p.type];
    const cos = Math.abs(Math.cos(p.rotation));
    const sin = Math.abs(Math.sin(p.rotation));
    const hx = (cfg.width * cos + cfg.height * sin) / 2;
    const hy = (cfg.width * sin + cfg.height * cos) / 2;

    // West: to the left of wisp within 260px, overlapping vertically
    if (p.position.x < pos.x && p.position.x > pos.x - 260 && Math.abs(p.position.y - pos.y) <= hy + 40) {
      hasWest = true;
    }
    // East: to the right of wisp within 260px, overlapping vertically
    if (p.position.x > pos.x && p.position.x < pos.x + 260 && Math.abs(p.position.y - pos.y) <= hy + 40) {
      hasEast = true;
    }
    // North: above wisp within 240px, overlapping horizontally
    if (p.position.y < pos.y && p.position.y > pos.y - 240 && Math.abs(p.position.x - pos.x) <= hx + 40) {
      hasNorth = true;
    }
    // South: below wisp within 240px, overlapping horizontally
    if (p.position.y > pos.y && p.position.y < pos.y + 240 && Math.abs(p.position.x - pos.x) <= hx + 40) {
      hasSouth = true;
    }
  }

  return hasWest && hasEast && hasNorth && hasSouth;
}

/**
 * Validates whether a specific wisp can be placed at `pos` during PLACE_WISPS.
 *
 * VALIDATION RULES:
 * 1. The complete logical wisp collision region is inside the valid sanctuary boundary.
 * 2. The wisp does not overlap a construction-piece collider.
 * 3. The wisp does not overlap fixed terrain or anchor sockets.
 * 4. The wisp does not overlap the ground or extend beneath the valid floor.
 * 5. The wisp does not overlap another committed wisp.
 * 6. The wisp has sufficient local clearance for its actual logical hit region.
 * 7. The wisp is not outside or beyond the battlefield loss boundary.
 *
 * A completely sealed chamber is VALID when the wisp fits inside it without intersection.
 * Exterior reachability, doorway, line-of-sight, and flood-fill checks are strictly disabled.
 */
export function validateWispPlacementPosition(
  wispId: string,
  pos: Vector2,
  wisps: WispEntity[],
  pieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
): WispPlacementValidationResult {
  const targetWisp = wisps.find((w) => w.id === wispId);
  const wispRadius = targetWisp?.radius ?? 18;
  const wispColliderBounds = { centerX: pos.x, centerY: pos.y, radius: wispRadius };

  let sanctuaryBoundaryResult: WispPlacementDiagnostics['sanctuaryBoundaryResult'] = 'INSIDE';
  let overlappingTerrainColliderId: string | null = null;
  let overlappingConstructionColliderId: string | null = null;
  let overlappingWispId: string | null = null;

  // 1. Enemy launcher zone check
  if (pos.x < 50) {
    sanctuaryBoundaryResult = 'LAUNCHER_ZONE';
    const diag: WispPlacementDiagnostics = {
      wispId,
      wispPosition: { ...pos },
      wispColliderBounds,
      localClearanceResult: 'CLEAR',
      overlappingConstructionColliderId: null,
      overlappingTerrainColliderId: null,
      overlappingWispId: null,
      sanctuaryBoundaryResult,
      warningClassifications: [],
      exteriorPathCheckEnabled: false,
      sealedEnclosureAccepted: false,
      lastPlacementRejectionReason: 'IN_LAUNCHER_ZONE',
      playerFriendlyMessage: 'Wisp must remain inside the sanctuary.',
      timestamp: Date.now(),
    };
    return {
      isValid: false,
      rejectionCode: 'IN_LAUNCHER_ZONE',
      playerFriendlyMessage: 'Wisp must remain inside the sanctuary.',
      overlappingId: 'launcher_zone',
      diagnostics: diag,
    };
  }

  // 2. Loss boundary check
  if (pos.y >= WORLD_CONFIG.lossBoundaryY - 40) {
    sanctuaryBoundaryResult = 'BEYOND_LOSS_BOUNDARY';
    const diag: WispPlacementDiagnostics = {
      wispId,
      wispPosition: { ...pos },
      wispColliderBounds,
      localClearanceResult: 'CLEAR',
      overlappingConstructionColliderId: null,
      overlappingTerrainColliderId: null,
      overlappingWispId: null,
      sanctuaryBoundaryResult,
      warningClassifications: [],
      exteriorPathCheckEnabled: false,
      sealedEnclosureAccepted: false,
      lastPlacementRejectionReason: 'OUTSIDE_SANCTUARY_ZONE',
      playerFriendlyMessage: 'Wisp must remain inside the sanctuary.',
      timestamp: Date.now(),
    };
    return {
      isValid: false,
      rejectionCode: 'OUTSIDE_SANCTUARY_ZONE',
      playerFriendlyMessage: 'Wisp must remain inside the sanctuary.',
      overlappingId: 'loss_boundary',
      diagnostics: diag,
    };
  }

  // 3. Fixed terrain, ground, & bedrock check (cannot extend beneath the valid floor)
  if (pos.y + wispRadius > WORLD_CONFIG.groundY) {
    sanctuaryBoundaryResult = 'EXTENDS_BENEATH_FLOOR';
    overlappingTerrainColliderId = 'ground_bedrock';
    const diag: WispPlacementDiagnostics = {
      wispId,
      wispPosition: { ...pos },
      wispColliderBounds,
      localClearanceResult: 'INTERSECTS_COLLIDER',
      overlappingConstructionColliderId: null,
      overlappingTerrainColliderId,
      overlappingWispId: null,
      sanctuaryBoundaryResult,
      warningClassifications: [],
      exteriorPathCheckEnabled: false,
      sealedEnclosureAccepted: false,
      lastPlacementRejectionReason: 'TERRAIN_OVERLAP',
      playerFriendlyMessage: 'Wisp cannot be placed inside fixed terrain.',
      timestamp: Date.now(),
    };
    return {
      isValid: false,
      rejectionCode: 'TERRAIN_OVERLAP',
      playerFriendlyMessage: 'Wisp cannot be placed inside fixed terrain.',
      overlappingId: 'ground_bedrock',
      diagnostics: diag,
    };
  }

  for (const anchor of anchors) {
    if (Vec2.distance(pos, anchor.position) < wispRadius + 2) {
      overlappingTerrainColliderId = anchor.id;
      const diag: WispPlacementDiagnostics = {
        wispId,
        wispPosition: { ...pos },
        wispColliderBounds,
        localClearanceResult: 'INTERSECTS_COLLIDER',
        overlappingConstructionColliderId: null,
        overlappingTerrainColliderId,
        overlappingWispId: null,
        sanctuaryBoundaryResult: 'INSIDE',
        warningClassifications: [],
        exteriorPathCheckEnabled: false,
        sealedEnclosureAccepted: false,
        lastPlacementRejectionReason: 'TERRAIN_OVERLAP',
        playerFriendlyMessage: 'Wisp cannot be placed inside fixed terrain.',
        timestamp: Date.now(),
      };
      return {
        isValid: false,
        rejectionCode: 'TERRAIN_OVERLAP',
        playerFriendlyMessage: 'Wisp cannot be placed inside fixed terrain.',
        overlappingId: anchor.id,
        diagnostics: diag,
      };
    }
  }

  // 4. Valid sanctuary zone check (logical collider must fit within sanctuary bounds)
  if (
    pos.x - wispRadius < WISP_SANCTUARY_ZONE.minX ||
    pos.x + wispRadius > WISP_SANCTUARY_ZONE.maxX ||
    pos.y - wispRadius < WISP_SANCTUARY_ZONE.minY
  ) {
    sanctuaryBoundaryResult = 'OUTSIDE';
    const diag: WispPlacementDiagnostics = {
      wispId,
      wispPosition: { ...pos },
      wispColliderBounds,
      localClearanceResult: 'CLEAR',
      overlappingConstructionColliderId: null,
      overlappingTerrainColliderId: null,
      overlappingWispId: null,
      sanctuaryBoundaryResult,
      warningClassifications: [],
      exteriorPathCheckEnabled: false,
      sealedEnclosureAccepted: false,
      lastPlacementRejectionReason: 'OUTSIDE_SANCTUARY_ZONE',
      playerFriendlyMessage: 'Wisp must remain inside the sanctuary.',
      timestamp: Date.now(),
    };
    return {
      isValid: false,
      rejectionCode: 'OUTSIDE_SANCTUARY_ZONE',
      playerFriendlyMessage: 'Wisp must remain inside the sanctuary.',
      overlappingId: 'sanctuary_bounds',
      diagnostics: diag,
    };
  }

  // 5. Construction collider overlap & local clearance check
  const activePieces = pieces.filter((p) => p.condition !== 'LOST');
  let minDistanceToPiece = Infinity;
  let maxPenetration = 0;
  const effectiveRadius = wispRadius - WISP_PLACEMENT_TOLERANCE;

  for (const piece of activePieces) {
    const cfg = MATERIAL_CONFIGS[piece.type];
    const pieceOBB = createOBB(piece.position, cfg.width, cfg.height, piece.rotation);
    const dist = getDistancePointToOBB(pos, pieceOBB);
    if (dist < minDistanceToPiece) {
      minDistanceToPiece = dist;
    }
    if (dist < effectiveRadius) {
      if (!overlappingConstructionColliderId) {
        overlappingConstructionColliderId = piece.id;
      }
      const penetration = effectiveRadius - dist;
      if (penetration > maxPenetration) {
        maxPenetration = penetration;
      }
    }
  }

  if (overlappingConstructionColliderId) {
    const message =
      maxPenetration > 6.0
        ? 'Wisp overlaps a construction piece.'
        : 'Not enough physical clearance for this wisp.';
    const diag: WispPlacementDiagnostics = {
      wispId,
      wispPosition: { ...pos },
      wispColliderBounds,
      localClearanceResult: 'INTERSECTS_COLLIDER',
      overlappingConstructionColliderId,
      overlappingTerrainColliderId: null,
      overlappingWispId: null,
      sanctuaryBoundaryResult: 'INSIDE',
      warningClassifications: [],
      exteriorPathCheckEnabled: false,
      sealedEnclosureAccepted: false,
      lastPlacementRejectionReason: 'PIECE_OVERLAP',
      playerFriendlyMessage: message,
      timestamp: Date.now(),
    };
    return {
      isValid: false,
      rejectionCode: 'PIECE_OVERLAP',
      playerFriendlyMessage: message,
      overlappingId: overlappingConstructionColliderId,
      diagnostics: diag,
    };
  }

  // 6. Wisp-to-wisp minimum center-to-center spacing check
  for (const other of wisps) {
    if (other.id === wispId || other.isDispersed) continue;
    if (other.placed === false) continue;
    const minSpacing = wispRadius + other.radius + WISP_MIN_CENTER_SPACING_MARGIN;
    const d = Vec2.distance(pos, other.position);
    if (d < minSpacing) {
      overlappingWispId = other.id;
      const diag: WispPlacementDiagnostics = {
        wispId,
        wispPosition: { ...pos },
        wispColliderBounds,
        localClearanceResult: 'CLEAR',
        overlappingConstructionColliderId: null,
        overlappingTerrainColliderId: null,
        overlappingWispId,
        sanctuaryBoundaryResult: 'INSIDE',
        warningClassifications: [],
        exteriorPathCheckEnabled: false,
        sealedEnclosureAccepted: false,
        lastPlacementRejectionReason: 'WISP_OVERLAP',
        playerFriendlyMessage: 'Wisp overlaps another wisp.',
        timestamp: Date.now(),
      };
      return {
        isValid: false,
        rejectionCode: 'WISP_OVERLAP',
        playerFriendlyMessage: 'Wisp overlaps another wisp.',
        overlappingId: other.id,
        diagnostics: diag,
      };
    }
  }

  // Evaluate qualitative strategic warnings (non-blocking)
  const evalResult = evaluateWispProtectionAndRisks(pos, wispId, wisps, pieces);
  const warningClassifications: string[] = [];
  if (evalResult.heavyOverheadHazard) warningClassifications.push('HEAVY_OVERHEAD_HAZARD');
  if (evalResult.sharedCollapseRisk) warningClassifications.push('SHARED_COLLAPSE_RISK');
  if (evalResult.limitedClearance) warningClassifications.push('LIMITED_CLEARANCE');
  if (evalResult.elevatedChamber) warningClassifications.push('ELEVATED_CHAMBER');

  const localClearanceResult: WispPlacementDiagnostics['localClearanceResult'] =
    minDistanceToPiece <= effectiveRadius + 8.0 ? 'TIGHT' : 'CLEAR';
  const sealedEnclosureAccepted = checkIsSealedEnclosure(pos, activePieces);

  const diag: WispPlacementDiagnostics = {
    wispId,
    wispPosition: { ...pos },
    wispColliderBounds,
    localClearanceResult,
    overlappingConstructionColliderId: null,
    overlappingTerrainColliderId: null,
    overlappingWispId: null,
    sanctuaryBoundaryResult: 'INSIDE',
    warningClassifications,
    exteriorPathCheckEnabled: false,
    sealedEnclosureAccepted,
    lastPlacementRejectionReason: null,
    playerFriendlyMessage: evalResult.hazardWarning,
    timestamp: Date.now(),
  };

  return {
    isValid: true,
    rejectionCode: null,
    playerFriendlyMessage: null,
    overlappingId: null,
    diagnostics: diag,
  };
}

/**
 * Evaluates qualitative, non-authoritative protection status, shared collapse risk,
 * heavy overhead hazard, limited clearance, and elevated chamber warnings for a wisp at `wispPos`.
 */
export function evaluateWispProtectionAndRisks(
  wispPos: Vector2,
  wispId: string,
  wisps: WispEntity[],
  pieces: PlacedPiece[],
): WispProtectionEvaluation {
  const activePieces = pieces.filter((p) => p.condition !== 'LOST' && p.condition !== 'BROKEN');
  const targetWisp = wisps.find((w) => w.id === wispId);
  const wispRadius = targetWisp?.radius ?? 18;

  const overheadPieces: PlacedPiece[] = [];
  let hasWestCover = false;
  let minDistanceToPiece = Infinity;
  let piecesSurroundingCount = 0;

  for (const piece of activePieces) {
    const cfg = MATERIAL_CONFIGS[piece.type];
    const cos = Math.abs(Math.cos(piece.rotation));
    const sin = Math.abs(Math.sin(piece.rotation));
    const hx = (cfg.width * cos + cfg.height * sin) / 2;
    const hy = (cfg.width * sin + cfg.height * cos) / 2;

    const pieceOBB = createOBB(piece.position, cfg.width, cfg.height, piece.rotation);
    const dist = getDistancePointToOBB(wispPos, pieceOBB);
    if (dist < minDistanceToPiece) minDistanceToPiece = dist;

    // Overhead cover: above wisp within 240px and horizontally spanning wispPos.x
    if (
      piece.position.y < wispPos.y - 8 &&
      piece.position.y > wispPos.y - 240 &&
      Math.abs(piece.position.x - wispPos.x) <= hx + 20
    ) {
      overheadPieces.push(piece);
      piecesSurroundingCount++;
    }

    // Western cover (toward launcher at x < 0)
    if (
      piece.position.x < wispPos.x - 8 &&
      piece.position.x > wispPos.x - 240 &&
      Math.abs(piece.position.y - wispPos.y) <= hy + 42
    ) {
      hasWestCover = true;
      piecesSurroundingCount++;
    }

    // Eastern cover
    if (
      piece.position.x > wispPos.x + 8 &&
      piece.position.x < wispPos.x + 240 &&
      Math.abs(piece.position.y - wispPos.y) <= hy + 42
    ) {
      piecesSurroundingCount++;
    }
  }

  const hasOverheadCover = overheadPieces.length > 0;

  // 1. Heavy overhead hazard check:
  // Triggered if an overhead piece is a heavy block (stone_block or bullseye_block) OR
  // if a heavy block rests on an overhead piece above this wisp.
  let heavyOverheadHazard = false;
  for (const ov of overheadPieces) {
    if (ov.type === 'stone_block' || ov.type === 'bullseye_block') {
      if (!ov.isPrebuilt || ov.position.y < 720) {
        heavyOverheadHazard = true;
        break;
      }
    }
    for (const upper of activePieces) {
      if (upper.id === ov.id) continue;
      if (upper.type !== 'stone_block' && upper.type !== 'bullseye_block') continue;
      if (
        upper.position.y < ov.position.y - 6 &&
        upper.position.y > ov.position.y - 72 &&
        Math.abs(upper.position.x - ov.position.x) <= 68
      ) {
        heavyOverheadHazard = true;
        break;
      }
    }
    if (heavyOverheadHazard) break;
  }

  // 2. Shared collapse risk check:
  // Triggered if another placed wisp is within WISP_SHARED_COLLAPSE_RADIUS (105px)
  // OR shares an overhead structural piece.
  let sharedCollapseRisk = false;
  const overheadIds = new Set(overheadPieces.map((p) => p.id));

  for (const other of wisps) {
    if (other.id === wispId || other.isDispersed || other.placed === false) continue;
    const dist = Vec2.distance(wispPos, other.position);
    if (dist <= WISP_SHARED_COLLAPSE_RADIUS) {
      sharedCollapseRisk = true;
      break;
    }
    for (const ov of overheadPieces) {
      const cfg = MATERIAL_CONFIGS[ov.type];
      const cos = Math.abs(Math.cos(ov.rotation));
      const sin = Math.abs(Math.sin(ov.rotation));
      const hx = (cfg.width * cos + cfg.height * sin) / 2;
      if (
        ov.position.y < other.position.y - 8 &&
        ov.position.y > other.position.y - 240 &&
        Math.abs(ov.position.x - other.position.x) <= hx + 20 &&
        overheadIds.has(ov.id)
      ) {
        sharedCollapseRisk = true;
        break;
      }
    }
    if (sharedCollapseRisk) break;
  }

  // 3. Limited clearance check (tight enclosure: fits without overlap but clearance <= 8px and bounded)
  const clearanceMargin = minDistanceToPiece - (wispRadius - WISP_PLACEMENT_TOLERANCE);
  const limitedClearance = clearanceMargin >= 0 && clearanceMargin <= 8.0 && piecesSurroundingCount >= 2;

  // 4. Elevated chamber check (placed high above the ground: wispPos.y < 670)
  const elevatedChamber = wispPos.y < 670;

  let shelterStatus: WispShelterStatus = 'Exposed';
  if (hasOverheadCover && hasWestCover) {
    shelterStatus = 'Well sheltered';
  } else if (hasOverheadCover || hasWestCover) {
    shelterStatus = 'Partially sheltered';
  }

  const protectionTags: WispProtectionTag[] = [shelterStatus];
  if (sharedCollapseRisk) {
    protectionTags.push('Shared collapse risk');
  }
  if (heavyOverheadHazard) {
    protectionTags.push('Heavy overhead hazard');
  }
  if (limitedClearance) {
    protectionTags.push('Tight enclosure');
  }
  if (elevatedChamber) {
    protectionTags.push('Elevated position');
  }

  // Non-blocking strategic warnings
  const warnings: string[] = [];
  if (heavyOverheadHazard) {
    warnings.push('Heavy overhead collapse risk.');
  }
  if (sharedCollapseRisk) {
    warnings.push('Several wisps share one collapse risk.');
  }
  if (limitedClearance) {
    warnings.push('Tight enclosure — nearby debris may be dangerous.');
  }
  if (elevatedChamber) {
    warnings.push('Elevated position — falling structure may carry the wisp.');
  }

  const hazardWarning = warnings.length > 0 ? warnings.join(' ') : null;

  return {
    shelterStatus,
    sharedCollapseRisk,
    heavyOverheadHazard,
    limitedClearance,
    elevatedChamber,
    protectionTags,
    hazardWarning,
    overheadPieceIds: Array.from(overheadIds),
  };
}
