/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LEVEL_STATE, LEVEL_1_CONFIG } from '../config';
import { LevelStore } from '../state/levelStore';
import { LevelState } from '../types';
import { LEVEL_1_DEFINITION } from './levelDefinitions';
import { SiegeController } from './siegeController';

if (typeof (globalThis as any).localStorage === 'undefined') {
  const storageMap = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function prepareStore(): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  return store;
}

test('runtime integration: LevelStore resolves the canonical Level 1 definition', () => {
  const store = prepareStore();
  assert.equal(store.getActiveLevelDefinition(), LEVEL_1_DEFINITION);
  assert.equal(store.getState().levelId, LEVEL_1_DEFINITION.levelId);
});

test('runtime integration: Level 1 configuration is derived from the canonical definition', () => {
  const store = prepareStore();
  const config = store.getLevelConfiguration();
  assert.equal(config.levelId, LEVEL_1_DEFINITION.levelId);
  assert.equal(config.requiredWispCount, LEVEL_1_DEFINITION.requiredWispCount);
  assert.deepEqual(config.selectedWispIds, LEVEL_1_DEFINITION.selectedWispIds);
  assert.deepEqual(config.startingInventory, LEVEL_1_DEFINITION.startingInventory);
  assert.deepEqual(
    config.attackDefinitions,
    LEVEL_1_DEFINITION.attacks.map((slot) => slot.authoredAttackId),
  );
  assert.equal(
    config.reinforcementSchedule.afterAttackIndex,
    LEVEL_1_DEFINITION.reinforcementAfterAttackIndex,
  );
  assert.equal(config.prebuiltStructureId, LEVEL_1_DEFINITION.prebuiltStructureId);
});

test('runtime integration: unavailable persisted Level 2 identity safely hydrates as Level 1', () => {
  const store = prepareStore();
  const unavailable = clone(INITIAL_LEVEL_STATE) as LevelState;
  unavailable.levelId = 'craggy_ridge_02';
  unavailable.inventory = { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 };
  unavailable.requiredWispCount = 1;
  unavailable.activeWispIds = ['wisp_ignis'];
  unavailable.wisps = unavailable.wisps.slice(0, 1);

  assert.equal(store.hydrateState(unavailable), true);
  const state = store.getState();
  assert.equal(state.levelId, LEVEL_1_DEFINITION.levelId);
  assert.equal(state.requiredWispCount, LEVEL_1_DEFINITION.requiredWispCount);
  assert.deepEqual(state.activeWispIds, LEVEL_1_DEFINITION.selectedWispIds);
  assert.equal(state.wisps.length, LEVEL_1_DEFINITION.requiredWispCount);
});

test('runtime integration: reset derives roster and inventory from Level 1 definition', () => {
  const store = prepareStore();
  store.getState().inventory.wood_beam = 0;
  store.getState().levelId = 'unknown_level';
  store.resetLevel();
  const state = store.getState();
  assert.equal(state.levelId, LEVEL_1_DEFINITION.levelId);
  assert.deepEqual(state.inventory, LEVEL_1_DEFINITION.startingInventory);
  assert.deepEqual(state.wisps.map((wisp) => wisp.id), LEVEL_1_DEFINITION.selectedWispIds);
});

test('runtime integration: developer wisp override remains layered over Level 1 definition', () => {
  const store = prepareStore();
  store.setDeveloperWispCountOverride(5);
  assert.equal(store.getActiveLevelDefinition(), LEVEL_1_DEFINITION);
  assert.equal(store.getLevelConfiguration().requiredWispCount, 5);
  assert.equal(store.getState().wisps.length, 5);
  store.setDeveloperWispCountOverride(null);
  assert.equal(store.getRequiredWispCount(), LEVEL_1_DEFINITION.requiredWispCount);
  assert.deepEqual(store.getState().activeWispIds, LEVEL_1_DEFINITION.selectedWispIds);
});

test('runtime integration: SiegeController resolves Level 1 attack sequence identities', () => {
  const store = prepareStore();
  const siege = new SiegeController(store);
  assert.deepEqual(
    siege.attackSequence.map((entry) => entry.sequenceId),
    ['level1_attack_1', 'level1_attack_2'],
  );
  assert.deepEqual(
    siege.attackSequence.map((entry) => entry.authoredAttackId),
    LEVEL_1_CONFIG.attackDefinitions,
  );
  assert.equal(siege.reinforcementAfterAttackIndex, 0);
});

test('runtime integration: startSiege uses a defensive copy of sequence attack one', () => {
  const store = prepareStore();
  const siege = new SiegeController(store);
  const canonical = siege.attackSequence[0].attack;
  const originalVelocity = { ...canonical.launchVelocity };
  assert.equal(siege.startSiege(), true);
  assert.equal(siege.currentAttackIndex, 0);
  assert.equal(siege.currentAttackSequenceId, 'level1_attack_1');
  assert.notEqual(siege.currentAttack, canonical);
  assert.deepEqual(canonical.launchVelocity, originalVelocity);
  siege.teardown();
});

test('runtime integration: reinforcement preview resolves sequence attack two', () => {
  const store = prepareStore();
  const siege = new SiegeController(store);
  siege.jumpToPostAttack1TestState();
  assert.equal(siege.currentAttackIndex, 1);
  assert.equal(siege.currentAttackSequenceId, 'level1_attack_2');
  assert.equal(siege.currentAttack?.attackId, 'attack_2_heavy');
  assert.equal(siege.getAttacksRemaining(), 1);
  siege.teardown();
});

test('runtime integration: accepted Level 1 defaults remain byte-equivalent where required', () => {
  const store = prepareStore();
  assert.deepEqual(store.getState().inventory, INITIAL_LEVEL_STATE.inventory);
  assert.deepEqual(store.getLevelConfiguration().startingInventory, LEVEL_1_CONFIG.startingInventory);
  assert.equal(store.getLevelConfiguration().tutorialConfiguration.requiresBeam, true);
  assert.equal(store.getLevelConfiguration().tutorialConfiguration.requiresStabilityTest, true);
});
