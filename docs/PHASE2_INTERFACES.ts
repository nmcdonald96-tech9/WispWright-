/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PHASE 2 ARCHITECTURAL INTERFACES
 *
 * Clean interface definitions for future combat, projectile physics,
 * structural damage classification, wisp vulnerability, and reinforcement phases.
 * (Type definitions only - zero runtime code or combat UI added in Phase 1).
 */

import { LevelState, MaterialType, PlacedPiece, Vector2 } from '../src/game/types';

/**
 * 1. Pre-Attack Fortress Layout Submission
 */
export interface FortressSubmission {
  timestamp: number;
  layoutSnapshot: LevelState;
  anchoredPieceIds: string[];
  totalMass: number;
}

/**
 * 2. Attack Phase Lifecycle Controller
 */
export type CombatPhase =
  | 'CONSTRUCTION'          // Player building fortress
  | 'SUBMITTED_LOCKED'      // Construction edits locked; pre-attack snapshot stored
  | 'PROJECTILE_IN_FLIGHT'  // Authored siege projectile launched
  | 'POST_IMPACT_SETTLING'  // Physics active; observing structural collapse
  | 'ATTACK_EVALUATED'      // Motion settled; victory/defeat outcome determined
  | 'REINFORCEMENT_MODE';   // Damaged fortress editable with emergency inventory

export interface CombatLifecycle {
  lockConstructionForAttack(levelState: LevelState): FortressSubmission;
  restorePreAttackLayout(submission: FortressSubmission): LevelState;
  enterReinforcementMode(damagedState: LevelState, bonusMaterials: Record<MaterialType, number>): LevelState;
}

/**
 * 3. Authored Projectiles
 */
export type ProjectileArchetype = 'battering_ram' | 'catapult_stone' | 'alchemical_mortar';

export interface ProjectileDefinition {
  id: string;
  archetype: ProjectileArchetype;
  spawnPosition: Vector2;
  initialVelocity: Vector2;
  mass: number;
  radius: number;
  restitution: number;
  personality: 'heavy_blunt' | 'explosive_shatter' | 'fast_piercing';
}

/**
 * 4. Structural Damage & Piece Integrity Classification
 */
export type PieceIntegrityState =
  | 'INTACT'    // No impact damage, within resting threshold
  | 'CRACKED'   // Absorbed stress > 40% of material threshold
  | 'BROKEN'    // Structural failure; detached from anchor or split
  | 'LOST';     // Fallen below loss boundary

export interface PieceDamageReport {
  pieceId: string;
  type: MaterialType;
  state: PieceIntegrityState;
  accumulatedImpulse: number;
  currentPosition: Vector2;
  isFallen: boolean;
}

export interface FortressDamageSummary {
  intactCount: number;
  crackedCount: number;
  brokenCount: number;
  lostCount: number;
  pieces: Map<string, PieceDamageReport>;
}

/**
 * 5. Wisp Vulnerability & Contact Detection
 */
export interface WispThreatEvent {
  wispId: string;
  threateningEntityId: string;
  type: 'projectile_direct' | 'falling_debris';
  contactVelocity: Vector2;
  impactForce: number;
  timestamp: number;
}

export interface WispSurvivalReport {
  wispId: string;
  isProtected: boolean;
  absorbedHits: number;
  lastThreatEvent?: WispThreatEvent;
}
