/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { WispContactEvent } from '../types';
import {
  advanceWispImpactReaction,
  createWispImpactReactionState,
  WISP_HARMLESS_TOUCH_HOLD_SEC,
  WISP_IMPACT_RECOVERY_HOLD_SEC,
} from './wispImpactReaction';

function event(
  overrides: Partial<WispContactEvent> = {},
): WispContactEvent {
  return {
    id: 'contact_1',
    attackId: 'attack_1',
    simTimestamp: 1,
    wispId: 'wisp_ignis',
    contactingObjectId: 'beam_1',
    contactingObjectType: 'piece',
    contactingObjectMaterial: 'wood_beam',
    contactingObjectCondition: 'INTACT',
    contactingObjectMass: 3.5,
    wispColliderBounds: { centerX: 300, centerY: 700, radius: 18 },
    objectColliderBounds: { minX: 250, maxX: 350, minY: 680, maxY: 704 },
    contactPoint: { x: 300, y: 688 },
    contactNormal: { x: 0, y: -1 },
    relativeLinearSpeed: 0.5,
    relativeAngularSpeedAtContact: 0,
    totalContactSpeed: 0.5,
    normalImpulse: 0.8,
    tangentialImpulse: 0,
    existingImpactSeverity: 0,
    wispDirectImpactThreshold: 1,
    wispDebrisImpactThreshold: 3.5,
    isAwake: true,
    contactPhase: 'FIRST_CONTACT',
    isDeduplicated: false,
    deduplicationReason: null,
    dispersalRequested: false,
    dispersalCommitted: false,
    notDispersedReason: null,
    category: 'HARMLESS_TOUCH',
    ...overrides,
  };
}

function frame(
  state = createWispImpactReactionState(),
  contactEvents: readonly WispContactEvent[] = [],
  overrides: Partial<Parameters<typeof advanceWispImpactReaction>[0]> = {},
) {
  return advanceWispImpactReaction({
    state,
    deltaSec: 1 / 60,
    tendency: 'BRAVE',
    contactEvents,
    isDispersed: false,
    structureIsSettling: false,
    structureIsSettled: false,
    ...overrides,
  });
}

test('impact reaction: harmless touch causes a brief startle', () => {
  const result = frame(createWispImpactReactionState(), [event()]);
  assert.equal(result.reactionState, 'STARTLED_JUMP');
  assert.equal(result.state.reactionRemainingSec, WISP_HARMLESS_TOUCH_HOLD_SEC);
});

test('impact reaction: nervous harmless touch uses gasp', () => {
  const result = frame(createWispImpactReactionState(), [event()], { tendency: 'NERVOUS' });
  assert.equal(result.reactionState, 'GASP');
});

test('impact reaction: surviving meaningful hit uses recovery dodge', () => {
  const result = frame(createWispImpactReactionState(), [
    event({ category: 'MEANINGFUL_DEBRIS_HIT', totalContactSpeed: 2, dispersalCommitted: false }),
  ]);
  assert.equal(result.reactionState, 'DODGE_LEAN');
  assert.equal(result.state.reactionRemainingSec, WISP_IMPACT_RECOVERY_HOLD_SEC);
});

test('impact reaction: nervous surviving hit cowers', () => {
  const result = frame(createWispImpactReactionState(), [
    event({ category: 'HEAVY_DEBRIS_HIT', totalContactSpeed: 2, dispersalCommitted: false }),
  ], { tendency: 'NERVOUS' });
  assert.equal(result.reactionState, 'COWER');
});

test('impact reaction: dispersal-committing hit never starts recovery', () => {
  const result = frame(createWispImpactReactionState(), [
    event({ category: 'MEANINGFUL_DEBRIS_HIT', dispersalCommitted: true }),
  ]);
  assert.equal(result.reactionState, null);
});

test('impact reaction: cosmetic and duplicate events are ignored', () => {
  const result = frame(createWispImpactReactionState(), [
    event({ id: 'cosmetic', category: 'COSMETIC_ONLY' }),
    event({ id: 'duplicate', category: 'DUPLICATE_EVENT', isDeduplicated: true }),
  ]);
  assert.equal(result.reactionState, null);
});

test('impact reaction: event IDs are consumed once', () => {
  const first = frame(createWispImpactReactionState(), [event()]);
  const second = frame(first.state, [event()]);
  assert.equal(first.consumedEventIds.length, 1);
  assert.equal(second.consumedEventIds.length, 0);
});

test('impact reaction: survivor transitions to relief after recovery at settlement', () => {
  const started = frame(createWispImpactReactionState(), [event()]);
  const relieved = frame(started.state, [], {
    deltaSec: WISP_HARMLESS_TOUCH_HOLD_SEC + 0.01,
    structureIsSettled: true,
  });
  assert.equal(relieved.reactionState, 'RELIEVED_EXHALE');
});

test('impact reaction: dispersed wisp clears all reaction state', () => {
  const started = frame(createWispImpactReactionState(), [event()]);
  const dispersed = frame(started.state, [], { isDispersed: true });
  assert.equal(dispersed.reactionState, null);
  assert.equal(dispersed.state.reactionRemainingSec, 0);
});
