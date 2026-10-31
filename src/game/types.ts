/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MaterialType = 'wood_beam' | 'wood_block' | 'stone_block' | 'bullseye_block';

export type PieceCondition = 'INTACT' | 'CRACKED' | 'BROKEN' | 'LOST';

export type BullseyeInventoryStatus =
  | 'IN_RESERVE'
  | 'PLACED_ACTIVE'
  | 'PLACED_TRIGGERED'
  | 'PLACED_EXPIRED'
  | 'PLACED_UNREACHABLE'
  | 'BROKEN_DEBRIS'
  | 'LOST_UNAVAILABLE';

export interface BullseyeLogicalState {
  pieceId: string;
  materialType: 'bullseye_block';
  inventoryStatus: BullseyeInventoryStatus;
  condition: PieceCondition;
  position: Vector2 | null;
  rotation: number;
  isPrebuilt: boolean;
  active: boolean;
  triggered: boolean;
  expired: boolean;
  reachableByCurrentAttacker: boolean;
  validTrajectoryCount: number;
  consumedByAttackId: string | null;
  overrideCancellationReason: string | null;
  conflictDiagnostic: string | null;
}

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

export type GuidedTutorialStep =
  | 'STEP_1_SELECT_BEAM'
  | 'STEP_2_PLACE_BEAM'
  | 'STEP_3_PLACE_BLOCK'
  | 'STEP_4_CREATE_SUPPORT'
  | 'STEP_5_TEST_STABILITY'
  | 'STEP_6_ACCEPT_OR_REVISE'
  | 'COMPLETE';

export type TutorialHighlightTargetId =
  | MaterialType
  | 'test_stability'
  | 'accept_stable_design'
  | 'begin_siege'
  | 'snap_toggle'
  | null;

export interface SuggestedPlacementRegion {
  id: string;
  pieceType: MaterialType;
  center: Vector2;
  width: number;
  height: number;
  toleranceRadius: number;
  label: string;
  supportPoints: Vector2[];
}

export interface AuthoritativeTutorialState {
  tutorialStarted: boolean;
  beamPlaced: boolean;
  blockPlaced: boolean;
  supportedConnectionCreated: boolean;
  stabilityTestStarted: boolean;
  stabilityTestPassed: boolean;
  stableDesignAccepted: boolean;
  basicLessonComplete: boolean;
  siegeEligible: boolean;
  currentGuidedStep: GuidedTutorialStep;
  guidanceSkipped: boolean;
  tutorialSkippedByDeveloper: boolean;
  completionPresented: boolean;
  // Construction revision ownership
  currentConstructionRevision: number;
  testedRevisionId: number | null;
  stabilityPassedForRevisionId: number | null;
  acceptedRevisionId: number | null;
  // Coaching & diagnostic state
  currentHighlightedItemId: TutorialHighlightTargetId;
  currentSuggestedPlacementRegion: SuggestedPlacementRegion | null;
  lastChecklistRecomputationReason: string;
  lastTutorialTransition: string;
  lastTutorialBlockingReason: string | null;
  beginSiegeHighlightOnce: boolean;
  unstableHint: string | null;
}

export interface TutorialChecklistState {
  placedBeam: boolean;
  placedBlock: boolean;
  hasSupportedConnection: boolean;
  stabilityTestRun: boolean;
  stabilityTestRestoredOrAccepted: boolean;
  stabilityTested: boolean;
  isComplete: boolean;
  playerPiecesPlacedCount: number;
  placedMaterialTypes: MaterialType[];
}

export interface ConstructionRelevanceTelemetry {
  playerPiecesPlacedBeforeAttack1: number;
  materialTypesPlacedBeforeAttack1: MaterialType[];
  piecesRetainedInReserveBeforeAttack1: number;
  tutorialChecklistStatus: TutorialChecklistState;
  authoritativeTutorialState?: AuthoritativeTutorialState;
  stabilityTestCompleted: boolean;
  wispsAfterAttack1: number | null;
  wispsAfterAttack2: number | null;
  finalResultBand: ResultClassification | null;
  tutorialCompletionAwarded: boolean;
  noBuildDevBypassUsed: boolean;
}

export interface Level1Results {
  survived: boolean;
  tutorialCompletionAwarded: boolean;
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
  // Phase 5 Bullseye Tactical Summary
  bullseyeUsed: boolean;
  bullseyeTargetHonored: boolean;
  bullseyeSurvived: boolean;
  // Construction Relevance & Baseline Telemetry
  constructionTelemetry?: ConstructionRelevanceTelemetry;
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
  // Phase 5 Bullseye Taunt V1 lifecycle state
  bullseyeActive?: boolean;
  bullseyeTriggered?: boolean;
  bullseyeExpired?: boolean;
  consumedByAttackId?: string | null;
  overrideCancellationReason?: string | null;
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
