/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WispContactEvent } from '../types';
import { WispPersonalityTendency, WispReactionState } from './presentationTypes';

export const WISP_HARMLESS_TOUCH_HOLD_SEC = 0.42;
export const WISP_IMPACT_RECOVERY_HOLD_SEC = 0.9;
export const WISP_RELIEF_HOLD_SEC = 0.72;

export interface WispImpactReactionState {
  seenEventIds: readonly string[];
  activeReaction: WispReactionState | null;
  reactionRemainingSec: number;
  reliefRemainingSec: number;
}

export interface WispImpactReactionFrameInput {
  state: WispImpactReactionState;
  deltaSec: number;
  tendency: WispPersonalityTendency;
  contactEvents: readonly WispContactEvent[];
  isDispersed: boolean;
  structureIsSettling: boolean;
  structureIsSettled: boolean;
}

export interface WispImpactReactionFrameResult {
  state: WispImpactReactionState;
  reactionState: WispReactionState | null;
  consumedEventIds: readonly string[];
}

export function createWispImpactReactionState(): WispImpactReactionState {
  return {
    seenEventIds: [],
    activeReaction: null,
    reactionRemainingSec: 0,
    reliefRemainingSec: 0,
  };
}

function finiteDelta(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function deriveContactReaction(
  event: WispContactEvent,
  tendency: WispPersonalityTendency,
): WispReactionState | null {
  if (event.isDeduplicated || event.category === 'DUPLICATE_EVENT' || event.category === 'COSMETIC_ONLY') {
    return null;
  }
  if (event.dispersalCommitted || event.category === 'PINNED_OR_CRUSHED') {
    return null;
  }
  if (event.category === 'HARMLESS_TOUCH') {
    return tendency === 'NERVOUS' ? 'GASP' : 'STARTLED_JUMP';
  }
  if (event.category === 'MEANINGFUL_DEBRIS_HIT' || event.category === 'HEAVY_DEBRIS_HIT') {
    return tendency === 'NERVOUS' ? 'COWER' : 'DODGE_LEAN';
  }
  return null;
}

export function advanceWispImpactReaction(
  input: WispImpactReactionFrameInput,
): WispImpactReactionFrameResult {
  const dt = finiteDelta(input.deltaSec);
  const seen = new Set(input.state.seenEventIds);
  let activeReaction = input.state.activeReaction;
  let reactionRemainingSec = Math.max(0, input.state.reactionRemainingSec - dt);
  let reliefRemainingSec = Math.max(0, input.state.reliefRemainingSec - dt);
  const consumedEventIds: string[] = [];

  if (input.isDispersed) {
    return {
      state: {
        seenEventIds: [...seen],
        activeReaction: null,
        reactionRemainingSec: 0,
        reliefRemainingSec: 0,
      },
      reactionState: null,
      consumedEventIds,
    };
  }

  for (const event of input.contactEvents) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    consumedEventIds.push(event.id);
    const reaction = deriveContactReaction(event, input.tendency);
    if (!reaction) continue;
    activeReaction = reaction;
    reactionRemainingSec =
      event.category === 'HARMLESS_TOUCH'
        ? WISP_HARMLESS_TOUCH_HOLD_SEC
        : WISP_IMPACT_RECOVERY_HOLD_SEC;
    reliefRemainingSec = 0;
  }

  if (reactionRemainingSec <= 0) {
    activeReaction = null;
    if (input.structureIsSettled && input.state.reactionRemainingSec > 0) {
      reliefRemainingSec = WISP_RELIEF_HOLD_SEC;
    }
  }

  const reactionState =
    activeReaction ??
    (reliefRemainingSec > 0
      ? 'RELIEVED_EXHALE'
      : input.structureIsSettling
        ? null
        : null);

  return {
    state: {
      seenEventIds: [...seen],
      activeReaction,
      reactionRemainingSec,
      reliefRemainingSec,
    },
    reactionState,
    consumedEventIds,
  };
}
