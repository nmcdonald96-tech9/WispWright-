/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LevelStore } from './levelStore';

test('LevelStore placePiece decrements inventory and supports undo', () => {
  const store = new LevelStore();
  const initialBeams = store.getState().inventory.wood_beam;

  const piece = {
    id: 'test_beam_1',
    type: 'wood_beam' as const,
    position: { x: 300, y: 600 },
    rotation: 0,
    isPrebuilt: false,
  };

  const placed = store.placePiece(piece);
  assert.equal(placed, true);
  assert.equal(store.getState().inventory.wood_beam, initialBeams - 1);
  assert.equal(store.canUndo(), true);

  // Undo placement
  store.undo();
  assert.equal(store.getState().inventory.wood_beam, initialBeams);
  assert.equal(store.getState().pieces.some((p) => p.id === 'test_beam_1'), false);
  assert.equal(store.canRedo(), true);

  // Redo placement
  store.redo();
  assert.equal(store.getState().inventory.wood_beam, initialBeams - 1);
  assert.equal(store.getState().pieces.some((p) => p.id === 'test_beam_1'), true);
});

test('LevelStore snapshot and restore losslessly reverts test alterations', () => {
  const store = new LevelStore();
  const initialPieceCount = store.getState().pieces.length;

  store.captureSnapshot();

  // Simulate pieces changing/moving during simulation
  store.placePiece({
    id: 'extra_piece',
    type: 'wood_block' as const,
    position: { x: 200, y: 300 },
    rotation: Math.PI / 4,
    isPrebuilt: false,
  });

  assert.equal(store.getState().pieces.length, initialPieceCount + 1);

  // Restore snapshot
  const restored = store.restorePreTestSnapshot();
  assert.equal(restored, true);
  assert.equal(store.getState().pieces.length, initialPieceCount);
});
