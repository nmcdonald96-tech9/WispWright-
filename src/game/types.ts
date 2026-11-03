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

export type ConstructionBindingSubtype =
  | 'TIMBER_SPLICE'
  | 'RAFTER_CORNER_SEAT'
  | 'FACE_BINDING'
  | 'CORNER_BINDING'
  | 'BLOCK_BINDING'
  | 'ROOF_PEAK'
  | 'DIAGONAL_BRACE'
  | 'T_JOINT'
  | 'ENVIRONMENTAL_ANCHOR';

export type MaterialPairProfileId =
  | 'WOOD_WOOD'
  | 'WOOD_STONE'
  | 'STONE_STONE'
  | 'WOOD_ENVIRONMENT'
  | 'STONE_ENVIRONMENT'
  | 'ROOF_PEAK_WOOD'
  | 'ENVIRONMENTAL_ANCHOR';

export type ConnectionTaxonomyCategory =
  | 'FREE_CONTACT'
  | 'SUPPORTED_CONTACT'
  | 'POSITIONAL_SNAP'
  | 'TIMBER_SPLICE'
  | 'TIMBER_FACE'
  | 'TIMBER_CORNER'
  | 'RAFTER_CORNER_SEAT'
  | 'FACE_BINDING'
  | 'CORNER_BINDING'
  | 'BLOCK_BINDING'
  | 'ROOF_PEAK'
  | 'DIAGONAL_BRACE'
  | 'TIMBER_T_JOINT'
  | 'ENVIRONMENTAL_ANCHOR'
  | 'NONE';

export type TimberJointType =
  | 'TIMBER_SPLICE'
  | 'TIMBER_FACE'
  | 'TIMBER_CORNER'
  | 'RAFTER_CORNER_SEAT'
  | 'FACE_BINDING'
  | 'CORNER_BINDING'
  | 'BLOCK_BINDING'
  | 'ROOF_PEAK'
  | 'DIAGONAL_BRACE'
  | 'TIMBER_T_JOINT'
  | 'T_JOINT'
  | 'ENVIRONMENTAL_ANCHOR'
  | 'BEAM_END_TO_BEAM_END'
  | 'BEAM_END_TO_BEAM_SIDE';

export type PieceFaceId =
  | 'END_A_FACE'
  | 'END_B_FACE'
  | 'TOP_FACE'
  | 'BOTTOM_FACE'
  | 'SIDE_A_FACE'
  | 'SIDE_B_FACE'
  | 'SIDE_FACE_A'
  | 'SIDE_FACE_B'
  | 'LEFT_FACE'
  | 'RIGHT_FACE';

export type PieceCornerId =
  | 'TOP_LEFT_CORNER'
  | 'TOP_RIGHT_CORNER'
  | 'BOTTOM_LEFT_CORNER'
  | 'BOTTOM_RIGHT_CORNER'
  | 'END_A_INNER_CORNER'
  | 'END_A_OUTER_CORNER'
  | 'END_B_INNER_CORNER'
  | 'END_B_OUTER_CORNER'
  | 'END_A_TOP_CORNER'
  | 'END_A_BOTTOM_CORNER'
  | 'END_B_TOP_CORNER'
  | 'END_B_BOTTOM_CORNER';

export type PieceFeatureId =
  | PieceFaceId
  | PieceCornerId
  | 'FACE_CENTER_TOP'
  | 'FACE_CENTER_BOTTOM'
  | 'FACE_CENTER_LEFT'
  | 'FACE_CENTER_RIGHT'
  | 'END_A_CENTER'
  | 'END_B_CENTER'
  | 'CENTER';

export interface LocalCornerDef {
  id: PieceCornerId;
  localPos: Vector2;
  localNormal: Vector2;
  adjacentFaces: [PieceFaceId, PieceFaceId];
  jointCapable: boolean;
}

export interface WorldCorner extends LocalCornerDef {
  pieceId: string;
  pieceType: MaterialType;
  worldPos: Vector2;
  worldNormal: Vector2;
}

export interface LocalFaceDef {
  id: PieceFaceId;
  faceId?: PieceFaceId;
  center: Vector2;
  start: Vector2;
  end: Vector2;
  normal: Vector2;
  tangent: Vector2;
  length: number;
  jointCapable: boolean;
}

export interface WorldFace extends LocalFaceDef {
  pieceId: string;
  pieceType: MaterialType;
  worldCenter: Vector2;
  worldStart: Vector2;
  worldEnd: Vector2;
  worldNormal: Vector2;
  worldTangent: Vector2;
}

export interface PartnerPieceAdjustment {
  pieceId: string;
  beforePos: Vector2;
  afterPos: Vector2;
  proposedPosition?: Vector2;
  beforeRot: number;
  afterRot: number;
  correctionVector: Vector2;
}

export interface PeakSymmetryDiagnostics {
  supportHeightDifference: number;
  angleMagnitudeDifferenceDeg: number;
  apexWorldCoordinate: Vector2;
  apexSymmetryOffset: number;
  endpointSeamSeparation: number;
  placementOrderEquivalent: boolean;
  isSymmetricSlope?: boolean;
  isSymmetricConfiguration?: boolean;
}

export type ClosureClassification = 'EXACT' | 'FORGIVING' | 'AMBIGUOUS' | 'INVALID';

export type SupportFoundationClassification =
  | 'FIXED_ENVIRONMENTAL_SUPPORT'
  | 'ANCHORED_PIECE'
  | 'STABLE_COLUMN_CANDIDATE'
  | 'FREE_STANDING_LOOSE_BLOCK'
  | 'UNSTABLE_OR_UNRESOLVED_SUPPORT';

export type VisualConnectionState =
  | 'CANDIDATE_PREVIEW'
  | 'POSITIONAL_ALIGNMENT'
  | 'SUPPORTED_CONTACT'
  | 'COMMITTED_JOINT'
  | 'STRAINED_JOINT';

export type VisualJointCapType =
  | 'PEAK_CAP'
  | 'CORNER_BINDING'
  | 'TIMBER_COLLAR'
  | 'ALCHEMICAL_CLAMP'
  | 'MASONRY_SEAM'
  | 'ALCHEMICAL_RUNE'
  | 'NONE';

export interface CanonicalRelationshipDescription {
  pieceAId: string;
  pieceAType: MaterialType;
  featureAId: string;
  pieceBId: string;
  pieceBType: MaterialType;
  featureBId: string;
  relativeWorldPosition: Vector2;
  relativeRotationRad: number;
  connectionTaxonomy: ConnectionTaxonomyCategory;
  jointProfileId: string;
  canonicalKey: string;
  mirroredEquivalentKey: string;
}

export interface RoofAssemblyPreview {
  detected: boolean;
  status:
    | 'COMPLETE_SUPPORTED_ROOF'
    | 'MISSING_LEFT_SUPPORT'
    | 'MISSING_RIGHT_SUPPORT'
    | 'PEAK_UNRESOLVED'
    | 'AMBIGUOUS_OR_INVALID_CLOSURE';
  closureClassification: ClosureClassification;
  leftRafterPieceId: string | null;
  rightRafterPieceId: string | null;
  leftSupportPieceId: string | null;
  rightSupportPieceId: string | null;
  peakWorldPos: Vector2 | null;
  leftLowerWorldPos: Vector2 | null;
  rightLowerWorldPos: Vector2 | null;
  leftLowerConnectionState: VisualConnectionState | 'UNCONNECTED';
  rightLowerConnectionState: VisualConnectionState | 'UNCONNECTED';
  peakConnectionState: VisualConnectionState | 'UNCONNECTED';
  leftSupportFoundationClassification: SupportFoundationClassification;
  rightSupportFoundationClassification: SupportFoundationClassification;
  balancedPieceAdjustments: PartnerPieceAdjustment[];
  proposedJoints: ProposedTimberJoint[];
  summaryMessage: string;
}

export interface InitialJointStressDiagnostic {
  jointId: string;
  jointType: TimberJointType;
  pieceAId: string;
  pieceBId: string;
  initialPositionalErrorPx: number;
  initialAngularErrorRad: number;
  initialStoredConstraintEnergy: number;
}

export interface RoofSupportDiagnosticSummary {
  peakConnected: boolean;
  leftLowerRafterSupported: boolean;
  rightLowerRafterSupported: boolean;
  lowerSupportUnresolved: boolean;
  leftSupportType: 'STRUCTURAL_JOINT' | 'CONTACT_ONLY' | 'ENVIRONMENTAL_ANCHOR' | 'NONE';
  rightSupportType: 'STRUCTURAL_JOINT' | 'CONTACT_ONLY' | 'ENVIRONMENTAL_ANCHOR' | 'NONE';
  leftSupportFoundationClassification?: SupportFoundationClassification;
  rightSupportFoundationClassification?: SupportFoundationClassification;
  supportColumnAppearsUnstable: boolean;
  summaryMessage: string;
  foundationAdvisoryMessage?: string | null;
}

export interface CandidateRankingBreakdown {
  candidateId?: string;
  candidateLabel?: string;
  targetPieceId?: string;
  sourceFeatureId?: string;
  targetFeatureId?: string;
  validGeometry?: boolean;
  noColliderPenetration?: boolean;
  rotationPreserved?: boolean;
  explicitFeatureCompatibility?: number;
  architecturalIntentConfidence?: number;
  pointerProximityPx?: number;
  totalPositionalCorrectionPx?: number;
  partnerMovementPx?: number;
  pointerDistanceScore: number;
  angleCompatibilityScore: number;
  specificityScore: number;
  hysteresisBonus: number;
  supportCompletenessBonus: number;
  totalScore: number;
  finalScore?: number;
  closureClassification?: ClosureClassification;
  canonicalKey?: string;
  mirroredEquivalentKey?: string;
}

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
  strainThreshold?: number; // Explicit strain stress threshold
  breakThreshold?: number; // Explicit break stress threshold
}

export interface TimberJoint {
  jointId: string;
  bindingId?: string;
  jointType: TimberJointType;
  connectionSubtype?: ConstructionBindingSubtype;
  pieceAId: string;
  pieceBId: string;
  materialA?: MaterialType;
  materialB?: MaterialType;
  materialPairKey?: MaterialPairProfileId;
  isPrebuiltBinding?: boolean;
  socketAId: string;
  socketBId: string;
  localAnchorA: Vector2;
  localAnchorB: Vector2;
  worldPosition: Vector2;
  restAngle: number; // angleB - angleA at creation/update
  restSeparation: number; // distance(worldSocketA, worldSocketB) at creation/update
  strengthProfile: string;
  complianceProfile?: string;
  state: TimberJointState;
  currentStress: number;
  maxStressObserved: number;
  createdInPhase: 'BUILD' | 'REINFORCEMENT';
  creationReason?:
    | 'SNAP_COMMIT'
    | 'EXPLICIT_BIND'
    | 'MANUAL_BIND'
    | 'MANUAL_BIND_ACTION'
    | 'EDIT_PRESERVED'
    | 'REINFORCEMENT_COMMIT'
    | 'MIGRATED';
  geometrySchemaVersion?: number;
  brokenInPhase?: string | null;
  brokenByAttackId?: string | null;
  failureReason?: string | null;
  breakPosition?: Vector2 | null;
  breakTimestamp?: number | null;
  sourceFaceId?: PieceFaceId | null;
  targetFaceId?: PieceFaceId | null;
  sourceCornerId?: PieceCornerId | null;
  targetCornerId?: PieceCornerId | null;
  lowerSupportsDetected?: boolean;
  canonicalRelationship?: CanonicalRelationshipDescription | null;
  closureClassification?: ClosureClassification;
  visualConnectionState?: VisualConnectionState;
  visualJointCapType?: VisualJointCapType;
  initialPositionalErrorPx?: number;
  initialAngularErrorRad?: number;
  initialConstraintEnergy?: number;
}

export type ConstructionBinding = TimberJoint;

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
  connectionSubtype?: ConstructionBindingSubtype;
  materialA?: MaterialType;
  materialB?: MaterialType;
  materialPairKey?: MaterialPairProfileId;
  isPrebuiltBinding?: boolean;
  restAngle: number;
  restSeparation: number;
  strengthProfile: string;
  complianceProfile?: string;
  creationReason?:
    | 'SNAP_COMMIT'
    | 'EXPLICIT_BIND'
    | 'MANUAL_BIND'
    | 'MANUAL_BIND_ACTION'
    | 'EDIT_PRESERVED'
    | 'REINFORCEMENT_COMMIT'
    | 'MIGRATED';
  connectionTaxonomy?: ConnectionTaxonomyCategory;
  sourceFaceId?: PieceFaceId | null;
  targetFaceId?: PieceFaceId | null;
  sourceCornerId?: PieceCornerId | null;
  targetCornerId?: PieceCornerId | null;
  sourceFeatureType?: 'socket' | 'face' | 'corner' | 'apex';
  targetFeatureType?: 'socket' | 'face' | 'corner' | 'apex';
  sourceFaceNormal?: Vector2;
  targetFaceNormal?: Vector2;
  lowerSupportsDetected?: boolean;
  preservedJointId?: string | null;
  seamSeparation?: number;
  balancedAdjustmentActive?: boolean;
  partnerPieceAdjustment?: PartnerPieceAdjustment | null;
  partnerPieceAdjustments?: PartnerPieceAdjustment[];
  peakSymmetryDiagnostics?: PeakSymmetryDiagnostics | null;
  roofSupportSummary?: RoofSupportDiagnosticSummary | null;
  closureClassification?: ClosureClassification;
  canonicalRelationship?: CanonicalRelationshipDescription | null;
  roofAssemblyPreview?: RoofAssemblyPreview | null;
  visualConnectionState?: VisualConnectionState;
  visualJointCapType?: VisualJointCapType;
  playerFacingConnectionLabel?: string;
}

export interface JointEditTransactionSnapshot {
  operationId: string;
  pieceId: string;
  startTransform: {
    position: Vector2;
    rotation: number;
    preferredRotation: number;
    rotationSource: RotationSource;
    manualRotationRevision: number;
    attachedAnchorId?: string;
  };
  partnerPieceStartTransforms?: Record<
    string,
    {
      position: Vector2;
      rotation: number;
      preferredRotation: number;
      rotationSource: RotationSource;
      manualRotationRevision: number;
      attachedAnchorId?: string;
    }
  >;
  partnerPieceTransforms?: Record<string, { position: Vector2; rotation: number }>;
  pieceCondition: PieceCondition;
  affectedJoints: TimberJoint[];
  allJointsAtStart: TimberJoint[];
  socketPairs: Array<{ jointId: string; socketAId: string; socketBId: string }>;
  strengthProfiles: Record<string, string>;
  neighborPieceIds: string[];
  constructionRevision: number;
  inventorySnapshot: Record<MaterialType, number>;
  startedAt: number;
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
  connectionTaxonomy?: ConnectionTaxonomyCategory;
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
  // Intuitive Joint Editing & Angled Timber Construction Diagnostics
  selectedPieceId?: string | null;
  jointEditPreviewActive?: boolean;
  editStartTransform?: { position: Vector2; rotation: number } | null;
  suspendedPreviewJointIds?: string[];
  preservedJointCandidates?: string[];
  removedJointCandidates?: string[];
  newJointCandidates?: Array<{
    targetPieceId: string;
    sourceSocketId: string;
    targetSocketId: string;
    jointType: TimberJointType;
    strengthProfile: string;
  }>;
  candidateType?: ConnectionTaxonomyCategory;
  sourceFaceOrSocket?: string | null;
  targetFaceOrSocket?: string | null;
  sourceFaceNormal?: Vector2 | null;
  targetFaceNormal?: Vector2 | null;
  relativeAngle?: number | null;
  separation?: number | null;
  positionalCorrection?: Vector2 | null;
  rotationalCorrection?: number | null;
  connectionProfileId?: string | null;
  candidateLockState?: 'LOCKED' | 'UNLOCKED' | 'HYSTERESIS_HOLD';
  jointGraphBeforeEdit?: string[];
  jointGraphAfterProposedEdit?: string[];
  lastEditOutcome?: 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'ACTIVE' | 'IDLE';
  activeLogicalJointCount?: number;
  activePhysicsConstraintCount?: number;
  duplicateConstraintWarning?: boolean;
  perJointStressValues?: Record<string, number>;
  jointFailureReason?: string | null;
  historyOperationId?: string | null;
  restoreReason?: string | null;
  lowerSupportsDetected?: boolean;
  suspendedJointIds?: string[];
  preservedJointIds?: string[];
  removedJointIds?: string[];
  createdJointIds?: string[];
  activeSourceFaceId?: PieceFaceId | string | null;
  activeTargetFaceId?: PieceFaceId | string | null;
  faceContactNormal?: Vector2 | null;
  roofPeakDetected?: boolean;
  roofPeakLowerSupportsDetected?: boolean;
  diagonalBraceDetected?: boolean;
  // Modular Construction Geometry, Corner Joints & Symmetric Roof Diagnostics
  geometrySchemaVersion?: number;
  baseConstructionUnit?: number;
  selectedPieceDimensionsUnits?: { widthUnits: number; heightUnits: number } | null;
  selectedPieceVisualBounds?: { width: number; height: number } | null;
  selectedPieceColliderBounds?: { width: number; height: number } | null;
  sourceFeatureType?: 'socket' | 'face' | 'corner' | 'apex' | null;
  sourceFeatureId?: string | null;
  targetFeatureType?: 'socket' | 'face' | 'corner' | 'apex' | null;
  targetFeatureId?: string | null;
  endpointSeparation?: number | null;
  seamSeparation?: number | null;
  apexWorldCoordinate?: Vector2 | null;
  apexSymmetryOffset?: number | null;
  balancedAdjustmentActive?: boolean;
  pieceACorrection?: Vector2 | null;
  pieceBCorrection?: Vector2 | null;
  placementOrderEquivalent?: boolean | null;
  roofSupportSummary?: RoofSupportDiagnosticSummary | null;
  peakSymmetryDiagnostics?: PeakSymmetryDiagnostics | null;
  candidateRankingBreakdown?: CandidateRankingBreakdown | null;
  candidateCycleIndex?: number;
  candidateCycleCount?: number;
  availableCandidateLabels?: string[];
  currentCandidateLabel?: string | null;
  migrationResult?: string | null;
  invalidMigratedJointCount?: number;
  // Forgiving Architectural Snap, Stress-Free Joint Closure & Ordinary-Load Stability Diagnostics
  canonicalRelationship?: CanonicalRelationshipDescription | null;
  mirroredEquivalentRelationship?: string | null;
  placementOrderHash?: string | null;
  closureClassification?: ClosureClassification | null;
  roofAssemblyPreview?: RoofAssemblyPreview | null;
  leftLowerConnectionState?: VisualConnectionState | 'UNCONNECTED' | null;
  rightLowerConnectionState?: VisualConnectionState | 'UNCONNECTED' | null;
  peakConnectionState?: VisualConnectionState | 'UNCONNECTED' | null;
  leftSupportFoundationClassification?: SupportFoundationClassification | null;
  rightSupportFoundationClassification?: SupportFoundationClassification | null;
  balancedPieceAdjustments?: PartnerPieceAdjustment[];
  initialJointPositionalError?: number | null;
  initialJointAngularError?: number | null;
  initialConstraintEnergy?: number | null;
  initialJointStressDiagnostics?: InitialJointStressDiagnostic[];
  peakJointForceDuringGravityTest?: number | null;
  lowerJointForcesDuringGravityTest?: Record<string, number> | null;
  jointBreakReason?: string | null;
  foundationFailureReason?: string | null;
  visualConnectionState?: VisualConnectionState | null;
  visualJointCapType?: VisualJointCapType | null;
  freeAdjustActive?: boolean;
  fineAdjustmentOffsetPx?: Vector2 | null;
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
  // Level 1 Three-Wisp & Variable Wisp Count Metadata
  requiredWispCount?: number;
  minimumStableWispsForCompletion?: number;
  developerWispCountOverride?: number | null;
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
  widthUnits: number;
  heightUnits: number;
  width: number;
  height: number;
  colliderWidth: number;
  colliderHeight: number;
  visualWidth: number;
  visualHeight: number;
  localOrigin: Vector2;
  renderingScale: number;
  jointCapable: boolean;
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
  | 'block_corner'
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

export type WispTendencyType = 'BRAVE' | 'EASILY_DISTRACTED' | 'SERIOUS' | 'NERVOUS' | 'CURIOUS';

export type WispSilhouetteType = 'FLAME_CROWN' | 'BREEZE_SWIRL' | 'STONE_CORE' | 'DROPLET_HALO' | 'STAR_PRISM';

export interface WispDefinition {
  id: string;
  name: string;
  title: string;
  element: 'ignis' | 'aer' | 'terra' | 'aqua' | 'aether';
  personality: string;
  tendency: WispTendencyType;
  isHero: boolean;
  silhouetteType: WispSilhouetteType;
  crestShape: 'CROWN_CREST' | 'FEATHER_PLUME' | 'BASALT_HORNS' | 'TIDAL_FIN' | 'STAR_DIADEM';
  armorShape: 'EMBER_MANTLE' | 'ZEPHYR_RIBBON' | 'GRANITE_GUARD' | 'RIPPLE_CAPE' | 'AETHER_RING';
  idleSpeed: number;
  idlePhaseOffset: number;
  radius: number;
  color: string;
  glowColor: string;
  expression: 'calm' | 'curious' | 'nervous' | 'happy';
  defaultPosition: Vector2;
}

export interface ResultBandDefinition {
  minStableWisps: number;
  maxStableWisps: number;
  classification: ResultClassification;
  completionAwarded: boolean;
}

export interface LevelConfiguration {
  levelId: string;
  requiredWispCount: number;
  availableWispDefinitions: WispDefinition[];
  selectedWispIds: string[];
  minimumStableWispsForCompletion: number;
  resultBands: ResultBandDefinition[];
  attackDefinitions: string[];
  reinforcementSchedule: {
    afterAttackIndex: number;
    timerSec: number;
    guaranteedDelivery: Partial<Record<MaterialType, number>>;
  };
  startingInventory: Record<MaterialType, number>;
  prebuiltStructureId: string;
  tutorialConfiguration: {
    requiresBeam: boolean;
    requiresBlock: boolean;
    requiresSupportedConnection: boolean;
    requiresStabilityTest: boolean;
  };
}

export interface SnapshotWispMetadata {
  levelId: string;
  requiredWispCount: number;
  activeWispIds: string[];
  activeWispDefinitions: WispDefinition[];
  committedWispPositions: Record<string, Vector2>;
  wispStates: Array<{
    id: string;
    placed: boolean;
    isValid: boolean;
    isDispersed: boolean;
    position: Vector2;
  }>;
  totalActiveWispCount: number;
  currentPlacedWispCount: number;
  resultBands: ResultBandDefinition[];
  minimumStableWispsForCompletion: number;
  developerWispCountOverride: number | null;
}

export interface DeveloperWispOverrideDiagnostics {
  configuredLevelRequiredWispCount: number;
  developerWispCountOverride: number | null;
  activeRequiredWispCount: number;
  activeWispIds: string[];
  placedWispCount: number;
  stagingWispCount: number;
  minimumStableWispsForCompletion: number;
  resultBands: ResultBandDefinition[];
}

export interface AttackBalanceTelemetry {
  attackId: string;
  attackerType: AttackerType;
  selectedTargetId: string;
  selectedTargetCategory: string;
  bullseyeOverrideActive: boolean;
  launchAngle: number;
  launchSpeed: number;
  firstImpactObjectId: string | null;
  wispsRemainingAfterAttack: number;
  wispContactEventsCount: number;
  wispDispersalCauses: Record<string, string>;
  intactPiecesRemaining: number;
  crackedPiecesRemaining: number;
  brokenPiecesRemaining: number;
  lostPiecesRemaining: number;
  activeJointsRemaining: number;
  brokenJointsCount: number;
}

export interface AttemptBalanceTelemetry {
  attemptId: string;
  timestamp: number;
  levelId: string;
  activeWispCount: number;
  activeWispIds: string[];
  developerWispCountOverride: number | null;
  initialPieceCount: number;
  initialPlayerPiecesByMaterial: Record<MaterialType, number>;
  initialJointCountByType: Record<string, number>;
  wispPlacedPositions: Record<string, Vector2>;
  wispProtectionClassification: Record<string, WispShelterStatus>;
  sharedCollapseRiskClusters: number;
  heavyOverheadRiskCount: number;
  attack1TargetId: string | null;
  attack1TargetCategory: string | null;
  attack1FirstImpactId: string | null;
  wispsStableAfterAttack1: number;
  wispsDispersedAfterAttack1: number;
  reinforcementPiecesPlaced: number;
  reinforcementJointsCreated: number;
  reserveUsedCount: number;
  guaranteedDeliveryUsed: boolean;
  bullseyeUsed: boolean;
  attack2TargetId: string | null;
  attack2TargetCategory: string | null;
  attack2FirstImpactId: string | null;
  finalWispsStable: number;
  finalWispsDispersed: number;
  finalResultBand: ResultClassification;
  completionAwarded: boolean;
  attacks: AttackBalanceTelemetry[];
}

export interface WispEntity {
  id: string;
  name: string;
  title: string;
  element: 'ignis' | 'aer' | 'terra' | 'aqua' | 'aether';
  personality?: string;
  tendency?: WispTendencyType;
  isHero?: boolean;
  silhouetteType?: WispSilhouetteType;
  crestShape?: 'CROWN_CREST' | 'FEATHER_PLUME' | 'BASALT_HORNS' | 'TIDAL_FIN' | 'STAR_DIADEM';
  armorShape?: 'EMBER_MANTLE' | 'ZEPHYR_RIBBON' | 'GRANITE_GUARD' | 'RIPPLE_CAPE' | 'AETHER_RING';
  idleSpeed?: number;
  idlePhaseOffset?: number;
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
  geometrySchemaVersion?: number;
  levelId: string;
  requiredWispCount?: number;
  activeWispIds?: string[];
  minimumStableWispsForCompletion?: number;
  resultBands?: ResultBandDefinition[];
  developerWispCountOverride?: number | null;
  snapshotMetadata?: SnapshotWispMetadata;
  attemptId?: string;
  resetGeneration?: number;
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
  migrationDiagnostics?: {
    migratedFromGeometrySchema: number;
    migratedToGeometrySchema: number;
    preservedPieceCount: number;
    preservedJointCount: number;
    invalidMigratedJointCount: number;
    removedJointIds: string[];
    result: string;
  } | null;
}

export type ConstructionAction =
  | {
      type: 'PLACE_PIECE';
      operationId?: string;
      piece: PlacedPiece;
      fromDelivered?: boolean;
      createdJoints?: TimberJoint[];
      partnerPieceMoves?: PartnerPieceAdjustment[];
      beforeRevision?: number;
      afterRevision?: number;
    }
  | {
      type: 'REMOVE_PIECE';
      operationId?: string;
      piece: PlacedPiece;
      toDelivered?: boolean;
      removedJoints?: TimberJoint[];
      beforeRevision?: number;
      afterRevision?: number;
    }
  | {
      type: 'MOVE_PIECE';
      operationId?: string;
      pieceId: string;
      beforePos: Vector2;
      beforeRot: number;
      beforeAnchorId?: string;
      afterPos: Vector2;
      afterRot: number;
      afterAnchorId?: string;
      partnerPieceMoves?: PartnerPieceAdjustment[];
      beforeJoints?: TimberJoint[];
      afterJoints?: TimberJoint[];
      removedJoints?: TimberJoint[];
      preservedJoints?: TimberJoint[];
      createdJoints?: TimberJoint[];
      beforeRevision?: number;
      afterRevision?: number;
    }
  | {
      type: 'ROTATE_PIECE';
      operationId?: string;
      pieceId: string;
      beforeRotation: number;
      afterRotation: number;
      beforeAnchorId?: string;
      afterAnchorId?: string;
      beforeJoints?: TimberJoint[];
      afterJoints?: TimberJoint[];
      removedJoints?: TimberJoint[];
      preservedJoints?: TimberJoint[];
      createdJoints?: TimberJoint[];
      beforeRevision?: number;
      afterRevision?: number;
    }
  | {
      type: 'DETACH_JOINT';
      operationId?: string;
      pieceId: string;
      removedJoints: TimberJoint[];
      beforeRevision?: number;
      afterRevision?: number;
    }
  | {
      type: 'BIND_JOINT';
      operationId?: string;
      pieceId: string;
      createdJoints: TimberJoint[];
      beforeRevision?: number;
      afterRevision?: number;
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
  proposedTimberJoints?: ProposedTimberJoint[];
  preservedJoints?: TimberJoint[];
  removedJoints?: TimberJoint[];
  suspendedJoints?: TimberJoint[];
  jointEditPreviewActive?: boolean;
  lowerSupportsDetected?: boolean;
  connectionTaxonomy?: ConnectionTaxonomyCategory;
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
  // Modular Construction, Corner Seat, Balanced Peak & Candidate Cycling Preview State
  candidateCycleIndex?: number;
  candidateCycleCount?: number;
  availableCandidateLabels?: string[];
  currentCandidateLabel?: string | null;
  balancedAdjustmentActive?: boolean;
  partnerPieceAdjustment?: PartnerPieceAdjustment | null;
  partnerPieceAdjustments?: PartnerPieceAdjustment[];
  roofSupportSummary?: RoofSupportDiagnosticSummary | null;
  peakSymmetryDiagnostics?: PeakSymmetryDiagnostics | null;
  sourceFeatureType?: 'socket' | 'face' | 'corner' | 'apex' | null;
  sourceFeatureId?: string | null;
  targetFeatureType?: 'socket' | 'face' | 'corner' | 'apex' | null;
  targetFeatureId?: string | null;
  seamSeparation?: number | null;
  candidateRankingBreakdown?: CandidateRankingBreakdown | null;
  // Forgiving Architectural Snap & Roof Assembly Closure State
  closureClassification?: ClosureClassification | null;
  canonicalRelationship?: CanonicalRelationshipDescription | null;
  roofAssemblyPreview?: RoofAssemblyPreview | null;
  visualConnectionState?: VisualConnectionState | null;
  visualJointCapType?: VisualJointCapType | null;
  playerFacingConnectionLabel?: string | null;
  freeAdjustActive?: boolean;
  fineAdjustmentOffsetPx?: Vector2 | null;
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
