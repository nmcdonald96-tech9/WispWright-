/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LevelStore } from '../state/levelStore';
import { LEVEL_2_DEFINITION } from './levelDefinitions';
import { CRAGGY_RIDGE_TERRAIN } from './terrainDefinitions';
import { validatePieceAgainstTerrain } from './environmentNativeTerrain';

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

test('environment-native Level 2: developer state resolves Craggy Ridge canonically', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  assert.equal(state.levelId, 'craggy_ridge_02');
  assert.equal(store.getCanonicalTerrainProfile(state), CRAGGY_RIDGE_TERRAIN);
  assert.equal(LEVEL_2_DEFINITION.terrainProfileId, 'CRAGGY_RIDGE_HIGH_ARC');
});

test('environment-native Level 2: starts with no ancient or player construction pieces', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  assert.equal(state.pieces.length, 0);
});

test('environment-native Level 2: starts with no joints or invisible support objects', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  assert.deepEqual(state.joints, []);
  assert.deepEqual(state.anchors, []);
});

test('environment-native Level 2: wisps begin staged outside the battlefield', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  assert.equal(state.wisps.length, LEVEL_2_DEFINITION.requiredWispCount);
  assert.deepEqual(state.wisps.map((wisp) => wisp.id), LEVEL_2_DEFINITION.selectedWispIds);
  assert.equal(state.wisps.filter((wisp) => wisp.placed).length, 0);
  assert.equal(state.wisps.filter((wisp) => wisp.isDispersed).length, 0);
});

test('environment-native Level 2: developer state has no Level 1 tutorial suggestion', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const tutorial = store.getAuthoritativeTutorialState(state);
  assert.equal(tutorial.currentSuggestedPlacementRegion, null);
  assert.equal(tutorial.currentHighlightedItemId, null);
});

test('environment-native Level 2: inventory comes from the canonical Level 2 definition', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  assert.deepEqual(state.inventory, LEVEL_2_DEFINITION.startingInventory);
  assert.equal(state.requiredWispCount, LEVEL_2_DEFINITION.requiredWispCount);
  assert.equal(
    state.minimumStableWispsForCompletion,
    LEVEL_2_DEFINITION.minimumStableWispsForCompletion,
  );
});

test('environment-native Level 2: terrain placement validation resolves against the canonical ridge', () => {
  const store = prepareStore();
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  const profile = store.getCanonicalTerrainProfile(state);
  const result = validatePieceAgainstTerrain(
    {
      id: 'level2_probe_inside_berm',
      type: 'wood_block',
      position: { x: 30, y: 700 },
      rotation: 0,
      isPrebuilt: false,
    },
    profile,
  );
  assert.equal(result.valid, false);
  assert.equal(result.conflicts[0].terrainBodyId, 'terrain_craggy_ridge_berm');
});

test('environment-native Level 2: normal runtime selection remains locked to Level 1', () => {
  const store = prepareStore();
  const unavailable = structuredClone(store.getState());
  unavailable.levelId = 'craggy_ridge_02';
  assert.equal(store.hydrateState(unavailable), true);
  assert.equal(store.getState().levelId, 'alchemical_sanctuary_01');
  assert.equal(store.getCanonicalTerrainProfile().terrainProfileId, 'FLAT_SANCTUARY');
});

test('environment-native Level 2: creating a developer state does not mutate the live Level 1 attempt', () => {
  const store = prepareStore();
  const before = structuredClone(store.getState());
  const state = store.createDeveloperLevelState('craggy_ridge_02');
  assert.equal(state.levelId, 'craggy_ridge_02');
  assert.deepEqual(store.getState(), before);
});
