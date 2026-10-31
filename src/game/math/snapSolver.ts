/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS, WORLD_CONFIG } from '../config';
import { EnvironmentalAnchor, MaterialType, PlacedPiece, SnapSocket, Vector2 } from '../types';
import {
  checkOBBOverlap,
  createOBB,
  getAnchorSnapSockets,
  getPieceSnapSockets,
  Vec2,
} from './geometry';

export interface SnapResult {
  position: Vector2;
  rotation: number;
  snapped: boolean;
  socket?: SnapSocket;
  isValid: boolean;
  attachedAnchorId?: string;
  overlappingPieceId?: string;
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
 * Snaps angle to nearest 45 degrees (pi/4 radians)
 */
export function snapAngle45(rad: number): number {
  const step = Math.PI / 4;
  return Math.round(rad / step) * step;
}

/**
 * Solves magnetic snapping and validates collision bounds for a dragged piece.
 */
export function solveSnapAndValidation(
  type: MaterialType,
  rawPos: Vector2,
  rawRot: number,
  placedPieces: PlacedPiece[],
  anchors: EnvironmentalAnchor[],
  snappingEnabled = true,
  excludedPieceId?: string,
): SnapResult {
  const config = MATERIAL_CONFIGS[type];
  const halfH = config.height / 2;
  let bestPos = { ...rawPos };
  let bestRot = snappingEnabled ? snapAngle45(rawRot) : rawRot;
  let bestSocket: SnapSocket | undefined;
  let attachedAnchorId: string | undefined;
  let snapped = false;

  const validPieces = placedPieces.filter(
    (p) => p.id !== excludedPieceId && p.condition !== 'LOST',
  );

  if (snappingEnabled) {
    let minDistance = WORLD_CONFIG.snapDistance;

    // 1. Check Environmental Anchors first (Priority 1)
    const anchorSockets = getAnchorSnapSockets(anchors);
    for (const aSocket of anchorSockets) {
      // Piece bottom socket to anchor socket
      const targetPos = {
        x: aSocket.worldPos.x,
        y: aSocket.worldPos.y - halfH,
      };
      const d = Vec2.distance(rawPos, targetPos);
      if (d < WORLD_CONFIG.anchorSnapDistance && d < minDistance) {
        minDistance = d;
        bestPos = targetPos;
        bestRot = 0; // Vertical alignment for anchors
        bestSocket = aSocket;
        attachedAnchorId = aSocket.anchorId;
        snapped = true;
      }
    }

    // 2. Check Piece Sockets if not already attached to anchor
    if (!snapped) {
      // Sockets on existing pieces (BROKEN debris cannot provide structural snap sockets)
      for (const piece of validPieces) {
        if (piece.condition === 'BROKEN') continue;
        const sockets = getPieceSnapSockets(piece);
        for (const sock of sockets) {
          // Align along socket normal
          const offsetDist = halfH;
          const targetPos = Vec2.add(sock.worldPos, Vec2.scale(sock.normal, offsetDist));
          const d = Vec2.distance(rawPos, targetPos);

          if (d < minDistance) {
            minDistance = d;
            bestPos = targetPos;
            bestRot = snapAngle45(sock.angle);
            bestSocket = sock;
            snapped = true;
            // Inherit anchor attachment if stacking directly on an anchored column
            if (piece.attachedAnchorId) {
              attachedAnchorId = piece.attachedAnchorId;
            }
          }
        }
      }
    }
  }

  // 3. Validate Collision & World Boundaries
  const candidateOBB = createOBB(bestPos, config.width, config.height, bestRot);
  let isValid = true;
  let overlappingPieceId: string | undefined;

  // World bounds check
  const bZone = WORLD_CONFIG.buildZone;
  const halfExtent = Math.max(config.width, config.height) / 2;
  if (
    bestPos.x - halfExtent < bZone.minX - 40 ||
    bestPos.x + halfExtent > bZone.maxX + 40 ||
    bestPos.y - halfExtent < bZone.minY - 40 ||
    bestPos.y + halfExtent > WORLD_CONFIG.groundY + 20
  ) {
    // Check if on ground or in bounds
    if (bestPos.y + halfH > WORLD_CONFIG.groundY + 10) {
      // Snap to ground level
      bestPos.y = WORLD_CONFIG.groundY - halfH;
      bestRot = 0;
    }
  }

  // Overlap check against existing pieces
  for (const piece of validPieces) {
    const pConfig = MATERIAL_CONFIGS[piece.type];
    const pieceOBB = createOBB(piece.position, pConfig.width, pConfig.height, piece.rotation);
    if (checkOBBOverlap(candidateOBB, pieceOBB, 2.5)) {
      isValid = false;
      overlappingPieceId = piece.id;
      break;
    }
  }

  return {
    position: bestPos,
    rotation: bestRot,
    snapped,
    socket: bestSocket,
    isValid,
    attachedAnchorId,
    overlappingPieceId,
  };
}
