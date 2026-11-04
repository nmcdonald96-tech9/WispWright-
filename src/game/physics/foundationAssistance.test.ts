/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import Matter from 'matter-js';
import { INITIAL_LEVEL_STATE } from '../config';
import { LevelState, PlacedPiece } from '../types';
import { PhysicsBridge } from './physicsBridge';

function levelWithPieces(pieces: PlacedPiece[]): LevelState {
  return {
    ...INITIAL_LEVEL_STATE,
    pieces,
    joints: [],
    wisps: [],
  };
}

test('Foundation Assistance: grounded block settles without adding a competing constraint', () => {
  const block: PlacedPiece = {
    id: 'assisted_wood',
    type: 'wood_block',
    position: { x: 360, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const bridge = new PhysicsBridge(levelWithPieces([block]));

  assert.deepEqual(bridge.getFoundationAssistDiagnostics(), [
    { pieceId: 'assisted_wood', state: 'INTACT', failureReason: null },
  ]);
  assert.equal(bridge.diagnostics.activeFoundationAssistCount, 1);
  assert.equal(bridge.diagnostics.constraintCount, 0);

  for (let i = 0; i < 180; i++) bridge.step(16.666);
  const transform = bridge.getSimulatedTransforms([block])[0];
  const report = bridge.getStabilityReport(3.0);
  assert.ok(Math.abs(transform.position.x - 360) < 0.01);
  assert.ok(Math.abs(transform.rotation) < 0.001);
  assert.equal(report.fallenCount, 0);
  assert.equal(report.isSettled, true);

  bridge.teardown();
});

test('Foundation Assistance: floating and substantially rotated pieces remain fully physical', () => {
  const floating: PlacedPiece = {
    id: 'floating_wood',
    type: 'wood_block',
    position: { x: 320, y: 650 },
    rotation: 0,
    isPrebuilt: false,
  };
  const rotated: PlacedPiece = {
    id: 'rotated_wood',
    type: 'wood_block',
    position: { x: 440, y: 746.06 },
    rotation: Math.PI / 4,
    isPrebuilt: false,
  };
  const bridge = new PhysicsBridge(levelWithPieces([floating, rotated]));
  assert.equal(bridge.getFoundationAssistDiagnostics().length, 0);
  bridge.teardown();
});

test('Foundation Assistance: meaningful impact removes assistance without creating a static body', () => {
  const block: PlacedPiece = {
    id: 'impact_wood',
    type: 'wood_block',
    position: { x: 400, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const bridge = new PhysicsBridge(levelWithPieces([block]));
  const internal = bridge as unknown as {
    applyPieceDamage(pieceId: string, impulse: number): void;
  };
  internal.applyPieceDamage('impact_wood', Number.MAX_SAFE_INTEGER);
  assert.deepEqual(bridge.getFoundationAssistDiagnostics(), [
    {
      pieceId: 'impact_wood',
      state: 'BROKEN',
      failureReason: 'CONNECTED_PIECE_BROKEN',
    },
  ]);
  assert.equal(bridge.diagnostics.activeFoundationAssistCount, 0);
  assert.equal(bridge.diagnostics.brokenFoundationAssistCount, 1);
  bridge.teardown();
});

test('Quiet-motion settlement: visually negligible motion can settle even when aggregate kinetic energy is above the legacy threshold', () => {
  const stone: PlacedPiece = {
    id: 'quiet_stone',
    type: 'stone_block',
    position: { x: 400, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const bridge = new PhysicsBridge(levelWithPieces([stone]));
  const internal = bridge as unknown as {
    pieceBodyMap: Map<string, Matter.Body>;
  };
  const body = internal.pieceBodyMap.get('quiet_stone');
  assert.ok(body);

  Matter.Body.setVelocity(body, { x: 0.20, y: 0.20 });
  Matter.Body.setAngularVelocity(body, 0.01);
  const report = bridge.getStabilityReport(3.0);

  assert.ok(
    report.totalKineticEnergy > 0.05,
    `Fixture must exceed the legacy energy gate, got ${report.totalKineticEnergy}`,
  );
  assert.equal(report.fallenCount, 0);
  assert.equal(report.isSettled, true);

  bridge.teardown();
});

test('Quiet-motion settlement: meaningful linear motion still blocks settlement', () => {
  const stone: PlacedPiece = {
    id: 'moving_stone',
    type: 'stone_block',
    position: { x: 400, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const bridge = new PhysicsBridge(levelWithPieces([stone]));
  const internal = bridge as unknown as {
    pieceBodyMap: Map<string, Matter.Body>;
  };
  const body = internal.pieceBodyMap.get('moving_stone');
  assert.ok(body);

  Matter.Body.setVelocity(body, { x: 0.80, y: 0 });
  const report = bridge.getStabilityReport(3.0);
  assert.equal(report.isSettled, false);

  bridge.teardown();
});

test('Quiet-motion settlement: meaningful angular motion still blocks settlement', () => {
  const stone: PlacedPiece = {
    id: 'rotating_stone',
    type: 'stone_block',
    position: { x: 400, y: 756 },
    rotation: 0,
    isPrebuilt: false,
  };
  const bridge = new PhysicsBridge(levelWithPieces([stone]));
  const internal = bridge as unknown as {
    pieceBodyMap: Map<string, Matter.Body>;
  };
  const body = internal.pieceBodyMap.get('rotating_stone');
  assert.ok(body);

  Matter.Body.setAngularVelocity(body, 0.06);
  const report = bridge.getStabilityReport(3.0);
  assert.equal(report.isSettled, false);

  bridge.teardown();
});
