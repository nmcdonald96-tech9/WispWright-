/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HeavyAttackerAnimState } from './presentationTypes';

export interface HeavyAttackerSequenceInput {
  phase: 'INTRO' | 'AIMING' | 'FLIGHT' | 'IMPACT' | 'SETTLING' | 'RESOLVED' | 'IDLE';
  introElapsedSec: number;
  introDurationSec: number;
  aimingElapsedSec: number;
  projectileVelocityY: number | null;
  distanceToTargetPx: number | null;
  brokenPieceCount: number;
  crackedPieceCount: number;
  bullseyeOverrideSelected: boolean;
  reducedMotion: boolean;
}

export interface HeavyAttackerSequenceResult {
  state: HeavyAttackerAnimState;
  launcherStrain: number;
  introProgress: number;
  beatProgress: number;
}

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function progressWithin(value: number, start: number, end: number): number {
  return clamp01((value - start) / Math.max(0.001, end - start));
}

export function deriveHeavyAttackerSequence(
  input: HeavyAttackerSequenceInput,
): HeavyAttackerSequenceResult {
  if (input.phase === 'INTRO') {
    const duration = Math.max(0.001, finite(input.introDurationSec, 3.4));
    const ratio = clamp01(finite(input.introElapsedSec) / duration);
    let state: HeavyAttackerAnimState;
    let beatProgress = 1;
    if (input.reducedMotion) {
      state = ratio < 0.42
        ? 'GROUND_THUMP'
        : ratio < 0.78
          ? input.bullseyeOverrideSelected
            ? 'BULLSEYE_ACK_DELIGHTED'
            : 'ASSISTED_MOUNT'
          : 'HEAVY_READY_POSE';
    } else if (ratio < 0.2) {
      state = 'HEAVY_STEP_IN';
      beatProgress = progressWithin(ratio, 0, 0.2);
    } else if (ratio < 0.4) {
      state = 'GROUND_THUMP';
      beatProgress = progressWithin(ratio, 0.2, 0.4);
    } else if (ratio < 0.58) {
      state = input.bullseyeOverrideSelected
        ? 'BULLSEYE_ACK_DELIGHTED'
        : 'LAUNCHER_CREAK_LOAD';
      beatProgress = progressWithin(ratio, 0.4, 0.58);
    } else if (ratio < 0.8) {
      state = 'ASSISTED_MOUNT';
      beatProgress = progressWithin(ratio, 0.58, 0.8);
    } else {
      state = 'HEAVY_READY_POSE';
      beatProgress = progressWithin(ratio, 0.8, 1);
    }
    return {
      state,
      launcherStrain: Math.min(0.85, ratio * 0.9),
      introProgress: ratio,
      beatProgress,
    };
  }

  if (input.phase === 'AIMING') {
    const ratio = clamp01(finite(input.aimingElapsedSec) / 1.2);
    return {
      state: ratio < 0.5 ? 'DEEP_COMPRESSION' : 'LAUNCHER_FULL_STRAIN',
      launcherStrain: 0.75 + ratio * 0.25,
      introProgress: 1,
      beatProgress: ratio,
    };
  }

  if (input.phase === 'FLIGHT') {
    const distance = Math.max(0, finite(input.distanceToTargetPx, 500));
    const velocityY = finite(input.projectileVelocityY);
    let state: HeavyAttackerAnimState;
    if (distance < 180) state = 'HEAVY_IMPACT_BRACE';
    else if (velocityY < -2.2) state = 'RELEASE_SURPRISE';
    else if (Math.abs(velocityY) <= 2.2) state = 'AIRBORNE_DELIGHT';
    else state = 'HEAVY_FLIGHT_MOMENTUM';
    return { state, launcherStrain: 0, introProgress: 1, beatProgress: 1 };
  }

  if (input.phase === 'IMPACT' || input.phase === 'SETTLING' || input.phase === 'RESOLVED') {
    const state: HeavyAttackerAnimState =
      input.brokenPieceCount > 0
        ? 'POST_IMPACT_TRIUMPH'
        : input.crackedPieceCount > 0
          ? 'WEAK_HIT_GRUMBLE'
          : 'POST_IMPACT_STUNNED';
    return { state, launcherStrain: 0, introProgress: 1, beatProgress: 1 };
  }

  return { state: 'HEAVY_IDLE', launcherStrain: 0, introProgress: 1, beatProgress: 1 };
}
