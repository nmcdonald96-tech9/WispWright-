/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MaterialType = 'wood_beam' | 'wood_block' | 'stone_block';

export type PieceCondition = 'INTACT' | 'CRACKED' | 'BROKEN' | 'LOST';

export type PieceOwnership =
  | 'PREBUILT_FIXED'
  | 'PREBUILT_MOVABLE'
  | 'PLAYER_OWNED'
  | 'GUARANTEED_DELIVERY';

export type PieceSource =
  | 'TEMPLATE'
  | 'STARTING_RESERVE'
  | 'GUARANTEED_DELIVERY';

export type InventoryCategory =
  | 'STARTING_RESERVE'
  | 'PLACED_INTACT'
  | 'PLACED_CRACKED'
  | 'BROKEN_DEBRIS'
  | 'LOST'
  | 'GUARANTEED_DELIVERY'
  | 'PREBUILT_FIXED'
  | 'PREBUILT_MOVABLE';

export type SnapshotType =
  | 'LEVEL_TEMPLATE'
  | 'INITIAL_DESIGN'
  | 'POST_ATTACK_1'
  | 'REINFORCEMENT_ENTRY'
  | 'REINFORCEMENT_COMPLETE'
  | 'FINAL_RESULT';

export type GameMode =
  // Phase 3 Complete Level 1 State Machine (23 explicit states)
  | 'LEVEL_LOADING'
  | 'LEVEL_INTRO'
  | 'WISP_INTRO'
  | 'THREAT_PREVIEW'
  | 'INITIAL_CONSTRUCTION'
  | 'CONSTRUCTION_READY'
  | 'PRE_ATTACK_VALIDATION'
  | 'ENEMY_INTRODUCTION'
  | 'AIMING_PREVIEW'
  | 'PROJECTILE_IN_FLIGHT'
  | 'IMPACT_RESOLUTION'
  | 'SETTLING'
  | 'ATTACK_RESOLVED'
  | 'REINFORCEMENT_INTRO'
  | 'REINFORCEMENT_ACTIVE'
  | 'REINFORCEMENT_VALIDATION'
  | 'EMERGENCY_DELIVERY'
  | 'FINAL_ATTACK_READY'
  | 'SEQUENCE_COMPLETE'
  | 'RESULTS'
  | 'UNLOCK_PRESENTATION'
  | 'RETRY_RESTORING'
  | 'FRESH_START_RESTORING'
  // Phase 1 & Phase 2 compatibility aliases
  | 'CONSTRUCTION'
  | 'TESTING_SIMULATION'
  | 'SETTLED'
  | 'RESTORING';

export type ResultClassification =
  | 'Exceptional Defense'
  | 'Strong Defense'
  | 'Successful Defense'
  | 'Narrow Survival'
  | 'Defense Failed';

export interface MasteryCriterion {
  id: 'SURVIVAL' | 'WISP_MASTERY' | 'STRUCTURAL_MASTERY';
  label: string;
  description: string;
  achieved: boolean;
}

export interface Level1Results {
  survived: boolean;
  classification: ResultClassification;
  wispsStable: number;
  wispsDispersed: number;
  totalWisps: number;
  piecesIntact: number;
  piecesCracked: number;
  piecesBroken: number;
  piecesLost: number;
  reserveRemaining: Record<MaterialType, number>;
  totalReserveRemaining: number;
  reinforcementMaterialsUsed: number;
  guaranteedDeliveryGranted: boolean;
  guaranteedDeliveryUsed: number;
  masteryCriteria: MasteryCriterion[];
  masteryScore: number; // 0 to 3
  failureObservation: string | null;
  sampleUnlockGranted: boolean;
}

export interface UnlockState {
  tutorialCompleted: boolean;
  reinforcementReserveUnlocked: boolean;
  unlockPresentedOnce: boolean;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface MaterialConfig {
  type: MaterialType;
  name: string;
  width: number;
  height: number;
  density: number;
  friction: number;
  restitution: number;
  color: string;
  borderColor: string;
  description: string;
}

export interface SnapSocket {
  id: string;
  pieceId?: string;
  anchorId?: string;
  worldPos: Vector2;
  normal: Vector2;
  type: 'center' | 'edge' | 'anchor';
  angle: number;
}

export interface EnvironmentalAnchor {
  id: string;
  name: string;
  position: Vector2;
  radius: number;
  type: 'bedrock' | 'ruin';
}

export interface PlacedPiece {
  id: string;
  type: MaterialType;
  position: Vector2;
  rotation: number; // radians
  isPrebuilt: boolean;
  attachedAnchorId?: string;
  condition?: PieceCondition;
  impactSeverity?: number;
  ownership?: PieceOwnership;
  source?: PieceSource;
}

export interface WispEntity {
  id: string;
  name: string;
  title: string;
  element: 'ignis' | 'aer' | 'terra' | 'aqua' | 'aether';
  position: Vector2;
  radius: number;
  color: string;
  glowColor: string;
  expression: 'calm' | 'curious' | 'nervous' | 'happy';
  isDispersed?: boolean;
  dispersalTime?: number;
}

export interface LevelState {
  schemaVersion: number;
  levelId: string;
  pieces: PlacedPiece[];
  inventory: Record<MaterialType, number>;
  wisps: WispEntity[];
  anchors: EnvironmentalAnchor[];
  worldBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  lossBoundaryY: number;
}

export type ConstructionAction =
  | {
      type: 'PLACE_PIECE';
      piece: PlacedPiece;
      fromDelivered?: boolean;
    }
  | {
      type: 'REMOVE_PIECE';
      piece: PlacedPiece;
      toDelivered?: boolean;
    }
  | {
      type: 'MOVE_PIECE';
      pieceId: string;
      beforePos: Vector2;
      beforeRot: number;
      beforeAnchorId?: string;
      afterPos: Vector2;
      afterRot: number;
      afterAnchorId?: string;
    }
  | {
      type: 'ROTATE_PIECE';
      pieceId: string;
      beforeRotation: number;
      afterRotation: number;
      beforeAnchorId?: string;
      afterAnchorId?: string;
    };

export interface DragState {
  source: 'inventory' | 'world';
  pieceType: MaterialType;
  pieceId?: string;
  currentWorldPos: Vector2;
  rotation: number;
  isValidPlacement: boolean;
  activeSnap?: {
    socket: SnapSocket;
    targetPos: Vector2;
    targetAngle: number;
  };
}

export interface StabilityReport {
  isSimulating: boolean;
  totalKineticEnergy: number;
  maxVelocity: number;
  settledRatio: number; // 0 to 1
  isSettled: boolean;
  fallenCount: number;
}

export type AttackerType = 'standard' | 'heavy';

export interface AuthoredAttack {
  attackId: string;
  attackerType: AttackerType;
  name: string;
  title: string;
  personalityTag: string;
  introQuote: string;
  introDurationSec: number;
  spawnPosition: Vector2;
  launchVelocity: Vector2;
  mass: number;
  radius: number;
  restitution: number;
  friction: number;
  maxFlightDurationSec: number;
  targetDescription: string;
}

export interface AttackOutcome {
  attackIndex: number;
  attackId: string;
  attackerType: 'standard' | 'heavy';
  wispsDispersed: number;
  piecesCracked: number;
  piecesBroken: number;
  piecesLost: number;
}

export interface SiegeSummary {
  wispsStable: number;
  totalWisps: number;
  piecesIntact: number;
  piecesCracked: number;
  piecesBroken: number;
  piecesLost: number;
  emergencyStopUsed: boolean;
  outcomes: AttackOutcome[];
}
