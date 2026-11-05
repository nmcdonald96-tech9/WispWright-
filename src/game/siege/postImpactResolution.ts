/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PostImpactResolutionTiming {
  minimumObservationSec: number;
  continuousSettledSec: number;
  maximumResolutionSec: number;
}

export interface PostImpactResolutionState {
  elapsedSec: number;
  continuouslySettledSec: number;
  lastFallenCount: number;
  lastBrokenJointCount: number;
  readyToResolve: boolean;
  resolvedByTimeout: boolean;
}

export const ORDINARY_POST_IMPACT_TIMING: PostImpactResolutionTiming = {
  minimumObservationSec: 2.5,
  continuousSettledSec: 1.25,
  maximumResolutionSec: 8,
};

export const FINAL_POST_IMPACT_TIMING: PostImpactResolutionTiming = {
  minimumObservationSec: 3.5,
  continuousSettledSec: 1.25,
  maximumResolutionSec: 10,
};

export function getPostImpactResolutionTiming(
  isFinalAttack: boolean,
): PostImpactResolutionTiming {
  return isFinalAttack
    ? FINAL_POST_IMPACT_TIMING
    : ORDINARY_POST_IMPACT_TIMING;
}

export function createPostImpactResolutionState(): PostImpactResolutionState {
  return {
    elapsedSec: 0,
    continuouslySettledSec: 0,
    lastFallenCount: 0,
    lastBrokenJointCount: 0,
    readyToResolve: false,
    resolvedByTimeout: false,
  };
}

export function advancePostImpactResolution(input: {
  state: PostImpactResolutionState;
  dt: number;
  stabilitySettled: boolean;
  fallenCount: number;
  brokenJointCount: number;
  timing: PostImpactResolutionTiming;
}): PostImpactResolutionState {
  const dt = Math.max(0, input.dt);
  const elapsedSec = input.state.elapsedSec + dt;
  const structuralOutcomeChanged =
    input.fallenCount !== input.state.lastFallenCount ||
    input.brokenJointCount !== input.state.lastBrokenJointCount;
  const continuouslySettledSec =
    input.stabilitySettled && !structuralOutcomeChanged
      ? input.state.continuouslySettledSec + dt
      : 0;
  const resolvedByTimeout = elapsedSec >= input.timing.maximumResolutionSec;
  const readyToResolve =
    resolvedByTimeout ||
    (elapsedSec >= input.timing.minimumObservationSec &&
      continuouslySettledSec >= input.timing.continuousSettledSec);
  return {
    elapsedSec,
    continuouslySettledSec,
    lastFallenCount: input.fallenCount,
    lastBrokenJointCount: input.brokenJointCount,
    readyToResolve,
    resolvedByTimeout,
  };
}
