/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverSecondaryBroadFaceSeams, isBroadFaceTimberJoint } from '../math/snapSolver';
import { PhysicsBridge } from '../physics/physicsBridge';
import { LevelState, PlacedPiece, TimberJoint } from '../types';
import { LevelStore } from './levelStore';

const STORAGE_KEY = 'alchemical_fortress_phase1_save_v1';

function installStorage(): Map<string, string> {
  const values = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
  return values;
}

function beam(): PlacedPiece {
  return { id: 'hydrate_beam', type: 'wood_beam', position: { x: 0, y: 100 }, rotation: 0, isPrebuilt: false };
}

function support(id: string, x: number): PlacedPiece {
  return { id, type: 'wood_block', position: { x, y: 136 }, rotation: 0, isPrebuilt: false };
}

function createStoreWithSupports(supports: PlacedPiece[]): LevelStore {
  const store = new LevelStore();
  store.clearStorage();
  const activeBeam = beam();
  store.getState().pieces = [activeBeam, ...supports];
  store.getState().joints = [];
  const proposals = discoverSecondaryBroadFaceSeams({
    activePieceId: activeBeam.id,
    activeType: activeBeam.type,
    finalizedPos: activeBeam.position,
    finalizedRot: activeBeam.rotation,
    activeIsPrebuilt: false,
    validPieces: supports,
    proposedTimberJoints: [],
    preservedJoints: [],
  });
  for (const proposal of proposals) {
    assert.ok(store.createOrUpdateTimberJointFromProposal(activeBeam.id, proposal));
  }
  return store;
}

function broadJoints(state: LevelState): TimberJoint[] {
  return (state.joints ?? []).filter(isBroadFaceTimberJoint).sort((a, b) => a.jointId.localeCompare(b.jointId));
}

function signature(state: LevelState) {
  return broadJoints(state).map((joint) => ({
    jointId: joint.jointId,
    state: joint.state,
    socketAId: joint.socketAId,
    socketBId: joint.socketBId,
    localAnchorA: joint.localAnchorA,
    localAnchorB: joint.localAnchorB,
    worldPosition: joint.worldPosition,
    canonicalRelationship: joint.canonicalRelationship,
  }));
}

test('Phase B2.4: storage hydration preserves the exact plural seam identity', () => {
  const storage = installStorage();
  const store = createStoreWithSupports([support('support_a', -24), support('support_b', 24)]);
  const expected = signature(store.getState());
  storage.set(STORAGE_KEY, JSON.stringify(store.getState()));

  const hydrated = new LevelStore();
  assert.deepEqual(signature(hydrated.getState()), expected);
  assert.equal(new Set(broadJoints(hydrated.getState()).map((joint) => joint.jointId)).size, 2);
});

test('Phase B2.4: repeated hydration never duplicates plural seams', () => {
  const storage = installStorage();
  const store = createStoreWithSupports([support('support_a', -24), support('support_b', 24)]);
  storage.set(STORAGE_KEY, JSON.stringify(store.getState()));
  const expected = signature(store.getState());

  for (let reload = 0; reload < 3; reload++) {
    const hydrated = new LevelStore();
    assert.deepEqual(signature(hydrated.getState()), expected);
    storage.set(STORAGE_KEY, JSON.stringify(hydrated.getState()));
  }
});

test('Phase B2.4: reinforcement preserves surviving and broken seams and adds C once', () => {
  installStorage();
  const a = support('support_a', -48);
  const b = support('support_b', 0);
  const c = support('support_c', 48);
  const store = createStoreWithSupports([a, b]);
  store.getState().pieces.push(c);
  const jointA = broadJoints(store.getState()).find((joint) => joint.pieceBId === a.id)!;
  jointA.state = 'BROKEN';
  jointA.failureReason = 'TEST_BREAK';
  store.setReinforcementMode(true);

  const candidates = store.getManualBindCandidates(beam().id);
  const cIndex = candidates.findIndex(
    (candidate) => candidate.targetPieceId === c.id && isBroadFaceTimberJoint(candidate),
  );
  assert.ok(cIndex >= 0);
  assert.ok(store.bindPieceConnection(beam().id, cIndex, true));

  const after = broadJoints(store.getState());
  assert.equal(after.find((joint) => joint.jointId === jointA.jointId)?.state, 'BROKEN');
  assert.equal(after.filter((joint) => joint.pieceBId === b.id && joint.state !== 'BROKEN').length, 1);
  assert.equal(after.filter((joint) => joint.pieceBId === c.id && joint.state !== 'BROKEN').length, 1);
  assert.equal(new Set(after.map((joint) => joint.jointId)).size, after.length);
});

test('Phase B2.4: reinforcement Undo and Redo restore only the new C seam', () => {
  installStorage();
  const a = support('support_a', -48);
  const b = support('support_b', 0);
  const c = support('support_c', 48);
  const store = createStoreWithSupports([a, b]);
  store.getState().pieces.push(c);
  store.setReinforcementMode(true);
  const candidates = store.getManualBindCandidates(beam().id);
  const cIndex = candidates.findIndex(
    (candidate) => candidate.targetPieceId === c.id && isBroadFaceTimberJoint(candidate),
  );
  assert.ok(cIndex >= 0);
  assert.ok(store.bindPieceConnection(beam().id, cIndex, true));

  assert.equal(broadJoints(store.getState()).filter((j) => j.pieceBId === c.id).length, 1);
  assert.equal(store.undo(), true);
  assert.equal(broadJoints(store.getState()).filter((j) => j.pieceBId === c.id).length, 0);
  assert.equal(broadJoints(store.getState()).filter((j) => j.pieceBId === a.id || j.pieceBId === b.id).length, 2);
  assert.equal(store.redo(), true);
  assert.equal(broadJoints(store.getState()).filter((j) => j.pieceBId === c.id).length, 1);
});

test('Phase B2.4: hydrated plural seams create one physics constraint each', () => {
  const storage = installStorage();
  const store = createStoreWithSupports([support('support_a', -24), support('support_b', 24)]);
  storage.set(STORAGE_KEY, JSON.stringify(store.getState()));
  const hydrated = new LevelStore();
  const bridge = new PhysicsBridge(hydrated.getState());

  assert.equal(bridge.diagnostics.activeTimberJointCount, 2);
  assert.equal(bridge.getSimulatedJoints().filter((joint) => joint.state !== 'BROKEN').length, 2);
  bridge.teardown();
});
