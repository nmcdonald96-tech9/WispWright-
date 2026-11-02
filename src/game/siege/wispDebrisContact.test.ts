/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhysicsBridge } from '../physics/physicsBridge';
import { LevelState, MaterialType, WispEntity } from '../types';
import { LevelStore } from '../state/levelStore';
import { SiegeController } from './siegeController';
import { PresentationDirector } from '../presentation/presentationDirector';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function createTestState(pieces: Array<{ id: string; type: MaterialType; x: number; y: number; rot?: number }>): LevelState {
  const wisps: WispEntity[] = [
    {
      id: 'wisp_ignis',
      name: 'Ignis',
      title: 'The Spark',
      element: 'ignis',
      position: { x: 300, y: 700 },
      radius: 18,
      color: '#ff6b4a',
      glowColor: '#ff9d76',
      expression: 'calm',
      placed: true,
      isValid: true,
    },
    {
      id: 'wisp_zephyr',
      name: 'Zephyr',
      title: 'The Breeze',
      element: 'aer',
      position: { x: 450, y: 700 },
      radius: 18,
      color: '#76d7c4',
      glowColor: '#a3e4d7',
      expression: 'calm',
      placed: true,
      isValid: true,
    },
  ];

  return {
    schemaVersion: 1,
    levelId: 'contact_diag_test',
    pieces: pieces.map((p) => ({
      id: p.id,
      type: p.type,
      position: { x: p.x, y: p.y },
      rotation: p.rot ?? 0,
      isPrebuilt: false,
    })),
    inventory: { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 },
    wisps,
    anchors: [
      {
        id: 'anchor_bedrock',
        name: 'Bedrock Anchor',
        position: { x: 200, y: 750 },
        type: 'bedrock',
        radius: 20,
      },
    ],
    worldBounds: { minX: 0, maxX: 800, minY: 0, maxY: 900 },
    lossBoundaryY: 880,
  };
}

console.log('======================================================================');
console.log('RUNNING AUTHORITATIVE WISP–DEBRIS CONTACT DIAGNOSTIC SUITE (1 - 8)');
console.log('======================================================================\n');

// 1. Gentle resting beam contact does not disperse a wisp
{
  console.log('Test 1: Gentle resting beam contact does not disperse a wisp');
  // Wisp is at (300, 700), radius 18 (top at y=682).
  // Beam height is 24, anchored at (300, 685) so bottom rests gently on wisp with zero falling velocity.
  const state = createTestState([
    { id: 'resting_beam', type: 'wood_beam', x: 300, y: 673, rot: 0 },
  ]);
  state.pieces[0].attachedAnchorId = 'anchor_resting';
  state.anchors.push({
    id: 'anchor_resting',
    name: 'Resting Anchor',
    position: { x: 300, y: 685 },
    type: 'bedrock',
    radius: 20,
  });

  const bridge = new PhysicsBridge(state);
  for (let i = 0; i < 30; i++) {
    bridge.step(16.67);
  }

  const dispersed = bridge.getDispersedWisps();
  assert(!dispersed.has('wisp_ignis'), 'Resting beam must NOT disperse wisp');

  const events = bridge.getWispContactEvents();
  const ignisEvents = events.filter((e) => e.wispId === 'wisp_ignis');
  assert(ignisEvents.length > 0, 'Resting contact event must be recorded');
  const harmless = ignisEvents.find((e) => e.category === 'HARMLESS_TOUCH');
  assert(harmless !== undefined, 'Resting contact must be categorized as HARMLESS_TOUCH');
  assert(harmless!.totalContactSpeed < 1.5, 'Resting speed must be under threshold');
  assert(!harmless!.dispersalCommitted, 'Dispersal must not be committed for resting contact');

  console.log(`  -> Recorded ${ignisEvents.length} events, category=${harmless?.category}, speed=${harmless?.totalContactSpeed} px/tick`);
  console.log('  -> Status: PASSED (Gentle resting contact preserved without dispersal)\n');
  bridge.teardown();
}

// 2. A meaningful falling-beam impact is processed and disperses it
{
  console.log('Test 2: Meaningful falling-beam impact is processed and disperses wisp');
  // Beam dropped from y=580 directly above wisp at (300, 700) (distance 120px)
  const state = createTestState([
    { id: 'falling_beam', type: 'wood_beam', x: 300, y: 580, rot: 0 },
  ]);

  const bridge = new PhysicsBridge(state);
  let dispersedStep = -1;
  for (let i = 0; i < 40; i++) {
    bridge.step(16.67);
    if (bridge.getDispersedWisps().has('wisp_ignis') && dispersedStep === -1) {
      dispersedStep = i;
    }
  }

  assert(bridge.getDispersedWisps().has('wisp_ignis'), 'Falling beam impact must disperse wisp');
  const events = bridge.getWispContactEvents().filter((e) => e.wispId === 'wisp_ignis');
  const hitEvent = events.find((e) => e.dispersalCommitted);
  assert(hitEvent !== undefined, 'Committed dispersal event must be recorded');
  assert(
    hitEvent!.category === 'MEANINGFUL_DEBRIS_HIT' || hitEvent!.category === 'HEAVY_DEBRIS_HIT',
    'Falling beam impact must be categorized as DEBRIS_HIT',
  );
  assert(hitEvent!.totalContactSpeed > 1.5, 'Impact speed must exceed minVelocity');
  assert(hitEvent!.normalImpulse > 0, 'Normal impulse must be positive');

  console.log(`  -> Dispersed at step ${dispersedStep}, speed=${hitEvent?.totalContactSpeed} px/tick, impulse=${hitEvent?.normalImpulse}`);
  console.log('  -> Status: PASSED (Falling beam impact processed and dispersed wisp)\n');
  bridge.teardown();
}

// 3. A rotating beam end includes angular contact velocity
{
  console.log('Test 3: Rotating beam end includes angular contact velocity');
  // Beam with center at (240, 680), angled at -45 deg, pinned/resting so it swings down
  // The tip reaches x=298, y=700 right at wisp_ignis (at 300, 700)
  const state = createTestState([
    { id: 'rotating_beam', type: 'wood_beam', x: 240, y: 660, rot: -Math.PI / 4 },
    { id: 'pivot_block', type: 'stone_block', x: 195, y: 690, rot: 0 },
  ]);

  const bridge = new PhysicsBridge(state);
  for (let i = 0; i < 40; i++) {
    bridge.step(16.67);
  }

  const events = bridge.getWispContactEvents().filter((e) => e.wispId === 'wisp_ignis');
  assert(events.length > 0, 'Rotating beam contact event must be recorded');
  const rotatingEvent = events.find((e) => e.relativeAngularSpeedAtContact > 0);
  assert(rotatingEvent !== undefined, 'Contact event must include non-zero angular speed at contact');
  assert(
    rotatingEvent!.totalContactSpeed >= rotatingEvent!.relativeLinearSpeed,
    'Total contact speed must account for angular component',
  );

  console.log(
    `  -> LinSpeed=${rotatingEvent?.relativeLinearSpeed}, AngSpeed=${rotatingEvent?.relativeAngularSpeedAtContact}, TotalSpeed=${rotatingEvent?.totalContactSpeed}`,
  );
  console.log('  -> Status: PASSED (Angular velocity correctly contributed to contact speed)\n');
  bridge.teardown();
}

// 4. A heavy stone impact is mass-aware
{
  console.log('Test 4: Heavy stone impact is mass-aware');
  // Compare wood beam (mass ~3.46) vs stone block (mass ~11.06) dropped from smaller height (y=640)
  const stateStone = createTestState([
    { id: 'falling_stone', type: 'stone_block', x: 300, y: 640, rot: 0 },
  ]);

  const bridgeStone = new PhysicsBridge(stateStone);
  for (let i = 0; i < 35; i++) {
    bridgeStone.step(16.67);
  }

  assert(bridgeStone.getDispersedWisps().has('wisp_ignis'), 'Heavy stone impact must disperse wisp');
  const stoneEvent = bridgeStone
    .getWispContactEvents()
    .find((e) => e.wispId === 'wisp_ignis' && e.dispersalCommitted);
  assert(stoneEvent !== undefined, 'Stone dispersal event must be recorded');
  assert(stoneEvent!.contactingObjectMass > 8.0, 'Stone mass must be ~11.06');
  assert(stoneEvent!.category === 'HEAVY_DEBRIS_HIT', 'Stone impact must be categorized as HEAVY_DEBRIS_HIT');

  console.log(`  -> Stone mass=${stoneEvent?.contactingObjectMass}, category=${stoneEvent?.category}, totalSpeed=${stoneEvent?.totalContactSpeed}`);
  console.log('  -> Status: PASSED (Mass-aware heavy debris properly classified)\n');
  bridgeStone.teardown();
}

// 5. Late debris contacts are processed
{
  console.log('Test 5: Late debris contacts are processed');
  // Beam starts in initial touch (y=670), doesn't disperse at t=0
  // Then at step 10, support drops away so beam accelerates and falls through wisp
  const state = createTestState([
    { id: 'late_beam', type: 'wood_beam', x: 300, y: 670, rot: 0 },
  ]);

  const bridge = new PhysicsBridge(state);
  // Step 1: starts in touch with v=0
  bridge.step(16.67);
  assert(!bridge.getDispersedWisps().has('wisp_ignis'), 'Should not disperse at v=0');

  // Continues falling during collisionActive (steps 2 to 30)
  for (let i = 2; i < 35; i++) {
    bridge.step(16.67);
  }

  assert(
    bridge.getDispersedWisps().has('wisp_ignis'),
    'Late debris acceleration during collisionActive must be processed and disperse wisp',
  );
  const events = bridge.getWispContactEvents().filter((e) => e.wispId === 'wisp_ignis');
  const sustainedDispersal = events.find(
    (e) => e.contactPhase === 'SUSTAINED_CONTACT' && e.dispersalCommitted,
  );
  assert(sustainedDispersal !== undefined, 'Sustained contact must successfully commit dispersal on late acceleration');

  console.log(`  -> Late acceleration processed in phase ${sustainedDispersal?.contactPhase} at simTimestamp=${sustainedDispersal?.simTimestamp}s`);
  console.log('  -> Status: PASSED (Late debris contacts processed via collisionActive)\n');
  bridge.teardown();
}

// 6. Two different beam contacts are not deduplicated incorrectly
{
  console.log('Test 6: Two different beam contacts are not deduplicated incorrectly');
  // Beam 1 touches wisp_ignis gently at (300, 670) with supports
  // Beam 2 falls at wisp_zephyr at (450, 580)
  const state = createTestState([
    { id: 'beam_gentle', type: 'wood_beam', x: 300, y: 673, rot: 0 },
    { id: 'beam_fast', type: 'wood_beam', x: 450, y: 580, rot: 0 },
  ]);
  state.pieces[0].attachedAnchorId = 'anchor_gentle';
  state.anchors.push({
    id: 'anchor_gentle',
    name: 'Gentle Anchor',
    position: { x: 300, y: 685 },
    type: 'bedrock',
    radius: 20,
  });

  const bridge = new PhysicsBridge(state);
  for (let i = 0; i < 40; i++) {
    bridge.step(16.67);
  }

  const dispersed = bridge.getDispersedWisps();
  assert(!dispersed.has('wisp_ignis'), 'Gentle beam 1 must not disperse ignis');
  assert(dispersed.has('wisp_zephyr'), 'Fast beam 2 must disperse zephyr');

  const events = bridge.getWispContactEvents();
  const beam1Events = events.filter((e) => e.contactingObjectId === 'beam_gentle');
  const beam2Events = events.filter((e) => e.contactingObjectId === 'beam_fast');

  assert(beam1Events.length > 0, 'Beam 1 events must be tracked');
  assert(beam2Events.length > 0, 'Beam 2 events must be tracked independently');
  assert(
    beam2Events.some((e) => e.dispersalCommitted),
    'Beam 2 must commit dispersal independently without being marked as duplicate of Beam 1',
  );

  console.log(`  -> Beam 1 events: ${beam1Events.length}, Beam 2 events: ${beam2Events.length}`);
  console.log('  -> Status: PASSED (Two separate beams evaluated with distinct identities)\n');
  bridge.teardown();
}

// 7. Replay does not process contacts again
{
  console.log('Test 7: Replay does not process contacts again');
  const pd = new PresentationDirector();
  const mockWisps: WispEntity[] = [
    {
      id: 'wisp_ignis',
      name: 'Ignis',
      title: 'The Spark',
      element: 'ignis',
      position: { x: 300, y: 700 },
      radius: 18,
      color: '#ff6b4a',
      glowColor: '#ff9d76',
      expression: 'calm',
      placed: true,
      isDispersed: false,
    },
  ];

  // Record a few replay frames
  for (let i = 0; i < 20; i++) {
    pd.replayFrames.push({
      timestamp: i * 0.033,
      cameraCenter: { x: 400, y: 600 },
      cameraScale: 1.0,
      pieces: [],
      projectile: null,
      wisps: [
        {
          id: 'wisp_ignis',
          position: { x: 300, y: 700 },
          isDispersed: false,
          reactionState: 'CALM_IDLE',
          dispersalProgress: 0,
        },
      ],
    });
  }

  assert(pd.replayFrames.length > 5, 'Replay frames recorded');
  pd.startReplay();
  assert(pd.isReplaying, 'Visual replay started');

  const sc = new SiegeController(new LevelStore());
  // Step replay
  for (let i = 0; i < 15; i++) {
    pd.update(
      0.016,
      i * 0.016,
      {
        schemaVersion: 1,
        levelId: 'replay_test',
        pieces: [],
        inventory: { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 },
        wisps: mockWisps,
        anchors: [],
        worldBounds: { minX: 0, maxX: 800, minY: 0, maxY: 900 },
        lossBoundaryY: 880,
      },
      sc,
      null,
      'RESULTS',
    );
  }

  assert(mockWisps[0].isDispersed === false, 'Authoritative wisp dispersal must NEVER be changed by replay');
  console.log('  -> Status: PASSED (Replay playback is 100% read-only and non-authoritative)\n');
}

// 8. Distinguish cosmetic visual overlap from collider contact
{
  console.log('Test 8: Distinguish cosmetic visual overlap from collider contact');
  // Wisp is at (300, 700), collider radius is 18 (x: 282 to 318, y: 682 to 718)
  // Cosmetic visual aura is 18 * 2.65 = 47.7px (x: 252.3 to 347.7)
  // We place a piece at x: 335, y: 700 (outside 18px collider, but inside 47.7px aura)
  const state = createTestState([
    { id: 'cosmetic_piece', type: 'wood_block', x: 345, y: 700, rot: 0 },
  ]);

  const bridge = new PhysicsBridge(state);
  for (let i = 0; i < 20; i++) {
    bridge.step(16.67);
  }

  assert(!bridge.getDispersedWisps().has('wisp_ignis'), 'Cosmetic overlap must never disperse wisp');
  const events = bridge.getWispContactEvents();
  const cosmetic = events.find((e) => e.category === 'COSMETIC_ONLY');
  assert(cosmetic !== undefined, 'Cosmetic overlap event must be logged as COSMETIC_ONLY');
  assert(!cosmetic!.dispersalCommitted, 'Cosmetic overlap must have dispersalCommitted = false');

  console.log(`  -> Recorded cosmetic event: ${cosmetic?.id}, reason: ${cosmetic?.notDispersedReason}`);
  console.log('  -> Status: PASSED (Cosmetic aura overlap distinguished from physical collider contact)\n');
  bridge.teardown();
}

console.log('======================================================================');
console.log('ALL 8 WISP–DEBRIS CONTACT DIAGNOSTIC VERIFICATIONS PASSED (100%)');
console.log('======================================================================\n');
