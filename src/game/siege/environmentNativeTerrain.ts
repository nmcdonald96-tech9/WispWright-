/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import { createOBB } from '../math/geometry';
import { MaterialType, PlacedPiece, Vector2 } from '../types';
import {
  TerrainBodyDefinition,
  TerrainCollisionRole,
  TerrainProfileDefinition,
} from './terrainDefinitions';

export type EnvironmentConnectionType =
  | 'FOUNDATION'
  | 'BEAM_FACE'
  | 'BEAM_ENDPOINT'
  | 'RAFTER_SEAT'
  | 'ANCHOR_SOCKET';

export type EnvironmentStructuralStrengthClass = 'LIGHT' | 'STANDARD' | 'HEAVY';

export interface EnvironmentAttachmentSurface {
  id: string;
  terrainBodyId: string;
  localStart: Vector2;
  localEnd: Vector2;
  outwardNormal: Vector2;
  connectionTypes: readonly EnvironmentConnectionType[];
  materialCompatibility: readonly MaterialType[];
  minimumClearancePx: number;
  maximumConnectionSpanPx?: number;
  structuralStrengthClass: EnvironmentStructuralStrengthClass;
}

export interface EnvironmentNativeTerrainProfile extends TerrainProfileDefinition {
  attachmentSurfaces: readonly EnvironmentAttachmentSurface[];
}

export type TerrainPlacementConflictReason =
  | 'TERRAIN_PENETRATION'
  | 'INSUFFICIENT_CLEARANCE'
  | 'UNAUTHORIZED_ATTACHMENT_SURFACE';

export interface TerrainPlacementConflict {
  terrainBodyId: string;
  pieceId: string | null;
  collisionRole: TerrainCollisionRole;
  overlapDepthPx: number;
  reason: TerrainPlacementConflictReason;
}

export interface TerrainPlacementValidationResult {
  valid: boolean;
  conflicts: readonly TerrainPlacementConflict[];
}

export interface EnvironmentAttachmentValidationResult {
  valid: boolean;
  errors: readonly string[];
}

const EPSILON = 1e-6;
const MAX_CLEARANCE_PX = 96;

function rotateAndTranslate(local: Vector2, position: Vector2, rotation: number): Vector2 {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: position.x + local.x * cos - local.y * sin,
    y: position.y + local.x * sin + local.y * cos,
  };
}

export function terrainBodyWorldVertices(body: TerrainBodyDefinition): Vector2[] {
  const localVertices: readonly Vector2[] =
    body.shape.kind === 'RECTANGLE'
      ? [
          { x: -body.shape.widthPx / 2, y: -body.shape.heightPx / 2 },
          { x: body.shape.widthPx / 2, y: -body.shape.heightPx / 2 },
          { x: body.shape.widthPx / 2, y: body.shape.heightPx / 2 },
          { x: -body.shape.widthPx / 2, y: body.shape.heightPx / 2 },
        ]
      : body.shape.vertices;
  return localVertices.map((vertex) =>
    rotateAndTranslate(vertex, body.position, body.rotationRad),
  );
}

function pointSegmentDistance(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= EPSILON) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function pointOnPolygonBoundary(point: Vector2, vertices: readonly Vector2[], tolerance = 0.01): boolean {
  for (let index = 0; index < vertices.length; index++) {
    if (pointSegmentDistance(point, vertices[index], vertices[(index + 1) % vertices.length]) <= tolerance) {
      return true;
    }
  }
  return false;
}

function pointInConvexPolygon(point: Vector2, vertices: readonly Vector2[]): boolean {
  let sign = 0;
  for (let index = 0; index < vertices.length; index++) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) <= EPSILON) continue;
    const nextSign = Math.sign(cross);
    if (sign === 0) sign = nextSign;
    else if (sign !== nextSign) return false;
  }
  return true;
}

function project(vertices: readonly Vector2[], axis: Vector2): { min: number; max: number } {
  const values = vertices.map((vertex) => vertex.x * axis.x + vertex.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

function convexOverlapDepth(a: readonly Vector2[], b: readonly Vector2[]): number {
  let minimum = Infinity;
  for (const vertices of [a, b]) {
    for (let index = 0; index < vertices.length; index++) {
      const current = vertices[index];
      const next = vertices[(index + 1) % vertices.length];
      const edge = { x: next.x - current.x, y: next.y - current.y };
      const length = Math.hypot(edge.x, edge.y);
      if (length <= EPSILON) continue;
      const axis = { x: -edge.y / length, y: edge.x / length };
      const pa = project(a, axis);
      const pb = project(b, axis);
      const depth = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
      if (depth <= EPSILON) return 0;
      minimum = Math.min(minimum, depth);
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

export function validateEnvironmentAttachmentSurfaces(
  profile: EnvironmentNativeTerrainProfile,
): EnvironmentAttachmentValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const bodies = new Map(profile.bodies.map((body) => [body.id, body]));

  for (const surface of profile.attachmentSurfaces) {
    if (ids.has(surface.id)) errors.push(`duplicate attachment surface id: ${surface.id}`);
    ids.add(surface.id);
    const body = bodies.get(surface.terrainBodyId);
    if (!body) {
      errors.push(`attachment ${surface.id} references unknown terrain body ${surface.terrainBodyId}`);
      continue;
    }
    if (surface.connectionTypes.length === 0) errors.push(`attachment ${surface.id} needs a connection type`);
    if (surface.materialCompatibility.length === 0) errors.push(`attachment ${surface.id} needs material compatibility`);
    if (!Number.isFinite(surface.minimumClearancePx) || surface.minimumClearancePx < 0 || surface.minimumClearancePx > MAX_CLEARANCE_PX) {
      errors.push(`attachment ${surface.id} minimumClearancePx is invalid`);
    }
    const normalLength = Math.hypot(surface.outwardNormal.x, surface.outwardNormal.y);
    if (Math.abs(normalLength - 1) > 0.001) errors.push(`attachment ${surface.id} outwardNormal must be normalized`);
    const localVertices = body.shape.kind === 'RECTANGLE'
      ? [
          { x: -body.shape.widthPx / 2, y: -body.shape.heightPx / 2 },
          { x: body.shape.widthPx / 2, y: -body.shape.heightPx / 2 },
          { x: body.shape.widthPx / 2, y: body.shape.heightPx / 2 },
          { x: -body.shape.widthPx / 2, y: body.shape.heightPx / 2 },
        ]
      : body.shape.vertices;
    if (!pointOnPolygonBoundary(surface.localStart, localVertices) || !pointOnPolygonBoundary(surface.localEnd, localVertices)) {
      errors.push(`attachment ${surface.id} endpoints must lie on the owning terrain boundary`);
    }
    const midpoint = {
      x: (surface.localStart.x + surface.localEnd.x) / 2,
      y: (surface.localStart.y + surface.localEnd.y) / 2,
    };
    const probe = {
      x: midpoint.x + surface.outwardNormal.x * 0.5,
      y: midpoint.y + surface.outwardNormal.y * 0.5,
    };
    if (pointInConvexPolygon(probe, localVertices)) {
      errors.push(`attachment ${surface.id} outwardNormal points into terrain`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validatePieceAgainstTerrain(
  piece: PlacedPiece,
  profile: TerrainProfileDefinition,
  clearancePx = 0,
): TerrainPlacementValidationResult {
  const config = MATERIAL_CONFIGS[piece.type];
  const pieceVertices = createOBB(piece.position, config.width, config.height, piece.rotation).vertices;
  const conflicts: TerrainPlacementConflict[] = [];

  for (const body of profile.bodies) {
    if (!body.blocksConstruction) continue;
    const terrainVertices = terrainBodyWorldVertices(body);
    const overlapDepth = convexOverlapDepth(pieceVertices, terrainVertices);
    if (overlapDepth > EPSILON) {
      conflicts.push({
        terrainBodyId: body.id,
        pieceId: piece.id || null,
        collisionRole: body.collisionRole,
        overlapDepthPx: overlapDepth,
        reason: 'TERRAIN_PENETRATION',
      });
      continue;
    }
    if (clearancePx > 0) {
      const minDistance = Math.min(
        ...pieceVertices.flatMap((vertex) =>
          terrainVertices.map((terrainVertex) =>
            Math.hypot(vertex.x - terrainVertex.x, vertex.y - terrainVertex.y),
          ),
        ),
      );
      if (minDistance < clearancePx) {
        conflicts.push({
          terrainBodyId: body.id,
          pieceId: piece.id || null,
          collisionRole: body.collisionRole,
          overlapDepthPx: 0,
          reason: 'INSUFFICIENT_CLEARANCE',
        });
      }
    }
  }
  return { valid: conflicts.length === 0, conflicts };
}
