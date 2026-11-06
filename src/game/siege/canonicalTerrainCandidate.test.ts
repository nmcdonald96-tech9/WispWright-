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

function prepareStore(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  return store;
}

function candidate(
  id: string,
  type: PlacedPiece['type'],
  x: number,
  y: number,
  rotation = 0,
): PlacedPiece {
  return {
    id,
    type,
    position: { x, y },
    rotation,
    isPrebuilt: false,
  };
}

test('canonical terrain candidate: Level 2 block inside berm is rejected with diagnostics', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateAgainstTerrain(
    candidate('inside_berm', 'wood_block', 30, 700),
    state,
  );
  assert.equal(result.valid, false);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].terrainBodyId, 'terrain_craggy_ridge_berm');
  assert.equal(result.conflicts[0].collisionRole, 'BALLISTIC_OBSTRUCTION');
  assert.equal(result.conflicts[0].reason, 'TERRAIN_PENETRATION');
  assert.ok(result.conflicts[0].overlapDepthPx > 0);
});

test('canonical terrain candidate: Level 2 block penetrating ledge is rejected', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateAgainstTerrain(
    candidate('inside_ledge', 'wood_block', 530, 756),
    state,
  );
  assert.equal(result.valid, false);
  assert.ok(
    result.conflicts.some(
      (conflict) =>
        conflict.terrainBodyId === 'terrain_craggy_ridge_sanctuary_ledge',
    ),
  );
});

test('canonical terrain candidate: exact Level 2 ledge-top contact is accepted', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateAgainstTerrain(
    candidate('ledge_contact', 'wood_block', 530, 724),
    state,
  );
  assert.deepEqual(result, { valid: true, conflicts: [] });
});

test('canonical terrain candidate: rotated Level 2 beam crossing berm is rejected', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateAgainstTerrain(
    candidate('ridge_beam', 'wood_beam', 80, 675, Math.PI / 4),
    state,
  );
  assert.equal(result.valid, false);
  assert.ok(
    result.conflicts.some(
      (conflict) =>
        conflict.terrainBodyId === 'terrain_craggy_ridge_berm' &&
        conflict.overlapDepthPx > 0,
    ),
  );
});

test('canonical terrain candidate: free Level 2 beam remains valid', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const result = store.validateConstructionCandidateAgainstTerrain(
    candidate('free_beam', 'wood_beam', 420, 620),
    state,
  );
  assert.deepEqual(result, { valid: true, conflicts: [] });
});

test('canonical terrain candidate: Level 1 remains governed by Flat Sanctuary', () => {
  const store = prepareStore();
  const level1 = structuredClone(store.getState());
  const ridgeInterior = candidate('level1_ridge_space', 'wood_block', 30, 700);
  const result = store.validateConstructionCandidateAgainstTerrain(
    ridgeInterior,
    level1,
  );
  assert.equal(result.valid, true);
});

test('canonical terrain candidate: visual ridge preview does not alter Level 1 validity', () => {
  const store = prepareStore();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  const result = store.validateConstructionCandidateAgainstTerrain(
    candidate('visual_override_probe', 'wood_block', 30, 700),
  );
  assert.equal(store.getActiveTerrainProfile().terrainProfileId, 'CRAGGY_RIDGE_HIGH_ARC');
  assert.equal(store.getCanonicalTerrainProfile().terrainProfileId, 'FLAT_SANCTUARY');
  assert.equal(result.valid, true);
});

test('canonical terrain candidate: validation does not mutate candidate or supplied state', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const piece = candidate('immutable_probe', 'wood_beam', 80, 675, Math.PI / 4);
  const stateBefore = structuredClone(state);
  const pieceBefore = structuredClone(piece);

  store.validateConstructionCandidateAgainstTerrain(piece, state);

  assert.deepEqual(piece, pieceBefore);
  assert.deepEqual(state, stateBefore);
});
