/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveConstructionDamageVisualProfile,
  deriveConstructionMaterialLightingProfile,
  derivePieceVisualDescriptor,
} from './constructionTransformation';

function piece(
  materialType: 'wood_beam' | 'wood_block' | 'stone_block',
  overrides: Partial<Parameters<typeof derivePieceVisualDescriptor>[0]> = {},
) {
  return derivePieceVisualDescriptor({
    pieceId: `${materialType}_1`,
    materialType,
    transformationProgress: 1,
    ...overrides,
  });
}

test('C1.3 material: transformed beam receives deterministic upper-left lighting', () => {
  const descriptor = piece('wood_beam');
  const profile = deriveConstructionMaterialLightingProfile({ descriptor, isPrebuilt: false });
  assert.equal(profile.family, 'WOOD_BEAM_MATERIAL');
  assert.deepEqual(profile.keyLightDirection, { x: -0.71, y: -0.71 });
  assert.equal(profile.grainPathCount >= 2, true);
  assert.equal(profile.bevelWidthPx, 2.2);
});

test('C1.3 material: wood block uses a wider bevel and recessed face shadow', () => {
  const profile = deriveConstructionMaterialLightingProfile({
    descriptor: piece('wood_block'), isPrebuilt: false,
  });
  assert.equal(profile.family, 'WOOD_BLOCK_MATERIAL');
  assert.equal(profile.bevelWidthPx, 2.8);
  assert.ok(profile.recessShadowAlpha > 0.25);
});

test('C1.3 material: Ancient Cut Stone receives rune groove and controlled glow', () => {
  const descriptor = piece('stone_block');
  const prebuilt = deriveConstructionMaterialLightingProfile({ descriptor, isPrebuilt: true });
  const playerStone = deriveConstructionMaterialLightingProfile({ descriptor, isPrebuilt: false });
  assert.equal(prebuilt.family, 'STONE_MATERIAL');
  assert.equal(prebuilt.runeGrooveAlpha, 0.82);
  assert.equal(prebuilt.runeGlowAlpha, 0.46);
  assert.equal(playerStone.runeGlowAlpha, 0);
  assert.ok(prebuilt.contactShadowAlpha > 0.3);
});

test('C1.3 material: reduced intensity lowers glow and highlights but preserves geometry cues', () => {
  const descriptor = piece('stone_block');
  const normal = deriveConstructionMaterialLightingProfile({ descriptor, isPrebuilt: true });
  const reduced = deriveConstructionMaterialLightingProfile({
    descriptor, isPrebuilt: true, reducedIntensity: true,
  });
  assert.ok(reduced.runeGlowAlpha < normal.runeGlowAlpha);
  assert.ok(reduced.topHighlightAlpha < normal.topHighlightAlpha);
  assert.equal(reduced.bevelWidthPx, normal.bevelWidthPx);
  assert.equal(reduced.runeGrooveAlpha, normal.runeGrooveAlpha);
});

test('C1.3 material: deterministic seed selects stable surface variation', () => {
  const descriptor = piece('wood_beam');
  const first = deriveConstructionMaterialLightingProfile({ descriptor, isPrebuilt: false });
  const second = deriveConstructionMaterialLightingProfile({ descriptor, isPrebuilt: false });
  assert.deepEqual(second, first);
  assert.equal(first.surfaceVariant, descriptor.seed % 8);
});

test('C1.3 damage: intact material has no crack or exposed-material treatment', () => {
  const damage = deriveConstructionDamageVisualProfile(piece('wood_beam'));
  assert.equal(damage.crackAlpha, 0);
  assert.equal(damage.exposedMaterialAlpha, 0);
  assert.equal(damage.chipCount, 0);
  assert.equal(damage.attachmentRegion, 'WOOD_SURFACE');
});

test('C1.3 damage: cracked wood exposes lighter material across front and side faces', () => {
  const descriptor = piece('wood_beam', { condition: 'CRACKED', impactSeverity: 0.7 });
  const damage = deriveConstructionDamageVisualProfile(descriptor);
  assert.equal(damage.condition, 'CRACKED');
  assert.equal(damage.severity, 0.7);
  assert.ok(damage.crackAlpha > 0.7);
  assert.ok(damage.sideFaceDamageAlpha > 0.4);
  assert.ok(damage.chipCount >= 4);
});

test('C1.3 damage: stone selects a stone attachment region without adding gameplay state', () => {
  const descriptor = piece('stone_block', { condition: 'CRACKED', impactSeverity: 0.5 });
  const before = JSON.stringify(descriptor);
  const damage = deriveConstructionDamageVisualProfile(descriptor);
  assert.equal(damage.attachmentRegion, 'STONE_SURFACE');
  assert.equal(JSON.stringify(descriptor), before);
});

test('C1.3 damage: prototype mode exposes no future elemental attachment region', () => {
  const descriptor = piece('wood_beam', { transformationProgress: 0 });
  const damage = deriveConstructionDamageVisualProfile(descriptor);
  assert.equal(damage.attachmentRegion, 'NONE');
});
