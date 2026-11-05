/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LevelStore } from './levelStore';

function freshStore(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  return store;
}

test('Tutorial suggestion: initial beam example starts from a real supported placement', () => {
  const store = freshStore();
  const initial = store.getAuthoritativeTutorialState();
  const region = initial.currentSuggestedPlacementRegion;

  assert.equal(initial.currentGuidedStep, 'STEP_1_SELECT_BEAM');
  assert.ok(region);
  assert.equal(region.pieceType, 'wood_beam');
  assert.deepEqual(region.center, { x: 200, y: 672 });
  assert.equal(region.label, 'Supported Beam Start');

  assert.equal(
    store.placePiece({
      id: 'tutorial_suggested_beam',
      type: 'wood_beam',
      position: { ...region.center },
      rotation: 0,
      isPrebuilt: false,
    }),
    true,
  );
  const afterPlacement = store.getAuthoritativeTutorialState();
  assert.equal(afterPlacement.beamPlaced, true);
  assert.equal(afterPlacement.supportedConnectionCreated, true);
});

test('Tutorial suggestion: placement remains optional and does not require the ghost coordinates', () => {
  const store = freshStore();
  const suggested = store.getAuthoritativeTutorialState().currentSuggestedPlacementRegion!;
  const freeChoicePosition = { x: 584, y: 672 };
  assert.notDeepEqual(freeChoicePosition, suggested.center);

  assert.equal(
    store.placePiece({
      id: 'tutorial_free_choice_beam',
      type: 'wood_beam',
      position: freeChoicePosition,
      rotation: 0,
      isPrebuilt: false,
    }),
    true,
  );
  const state = store.getAuthoritativeTutorialState();
  assert.equal(state.beamPlaced, true);
  assert.equal(state.currentGuidedStep, 'STEP_3_PLACE_BLOCK');
});

test('Tutorial suggestion: placing another valid beam elsewhere still advances guidance', () => {
  const store = freshStore();
  assert.equal(
    store.placePiece({
      id: 'tutorial_alternate_beam',
      type: 'wood_beam',
      position: { x: 392, y: 732 },
      rotation: 0,
      isPrebuilt: false,
    }),
    true,
  );

  const state = store.getAuthoritativeTutorialState();
  assert.equal(state.beamPlaced, true);
  assert.equal(state.currentHighlightedItemId, 'wood_block');
  assert.equal(state.currentSuggestedPlacementRegion?.pieceType, 'wood_block');
});

test('Tutorial suggestion: Skip Guidance removes the ghost without changing checklist logic', () => {
  const store = freshStore();
  store.setGuidanceSkipped(true);

  let state = store.getAuthoritativeTutorialState();
  assert.equal(state.guidanceSkipped, true);
  assert.equal(state.currentSuggestedPlacementRegion, null);
  assert.equal(state.siegeEligible, false);

  assert.equal(
    store.placePiece({
      id: 'tutorial_skipped_guidance_beam',
      type: 'wood_beam',
      position: { x: 200, y: 672 },
      rotation: 0,
      isPrebuilt: false,
    }),
    true,
  );
  state = store.getAuthoritativeTutorialState();
  assert.equal(state.beamPlaced, true);
  assert.equal(state.currentSuggestedPlacementRegion, null);
});
