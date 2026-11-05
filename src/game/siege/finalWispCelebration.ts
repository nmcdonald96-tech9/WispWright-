/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export type FinalWispCelebrationPhase =
  | 'INACTIVE'
  | 'ANTICIPATION'
  | 'CELEBRATING'
  | 'COMPLETE';

export interface FinalWispCelebrationState {
  phase: FinalWispCelebrationPhase;
  elapsedSec: number;
  survivingWispCount: number;
  totalWispCount: number;
  fullChorus: boolean;
}

export const FINAL_WISP_ANTICIPATION_SEC = 0.25;
export const FINAL_WISP_CELEBRATION_SEC = 2.25;

export function createFinalWispCelebrationState(): FinalWispCelebrationState {
  return {
    phase: 'INACTIVE', elapsedSec: 0, survivingWispCount: 0,
    totalWispCount: 0, fullChorus: false,
  };
}

export function startFinalWispCelebration(
  survivingWispCount: number,
  totalWispCount: number,
): FinalWispCelebrationState {
  const survivors = Math.max(0, Math.min(totalWispCount, survivingWispCount));
  if (survivors <= 0) {
    return {
      phase: 'COMPLETE', elapsedSec: 0, survivingWispCount: 0,
      totalWispCount, fullChorus: false,
    };
  }
  return {
    phase: 'ANTICIPATION', elapsedSec: 0, survivingWispCount: survivors,
    totalWispCount, fullChorus: survivors === totalWispCount,
  };
}

export function advanceFinalWispCelebration(
  state: FinalWispCelebrationState,
  dt: number,
): FinalWispCelebrationState {
  if (state.phase === 'INACTIVE' || state.phase === 'COMPLETE') return state;
  const elapsedSec = state.elapsedSec + Math.max(0, dt);
  if (state.phase === 'ANTICIPATION') {
    if (elapsedSec < FINAL_WISP_ANTICIPATION_SEC) return { ...state, elapsedSec };
    return {
      ...state,
      phase: 'CELEBRATING',
      elapsedSec: elapsedSec - FINAL_WISP_ANTICIPATION_SEC,
    };
  }
  if (elapsedSec < FINAL_WISP_CELEBRATION_SEC) return { ...state, elapsedSec };
  return { ...state, phase: 'COMPLETE', elapsedSec: FINAL_WISP_CELEBRATION_SEC };
}
