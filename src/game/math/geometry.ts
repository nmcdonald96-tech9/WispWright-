/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import {
  EnvironmentalAnchor,
  MaterialType,
  PlacedPiece,
  SocketKind,
  SnapSocket,
  Vector2,
} from '../types';

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
  const d = Vec2.sub(point, obb.center);
  const localX = Vec2.dot(d, obb.axes[0]);
  const localY = Vec2.dot(d, obb.axes[1]);

  return Math.abs(localX) <= obb.halfWidth && Math.abs(localY) <= obb.halfHeight;
}

/**
 * Computes the shortest Euclidean distance from a 2D point to the surface/interior of an OBB.
 * Returns 0 if the point is inside or on the boundary of the OBB.
 */
export function getDistancePointToOBB(point: Vector2, obb: OBB): number {
  const d = Vec2.sub(point, obb.center);
  const localX = Vec2.dot(d, obb.axes[0]);
  const localY = Vec2.dot(d, obb.axes[1]);

  const dx = Math.max(0, Math.abs(localX) - obb.halfWidth);
  const dy = Math.max(0, Math.abs(localY) - obb.halfHeight);
  return Math.hypot(dx, dy);
}

/**
 * Checks whether a circle (center, radius) overlaps an OBB, returning penetration depth.
 */
export function checkCircleOBBOverlap(
  center: Vector2,
  radius: number,
  obb: OBB,
): { overlaps: boolean; penetrationDepth: number } {
  const d = Vec2.sub(center, obb.center);
  const localX = Vec2.dot(d, obb.axes[0]);
  const localY = Vec2.dot(d, obb.axes[1]);

  const absX = Math.abs(localX);
  const absY = Math.abs(localY);

  if (absX <= obb.halfWidth && absY <= obb.halfHeight) {
    const insideDepth = Math.min(obb.halfWidth - absX, obb.halfHeight - absY) + radius;
    return { overlaps: true, penetrationDepth: insideDepth };
  }

  const dx = Math.max(0, absX - obb.halfWidth);
  const dy = Math.max(0, absY - obb.halfHeight);
  const dist = Math.hypot(dx, dy);

  if (dist < radius) {
    return { overlaps: true, penetrationDepth: radius - dist };
  }
  return { overlaps: false, penetrationDepth: 0 };
}

/**
 * Returns the minimum penetration depth along separating axes if two OBBs overlap (> slop),
 * or 0 if they do not overlap.
 */
export function getOBBPenetrationDepth(a: OBB, b: OBB, slop = 1.0): number {
  const axes = [a.axes[0], a.axes[1], b.axes[0], b.axes[1]];
  let minOverlap = Infinity;

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

    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= slop) {
      return 0; // Separated
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
    }
  }

  return Math.max(0, minOverlap);
}

/**
 * Separating Axis Theorem (SAT) overlap check between two OBBs
 */
export function checkOBBOverlap(a: OBB, b: OBB, slop = 1.0): boolean {
  return getOBBPenetrationDepth(a, b, slop) > 0;
}

interface LocalSocketDef {
  localName: string;
  localPos: Vector2;
  localNormal: Vector2;
  type: 'center' | 'edge';
  socketKind: SocketKind;
  localAngleOffset: number;
}

/**
 * Returns the canonical local-space snap socket definitions for a material type.
 * Defined strictly in local coordinates relative to piece center (0, 0).
 */
export function getLocalSocketDefinitions(type: MaterialType): LocalSocketDef[] {
  const config = MATERIAL_CONFIGS[type];
  const hw = config.width / 2;
  const hh = config.height / 2;

  if (type === 'wood_beam') {
    return [
      // 1. Primary Endpoints (END_A_CENTER and END_B_CENTER)
      {
        localName: 'END_A_CENTER',
        localPos: { x: -hw, y: 0 },
        localNormal: { x: -1, y: 0 },
        type: 'edge',
        socketKind: 'beam_end',
        localAngleOffset: 0,
      },
      {
        localName: 'END_B_CENTER',
        localPos: { x: hw, y: 0 },
        localNormal: { x: 1, y: 0 },
        type: 'edge',
        socketKind: 'beam_end',
        localAngleOffset: 0,
      },
      // 2. Primary Side Centers (SIDE_TOP_CENTER and SIDE_BOTTOM_CENTER)
      {
        localName: 'SIDE_TOP_CENTER',
        localPos: { x: 0, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_CENTER',
        localPos: { x: 0, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      // 3. Span Side Sockets (for resting across columns or supporting posts at +/-36px)
      {
        localName: 'SIDE_TOP_A',
        localPos: { x: -hw + 24, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_TOP_B',
        localPos: { x: hw - 24, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_A',
        localPos: { x: -hw + 24, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_B',
        localPos: { x: hw - 24, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      // 4. Endpoint Corner Sockets (END_A/B TOP/BOTTOM CORNERS)
      {
        localName: 'END_A_TOP_CORNER',
        localPos: { x: -hw, y: -hh },
        localNormal: { x: -1, y: 0 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      {
        localName: 'END_A_BOTTOM_CORNER',
        localPos: { x: -hw, y: hh },
        localNormal: { x: -1, y: 0 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      {
        localName: 'END_B_TOP_CORNER',
        localPos: { x: hw, y: -hh },
        localNormal: { x: 1, y: 0 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      {
        localName: 'END_B_BOTTOM_CORNER',
        localPos: { x: hw, y: hh },
        localNormal: { x: 1, y: 0 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      // 5. Center Socket
      {
        localName: 'CENTER',
        localPos: { x: 0, y: 0 },
        localNormal: { x: 0, y: -1 },
        type: 'center',
        socketKind: 'center',
        localAngleOffset: 0,
      },
    ];
  }

  // Blocks (48x48): 4 face edges + center
  return [
    {
      localName: 'TOP_EDGE',
      localPos: { x: 0, y: -hh },
      localNormal: { x: 0, y: -1 },
      type: 'edge',
      socketKind: 'block_edge',
      localAngleOffset: 0,
    },
    {
      localName: 'RIGHT_EDGE',
      localPos: { x: hw, y: 0 },
      localNormal: { x: 1, y: 0 },
      type: 'edge',
      socketKind: 'block_edge',
      localAngleOffset: 0,
    },
    {
      localName: 'BOTTOM_EDGE',
      localPos: { x: 0, y: hh },
      localNormal: { x: 0, y: 1 },
      type: 'edge',
      socketKind: 'block_edge',
      localAngleOffset: 0,
    },
    {
      localName: 'LEFT_EDGE',
      localPos: { x: -hw, y: 0 },
      localNormal: { x: -1, y: 0 },
      type: 'edge',
      socketKind: 'block_edge',
      localAngleOffset: 0,
    },
    {
      localName: 'CENTER',
      localPos: { x: 0, y: 0 },
      localNormal: { x: 0, y: -1 },
      type: 'center',
      socketKind: 'center',
      localAngleOffset: 0,
    },
  ];
}

/**
 * Transforms local-space sockets into world coordinates for any piece type, position, and rotation.
 */
export function getPieceSnapSocketsForTransform(
  type: MaterialType,
  position: Vector2,
  rotation: number,
  pieceId = 'candidate',
): SnapSocket[] {
  const defs = getLocalSocketDefinitions(type);
  return defs.map((d) => ({
    id: `${pieceId}_${d.localName}`,
    pieceId,
    localName: d.localName,
    localPos: { ...d.localPos },
    localNormal: { ...d.localNormal },
    worldPos: Vec2.add(position, Vec2.rotate(d.localPos, rotation)),
    normal: Vec2.rotate(d.localNormal, rotation),
    type: d.type,
    socketKind: d.socketKind,
    angle: rotation + d.localAngleOffset,
  }));
}

/**
 * Computes all available snap sockets for a placed piece in world space.
 */
export function getPieceSnapSockets(piece: PlacedPiece): SnapSocket[] {
  return getPieceSnapSocketsForTransform(piece.type, piece.position, piece.rotation, piece.id);
}

/**
 * Computes snap sockets for environmental anchors
 */
export function getAnchorSnapSockets(anchors: EnvironmentalAnchor[]): SnapSocket[] {
  return anchors.map((anchor) => ({
    id: `anchor_socket_${anchor.id}`,
    anchorId: anchor.id,
    localName: 'ANCHOR_TOP',
    worldPos: { x: anchor.position.x, y: anchor.position.y - 24 }, // Socket sits on top of anchor
    normal: { x: 0, y: -1 },
    type: 'anchor',
    socketKind: 'anchor',
    angle: 0,
  }));
}
