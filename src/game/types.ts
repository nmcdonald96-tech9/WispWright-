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
  | 'STABLE_BUILD'
  | 'INITIAL_DESIGN'
  | 'PRE_SIEGE_WISPS'
  | 'POST_ATTACK_1'
  | 'REINFORCEMENT_ENTRY'
  | 'REINFORCEMENT_COMPLETE'
  | 'FINAL_RESULT';

export type WispPlacementPhase =
  | 'STAGED_IN_BUILD'
  | 'RESERVED_IN_BUILD'
  | 'PLACE_WISPS'
  | 'PRE_SIEGE_REVIEW'
  | 'LOCKED_FOR_SIEGE';

export type WispShelterStatus = 'Exposed' | 'Partially sheltered' | 'Well sheltered';

export type WispProtectionTag =
  | 'Exposed'
  | 'Partially sheltered'
  | 'Well sheltered'
  | 'Shared collapse risk'
  | 'Heavy overhead hazard'
  | 'Tight enclosure'
  | 'Elevated position';

export type GameMode =
  // Phase 3 Complete Level 1 State Machine + Post-Construction Wisp Preparation
  | 'LEVEL_LOADING'
  | 'LEVEL_INTRO'
  | 'WISP_INTRO'
  | 'THREAT_PREVIEW'
  | 'INITIAL_CONSTRUCTION'
  | 'CONSTRUCTION_READY'
  | 'PLACE_WISPS'
  | 'PRE_SIEGE_REVIEW'
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

export type WispContactCategory =
  | 'HARMLESS_TOUCH'
  | 'MEANINGFUL_DEBRIS_HIT'
  | 'HEAVY_DEBRIS_HIT'
  | 'PINNED_OR_CRUSHED'
  | 'COSMETIC_ONLY'
  | 'DUPLICATE_EVENT';

export interface WispContactEvent {
  id: string;
  attackId: string;
  simTimestamp: number; // seconds
  wispId: string;
  contactingObjectId: string;
  contactingObjectType: 'piece' | 'projectile' | 'terrain';
  contactingObjectMaterial: MaterialType | 'projectile' | 'bedrock';
  contactingObjectCondition: PieceCondition | 'N/A';
  contactingObjectMass: number;
  wispColliderBounds: { centerX: number; centerY: number; radius: number };
  objectColliderBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width?: number;
    height?: number;
    angle?: number;
  };
  contactPoint: Vector2;
  contactNormal: Vector2;
  relativeLinearSpeed: number; // px/tick
  relativeAngularSpeedAtContact: number; // px/tick
  totalContactSpeed: number; // px/tick
  normalImpulse: number;
  tangentialImpulse: number;
  existingImpactSeverity: number;
  wispDirectImpactThreshold: number;
  wispDebrisImpactThreshold: number;
  isAwake: boolean;
  contactPhase: 'FIRST_CONTACT' | 'SUSTAINED_CONTACT' | 'CONTACT_END';
  isDeduplicated: boolean;
  deduplicationReason: string | null;
  dispersalRequested: boolean;
  dispersalCommitted: boolean;
  notDispersedReason: string | null;
  category: WispContactCategory;
  pinnedDurationSec?: number;
}

export type TimberJointState = 'INTACT' | 'STRAINED' | 'BROKEN';

export type TimberJointType = 'BEAM_END_TO_BEAM_END' | 'BEAM_END_TO_BEAM_SIDE';

export interface TimberJointStrengthProfile {
  profileId: string;
  tensileStrength: number; // Max axial stretch (px) before immediate break
  shearStrength: number; // Max orthogonal shear stretch (px) before immediate break
  bendingStrength: number; // Max angular deflection (radians) before immediate break
  torqueLimit: number; // Max angular restoring impulse per step (rad/step)
  angularCompliance: number; // Angular spring stiffness factor
  linearCompliance: number; // Matter.js constraint linear stiffness (0..1)
  damping: number; // Matter.js constraint & angular damping (0..1)
  breakImpulseThreshold: number; // Direct impact impulse threshold that snaps the joint
  accumulatedStressThreshold: number; // Continuous overload stress budget before snapping
  strainedStressRatio: number; // Ratio (0..1) at which joint transitions to STRAINED
}

export interface TimberJoint {
  jointId: string;
  jointType: TimberJointType;
  pieceAId: string;
  pieceBId: string;
  socketAId: string;
  socketBId: string;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldPosition: Vector2;
  restAngle: number; // angleB - angleA at creation/update
  restSeparation: number; // distance(worldSocketA, worldSocketB) at creation/update
  strengthProfile: string;
  state: TimberJointState;
  currentStress: number;
  maxStressObserved: number;
  createdInPhase: 'BUILD' | 'REINFORCEMENT';
  brokenInPhase?: string | null;
  brokenByAttackId?: string | null;
  failureReason?: string | null;
  breakPosition?: Vector2 | null;
  breakTimestamp?: number | null;
}

export interface ProposedTimberJoint {
  targetPieceId: string;
  sourceSocketId: string;
  targetSocketId: string;
  sourceSocketName: string;
  targetSocketName: string;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldPosition: Vector2;
  jointType: TimberJointType;
  restAngle: number;
  restSeparation: number;
  strengthProfile: string;
}

export interface TimberJointDiagnostics {
  snapEnabled: boolean;
  activeDraggingPieceId: string | null;
  activeSourceSocketId: string | null;
  activeTargetPieceId: string | null;
  activeTargetSocketId: string | null;
  socketWorldDistance: number | null;
  proposedConnectionCategory:
    | 'TIMBER_JOINT'
    | 'ENVIRONMENTAL_ANCHOR'
    | 'SUPPORTED_CONTACT'
    | 'POSITION_SNAP'
    | 'NONE';
  jointEligibility: boolean;
  overlapClassification:
    | 'NONE'
    | 'SOCKET_CONTACT_CLEARED'
    | 'BODY_OVERLAP'
    | 'STEEP_ANGLE_CLEARANCE'
    | 'THIRD_PIECE_CONFLICT'
    | 'TERRAIN_CONFLICT'
    | 'OUT_OF_BOUNDS';
  conflictingPieceId: string | null;
  penetrationDepth: number;
  manualPreferredRotation: number;
  committedRotation: number;
  createdTimberJointId: string | null;
  activeTimberJointCount: number;
  intactJointCount: number;
  strainedJointCount: number;
  brokenJointCount: number;
  lastJointBreakReason: string | null;
  lastJointBreakAttackOrPhase: string | null;
  playerFriendlyJointMessage: string | null;
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
  // Timber Joint Structural Summary
  jointsIntact?: number;
  jointsStrained?: number;
  jointsBroken?: number;
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

export type SocketKind =
  | 'beam_end'
  | 'beam_side'
  | 'beam_corner'
  | 'block_edge'
  | 'center'
  | 'anchor';

export interface SnapSocket {
  id: string;
  pieceId?: string;
  anchorId?: string;
  localName?: string;
  localPos?: Vector2;
  localNormal?: Vector2;
  worldPos: Vector2;
  normal: Vector2;
  type: 'center' | 'edge' | 'anchor';
  socketKind?: SocketKind;
  angle: number;
}

export interface EnvironmentalAnchor {
  id: string;
  name: string;
  position: Vector2;
  radius: number;
  type: 'bedrock' | 'ruin';
}

export type RotationSource =
  | 'DEFAULT'
  | 'USER'
  | 'SNAP_PREVIEW'
  | 'ANCHOR_REQUIRED'
  | 'RESTORED';

export interface RotationOwnershipState {
  currentRotation: number;
  preferredRotation: number;
  rotationSource: RotationSource;
  manualRotationRevision: number;
  snapPositionAccepted: boolean;
  snapRotationAccepted: boolean;
  proposedSnapAngle: number | null;
  activeSnapCandidateSocketId?: string;
}

export type PointerInteractionType =
  | 'NONE'
  | 'INVENTORY_DRAG'
  | 'WORLD_DRAG'
  | 'TAP_PLACEMENT'
  | 'CAMERA_PAN'
  | 'PINCH_ZOOM';

export type InventoryLiftState =
  | 'IDLE'
  | 'UI_LIFT'
  | 'TRANSITIONING_TO_WORLD'
  | 'WORLD_ACTIVE'
  | 'RETURNING_TO_INVENTORY';

export interface SourceCardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RotationRejectionReason =
  | 'VALID'
  | 'PIECE_OVERLAP'
  | 'TERRAIN_OVERLAP'
  | 'OUT_OF_BOUNDS'
  | 'WISP_OVERLAP'
  | 'CONNECTION_INCOMPATIBLE'
  | 'SWEEP_COLLISION'
  | null;

export interface RotationValidationDiagnostics {
  selectedPieceId: string | null;
  currentCommittedAngle: number;
  proposedAngle: number;
  rotationFinalOverlapCount: number;
  rotationSweepOverlapCount: number;
  conflictingColliderId: string | null;
  penetrationDepth: number;
  connectionIncompatibility: boolean;
  rotationAccepted: boolean;
  lastRejectionReason: RotationRejectionReason;
  playerFriendlyMessage: string | null;
  timestamp: number;
}

export interface WispPresenceDiagnostics {
  currentPhase: string;
  wispBattlefieldCount: number;
  wispBlockerCount: number;
  wispStagingCount: number;
  wisps: Array<{
    wispId: string;
    placed: boolean;
    position: Vector2 | null;
    hasActiveCollider: boolean;
    blocksConstruction: boolean;
    shelterState: string;
  }>;
}

export interface WispPlacementDiagnostics {
  wispId: string | null;
  wispPosition: Vector2 | null;
  wispColliderBounds: { centerX: number; centerY: number; radius: number } | null;
  localClearanceResult: 'CLEAR' | 'TIGHT' | 'INTERSECTS_COLLIDER';
  overlappingConstructionColliderId: string | null;
  overlappingTerrainColliderId: string | null;
  overlappingWispId: string | null;
  sanctuaryBoundaryResult:
    | 'INSIDE'
    | 'OUTSIDE'
    | 'LAUNCHER_ZONE'
    | 'BEYOND_LOSS_BOUNDARY'
    | 'EXTENDS_BENEATH_FLOOR';
  warningClassifications: string[];
  exteriorPathCheckEnabled: false;
  sealedEnclosureAccepted: boolean;
  lastPlacementRejectionReason: string | null;
  playerFriendlyMessage: string | null;
  timestamp: number;
}

export interface ConstructionDiagnostics {
  activePointerInteractionType: PointerInteractionType;
  activeInventoryItemId: MaterialType | null;
  placementGhostActive: boolean;
  ghostWorldCoordinates: Vector2 | null;
  ghostRotation: number;
  preferredPlayerRotation: number;
  rotationSource: RotationSource;
  manualRotationRevision: number;
  activePositionalSnapCandidate: string | null;
  activeRotationalSnapCandidate: string | null;
  proposedSnapAngle: number | null;
  snapRotationAccepted: boolean;
  pointerCaptureActive: boolean;
  inventoryDecrementCountForCurrentInteraction: number;
  placementCommitCount: number;
  cancellationReason: string | null;
  cameraMovementSuppressedDuringDrag: boolean;
  lastSnapRejectionReason: string | null;
  // Inventory-Lift & Beam-Endpoint Snap Diagnostics (20 fields)
  inventoryLiftState: InventoryLiftState;
  inventorySourceCardBounds: SourceCardBounds | null;
  pointerUiCoordinates: Vector2 | null;
  pointerWorldCoordinates: Vector2 | null;
  ghostPresentationScale: number;
  ghostWorldScale: number;
  activePieceSocketId: string | null;
  activeTargetSocketId: string | null;
  socketCompatibility: string | null;
  candidateWorldDistance: number | null;
  candidateLockActive: boolean;
  candidateLockReleaseRadius: number;
  positionCorrectionVector: Vector2 | null;
  proposedRotation: number | null;
  explicitJointProposed: boolean;
  supportedContactPredicted: boolean;
  placementRejectionReason: string | null;
  overlapColliderId: string | null;
  penetrationDepth: number;
  // Rotation Transaction & Wisp Presence & Timber Joint Diagnostics
  rotationDiagnostics?: RotationValidationDiagnostics | null;
  wispPresenceDiagnostics?: WispPresenceDiagnostics | null;
  wispPlacementDiagnostics?: WispPlacementDiagnostics | null;
  timberJointDiagnostics?: TimberJointDiagnostics | null;
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
  preferredRotation?: number;
  rotationSource?: RotationSource;
  manualRotationRevision?: number;
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
  defaultPosition?: Vector2;
  radius: number;
  color: string;
  glowColor: string;
  expression: 'calm' | 'curious' | 'nervous' | 'happy';
  isDispersed?: boolean;
  dispersalTime?: number;
  // Post-construction wisp placement & protection classification
  placed?: boolean;
  isValid?: boolean;
  validationReason?: string | null;
  shelterStatus?: WispShelterStatus;
  sharedCollapseRisk?: boolean;
  heavyOverheadHazard?: boolean;
  limitedClearance?: boolean;
  elevatedChamber?: boolean;
  protectionTags?: WispProtectionTag[];
  hazardWarning?: string | null;
}

export interface WispDragState {
  wispId: string;
  name: string;
  color: string;
  glowColor: string;
  radius: number;
  source: 'tray' | 'world' | 'tap_staging';
  currentWorldPos: Vector2;
  isValidPlacement: boolean;
  rejectionCode: string | null;
  playerFriendlyMessage: string | null;
  shelterStatus: WispShelterStatus;
  sharedCollapseRisk: boolean;
  heavyOverheadHazard: boolean;
  limitedClearance?: boolean;
  elevatedChamber?: boolean;
  protectionTags: WispProtectionTag[];
  hazardWarning: string | null;
  pointerUiCoords?: Vector2 | null;
  sourceCardBounds?: SourceCardBounds | null;
}

export interface LevelState {
  schemaVersion: number;
  levelId: string;
  pieces: PlacedPiece[];
  joints?: TimberJoint[];
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
      createdJoints?: TimberJoint[];
    }
  | {
      type: 'REMOVE_PIECE';
      piece: PlacedPiece;
      toDelivered?: boolean;
      removedJoints?: TimberJoint[];
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
      beforeJoints?: TimberJoint[];
      afterJoints?: TimberJoint[];
    }
  | {
      type: 'ROTATE_PIECE';
      pieceId: string;
      beforeRotation: number;
      afterRotation: number;
      beforeAnchorId?: string;
      afterAnchorId?: string;
      beforeJoints?: TimberJoint[];
      afterJoints?: TimberJoint[];
    }
  | {
      type: 'DETACH_JOINT';
      pieceId: string;
      removedJoints: TimberJoint[];
    };

export interface DragState {
  source: 'inventory' | 'world' | 'tap_staging';
  pieceType: MaterialType;
  pieceId?: string;
  currentWorldPos: Vector2;
  rotation: number;
  preferredRotation: number;
  rotationSource: RotationSource;
  manualRotationRevision: number;
  isValidPlacement: boolean;
  activeSnap?: {
    socket: SnapSocket;
    pieceSocket?: SnapSocket;
    targetPos: Vector2;
    targetAngle: number;
    proposedAngle?: number;
    requiresRotationChange?: boolean;
    isAnchorRequired?: boolean;
    compatibilityLabel?: string | null;
    candidateDistance?: number | null;
    candidateLockActive?: boolean;
  };
  snapRotationAccepted?: boolean;
  // Inventory-to-World Lift & Validation Presentation State
  inventoryLiftState?: InventoryLiftState;
  sourceCardBounds?: SourceCardBounds | null;
  pointerUiCoords?: Vector2 | null;
  ghostPresentationScale?: number;
  transitionProgress?: number;
  supportedContactPredicted?: boolean;
  explicitJointProposed?: boolean;
  proposedTimberJoint?: ProposedTimberJoint | null;
  connectionCategory?:
    | 'TIMBER_JOINT'
    | 'ENVIRONMENTAL_ANCHOR'
    | 'SUPPORTED_CONTACT'
    | 'POSITION_SNAP'
    | 'NONE';
  overlapClassification?:
    | 'NONE'
    | 'SOCKET_CONTACT_CLEARED'
    | 'BODY_OVERLAP'
    | 'STEEP_ANGLE_CLEARANCE'
    | 'THIRD_PIECE_CONFLICT'
    | 'TERRAIN_CONFLICT'
    | 'OUT_OF_BOUNDS';
  placementRejectionReason?: string | null;
  playerFriendlyRejectionMessage?: string | null;
  overlapColliderId?: string | null;
  penetrationDepth?: number;
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
