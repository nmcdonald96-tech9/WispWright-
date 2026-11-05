/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePieceVisualDescriptor } from '../presentation/constructionTransformation';
import { getTransformedMaterialLightingRenderStyle } from './renderPieces';

function descriptor(
  materialType: 'wood_beam' | 'wood_block' | 'stone_block',
  condition: 'INTACT' | 'CRACKED' | 'BROKEN' = 'INTACT',
  severity = 0,
) {
  return derivePieceVisualDescriptor({
    pieceId: `${materialType}_1`, materialType, condition,
    impactSeverity: severity, transformationProgress: 1,
  });
}

test('C1.3 rendering: beam material style exposes deterministic grain and bevel data', () => {
  const style = getTransformedMaterialLightingRenderStyle(descriptor('wood_beam'), false);
  assert.equal(style.family, 'WOOD_BEAM_MATERIAL');
  assert.ok(style.grainPathCount >= 2);
  assert.equal(style.bevelWidthPx, 2.2);
  assert.ok(style.topHighlightAlpha > 0);
});

test('C1.3 rendering: wood block receives a wider frame bevel', () => {
  const beam = getTransformedMaterialLightingRenderStyle(descriptor('wood_beam'), false);
  const block = getTransformedMaterialLightingRenderStyle(descriptor('wood_block'), false);
  assert.equal(block.family, 'WOOD_BLOCK_MATERIAL');
  assert.ok(block.bevelWidthPx > beam.bevelWidthPx);
  assert.ok(block.recessShadowAlpha > 0);
});

test('C1.3 rendering: prebuilt stone gets grooves and local rune glow', () => {
  const stone = getTransformedMaterialLightingRenderStyle(descriptor('stone_block'), true);
  assert.equal(stone.family, 'STONE_MATERIAL');
  assert.equal(stone.runeGrooveAlpha, 0.82);
  assert.equal(stone.runeGlowAlpha, 0.46);
});

test('C1.3 rendering: cracked wood exposes damage on front and depth-facing edges', () => {
  const style = getTransformedMaterialLightingRenderStyle(
    descriptor('wood_beam', 'CRACKED', 0.7), false,
  );
  assert.ok(style.crackAlpha > 0.7);
  assert.ok(style.exposedMaterialAlpha > 0.6);
  assert.ok(style.sideFaceDamageAlpha > 0.4);
  assert.ok(style.chipCount >= 4);
});

test('C1.3 rendering: intact pieces remain free of material damage overlays', () => {
  const style = getTransformedMaterialLightingRenderStyle(descriptor('stone_block'), true);
  assert.equal(style.crackAlpha, 0);
  assert.equal(style.exposedMaterialAlpha, 0);
  assert.equal(style.chipCount, 0);
});

test('C1.3 rendering: rendering style derivation is stable and input-only', () => {
  const input = descriptor('wood_block', 'CRACKED', 0.45);
  const before = JSON.stringify(input);
  assert.deepEqual(
    getTransformedMaterialLightingRenderStyle(input, false),
    getTransformedMaterialLightingRenderStyle(input, false),
  );
  assert.equal(JSON.stringify(input), before);
});
