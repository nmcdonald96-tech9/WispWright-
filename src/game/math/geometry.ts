/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTRUCTION_UNIT, MATERIAL_CONFIGS, PIECE_DEFINITIONS } from '../config';
import {
  EnvironmentalAnchor,
  LocalCornerDef,
  LocalFaceDef,
  MaterialType,
  PieceCornerId,
  PieceFaceId,
  PlacedPiece,
  SocketKind,
  SnapSocket,
  Vector2,
  WorldCorner,
  WorldFace,
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

  const u = { x: cos, y: sin }; // Local X axis (longitudinal axis for beams)
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
 * Creates an OBB directly from a PlacedPiece instance using authoritative PIECE_DEFINITIONS
 */
export function getOBBFromPiece(piece: PlacedPiece): OBB {
  const config = PIECE_DEFINITIONS[piece.type] ?? MATERIAL_CONFIGS[piece.type];
  return createOBB(piece.position, config.colliderWidth, config.colliderHeight, piece.rotation);
}

/**
 * Returns the world-space longitudinal unit axis vector for a piece at a given rotation.
 */
export function getPieceLongitudinalAxis(rotation: number): Vector2 {
  return { x: Math.cos(rotation), y: Math.sin(rotation) };
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

export interface LocalSocketDef {
  localName: string;
  localPos: Vector2;
  localNormal: Vector2;
  type: 'center' | 'edge';
  socketKind: SocketKind;
  localAngleOffset: number;
}

/**
 * Returns the canonical local-space snap socket definitions for a material type.
 * Derived strictly from PIECE_DEFINITIONS in local coordinates relative to piece center (0, 0).
 */
export function getLocalSocketDefinitions(type: MaterialType): LocalSocketDef[] {
  const config = PIECE_DEFINITIONS[type] ?? MATERIAL_CONFIGS[type];
  const hw = config.width / 2;
  const hh = config.height / 2;
  const halfBlock = CONSTRUCTION_UNIT / 2; // 24 px

  if (type === 'wood_beam') {
    const invSqrt2 = Math.SQRT1_2;
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
      // 3. Flush L-Corner Side Sockets (offset by hh = 12px from each end so a perpendicular 24px-thick beam sits flush with the outer end face)
      {
        localName: 'SIDE_TOP_A',
        localPos: { x: -hw + hh, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_TOP_B',
        localPos: { x: hw - hh, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_A',
        localPos: { x: -hw + hh, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_B',
        localPos: { x: hw - hh, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      // 4. Modular Block-Column Bearing Side Sockets (offset by halfBlock = 24px from each end so a 48px block column aligns flush with the beam end)
      {
        localName: 'SIDE_TOP_SPAN_A',
        localPos: { x: -hw + halfBlock, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_TOP_SPAN_B',
        localPos: { x: hw - halfBlock, y: -hh },
        localNormal: { x: 0, y: -1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_SPAN_A',
        localPos: { x: -hw + halfBlock, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      {
        localName: 'SIDE_BOTTOM_SPAN_B',
        localPos: { x: hw - halfBlock, y: hh },
        localNormal: { x: 0, y: 1 },
        type: 'edge',
        socketKind: 'beam_side',
        localAngleOffset: 0,
      },
      // 5. Endpoint Outer & Inner Corner Sockets (END_A/B OUTER/INNER CORNERS)
      {
        localName: 'END_A_OUTER_CORNER',
        localPos: { x: -hw, y: -hh },
        localNormal: { x: -invSqrt2, y: -invSqrt2 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      {
        localName: 'END_A_INNER_CORNER',
        localPos: { x: -hw, y: hh },
        localNormal: { x: -invSqrt2, y: invSqrt2 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      {
        localName: 'END_B_OUTER_CORNER',
        localPos: { x: hw, y: -hh },
        localNormal: { x: invSqrt2, y: -invSqrt2 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      {
        localName: 'END_B_INNER_CORNER',
        localPos: { x: hw, y: hh },
        localNormal: { x: invSqrt2, y: invSqrt2 },
        type: 'edge',
        socketKind: 'beam_corner',
        localAngleOffset: 0,
      },
      // Compatibility aliases for existing tests
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
      // 6. Center Socket
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

  // Standard Blocks (1.0 × 1.0 units = 48 × 48 px):
  // 4 face centers + 4 first-class corners + center
  const invSqrt2 = Math.SQRT1_2;
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
    // First-class Block Corner Sockets (TOP_LEFT_CORNER, TOP_RIGHT_CORNER, BOTTOM_LEFT_CORNER, BOTTOM_RIGHT_CORNER)
    {
      localName: 'TOP_LEFT_CORNER',
      localPos: { x: -hw, y: -hh },
      localNormal: { x: -invSqrt2, y: -invSqrt2 },
      type: 'edge',
      socketKind: 'block_corner',
      localAngleOffset: 0,
    },
    {
      localName: 'TOP_RIGHT_CORNER',
      localPos: { x: hw, y: -hh },
      localNormal: { x: invSqrt2, y: -invSqrt2 },
      type: 'edge',
      socketKind: 'block_corner',
      localAngleOffset: 0,
    },
    {
      localName: 'BOTTOM_LEFT_CORNER',
      localPos: { x: -hw, y: hh },
      localNormal: { x: -invSqrt2, y: invSqrt2 },
      type: 'edge',
      socketKind: 'block_corner',
      localAngleOffset: 0,
    },
    {
      localName: 'BOTTOM_RIGHT_CORNER',
      localPos: { x: hw, y: hh },
      localNormal: { x: invSqrt2, y: invSqrt2 },
      type: 'edge',
      socketKind: 'block_corner',
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
 * Normalizes an angle in radians to the signed interval (-PI, PI].
 */
export function normalizeAngleSigned(angleRad: number): number {
  let a = angleRad % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/**
 * Computes all available snap sockets for a placed piece or (type, position, rotation) in world space.
 */
export function getPieceSnapSockets(
  pieceOrType: PlacedPiece | MaterialType,
  position?: Vector2,
  rotation?: number,
  pieceId = 'candidate',
): SnapSocket[] {
  if (typeof pieceOrType === 'string') {
    return getPieceSnapSocketsForTransform(
      pieceOrType,
      position ?? { x: 0, y: 0 },
      rotation ?? 0,
      pieceId,
    );
  }
  return getPieceSnapSocketsForTransform(
    pieceOrType.type,
    pieceOrType.position,
    pieceOrType.rotation,
    pieceOrType.id,
  );
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

/**
 * Returns the canonical local-space corner definitions for a piece type.
 * Exposes TOP_LEFT_CORNER, TOP_RIGHT_CORNER, BOTTOM_LEFT_CORNER, BOTTOM_RIGHT_CORNER for blocks,
 * and END_A_OUTER_CORNER, END_A_INNER_CORNER, END_B_OUTER_CORNER, END_B_INNER_CORNER for wood_beam.
 */
export function getLocalCornerDefinitions(type: MaterialType): LocalCornerDef[] {
  const config = PIECE_DEFINITIONS[type] ?? MATERIAL_CONFIGS[type];
  const hw = config.width / 2;
  const hh = config.height / 2;
  const invSqrt2 = Math.SQRT1_2;

  if (type === 'wood_beam') {
    return [
      {
        id: 'END_A_OUTER_CORNER',
        localPos: { x: -hw, y: -hh },
        localNormal: { x: -invSqrt2, y: -invSqrt2 },
        adjacentFaces: ['END_A_FACE', 'TOP_FACE'],
        jointCapable: true,
      },
      {
        id: 'END_A_INNER_CORNER',
        localPos: { x: -hw, y: hh },
        localNormal: { x: -invSqrt2, y: invSqrt2 },
        adjacentFaces: ['END_A_FACE', 'BOTTOM_FACE'],
        jointCapable: true,
      },
      {
        id: 'END_B_OUTER_CORNER',
        localPos: { x: hw, y: -hh },
        localNormal: { x: invSqrt2, y: -invSqrt2 },
        adjacentFaces: ['END_B_FACE', 'TOP_FACE'],
        jointCapable: true,
      },
      {
        id: 'END_B_INNER_CORNER',
        localPos: { x: hw, y: hh },
        localNormal: { x: invSqrt2, y: invSqrt2 },
        adjacentFaces: ['END_B_FACE', 'BOTTOM_FACE'],
        jointCapable: true,
      },
    ];
  }

  const jointCapable = config.jointCapable;
  return [
    {
      id: 'TOP_LEFT_CORNER',
      localPos: { x: -hw, y: -hh },
      localNormal: { x: -invSqrt2, y: -invSqrt2 },
      adjacentFaces: ['TOP_FACE', 'LEFT_FACE'],
      jointCapable,
    },
    {
      id: 'TOP_RIGHT_CORNER',
      localPos: { x: hw, y: -hh },
      localNormal: { x: invSqrt2, y: -invSqrt2 },
      adjacentFaces: ['TOP_FACE', 'RIGHT_FACE'],
      jointCapable,
    },
    {
      id: 'BOTTOM_LEFT_CORNER',
      localPos: { x: -hw, y: hh },
      localNormal: { x: -invSqrt2, y: invSqrt2 },
      adjacentFaces: ['BOTTOM_FACE', 'LEFT_FACE'],
      jointCapable,
    },
    {
      id: 'BOTTOM_RIGHT_CORNER',
      localPos: { x: hw, y: hh },
      localNormal: { x: invSqrt2, y: invSqrt2 },
      adjacentFaces: ['BOTTOM_FACE', 'RIGHT_FACE'],
      jointCapable,
    },
  ];
}

export const getLocalPieceCorners = getLocalCornerDefinitions;

/**
 * Transforms local-space corner definitions into world coordinates.
 */
export function getPieceCornersForTransform(
  type: MaterialType,
  position: Vector2,
  rotation: number,
  pieceId = 'candidate',
): WorldCorner[] {
  const defs = getLocalCornerDefinitions(type);
  return defs.map((d) => ({
    ...d,
    pieceId,
    pieceType: type,
    worldPos: Vec2.add(position, Vec2.rotate(d.localPos, rotation)),
    worldNormal: Vec2.rotate(d.localNormal, rotation),
  }));
}

/**
 * Returns world-space corners for a PlacedPiece.
 */
export function getPieceCorners(
  pieceOrType: PlacedPiece | MaterialType,
  position?: Vector2,
  rotation?: number,
  pieceId = 'candidate',
): WorldCorner[] {
  if (typeof pieceOrType === 'string') {
    return getPieceCornersForTransform(
      pieceOrType,
      position ?? { x: 0, y: 0 },
      rotation ?? 0,
      pieceId,
    );
  }
  return getPieceCornersForTransform(
    pieceOrType.type,
    pieceOrType.position,
    pieceOrType.rotation,
    pieceOrType.id,
  );
}

/**
 * Returns the canonical local-space face definitions for a piece type.
 * Exposes END_A_FACE, END_B_FACE, TOP_FACE, BOTTOM_FACE, SIDE_A_FACE, SIDE_B_FACE, SIDE_FACE_A, SIDE_FACE_B for wood_beam,
 * and TOP_FACE, BOTTOM_FACE, LEFT_FACE, RIGHT_FACE for blocks.
 */
export function getLocalFaceDefinitions(type: MaterialType): LocalFaceDef[] {
  const config = PIECE_DEFINITIONS[type] ?? MATERIAL_CONFIGS[type];
  const hw = config.width / 2;
  const hh = config.height / 2;

  if (type === 'wood_beam') {
    return [
      {
        id: 'END_A_FACE',
        center: { x: -hw, y: 0 },
        start: { x: -hw, y: -hh },
        end: { x: -hw, y: hh },
        normal: { x: -1, y: 0 },
        tangent: { x: 0, y: 1 },
        length: config.height,
        jointCapable: true,
      },
      {
        id: 'END_B_FACE',
        center: { x: hw, y: 0 },
        start: { x: hw, y: -hh },
        end: { x: hw, y: hh },
        normal: { x: 1, y: 0 },
        tangent: { x: 0, y: 1 },
        length: config.height,
        jointCapable: true,
      },
      {
        id: 'TOP_FACE',
        center: { x: 0, y: -hh },
        start: { x: -hw, y: -hh },
        end: { x: hw, y: -hh },
        normal: { x: 0, y: -1 },
        tangent: { x: 1, y: 0 },
        length: config.width,
        jointCapable: true,
      },
      {
        id: 'BOTTOM_FACE',
        center: { x: 0, y: hh },
        start: { x: -hw, y: hh },
        end: { x: hw, y: hh },
        normal: { x: 0, y: 1 },
        tangent: { x: 1, y: 0 },
        length: config.width,
        jointCapable: true,
      },
      {
        id: 'SIDE_A_FACE',
        center: { x: 0, y: -hh },
        start: { x: -hw, y: -hh },
        end: { x: hw, y: -hh },
        normal: { x: 0, y: -1 },
        tangent: { x: 1, y: 0 },
        length: config.width,
        jointCapable: true,
      },
      {
        id: 'SIDE_B_FACE',
        center: { x: 0, y: hh },
        start: { x: -hw, y: hh },
        end: { x: hw, y: hh },
        normal: { x: 0, y: 1 },
        tangent: { x: 1, y: 0 },
        length: config.width,
        jointCapable: true,
      },
      {
        id: 'SIDE_FACE_A',
        center: { x: 0, y: -hh },
        start: { x: -hw, y: -hh },
        end: { x: hw, y: -hh },
        normal: { x: 0, y: -1 },
        tangent: { x: 1, y: 0 },
        length: config.width,
        jointCapable: true,
      },
      {
        id: 'SIDE_FACE_B',
        center: { x: 0, y: hh },
        start: { x: -hw, y: hh },
        end: { x: hw, y: hh },
        normal: { x: 0, y: 1 },
        tangent: { x: 1, y: 0 },
        length: config.width,
        jointCapable: true,
      },
    ];
  }

  const jointCapable = config.jointCapable;
  return [
    {
      id: 'TOP_FACE',
      center: { x: 0, y: -hh },
      start: { x: -hw, y: -hh },
      end: { x: hw, y: -hh },
      normal: { x: 0, y: -1 },
      tangent: { x: 1, y: 0 },
      length: config.width,
      jointCapable,
    },
    {
      id: 'BOTTOM_FACE',
      center: { x: 0, y: hh },
      start: { x: -hw, y: hh },
      end: { x: hw, y: hh },
      normal: { x: 0, y: 1 },
      tangent: { x: 1, y: 0 },
      length: config.width,
      jointCapable,
    },
    {
      id: 'LEFT_FACE',
      center: { x: -hw, y: 0 },
      start: { x: -hw, y: -hh },
      end: { x: -hw, y: hh },
      normal: { x: -1, y: 0 },
      tangent: { x: 0, y: 1 },
      length: config.height,
      jointCapable,
    },
    {
      id: 'RIGHT_FACE',
      center: { x: hw, y: 0 },
      start: { x: hw, y: -hh },
      end: { x: hw, y: hh },
      normal: { x: 1, y: 0 },
      tangent: { x: 0, y: 1 },
      length: config.height,
      jointCapable,
    },
  ];
}

export const getLocalPieceFaces = getLocalFaceDefinitions;

/**
 * Transforms local-space face definitions into world coordinates.
 */
export function getPieceFacesForTransform(
  type: MaterialType,
  position: Vector2,
  rotation: number,
  pieceId = 'candidate',
): WorldFace[] {
  const defs = getLocalFaceDefinitions(type);
  return defs.map((d) => ({
    ...d,
    faceId: d.id,
    pieceId,
    pieceType: type,
    worldCenter: Vec2.add(position, Vec2.rotate(d.center, rotation)),
    worldStart: Vec2.add(position, Vec2.rotate(d.start, rotation)),
    worldEnd: Vec2.add(position, Vec2.rotate(d.end, rotation)),
    worldNormal: Vec2.rotate(d.normal, rotation),
    worldTangent: Vec2.rotate(d.tangent, rotation),
  }));
}

/**
 * Returns world-space faces for a PlacedPiece.
 */
export function getPieceFaces(
  pieceOrType: PlacedPiece | MaterialType,
  position?: Vector2,
  rotation?: number,
  pieceId = 'candidate',
): WorldFace[] {
  if (typeof pieceOrType === 'string') {
    return getPieceFacesForTransform(
      pieceOrType,
      position ?? { x: 0, y: 0 },
      rotation ?? 0,
      pieceId,
    );
  }
  return getPieceFacesForTransform(
    pieceOrType.type,
    pieceOrType.position,
    pieceOrType.rotation,
    pieceOrType.id,
  );
}

/**
 * Returns a complete world-space feature dictionary for a piece (for tests and diagnostics).
 * Exposes all required Block features (TOP_FACE, BOTTOM_FACE, LEFT_FACE, RIGHT_FACE,
 * TOP_LEFT_CORNER, TOP_RIGHT_CORNER, BOTTOM_LEFT_CORNER, BOTTOM_RIGHT_CORNER,
 * FACE_CENTER_TOP, FACE_CENTER_BOTTOM, FACE_CENTER_LEFT, FACE_CENTER_RIGHT, CENTER)
 * and all required Timber Beam features (END_A_FACE, END_B_FACE, END_A_CENTER, END_B_CENTER,
 * END_A_INNER_CORNER, END_A_OUTER_CORNER, END_B_INNER_CORNER, END_B_OUTER_CORNER,
 * TOP_FACE, BOTTOM_FACE, SIDE_FACE_A, SIDE_FACE_B, CENTER, longitudinalAxis).
 */
export function getPieceWorldFeatures(
  type: MaterialType,
  position: Vector2,
  rotation: number,
  pieceId = 'candidate',
): {
  faces: Record<string, WorldFace>;
  corners: Record<string, WorldCorner>;
  points: Record<string, Vector2>;
  normals: Record<string, Vector2>;
  longitudinalAxis: Vector2;
} {
  const worldFaces = getPieceFacesForTransform(type, position, rotation, pieceId);
  const worldCorners = getPieceCornersForTransform(type, position, rotation, pieceId);
  const worldSockets = getPieceSnapSocketsForTransform(type, position, rotation, pieceId);

  const faces: Record<string, WorldFace> = {};
  const corners: Record<string, WorldCorner> = {};
  const points: Record<string, Vector2> = { CENTER: { ...position } };
  const normals: Record<string, Vector2> = {};

  for (const f of worldFaces) {
    faces[f.id] = f;
    points[f.id] = { ...f.worldCenter };
    normals[f.id] = { ...f.worldNormal };
  }
  for (const c of worldCorners) {
    corners[c.id] = c;
    points[c.id] = { ...c.worldPos };
    normals[c.id] = { ...c.worldNormal };
  }
  for (const s of worldSockets) {
    if (s.localName) {
      points[s.localName] = { ...s.worldPos };
      normals[s.localName] = { ...s.normal };
    }
  }

  if (type !== 'wood_beam') {
    if (faces.TOP_FACE) {
      points.FACE_CENTER_TOP = { ...faces.TOP_FACE.worldCenter };
      normals.FACE_CENTER_TOP = { ...faces.TOP_FACE.worldNormal };
    }
    if (faces.BOTTOM_FACE) {
      points.FACE_CENTER_BOTTOM = { ...faces.BOTTOM_FACE.worldCenter };
      normals.FACE_CENTER_BOTTOM = { ...faces.BOTTOM_FACE.worldNormal };
    }
    if (faces.LEFT_FACE) {
      points.FACE_CENTER_LEFT = { ...faces.LEFT_FACE.worldCenter };
      normals.FACE_CENTER_LEFT = { ...faces.LEFT_FACE.worldNormal };
    }
    if (faces.RIGHT_FACE) {
      points.FACE_CENTER_RIGHT = { ...faces.RIGHT_FACE.worldCenter };
      normals.FACE_CENTER_RIGHT = { ...faces.RIGHT_FACE.worldNormal };
    }
  }

  return {
    faces,
    corners,
    points,
    normals,
    longitudinalAxis: getPieceLongitudinalAxis(rotation),
  };
}

/**
 * Projects a 2D point onto a finite world-space face segment.
 */
export function getClosestPointOnFace(
  point: Vector2,
  face: WorldFace,
): { point: Vector2; distance: number; t: number } {
  const seg = Vec2.sub(face.worldEnd, face.worldStart);
  const segLenSq = seg.x * seg.x + seg.y * seg.y;
  if (segLenSq < 1e-6) {
    return {
      point: { ...face.worldCenter },
      distance: Vec2.distance(point, face.worldCenter),
      t: 0.5,
    };
  }
  const rel = Vec2.sub(point, face.worldStart);
  const rawT = (rel.x * seg.x + rel.y * seg.y) / segLenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const closest = {
    x: face.worldStart.x + seg.x * t,
    y: face.worldStart.y + seg.y * t,
  };
  return {
    point: closest,
    distance: Vec2.distance(point, closest),
    t,
  };
}

/**
 * Maps a local socket name to its corresponding canonical PieceFaceId.
 */
export function mapSocketToFaceId(
  localSocketName: string | undefined,
  pieceType: MaterialType,
): PieceFaceId | null {
  if (!localSocketName) return null;
  if (pieceType === 'wood_beam') {
    if (localSocketName.startsWith('END_A')) return 'END_A_FACE';
    if (localSocketName.startsWith('END_B')) return 'END_B_FACE';
    if (localSocketName.startsWith('SIDE_TOP')) return 'TOP_FACE';
    if (localSocketName.startsWith('SIDE_BOTTOM')) return 'BOTTOM_FACE';
  } else {
    if (localSocketName === 'TOP_EDGE' || localSocketName.startsWith('TOP_')) return 'TOP_FACE';
    if (localSocketName === 'BOTTOM_EDGE' || localSocketName.startsWith('BOTTOM_')) return 'BOTTOM_FACE';
    if (localSocketName === 'LEFT_EDGE') return 'LEFT_FACE';
    if (localSocketName === 'RIGHT_EDGE') return 'RIGHT_FACE';
  }
  return null;
}

/**
 * Maps a local socket name to its corresponding canonical PieceCornerId when applicable.
 */
export function mapSocketToCornerId(
  localSocketName: string | undefined,
): PieceCornerId | null {
  if (!localSocketName) return null;
  const cornerIds: PieceCornerId[] = [
    'TOP_LEFT_CORNER',
    'TOP_RIGHT_CORNER',
    'BOTTOM_LEFT_CORNER',
    'BOTTOM_RIGHT_CORNER',
    'END_A_INNER_CORNER',
    'END_A_OUTER_CORNER',
    'END_B_INNER_CORNER',
    'END_B_OUTER_CORNER',
    'END_A_TOP_CORNER',
    'END_A_BOTTOM_CORNER',
    'END_B_TOP_CORNER',
    'END_B_BOTTOM_CORNER',
  ];
  return cornerIds.includes(localSocketName as PieceCornerId)
    ? (localSocketName as PieceCornerId)
    : null;
}


