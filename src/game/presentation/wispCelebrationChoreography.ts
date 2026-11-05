/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const WISP_CELEBRATION_STAGGER_SEC = 0.12;
export const WISP_CELEBRATION_DURATION_SEC = 2.25;

export type WispCelebrationStyle = 'IGNIS' | 'ZEPHYR' | 'MARINUS' | 'GENERIC';

export interface WispCelebrationPoseInput {
  wispId: string;
  elapsedSec: number;
  survivorIndex: number;
  survivorCount: number;
  totalWispCount: number;
  reducedMotion: boolean;
}

export interface WispCelebrationPose {
  style: WispCelebrationStyle;
  hasStarted: boolean;
  localElapsedSec: number;
  progress: number;
  offsetX: number;
  offsetY: number;
  rotationRad: number;
  scale: number;
  glowMultiplier: number;
  orbitProgress: number;
  ringProgress: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function resolveStyle(wispId: string): WispCelebrationStyle {
  if (wispId === 'wisp_ignis') return 'IGNIS';
  if (wispId === 'wisp_zephyr') return 'ZEPHYR';
  if (wispId === 'wisp_marinus') return 'MARINUS';
  return 'GENERIC';
}

export function deriveWispCelebrationPose(
  input: WispCelebrationPoseInput,
): WispCelebrationPose {
  const survivorIndex = Math.max(0, Math.floor(input.survivorIndex));
  const survivorCount = Math.max(1, Math.floor(input.survivorCount));
  const totalWispCount = Math.max(survivorCount, Math.floor(input.totalWispCount));
  const delaySec = survivorIndex * WISP_CELEBRATION_STAGGER_SEC;
  const localElapsedSec = Math.max(0, input.elapsedSec - delaySec);
  const hasStarted = input.elapsedSec >= delaySec;
  const progress = hasStarted
    ? clamp01(localElapsedSec / WISP_CELEBRATION_DURATION_SEC)
    : 0;
  const style = resolveStyle(input.wispId);

  if (!hasStarted) {
    return {
      style,
      hasStarted: false,
      localElapsedSec: 0,
      progress: 0,
      offsetX: 0,
      offsetY: 0,
      rotationRad: 0,
      scale: 1,
      glowMultiplier: 1,
      orbitProgress: 0,
      ringProgress: 0,
    };
  }

  const entry = smoothstep(Math.min(1, progress / 0.16));
  const returnPhase = smoothstep(Math.max(0, (progress - 0.78) / 0.22));
  const motionEnvelope = entry * (1 - returnPhase);
  const fullChorus = survivorCount === totalWispCount;
  const loneSurvivor = survivorCount === 1;

  if (input.reducedMotion) {
    const pulse = Math.sin(progress * Math.PI * 2);
    return {
      style,
      hasStarted: true,
      localElapsedSec,
      progress,
      offsetX: 0,
      offsetY: -1.5 * motionEnvelope,
      rotationRad: 0,
      scale: 1 + pulse * 0.025 * motionEnvelope,
      glowMultiplier: 1 + 0.18 * motionEnvelope,
      orbitProgress: progress,
      ringProgress: style === 'MARINUS' ? progress : 0,
    };
  }

  const amplitude = loneSurvivor ? 0.58 : fullChorus ? 1 : 0.82;
  const phase = progress * Math.PI * 2;

  if (style === 'IGNIS') {
    return {
      style,
      hasStarted: true,
      localElapsedSec,
      progress,
      offsetX: Math.sin(phase * 2) * 3 * motionEnvelope * amplitude,
      offsetY: -Math.sin(Math.min(1, progress / 0.48) * Math.PI) *
        24 * motionEnvelope * amplitude,
      rotationRad: phase * 1.35 * motionEnvelope * amplitude,
      scale: 1 + Math.sin(phase * 2) * 0.08 * motionEnvelope,
      glowMultiplier: 1 + 0.55 * motionEnvelope * amplitude,
      orbitProgress: progress,
      ringProgress: 0,
    };
  }

  if (style === 'ZEPHYR') {
    return {
      style,
      hasStarted: true,
      localElapsedSec,
      progress,
      offsetX: Math.sin(phase * 2) * 17 * motionEnvelope * amplitude,
      offsetY: Math.sin(phase * 4) * 7 * motionEnvelope * amplitude -
        Math.sin(Math.min(1, progress / 0.62) * Math.PI) * 8 * amplitude,
      rotationRad: Math.sin(phase * 2) * 0.24 * motionEnvelope,
      scale: 1 + Math.sin(phase * 4) * 0.045 * motionEnvelope,
      glowMultiplier: 1 + 0.35 * motionEnvelope * amplitude,
      orbitProgress: progress,
      ringProgress: 0,
    };
  }

  if (style === 'MARINUS') {
    return {
      style,
      hasStarted: true,
      localElapsedSec,
      progress,
      offsetX: Math.cos(phase) * 11 * motionEnvelope * amplitude,
      offsetY: Math.sin(phase) * 8 * motionEnvelope * amplitude -
        Math.sin(Math.min(1, progress / 0.7) * Math.PI) * 5 * amplitude,
      rotationRad: Math.sin(phase) * 0.1 * motionEnvelope,
      scale: 1 + Math.sin(phase) * 0.065 * motionEnvelope,
      glowMultiplier: 1 + 0.4 * motionEnvelope * amplitude,
      orbitProgress: progress,
      ringProgress: smoothstep(Math.min(1, progress / 0.76)),
    };
  }

  return {
    style,
    hasStarted: true,
    localElapsedSec,
    progress,
    offsetX: Math.sin(phase) * 6 * motionEnvelope * amplitude,
    offsetY: -Math.abs(Math.sin(phase)) * 9 * motionEnvelope * amplitude,
    rotationRad: 0,
    scale: 1 + Math.sin(phase) * 0.04 * motionEnvelope,
    glowMultiplier: 1 + 0.25 * motionEnvelope,
    orbitProgress: progress,
    ringProgress: 0,
  };
}
