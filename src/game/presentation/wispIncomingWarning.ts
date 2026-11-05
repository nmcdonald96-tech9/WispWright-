/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2 } from '../types';
import { WispPersonalityTendency, WispReactionState } from './presentationTypes';

export interface IncomingWispWarningInput {
  wispPosition: Vector2;
  projectilePosition: Vector2;
  projectileVelocity: Vector2;
  tendency: WispPersonalityTendency;
}

export interface IncomingWispWarning {
  reactionState: WispReactionState;
  lookTarget: Vector2;
  distance: number;
  closingSpeed: number;
  timeToClosestApproachSec: number | null;
  closestApproachDistance: number;
  isApproaching: boolean;
}

const PHYSICS_STEPS_PER_SECOND = 60;
const ALERT_DISTANCE = 270;
const BRACE_DISTANCE = 145;
const RELEVANT_CLOSEST_APPROACH = 190;
const MAX_WARNING_HORIZON_SEC = 3.5;

function finiteVector(value: Vector2): Vector2 {
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
  };
}

export function deriveIncomingWispWarning(
  input: IncomingWispWarningInput,
): IncomingWispWarning {
  const wispPosition = finiteVector(input.wispPosition);
  const projectilePosition = finiteVector(input.projectilePosition);
  const projectileVelocity = finiteVector(input.projectileVelocity);
  const velocityPerSec = {
    x: projectileVelocity.x * PHYSICS_STEPS_PER_SECOND,
    y: projectileVelocity.y * PHYSICS_STEPS_PER_SECOND,
  };
  const relative = {
    x: projectilePosition.x - wispPosition.x,
    y: projectilePosition.y - wispPosition.y,
  };
  const distance = Math.hypot(relative.x, relative.y);
  const speedSq = velocityPerSec.x ** 2 + velocityPerSec.y ** 2;
  const radialDot = relative.x * velocityPerSec.x + relative.y * velocityPerSec.y;
  const closingSpeed = distance > 0 ? Math.max(0, -radialDot / distance) : 0;
  const isApproaching = radialDot < 0 && speedSq > 1;

  let timeToClosestApproachSec: number | null = null;
  let closestApproachDistance = distance;
  if (isApproaching) {
    const rawTime = Math.max(0, -radialDot / speedSq);
    timeToClosestApproachSec = rawTime;
    const closestX = relative.x + velocityPerSec.x * rawTime;
    const closestY = relative.y + velocityPerSec.y * rawTime;
    closestApproachDistance = Math.hypot(closestX, closestY);
  }

  const threatensWisp =
    isApproaching &&
    timeToClosestApproachSec !== null &&
    timeToClosestApproachSec <= MAX_WARNING_HORIZON_SEC &&
    closestApproachDistance <= RELEVANT_CLOSEST_APPROACH;

  const warningTimeSec = timeToClosestApproachSec ?? Number.POSITIVE_INFINITY;

  let reactionState: WispReactionState = 'WATCH_TRAJECTORY';
  if (threatensWisp && (distance <= BRACE_DISTANCE || warningTimeSec <= 0.38)) {
    reactionState = input.tendency === 'NERVOUS' ? 'COWER' : 'BRACE_FOR_IMPACT';
  } else if (threatensWisp && (distance <= ALERT_DISTANCE || warningTimeSec <= 0.9)) {
    reactionState = input.tendency === 'BRAVE' ? 'ALARMED_ALERT' : 'GASP';
  }

  return {
    reactionState,
    lookTarget: projectilePosition,
    distance,
    closingSpeed,
    timeToClosestApproachSec,
    closestApproachDistance,
    isApproaching,
  };
}
