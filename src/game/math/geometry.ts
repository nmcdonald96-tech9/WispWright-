/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import { EnvironmentalAnchor, MaterialType, PlacedPiece, SnapSocket, Vector2 } from '../types';

export const Vec2 = {
  create: (x = 0, y = 0): Vector2 => ({ x, y }),
  add: (a: Vector2, b: Vector2): Vector2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vector2, b: Vector2): Vector2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (v: Vector2, s: number): Vector2 => ({ x: v.x * s, y: v.y * s }),
  length: (v: Vector2): number => Math.hypot(v.x, v.y),
  distance: (a: Vector2, b: Vector2): number => Math.hypot(a.x - b.x, a.y - b.y),
  normalize: (v: Vector2): Vector2 => {
    const len = Math.hypot(v.x, v.y);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
  },
  dot: (a: Vector2, b: Vector2): number => a.x * b.x + a.y * b.y,
  rotate: (v: Vector2, angleRad: number): Vector2 => {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
      x: v.x * cos - v.y * sin,
      y: v.x * sin + v.y * cos,
    };
  },
};

export interface OBB {
  center: Vector2;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
  axes: [Vector2, Vector2];
  vertices: [Vector2, Vector2, Vector2, Vector2];
}

/**
 * Creates an Oriented Bounding Box for a piece given its dimensions, position, and rotation.
 */
export function createOBB(position: Vector2, width: number, height: number, rotation: number): OBB {
  const hw = width / 2;
  const hh = height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const u = { x: cos, y: sin }; // Local X axis
  const v = { x: -sin, y: cos }; // Local Y axis

  // 4 corners: TL, TR, BR, BL
  const v0 = {
    x: position.x - hw * cos + hh * sin,
    y: position.y - hw * sin - hh * cos,
  };
  const v1 = {
    x: position.x + hw * cos + hh * sin,
    y: position.y + hw * sin - hh * cos,
  };
  const v2 = {
    x: position.x + hw * cos - hh * sin,
    y: position.y + hw * sin + hh * cos,
  };
  const v3 = {
    x: position.x - hw * cos - hh * sin,
    y: position.y - hw * sin + hh * cos,
  };

  return {
    center: position,
    halfWidth: hw,
    halfHeight: hh,
    rotation,
    axes: [u, v],
    vertices: [v0, v1, v2, v3],
  };
}

/**
 * Creates an OBB directly from a PlacedPiece instance
 */
export function getOBBFromPiece(piece: PlacedPiece): OBB {
  const config = MATERIAL_CONFIGS[piece.type];
  return createOBB(piece.position, config.width, config.height, piece.rotation);
}

/**
 * Check if a 2D point is inside an Oriented Bounding Box
 */
export function isPointInOBB(point: Vector2, obb: OBB): boolean {
  // Transform point to OBB local coordinate system
  const d = Vec2.sub(point, obb.center);
  const localX = Vec2.dot(d, obb.axes[0]);
  const localY = Vec2.dot(d, obb.axes[1]);

  return Math.abs(localX) <= obb.halfWidth && Math.abs(localY) <= obb.halfHeight;
}

/**
 * Separating Axis Theorem (SAT) overlap check between two OBBs
 */
export function checkOBBOverlap(a: OBB, b: OBB, slop = 1.0): boolean {
  const axes = [a.axes[0], a.axes[1], b.axes[0], b.axes[1]];

  for (const axis of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    for (const v of a.vertices) {
      const proj = Vec2.dot(v, axis);
      if (proj < minA) minA = proj;
      if (proj > maxA) maxA = proj;
    }

    let minB = Infinity;
    let maxB = -Infinity;
    for (const v of b.vertices) {
      const proj = Vec2.dot(v, axis);
      if (proj < minB) minB = proj;
      if (proj > maxB) maxB = proj;
    }

    // Shrink projection interval slightly by slop so resting contacts don't register as invalid overlaps
    if (maxA - slop <= minB || maxB - slop <= minA) {
      return false; // Separating axis found, no overlap
    }
  }

  return true; // Overlap on all axes
}

/**
 * Computes all available snap sockets for a piece in world space.
 */
export function getPieceSnapSockets(piece: PlacedPiece): SnapSocket[] {
  const config = MATERIAL_CONFIGS[piece.type];
  const hw = config.width / 2;
  const hh = config.height / 2;
  const rot = piece.rotation;
  const sockets: SnapSocket[] = [];

  // Center socket
  sockets.push({
    id: `${piece.id}_center`,
    pieceId: piece.id,
    worldPos: piece.position,
    normal: Vec2.rotate({ x: 0, y: -1 }, rot),
    type: 'center',
    angle: rot,
  });

  if (piece.type === 'wood_beam') {
    // Wood beam: long horizontal piece with 3 sockets along top, 3 along bottom, 1 on each end cap
    const offsets = [-hw + 24, 0, hw - 24];
    // Top face
    offsets.forEach((ox, i) => {
      const local = { x: ox, y: -hh };
      sockets.push({
        id: `${piece.id}_top_${i}`,
        pieceId: piece.id,
        worldPos: Vec2.add(piece.position, Vec2.rotate(local, rot)),
        normal: Vec2.rotate({ x: 0, y: -1 }, rot),
        type: 'edge',
        angle: rot,
      });
    });

    // Bottom face
    offsets.forEach((ox, i) => {
      const local = { x: ox, y: hh };
      sockets.push({
        id: `${piece.id}_bot_${i}`,
        pieceId: piece.id,
        worldPos: Vec2.add(piece.position, Vec2.rotate(local, rot)),
        normal: Vec2.rotate({ x: 0, y: 1 }, rot),
        type: 'edge',
        angle: rot,
      });
    });

    // Left and right caps
    sockets.push({
      id: `${piece.id}_cap_l`,
      pieceId: piece.id,
      worldPos: Vec2.add(piece.position, Vec2.rotate({ x: -hw, y: 0 }, rot)),
      normal: Vec2.rotate({ x: -1, y: 0 }, rot),
      type: 'edge',
      angle: rot + Math.PI / 2,
    });
    sockets.push({
      id: `${piece.id}_cap_r`,
      pieceId: piece.id,
      worldPos: Vec2.add(piece.position, Vec2.rotate({ x: hw, y: 0 }, rot)),
      normal: Vec2.rotate({ x: 1, y: 0 }, rot),
      type: 'edge',
      angle: rot - Math.PI / 2,
    });
  } else {
    // Blocks (48x48): 4 face centers
    const faceOffsets = [
      { local: { x: 0, y: -hh }, norm: { x: 0, y: -1 }, name: 'top' },
      { local: { x: hw, y: 0 }, norm: { x: 1, y: 0 }, name: 'right' },
      { local: { x: 0, y: hh }, norm: { x: 0, y: 1 }, name: 'bottom' },
      { local: { x: -hw, y: 0 }, norm: { x: -1, y: 0 }, name: 'left' },
    ];

    faceOffsets.forEach((f) => {
      sockets.push({
        id: `${piece.id}_${f.name}`,
        pieceId: piece.id,
        worldPos: Vec2.add(piece.position, Vec2.rotate(f.local, rot)),
        normal: Vec2.rotate(f.norm, rot),
        type: 'edge',
        angle: rot,
      });
    });
  }

  return sockets;
}

/**
 * Computes snap sockets for environmental anchors
 */
export function getAnchorSnapSockets(anchors: EnvironmentalAnchor[]): SnapSocket[] {
  return anchors.map((anchor) => ({
    id: `anchor_socket_${anchor.id}`,
    anchorId: anchor.id,
    worldPos: { x: anchor.position.x, y: anchor.position.y - 24 }, // Socket sits on top of anchor
    normal: { x: 0, y: -1 },
    type: 'anchor',
    angle: 0,
  }));
}
