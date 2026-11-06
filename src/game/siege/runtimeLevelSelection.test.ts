/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LEVEL_ID,
  getDefaultRuntimeLevelSelection,
  resolveLevelAttackSequence,
  resolveRuntimeLevelSelection,
} from './runtimeLevelSelection';
import { LEVEL_1_DEFINITION, LEVEL_2_DEFINITION } from './levelDefinitions';

test('runtime level: Level 1 is the deterministic default', () => {
  const selection = getDefaultRuntimeLevelSelection();
  assert.equal(selection.resolvedLevelId, DEFAULT_LEVEL_ID);
  assert.equal(selection.definition, LEVEL_1_DEFINITION);
  assert.equal(selection.fellBackToDefault, false);
});

test('runtime level: missing and unknown IDs safely fall back to Level 1', () => {
  for (const value of [undefined, null, '', 'missing_level']) {
    const selection = resolveRuntimeLevelSelection(value);
    assert.equal(selection.resolvedLevelId, DEFAULT_LEVEL_ID);
    assert.equal(selection.definition, LEVEL_1_DEFINITION);
  }
});

test('runtime level: Level 2 remains unavailable to normal progression', () => {
  const selection = resolveRuntimeLevelSelection('craggy_ridge_02');
  assert.equal(selection.resolvedLevelId, DEFAULT_LEVEL_ID);
  assert.equal(selection.fellBackToDefault, true);
  assert.equal(selection.availableForNormalProgression, true);
});

test('runtime level: developer resolution can inspect unavailable Level 2 deterministically', () => {
  const selection = resolveRuntimeLevelSelection('craggy_ridge_02', true);
  assert.equal(selection.resolvedLevelId, 'craggy_ridge_02');
  assert.equal(selection.definition, LEVEL_2_DEFINITION);
  assert.equal(selection.availableForNormalProgression, false);
});

test('runtime level: Level 1 attack sequence preserves accepted two-wave order', () => {
  const attacks = resolveLevelAttackSequence(LEVEL_1_DEFINITION);
  assert.deepEqual(attacks.map((entry) => entry.authoredAttackId), [
    'attack_1_standard',
    'attack_2_heavy',
  ]);
  assert.deepEqual(attacks.map((entry) => entry.sequenceId), [
    'level1_attack_1',
    'level1_attack_2',
  ]);
});

test('runtime level: repeated Level 2 authored attacks keep unique sequence identity', () => {
  const attacks = resolveLevelAttackSequence(LEVEL_2_DEFINITION);
  assert.equal(attacks[0].authoredAttackId, attacks[1].authoredAttackId);
  assert.notEqual(attacks[0].sequenceId, attacks[1].sequenceId);
  assert.equal(attacks[0].sequenceIndex, 0);
  assert.equal(attacks[1].sequenceIndex, 1);
});

test('runtime level: resolved attacks are defensive copies of authored attacks', () => {
  const first = resolveLevelAttackSequence(LEVEL_1_DEFINITION);
  const second = resolveLevelAttackSequence(LEVEL_1_DEFINITION);
  assert.notEqual(first[0].attack, second[0].attack);
  assert.notEqual(first[0].attack.launchVelocity, second[0].attack.launchVelocity);
  first[0].attack.launchVelocity.x = 999;
  assert.notEqual(second[0].attack.launchVelocity.x, 999);
});
