/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE, WORLD_CONFIG } from '../config';
import { PhysicsBridge } from '../physics/physicsBridge';
import { LevelState } from '../types';
import {
  CRAGGY_RIDGE_TERRAIN,
  FLAT_SANCTUARY_TERRAIN,
  TerrainProfileDefinition,
} from './terrainDefinitions';

function emptyLevel(): LevelState {
  return {
    ...structuredClone(INITIAL_LEVEL_STATE),
    pieces: [],
    joints: [],
    anchors: [],
    wisps: [],
  };
}

function diagnosticsSignature(bridge: PhysicsBridge) {
  return bridge.getTerrainPhysicsDiagnostics().map((entry) => ({
    terrainBodyId: entry.terrainBodyId,
    label: entry.label,
    collisionRole: entry.collisionRole,
    shapeKind: entry.shapeKind,
    sourceVertices: entry.sourceVertices,
    bounds: entry.bounds,
    isStatic: entry.isStatic,
    isSensor: entry.isSensor,
    friction: entry.friction,
    restitution: entry.restitution,
  }));
}

test('ridge physics preview: creates one bedrock, one polygon berm, and one ledge', () => {
  const bridge = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  const diagnostics = bridge.getTerrainPhysicsDiagnostics();
  assert.equal(diagnostics.length, 3);
  assert.deepEqual(
    diagnostics.map((entry) => entry.collisionRole),
    ['BEDROCK', 'BALLISTIC_OBSTRUCTION', 'LEDGE'],
  );
  assert.deepEqual(
    diagnostics.map((entry) => entry.shapeKind),
    ['RECTANGLE', 'POLYGON', 'RECTANGLE'],
  );
  assert.equal(bridge.diagnostics.terrainBodyCount, 3);
  bridge.teardown();
});

test('ridge physics preview: body IDs, labels, vertices, and bounds are deterministic', () => {
  const first = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  const second = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  assert.deepEqual(diagnosticsSignature(second), diagnosticsSignature(first));
  first.teardown();
  second.teardown();
});

test('ridge physics preview: polygon berm preserves source vertices and remains a solid static body', () => {
  const bridge = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  const berm = bridge
    .getTerrainPhysicsDiagnostics()
    .find((entry) => entry.terrainBodyId === 'terrain_craggy_ridge_berm');
  assert.ok(berm);
  assert.equal(berm.label, 'terrain_terrain_craggy_ridge_berm');
  assert.equal(berm.shapeKind, 'POLYGON');
  assert.equal(berm.isStatic, true);
  assert.equal(berm.isSensor, false);
  assert.deepEqual(berm.sourceVertices, CRAGGY_RIDGE_TERRAIN.bodies[1].shape.kind === 'POLYGON'
    ? CRAGGY_RIDGE_TERRAIN.bodies[1].shape.vertices
    : []);
  assert.ok(berm.bounds.max.x > berm.bounds.min.x);
  assert.ok(berm.bounds.max.y > berm.bounds.min.y);
  bridge.teardown();
});

test('ridge physics preview: ledge supports a resting block without meaningful drift', () => {
  const level = emptyLevel();
  level.pieces = [
    {
      id: 'ridge_ledge_block',
      type: 'wood_block',
      position: { x: 530, y: WORLD_CONFIG.groundY - 56 },
      rotation: 0,
      isPrebuilt: false,
    },
  ];
  const bridge = new PhysicsBridge(level, CRAGGY_RIDGE_TERRAIN);
  for (let index = 0; index < 180; index++) bridge.step(1000 / 60);
  const transform = bridge.getSimulatedTransforms(level.pieces)[0];
  assert.ok(Math.abs(transform.position.x - 530) < 0.25);
  assert.ok(Math.abs(transform.position.y - (WORLD_CONFIG.groundY - 56)) < 0.75);
  assert.equal(transform.isFallen, false);
  bridge.teardown();
});

test('ridge physics preview: a test projectile collides with the berm', () => {
  const bridge = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  bridge.spawnProjectile(
    {
      attackId: 'ridge_berm_collision_probe',
      attackerType: 'standard',
      name: 'Ridge Probe',
      title: 'Test',
      personalityTag: 'Test',
      introQuote: 'Test',
      introDurationSec: 0,
      spawnPosition: { x: -300, y: WORLD_CONFIG.groundY - 90 },
      launchVelocity: { x: 8.5, y: 0 },
      mass: 2.8,
      radius: 16,
      restitution: 0.05,
      friction: 0.8,
      maxFlightDurationSec: 3,
      targetDescription: 'Craggy Ridge berm',
    },
  );
  for (let index = 0; index < 240 && !bridge.diagnostics.firstImpactCoordinates; index++) {
    bridge.step(1000 / 60);
  }
  assert.ok(bridge.diagnostics.firstImpactCoordinates);
  assert.equal(bridge.diagnostics.firstImpactTargetLabel, 'terrain_terrain_craggy_ridge_berm');
  bridge.teardown();
});

test('ridge physics preview: returned definitions and polygon vertices are defensive copies', () => {
  const bridge = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  const first = bridge.getResolvedTerrainBodies();
  const second = bridge.getResolvedTerrainBodies();
  assert.notEqual(first, second);
  assert.notEqual(first[1], second[1]);
  if (first[1].shape.kind === 'POLYGON' && second[1].shape.kind === 'POLYGON') {
    first[1].shape.vertices[0].x = 999;
    assert.notEqual(second[1].shape.vertices[0].x, 999);
  }
  bridge.teardown();
});

test('ridge physics preview: teardown removes terrain bodies and clears diagnostics', () => {
  const bridge = new PhysicsBridge(emptyLevel(), CRAGGY_RIDGE_TERRAIN);
  assert.equal(bridge.getTerrainPhysicsDiagnostics().length, 3);
  assert.equal(bridge.getMatterTerrainBodyCount(), 3);
  bridge.teardown();
  assert.equal(bridge.getTerrainPhysicsDiagnostics().length, 0);
  assert.equal(bridge.getMatterTerrainBodyCount(), 0);
});

test('ridge physics preview: invalid polygon profile cannot enter runtime', () => {
  const invalid = structuredClone(CRAGGY_RIDGE_TERRAIN) as TerrainProfileDefinition;
  if (invalid.bodies[1].shape.kind === 'POLYGON') {
    invalid.bodies[1].shape.vertices = [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 20, y: 0 },
    ];
  }
  assert.throws(
    () => new PhysicsBridge(emptyLevel(), invalid),
    /Invalid terrain profile/,
  );
});

test('ridge physics preview: Level 1 flat terrain diagnostics remain unchanged', () => {
  const bridge = new PhysicsBridge(emptyLevel(), FLAT_SANCTUARY_TERRAIN);
  const diagnostics = bridge.getTerrainPhysicsDiagnostics();
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].terrainBodyId, 'terrain_flat_sanctuary_bedrock');
  assert.equal(diagnostics[0].label, 'ground_bedrock');
  assert.equal(diagnostics[0].shapeKind, 'RECTANGLE');
  assert.equal(diagnostics[0].friction, 0.95);
  assert.equal(diagnostics[0].restitution, 0);
  bridge.teardown();
});
