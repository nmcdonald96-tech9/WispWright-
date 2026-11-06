/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { WORLD_CONFIG } from '../config';
import {
  CRAGGY_RIDGE_TERRAIN,
  FLAT_SANCTUARY_TERRAIN,
  getTerrainProfile,
  TerrainProfileDefinition,
  validateTerrainProfile,
} from './terrainDefinitions';

function mutateProfile(mutator: (profile: TerrainProfileDefinition) => void): TerrainProfileDefinition {
  const profile = structuredClone(CRAGGY_RIDGE_TERRAIN) as TerrainProfileDefinition;
  mutator(profile);
  return profile;
}

test('terrain contract: flat sanctuary matches current canonical bedrock geometry', () => {
  const bedrock = FLAT_SANCTUARY_TERRAIN.bodies[0];
  assert.equal(bedrock.collisionRole, 'BEDROCK');
  assert.deepEqual(bedrock.shape, { kind: 'RECTANGLE', widthPx: 2600, heightPx: 200 });
  assert.deepEqual(bedrock.position, { x: 100, y: WORLD_CONFIG.groundY + 100 });
  assert.equal(bedrock.friction, 0.95);
  assert.equal(bedrock.restitution, 0);
  assert.equal(validateTerrainProfile(FLAT_SANCTUARY_TERRAIN).valid, true);
});

test('terrain contract: Craggy Ridge is valid and remains data-only', () => {
  assert.equal(CRAGGY_RIDGE_TERRAIN.bodies.length, 3);
  assert.equal(CRAGGY_RIDGE_TERRAIN.bodies[1].collisionRole, 'BALLISTIC_OBSTRUCTION');
  assert.equal(CRAGGY_RIDGE_TERRAIN.bodies[2].collisionRole, 'LEDGE');
  assert.equal(validateTerrainProfile(CRAGGY_RIDGE_TERRAIN).valid, true);
});

test('terrain contract: deterministic lookup returns canonical profiles', () => {
  assert.equal(getTerrainProfile('FLAT_SANCTUARY'), FLAT_SANCTUARY_TERRAIN);
  assert.equal(getTerrainProfile('CRAGGY_RIDGE_HIGH_ARC'), CRAGGY_RIDGE_TERRAIN);
});

test('terrain validation: duplicate IDs are rejected', () => {
  const profile = mutateProfile((value) => { value.bodies[1].id = value.bodies[0].id; });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('duplicate')));
});

test('terrain validation: empty profile and missing bedrock are rejected', () => {
  const profile = mutateProfile((value) => { (value as any).bodies = []; });
  const result = validateTerrainProfile(profile);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('at least one')));
  assert.ok(result.errors.some((error) => error.includes('exactly one BEDROCK')));
});

test('terrain validation: multiple bedrock bodies are rejected', () => {
  const profile = mutateProfile((value) => { value.bodies[1].collisionRole = 'BEDROCK'; });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('exactly one BEDROCK')));
});

test('terrain validation: invalid rectangle dimensions are rejected', () => {
  const profile = mutateProfile((value) => { (value.bodies[2].shape as any).widthPx = 0; });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('widthPx')));
});

test('terrain validation: polygons require 3 to 32 vertices', () => {
  const profile = mutateProfile((value) => { (value.bodies[1].shape as any).vertices = [{ x: 0, y: 0 }, { x: 1, y: 1 }]; });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('3 to 32')));
});

test('terrain validation: duplicate consecutive polygon vertices are rejected', () => {
  const profile = mutateProfile((value) => {
    (value.bodies[1].shape as any).vertices = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('duplicate consecutive')));
});

test('terrain validation: zero-area polygons are rejected', () => {
  const profile = mutateProfile((value) => {
    (value.bodies[1].shape as any).vertices = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
  });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('area')));
});

test('terrain validation: self-intersecting polygons are rejected', () => {
  const profile = mutateProfile((value) => {
    (value.bodies[1].shape as any).vertices = [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 }];
  });
  assert.ok(validateTerrainProfile(profile).errors.some((error) => error.includes('self-intersect')));
});

test('terrain validation: non-finite values and world-limit violations are rejected', () => {
  const profile = mutateProfile((value) => {
    value.bodies[1].position.x = Number.NaN;
    value.bodies[1].rotationRad = Number.POSITIVE_INFINITY;
    (value.bodies[1].shape as any).vertices[0].x = 10001;
  });
  const errors = validateTerrainProfile(profile).errors;
  assert.ok(errors.some((error) => error.includes('position must be finite')));
  assert.ok(errors.some((error) => error.includes('rotationRad')));
  assert.ok(errors.some((error) => error.includes('world limit')));
});

test('terrain validation: friction and restitution ranges are enforced', () => {
  const profile = mutateProfile((value) => {
    value.bodies[1].friction = 2.1;
    value.bodies[1].restitution = -0.1;
  });
  const errors = validateTerrainProfile(profile).errors;
  assert.ok(errors.some((error) => error.includes('friction')));
  assert.ok(errors.some((error) => error.includes('restitution')));
});
