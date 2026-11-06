/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { CanvasRenderer } from '../render/canvasRenderer';
import { LevelStore } from '../state/levelStore';
import { CRAGGY_RIDGE_TERRAIN, FLAT_SANCTUARY_TERRAIN } from '../siege/terrainDefinitions';

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

test('ridge visual sync: developer terrain override is in-memory and changes active profile', () => {
  const store = prepareStore();
  assert.equal(store.getActiveTerrainProfile(), FLAT_SANCTUARY_TERRAIN);
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  assert.equal(store.developerTerrainProfileOverride, 'CRAGGY_RIDGE_HIGH_ARC');
  assert.equal(store.getActiveTerrainProfile(), CRAGGY_RIDGE_TERRAIN);
  assert.equal(store.getState().levelId, 'alchemical_sanctuary_01');
});

test('ridge visual sync: canonical physics terrain ignores developer visual override', () => {
  const store = prepareStore();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  assert.equal(store.getActiveTerrainProfile(), CRAGGY_RIDGE_TERRAIN);
  assert.equal(store.getCanonicalTerrainProfile(), FLAT_SANCTUARY_TERRAIN);
});

test('ridge visual sync: developer terrain override is excluded from persisted level state', () => {
  const store = prepareStore();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  const serializedLevel = JSON.stringify(store.getState());
  assert.equal(serializedLevel.includes('developerTerrainProfileOverride'), false);
  assert.equal(serializedLevel.includes('CRAGGY_RIDGE_HIGH_ARC'), false);
});

test('ridge visual sync: clearStorage resets developer terrain override to flat sanctuary', () => {
  const store = prepareStore();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  store.clearStorage();
  assert.equal(store.developerTerrainProfileOverride, null);
  assert.equal(store.getActiveTerrainProfile(), FLAT_SANCTUARY_TERRAIN);
});

test('ridge visual sync: clearing override restores flat terrain without changing Level 1 identity', () => {
  const store = prepareStore();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  store.setDeveloperTerrainProfileOverride(null);
  assert.equal(store.getActiveTerrainProfile(), FLAT_SANCTUARY_TERRAIN);
  assert.equal(store.getState().levelId, 'alchemical_sanctuary_01');
});

test('ridge visual sync: Level 1 stability physics stays flat while ridge is visible', () => {
  const store = prepareStore();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');

  const renderer = Object.create(CanvasRenderer.prototype) as any;
  renderer.store = store;
  renderer.mode = 'CONSTRUCTION';
  renderer.physicsBridge = null;
  renderer.siegeController = {
    mode: 'CONSTRUCTION',
    physicsBridge: null,
  };
  renderer.selectedPieceId = null;
  renderer.dragState = null;

  renderer.setMode('TESTING_SIMULATION');

  assert.equal(
    renderer.getActiveTerrainVisualSceneForTesting().terrainProfileId,
    'CRAGGY_RIDGE_HIGH_ARC',
  );
  assert.equal(
    renderer.getActivePhysicsTerrainProfileIdForTesting(),
    'FLAT_SANCTUARY',
  );
  assert.equal(renderer.getActivePhysicsTerrainBodyCountForTesting(), 1);
  assert.equal(store.getState().levelId, 'alchemical_sanctuary_01');

  renderer.physicsBridge?.teardown();
});

test('ridge visual sync: switching visual terrain does not rebuild Level 1 physics', () => {
  const store = prepareStore();
  const renderer = Object.create(CanvasRenderer.prototype) as any;
  renderer.store = store;
  renderer.mode = 'CONSTRUCTION';
  renderer.physicsBridge = null;
  renderer.siegeController = {
    mode: 'CONSTRUCTION',
    physicsBridge: null,
  };
  renderer.selectedPieceId = null;
  renderer.dragState = null;
  renderer.camera = {
    resetView: () => undefined,
  };
  renderer.updateCameraFraming = () => undefined;

  renderer.setMode('TESTING_SIMULATION');
  const originalBridge = renderer.physicsBridge;

  renderer.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');

  assert.equal(renderer.physicsBridge, originalBridge);
  assert.equal(
    renderer.getActiveTerrainVisualSceneForTesting().terrainProfileId,
    'CRAGGY_RIDGE_HIGH_ARC',
  );
  assert.equal(
    renderer.getActivePhysicsTerrainProfileIdForTesting(),
    'FLAT_SANCTUARY',
  );
  assert.equal(renderer.getActivePhysicsTerrainBodyCountForTesting(), 1);

  renderer.physicsBridge?.teardown();
});
