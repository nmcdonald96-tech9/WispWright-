/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LevelStore } from '../state/levelStore';
import { PlacedPiece } from '../types';

if (typeof (globalThis as any).localStorage === 'undefined') {
  const values = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

function piece(x: number, y: number, rotation = 0): PlacedPiece {
  return {
    id: 'preview_probe',
    type: 'wood_beam',
    position: { x, y },
    rotation,
    isPrebuilt: false,
  };
}

test('terrain preview parity: environment-native Level 2 rejects berm penetration', () => {
  const store = new LevelStore();
  store.clearStorage();
  store.activateDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateForPreview(piece(80, 675, Math.PI / 4));
  assert.equal(result.valid, false);
  assert.equal(result.conflicts[0].terrainBodyId, 'terrain_craggy_ridge_berm');
  assert.equal(result.conflicts[0].reason, 'TERRAIN_PENETRATION');
});

test('terrain preview parity: exact ledge contact remains valid', () => {
  const store = new LevelStore();
  store.clearStorage();
  store.activateDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateForPreview({
    ...piece(530, 724),
    type: 'wood_block',
  });
  assert.deepEqual(result, { valid: true, conflicts: [] });
});

test('terrain preview parity: accepted Level 1 ignores environment-native overlay rules', () => {
  const store = new LevelStore();
  store.clearStorage();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  const result = store.validateConstructionCandidateForPreview(piece(80, 675, Math.PI / 4));
  assert.deepEqual(result, { valid: true, conflicts: [] });
  assert.equal(store.getCanonicalTerrainProfile().terrainProfileId, 'FLAT_SANCTUARY');
});

test('terrain preview parity: preview and authoritative candidate validation agree in Level 2', () => {
  const store = new LevelStore();
  store.clearStorage();
  store.activateDeveloperLevelState('craggy_ridge_02');
  const candidate = piece(80, 675, Math.PI / 4);
  assert.deepEqual(
    store.validateConstructionCandidateForPreview(candidate),
    store.validateConstructionCandidateAgainstTerrain(candidate),
  );
});
