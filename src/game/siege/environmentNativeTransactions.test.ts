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

function prepareLevel2Store(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  store.activateDeveloperLevelState('craggy_ridge_02');
  return store;
}

function piece(
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

test('environment-native transactions: developer activation installs an ephemeral Level 2 state', () => {
  const store = prepareLevel2Store();
  assert.equal(store.getState().levelId, 'craggy_ridge_02');
  assert.equal(store.getCanonicalTerrainProfile().terrainProfileId, 'CRAGGY_RIDGE_HIGH_ARC');
  assert.equal(store.getState().pieces.length, 0);
  assert.equal(store.getState().joints?.length ?? 0, 0);
  assert.equal(store.getState().anchors.length, 0);
});

test('environment-native transactions: placement inside berm rejects before inventory or history mutation', () => {
  const store = prepareLevel2Store();
  const beforeInventory = structuredClone(store.getState().inventory);
  const beforeHistory = store.getConstructionHistoryCounts();
  const beforeRevision = store.currentConstructionRevision;

  const accepted = store.placePiece(piece('blocked_place', 'wood_block', 30, 700));

  assert.equal(accepted, false);
  assert.deepEqual(store.getState().inventory, beforeInventory);
  assert.deepEqual(store.getConstructionHistoryCounts(), beforeHistory);
  assert.equal(store.currentConstructionRevision, beforeRevision);
  assert.equal(store.getState().pieces.length, 0);
  assert.equal(store.lastTerrainPlacementConflict?.terrainBodyId, 'terrain_craggy_ridge_berm');
  assert.equal(store.lastTerrainPlacementConflict?.reason, 'TERRAIN_PENETRATION');
});

test('environment-native transactions: exact ledge-top contact can be placed', () => {
  const store = prepareLevel2Store();
  const beforeCount = store.getState().inventory.wood_block;

  const accepted = store.placePiece(piece('ledge_contact', 'wood_block', 530, 724));

  assert.equal(accepted, true);
  assert.equal(store.getState().inventory.wood_block, beforeCount - 1);
  assert.equal(store.getState().pieces.some((entry) => entry.id === 'ledge_contact'), true);
  assert.equal(store.lastTerrainPlacementConflict, null);
});

test('environment-native transactions: move into ledge preserves transform joints revision and history', () => {
  const store = prepareLevel2Store();
  assert.equal(store.placePiece(piece('movable_block', 'wood_block', 700, 700)), true);
  const beforePiece = structuredClone(store.getState().pieces.find((entry) => entry.id === 'movable_block'));
  const beforeJoints = structuredClone(store.getState().joints ?? []);
  const beforeHistory = store.getConstructionHistoryCounts();
  const beforeRevision = store.currentConstructionRevision;

  const accepted = store.movePiece('movable_block', { x: 530, y: 756 }, 0);

  assert.equal(accepted, false);
  assert.deepEqual(store.getState().pieces.find((entry) => entry.id === 'movable_block'), beforePiece);
  assert.deepEqual(store.getState().joints ?? [], beforeJoints);
  assert.deepEqual(store.getConstructionHistoryCounts(), beforeHistory);
  assert.equal(store.currentConstructionRevision, beforeRevision);
  assert.equal(store.lastTerrainPlacementConflict?.terrainBodyId, 'terrain_craggy_ridge_sanctuary_ledge');
});

test('environment-native transactions: rotatePiece through berm preserves all transaction state', () => {
  const store = prepareLevel2Store();
  assert.equal(store.placePiece(piece('rotating_beam', 'wood_beam', -20, 554, 0)), true);
  const beforePiece = structuredClone(store.getState().pieces.find((entry) => entry.id === 'rotating_beam'));
  const beforeJoints = structuredClone(store.getState().joints ?? []);
  const beforeHistory = store.getConstructionHistoryCounts();
  const beforeRevision = store.currentConstructionRevision;

  const accepted = store.rotatePiece('rotating_beam', Math.PI / 4);

  assert.equal(accepted, false);
  assert.deepEqual(store.getState().pieces.find((entry) => entry.id === 'rotating_beam'), beforePiece);
  assert.deepEqual(store.getState().joints ?? [], beforeJoints);
  assert.deepEqual(store.getConstructionHistoryCounts(), beforeHistory);
  assert.equal(store.currentConstructionRevision, beforeRevision);
  assert.equal(store.lastTerrainPlacementConflict?.terrainBodyId, 'terrain_craggy_ridge_berm');
});

test('environment-native transactions: setPieceRotation follows the same terrain rule', () => {
  const store = prepareLevel2Store();
  assert.equal(store.placePiece(piece('setrot_beam', 'wood_beam', -20, 554, 0)), true);
  const beforePiece = structuredClone(store.getState().pieces.find((entry) => entry.id === 'setrot_beam'));
  const beforeHistory = store.getConstructionHistoryCounts();
  const beforeRevision = store.currentConstructionRevision;

  const accepted = store.setPieceRotation('setrot_beam', Math.PI / 4);

  assert.equal(accepted, false);
  assert.deepEqual(store.getState().pieces.find((entry) => entry.id === 'setrot_beam'), beforePiece);
  assert.deepEqual(store.getConstructionHistoryCounts(), beforeHistory);
  assert.equal(store.currentConstructionRevision, beforeRevision);
  assert.equal(store.lastTerrainPlacementConflict?.terrainBodyId, 'terrain_craggy_ridge_berm');
});

test('environment-native transactions: visual preview alone does not block Level 1 placement', () => {
  const store = new LevelStore();
  store.clearStorage();
  store.setDeveloperTerrainProfileOverride('CRAGGY_RIDGE_HIGH_ARC');
  const beforeCount = store.getState().inventory.wood_block;

  const accepted = store.placePiece(piece('level1_visual_probe', 'wood_block', 30, 700));

  assert.equal(accepted, true);
  assert.equal(store.getState().inventory.wood_block, beforeCount - 1);
  assert.equal(store.getCanonicalTerrainProfile().terrainProfileId, 'FLAT_SANCTUARY');
});

test('environment-native transactions: leaving developer Level 2 restores the untouched Level 1 attempt', () => {
  const store = new LevelStore();
  store.clearStorage();
  const before = structuredClone(store.getState());

  store.activateDeveloperLevelState('craggy_ridge_02');
  store.exitDeveloperLevelState();

  assert.deepEqual(store.getState(), before);
  assert.equal(store.getCanonicalTerrainProfile().terrainProfileId, 'FLAT_SANCTUARY');
});
