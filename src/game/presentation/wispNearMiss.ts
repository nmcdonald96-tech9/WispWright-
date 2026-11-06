/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2 } from '../types';

export const WISP_NEAR_MISS_MAX_DISTANCE_PX = 96;
export const WISP_NEAR_MISS_HOLD_SEC = 0.72;

export interface WispNearMissTrackerState {
  minimumDistancePx: number;
  wasApproaching: boolean;
  hasConfirmedNearMiss: boolean;
  reactionRemainingSec: number;
}

export interface WispNearMissFrameInput {
  state: WispNearMissTrackerState;
  deltaSec: number;
  wispPosition: Vector2;
  projectilePosition: Vector2 | null;
  projectileVelocity: Vector2 | null;
  projectileHasImpacted: boolean;
  wispWasContacted: boolean;
  wispIsDispersed: boolean;
}

export interface WispNearMissFrameResult {
  state: WispNearMissTrackerState;
  confirmedThisFrame: boolean;
  reactionActive: boolean;
}

export function createWispNearMissTrackerState(): WispNearMissTrackerState {
  return {
    minimumDistancePx: Number.POSITIVE_INFINITY,
    wasApproaching: false,
    hasConfirmedNearMiss: false,
    reactionRemainingSec: 0,
  };
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function advanceWispNearMissTracker(
  input: WispNearMissFrameInput,
): WispNearMissFrameResult {
  const deltaSec = Math.max(0, finite(input.deltaSec, 0));
  let state: WispNearMissTrackerState = {
    minimumDistancePx: finite(input.state.minimumDistancePx, Number.POSITIVE_INFINITY),
    wasApproaching: Boolean(input.state.wasApproaching),
    hasConfirmedNearMiss: Boolean(input.state.hasConfirmedNearMiss),
    reactionRemainingSec: Math.max(0, finite(input.state.reactionRemainingSec, 0) - deltaSec),
  };

  if (input.wispIsDispersed || input.wispWasContacted) {
    state = {
      ...state,
      hasConfirmedNearMiss: false,
      reactionRemainingSec: 0,
    };
    return { state, confirmedThisFrame: false, reactionActive: false };
  }

  if (!input.projectilePosition || !input.projectileVelocity) {
    return {
      state,
      confirmedThisFrame: false,
      reactionActive: state.reactionRemainingSec > 0,
    };
  }

  const relativeX = finite(input.projectilePosition.x, 0) - finite(input.wispPosition.x, 0);
  const relativeY = finite(input.projectilePosition.y, 0) - finite(input.wispPosition.y, 0);
  const velocityX = finite(input.projectileVelocity.x, 0);
  const velocityY = finite(input.projectileVelocity.y, 0);
  const distancePx = Math.hypot(relativeX, relativeY);
  const radialDot = relativeX * velocityX + relativeY * velocityY;
  const isApproaching = radialDot < 0 && velocityX * velocityX + velocityY * velocityY > 0.0001;
  const wasApproaching = state.wasApproaching;
  const minimumDistancePx = Math.min(state.minimumDistancePx, distancePx);
  const crossedClosestApproach = wasApproaching && !isApproaching;
  const confirmedThisFrame =
    !state.hasConfirmedNearMiss &&
    !input.projectileHasImpacted &&
    crossedClosestApproach &&
    minimumDistancePx <= WISP_NEAR_MISS_MAX_DISTANCE_PX;

  state = {
    minimumDistancePx,
    wasApproaching: isApproaching,
    hasConfirmedNearMiss: state.hasConfirmedNearMiss || confirmedThisFrame,
    reactionRemainingSec: confirmedThisFrame
      ? WISP_NEAR_MISS_HOLD_SEC
      : state.reactionRemainingSec,
  };

  return {
    state,
    confirmedThisFrame,
    reactionActive: state.reactionRemainingSec > 0,
  };
}
