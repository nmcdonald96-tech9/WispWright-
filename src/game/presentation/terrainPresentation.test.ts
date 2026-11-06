/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRAGGY_RIDGE_TERRAIN,
  FLAT_SANCTUARY_TERRAIN,
  TerrainProfileDefinition,
} from '../siege/terrainDefinitions';
import { deriveTerrainCameraFraming, deriveTerrainVisualScene } from './terrainPresentation';

function roundedVertices(vertices: readonly { x: number; y: number }[]) {
  return vertices.map((vertex) => ({
    x: Number(vertex.x.toFixed(6)),
    y: Number(vertex.y.toFixed(6)),
  }));
}

test('terrain presentation: flat sanctuary preserves canonical bedrock corners', () => {
  const scene = deriveTerrainVisualScene(FLAT_SANCTUARY_TERRAIN);
  assert.equal(scene.bodies.length, 1);
  assert.deepEqual(scene.bodies[0].worldVertices, [
    { x: -1200, y: 780 },
    { x: 1400, y: 780 },
    { x: 1400, y: 980 },
    { x: -1200, y: 980 },
  ]);
  assert.deepEqual(scene.bodies[0].worldBounds, {
    min: { x: -1200, y: 780 },
    max: { x: 1400, y: 980 },
  });
});

test('terrain presentation: flat sanctuary excludes bedrock from dynamic camera framing', () => {
  const scene = deriveTerrainVisualScene(FLAT_SANCTUARY_TERRAIN);
  assert.equal(scene.nonBedrockBounds, null);
  assert.equal(scene.paddedCameraEnvelope, null);
});

test('terrain presentation: ridge creates exactly three canonical visual bodies', () => {
  const scene = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  assert.deepEqual(
    scene.bodies.map((body) => [body.id, body.shapeKind, body.collisionRole]),
    [
      ['terrain_craggy_ridge_bedrock', 'RECTANGLE', 'BEDROCK'],
      ['terrain_craggy_ridge_berm', 'POLYGON', 'BALLISTIC_OBSTRUCTION'],
      ['terrain_craggy_ridge_sanctuary_ledge', 'RECTANGLE', 'LEDGE'],
    ],
  );
});

test('terrain presentation: polygon world vertices match canonical physics transform', () => {
  const scene = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  const berm = scene.bodies.find((body) => body.id === 'terrain_craggy_ridge_berm');
  assert.ok(berm);
  assert.deepEqual(roundedVertices(berm.worldVertices), [
    { x: -180, y: 780 },
    { x: 180, y: 780 },
    { x: 148, y: 688 },
    { x: 46, y: 578 },
    { x: -74, y: 626 },
  ]);
});

test('terrain presentation: ridge non-bedrock bounds and 96px envelope are deterministic', () => {
  const scene = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  assert.deepEqual(scene.nonBedrockBounds, {
    min: { x: -180, y: 578 },
    max: { x: 626, y: 780 },
  });
  assert.deepEqual(scene.paddedCameraEnvelope, {
    min: { x: -276, y: 482 },
    max: { x: 722, y: 876 },
  });
});

test('terrain presentation: visual seeds are stable and body-specific', () => {
  const first = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  const second = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  assert.deepEqual(
    second.bodies.map((body) => body.visualSeed),
    first.bodies.map((body) => body.visualSeed),
  );
  assert.equal(new Set(first.bodies.map((body) => body.visualSeed)).size, 3);
});

test('terrain presentation: derivation does not mutate canonical terrain input', () => {
  const snapshot = structuredClone(CRAGGY_RIDGE_TERRAIN);
  const scene = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  (scene.bodies[1].worldVertices as { x: number; y: number }[])[0].x = 999;
  assert.deepEqual(CRAGGY_RIDGE_TERRAIN, snapshot);
});

test('terrain presentation: rotated rectangle corners use the same transform as polygons', () => {
  const profile: TerrainProfileDefinition = {
    terrainProfileId: 'FLAT_SANCTUARY',
    cameraPaddingPx: 0,
    bodies: [
      {
        id: 'rotated_rect',
        shape: { kind: 'RECTANGLE', widthPx: 20, heightPx: 10 },
        position: { x: 100, y: 200 },
        rotationRad: Math.PI / 2,
        collisionRole: 'LEDGE',
        friction: 1,
        restitution: 0,
        blocksProjectiles: true,
        blocksConstruction: true,
      },
    ],
  };
  const body = deriveTerrainVisualScene(profile).bodies[0];
  assert.deepEqual(roundedVertices(body.worldVertices), [
    { x: 105, y: 190 },
    { x: 105, y: 210 },
    { x: 95, y: 210 },
    { x: 95, y: 190 },
  ]);
});

test('terrain presentation: flat sanctuary preserves the existing sanctuary camera box', () => {
  const scene = deriveTerrainVisualScene(FLAT_SANCTUARY_TERRAIN);
  const framing = deriveTerrainCameraFraming(
    { min: { x: 80, y: 285 }, max: { x: 640, y: 825 } },
    scene.paddedCameraEnvelope,
  );
  assert.deepEqual(framing, {
    center: { x: 360, y: 555 },
    spanWidth: 560,
    spanHeight: 540,
    bounds: { min: { x: 80, y: 285 }, max: { x: 640, y: 825 } },
  });
});

test('terrain presentation: ridge construction framing unions sanctuary and padded terrain envelope', () => {
  const scene = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  const framing = deriveTerrainCameraFraming(
    { min: { x: 80, y: 285 }, max: { x: 640, y: 825 } },
    scene.paddedCameraEnvelope,
  );
  assert.deepEqual(framing, {
    center: { x: 223, y: 580.5 },
    spanWidth: 998,
    spanHeight: 591,
    bounds: { min: { x: -276, y: 285 }, max: { x: 722, y: 876 } },
  });
});

test('terrain presentation: ridge threat framing includes launcher, target, and terrain envelope', () => {
  const scene = deriveTerrainVisualScene(CRAGGY_RIDGE_TERRAIN);
  const framing = deriveTerrainCameraFraming(
    { min: { x: -515, y: 325 }, max: { x: 475, y: 805 } },
    scene.paddedCameraEnvelope,
    620,
    480,
  );
  assert.deepEqual(framing, {
    center: { x: 103.5, y: 600.5 },
    spanWidth: 1237,
    spanHeight: 551,
    bounds: { min: { x: -515, y: 325 }, max: { x: 722, y: 876 } },
  });
});

