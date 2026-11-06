/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWispEmoteReadability, createWispEmoteReadabilityState } from './wispEmoteReadability';

test('emote readability: alert receives a minimum readable hold', () => {
  const result = advanceWispEmoteReadability({ state: createWispEmoteReadabilityState(), requestedReaction: 'ALARMED_ALERT', deltaSec: 1 / 60, isDispersed: false, celebrationActive: false, reducedMotion: false });
  assert.equal(result.displayedReaction, 'ALARMED_ALERT');
  assert.ok(result.holdRemainingSec >= 0.35);
});

test('emote readability: ordinary watch cannot erase a fresh brace', () => {
  const brace = advanceWispEmoteReadability({ state: createWispEmoteReadabilityState(), requestedReaction: 'BRACE_FOR_IMPACT', deltaSec: 0, isDispersed: false, celebrationActive: false, reducedMotion: false });
  const watched = advanceWispEmoteReadability({ state: brace, requestedReaction: 'WATCH_TRAJECTORY', deltaSec: 0.1, isDispersed: false, celebrationActive: false, reducedMotion: false });
  assert.equal(watched.displayedReaction, 'BRACE_FOR_IMPACT');
});

test('emote readability: higher-priority near miss interrupts warning hold', () => {
  const alert = advanceWispEmoteReadability({ state: createWispEmoteReadabilityState(), requestedReaction: 'ALARMED_ALERT', deltaSec: 0, isDispersed: false, celebrationActive: false, reducedMotion: false });
  const dodge = advanceWispEmoteReadability({ state: alert, requestedReaction: 'DODGE_LEAN', deltaSec: 0.05, isDispersed: false, celebrationActive: false, reducedMotion: false });
  assert.equal(dodge.displayedReaction, 'DODGE_LEAN');
});

test('emote readability: transition progress eases over multiple frames', () => {
  const started = advanceWispEmoteReadability({ state: createWispEmoteReadabilityState(), requestedReaction: 'GASP', deltaSec: 0, isDispersed: false, celebrationActive: false, reducedMotion: false });
  const advanced = advanceWispEmoteReadability({ state: started, requestedReaction: 'GASP', deltaSec: 0.05, isDispersed: false, celebrationActive: false, reducedMotion: false });
  assert.ok(advanced.transitionProgress > 0 && advanced.transitionProgress < 1);
});

test('emote readability: dispersal and celebration bypass holds immediately', () => {
  const brace = advanceWispEmoteReadability({ state: createWispEmoteReadabilityState(), requestedReaction: 'BRACE_FOR_IMPACT', deltaSec: 0, isDispersed: false, celebrationActive: false, reducedMotion: false });
  const dispersed = advanceWispEmoteReadability({ state: brace, requestedReaction: 'DISPERSING_GATHER', deltaSec: 0.01, isDispersed: true, celebrationActive: false, reducedMotion: false });
  assert.equal(dispersed.displayedReaction, 'DISPERSING_GATHER');
  const celebrated = advanceWispEmoteReadability({ state: brace, requestedReaction: 'CELEBRATION_CHORUS', deltaSec: 0.01, isDispersed: false, celebrationActive: true, reducedMotion: false });
  assert.equal(celebrated.displayedReaction, 'CELEBRATION_CHORUS');
});

test('emote readability: reduced motion makes the pose transition immediate', () => {
  const result = advanceWispEmoteReadability({ state: createWispEmoteReadabilityState(), requestedReaction: 'GASP', deltaSec: 0, isDispersed: false, celebrationActive: false, reducedMotion: true });
  assert.equal(result.transitionProgress, 1);
});

test('emote readability: terminal outcome immediately replaces a lingering hold', () => {
  const relief = advanceWispEmoteReadability({
    state: createWispEmoteReadabilityState(),
    requestedReaction: 'RELIEVED_EXHALE',
    deltaSec: 0,
    isDispersed: false,
    celebrationActive: false,
    reducedMotion: false,
  });

  const solemn = advanceWispEmoteReadability({
    state: relief,
    requestedReaction: 'SOLEMN_SURVIVAL',
    deltaSec: 0.016,
    isDispersed: false,
    celebrationActive: false,
    terminalOutcomeActive: true,
    reducedMotion: false,
  });

  assert.equal(solemn.displayedReaction, 'SOLEMN_SURVIVAL');
  assert.equal(solemn.holdRemainingSec, 0);
  assert.equal(solemn.transitionProgress, 1);
});

