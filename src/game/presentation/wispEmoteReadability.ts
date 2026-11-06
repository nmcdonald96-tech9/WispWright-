/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WispReactionState } from './presentationTypes';

export interface WispEmoteReadabilityState {
  displayedReaction: WispReactionState;
  holdRemainingSec: number;
  transitionProgress: number;
}

export interface WispEmoteReadabilityInput {
  state: WispEmoteReadabilityState;
  requestedReaction: WispReactionState;
  deltaSec: number;
  isDispersed: boolean;
  celebrationActive: boolean;
  terminalOutcomeActive?: boolean;
  reducedMotion: boolean;
}

const PRIORITY: Partial<Record<WispReactionState, number>> = {
  WATCH_TRAJECTORY: 1,
  SPOT_ATTACKER: 1,
  ALARMED_ALERT: 2,
  GASP: 2,
  STARTLED_JUMP: 3,
  BRACE_FOR_IMPACT: 3,
  COWER: 3,
  DODGE_LEAN: 4,
  RELIEVED_EXHALE: 4,
  CELEBRATION_CHORUS: 8,
  DISPERSING_GATHER: 10,
  DISPERSING_SWIRL: 10,
  DISPERSING_ASCEND: 10,
  DISPERSED_FADING: 10,
};

function finiteDelta(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function holdFor(reaction: WispReactionState): number {
  if (reaction === 'ALARMED_ALERT' || reaction === 'GASP') return 0.36;
  if (reaction === 'BRACE_FOR_IMPACT' || reaction === 'COWER') return 0.5;
  if (reaction === 'STARTLED_JUMP') return 0.42;
  if (reaction === 'DODGE_LEAN' || reaction === 'RELIEVED_EXHALE') return 0.72;
  return 0;
}

export function createWispEmoteReadabilityState(): WispEmoteReadabilityState {
  return { displayedReaction: 'CALM_IDLE', holdRemainingSec: 0, transitionProgress: 1 };
}

export function advanceWispEmoteReadability(
  input: WispEmoteReadabilityInput,
): WispEmoteReadabilityState {
  const dt = finiteDelta(input.deltaSec);
  if (input.isDispersed || input.requestedReaction.startsWith('DISPERS')) {
    return { displayedReaction: input.requestedReaction, holdRemainingSec: 0, transitionProgress: 1 };
  }
  if (
    input.terminalOutcomeActive ||
    input.celebrationActive ||
    input.requestedReaction === 'CELEBRATION_CHORUS'
  ) {
    return {
      displayedReaction: input.requestedReaction,
      holdRemainingSec: 0,
      transitionProgress: 1,
    };
  }
  const currentPriority = PRIORITY[input.state.displayedReaction] ?? 0;
  const requestedPriority = PRIORITY[input.requestedReaction] ?? 0;
  const holdRemainingSec = Math.max(0, input.state.holdRemainingSec - dt);
  const canInterrupt = requestedPriority > currentPriority;
  const shouldChange =
    input.requestedReaction !== input.state.displayedReaction &&
    (holdRemainingSec <= 0 || canInterrupt);
  if (shouldChange) {
    return {
      displayedReaction: input.requestedReaction,
      holdRemainingSec: holdFor(input.requestedReaction),
      transitionProgress: input.reducedMotion ? 1 : 0,
    };
  }
  const duration = input.reducedMotion ? 0.001 : 0.14;
  return {
    displayedReaction: input.state.displayedReaction,
    holdRemainingSec,
    transitionProgress: Math.min(1, input.state.transitionProgress + dt / duration),
  };
}
