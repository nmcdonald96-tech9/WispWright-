/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FlightPresentationPhase = 'ASCENT' | 'APEX' | 'DESCENT' | 'FINAL_APPROACH';

export interface FlightPresentationBlendInput {
  projectileVelocityY: number | null;
  distanceToTargetPx: number | null;
  previousApexBlend?: number;
  deltaSec: number;
  reducedMotion: boolean;
}

export interface FlightPresentationBlend {
  phase: FlightPresentationPhase;
  ascentWeight: number;
  apexWeight: number;
  descentWeight: number;
  approachWeight: number;
  visualPitchRad: number;
  trailScale: number;
}

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function deriveFlightPresentationBlend(
  input: FlightPresentationBlendInput,
): FlightPresentationBlend {
  const velocityY = finite(input.projectileVelocityY);
  const distance = Math.max(0, finite(input.distanceToTargetPx, 500));
  const approachWeight = smoothstep((210 - distance) / 80);
  const rawDescent = smoothstep((velocityY + 2.6) / 5.2);
  const rawAscent = 1 - rawDescent;
  const rawApex = 1 - smoothstep(Math.abs(velocityY) / 3.2);
  const dt = Math.max(0, finite(input.deltaSec));
  const previousApex = clamp01(finite(input.previousApexBlend));
  const response = input.reducedMotion ? 1 : clamp01(dt / 0.16);
  const apexWeight = previousApex + (rawApex - previousApex) * response;
  const nonApex = Math.max(0.0001, rawAscent + rawDescent);
  const phase: FlightPresentationPhase =
    approachWeight >= 0.55
      ? 'FINAL_APPROACH'
      : apexWeight >= 0.52
        ? 'APEX'
        : velocityY < 0
          ? 'ASCENT'
          : 'DESCENT';
  const motionScale = input.reducedMotion ? 0.35 : 1;
  return {
    phase,
    ascentWeight: (1 - apexWeight) * (rawAscent / nonApex),
    apexWeight,
    descentWeight: (1 - apexWeight) * (rawDescent / nonApex),
    approachWeight,
    visualPitchRad: Math.atan2(velocityY, 12) * 0.22 * motionScale,
    trailScale: input.reducedMotion ? 0.45 : 0.82 + approachWeight * 0.18,
  };
}
