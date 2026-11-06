/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LEVEL_1_CONFIG } from '../config';
import { MaterialType } from '../types';
import { AUTHORED_ATTACKS } from './siegeConfig';

export type LevelId = 'alchemical_sanctuary_01' | 'craggy_ridge_02';
export type TerrainProfileId = 'FLAT_SANCTUARY' | 'CRAGGY_RIDGE_HIGH_ARC';
export type ArcPreference = 'DEFAULT' | 'HIGH';

export interface LevelAttackSlot {
  sequenceId: string;
  authoredAttackId: string;
  preferredArc: ArcPreference;
  lessonTag: 'FOUNDATION' | 'ROOF_WARNING' | 'ROOF_PRESSURE' | 'FINAL_EXAM';
}

export interface LevelDefinition {
  levelId: LevelId;
  displayName: string;
  requiredWispCount: number;
  selectedWispIds: readonly string[];
  minimumStableWispsForCompletion: number;
  startingInventory: Readonly<Record<MaterialType, number>>;
  attacks: readonly LevelAttackSlot[];
  reinforcementAfterAttackIndex: number | null;
  terrainProfileId: TerrainProfileId;
  prebuiltStructureId: string;
  tutorialEnabled: boolean;
}

export interface LevelDefinitionValidation {
  valid: boolean;
  errors: readonly string[];
}

const AUTHORED_ATTACK_IDS = new Set(AUTHORED_ATTACKS.map((attack) => attack.attackId));
const MATERIALS: readonly MaterialType[] = [
  'wood_beam',
  'wood_block',
  'stone_block',
  'bullseye_block',
];

export const LEVEL_1_DEFINITION: LevelDefinition = {
  levelId: 'alchemical_sanctuary_01',
  displayName: 'Alchemical Sanctuary',
  requiredWispCount: LEVEL_1_CONFIG.requiredWispCount,
  selectedWispIds: [...LEVEL_1_CONFIG.selectedWispIds],
  minimumStableWispsForCompletion: LEVEL_1_CONFIG.minimumStableWispsForCompletion,
  startingInventory: { ...LEVEL_1_CONFIG.startingInventory },
  attacks: [
    {
      sequenceId: 'level1_attack_1',
      authoredAttackId: 'attack_1_standard',
      preferredArc: 'DEFAULT',
      lessonTag: 'FOUNDATION',
    },
    {
      sequenceId: 'level1_attack_2',
      authoredAttackId: 'attack_2_heavy',
      preferredArc: 'DEFAULT',
      lessonTag: 'FINAL_EXAM',
    },
  ],
  reinforcementAfterAttackIndex: 0,
  terrainProfileId: 'FLAT_SANCTUARY',
  prebuiltStructureId: LEVEL_1_CONFIG.prebuiltStructureId,
  tutorialEnabled: true,
};

export const LEVEL_2_DEFINITION: LevelDefinition = {
  levelId: 'craggy_ridge_02',
  displayName: 'The Craggy Ridge',
  requiredWispCount: 3,
  selectedWispIds: ['wisp_ignis', 'wisp_zephyr', 'wisp_marinus'],
  minimumStableWispsForCompletion: 2,
  startingInventory: { ...LEVEL_1_CONFIG.startingInventory },
  attacks: [
    {
      sequenceId: 'level2_attack_1',
      authoredAttackId: 'attack_1_standard',
      preferredArc: 'HIGH',
      lessonTag: 'ROOF_WARNING',
    },
    {
      sequenceId: 'level2_attack_2',
      authoredAttackId: 'attack_1_standard',
      preferredArc: 'HIGH',
      lessonTag: 'ROOF_PRESSURE',
    },
    {
      sequenceId: 'level2_attack_3',
      authoredAttackId: 'attack_2_heavy',
      preferredArc: 'HIGH',
      lessonTag: 'FINAL_EXAM',
    },
  ],
  reinforcementAfterAttackIndex: 1,
  terrainProfileId: 'CRAGGY_RIDGE_HIGH_ARC',
  prebuiltStructureId: 'ridge_sanctuary_columns_v1',
  tutorialEnabled: false,
};

export const LEVEL_DEFINITIONS: Readonly<Record<LevelId, LevelDefinition>> = {
  alchemical_sanctuary_01: LEVEL_1_DEFINITION,
  craggy_ridge_02: LEVEL_2_DEFINITION,
};

export function validateLevelDefinition(level: LevelDefinition): LevelDefinitionValidation {
  const errors: string[] = [];
  if (!level.levelId.trim()) errors.push('levelId is required');
  if (level.requiredWispCount < 1 || level.requiredWispCount > 5) {
    errors.push('requiredWispCount must be between 1 and 5');
  }
  if (new Set(level.selectedWispIds).size !== level.selectedWispIds.length) {
    errors.push('selectedWispIds must be unique');
  }
  if (level.selectedWispIds.length !== level.requiredWispCount) {
    errors.push('selectedWispIds length must equal requiredWispCount');
  }
  if (
    level.minimumStableWispsForCompletion < 1 ||
    level.minimumStableWispsForCompletion > level.requiredWispCount
  ) {
    errors.push('minimumStableWispsForCompletion is outside the active wisp range');
  }
  for (const material of MATERIALS) {
    const count = level.startingInventory[material];
    if (!Number.isInteger(count) || count < 0) {
      errors.push(`startingInventory.${material} must be a non-negative integer`);
    }
  }
  if (level.attacks.length < 1) errors.push('at least one attack is required');
  const sequenceIds = new Set<string>();
  level.attacks.forEach((slot, index) => {
    if (!slot.sequenceId.trim()) errors.push(`attacks[${index}].sequenceId is required`);
    if (sequenceIds.has(slot.sequenceId)) errors.push(`duplicate attack sequenceId: ${slot.sequenceId}`);
    sequenceIds.add(slot.sequenceId);
    if (!AUTHORED_ATTACK_IDS.has(slot.authoredAttackId)) {
      errors.push(`unknown authoredAttackId: ${slot.authoredAttackId}`);
    }
  });
  if (level.reinforcementAfterAttackIndex !== null) {
    if (
      !Number.isInteger(level.reinforcementAfterAttackIndex) ||
      level.reinforcementAfterAttackIndex < 0 ||
      level.reinforcementAfterAttackIndex >= level.attacks.length - 1
    ) {
      errors.push('reinforcementAfterAttackIndex must precede a later attack');
    }
  }
  if (!level.prebuiltStructureId.trim()) errors.push('prebuiltStructureId is required');
  return { valid: errors.length === 0, errors };
}

export function getLevelDefinition(levelId: LevelId): LevelDefinition {
  return LEVEL_DEFINITIONS[levelId];
}
