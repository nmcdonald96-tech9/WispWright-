/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveConstructionDepthProfile,
  deriveConstructionSeamDepthProfile,
} from './constructionTransformation';

test('C1.2 depth: prototype mode produces no extrusion', () => {
  assert.deepEqual(
    deriveConstructionDepthProfile({
      materialType: 'wood_beam', isPrebuilt: false, transformationProgress: 0,
    }),
    {
      family: 'NONE', alpha: 0, depthVector: { x: 0, y: 0 },
      topFaceAlpha: 0, sideFaceAlpha: 0, contactShadowAlpha: 0,
      hardwareLiftPx: 0, runeRecessPx: 0,
    },
  );
});

test('C1.2 depth: wood beam and block select distinct deterministic profiles', () => {
  const beam = deriveConstructionDepthProfile({
    materialType: 'wood_beam', isPrebuilt: false, transformationProgress: 1,
  });
  const block = deriveConstructionDepthProfile({
    materialType: 'wood_block', isPrebuilt: false, transformationProgress: 1,
  });
  assert.equal(beam.family, 'WOOD_BEAM_DEPTH');
  assert.deepEqual(beam.depthVector, { x: 6, y: -6 });
  assert.equal(block.family, 'WOOD_BLOCK_DEPTH');
  assert.deepEqual(block.depthVector, { x: 6.9, y: -6.9 });
});

test('C1.2 depth: prebuilt Ancient Cut Stone receives deeper extrusion and rune recess', () => {
  const stone = deriveConstructionDepthProfile({
    materialType: 'stone_block', isPrebuilt: true, transformationProgress: 1,
  });
  assert.equal(stone.family, 'STONE_DEPTH');
  assert.deepEqual(stone.depthVector, { x: 8.4, y: -8.4 });
  assert.ok(stone.contactShadowAlpha > 0.3);
  assert.equal(stone.runeRecessPx, 2.2);
});

test('C1.2 depth: transition progress scales depth without changing family', () => {
  const half = deriveConstructionDepthProfile({
    materialType: 'wood_beam', isPrebuilt: false, transformationProgress: 0.5,
  });
  assert.equal(half.family, 'WOOD_BEAM_DEPTH');
  assert.equal(half.alpha, 0.5);
  assert.deepEqual(half.depthVector, { x: 6, y: -6 });
  assert.equal(half.hardwareLiftPx, 1.2);
});

test('C1.2 depth: depth derivation is deterministic and input-only', () => {
  const input = {
    materialType: 'stone_block' as const,
    isPrebuilt: true,
    transformationProgress: 0.7,
  };
  const before = JSON.stringify(input);
  assert.deepEqual(deriveConstructionDepthProfile(input), deriveConstructionDepthProfile(input));
  assert.equal(JSON.stringify(input), before);
});

test('C1.2 depth: broad-face and endpoint hardware receive distinct depth profiles', () => {
  const broad = deriveConstructionSeamDepthProfile({
    jointType: 'TIMBER_FACE',
    socketAId: 'beam_SIDE_BOTTOM_CENTER',
    socketBId: 'block_TOP_EDGE',
    state: 'INTACT',
  }, 1);
  const endpoint = deriveConstructionSeamDepthProfile({
    jointType: 'TIMBER_FACE',
    socketAId: 'beam_END_A_CENTER',
    socketBId: 'block_LEFT_EDGE',
    state: 'INTACT',
  }, 1);
  assert.equal(broad.family, 'BROAD_FACE_CLAMP');
  assert.equal(endpoint.family, 'ENDPOINT_SHOE');
  assert.ok(broad.hardwareLiftPx > endpoint.hardwareLiftPx);
  assert.notDeepEqual(broad.depthVector, endpoint.depthVector);
});

test('C1.2 depth: broken seam keeps depth identity and selects damaged hardware', () => {
  const broken = deriveConstructionSeamDepthProfile({
    jointType: 'TIMBER_FACE',
    socketAId: 'beam_SIDE_BOTTOM_CENTER',
    socketBId: 'block_TOP_EDGE',
    state: 'BROKEN',
  }, 1);
  assert.equal(broken.family, 'BROAD_FACE_CLAMP');
  assert.equal(broken.damagedHardware, true);
});

test('C1.2 depth: missing transformation progress cannot create seam extrusion', () => {
  const flat = deriveConstructionSeamDepthProfile({
    jointType: 'TIMBER_FACE',
    socketAId: 'beam_END_A_CENTER',
    socketBId: 'block_LEFT_EDGE',
    state: 'INTACT',
  }, 0);
  assert.equal(flat.alpha, 0);
  assert.deepEqual(flat.depthVector, { x: 0, y: 0 });
  assert.equal(flat.hardwareLiftPx, 0);
});
