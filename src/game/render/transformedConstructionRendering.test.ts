/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePieceVisualDescriptor } from '../presentation/constructionTransformation';
import { getTransformedPieceDecorationStyle } from './renderPieces';

test('C1 visible pieces: prototype descriptors produce no decorative family', () => {
  const descriptor = derivePieceVisualDescriptor({
    pieceId: 'beam_1', materialType: 'wood_beam', transformationProgress: 0,
  });
  assert.deepEqual(getTransformedPieceDecorationStyle(descriptor, false), {
    alpha: 0, family: 'NONE', variant: descriptor.variantStyle, prebuiltRune: false,
  });
});

test('C1 visible pieces: wood pieces select deterministic detail families', () => {
  const beam = derivePieceVisualDescriptor({
    pieceId: 'beam_1', materialType: 'wood_beam', transformationProgress: 1,
  });
  const block = derivePieceVisualDescriptor({
    pieceId: 'block_1', materialType: 'wood_block', transformationProgress: 1,
  });
  assert.equal(getTransformedPieceDecorationStyle(beam, false).family, 'WOOD_BEAM');
  assert.equal(getTransformedPieceDecorationStyle(block, false).family, 'WOOD_BLOCK');
  assert.deepEqual(
    getTransformedPieceDecorationStyle(beam, false),
    getTransformedPieceDecorationStyle(beam, false),
  );
});

test('C1 visible pieces: Ancient Cut Stone enables transformed rune treatment', () => {
  const stone = derivePieceVisualDescriptor({
    pieceId: 'prebuilt_stone_left_1', materialType: 'stone_block', transformationProgress: 1,
  });
  assert.deepEqual(getTransformedPieceDecorationStyle(stone, true), {
    alpha: 1, family: 'STONE', variant: stone.variantStyle, prebuiltRune: true,
  });
});

test('C1 visible pieces: transition alpha follows presentation progress', () => {
  const descriptor = derivePieceVisualDescriptor({
    pieceId: 'beam_1', materialType: 'wood_beam', transformationProgress: 0.42,
  });
  assert.equal(getTransformedPieceDecorationStyle(descriptor, false).alpha, 0.42);
});

test('C1 visible pieces: omitted descriptors preserve prototype callers', () => {
  assert.deepEqual(getTransformedPieceDecorationStyle(undefined, true), {
    alpha: 0, family: 'NONE', variant: 0, prebuiltRune: false,
  });
});
