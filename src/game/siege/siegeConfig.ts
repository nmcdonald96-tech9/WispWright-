/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthoredAttack } from '../types';

export type DistancePreset = 'NEAR' | 'STANDARD' | 'FAR';

export interface DistancePresetConfig {
  preset: DistancePreset;
  name: string;
  launcherX: number;
  launcherY: number;
  distanceToFront: number; // Horizontal distance to x = 200 (Western Pylon)
  standardSpeedRange: [number, number];
  heavySpeedRange: [number, number];
  description: string;
}

export const DISTANCE_PRESETS: Record<DistancePreset, DistancePresetConfig> = {
  NEAR: {
    preset: 'NEAR',
    name: 'Near (360px)',
    launcherX: -160,
    launcherY: 640,
    distanceToFront: 360,
    standardSpeedRange: [11.0, 15.0],
    heavySpeedRange: [10.5, 14.5],
    description: 'Near range (~0.9x fortress width, 0.5-0.9s flight)',
  },
  STANDARD: {
    preset: 'STANDARD',
    name: 'Standard (660px)',
    launcherX: -460,
    launcherY: 640,
    distanceToFront: 660,
    standardSpeedRange: [14.0, 19.0],
    heavySpeedRange: [13.5, 18.0],
    description: 'Balanced gameplay default (~1.65x fortress width, 0.8-2.0s flight)',
  },
  FAR: {
    preset: 'FAR',
    name: 'Far (960px)',
    launcherX: -760,
    launcherY: 640,
    distanceToFront: 960,
    standardSpeedRange: [17.0, 23.0],
    heavySpeedRange: [16.5, 22.0],
    description: 'Extended ballistic range (~2.4x fortress width, 1.2-2.2s flight)',
  },
};

export const AUTHORED_ATTACKS: AuthoredAttack[] = [
  {
    attackId: 'attack_1_standard',
    attackerType: 'standard',
    name: 'Pyrite Spark',
    title: 'Brimstone Bombardier',
    personalityTag: 'Boastful · Energetic',
    introQuote: 'Step aside! Behold true aerodynamic majesty!',
    introDurationSec: 2.2,
    spawnPosition: { x: DISTANCE_PRESETS.STANDARD.launcherX, y: DISTANCE_PRESETS.STANDARD.launcherY },
    launchVelocity: { x: 14.2, y: -7.8 }, // Physically updated by targeting solver
    mass: 2.8,
    radius: 16,
    restitution: 0.05,
    friction: 0.8,
    maxFlightDurationSec: 6.0,
    targetDescription: 'Upper rampart & timber span',
  },
  {
    attackId: 'attack_2_heavy',
    attackerType: 'heavy',
    name: 'Grom the Slag-Brute',
    title: 'The Alchemical Juggernaut',
    personalityTag: 'Massive · Relentless',
    introQuote: 'Pyrite makes sparks. Grom brings GRAVITY!',
    introDurationSec: 3.4,
    spawnPosition: { x: DISTANCE_PRESETS.STANDARD.launcherX - 5, y: DISTANCE_PRESETS.STANDARD.launcherY + 10 },
    launchVelocity: { x: 13.5, y: -5.2 }, // Physically updated by targeting solver
    mass: 10.5, // ~3.8x mass of standard attacker
    radius: 24,
    restitution: 0.01,
    friction: 0.95,
    maxFlightDurationSec: 6.5,
    targetDescription: 'Lower foundation & pillar supports',
  },
];

export const DAMAGE_THRESHOLDS = {
  wood_beam: {
    crackImpulse: 12.0,
    breakImpulse: 26.0,
  },
  wood_block: {
    crackImpulse: 14.0,
    breakImpulse: 28.0,
  },
  stone_block: {
    crackImpulse: 28.0,
    breakImpulse: 60.0,
  },
  bullseye_block: {
    crackImpulse: 28.0,
    breakImpulse: 60.0,
  },
  wisp: {
    minImpactImpulse: 3.5, // Contact threshold to disperse wisp
    minVelocity: 1.5,
  },
};
