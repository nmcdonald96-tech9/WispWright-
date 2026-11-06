/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { PlacedPiece } from '../types';
import { CRAGGY_RIDGE_TERRAIN } from './terrainDefinitions';
import {
  EnvironmentNativeTerrainProfile,
  validateEnvironmentAttachmentSurfaces,
  validatePieceAgainstTerrain,
} from './environmentNativeTerrain';

const ridgeProfile: EnvironmentNativeTerrainProfile = {
  ...CRAGGY_RIDGE_TERRAIN,
  attachmentSurfaces: [
    {
      id: 'ridge_ledge_top_foundation',
      terrainBodyId: 'terrain_craggy_ridge_sanctuary_ledge',
      localStart: { x: -96, y: -16 },
      localEnd: { x: 96, y: -16 },
      outwardNormal: { x: 0, y: -1 },
      connectionTypes: ['FOUNDATION', 'BEAM_FACE', 'RAFTER_SEAT'],
      materialCompatibility: ['wood_beam', 'wood_block', 'stone_block', 'bullseye_block'],
      minimumClearancePx: 1,
      structuralStrengthClass: 'HEAVY',
    },
    {
      id: 'ridge_berm_right_rafter_seat',
      terrainBodyId: 'terrain_craggy_ridge_berm',
      localStart: { x: 16, y: -202 },
      localEnd: { x: 118, y: -92 },
      outwardNormal: { x: 0.733761, y: -0.679408 },
      connectionTypes: ['RAFTER_SEAT', 'BEAM_FACE'],
      materialCompatibility: ['wood_beam'],
      minimumClearancePx: 1,
      structuralStrengthClass: 'STANDARD',
    },
  ],
};

function piece(id: string, type: PlacedPiece['type'], x: number, y: number, rotation = 0): PlacedPiece {
  return { id, type, position: { x, y }, rotation, isPrebuilt: false };
}

test('environment-native contract: Craggy Ridge attachment surfaces are valid and unique', () => {
  const result = validateEnvironmentAttachmentSurfaces(ridgeProfile);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('environment-native contract: duplicate attachment IDs are rejected', () => {
  const invalid = structuredClone(ridgeProfile);
  invalid.attachmentSurfaces[1].id = invalid.attachmentSurfaces[0].id;
  assert.ok(validateEnvironmentAttachmentSurfaces(invalid).errors.some((error) => error.includes('duplicate')));
});

test('environment-native contract: attachment endpoints must lie on terrain boundary', () => {
  const invalid = structuredClone(ridgeProfile);
  invalid.attachmentSurfaces[0].localStart = { x: 0, y: 0 };
  assert.ok(validateEnvironmentAttachmentSurfaces(invalid).errors.some((error) => error.includes('endpoints')));
});

test('environment-native contract: attachment normals must point out of terrain', () => {
  const invalid = structuredClone(ridgeProfile);
  invalid.attachmentSurfaces[0].outwardNormal = { x: 0, y: 1 };
  assert.ok(validateEnvironmentAttachmentSurfaces(invalid).errors.some((error) => error.includes('points into terrain')));
});

test('environment-native placement: block inside ridge berm is rejected', () => {
  const result = validatePieceAgainstTerrain(piece('inside_berm', 'wood_block', 30, 700), CRAGGY_RIDGE_TERRAIN);
  assert.equal(result.valid, false);
  assert.equal(result.conflicts[0].terrainBodyId, 'terrain_craggy_ridge_berm');
  assert.equal(result.conflicts[0].reason, 'TERRAIN_PENETRATION');
  assert.ok(result.conflicts[0].overlapDepthPx > 0);
});

test('environment-native placement: block resting on ledge top is valid without penetration', () => {
  const result = validatePieceAgainstTerrain(
    piece('ledge_block', 'wood_block', 530, 724),
    CRAGGY_RIDGE_TERRAIN,
  );
  assert.equal(result.valid, true);
});

test('environment-native placement: block moved into ledge is rejected', () => {
  const result = validatePieceAgainstTerrain(piece('ledge_overlap', 'wood_block', 530, 756), CRAGGY_RIDGE_TERRAIN);
  assert.equal(result.valid, false);
  assert.equal(result.conflicts[0].terrainBodyId, 'terrain_craggy_ridge_sanctuary_ledge');
});

test('environment-native placement: rotated beam crossing the ridge is rejected', () => {
  const result = validatePieceAgainstTerrain(
    piece('ridge_beam', 'wood_beam', 80, 675, Math.PI / 4),
    CRAGGY_RIDGE_TERRAIN,
  );
  assert.equal(result.valid, false);
  assert.ok(
    result.conflicts.some(
      (conflict) =>
        conflict.terrainBodyId === 'terrain_craggy_ridge_berm' &&
        conflict.reason === 'TERRAIN_PENETRATION' &&
        conflict.overlapDepthPx > 0,
    ),
  );
});

test('environment-native placement: free beam outside terrain remains valid', () => {
  const result = validatePieceAgainstTerrain(piece('free_beam', 'wood_beam', 420, 620, 0), CRAGGY_RIDGE_TERRAIN);
  assert.equal(result.valid, true);
});
