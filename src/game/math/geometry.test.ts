/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE } from '../config';
import {
  checkOBBOverlap,
  createOBB,
  isPointInOBB,
  Vec2,
} from './geometry';
import { snapAngle45, solveSnapAndValidation } from './snapSolver';

test('Vec2 basic vector math works as expected', () => {
  const v1 = Vec2.create(3, 4);
  assert.equal(Vec2.length(v1), 5);

  const v2 = Vec2.create(1, 2);
  const sum = Vec2.add(v1, v2);
  assert.deepEqual(sum, { x: 4, y: 6 });

  const rotated = Vec2.rotate({ x: 1, y: 0 }, Math.PI / 2);
  assert.ok(Math.abs(rotated.x) < 1e-6);
  assert.ok(Math.abs(rotated.y - 1) < 1e-6);
});

test('createOBB and isPointInOBB accurately detects bounds', () => {
  const obb = createOBB({ x: 100, y: 100 }, 40, 40, 0);
  assert.equal(isPointInOBB({ x: 100, y: 100 }, obb), true);
  assert.equal(isPointInOBB({ x: 115, y: 115 }, obb), true);
  assert.equal(isPointInOBB({ x: 130, y: 100 }, obb), false);
});

test('checkOBBOverlap detects separated vs colliding oriented boxes', () => {
  const box1 = createOBB({ x: 100, y: 100 }, 40, 40, 0);
  const box2 = createOBB({ x: 200, y: 200 }, 40, 40, 0);
  assert.equal(checkOBBOverlap(box1, box2), false);

  const box3 = createOBB({ x: 110, y: 100 }, 40, 40, 0);
  assert.equal(checkOBBOverlap(box1, box3), true);
});

test('snapAngle45 rounds angles to nearest 45 degree increment', () => {
  const angleNearZero = 0.05;
  assert.equal(snapAngle45(angleNearZero), 0);

  const angleNear45 = Math.PI / 4 + 0.05;
  assert.ok(Math.abs(snapAngle45(angleNear45) - Math.PI / 4) < 1e-6);

  const angleNear90 = Math.PI / 2 - 0.05;
  assert.ok(Math.abs(snapAngle45(angleNear90) - Math.PI / 2) < 1e-6);
});

test('solveSnapAndValidation snaps to environmental anchor when proximate', () => {
  const anchors = INITIAL_LEVEL_STATE.anchors;
  // anchor_left is at (200, 780), anchor socket at (200, 756)
  const candidatePos = { x: 204, y: 740 };
  const result = solveSnapAndValidation(
    'stone_block',
    candidatePos,
    0,
    [], // empty placed pieces
    anchors,
    true,
  );

  assert.equal(result.snapped, true);
  assert.equal(result.attachedAnchorId, 'anchor_left');
  assert.equal(result.position.x, 200);
});
