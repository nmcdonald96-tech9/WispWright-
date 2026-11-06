/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2 } from '../types';
import {
  TerrainCollisionRole,
  TerrainProfileDefinition,
} from '../siege/terrainDefinitions';

export interface TerrainVisualBounds {
  min: Vector2;
  max: Vector2;
}

export interface TerrainBodyVisualDescriptor {
  id: string;
  collisionRole: TerrainCollisionRole;
  shapeKind: 'RECTANGLE' | 'POLYGON';
  position: Vector2;
  rotationRad: number;
  worldVertices: readonly Vector2[];
  worldBounds: TerrainVisualBounds;
  visualSeed: number;
}

export interface TerrainVisualSceneDescriptor {
  terrainProfileId: TerrainProfileDefinition['terrainProfileId'];
  bodies: readonly TerrainBodyVisualDescriptor[];
  nonBedrockBounds: TerrainVisualBounds | null;
  paddedCameraEnvelope: TerrainVisualBounds | null;
}

export interface TerrainCameraFraming {
  center: Vector2;
  spanWidth: number;
  spanHeight: number;
  bounds: TerrainVisualBounds;
}

export function unionTerrainCameraBounds(
  baseBounds: TerrainVisualBounds,
  terrainEnvelope: TerrainVisualBounds | null,
): TerrainVisualBounds {
  if (!terrainEnvelope) {
    return {
      min: { ...baseBounds.min },
      max: { ...baseBounds.max },
    };
  }
  return {
    min: {
      x: Math.min(baseBounds.min.x, terrainEnvelope.min.x),
      y: Math.min(baseBounds.min.y, terrainEnvelope.min.y),
    },
    max: {
      x: Math.max(baseBounds.max.x, terrainEnvelope.max.x),
      y: Math.max(baseBounds.max.y, terrainEnvelope.max.y),
    },
  };
}

export function deriveTerrainCameraFraming(
  baseBounds: TerrainVisualBounds,
  terrainEnvelope: TerrainVisualBounds | null,
  minimumSpanWidth = 0,
  minimumSpanHeight = 0,
): TerrainCameraFraming {
  const bounds = unionTerrainCameraBounds(baseBounds, terrainEnvelope);
  return {
    center: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
    },
    spanWidth: Math.max(minimumSpanWidth, bounds.max.x - bounds.min.x),
    spanHeight: Math.max(minimumSpanHeight, bounds.max.y - bounds.min.y),
    bounds,
  };
}

function rotateAndTranslate(local: Vector2, position: Vector2, rotationRad: number): Vector2 {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: position.x + local.x * cos - local.y * sin,
    y: position.y + local.x * sin + local.y * cos,
  };
}

function boundsFor(vertices: readonly Vector2[]): TerrainVisualBounds {
  return {
    min: {
      x: Math.min(...vertices.map((vertex) => vertex.x)),
      y: Math.min(...vertices.map((vertex) => vertex.y)),
    },
    max: {
      x: Math.max(...vertices.map((vertex) => vertex.x)),
      y: Math.max(...vertices.map((vertex) => vertex.y)),
    },
  };
}

function unionBounds(bounds: readonly TerrainVisualBounds[]): TerrainVisualBounds | null {
  if (bounds.length === 0) return null;
  return {
    min: {
      x: Math.min(...bounds.map((entry) => entry.min.x)),
      y: Math.min(...bounds.map((entry) => entry.min.y)),
    },
    max: {
      x: Math.max(...bounds.map((entry) => entry.max.x)),
      y: Math.max(...bounds.map((entry) => entry.max.y)),
    },
  };
}

function hashVisualSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deriveTerrainVisualScene(
  profile: TerrainProfileDefinition,
): TerrainVisualSceneDescriptor {
  const bodies = profile.bodies.map((body): TerrainBodyVisualDescriptor => {
    const localVertices: readonly Vector2[] =
      body.shape.kind === 'RECTANGLE'
        ? [
            { x: -body.shape.widthPx / 2, y: -body.shape.heightPx / 2 },
            { x: body.shape.widthPx / 2, y: -body.shape.heightPx / 2 },
            { x: body.shape.widthPx / 2, y: body.shape.heightPx / 2 },
            { x: -body.shape.widthPx / 2, y: body.shape.heightPx / 2 },
          ]
        : body.shape.vertices;
    const worldVertices = localVertices.map((vertex) =>
      rotateAndTranslate(vertex, body.position, body.rotationRad),
    );
    return {
      id: body.id,
      collisionRole: body.collisionRole,
      shapeKind: body.shape.kind,
      position: { ...body.position },
      rotationRad: body.rotationRad,
      worldVertices,
      worldBounds: boundsFor(worldVertices),
      visualSeed: hashVisualSeed(
        `${profile.terrainProfileId}:${body.id}:${body.collisionRole}`,
      ),
    };
  });

  const nonBedrockBounds = unionBounds(
    bodies
      .filter((body) => body.collisionRole !== 'BEDROCK')
      .map((body) => body.worldBounds),
  );
  const padding = profile.cameraPaddingPx;
  const paddedCameraEnvelope = nonBedrockBounds
    ? {
        min: {
          x: nonBedrockBounds.min.x - padding,
          y: nonBedrockBounds.min.y - padding,
        },
        max: {
          x: nonBedrockBounds.max.x + padding,
          y: nonBedrockBounds.max.y + padding,
        },
      }
    : null;

  return {
    terrainProfileId: profile.terrainProfileId,
    bodies,
    nonBedrockBounds,
    paddedCameraEnvelope,
  };
}
