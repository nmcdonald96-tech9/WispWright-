/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE, WORLD_CONFIG } from '../config';
import { PhysicsBridge } from '../physics/physicsBridge';
import { LevelStore } from '../state/levelStore';
import { LEVEL_1_DEFINITION } from './levelDefinitions';
import { FLAT_SANCTUARY_TERRAIN } from './terrainDefinitions';

if (typeof (globalThis as any).localStorage === 'undefined') {
  const storageMap = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };
}

function prepareStore(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  return store;
}

test('terrain runtime: LevelStore resolves Level 1 canonical terrain profile', () => {
  const store = prepareStore();
  assert.equal(store.getActiveLevelDefinition(), LEVEL_1_DEFINITION);
  assert.equal(store.getActiveTerrainProfile(), FLAT_SANCTUARY_TERRAIN);
});

test('terrain runtime: unavailable persisted Level 2 identity still resolves flat sanctuary', () => {
  const store = prepareStore();
  const unavailable = structuredClone(INITIAL_LEVEL_STATE);
  unavailable.levelId = 'craggy_ridge_02';
  assert.equal(store.hydrateState(unavailable), true);
  assert.equal(store.getState().levelId, LEVEL_1_DEFINITION.levelId);
  assert.equal(store.getActiveTerrainProfile(), FLAT_SANCTUARY_TERRAIN);
});

test('terrain runtime: PhysicsBridge defaults to canonical flat sanctuary terrain', () => {
  const store = prepareStore();
  const bridge = new PhysicsBridge(store.getState());
  assert.equal(bridge.getTerrainProfile().terrainProfileId, 'FLAT_SANCTUARY');
  assert.deepEqual(bridge.getResolvedTerrainBodies(), FLAT_SANCTUARY_TERRAIN.bodies);
  bridge.teardown();
});

test('terrain runtime: Level 1 bedrock Matter body remains byte-equivalent in material and geometry', () => {
  const store = prepareStore();
  const bridge = new PhysicsBridge(store.getState(), store.getActiveTerrainProfile());
  const diagnostics = bridge.getTerrainPhysicsDiagnostics();
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0], {
    terrainBodyId: 'terrain_flat_sanctuary_bedrock',
    label: 'ground_bedrock',
    collisionRole: 'BEDROCK',
    shapeKind: 'RECTANGLE',
    position: { x: 100, y: WORLD_CONFIG.groundY + 100 },
    widthPx: 2600,
    heightPx: 200,
    sourceVertices: undefined,
    bounds: {
      min: { x: -1200, y: WORLD_CONFIG.groundY },
      max: { x: 1400, y: WORLD_CONFIG.groundY + 200 },
    },
    rotationRad: 0,
    isStatic: true,
    isSensor: false,
    friction: 0.95,
    restitution: 0,
    blocksProjectiles: true,
    blocksConstruction: true,
  });
  bridge.teardown();
});

test('terrain runtime: returned terrain definitions are defensive read-only copies', () => {
  const store = prepareStore();
  const bridge = new PhysicsBridge(store.getState(), store.getActiveTerrainProfile());
  const first = bridge.getResolvedTerrainBodies();
  const second = bridge.getResolvedTerrainBodies();
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  first[0].position.x = 999;
  assert.equal(second[0].position.x, 100);
  assert.equal(FLAT_SANCTUARY_TERRAIN.bodies[0].position.x, 100);
  bridge.teardown();
});

test('terrain runtime: explicit flat profile preserves settled Level 1 foundation behavior', () => {
  const store = prepareStore();
  const state = store.getState();
  state.pieces.push({
    id: 'terrain_runtime_grounded_block',
    type: 'wood_block',
    position: { x: 320, y: WORLD_CONFIG.groundY - 24 },
    rotation: 0,
    isPrebuilt: false,
  });
  const bridge = new PhysicsBridge(state, store.getActiveTerrainProfile());
  for (let index = 0; index < 180; index++) bridge.step(1000 / 60);
  const transform = bridge
    .getSimulatedTransforms(state.pieces)
    .find((entry) => entry.pieceId === 'terrain_runtime_grounded_block');
  assert.ok(transform);
  assert.ok(Math.abs(transform.position.x - 320) < 0.01);
  assert.ok(Math.abs(transform.position.y - (WORLD_CONFIG.groundY - 24)) < 0.35);
  assert.equal(transform.isFallen, false);
  bridge.teardown();
});

test('terrain runtime: Level 1 physics diagnostics retain one canonical terrain body', () => {
  const store = prepareStore();
  const bridge = new PhysicsBridge(store.getState(), store.getActiveTerrainProfile());
  assert.equal(bridge.diagnostics.terrainProfileId, 'FLAT_SANCTUARY');
  assert.equal(bridge.diagnostics.terrainBodyCount, 1);
  assert.equal(bridge.diagnostics.canonicalBedrockBodyId, 'terrain_flat_sanctuary_bedrock');
  bridge.teardown();
});
