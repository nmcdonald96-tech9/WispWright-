/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WORLD_CONFIG } from '../config';
import { Vector2 } from '../types';
import { TerrainProfileId } from './levelDefinitions';

export type TerrainCollisionRole =
  | 'BEDROCK'
  | 'BALLISTIC_OBSTRUCTION'
  | 'DEFLECTOR'
  | 'LEDGE';

export interface TerrainRectangleShape {
  kind: 'RECTANGLE';
  widthPx: number;
  heightPx: number;
}

export interface TerrainPolygonShape {
  kind: 'POLYGON';
  vertices: readonly Vector2[];
}

export type TerrainBodyShape = TerrainRectangleShape | TerrainPolygonShape;

export interface TerrainBodyDefinition {
  id: string;
  shape: TerrainBodyShape;
  position: Vector2;
  rotationRad: number;
  collisionRole: TerrainCollisionRole;
  friction: number;
  restitution: number;
  blocksProjectiles: boolean;
  blocksConstruction: boolean;
}

export interface TerrainProfileDefinition {
  terrainProfileId: TerrainProfileId;
  bodies: readonly TerrainBodyDefinition[];
  cameraPaddingPx: number;
}

export interface TerrainValidationResult {
  valid: boolean;
  errors: readonly string[];
}

const MAX_DIMENSION_PX = 5000;
const MAX_ABSOLUTE_COORDINATE_PX = 10000;
const MAX_POLYGON_VERTICES = 32;
const EPSILON = 1e-6;

export const FLAT_SANCTUARY_TERRAIN: TerrainProfileDefinition = {
  terrainProfileId: 'FLAT_SANCTUARY',
  cameraPaddingPx: 0,
  bodies: [
    {
      id: 'terrain_flat_sanctuary_bedrock',
      shape: { kind: 'RECTANGLE', widthPx: 2600, heightPx: 200 },
      position: { x: 100, y: WORLD_CONFIG.groundY + 100 },
      rotationRad: 0,
      collisionRole: 'BEDROCK',
      friction: 0.95,
      restitution: 0,
      blocksProjectiles: true,
      blocksConstruction: true,
    },
  ],
};

export const CRAGGY_RIDGE_TERRAIN: TerrainProfileDefinition = {
  terrainProfileId: 'CRAGGY_RIDGE_HIGH_ARC',
  cameraPaddingPx: 96,
  bodies: [
    {
      ...FLAT_SANCTUARY_TERRAIN.bodies[0],
      id: 'terrain_craggy_ridge_bedrock',
    },
    {
      id: 'terrain_craggy_ridge_berm',
      shape: {
        kind: 'POLYGON',
        vertices: [
          { x: -210, y: 0 },
          { x: 150, y: 0 },
          { x: 118, y: -92 },
          { x: 16, y: -202 },
          { x: -104, y: -154 },
        ],
      },
      position: { x: 30, y: WORLD_CONFIG.groundY },
      rotationRad: 0,
      collisionRole: 'BALLISTIC_OBSTRUCTION',
      friction: 1.05,
      restitution: 0.02,
      blocksProjectiles: true,
      blocksConstruction: true,
    },
    {
      id: 'terrain_craggy_ridge_sanctuary_ledge',
      shape: { kind: 'RECTANGLE', widthPx: 192, heightPx: 32 },
      position: { x: 530, y: WORLD_CONFIG.groundY - 16 },
      rotationRad: 0,
      collisionRole: 'LEDGE',
      friction: 1.1,
      restitution: 0,
      blocksProjectiles: true,
      blocksConstruction: true,
    },
  ],
};

export const TERRAIN_PROFILES: Readonly<Record<TerrainProfileId, TerrainProfileDefinition>> = {
  FLAT_SANCTUARY: FLAT_SANCTUARY_TERRAIN,
  CRAGGY_RIDGE_HIGH_ARC: CRAGGY_RIDGE_TERRAIN,
};

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function samePoint(a: Vector2, b: Vector2): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function signedPolygonArea(vertices: readonly Vector2[]): number {
  let area = 0;
  for (let index = 0; index < vertices.length; index++) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function orientation(a: Vector2, b: Vector2, c: Vector2): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(a: Vector2, b: Vector2, c: Vector2, d: Vector2): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < -EPSILON && o3 * o4 < -EPSILON;
}

function polygonSelfIntersects(vertices: readonly Vector2[]): boolean {
  for (let first = 0; first < vertices.length; first++) {
    const firstNext = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second++) {
      const secondNext = (second + 1) % vertices.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (first === 0 && secondNext === 0) continue;
      if (segmentsIntersect(vertices[first], vertices[firstNext], vertices[second], vertices[secondNext])) {
        return true;
      }
    }
  }
  return false;
}

export function validateTerrainProfile(profile: TerrainProfileDefinition): TerrainValidationResult {
  const errors: string[] = [];
  if (profile.bodies.length === 0) errors.push('terrain profile must contain at least one body');
  if (!finite(profile.cameraPaddingPx) || profile.cameraPaddingPx < 0 || profile.cameraPaddingPx > 5000) {
    errors.push('cameraPaddingPx must be finite and between 0 and 5000');
  }
  const ids = new Set<string>();
  let bedrockCount = 0;
  profile.bodies.forEach((body, index) => {
    const prefix = `bodies[${index}]`;
    if (!body.id.trim()) errors.push(`${prefix}.id is required`);
    if (ids.has(body.id)) errors.push(`duplicate terrain body id: ${body.id}`);
    ids.add(body.id);
    if (body.collisionRole === 'BEDROCK') bedrockCount++;
    if (!finite(body.position.x) || !finite(body.position.y)) errors.push(`${prefix}.position must be finite`);
    if (Math.abs(body.position.x) > MAX_ABSOLUTE_COORDINATE_PX || Math.abs(body.position.y) > MAX_ABSOLUTE_COORDINATE_PX) {
      errors.push(`${prefix}.position exceeds world limit`);
    }
    if (!finite(body.rotationRad)) errors.push(`${prefix}.rotationRad must be finite`);
    if (!finite(body.friction) || body.friction < 0 || body.friction > 2) errors.push(`${prefix}.friction must be between 0 and 2`);
    if (!finite(body.restitution) || body.restitution < 0 || body.restitution > 1) errors.push(`${prefix}.restitution must be between 0 and 1`);
    if (body.shape.kind === 'RECTANGLE') {
      if (!finite(body.shape.widthPx) || body.shape.widthPx <= 0 || body.shape.widthPx > MAX_DIMENSION_PX) errors.push(`${prefix}.shape.widthPx is invalid`);
      if (!finite(body.shape.heightPx) || body.shape.heightPx <= 0 || body.shape.heightPx > MAX_DIMENSION_PX) errors.push(`${prefix}.shape.heightPx is invalid`);
    } else {
      const vertices = body.shape.vertices;
      if (vertices.length < 3 || vertices.length > MAX_POLYGON_VERTICES) errors.push(`${prefix}.shape.vertices must contain 3 to 32 points`);
      vertices.forEach((vertex, vertexIndex) => {
        if (!finite(vertex.x) || !finite(vertex.y)) errors.push(`${prefix}.shape.vertices[${vertexIndex}] must be finite`);
        if (Math.abs(vertex.x) > MAX_ABSOLUTE_COORDINATE_PX || Math.abs(vertex.y) > MAX_ABSOLUTE_COORDINATE_PX) errors.push(`${prefix}.shape.vertices[${vertexIndex}] exceeds world limit`);
        const next = vertices[(vertexIndex + 1) % vertices.length];
        if (next && samePoint(vertex, next)) errors.push(`${prefix}.shape has duplicate consecutive vertices`);
      });
      if (vertices.length >= 3 && Math.abs(signedPolygonArea(vertices)) <= EPSILON) errors.push(`${prefix}.shape polygon area must be non-zero`);
      if (vertices.length >= 4 && polygonSelfIntersects(vertices)) errors.push(`${prefix}.shape polygon must not self-intersect`);
    }
  });
  if (bedrockCount !== 1) errors.push('terrain profile must contain exactly one BEDROCK body');
  return { valid: errors.length === 0, errors };
}

export function getTerrainProfile(terrainProfileId: TerrainProfileId): TerrainProfileDefinition {
  return TERRAIN_PROFILES[terrainProfileId];
}
