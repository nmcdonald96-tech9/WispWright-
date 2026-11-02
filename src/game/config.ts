/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LevelState, MaterialConfig, MaterialType, TimberJointStrengthProfile } from './types';

export const TIMBER_JOINT_CONFIG = {
  endpointContactTolerance: 1.5, // Flush socket contact tolerance (px)
  maxAngledSocketClearance: 18.5, // Max outward socket clearance for angled/corner/peaked roof joints (px)
  minFoldedBodyCosine: 0.88, // Rejects beams folded back onto each other (dot > 0.88)
  sideJoinNormalDotLimit: -0.25, // T-joint normal alignment requirement
};

export const TIMBER_JOINT_PROFILES: Record<string, TimberJointStrengthProfile> = {
  standard_timber_joint: {
    profileId: 'standard_timber_joint',
    tensileStrength: 10.5, // Max axial stretch (px) before immediate break
    shearStrength: 10.5, // Max shear displacement (px) before immediate break
    bendingStrength: 0.34, // ~19.5 degrees angular deflection limit before immediate break
    torqueLimit: 0.0038, // Max angular restoring impulse per step (rad/step)
    angularCompliance: 0.14, // Angular spring stiffness factor
    linearCompliance: 0.90, // Matter.js constraint stiffness (high enough to hold span, compliant enough to flex)
    damping: 0.22, // Damping for constraint & angular spring-damper
    breakImpulseThreshold: 14.5, // Direct projectile/debris impact impulse threshold to snap joint
    accumulatedStressThreshold: 18.0, // Continuous overload stress budget before snapping
    strainedStressRatio: 0.38, // Transitions to STRAINED at 38% of break stress or 35% of bending limit
  },
};

export const MATERIAL_CONFIGS: Record<MaterialType, MaterialConfig> = {
  wood_beam: {
    type: 'wood_beam',
    name: 'Timber Beam',
    width: 120,
    height: 24,
    density: 0.0012, // Lightweight wood
    friction: 0.85,
    restitution: 0.02, // Minimal bounce
    color: '#b4743c',
    borderColor: '#78461e',
    description: 'Long wooden beam. Lightweight and easy to reposition. Ideal for spans and lintels.',
  },
  wood_block: {
    type: 'wood_block',
    name: 'Wood Block',
    width: 48,
    height: 48,
    density: 0.0012,
    friction: 0.88,
    restitution: 0.02,
    color: '#9c602c',
    borderColor: '#603512',
    description: 'Square wooden block. Versatile spacer, pillar base, or lightweight riser.',
  },
  stone_block: {
    type: 'stone_block',
    name: 'Cut Stone Block',
    width: 48,
    height: 48,
    density: 0.0068, // ~5.5x mass of wood
    friction: 0.98,
    restitution: 0.0, // Zero restitution for heavy stone
    color: '#64748b',
    borderColor: '#334155',
    description: 'Heavy quarried stone. Extremely stable under compression, but will crush fragile wood.',
  },
  bullseye_block: {
    type: 'bullseye_block',
    name: 'Bullseye Block',
    width: 48,
    height: 48,
    density: 0.0068, // Exact stone_block density (~5.5x mass of wood)
    friction: 0.98, // Exact stone_block friction
    restitution: 0.0, // Exact stone_block zero restitution
    color: '#7c2d12',
    borderColor: '#f59e0b',
    description: 'Taunt Stone Block. The next eligible attacker will aim for it if a valid trajectory exists.',
  },
};

export const WORLD_CONFIG = {
  width: 800,
  height: 1000,
  minX: -850,
  maxX: 850,
  groundY: 780,
  lossBoundaryY: 960,
  buildZone: {
    minX: 120,
    maxX: 680,
    minY: 260,
    maxY: 780,
  },
  snapDistance: 26, // Distance in world units to trigger magnetic snap
  anchorSnapDistance: 32, // Distance to snap to ground/ruin anchors
  gravity: 1.0, // Standard downward gravity in Matter.js
};

export const INITIAL_LEVEL_STATE: LevelState = {
  schemaVersion: 1,
  levelId: 'alchemical_sanctuary_01',
  worldBounds: {
    minX: -850,
    maxX: 850,
    minY: 0,
    maxY: 1000,
  },
  lossBoundaryY: 960,
  anchors: [
    {
      id: 'anchor_left',
      name: 'Western Bedrock Pylon',
      position: { x: 200, y: 780 },
      radius: 24,
      type: 'bedrock',
    },
    {
      id: 'anchor_center',
      name: 'Sanctum Rune Socket',
      position: { x: 400, y: 780 },
      radius: 26,
      type: 'ruin',
    },
    {
      id: 'anchor_right',
      name: 'Eastern Bedrock Pylon',
      position: { x: 600, y: 780 },
      radius: 24,
      type: 'bedrock',
    },
  ],
  wisps: [
    {
      id: 'wisp_ignis',
      name: 'Ignis',
      title: 'Emberling',
      element: 'ignis',
      position: { x: 280, y: 740 },
      defaultPosition: { x: 280, y: 740 },
      placed: false,
      radius: 18,
      color: '#f97316',
      glowColor: '#fdba74',
      expression: 'curious',
    },
    {
      id: 'wisp_zephyr',
      name: 'Zephyr',
      title: 'Breeze Sprite',
      element: 'aer',
      position: { x: 340, y: 730 },
      defaultPosition: { x: 340, y: 730 },
      placed: false,
      radius: 17,
      color: '#06b6d4',
      glowColor: '#67e8f9',
      expression: 'happy',
    },
    {
      id: 'wisp_terran',
      name: 'Terran',
      title: 'Sproutling',
      element: 'terra',
      position: { x: 400, y: 704 },
      defaultPosition: { x: 400, y: 704 },
      placed: false,
      radius: 20,
      color: '#10b981',
      glowColor: '#6ee7b7',
      expression: 'curious',
    },
    {
      id: 'wisp_marinus',
      name: 'Marinus',
      title: 'Dewdrop',
      element: 'aqua',
      position: { x: 460, y: 730 },
      defaultPosition: { x: 460, y: 730 },
      placed: false,
      radius: 17,
      color: '#3b82f6',
      glowColor: '#93c5fd',
      expression: 'nervous',
    },
    {
      id: 'wisp_aetheris',
      name: 'Aetheris',
      title: 'Star Vapor',
      element: 'aether',
      position: { x: 520, y: 740 },
      defaultPosition: { x: 520, y: 740 },
      placed: false,
      radius: 19,
      color: '#a855f7',
      glowColor: '#d8b4fe',
      expression: 'happy',
    },
  ],
  // Starting prebuilt defensive framework
  pieces: [
    // Left anchor stone base
    {
      id: 'prebuilt_stone_left_1',
      type: 'stone_block',
      position: { x: 200, y: 756 },
      rotation: 0,
      isPrebuilt: true,
      attachedAnchorId: 'anchor_left',
    },
    {
      id: 'prebuilt_stone_left_2',
      type: 'stone_block',
      position: { x: 200, y: 708 },
      rotation: 0,
      isPrebuilt: true,
    },
    // Right anchor stone base
    {
      id: 'prebuilt_stone_right_1',
      type: 'stone_block',
      position: { x: 600, y: 756 },
      rotation: 0,
      isPrebuilt: true,
      attachedAnchorId: 'anchor_right',
    },
    {
      id: 'prebuilt_stone_right_2',
      type: 'stone_block',
      position: { x: 600, y: 708 },
      rotation: 0,
      isPrebuilt: true,
    },
    // Center bedrock stone riser
    {
      id: 'prebuilt_stone_center',
      type: 'stone_block',
      position: { x: 400, y: 756 },
      rotation: 0,
      isPrebuilt: true,
      attachedAnchorId: 'anchor_center',
    },
  ],
  joints: [],
  inventory: {
    wood_beam: 4,
    wood_block: 4,
    stone_block: 3,
    bullseye_block: 1,
  },
};
