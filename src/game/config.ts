/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LevelState, MaterialConfig, MaterialType } from './types';

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
      position: { x: 400, y: 720 },
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
  inventory: {
    wood_beam: 4,
    wood_block: 4,
    stone_block: 3,
  },
};
