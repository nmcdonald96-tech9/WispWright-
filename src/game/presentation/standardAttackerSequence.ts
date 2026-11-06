/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardAttackerAnimState } from './presentationTypes';

export interface StandardAttackerSequenceInput {
  phase:
    | 'INTRO'
    | 'AIMING'
    | 'FLIGHT'
    | 'IMPACT'
    | 'SETTLING'
    | 'RESOLVED'
    | 'IDLE';
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

export interface StandardAttackerSequenceResult {
  state: StandardAttackerAnimState;
  launcherStrain: number;
}

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function deriveStandardAttackerSequence(
  input: StandardAttackerSequenceInput,
): StandardAttackerSequenceResult {
  if (input.phase === 'INTRO') {
    const duration = Math.max(0.001, finite(input.introDurationSec, 2.2));
    const ratio = clamp01(finite(input.introElapsedSec) / duration);
    let state: StandardAttackerAnimState;
    if (input.reducedMotion) {
      state = ratio < 0.62 ? 'PROUD_CHEST_PUFF' : 'LOAD_INTO_CRADLE';
    } else if (ratio < 0.18) {
      state = 'INTRO_HOP_IN';
    } else if (ratio < 0.38) {
      state = 'PROUD_CHEST_PUFF';
    } else if (ratio < 0.58) {
      state = 'SPARK_FLOURISH';
    } else if (ratio < 0.8) {
      state = input.bullseyeOverrideSelected
        ? 'BULLSEYE_ACK_OFFENDED'
        : 'WARMUP_HOP';
    } else {
      state = 'LOAD_INTO_CRADLE';
    }
    return {
      state,
      launcherStrain: Math.min(0.45, ratio * 0.5),
    };
  }

  if (input.phase === 'AIMING') {
    const ratio = clamp01(finite(input.aimingElapsedSec) / 1.2);
    return {
      state: ratio < 0.6 ? 'AIM_LEAN_FORWARD' : 'LAUNCH_ANTICIPATION',
      launcherStrain: 0.4 + ratio * 0.35,
    };
  }

  if (input.phase === 'FLIGHT') {
    const distance = Math.max(0, finite(input.distanceToTargetPx, 500));
    const velocityY = finite(input.projectileVelocityY);
    let state: StandardAttackerAnimState;
    if (distance < 170) state = 'IMPACT_BRACE';
    else if (velocityY < -2.2) state = 'FLIGHT_CONFIDENT';
    else if (Math.abs(velocityY) <= 2.2) state = 'APEX_SURPRISE';
    else state = 'DESCENT_PANIC';
    return { state, launcherStrain: 0 };
  }

  if (
    input.phase === 'IMPACT' ||
    input.phase === 'SETTLING' ||
    input.phase === 'RESOLVED'
  ) {
    const state: StandardAttackerAnimState =
      input.brokenPieceCount > 0
        ? 'SMUG_CELEBRATION'
        : input.crackedPieceCount > 0
          ? 'WEAK_HIT_SHRUG'
          : 'EMBARRASSED_MISS';
    return { state, launcherStrain: 0 };
  }

  return { state: 'IDLE_WAIT', launcherStrain: 0 };
}
