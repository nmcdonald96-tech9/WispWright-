/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE } from '../config';
import { LevelStore } from '../state/levelStore';
import { LevelState } from '../types';
import { PhysicsBridge } from './physicsBridge';

test('Physics Checkpoint: Default preset structure starts with zero overlaps and settles stably', () => {
  const bridge = new PhysicsBridge(INITIAL_LEVEL_STATE);

  // 1. Initial overlap verification
  assert.equal(bridge.diagnostics.initialOverlapCount, 0, 'Must have 0 initial penetrating overlaps');
  assert.equal(bridge.diagnostics.maxInitialPenetration, 0, 'Max initial penetration must be 0');
  assert.equal(bridge.diagnostics.physicsBodyCount, INITIAL_LEVEL_STATE.pieces.length + 1 + 3);
  assert.equal(bridge.diagnostics.constraintCount, 3);

  // 2. Advance 120 frames (2 seconds of fixed 60Hz physics)
  for (let i = 0; i < 120; i++) {
    bridge.step(16.666);
  }
  const report = bridge.getStabilityReport(2.0);

  assert.equal(report.isSettled, true, 'Default fortress must reach settled state within 2s');
  assert.ok(report.totalKineticEnergy < 0.01, `Kinetic energy must be near zero, was ${report.totalKineticEnergy}`);
  assert.equal(report.fallenCount, 0, 'Preset pieces must not fall');

  bridge.teardown();
});

test('Physics Checkpoint: Dropped wood vs stone block settling', () => {
  // Wood block dropped from y=600
  const woodLevel: LevelState = {
    ...INITIAL_LEVEL_STATE,
    pieces: [{ id: 'wood_1', type: 'wood_block', position: { x: 400, y: 600 }, rotation: 0, isPrebuilt: false }],
  };
  const woodBridge = new PhysicsBridge(woodLevel);
  for (let i = 0; i < 180; i++) woodBridge.step(16.666);
  assert.equal(woodBridge.getStabilityReport(3.0).isSettled, true);
  woodBridge.teardown();

  // Stone block dropped from y=600
  const stoneLevel: LevelState = {
    ...INITIAL_LEVEL_STATE,
    pieces: [{ id: 'stone_1', type: 'stone_block', position: { x: 400, y: 600 }, rotation: 0, isPrebuilt: false }],
  };
  const stoneBridge = new PhysicsBridge(stoneLevel);
  for (let i = 0; i < 180; i++) stoneBridge.step(16.666);
  assert.equal(stoneBridge.getStabilityReport(3.0).isSettled, true);
  stoneBridge.teardown();
});

test('Physics Checkpoint: Stacked blocks without initial penetration', () => {
  const stackedLevel: LevelState = {
    ...INITIAL_LEVEL_STATE,
    pieces: [
      { id: 'b1', type: 'stone_block', position: { x: 400, y: 756 }, rotation: 0, isPrebuilt: false },
      { id: 'b2', type: 'stone_block', position: { x: 400, y: 708 }, rotation: 0, isPrebuilt: false },
    ],
  };
  const bridge = new PhysicsBridge(stackedLevel);
  assert.equal(bridge.diagnostics.initialOverlapCount, 0);
  for (let i = 0; i < 120; i++) bridge.step(16.666);
  assert.equal(bridge.getStabilityReport(2.0).isSettled, true);
  bridge.teardown();
});

test('Physics Checkpoint: Repeated test & restore cycles maintain constant invariant counts', () => {
  const store = new LevelStore();
  const initialCount = store.getState().pieces.length;

  for (let cycle = 1; cycle <= 3; cycle++) {
    store.captureSnapshot();
    const bridge = new PhysicsBridge(store.getState());

    assert.equal(bridge.diagnostics.logicalPieceCount, initialCount);
    assert.equal(bridge.diagnostics.physicsBodyCount, initialCount + 1 + 3);
    assert.equal(bridge.diagnostics.constraintCount, 3);

    for (let i = 0; i < 60; i++) bridge.step(16.666);
    const report = bridge.getStabilityReport(1.0);
    assert.ok(report.totalKineticEnergy < 0.02);

    bridge.teardown();
    store.restorePreTestSnapshot();

    assert.equal(store.getState().pieces.length, initialCount);
  }
});
