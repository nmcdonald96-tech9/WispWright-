/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUTHORED_ATTACKS } from './siegeConfig';
import {
  getLevelDefinition,
  LevelAttackSlot,
  LevelDefinition,
  LevelId,
  LEVEL_1_DEFINITION,
} from './levelDefinitions';
import { AuthoredAttack } from '../types';

export const DEFAULT_LEVEL_ID: LevelId = 'alchemical_sanctuary_01';

export interface ResolvedLevelAttack {
  sequenceId: string;
  sequenceIndex: number;
  authoredAttackId: string;
  preferredArc: LevelAttackSlot['preferredArc'];
  lessonTag: LevelAttackSlot['lessonTag'];
  attack: AuthoredAttack;
}

export interface RuntimeLevelSelection {
  requestedLevelId: string | null | undefined;
  resolvedLevelId: LevelId;
  definition: LevelDefinition;
  fellBackToDefault: boolean;
  availableForNormalProgression: boolean;
}

const NORMAL_PROGRESSION_LEVEL_IDS = new Set<LevelId>([DEFAULT_LEVEL_ID]);
const ATTACK_BY_ID = new Map(AUTHORED_ATTACKS.map((attack) => [attack.attackId, attack]));

export function isKnownLevelId(value: unknown): value is LevelId {
  return value === 'alchemical_sanctuary_01' || value === 'craggy_ridge_02';
}

export function resolveRuntimeLevelSelection(
  requestedLevelId: string | null | undefined,
  allowUnavailableLevel = false,
): RuntimeLevelSelection {
  const known = isKnownLevelId(requestedLevelId);
  const requested = known ? requestedLevelId : DEFAULT_LEVEL_ID;
  const available = NORMAL_PROGRESSION_LEVEL_IDS.has(requested);
  const resolvedLevelId = available || allowUnavailableLevel ? requested : DEFAULT_LEVEL_ID;
  return {
    requestedLevelId,
    resolvedLevelId,
    definition: getLevelDefinition(resolvedLevelId),
    fellBackToDefault: resolvedLevelId !== requestedLevelId,
    availableForNormalProgression: NORMAL_PROGRESSION_LEVEL_IDS.has(resolvedLevelId),
  };
}

export function resolveLevelAttackSequence(
  definition: LevelDefinition,
): readonly ResolvedLevelAttack[] {
  return definition.attacks.map((slot, sequenceIndex) => {
    const authored = ATTACK_BY_ID.get(slot.authoredAttackId);
    if (!authored) {
      throw new Error(`Unknown authored attack: ${slot.authoredAttackId}`);
    }
    return {
      sequenceId: slot.sequenceId,
      sequenceIndex,
      authoredAttackId: slot.authoredAttackId,
      preferredArc: slot.preferredArc,
      lessonTag: slot.lessonTag,
      attack: { ...authored, spawnPosition: { ...authored.spawnPosition }, launchVelocity: { ...authored.launchVelocity } },
    };
  });
}

export function getDefaultRuntimeLevelSelection(): RuntimeLevelSelection {
  return {
    requestedLevelId: DEFAULT_LEVEL_ID,
    resolvedLevelId: DEFAULT_LEVEL_ID,
    definition: LEVEL_1_DEFINITION,
    fellBackToDefault: false,
    availableForNormalProgression: true,
  };
}
