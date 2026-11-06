/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLevelDefinition,
  LEVEL_1_DEFINITION,
  LEVEL_2_DEFINITION,
  LevelDefinition,
  validateLevelDefinition,
} from './levelDefinitions';

test('level definitions: Level 1 mirrors the accepted configuration', () => {
  assert.equal(LEVEL_1_DEFINITION.levelId, 'alchemical_sanctuary_01');
  assert.equal(LEVEL_1_DEFINITION.requiredWispCount, 3);
  assert.deepEqual(LEVEL_1_DEFINITION.selectedWispIds, [
    'wisp_ignis',
    'wisp_zephyr',
    'wisp_marinus',
  ]);
  assert.deepEqual(LEVEL_1_DEFINITION.startingInventory, {
    wood_beam: 4,
    wood_block: 4,
    stone_block: 3,
    bullseye_block: 1,
  });
  assert.deepEqual(
    LEVEL_1_DEFINITION.attacks.map((attack) => attack.authoredAttackId),
    ['attack_1_standard', 'attack_2_heavy'],
  );
  assert.equal(LEVEL_1_DEFINITION.reinforcementAfterAttackIndex, 0);
  assert.equal(validateLevelDefinition(LEVEL_1_DEFINITION).valid, true);
});

test('level definitions: Level 2 uses three attacks and reinforces after attack two', () => {
  assert.equal(LEVEL_2_DEFINITION.attacks.length, 3);
  assert.deepEqual(
    LEVEL_2_DEFINITION.attacks.map((attack) => attack.authoredAttackId),
    ['attack_1_standard', 'attack_1_standard', 'attack_2_heavy'],
  );
  assert.equal(LEVEL_2_DEFINITION.reinforcementAfterAttackIndex, 1);
  assert.deepEqual(
    LEVEL_2_DEFINITION.attacks.map((attack) => attack.preferredArc),
    ['HIGH', 'HIGH', 'HIGH'],
  );
  assert.equal(LEVEL_2_DEFINITION.terrainProfileId, 'CRAGGY_RIDGE_HIGH_ARC');
  assert.equal(validateLevelDefinition(LEVEL_2_DEFINITION).valid, true);
});

test('level definitions: Level 2 initially preserves Level 1 material capacity', () => {
  assert.deepEqual(LEVEL_2_DEFINITION.startingInventory, LEVEL_1_DEFINITION.startingInventory);
  assert.notEqual(LEVEL_2_DEFINITION.startingInventory, LEVEL_1_DEFINITION.startingInventory);
});

test('level definitions: repeated authored attacks retain unique sequence identities', () => {
  const ids = LEVEL_2_DEFINITION.attacks.map((attack) => attack.sequenceId);
  assert.equal(new Set(ids).size, ids.length);
});

test('level definitions: deterministic lookup returns the canonical definition', () => {
  assert.equal(getLevelDefinition('craggy_ridge_02'), LEVEL_2_DEFINITION);
  assert.equal(getLevelDefinition('alchemical_sanctuary_01'), LEVEL_1_DEFINITION);
});

test('level definitions: malformed wisp configuration is rejected', () => {
  const invalid: LevelDefinition = {
    ...LEVEL_2_DEFINITION,
    selectedWispIds: ['wisp_ignis', 'wisp_ignis'],
  };
  const result = validateLevelDefinition(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('unique')));
  assert.ok(result.errors.some((error) => error.includes('length')));
});

test('level definitions: unknown authored attacks are rejected', () => {
  const invalid: LevelDefinition = {
    ...LEVEL_2_DEFINITION,
    attacks: [
      ...LEVEL_2_DEFINITION.attacks.slice(0, 2),
      { ...LEVEL_2_DEFINITION.attacks[2], authoredAttackId: 'missing_attack' },
    ],
  };
  const result = validateLevelDefinition(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('missing_attack')));
});

test('level definitions: reinforcement must leave at least one later attack', () => {
  const invalid: LevelDefinition = {
    ...LEVEL_2_DEFINITION,
    reinforcementAfterAttackIndex: 2,
  };
  const result = validateLevelDefinition(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('precede')));
});

test('level definitions: inventory counts must be non-negative integers', () => {
  const invalid: LevelDefinition = {
    ...LEVEL_2_DEFINITION,
    startingInventory: { ...LEVEL_2_DEFINITION.startingInventory, wood_beam: -1 },
  };
  const result = validateLevelDefinition(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('wood_beam')));
});
