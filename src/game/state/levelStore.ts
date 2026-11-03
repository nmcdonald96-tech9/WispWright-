/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildResultBandsForWispCount,
  createWispEntityFromDefinition,
  createWispsForConfiguration,
  GEOMETRY_SCHEMA_VERSION,
  getMinimumStableWispsForCompletion,
  getSelectedWispIdsForCount,
  INITIAL_LEVEL_STATE,
  LEVEL_1_CONFIG,
  MATERIAL_CONFIGS,
  PIECE_DEFINITIONS,
  resolveBindingStrengthProfile,
  resolveConnectionSubtype,
  resolveMaterialPairProfileId,
  TIMBER_JOINT_CONFIG,
  WISP_ROSTER_DEFINITIONS,
  WORLD_CONFIG,
} from '../config';
import {
  checkOBBOverlap,
  createOBB,
  getOBBFromPiece,
  getOBBPenetrationDepth,
  getPieceCorners,
  getPieceSnapSockets,
  Vec2,
} from '../math/geometry';
import {
  deriveStressFreeJointGeometryFromCommittedTransforms,
  getVisualJointCapType,
} from '../math/modularJointSolver';
import {
  checkPieceOverlapsWisps,
  evaluateWispProtectionAndRisks,
  getDefaultWispPosition,
  validateWispPlacementPosition,
  WispPlacementValidationResult,
} from '../math/wispPlacement';
import {
  buildTimberJointId,
  evaluateJointsForPieceTransform,
  findManualBindCandidatesForPiece,
  shortestSignedAngleDelta,
  validatePieceRotationTransaction,
} from '../math/snapSolver';
import {
  AuthoritativeTutorialState,
  BullseyeInventoryStatus,
  BullseyeLogicalState,
  ConstructionAction,
  DeveloperWispOverrideDiagnostics,
  GameMode,
  GuidedTutorialStep,
  InventoryCategory,
  JointEditTransactionSnapshot,
  Level1Results,
  LevelConfiguration,
  LevelState,
  MaterialType,
  PartnerPieceAdjustment,
  PlacedPiece,
  ProposedTimberJoint,
  ResultBandDefinition,
  RotationValidationDiagnostics,
  SnapshotType,
  SnapshotWispMetadata,
  SuggestedPlacementRegion,
  TimberJoint,
  TimberJointType,
  TutorialChecklistState,
  TutorialHighlightTargetId,
  UnlockState,
  Vector2,
  WispDefinition,
  WispEntity,
  WispPlacementDiagnostics,
  WispPlacementPhase,
  WispPresenceDiagnostics,
} from '../types';

const STORAGE_KEY = 'alchemical_fortress_phase1_save_v1';
const META_STORAGE_KEY = 'alchemical_fortress_phase3_meta_v1';
const UNLOCK_STORAGE_KEY = 'alchemical_fortress_phase3_unlock_v1';

export const TUTORIAL_BULLSEYE_ID = 'bullseye_tutorial_1';

export interface SavedSessionMeta {
  savedPhase: GameMode;
  isReinforcementMode: boolean;
  deliveryGranted: boolean;
  deliveredInventory: Record<MaterialType, number>;
  deliveredPieceIds: string[];
  reinforcementMaterialsUsed: number;
  guaranteedDeliveryUsed: number;
  snapshots: Record<SnapshotType, LevelState | null>;
  lastResults: Level1Results | null;
  stabilityTestRun?: boolean;
  stabilityTestRestoredOrAccepted?: boolean;
  // Authoritative Tutorial & Revision Persistence
  currentConstructionRevision?: number;
  preTestRevisionId?: number | null;
  testedRevisionId?: number | null;
  stabilityPassedForRevisionId?: number | null;
  acceptedRevisionId?: number | null;
  guidanceSkipped?: boolean;
  tutorialSkippedByDeveloper?: boolean;
  completionPresented?: boolean;
  beginSiegeHighlightOnce?: boolean;
  unstableHint?: string | null;
  currentGuidedStep?: GuidedTutorialStep;
  wispPlacementPhase?: WispPlacementPhase;
  wispsRequiredBeforeSiege?: boolean;
  developerWispCountOverride?: number | null;
  activeAttemptId?: string;
  resetGeneration?: number;
  isAttemptCompleted?: boolean;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class LevelStore {
  private state: LevelState;
  private preTestSnapshot: LevelState | null = null;
  private snapshots: Record<SnapshotType, LevelState | null> = {
    LEVEL_TEMPLATE: deepClone(INITIAL_LEVEL_STATE),
    STABLE_BUILD: null,
    INITIAL_DESIGN: null,
    PRE_SIEGE_WISPS: null,
    POST_ATTACK_1: null,
    REINFORCEMENT_ENTRY: null,
    REINFORCEMENT_COMPLETE: null,
    FINAL_RESULT: null,
  };

  // Separate undo/redo stacks for initial construction vs reinforcement
  private undoStack: ConstructionAction[] = [];
  private redoStack: ConstructionAction[] = [];
  private reinforcementUndoStack: ConstructionAction[] = [];
  private reinforcementRedoStack: ConstructionAction[] = [];

  public isReinforcementMode = false;
  public savedPhase: GameMode = 'CONSTRUCTION';
  public wispPlacementPhase: WispPlacementPhase = 'STAGED_IN_BUILD';
  public wispsRequiredBeforeSiege = false;
  public lastRotationDiagnostics: RotationValidationDiagnostics | null = null;
  public lastDefaultSlotPlacementReport: {
    placedCount: number;
    unplacedWispIds: string[];
    unplacedWispNames: string[];
    message: string | null;
  } | null = null;
  public lastWispPlacementDiagnostics: WispPlacementDiagnostics | null = null;
  public developerWispCountOverride: number | null = null;
  public activeAttemptId: string = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  public resetGeneration: number = 1;
  public isAttemptCompleted: boolean = false;

  // Guaranteed Mentor Delivery tracking
  public deliveryGranted = false;
  public deliveredInventory: Record<MaterialType, number> = {
    wood_beam: 0,
    wood_block: 0,
    stone_block: 0,
    bullseye_block: 0,
  };
  public deliveredPieceIds: string[] = [];
  public reinforcementMaterialsUsed = 0;
  public guaranteedDeliveryUsed = 0;
  public lastResults: Level1Results | null = null;

  // Phase 5 Bullseye conflict diagnostic
  public bullseyeConflictDiagnostic: string | null = null;

  // Level 1 Authoritative Tutorial & Construction Revision state
  public stabilityTestRun = false;
  public stabilityTestRestoredOrAccepted = false;
  public currentConstructionRevision = 1;
  public preTestRevisionId: number | null = null;
  public testedRevisionId: number | null = null;
  public stabilityPassedForRevisionId: number | null = null;
  public acceptedRevisionId: number | null = null;
  public guidanceSkipped = false;
  public tutorialSkippedByDeveloper = false;
  public completionPresented = false;
  public beginSiegeHighlightOnce = false;
  public unstableHint: string | null = null;
  public beamSelectedInInventory = false;
  public activeDragPieceType: MaterialType | null = null;
  public snappingEnabledForTutorial = true;
  public lastChecklistRecomputationReason = 'INITIAL_LOAD';
  public lastTutorialTransition = 'NONE -> STEP_1_SELECT_BEAM';
  private previousGuidedStep: GuidedTutorialStep = 'STEP_1_SELECT_BEAM';

  // Tutorial & Sample Unlock state
  public unlockState: UnlockState = {
    tutorialCompleted: false,
    reinforcementReserveUnlocked: false,
    unlockPresentedOnce: false,
  };

  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadFromStorage();
    this.loadUnlockState();
    this.loadSessionMeta();
    this.state = this.migratePersistedLevelState(this.state);
    this.normalizeBuildPhaseWisps();
    this.validatePersistedTutorialAgainstDesign();
    this.recomputeAllWispProtection();
    this.state.snapshotMetadata = this.buildSnapshotWispMetadata(this.state);
    if (this.snapshots.LEVEL_TEMPLATE) {
      this.snapshots.LEVEL_TEMPLATE = this.migratePersistedLevelState(this.snapshots.LEVEL_TEMPLATE);
    }
    // Authoritative Startup / Recovery Precedence:
    // If the persisted session ended in RESULTS / SEQUENCE_COMPLETE / UNLOCK_PRESENTATION,
    // or if the attempt was completed, subsequent application launch begins from the
    // authoritative fresh Level 1 template in BUILD phase without damaged structure.
    if (
      this.isAttemptCompleted ||
      this.savedPhase === 'RESULTS' ||
      this.savedPhase === 'SEQUENCE_COMPLETE' ||
      this.savedPhase === 'UNLOCK_PRESENTATION'
    ) {
      this.resetLevel();
    }
  }

  public getLevelConfiguration(): LevelConfiguration {
    const activeCount = this.getRequiredWispCount(this.state);
    const selectedIds =
      this.developerWispCountOverride !== null
        ? getSelectedWispIdsForCount(activeCount)
        : [...LEVEL_1_CONFIG.selectedWispIds];
    return {
      ...LEVEL_1_CONFIG,
      requiredWispCount: activeCount,
      selectedWispIds: selectedIds,
      minimumStableWispsForCompletion: getMinimumStableWispsForCompletion(activeCount),
      resultBands: buildResultBandsForWispCount(activeCount),
    };
  }

  public getRequiredWispCount(customState?: LevelState): number {
    const target = customState ?? this.state;
    if (
      typeof target?.developerWispCountOverride === 'number' &&
      target.developerWispCountOverride >= 1 &&
      target.developerWispCountOverride <= 5
    ) {
      return target.developerWispCountOverride;
    }
    if (
      typeof this.developerWispCountOverride === 'number' &&
      this.developerWispCountOverride >= 1 &&
      this.developerWispCountOverride <= 5
    ) {
      return this.developerWispCountOverride;
    }
    if (typeof target?.requiredWispCount === 'number' && target.requiredWispCount >= 1) {
      return target.requiredWispCount;
    }
    return LEVEL_1_CONFIG.requiredWispCount;
  }

  public getMinimumStableWispsForCompletion(customState?: LevelState): number {
    const target = customState ?? this.state;
    const count = this.getRequiredWispCount(target);
    return target?.minimumStableWispsForCompletion ?? getMinimumStableWispsForCompletion(count);
  }

  public getResultBands(customState?: LevelState): ResultBandDefinition[] {
    const target = customState ?? this.state;
    const count = this.getRequiredWispCount(target);
    if (target?.resultBands && target.resultBands.length > 0) {
      return target.resultBands;
    }
    return buildResultBandsForWispCount(count);
  }

  public getActiveWispDefinitions(customState?: LevelState): WispDefinition[] {
    const target = customState ?? this.state;
    return target.wisps.map((w) => {
      const rosterDef = WISP_ROSTER_DEFINITIONS.find((d) => d.id === w.id);
      if (rosterDef) return { ...rosterDef };
      return {
        id: w.id,
        name: w.name,
        title: w.title,
        element: w.element,
        personality: w.personality ?? 'Calm',
        tendency: w.tendency ?? 'CURIOUS',
        isHero: Boolean(w.isHero),
        silhouetteType: w.silhouetteType ?? 'FLAME_CROWN',
        crestShape: w.crestShape ?? 'CROWN_CREST',
        armorShape: w.armorShape ?? 'EMBER_MANTLE',
        idleSpeed: w.idleSpeed ?? 1.0,
        idlePhaseOffset: w.idlePhaseOffset ?? 0,
        radius: w.radius,
        color: w.color,
        glowColor: w.glowColor,
        expression: w.expression,
        defaultPosition: { ...(w.defaultPosition ?? w.position) },
      };
    });
  }

  public buildSnapshotWispMetadata(customState?: LevelState): SnapshotWispMetadata {
    const target = customState ?? this.state;
    const requiredCount = this.getRequiredWispCount(target);
    const activeWispIds = target.wisps.map((w) => w.id);
    const committedWispPositions: Record<string, Vector2> = {};
    for (const w of target.wisps) {
      if (w.placed === true) {
        committedWispPositions[w.id] = { ...w.position };
      }
    }
    return {
      levelId: target.levelId,
      requiredWispCount: requiredCount,
      activeWispIds,
      activeWispDefinitions: this.getActiveWispDefinitions(target),
      committedWispPositions,
      wispStates: target.wisps.map((w) => ({
        id: w.id,
        placed: w.placed === true,
        isValid: w.isValid === true,
        isDispersed: w.isDispersed === true,
        position: { ...w.position },
      })),
      totalActiveWispCount: target.wisps.length,
      currentPlacedWispCount: target.wisps.filter((w) => w.placed === true).length,
      resultBands: this.getResultBands(target).map((b) => ({ ...b })),
      minimumStableWispsForCompletion: this.getMinimumStableWispsForCompletion(target),
      developerWispCountOverride:
        target.developerWispCountOverride ?? this.developerWispCountOverride ?? null,
    };
  }

  public setDeveloperWispCountOverride(count: 1 | 2 | 3 | 4 | 5 | null): void {
    const validOverride =
      typeof count === 'number' && count >= 1 && count <= 5 ? Math.round(count) : null;
    this.developerWispCountOverride = validOverride;
    const activeCount = validOverride ?? LEVEL_1_CONFIG.requiredWispCount;
    const selectedIds =
      validOverride !== null
        ? getSelectedWispIdsForCount(activeCount)
        : [...LEVEL_1_CONFIG.selectedWispIds];

    const existingById = new Map<string, WispEntity>();
    for (const w of this.state.wisps) {
      if (!existingById.has(w.id)) {
        existingById.set(w.id, deepClone(w));
      }
    }

    const nextWisps: WispEntity[] = [];
    for (const id of selectedIds) {
      const def = WISP_ROSTER_DEFINITIONS.find((d) => d.id === id);
      const existing = existingById.get(id);
      if (existing && def) {
        nextWisps.push({
          ...createWispEntityFromDefinition(def),
          ...existing,
          defaultPosition: { ...(existing.defaultPosition ?? def.defaultPosition) },
        });
      } else if (def) {
        nextWisps.push(createWispEntityFromDefinition(def));
      }
    }

    this.state.wisps = nextWisps;
    this.state.requiredWispCount = activeCount;
    this.state.activeWispIds = [...selectedIds];
    this.state.minimumStableWispsForCompletion = getMinimumStableWispsForCompletion(activeCount);
    this.state.resultBands = buildResultBandsForWispCount(activeCount);
    this.state.developerWispCountOverride = validOverride;

    this.normalizeBuildPhaseWisps();
    this.recomputeAllWispProtection();
    this.state.snapshotMetadata = this.buildSnapshotWispMetadata(this.state);

    // Keep LEVEL_TEMPLATE and active design snapshots synchronized with the active wisp count
    const templateClone = deepClone(INITIAL_LEVEL_STATE);
    templateClone.wisps = createWispsForConfiguration(selectedIds);
    templateClone.requiredWispCount = activeCount;
    templateClone.activeWispIds = [...selectedIds];
    templateClone.minimumStableWispsForCompletion = getMinimumStableWispsForCompletion(activeCount);
    templateClone.resultBands = buildResultBandsForWispCount(activeCount);
    templateClone.developerWispCountOverride = validOverride;
    templateClone.snapshotMetadata = this.buildSnapshotWispMetadata(templateClone);
    this.snapshots.LEVEL_TEMPLATE = templateClone;

    if (this.snapshots.STABLE_BUILD) {
      this.snapshots.STABLE_BUILD = this.migratePersistedLevelState(this.snapshots.STABLE_BUILD);
    }
    if (this.snapshots.INITIAL_DESIGN) {
      this.snapshots.INITIAL_DESIGN = this.migratePersistedLevelState(this.snapshots.INITIAL_DESIGN);
    }
    if (this.snapshots.PRE_SIEGE_WISPS) {
      this.snapshots.PRE_SIEGE_WISPS = this.migratePersistedLevelState(this.snapshots.PRE_SIEGE_WISPS);
    }

    this.notify();
  }

  public getDeveloperWispOverrideDiagnostics(): DeveloperWispOverrideDiagnostics {
    const activeCount = this.getRequiredWispCount(this.state);
    const placedCount = this.state.wisps.filter((w) => w.placed === true && !w.isDispersed).length;
    const stagingCount = this.state.wisps.filter((w) => w.placed !== true).length;
    return {
      configuredLevelRequiredWispCount: LEVEL_1_CONFIG.requiredWispCount,
      developerWispCountOverride: this.developerWispCountOverride,
      activeRequiredWispCount: activeCount,
      activeWispIds: this.state.wisps.map((w) => w.id),
      placedWispCount: placedCount,
      stagingWispCount: stagingCount,
      minimumStableWispsForCompletion: this.getMinimumStableWispsForCompletion(this.state),
      resultBands: this.getResultBands(this.state).map((b) => ({ ...b })),
    };
  }

  public lastGeometryMigrationDiagnostics: {
    migratedFromGeometrySchema: number;
    migratedToGeometrySchema: number;
    preservedPieceCount: number;
    preservedJointCount: number;
    invalidMigratedJointCount: number;
    removedJointIds: string[];
    result: 'CURRENT' | 'MIGRATED_CLEAN' | 'MIGRATED_WITH_JOINT_CLEANUP';
  } = {
    migratedFromGeometrySchema: GEOMETRY_SCHEMA_VERSION,
    migratedToGeometrySchema: GEOMETRY_SCHEMA_VERSION,
    preservedPieceCount: INITIAL_LEVEL_STATE.pieces.length,
    preservedJointCount: 0,
    invalidMigratedJointCount: 0,
    removedJointIds: [],
    result: 'CURRENT',
  };

  public migratePersistedLevelState(rawState: LevelState): LevelState {
    const state = deepClone(rawState);
    const fromGeometrySchema =
      typeof state.geometrySchemaVersion === 'number'
        ? state.geometrySchemaVersion
        : 1;

    const overrideCount =
      typeof state.developerWispCountOverride === 'number' &&
      state.developerWispCountOverride >= 1 &&
      state.developerWispCountOverride <= 5
        ? state.developerWispCountOverride
        : this.developerWispCountOverride;
    const targetCount = overrideCount ?? LEVEL_1_CONFIG.requiredWispCount;
    const targetIds =
      overrideCount !== null
        ? getSelectedWispIdsForCount(targetCount)
        : [...LEVEL_1_CONFIG.selectedWispIds];

    const existingMap = new Map<string, WispEntity>();
    if (Array.isArray(state.wisps)) {
      for (const w of state.wisps) {
        if (w && typeof w.id === 'string' && !existingMap.has(w.id)) {
          existingMap.set(w.id, w);
        }
      }
    }

    const migratedWisps: WispEntity[] = [];
    for (const id of targetIds) {
      const def = WISP_ROSTER_DEFINITIONS.find((d) => d.id === id);
      if (!def) continue;
      const baseEntity = createWispEntityFromDefinition(def);
      const oldWisp = existingMap.get(id);
      if (oldWisp) {
        const merged: WispEntity = {
          ...baseEntity,
          position: oldWisp.position ? { ...oldWisp.position } : { ...def.defaultPosition },
          defaultPosition: { ...def.defaultPosition },
          placed: Boolean(oldWisp.placed),
          isValid: Boolean(oldWisp.isValid),
          isDispersed: Boolean(oldWisp.isDispersed),
          dispersalTime: oldWisp.dispersalTime,
        };
        migratedWisps.push(merged);
      } else {
        migratedWisps.push(baseEntity);
      }
    }

    // Recompute OBBs and revalidate existing joints if migrating from legacy geometry (< 3)
    const removedJointIds: string[] = [];
    if (fromGeometrySchema < GEOMETRY_SCHEMA_VERSION) {
      // Recompute OBBs and revalidate existing joints under new 144x24 beam / 48x48 block geometry
      if (Array.isArray(state.joints) && state.joints.length > 0) {
        const validJoints: TimberJoint[] = [];
        for (const j of state.joints) {
          if (!j || j.state === 'BROKEN') {
            if (j) validJoints.push(j);
            continue;
          }
          const pieceA = state.pieces.find(
            (p) => p.id === j.pieceAId && p.condition !== 'LOST' && p.condition !== 'BROKEN',
          );
          const pieceB = state.pieces.find(
            (p) => p.id === j.pieceBId && p.condition !== 'LOST' && p.condition !== 'BROKEN',
          );
          if (!pieceA || !pieceB) {
            if (j?.jointId) removedJointIds.push(j.jointId);
            continue;
          }

          const obbA = getOBBFromPiece(pieceA);
          const obbB = getOBBFromPiece(pieceB);
          const pen = getOBBPenetrationDepth(obbA, obbB, 2.5);
          if (pen > 4.0) {
            // Severe interior body overlap after geometry migration -> remove invalid joint while preserving both pieces
            removedJointIds.push(j.jointId);
            continue;
          }

          const socksA = getPieceSnapSockets(pieceA);
          const socksB = getPieceSnapSockets(pieceB);
          const cornersA = getPieceCorners(pieceA);
          const cornersB = getPieceCorners(pieceB);

          const sockA = socksA.find(
            (s) => s.id === j.socketAId || (s.localName && j.socketAId.endsWith(s.localName)),
          );
          const sockB = socksB.find(
            (s) => s.id === j.socketBId || (s.localName && j.socketBId.endsWith(s.localName)),
          );

          let minDist =
            sockA && sockB ? Vec2.distance(sockA.worldPos, sockB.worldPos) : Infinity;
          for (const ca of cornersA) {
            for (const cb of cornersB) {
              const d = Vec2.distance(ca.worldPos, cb.worldPos);
              if (d < minDist) minDist = d;
            }
            if (sockB) {
              const d = Vec2.distance(ca.worldPos, sockB.worldPos);
              if (d < minDist) minDist = d;
            }
          }
          if (sockA) {
            for (const cb of cornersB) {
              const d = Vec2.distance(sockA.worldPos, cb.worldPos);
              if (d < minDist) minDist = d;
            }
          }

          if (minDist <= TIMBER_JOINT_CONFIG.maxAngledSocketClearance + 8.0) {
            if (sockA?.localPos) j.localAnchorA = { ...sockA.localPos };
            if (sockB?.localPos) j.localAnchorB = { ...sockB.localPos };
            if (sockA && sockB) {
              j.worldPosition = Vec2.scale(Vec2.add(sockA.worldPos, sockB.worldPos), 0.5);
            }
            const derived = deriveStressFreeJointGeometryFromCommittedTransforms(j, pieceA, pieceB);
            if (sockA?.localPos) derived.localAnchorA = { ...sockA.localPos };
            if (sockB?.localPos) derived.localAnchorB = { ...sockB.localPos };
            validJoints.push(derived);
          } else {
            removedJointIds.push(j.jointId);
          }
        }
        state.joints = validJoints;
      }

      this.lastGeometryMigrationDiagnostics = {
        migratedFromGeometrySchema: fromGeometrySchema,
        migratedToGeometrySchema: GEOMETRY_SCHEMA_VERSION,
        preservedPieceCount: state.pieces.length,
        preservedJointCount: (state.joints ?? []).length,
        invalidMigratedJointCount: removedJointIds.length,
        removedJointIds,
        result:
          removedJointIds.length > 0 ? 'MIGRATED_WITH_JOINT_CLEANUP' : 'MIGRATED_CLEAN',
      };
    } else {
      if (Array.isArray(state.joints)) {
        state.joints = state.joints.map((j) => {
          const pieceA = state.pieces.find((p) => p.id === j.pieceAId);
          const pieceB = state.pieces.find((p) => p.id === j.pieceBId);
          if (pieceA && pieceB) {
            return deriveStressFreeJointGeometryFromCommittedTransforms(j, pieceA, pieceB);
          }
          return j;
        });
      }
      this.lastGeometryMigrationDiagnostics = {
        migratedFromGeometrySchema: fromGeometrySchema,
        migratedToGeometrySchema: GEOMETRY_SCHEMA_VERSION,
        preservedPieceCount: state.pieces.length,
        preservedJointCount: (state.joints ?? []).length,
        invalidMigratedJointCount: 0,
        removedJointIds: [],
        result: 'CURRENT',
      };
    }

    state.schemaVersion = INITIAL_LEVEL_STATE.schemaVersion;
    state.geometrySchemaVersion = GEOMETRY_SCHEMA_VERSION;
    state.wisps = migratedWisps;
    state.requiredWispCount = targetCount;
    state.activeWispIds = [...targetIds];
    state.minimumStableWispsForCompletion = getMinimumStableWispsForCompletion(targetCount);
    state.resultBands = buildResultBandsForWispCount(targetCount);
    state.developerWispCountOverride = overrideCount ?? null;

    // Validate placed wisps against existing pieces/terrain so migrated saves never keep invalid wisp overlaps
    for (const w of state.wisps) {
      if (w.placed === true) {
        const val = validateWispPlacementPosition(
          w.id,
          w.position,
          state.wisps,
          state.pieces,
          state.anchors,
        );
        if (!val.isValid) {
          w.placed = false;
          w.isValid = false;
          w.position = { ...(w.defaultPosition ?? getDefaultWispPosition(w.id)) };
          w.validationReason = val.rejectionCode;
        } else {
          w.isValid = true;
          w.validationReason = null;
        }
      }
    }

    state.snapshotMetadata = this.buildSnapshotWispMetadata(state);
    return state;
  }

  private normalizeBuildPhaseWisps(): void {
    const isBuildMode =
      this.savedPhase === 'CONSTRUCTION' ||
      this.savedPhase === 'INITIAL_CONSTRUCTION' ||
      this.savedPhase === 'TESTING_SIMULATION' ||
      this.savedPhase === 'SETTLED';
    if (
      isBuildMode ||
      this.wispPlacementPhase === 'STAGED_IN_BUILD' ||
      this.wispPlacementPhase === 'RESERVED_IN_BUILD'
    ) {
      if (
        this.savedPhase !== 'PLACE_WISPS' &&
        this.savedPhase !== 'PRE_SIEGE_REVIEW' &&
        !this.isReinforcementMode &&
        this.wispPlacementPhase !== 'LOCKED_FOR_SIEGE'
      ) {
        this.wispPlacementPhase = 'STAGED_IN_BUILD';
        for (const w of this.state.wisps) {
          w.placed = false;
          w.isValid = false;
          w.validationReason = null;
        }
      }
    }
  }

  public getState(): LevelState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.saveToStorage();
    this.saveSessionMeta();
    this.listeners.forEach((fn) => fn());
  }

  private incrementConstructionRevision(reason: string): void {
    if (!this.isReinforcementMode) {
      this.currentConstructionRevision++;
      this.unstableHint = null;
      this.beginSiegeHighlightOnce = false;
      this.lastChecklistRecomputationReason = reason;
    }
  }

  // --- Level 1 Authoritative Tutorial State & Checklist ---

  public isPieceInsideBuildZone(piece: PlacedPiece): boolean {
    const bz = WORLD_CONFIG.buildZone;
    return (
      piece.position.x >= bz.minX - 45 &&
      piece.position.x <= bz.maxX + 45 &&
      piece.position.y >= bz.minY - 45 &&
      piece.position.y <= WORLD_CONFIG.groundY + 20
    );
  }

  public getPlayerPlacedPieces(customState?: LevelState): PlacedPiece[] {
    const target = customState ?? this.state;
    return target.pieces.filter(
      (p) =>
        !p.isPrebuilt &&
        p.condition !== 'LOST' &&
        p.position.y < target.lossBoundaryY &&
        this.isPieceInsideBuildZone(p),
    );
  }

  private getPieceHalfExtents(piece: PlacedPiece): { hx: number; hy: number } {
    const cfg = MATERIAL_CONFIGS[piece.type];
    const cos = Math.abs(Math.cos(piece.rotation));
    const sin = Math.abs(Math.sin(piece.rotation));
    const hx = (cfg.width * cos + cfg.height * sin) / 2;
    const hy = (cfg.width * sin + cfg.height * cos) / 2;
    return { hx, hy };
  }

  private arePiecesInSupportContact(a: PlacedPiece, b: PlacedPiece): boolean {
    // Reject if pieces physically overlap
    const obbA = getOBBFromPiece(a);
    const obbB = getOBBFromPiece(b);
    if (checkOBBOverlap(obbA, obbB, 2.5)) {
      return false;
    }

    const extA = this.getPieceHalfExtents(a);
    const extB = this.getPieceHalfExtents(b);
    const dx = Math.abs(a.position.x - b.position.x) - (extA.hx + extB.hx);
    const dy = Math.abs(a.position.y - b.position.y) - (extA.hy + extB.hy);
    // Within 16px tolerance on both axes without overlap constitutes a snapped or supported contact
    return dx <= 16 && dy <= 16;
  }

  private computeSuggestedPlacementRegion(
    step: GuidedTutorialStep,
    playerPieces: PlacedPiece[],
  ): SuggestedPlacementRegion | null {
    if (step === 'STEP_1_SELECT_BEAM' || step === 'STEP_2_PLACE_BEAM') {
      return {
        id: 'region_western_roof_beam',
        pieceType: 'wood_beam',
        center: { x: 296, y: 672 },
        width: MATERIAL_CONFIGS.wood_beam.width,
        height: MATERIAL_CONFIGS.wood_beam.height,
        toleranceRadius: 96,
        label: 'Roof Span Support',
        supportPoints: [
          { x: 200, y: 684 },
          { x: 392, y: 732 },
          { x: 584, y: 684 },
        ],
      };
    }

    if (step === 'STEP_3_PLACE_BLOCK' || step === 'STEP_4_CREATE_SUPPORT') {
      // Find placed beam if one exists to suggest a safe support location near it that never overlaps wisps
      const beam = playerPieces.find((p) => p.type === 'wood_beam');
      const suggestedX = beam && beam.position.x >= 490 ? 632 : 152;
      const supportColX = beam && beam.position.x >= 490 ? 584 : 200;
      return {
        id: 'region_beam_support_block',
        pieceType: 'wood_block',
        center: { x: suggestedX, y: 756 },
        width: MATERIAL_CONFIGS.wood_block.width,
        height: MATERIAL_CONFIGS.wood_block.height,
        toleranceRadius: 85,
        label: 'Support Block Position',
        supportPoints: [
          { x: suggestedX, y: 780 },
          { x: supportColX, y: 756 },
          { x: supportColX, y: 684 },
        ],
      };
    }

    return null;
  }

  public getAuthoritativeTutorialState(customState?: LevelState): AuthoritativeTutorialState {
    const target = customState ?? this.state;
    const activePieces = target.pieces.filter(
      (p) => p.condition !== 'LOST' && p.position.y < target.lossBoundaryY,
    );
    const playerPieces = activePieces.filter(
      (p) => !p.isPrebuilt && this.isPieceInsideBuildZone(p),
    );

    // 1. BEAM PLACED: valid player-owned wooden beam in build zone
    const beamPlaced = playerPieces.some((p) => p.type === 'wood_beam');

    // 2. BLOCK PLACED: valid player-owned wooden or stone block in build zone (Bullseye Block does NOT satisfy this)
    const blockPlaced = playerPieces.some(
      (p) => p.type === 'wood_block' || p.type === 'stone_block',
    );

    // 3. SUPPORTED CONNECTION CREATED: valid non-overlapping snap, environmental anchor, or supported contact
    let supportedConnectionCreated = false;
    for (const p of playerPieces) {
      if (p.attachedAnchorId) {
        // Verify it doesn't overlap existing pieces
        const obbP = getOBBFromPiece(p);
        const overlapsAny = activePieces.some(
          (other) => other.id !== p.id && checkOBBOverlap(obbP, getOBBFromPiece(other), 2.5),
        );
        if (!overlapsAny) {
          supportedConnectionCreated = true;
          break;
        }
      }
      for (const other of activePieces) {
        if (other.id === p.id) continue;
        if (this.arePiecesInSupportContact(p, other)) {
          const extP = this.getPieceHalfExtents(p);
          const extOther = this.getPieceHalfExtents(other);
          const pGrounded = p.position.y + extP.hy >= 748 || Boolean(p.attachedAnchorId);
          const otherGrounded =
            other.isPrebuilt ||
            other.position.y + extOther.hy >= 748 ||
            Boolean(other.attachedAnchorId);
          if (pGrounded || otherGrounded) {
            supportedConnectionCreated = true;
            break;
          }
        }
      }
      if (supportedConnectionCreated) break;
    }

    // 4. STABILITY TEST PASSED & ACCEPTED FOR CURRENT REVISION
    const revisionMatchesPassed =
      this.stabilityPassedForRevisionId !== null &&
      this.stabilityPassedForRevisionId === this.currentConstructionRevision;

    const stabilityTestPassed =
      revisionMatchesPassed &&
      beamPlaced &&
      blockPlaced &&
      supportedConnectionCreated;

    const stableDesignAccepted =
      stabilityTestPassed &&
      this.acceptedRevisionId !== null &&
      this.acceptedRevisionId === this.currentConstructionRevision;

    const basicLessonComplete =
      beamPlaced &&
      blockPlaced &&
      supportedConnectionCreated &&
      stabilityTestPassed &&
      stableDesignAccepted;

    const siegeEligible = Boolean(
      basicLessonComplete || this.tutorialSkippedByDeveloper,
    );

    // 5. SEQUENTIAL GUIDED STEP (with out-of-order advancement to earliest incomplete requirement)
    let currentGuidedStep: GuidedTutorialStep = 'STEP_1_SELECT_BEAM';
    if (basicLessonComplete) {
      currentGuidedStep = 'COMPLETE';
    } else if (this.savedPhase === 'SETTLED') {
      currentGuidedStep = 'STEP_6_ACCEPT_OR_REVISE';
    } else if (this.savedPhase === 'TESTING_SIMULATION') {
      currentGuidedStep = 'STEP_5_TEST_STABILITY';
    } else if (!beamPlaced) {
      if (this.activeDragPieceType === 'wood_beam' || this.beamSelectedInInventory) {
        currentGuidedStep = 'STEP_2_PLACE_BEAM';
      } else {
        currentGuidedStep = 'STEP_1_SELECT_BEAM';
      }
    } else if (!blockPlaced) {
      currentGuidedStep = 'STEP_3_PLACE_BLOCK';
    } else if (!supportedConnectionCreated) {
      currentGuidedStep = 'STEP_4_CREATE_SUPPORT';
    } else if (!stabilityTestPassed) {
      currentGuidedStep = 'STEP_5_TEST_STABILITY';
    } else {
      currentGuidedStep = 'STEP_6_ACCEPT_OR_REVISE';
    }

    if (currentGuidedStep !== this.previousGuidedStep) {
      this.lastTutorialTransition = `${this.previousGuidedStep} -> ${currentGuidedStep}`;
      this.previousGuidedStep = currentGuidedStep;
    }

    // 6. Highlighted UI item & blocking reason
    let currentHighlightedItemId: TutorialHighlightTargetId = null;
    if (!this.guidanceSkipped) {
      switch (currentGuidedStep) {
        case 'STEP_1_SELECT_BEAM':
        case 'STEP_2_PLACE_BEAM':
          currentHighlightedItemId = 'wood_beam';
          break;
        case 'STEP_3_PLACE_BLOCK':
          currentHighlightedItemId = 'wood_block';
          break;
        case 'STEP_4_CREATE_SUPPORT':
          currentHighlightedItemId = this.snappingEnabledForTutorial ? 'wood_block' : 'snap_toggle';
          break;
        case 'STEP_5_TEST_STABILITY':
          currentHighlightedItemId = 'test_stability';
          break;
        case 'STEP_6_ACCEPT_OR_REVISE':
          currentHighlightedItemId = stabilityTestPassed ? 'accept_stable_design' : 'test_stability';
          break;
        case 'COMPLETE':
          currentHighlightedItemId = this.beginSiegeHighlightOnce ? 'begin_siege' : null;
          break;
      }
    } else if (this.beginSiegeHighlightOnce && basicLessonComplete) {
      currentHighlightedItemId = 'begin_siege';
    }

    let lastTutorialBlockingReason: string | null = null;
    if (!siegeEligible) {
      if (!beamPlaced) {
        lastTutorialBlockingReason = 'MISSING_BEAM: Place a Timber Beam inside the sanctuary.';
      } else if (!blockPlaced) {
        lastTutorialBlockingReason =
          'MISSING_BLOCK: Place a Wood Block or Cut Stone Block (Bullseye Block does not satisfy this step).';
      } else if (!supportedConnectionCreated) {
        lastTutorialBlockingReason =
          'MISSING_SUPPORT: Connect pieces to a bedrock anchor or supported column without overlapping.';
      } else if (!stabilityTestPassed) {
        if (
          this.stabilityPassedForRevisionId !== null &&
          this.stabilityPassedForRevisionId !== this.currentConstructionRevision
        ) {
          lastTutorialBlockingReason = `REVISION_STALE: Design modified (rev ${this.currentConstructionRevision} vs tested rev ${this.stabilityPassedForRevisionId}); re-run Test Stability.`;
        } else if (this.unstableHint) {
          lastTutorialBlockingReason = `UNSTABLE_DESIGN: ${this.unstableHint}`;
        } else {
          lastTutorialBlockingReason = 'UNTESTED_DESIGN: Run Test Stability to verify the shelter.';
        }
      } else if (!stableDesignAccepted) {
        lastTutorialBlockingReason = 'UNACCEPTED_DESIGN: Select Accept Stable Design to lock readiness.';
      }
    }

    const currentSuggestedPlacementRegion = this.guidanceSkipped
      ? null
      : this.computeSuggestedPlacementRegion(currentGuidedStep, playerPieces);

    return {
      tutorialStarted: true,
      beamPlaced,
      blockPlaced,
      supportedConnectionCreated,
      stabilityTestStarted: this.stabilityTestRun,
      stabilityTestPassed,
      stableDesignAccepted,
      basicLessonComplete,
      siegeEligible,
      currentGuidedStep,
      guidanceSkipped: this.guidanceSkipped,
      tutorialSkippedByDeveloper: this.tutorialSkippedByDeveloper,
      completionPresented: this.completionPresented,
      currentConstructionRevision: this.currentConstructionRevision,
      testedRevisionId: this.testedRevisionId,
      stabilityPassedForRevisionId: this.stabilityPassedForRevisionId,
      acceptedRevisionId: this.acceptedRevisionId,
      currentHighlightedItemId,
      currentSuggestedPlacementRegion,
      lastChecklistRecomputationReason: this.lastChecklistRecomputationReason,
      lastTutorialTransition: this.lastTutorialTransition,
      lastTutorialBlockingReason,
      beginSiegeHighlightOnce: this.beginSiegeHighlightOnce,
      unstableHint: this.unstableHint,
    };
  }

  public getTutorialChecklist(customState?: LevelState): TutorialChecklistState {
    const target = customState ?? this.state;
    const auth = this.getAuthoritativeTutorialState(target);
    const playerPieces = this.getPlayerPlacedPieces(target);

    const materialTypesSet = new Set<MaterialType>();
    for (const p of playerPieces) {
      materialTypesSet.add(p.type);
    }

    return {
      placedBeam: auth.beamPlaced,
      placedBlock: auth.blockPlaced,
      hasSupportedConnection: auth.supportedConnectionCreated,
      stabilityTested: auth.stabilityTestPassed && auth.stableDesignAccepted,
      stabilityTestRun: auth.stabilityTestStarted,
      stabilityTestRestoredOrAccepted: auth.stableDesignAccepted,
      isComplete: auth.basicLessonComplete,
      playerPiecesPlacedCount: playerPieces.length,
      placedMaterialTypes: Array.from(materialTypesSet),
    };
  }

  public setGuidanceSkipped(skipped: boolean): void {
    this.guidanceSkipped = skipped;
    this.lastChecklistRecomputationReason = skipped ? 'GUIDANCE_SKIPPED' : 'GUIDANCE_RESUMED';
    this.notify();
  }

  public setTutorialSkippedByDeveloper(skipped: boolean): void {
    this.tutorialSkippedByDeveloper = skipped;
    this.lastChecklistRecomputationReason = skipped ? 'DEV_BYPASS_ON' : 'DEV_BYPASS_OFF';
    this.notify();
  }

  public setActiveDragTutorialContext(
    pieceType: MaterialType | null,
    snappingEnabled = true,
  ): void {
    const changed =
      this.activeDragPieceType !== pieceType ||
      this.snappingEnabledForTutorial !== snappingEnabled ||
      (pieceType === 'wood_beam' && !this.beamSelectedInInventory);
    this.activeDragPieceType = pieceType;
    this.snappingEnabledForTutorial = snappingEnabled;
    if (pieceType === 'wood_beam') {
      this.beamSelectedInInventory = true;
    }
    if (changed) {
      this.lastChecklistRecomputationReason = pieceType
        ? `DRAG_START_${pieceType.toUpperCase()}`
        : 'DRAG_END';
      this.listeners.forEach((fn) => fn());
    }
  }

  public recordStabilityTestStarted(): void {
    this.stabilityTestRun = true;
    this.testedRevisionId = this.currentConstructionRevision;
    this.unstableHint = null;
    this.lastChecklistRecomputationReason = `STABILITY_TEST_STARTED_REV_${this.currentConstructionRevision}`;
    this.notify();
  }

  public recordStabilityTestPassed(): void {
    const auth = this.getAuthoritativeTutorialState();
    this.stabilityTestRun = true;
    this.testedRevisionId = this.currentConstructionRevision;
    if (auth.beamPlaced && auth.blockPlaced && auth.supportedConnectionCreated) {
      // Set exactly once per valid tested design revision
      this.stabilityPassedForRevisionId = this.currentConstructionRevision;
      this.unstableHint = null;
      this.lastChecklistRecomputationReason = `STABILITY_TEST_PASSED_REV_${this.currentConstructionRevision}`;
    } else {
      this.stabilityPassedForRevisionId = null;
      this.lastChecklistRecomputationReason = `STABILITY_SETTLED_INCOMPLETE_LESSON_REV_${this.currentConstructionRevision}`;
    }
    this.notify();
  }

  public recordStabilityTestFailed(hint?: string): void {
    this.stabilityTestRun = true;
    this.testedRevisionId = this.currentConstructionRevision;
    this.stabilityPassedForRevisionId = null;
    this.acceptedRevisionId = null;
    this.stabilityTestRestoredOrAccepted = false;
    this.unstableHint =
      hint ||
      'An unsupported piece shifted or fell under gravity. Brace overhanging spans on columns or bedrock.';
    this.lastChecklistRecomputationReason = `STABILITY_TEST_FAILED_REV_${this.currentConstructionRevision}`;
    this.notify();
  }

  public acceptStableDesign(): boolean {
    // Ensure the current revision passed stability (or if called right after recordStabilityTestPassed)
    if (this.stabilityPassedForRevisionId !== this.currentConstructionRevision) {
      const auth = this.getAuthoritativeTutorialState();
      if (auth.beamPlaced && auth.blockPlaced && auth.supportedConnectionCreated && this.stabilityTestRun) {
        this.stabilityPassedForRevisionId = this.currentConstructionRevision;
      } else {
        return false;
      }
    }
    this.acceptedRevisionId = this.currentConstructionRevision;
    this.stabilityTestRestoredOrAccepted = true;
    this.completionPresented = true;
    this.beginSiegeHighlightOnce = true;
    this.unstableHint = null;
    this.lastChecklistRecomputationReason = `STABLE_DESIGN_ACCEPTED_REV_${this.currentConstructionRevision}`;
    this.saveNamedSnapshot('STABLE_BUILD');
    this.notify();
    return true;
  }

  public recordStabilityTestRestoredOrAccepted(): void {
    if (this.stabilityTestRun) {
      const auth = this.getAuthoritativeTutorialState();
      if (auth.beamPlaced && auth.blockPlaced && auth.supportedConnectionCreated) {
        this.stabilityPassedForRevisionId = this.currentConstructionRevision;
        this.acceptedRevisionId = this.currentConstructionRevision;
        this.stabilityTestRestoredOrAccepted = true;
        this.completionPresented = true;
        this.beginSiegeHighlightOnce = true;
        this.saveNamedSnapshot('STABLE_BUILD');
      }
      this.lastChecklistRecomputationReason = `STABILITY_TEST_ACCEPTED_REV_${this.currentConstructionRevision}`;
      this.notify();
    }
  }

  public clearBeginSiegeHighlight(): void {
    if (this.beginSiegeHighlightOnce) {
      this.beginSiegeHighlightOnce = false;
      this.notify();
    }
  }

  private validatePersistedTutorialAgainstDesign(): void {
    const auth = this.getAuthoritativeTutorialState();
    if (!auth.beamPlaced || !auth.blockPlaced || !auth.supportedConnectionCreated) {
      this.stabilityPassedForRevisionId = null;
      this.acceptedRevisionId = null;
      this.stabilityTestRestoredOrAccepted = false;
    }
    this.lastChecklistRecomputationReason = 'RELOAD_VALIDATION';
  }

  // --- Phase 5 Bullseye Logical State ---

  public getPlacedBullseyePiece(): PlacedPiece | null {
    return this.state.pieces.find((p) => p.type === 'bullseye_block') || null;
  }

  public getBullseyeLogicalState(
    reachableByCurrentAttacker = true,
    validTrajectoryCount = 0,
    overrideCancellationReason: string | null = null,
  ): BullseyeLogicalState {
    const piece = this.getPlacedBullseyePiece();
    if (!piece) {
      return {
        pieceId: TUTORIAL_BULLSEYE_ID,
        materialType: 'bullseye_block',
        inventoryStatus: 'IN_RESERVE',
        condition: 'INTACT',
        position: null,
        rotation: 0,
        isPrebuilt: false,
        active: false,
        triggered: false,
        expired: false,
        reachableByCurrentAttacker: false,
        validTrajectoryCount: 0,
        consumedByAttackId: null,
        overrideCancellationReason: overrideCancellationReason ?? 'BULLSEYE_IN_RESERVE',
        conflictDiagnostic: this.bullseyeConflictDiagnostic,
      };
    }

    const cond = piece.condition || 'INTACT';
    const isBrokenOrLost =
      cond === 'BROKEN' || cond === 'LOST' || piece.position.y >= this.state.lossBoundaryY;
    const expired = Boolean(piece.bullseyeExpired);
    const triggered = Boolean(piece.bullseyeTriggered);
    const active = !isBrokenOrLost && !expired && piece.bullseyeActive !== false;

    let inventoryStatus: BullseyeInventoryStatus = 'PLACED_ACTIVE';
    if (cond === 'LOST' || piece.position.y >= this.state.lossBoundaryY) {
      inventoryStatus = 'LOST_UNAVAILABLE';
    } else if (cond === 'BROKEN') {
      inventoryStatus = 'BROKEN_DEBRIS';
    } else if (expired) {
      inventoryStatus = 'PLACED_EXPIRED';
    } else if (triggered) {
      inventoryStatus = 'PLACED_TRIGGERED';
    } else if (!reachableByCurrentAttacker) {
      inventoryStatus = 'PLACED_UNREACHABLE';
    } else {
      inventoryStatus = 'PLACED_ACTIVE';
    }

    return {
      pieceId: piece.id,
      materialType: 'bullseye_block',
      inventoryStatus,
      condition: cond,
      position: { ...piece.position },
      rotation: piece.rotation,
      isPrebuilt: piece.isPrebuilt,
      active,
      triggered,
      expired,
      reachableByCurrentAttacker: active ? reachableByCurrentAttacker : false,
      validTrajectoryCount: active ? validTrajectoryCount : 0,
      consumedByAttackId: piece.consumedByAttackId ?? null,
      overrideCancellationReason:
        overrideCancellationReason ?? piece.overrideCancellationReason ?? null,
      conflictDiagnostic: this.bullseyeConflictDiagnostic,
    };
  }

  // --- Piece Eligibility & Inventory Categorization ---

  public getPieceCategory(piece: PlacedPiece): InventoryCategory {
    if (piece.condition === 'LOST' || piece.position.y >= this.state.lossBoundaryY) {
      return 'LOST';
    }
    if (piece.condition === 'BROKEN') {
      return 'BROKEN_DEBRIS';
    }
    if (piece.isPrebuilt) {
      return piece.ownership === 'PREBUILT_MOVABLE' ? 'PREBUILT_MOVABLE' : 'PREBUILT_FIXED';
    }
    if (piece.condition === 'CRACKED') {
      return 'PLACED_CRACKED';
    }
    if (piece.source === 'GUARANTEED_DELIVERY' || piece.ownership === 'GUARANTEED_DELIVERY') {
      return 'GUARANTEED_DELIVERY';
    }
    return 'PLACED_INTACT';
  }

  public getInventoryCategoryCounts(): Record<InventoryCategory, number> {
    const counts: Record<InventoryCategory, number> = {
      STARTING_RESERVE:
        (this.state.inventory.wood_beam || 0) +
        (this.state.inventory.wood_block || 0) +
        (this.state.inventory.stone_block || 0),
      PLACED_INTACT: 0,
      PLACED_CRACKED: 0,
      BROKEN_DEBRIS: 0,
      LOST: 0,
      GUARANTEED_DELIVERY:
        (this.deliveredInventory.wood_beam || 0) +
        (this.deliveredInventory.wood_block || 0) +
        (this.deliveredInventory.stone_block || 0),
      PREBUILT_FIXED: 0,
      PREBUILT_MOVABLE: 0,
    };

    for (const piece of this.state.pieces) {
      const cat = this.getPieceCategory(piece);
      if (cat === 'GUARANTEED_DELIVERY') {
        counts.PLACED_INTACT++;
        counts.GUARANTEED_DELIVERY++;
      } else {
        counts[cat]++;
      }
    }
    return counts;
  }

  public canManipulatePiece(piece: PlacedPiece): {
    canMove: boolean;
    canRotate: boolean;
    canRemoveToInventory: boolean;
    reason?: string;
  } {
    if (
      !this.isReinforcementMode &&
      (this.savedPhase === 'PLACE_WISPS' ||
        this.savedPhase === 'PRE_SIEGE_REVIEW' ||
        this.wispPlacementPhase === 'PLACE_WISPS' ||
        this.wispPlacementPhase === 'PRE_SIEGE_REVIEW')
    ) {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Construction pieces are locked during wisp placement. Tap Return to Build to edit your fortress.',
      };
    }
    if (piece.isPrebuilt && piece.ownership !== 'PREBUILT_MOVABLE') {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Ancient prebuilt foundation stone cannot be moved',
      };
    }
    if (piece.condition === 'LOST' || piece.position.y >= this.state.lossBoundaryY) {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Lost piece is outside the recoverable battlefield',
      };
    }
    if (piece.condition === 'BROKEN') {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: '⚡ Broken Debris: Cannot be reused, snapped, or returned to inventory',
      };
    }
    if (this.isReinforcementMode && piece.condition === 'CRACKED') {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: '⚠️ Cracked Piece: Weakened structure is locked in place during reinforcement',
      };
    }

    // Check battlefield bounds for recovery
    if (
      piece.position.x < this.state.worldBounds.minX ||
      piece.position.x > this.state.worldBounds.maxX
    ) {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Piece fell outside recoverable bounds',
      };
    }

    // Expired Bullseye Block remains a normal intact stone block on the battlefield (can be moved/rotated if intact, but cannot be returned to reserve to reactivate its Taunt)
    if (piece.type === 'bullseye_block' && piece.bullseyeExpired) {
      return {
        canMove: true,
        canRotate: true,
        canRemoveToInventory: false,
        reason: 'Expired Bullseye Block: Taunt already spent; acts as normal stone block',
      };
    }

    return {
      canMove: true,
      canRotate: true,
      canRemoveToInventory: true,
    };
  }

  // Total available reserve (starting reserve + delivered reserve)
  public getAvailableCount(type: MaterialType): number {
    return this.state.inventory[type] || 0;
  }

  public getTotalReserveCount(): number {
    return (
      (this.state.inventory.wood_beam || 0) +
      (this.state.inventory.wood_block || 0) +
      (this.state.inventory.stone_block || 0)
    );
  }

  // --- Guaranteed Mentor Delivery ---

  public grantGuaranteedDelivery(): boolean {
    if (this.deliveryGranted) {
      return false; // Already granted — strictly idempotent, never duplicates
    }
    this.deliveryGranted = true;
    this.deliveredInventory.wood_beam += 1;
    this.deliveredInventory.stone_block += 1;

    // Also add directly to active usable inventory so InventoryTray displays and allows dragging seamlessly
    this.state.inventory.wood_beam = (this.state.inventory.wood_beam || 0) + 1;
    this.state.inventory.stone_block = (this.state.inventory.stone_block || 0) + 1;

    // Update REINFORCEMENT_ENTRY snapshot so reload during reinforcement preserves delivered items without re-triggering
    this.snapshots.REINFORCEMENT_ENTRY = deepClone(this.state);

    this.notify();
    return true;
  }

  // --- Authoritative Mutations ---

  public setReinforcementMode(active: boolean): void {
    this.isReinforcementMode = active;
    if (active) {
      this.reinforcementUndoStack = [];
      this.reinforcementRedoStack = [];
      this.wispPlacementPhase = 'LOCKED_FOR_SIEGE';
      if (this.savedPhase === 'PLACE_WISPS' || this.savedPhase === 'PRE_SIEGE_REVIEW') {
        this.savedPhase = 'REINFORCEMENT_ACTIVE';
      }
      if (this.state.wisps.every((w) => w.placed !== true)) {
        for (const w of this.state.wisps) {
          w.placed = true;
          w.isValid = true;
        }
      }
    }
    this.notify();
  }

  private getActiveUndoStack(): ConstructionAction[] {
    return this.isReinforcementMode ? this.reinforcementUndoStack : this.undoStack;
  }

  private getActiveRedoStack(): ConstructionAction[] {
    return this.isReinforcementMode ? this.reinforcementRedoStack : this.redoStack;
  }

  public activeJointEditTransaction: JointEditTransactionSnapshot | null = null;
  public lastJointEditOutcome: 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'ACTIVE' | 'IDLE' = 'IDLE';
  public lastHistoryOperationId: string | null = null;
  public lastJointRestoreReason: string | null = null;
  public snappingEnabled = true;
  private jointOperationSeq = 1;

  public seenConnectionHints: Record<
    | 'splice'
    | 'angled_face'
    | 'roof_peak'
    | 'roof_peak_unsupported'
    | 'diagonal_brace'
    | 'rafter_corner_seat'
    | 'timber_corner',
    boolean
  > = {
    splice: false,
    angled_face: false,
    roof_peak: false,
    roof_peak_unsupported: false,
    diagonal_brace: false,
    rafter_corner_seat: false,
    timber_corner: false,
  };
  public activeConnectionHint: { id: string; text: string } | null = null;

  public dismissConnectionHint(): void {
    if (this.activeConnectionHint) {
      this.activeConnectionHint = null;
      this.notify();
    }
  }

  private triggerConnectionDiscoveryHint(
    jointType: TimberJointType,
    lowerSupportsDetected?: boolean,
  ): void {
    if (jointType === 'RAFTER_CORNER_SEAT' && !this.seenConnectionHints.rafter_corner_seat) {
      this.seenConnectionHints.rafter_corner_seat = true;
      this.activeConnectionHint = {
        id: 'rafter_corner_seat',
        text: 'Rafters can seat cleanly on block corners.',
      };
    } else if (jointType === 'TIMBER_CORNER' && !this.seenConnectionHints.timber_corner) {
      this.seenConnectionHints.timber_corner = true;
      this.activeConnectionHint = {
        id: 'timber_corner',
        text: 'Vertical and horizontal beams can form a corner joint.',
      };
    } else if (jointType === 'ROOF_PEAK') {
      if (lowerSupportsDetected === false && !this.seenConnectionHints.roof_peak_unsupported) {
        this.seenConnectionHints.roof_peak_unsupported = true;
        this.activeConnectionHint = {
          id: 'roof_peak_unsupported',
          text: 'Support both lower rafter ends before testing stability.',
        };
      } else if (!this.seenConnectionHints.roof_peak) {
        this.seenConnectionHints.roof_peak = true;
        this.activeConnectionHint = {
          id: 'roof_peak',
          text: 'Both rafters meet at a shared peak.',
        };
      }
    } else if (
      (jointType === 'TIMBER_SPLICE' || jointType === 'BEAM_END_TO_BEAM_END') &&
      !this.seenConnectionHints.splice
    ) {
      this.seenConnectionHints.splice = true;
      this.activeConnectionHint = {
        id: 'splice',
        text: 'Timber Splice: Beams can connect end-to-end, but wide spans still need support.',
      };
    } else if (jointType === 'TIMBER_FACE' && !this.seenConnectionHints.angled_face) {
      this.seenConnectionHints.angled_face = true;
      this.activeConnectionHint = {
        id: 'angled_face',
        text: 'Timber Face Joint: Angled beams can rest flush against timber faces.',
      };
    } else if (jointType === 'DIAGONAL_BRACE' && !this.seenConnectionHints.diagonal_brace) {
      this.seenConnectionHints.diagonal_brace = true;
      this.activeConnectionHint = {
        id: 'diagonal_brace',
        text: 'Diagonal Brace: Diagonal braces help frames resist sideways impact.',
      };
    }
  }

  public beginJointEditTransaction(pieceId: string): JointEditTransactionSnapshot | null {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return null;
    const affectedJoints = deepClone(this.getJointsForPiece(pieceId, false));
    const allJointsAtStart = deepClone(this.getJoints());
    const socketPairs = affectedJoints.map((j) => ({
      jointId: j.jointId,
      socketAId: j.socketAId,
      socketBId: j.socketBId,
    }));
    const strengthProfiles: Record<string, string> = {};
    const neighborSet = new Set<string>();
    for (const j of affectedJoints) {
      strengthProfiles[j.jointId] = j.strengthProfile;
      neighborSet.add(j.pieceAId === pieceId ? j.pieceBId : j.pieceAId);
    }

    const partnerPieceTransforms: Record<string, { position: Vector2; rotation: number }> = {};
    for (const p of this.state.pieces) {
      if (p.id !== pieceId) {
        partnerPieceTransforms[p.id] = {
          position: { ...p.position },
          rotation: p.rotation,
        };
      }
    }

    const opId = `jedit_op_${this.jointOperationSeq++}`;
    this.activeJointEditTransaction = {
      operationId: opId,
      pieceId,
      startTransform: {
        position: { ...piece.position },
        rotation: piece.rotation,
        preferredRotation: piece.preferredRotation ?? piece.rotation,
        rotationSource: piece.rotationSource ?? 'DEFAULT',
        manualRotationRevision: piece.manualRotationRevision ?? 0,
        attachedAnchorId: piece.attachedAnchorId,
      },
      partnerPieceTransforms,
      pieceCondition: piece.condition ?? 'INTACT',
      affectedJoints,
      allJointsAtStart,
      socketPairs,
      strengthProfiles,
      neighborPieceIds: Array.from(neighborSet),
      constructionRevision: this.currentConstructionRevision,
      inventorySnapshot: { ...this.state.inventory },
      startedAt: Date.now(),
    };
    this.lastJointEditOutcome = 'ACTIVE';
    this.lastJointRestoreReason = null;
    return this.activeJointEditTransaction;
  }

  public cancelJointEditTransaction(reason = 'USER_CANCELED'): boolean {
    const tx = this.activeJointEditTransaction;
    if (!tx) {
      this.lastJointEditOutcome = 'CANCELED';
      this.lastJointRestoreReason = reason;
      return false;
    }
    const piece = this.state.pieces.find((p) => p.id === tx.pieceId);
    if (piece) {
      piece.position = { ...tx.startTransform.position };
      piece.rotation = tx.startTransform.rotation;
      piece.preferredRotation = tx.startTransform.preferredRotation;
      piece.rotationSource = tx.startTransform.rotationSource;
      piece.manualRotationRevision = tx.startTransform.manualRotationRevision;
      piece.attachedAnchorId = tx.startTransform.attachedAnchorId;
    }
    if (tx.partnerPieceTransforms) {
      for (const [partnerId, t] of Object.entries(tx.partnerPieceTransforms)) {
        const partner = this.state.pieces.find((p) => p.id === partnerId);
        if (partner) {
          partner.position = { ...t.position };
          partner.rotation = t.rotation;
        }
      }
    }
    this.state.joints = deepClone(tx.allJointsAtStart);
    this.activeJointEditTransaction = null;
    this.lastJointEditOutcome = 'CANCELED';
    this.lastJointRestoreReason = reason;
    this.notify();
    return true;
  }

  public placePiece(
    piece: PlacedPiece,
    recordUndo = true,
    proposedJoint?: ProposedTimberJoint | ProposedTimberJoint[] | null,
  ): boolean {
    // Enforce One Active Bullseye Limit: never allow more than one Bullseye Block on the battlefield
    if (piece.type === 'bullseye_block') {
      const existingBullseye = this.state.pieces.find(
        (p) => p.type === 'bullseye_block' && p.condition !== 'LOST',
      );
      if (existingBullseye) {
        this.bullseyeConflictDiagnostic =
          'CONFLICT_REJECTED: Only one active Bullseye Block is permitted on the battlefield.';
        return false;
      }
      this.bullseyeConflictDiagnostic = null;
    }

    const currentCount = this.state.inventory[piece.type] ?? 0;
    if (currentCount <= 0) return false;

    // Enforce wisp clearance: committed construction pieces may not overlap placed or reserved wisps
    const pieceOBB = getOBBFromPiece(piece);
    if (checkPieceOverlapsWisps(pieceOBB, this.state.wisps).overlaps) {
      return false;
    }

    const fromDelivered =
      this.isReinforcementMode && (this.deliveredInventory[piece.type] || 0) > 0;

    this.state.inventory[piece.type] = currentCount - 1;
    if (fromDelivered) {
      this.deliveredInventory[piece.type] = Math.max(0, this.deliveredInventory[piece.type] - 1);
      this.guaranteedDeliveryUsed++;
      this.deliveredPieceIds.push(piece.id);
    }
    if (this.isReinforcementMode) {
      this.reinforcementMaterialsUsed++;
    }

    const resolvedId =
      piece.type === 'bullseye_block' && piece.id.startsWith('player_piece_')
        ? TUTORIAL_BULLSEYE_ID
        : piece.id;

    const enrichedPiece: PlacedPiece = {
      ...deepClone(piece),
      id: resolvedId,
      condition: piece.condition ?? 'INTACT',
      ownership: fromDelivered ? 'GUARANTEED_DELIVERY' : (piece.ownership ?? 'PLAYER_OWNED'),
      source: fromDelivered ? 'GUARANTEED_DELIVERY' : (piece.source ?? 'STARTING_RESERVE'),
      ...(piece.type === 'bullseye_block'
        ? {
            bullseyeActive: piece.bullseyeActive ?? true,
            bullseyeTriggered: piece.bullseyeTriggered ?? false,
            bullseyeExpired: piece.bullseyeExpired ?? false,
            consumedByAttackId: piece.consumedByAttackId ?? null,
            overrideCancellationReason: piece.overrideCancellationReason ?? null,
          }
        : {}),
    };

    // Preserve exact structure when in standard construction for byte-identical snapshot compatibility
    if (
      !this.isReinforcementMode &&
      piece.type !== 'bullseye_block' &&
      !piece.condition &&
      !piece.ownership &&
      !piece.source
    ) {
      this.state.pieces.push(deepClone(piece));
    } else {
      this.state.pieces.push(enrichedPiece);
    }

    const proposals = Array.isArray(proposedJoint)
      ? proposedJoint
      : proposedJoint
        ? [proposedJoint]
        : [];

    // Apply any Balanced Peak Adjustment partner piece moves atomically
    const partnerPieceMoves: PartnerPieceAdjustment[] = [];
    for (const pj of proposals) {
      if (pj.partnerPieceAdjustment) {
        const adj = pj.partnerPieceAdjustment;
        const partner = this.state.pieces.find((p) => p.id === adj.pieceId);
        if (
          partner &&
          (!partner.isPrebuilt || partner.ownership === 'PREBUILT_MOVABLE') &&
          partner.condition !== 'BROKEN' &&
          partner.condition !== 'LOST' &&
          !partnerPieceMoves.some((m) => m.pieceId === partner.id)
        ) {
          const beforePartnerPos = { ...partner.position };
          const targetPartnerPos = adj.afterPos ?? adj.proposedPosition ?? partner.position;
          partner.position = { ...targetPartnerPos };
          partnerPieceMoves.push({
            pieceId: partner.id,
            beforePos: beforePartnerPos,
            afterPos: { ...partner.position },
            proposedPosition: { ...partner.position },
            beforeRot: partner.rotation,
            afterRot: partner.rotation,
            correctionVector: {
              x: partner.position.x - beforePartnerPos.x,
              y: partner.position.y - beforePartnerPos.y,
            },
          });
        }
      }
    }

    const createdJoints: TimberJoint[] = [];
    if (proposals.length > 0 && PIECE_DEFINITIONS[piece.type]?.jointCapable) {
      for (const pj of proposals) {
        const created = this.createOrUpdateTimberJointFromProposal(resolvedId, pj);
        if (created) {
          createdJoints.push(deepClone(created));
          this.triggerConnectionDiscoveryHint(created.jointType, pj.lowerSupportsDetected);
        }
      }
    }

    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`PLACE_PIECE_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `place_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;
    this.lastJointEditOutcome = 'ACCEPTED';

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'PLACE_PIECE',
        operationId,
        piece: deepClone(this.state.pieces[this.state.pieces.length - 1]),
        fromDelivered,
        beforeRevision,
        afterRevision,
        ...(createdJoints.length > 0 ? { createdJoints } : {}),
        ...(partnerPieceMoves.length > 0 ? { partnerPieceMoves } : {}),
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public getJoints(customState?: LevelState): TimberJoint[] {
    const target = customState ?? this.state;
    if (!target.joints) {
      target.joints = [];
    }
    return target.joints;
  }

  public getJointsForPiece(pieceId: string, includeBroken = false): TimberJoint[] {
    const joints = this.getJoints();
    return joints.filter(
      (j) =>
        (includeBroken || j.state !== 'BROKEN') &&
        (j.pieceAId === pieceId || j.pieceBId === pieceId),
    );
  }

  public lastCreatedTimberJointId: string | null = null;
  public lastBrokenTimberJointReason: string | null = null;
  public lastBrokenTimberJointPhaseOrAttack: string | null = null;

  public createOrUpdateTimberJointFromProposal(
    sourcePieceId: string,
    proposal: ProposedTimberJoint,
  ): TimberJoint | null {
    const sourcePiece = this.state.pieces.find((p) => p.id === sourcePieceId);
    const targetPiece = this.state.pieces.find((p) => p.id === proposal.targetPieceId);
    if (
      !sourcePiece ||
      !targetPiece ||
      !PIECE_DEFINITIONS[sourcePiece.type]?.jointCapable ||
      !PIECE_DEFINITIONS[targetPiece.type]?.jointCapable ||
      sourcePiece.condition === 'BROKEN' ||
      sourcePiece.condition === 'LOST' ||
      targetPiece.condition === 'BROKEN' ||
      targetPiece.condition === 'LOST'
    ) {
      return null;
    }

    const joints = this.getJoints();
    const jointId = buildTimberJointId(
      sourcePieceId,
      proposal.sourceSocketName,
      proposal.targetPieceId,
      proposal.targetSocketName,
    );

    const socketAId = `${sourcePieceId}_${proposal.sourceSocketName}`;
    const socketBId = `${proposal.targetPieceId}_${proposal.targetSocketName}`;

    // Check if an active joint already connects these two pieces or uses the same endpoint socket on sourcePiece
    const existingIdx = joints.findIndex(
      (j) =>
        j.state !== 'BROKEN' &&
        (j.jointId === jointId ||
          (j.pieceAId === sourcePieceId && j.pieceBId === proposal.targetPieceId) ||
          (j.pieceAId === proposal.targetPieceId && j.pieceBId === sourcePieceId) ||
          (proposal.sourceSocketName.startsWith('END_') &&
            ((j.pieceAId === sourcePieceId && j.socketAId === socketAId) ||
              (j.pieceBId === sourcePieceId && j.socketBId === socketAId)))),
    );

    const matPairKey =
      proposal.materialPairKey ??
      resolveMaterialPairProfileId(
        sourcePiece.type,
        targetPiece.type,
        Boolean(sourcePiece.isPrebuilt),
        Boolean(targetPiece.isPrebuilt),
        proposal.jointType,
      );
    const connSubtype =
      proposal.connectionSubtype ??
      resolveConnectionSubtype(proposal.jointType, sourcePiece.type, targetPiece.type);
    const resolvedProfile =
      proposal.strengthProfile ||
      resolveBindingStrengthProfile(
        proposal.jointType,
        sourcePiece.type,
        targetPiece.type,
        Boolean(sourcePiece.isPrebuilt),
        Boolean(targetPiece.isPrebuilt),
      );

    const rawJoint: TimberJoint = {
      jointId,
      bindingId: jointId,
      jointType: proposal.jointType,
      connectionSubtype: connSubtype,
      pieceAId: sourcePieceId,
      pieceBId: proposal.targetPieceId,
      materialA: sourcePiece.type,
      materialB: targetPiece.type,
      materialPairKey: matPairKey,
      isPrebuiltBinding: Boolean(sourcePiece.isPrebuilt || targetPiece.isPrebuilt),
      socketAId,
      socketBId,
      localAnchorA: { ...proposal.localAnchorA },
      localAnchorB: { ...proposal.localAnchorB },
      worldPosition: { ...proposal.worldPosition },
      restAngle: proposal.restAngle,
      restSeparation: 0,
      strengthProfile: resolvedProfile,
      complianceProfile: proposal.complianceProfile ?? resolvedProfile,
      state: 'INTACT',
      currentStress: 0,
      maxStressObserved: 0,
      createdInPhase: this.isReinforcementMode ? 'REINFORCEMENT' : 'BUILD',
      creationReason:
        proposal.creationReason ??
        (this.isReinforcementMode ? 'REINFORCEMENT_COMMIT' : 'SNAP_COMMIT'),
      geometrySchemaVersion: GEOMETRY_SCHEMA_VERSION,
      brokenInPhase: null,
      brokenByAttackId: null,
      failureReason: null,
      sourceFaceId: proposal.sourceFaceId ?? null,
      targetFaceId: proposal.targetFaceId ?? null,
      sourceCornerId: proposal.sourceCornerId ?? null,
      targetCornerId: proposal.targetCornerId ?? null,
      lowerSupportsDetected: proposal.lowerSupportsDetected,
      visualJointCapType:
        proposal.visualJointCapType ??
        getVisualJointCapType(proposal.jointType, proposal.connectionTaxonomy, matPairKey),
      initialPositionalErrorPx: 0,
      initialAngularErrorRad: 0,
      initialConstraintEnergy: 0,
    };

    const newJoint = deriveStressFreeJointGeometryFromCommittedTransforms(
      rawJoint,
      sourcePiece,
      targetPiece,
    );

    if (existingIdx !== -1) {
      joints[existingIdx] = newJoint;
    } else {
      joints.push(newJoint);
    }

    this.lastCreatedTimberJointId = newJoint.jointId;
    return newJoint;
  }

  private replaceJointsForPiece(pieceId: string, replacementJoints: TimberJoint[]): void {
    const joints = this.getJoints();
    const filtered = joints.filter(
      (j) => j.pieceAId !== pieceId && j.pieceBId !== pieceId,
    );
    const seenIds = new Set(filtered.map((j) => j.jointId));
    for (const rj of replacementJoints) {
      if (!seenIds.has(rj.jointId)) {
        seenIds.add(rj.jointId);
        filtered.push(deepClone(rj));
      }
    }
    this.state.joints = filtered;
  }

  public removePiece(pieceId: string, recordUndo = true): boolean {
    const index = this.state.pieces.findIndex((p) => p.id === pieceId);
    if (index === -1) return false;

    const piece = this.state.pieces[index];
    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canRemoveToInventory) return false;

    const joints = this.getJoints();
    const removedJoints = deepClone(
      joints.filter((j) => j.pieceAId === pieceId || j.pieceBId === pieceId),
    );
    if (removedJoints.length > 0) {
      this.state.joints = joints.filter(
        (j) => j.pieceAId !== pieceId && j.pieceBId !== pieceId,
      );
    }

    this.state.pieces.splice(index, 1);
    this.state.inventory[piece.type] = (this.state.inventory[piece.type] ?? 0) + 1;

    const wasDelivered =
      piece.source === 'GUARANTEED_DELIVERY' ||
      piece.ownership === 'GUARANTEED_DELIVERY' ||
      this.deliveredPieceIds.includes(piece.id);

    if (wasDelivered) {
      this.deliveredInventory[piece.type] = (this.deliveredInventory[piece.type] || 0) + 1;
      this.guaranteedDeliveryUsed = Math.max(0, this.guaranteedDeliveryUsed - 1);
      this.deliveredPieceIds = this.deliveredPieceIds.filter((id) => id !== piece.id);
    }
    if (this.isReinforcementMode && this.reinforcementMaterialsUsed > 0) {
      this.reinforcementMaterialsUsed = Math.max(0, this.reinforcementMaterialsUsed - 1);
    }

    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`REMOVE_PIECE_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `remove_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'REMOVE_PIECE',
        operationId,
        piece: deepClone(piece),
        toDelivered: wasDelivered,
        beforeRevision,
        afterRevision,
        ...(removedJoints.length > 0 ? { removedJoints } : {}),
      });
      this.getActiveRedoStack().length = 0;
    }

    if (
      piece.type === 'wood_beam' &&
      !this.state.pieces.some((p) => !p.isPrebuilt && p.type === 'wood_beam')
    ) {
      this.beamSelectedInInventory = false;
    }
    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public movePiece(
    pieceId: string,
    newPos: Vector2,
    newRotationOrAnchor?: number | string,
    newAnchorId?: string,
    recordUndo = true,
    proposedJoint?: ProposedTimberJoint | ProposedTimberJoint[] | null,
  ): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canMove) return false;

    const tx =
      this.activeJointEditTransaction?.pieceId === pieceId
        ? this.activeJointEditTransaction
        : null;

    const beforePos = tx ? { ...tx.startTransform.position } : { ...piece.position };
    const beforeRot = tx ? tx.startTransform.rotation : piece.rotation;
    const beforeAnchorId = tx ? tx.startTransform.attachedAnchorId : piece.attachedAnchorId;

    const afterRot =
      typeof newRotationOrAnchor === 'number' ? newRotationOrAnchor : piece.rotation;
    const afterAnchorId =
      typeof newRotationOrAnchor === 'string' ? newRotationOrAnchor : newAnchorId;

    // Enforce wisp clearance on move
    const cfg = MATERIAL_CONFIGS[piece.type];
    const candidateOBB = createOBB(newPos, cfg.width, cfg.height, afterRot);
    if (checkPieceOverlapsWisps(candidateOBB, this.state.wisps).overlaps) {
      this.lastJointEditOutcome = 'REJECTED';
      this.lastJointRestoreReason = 'WISP_OVERLAP';
      return false;
    }

    const explicitProposals = Array.isArray(proposedJoint)
      ? proposedJoint
      : proposedJoint
        ? [proposedJoint]
        : [];
    const proposedTargetIds = new Set(explicitProposals.map((p) => p.targetPieceId));
    const partnerAdjustmentsById = new Map<string, Vector2>();
    for (const pj of explicitProposals) {
      if (pj.partnerPieceAdjustment) {
        const targetPos =
          pj.partnerPieceAdjustment.afterPos ?? pj.partnerPieceAdjustment.proposedPosition;
        if (targetPos) {
          partnerAdjustmentsById.set(pj.partnerPieceAdjustment.pieceId, targetPos);
        }
      }
    }

    // Validate against overlapping other pieces
    for (const other of this.state.pieces) {
      if (other.id === pieceId || other.condition === 'LOST') continue;
      const otherEffectivePos = partnerAdjustmentsById.get(other.id) ?? other.position;
      const oCfg = MATERIAL_CONFIGS[other.type];
      const oOBB = createOBB(otherEffectivePos, oCfg.width, oCfg.height, other.rotation);
      const tol = proposedTargetIds.has(other.id) ? 0.05 : 2.5;
      if (getOBBPenetrationDepth(candidateOBB, oOBB, tol) > 0) {
        this.lastJointEditOutcome = 'REJECTED';
        this.lastJointRestoreReason = 'PIECE_OVERLAP';
        return false;
      }
    }

    const beforeJoints = tx
      ? deepClone(tx.affectedJoints)
      : deepClone(this.getJointsForPiece(pieceId, true));

    // Apply any partner piece moves from Balanced Peak Adjustment atomically
    const partnerPieceMoves: PartnerPieceAdjustment[] = [];
    for (const [partnerId, proposedPos] of partnerAdjustmentsById.entries()) {
      const partner = this.state.pieces.find((p) => p.id === partnerId);
      if (
        partner &&
        (!partner.isPrebuilt || partner.ownership === 'PREBUILT_MOVABLE') &&
        partner.condition !== 'BROKEN' &&
        partner.condition !== 'LOST'
      ) {
        const beforePartnerPos =
          tx?.partnerPieceTransforms?.[partnerId]?.position ?? { ...partner.position };
        partner.position = { ...proposedPos };
        partnerPieceMoves.push({
          pieceId: partner.id,
          beforePos: { ...beforePartnerPos },
          afterPos: { ...partner.position },
          proposedPosition: { ...partner.position },
          beforeRot: partner.rotation,
          afterRot: partner.rotation,
          correctionVector: {
            x: partner.position.x - beforePartnerPos.x,
            y: partner.position.y - beforePartnerPos.y,
          },
        });
      }
    }

    // Evaluate which existing joints remain compatible and which are obsolete/removed
    const evalResult = evaluateJointsForPieceTransform(
      pieceId,
      piece.type,
      newPos,
      afterRot,
      this.state.pieces,
      this.getJoints(),
      proposedJoint !== null && this.snappingEnabled,
    );

    const removedIds = new Set(evalResult.removedJoints.map((j) => j.jointId));
    const preservedMap = new Map(evalResult.preservedJoints.map((j) => [j.jointId, j]));

    // Apply transform
    piece.position = { ...newPos };
    piece.rotation = afterRot;
    piece.attachedAnchorId = afterAnchorId;

    // 1. Remove obsolete joints and update preserved joints
    const currentJoints = this.getJoints();
    const nextJoints: TimberJoint[] = [];
    for (const j of currentJoints) {
      if (removedIds.has(j.jointId)) {
        continue;
      }
      const preserved = preservedMap.get(j.jointId);
      if (preserved) {
        nextJoints.push(preserved);
      } else {
        nextJoints.push(j);
      }
    }
    this.state.joints = nextJoints;

    // 2. Create/update any newly proposed joints
    const proposalsToCommit =
      proposedJoint !== undefined ? explicitProposals : evalResult.newlyProposedJoints;

    const createdJoints: TimberJoint[] = [];
    if (proposalsToCommit.length > 0 && PIECE_DEFINITIONS[piece.type]?.jointCapable) {
      for (const pj of proposalsToCommit) {
        const created = this.createOrUpdateTimberJointFromProposal(pieceId, pj);
        if (created) {
          createdJoints.push(deepClone(created));
          this.triggerConnectionDiscoveryHint(created.jointType, pj.lowerSupportsDetected);
        }
      }
    }

    // Deduplicate joints by socket pair so a single socket pair never has more than 1 logical joint
    const seenIds = new Set<string>();
    this.state.joints = this.getJoints().filter((j) => {
      if (seenIds.has(j.jointId)) return false;
      seenIds.add(j.jointId);
      return true;
    });

    const afterJoints = deepClone(this.getJointsForPiece(pieceId, true));
    const beforeRevision = tx ? tx.constructionRevision : this.currentConstructionRevision;
    this.incrementConstructionRevision(`MOVE_PIECE_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = tx ? tx.operationId : `move_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;
    this.activeJointEditTransaction = null;
    this.lastJointEditOutcome = 'ACCEPTED';
    this.lastJointRestoreReason = null;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'MOVE_PIECE',
        operationId,
        pieceId,
        beforePos,
        beforeRot,
        beforeAnchorId,
        afterPos: { ...newPos },
        afterRot,
        afterAnchorId,
        beforeRevision,
        afterRevision,
        removedJoints: deepClone(evalResult.removedJoints),
        preservedJoints: deepClone(evalResult.preservedJoints),
        createdJoints,
        ...(partnerPieceMoves.length > 0 ? { partnerPieceMoves } : {}),
        ...(beforeJoints.length > 0 || afterJoints.length > 0
          ? { beforeJoints, afterJoints }
          : {}),
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public validatePieceRotation(
    pieceId: string,
    proposedAngle: number,
  ): RotationValidationDiagnostics {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) {
      return {
        selectedPieceId: pieceId,
        currentCommittedAngle: 0,
        proposedAngle,
        rotationFinalOverlapCount: 1,
        rotationSweepOverlapCount: 0,
        conflictingColliderId: null,
        penetrationDepth: 0,
        connectionIncompatibility: false,
        rotationAccepted: false,
        lastRejectionReason: 'PIECE_OVERLAP',
        playerFriendlyMessage: 'Piece not found.',
        timestamp: Date.now(),
      };
    }
    const normalizedTarget = this.normalizeAngle(proposedAngle);
    return validatePieceRotationTransaction(
      piece,
      normalizedTarget,
      this.state.pieces,
      this.state.anchors,
      this.state.wisps,
      this.getJoints(),
    );
  }

  public detachTimberJoints(
    pieceId: string,
    specificJointId?: string,
    recordUndo = true,
  ): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canMove && !eligibility.canRotate) return false;

    const joints = this.getJoints();
    const toRemove = joints.filter(
      (j) =>
        j.state !== 'BROKEN' &&
        (j.pieceAId === pieceId || j.pieceBId === pieceId) &&
        (!specificJointId || j.jointId === specificJointId),
    );
    if (toRemove.length === 0) return false;

    const removedJoints = deepClone(toRemove);
    const removedIds = new Set(removedJoints.map((j) => j.jointId));
    this.state.joints = joints.filter((j) => !removedIds.has(j.jointId));
    this.lastRotationDiagnostics = null;

    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`DETACH_TIMBER_JOINT_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `detach_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'DETACH_JOINT',
        operationId,
        pieceId,
        removedJoints,
        beforeRevision,
        afterRevision,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public detachPieceConnection(pieceId: string, recordUndo = true): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    if (!piece.attachedAnchorId) {
      return this.detachTimberJoints(pieceId, undefined, recordUndo);
    }

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canMove && !eligibility.canRotate) return false;

    const beforeAnchorId = piece.attachedAnchorId;
    piece.attachedAnchorId = undefined;
    this.lastRotationDiagnostics = null;

    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`DETACH_CONNECTION_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `detach_anchor_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'MOVE_PIECE',
        operationId,
        pieceId,
        beforePos: { ...piece.position },
        beforeRot: piece.rotation,
        beforeAnchorId,
        afterPos: { ...piece.position },
        afterRot: piece.rotation,
        afterAnchorId: undefined,
        beforeRevision,
        afterRevision,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public getManualBindCandidates(pieceId: string): ProposedTimberJoint[] {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return [];
    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canMove && !eligibility.canRotate) return [];
    return findManualBindCandidatesForPiece(piece, this.state.pieces, this.getJoints());
  }

  public bindPieceConnection(
    pieceId: string,
    candidateIndex = 0,
    recordUndo = true,
  ): TimberJoint | null {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return null;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canMove && !eligibility.canRotate) return null;

    const candidates = this.getManualBindCandidates(pieceId);
    if (candidates.length === 0) return null;

    const idx = ((candidateIndex % candidates.length) + candidates.length) % candidates.length;
    const chosen: ProposedTimberJoint = {
      ...candidates[idx],
      creationReason: 'MANUAL_BIND_ACTION',
    };

    const created = this.createOrUpdateTimberJointFromProposal(pieceId, chosen);
    if (!created) return null;

    this.triggerConnectionDiscoveryHint(created.jointType, chosen.lowerSupportsDetected);
    const createdJoints = [deepClone(created)];
    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`BIND_TIMBER_JOINT_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `bind_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;
    this.lastJointEditOutcome = 'ACCEPTED';

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'BIND_JOINT',
        operationId,
        pieceId,
        createdJoints,
        beforeRevision,
        afterRevision,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return created;
  }

  public rotatePiece(pieceId: string, deltaAngle: number, recordUndo = true): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canRotate) return false;

    const beforeRotation = piece.rotation;
    const beforeAnchorId = piece.attachedAnchorId;
    const afterRotation = this.normalizeAngle(beforeRotation + deltaAngle);

    const diag = validatePieceRotationTransaction(
      piece,
      afterRotation,
      this.state.pieces,
      this.state.anchors,
      this.state.wisps,
      this.getJoints(),
    );
    this.lastRotationDiagnostics = diag;

    if (!diag.rotationAccepted) {
      this.lastJointEditOutcome = 'REJECTED';
      this.lastJointRestoreReason = diag.lastRejectionReason ?? 'ROTATION_REJECTED';
      this.listeners.forEach((fn) => fn());
      return false;
    }

    const beforeJoints = deepClone(this.getJointsForPiece(pieceId, true));
    const evalResult = evaluateJointsForPieceTransform(
      pieceId,
      piece.type,
      piece.position,
      afterRotation,
      this.state.pieces,
      this.getJoints(),
      this.snappingEnabled,
    );

    piece.rotation = afterRotation;
    piece.preferredRotation = afterRotation;
    piece.rotationSource = 'USER';
    piece.manualRotationRevision = (piece.manualRotationRevision ?? 0) + 1;

    // Remove obsolete joints and update preserved joints
    const removedIds = new Set(evalResult.removedJoints.map((j) => j.jointId));
    const preservedMap = new Map(evalResult.preservedJoints.map((j) => [j.jointId, j]));
    const nextJoints: TimberJoint[] = [];
    for (const j of this.getJoints()) {
      if (removedIds.has(j.jointId)) continue;
      const preserved = preservedMap.get(j.jointId);
      nextJoints.push(preserved ?? j);
    }
    this.state.joints = nextJoints;

    // Create any newly aligned joints at the rotated orientation
    const createdJoints: TimberJoint[] = [];
    for (const pj of evalResult.newlyProposedJoints) {
      const created = this.createOrUpdateTimberJointFromProposal(pieceId, pj);
      if (created) {
        createdJoints.push(deepClone(created));
        this.triggerConnectionDiscoveryHint(created.jointType);
      }
    }

    const afterJoints = deepClone(this.getJointsForPiece(pieceId, true));
    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`ROTATE_PIECE_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `rot_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;
    this.lastJointEditOutcome = 'ACCEPTED';
    this.lastJointRestoreReason = null;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'ROTATE_PIECE',
        operationId,
        pieceId,
        beforeRotation,
        afterRotation,
        beforeAnchorId,
        afterAnchorId: beforeAnchorId,
        beforeRevision,
        afterRevision,
        removedJoints: deepClone(evalResult.removedJoints),
        preservedJoints: deepClone(evalResult.preservedJoints),
        createdJoints,
        ...(beforeJoints.length > 0 || afterJoints.length > 0
          ? { beforeJoints, afterJoints }
          : {}),
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public setPieceRotation(pieceId: string, targetRotation: number, recordUndo = true): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canRotate) return false;

    const beforeRotation = piece.rotation;
    const afterRotation = this.normalizeAngle(targetRotation);
    if (Math.abs(beforeRotation - afterRotation) < 0.001) return false;

    const diag = validatePieceRotationTransaction(
      piece,
      afterRotation,
      this.state.pieces,
      this.state.anchors,
      this.state.wisps,
      this.getJoints(),
    );
    this.lastRotationDiagnostics = diag;

    if (!diag.rotationAccepted) {
      this.lastJointEditOutcome = 'REJECTED';
      this.lastJointRestoreReason = diag.lastRejectionReason ?? 'ROTATION_REJECTED';
      this.listeners.forEach((fn) => fn());
      return false;
    }

    const beforeJoints = deepClone(this.getJointsForPiece(pieceId, true));
    const evalResult = evaluateJointsForPieceTransform(
      pieceId,
      piece.type,
      piece.position,
      afterRotation,
      this.state.pieces,
      this.getJoints(),
      this.snappingEnabled,
    );

    piece.rotation = afterRotation;
    piece.preferredRotation = afterRotation;
    piece.rotationSource = 'USER';
    piece.manualRotationRevision = (piece.manualRotationRevision ?? 0) + 1;

    const removedIds = new Set(evalResult.removedJoints.map((j) => j.jointId));
    const preservedMap = new Map(evalResult.preservedJoints.map((j) => [j.jointId, j]));
    const nextJoints: TimberJoint[] = [];
    for (const j of this.getJoints()) {
      if (removedIds.has(j.jointId)) continue;
      const preserved = preservedMap.get(j.jointId);
      nextJoints.push(preserved ?? j);
    }
    this.state.joints = nextJoints;

    const createdJoints: TimberJoint[] = [];
    for (const pj of evalResult.newlyProposedJoints) {
      const created = this.createOrUpdateTimberJointFromProposal(pieceId, pj);
      if (created) {
        createdJoints.push(deepClone(created));
        this.triggerConnectionDiscoveryHint(created.jointType);
      }
    }

    const afterJoints = deepClone(this.getJointsForPiece(pieceId, true));
    const beforeRevision = this.currentConstructionRevision;
    this.incrementConstructionRevision(`SET_ROTATION_${piece.type.toUpperCase()}`);
    const afterRevision = this.currentConstructionRevision;
    const operationId = `setrot_op_${this.jointOperationSeq++}`;
    this.lastHistoryOperationId = operationId;
    this.lastJointEditOutcome = 'ACCEPTED';
    this.lastJointRestoreReason = null;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'ROTATE_PIECE',
        operationId,
        pieceId,
        beforeRotation,
        afterRotation,
        beforeAnchorId: piece.attachedAnchorId,
        afterAnchorId: piece.attachedAnchorId,
        beforeRevision,
        afterRevision,
        removedJoints: deepClone(evalResult.removedJoints),
        preservedJoints: deepClone(evalResult.preservedJoints),
        createdJoints,
        ...(beforeJoints.length > 0 || afterJoints.length > 0
          ? { beforeJoints, afterJoints }
          : {}),
      });
      this.getActiveRedoStack().length = 0;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  // --- Undo / Redo ---

  public canUndo(): boolean {
    return this.getActiveUndoStack().length > 0;
  }

  public canRedo(): boolean {
    return this.getActiveRedoStack().length > 0;
  }

  public getUndoCount(): number {
    return this.getActiveUndoStack().length;
  }

  public getRedoCount(): number {
    return this.getActiveRedoStack().length;
  }

  public getConstructionHistoryCounts(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  public getReinforcementHistoryCounts(): { undo: number; redo: number } {
    return { undo: this.reinforcementUndoStack.length, redo: this.reinforcementRedoStack.length };
  }

  public undo(): boolean {
    const activeUndo = this.getActiveUndoStack();
    const activeRedo = this.getActiveRedoStack();
    const action = activeUndo.pop();
    if (!action) return false;

    const joints = this.getJoints();

    switch (action.type) {
      case 'PLACE_PIECE': {
        const idx = this.state.pieces.findIndex((p) => p.id === action.piece.id);
        if (idx !== -1) {
          this.state.pieces.splice(idx, 1);
          this.state.inventory[action.piece.type] =
            (this.state.inventory[action.piece.type] ?? 0) + 1;
          if (action.fromDelivered) {
            this.deliveredInventory[action.piece.type] =
              (this.deliveredInventory[action.piece.type] || 0) + 1;
            this.guaranteedDeliveryUsed = Math.max(0, this.guaranteedDeliveryUsed - 1);
            this.deliveredPieceIds = this.deliveredPieceIds.filter((id) => id !== action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed = Math.max(0, this.reinforcementMaterialsUsed - 1);
          }
        }
        if (action.partnerPieceMoves) {
          for (const pm of action.partnerPieceMoves) {
            const partner = this.state.pieces.find((p) => p.id === pm.pieceId);
            if (partner) {
              partner.position = { ...pm.beforePos };
            }
          }
        }
        if (action.createdJoints && action.createdJoints.length > 0) {
          const createdIds = new Set(action.createdJoints.map((j) => j.jointId));
          this.state.joints = joints.filter(
            (j) =>
              !createdIds.has(j.jointId) &&
              j.pieceAId !== action.piece.id &&
              j.pieceBId !== action.piece.id,
          );
        } else {
          this.state.joints = joints.filter(
            (j) => j.pieceAId !== action.piece.id && j.pieceBId !== action.piece.id,
          );
        }
        break;
      }
      case 'REMOVE_PIECE': {
        const currentInv = this.state.inventory[action.piece.type] ?? 0;
        if (currentInv > 0) {
          this.state.inventory[action.piece.type] = currentInv - 1;
          this.state.pieces.push(deepClone(action.piece));
          if (action.toDelivered) {
            this.deliveredInventory[action.piece.type] = Math.max(
              0,
              (this.deliveredInventory[action.piece.type] || 0) - 1,
            );
            this.guaranteedDeliveryUsed++;
            this.deliveredPieceIds.push(action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed++;
          }
          if (action.removedJoints && action.removedJoints.length > 0) {
            const existingIds = new Set(joints.map((j) => j.jointId));
            for (const rj of action.removedJoints) {
              if (!existingIds.has(rj.jointId)) {
                existingIds.add(rj.jointId);
                joints.push(deepClone(rj));
              }
            }
          }
        }
        break;
      }
      case 'MOVE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.position = { ...action.beforePos };
          p.rotation = action.beforeRot;
          p.attachedAnchorId = action.beforeAnchorId;
        }
        if (action.partnerPieceMoves) {
          for (const pm of action.partnerPieceMoves) {
            const partner = this.state.pieces.find((item) => item.id === pm.pieceId);
            if (partner) {
              partner.position = { ...pm.beforePos };
            }
          }
        }
        if (action.beforeJoints !== undefined || action.afterJoints !== undefined) {
          this.replaceJointsForPiece(action.pieceId, action.beforeJoints ?? []);
        }
        break;
      }
      case 'ROTATE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.rotation = action.beforeRotation;
          p.attachedAnchorId = action.beforeAnchorId;
        }
        if (action.beforeJoints !== undefined || action.afterJoints !== undefined) {
          this.replaceJointsForPiece(action.pieceId, action.beforeJoints ?? []);
        }
        break;
      }
      case 'DETACH_JOINT': {
        const existingIds = new Set(joints.map((j) => j.jointId));
        for (const rj of action.removedJoints) {
          if (!existingIds.has(rj.jointId)) {
            existingIds.add(rj.jointId);
            joints.push(deepClone(rj));
          }
        }
        break;
      }
      case 'BIND_JOINT': {
        const createdIds = new Set(action.createdJoints.map((j) => j.jointId));
        this.state.joints = joints.filter((j) => !createdIds.has(j.jointId));
        break;
      }
    }

    activeRedo.push(action);
    this.incrementConstructionRevision(`UNDO_${action.type}`);
    this.notify();
    return true;
  }

  public redo(): boolean {
    const activeUndo = this.getActiveUndoStack();
    const activeRedo = this.getActiveRedoStack();
    const action = activeRedo.pop();
    if (!action) return false;

    const joints = this.getJoints();

    switch (action.type) {
      case 'PLACE_PIECE': {
        const currentInv = this.state.inventory[action.piece.type] ?? 0;
        if (currentInv > 0) {
          this.state.inventory[action.piece.type] = currentInv - 1;
          this.state.pieces.push(deepClone(action.piece));
          if (action.fromDelivered) {
            this.deliveredInventory[action.piece.type] = Math.max(
              0,
              (this.deliveredInventory[action.piece.type] || 0) - 1,
            );
            this.guaranteedDeliveryUsed++;
            this.deliveredPieceIds.push(action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed++;
          }
          if (action.partnerPieceMoves) {
            for (const pm of action.partnerPieceMoves) {
              const partner = this.state.pieces.find((p) => p.id === pm.pieceId);
              if (partner) {
                partner.position = { ...pm.afterPos };
              }
            }
          }
          if (action.createdJoints && action.createdJoints.length > 0) {
            const existingIds = new Set(joints.map((j) => j.jointId));
            for (const cj of action.createdJoints) {
              if (!existingIds.has(cj.jointId)) {
                existingIds.add(cj.jointId);
                joints.push(deepClone(cj));
              }
            }
          }
        }
        break;
      }
      case 'REMOVE_PIECE': {
        const idx = this.state.pieces.findIndex((p) => p.id === action.piece.id);
        if (idx !== -1) {
          this.state.pieces.splice(idx, 1);
          this.state.inventory[action.piece.type] =
            (this.state.inventory[action.piece.type] ?? 0) + 1;
          if (action.toDelivered) {
            this.deliveredInventory[action.piece.type] =
              (this.deliveredInventory[action.piece.type] || 0) + 1;
            this.guaranteedDeliveryUsed = Math.max(0, this.guaranteedDeliveryUsed - 1);
            this.deliveredPieceIds = this.deliveredPieceIds.filter((id) => id !== action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed = Math.max(0, this.reinforcementMaterialsUsed - 1);
          }
        }
        this.state.joints = joints.filter(
          (j) => j.pieceAId !== action.piece.id && j.pieceBId !== action.piece.id,
        );
        break;
      }
      case 'MOVE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.position = { ...action.afterPos };
          p.rotation = action.afterRot;
          p.attachedAnchorId = action.afterAnchorId;
        }
        if (action.partnerPieceMoves) {
          for (const pm of action.partnerPieceMoves) {
            const partner = this.state.pieces.find((item) => item.id === pm.pieceId);
            if (partner) {
              partner.position = { ...pm.afterPos };
            }
          }
        }
        if (action.beforeJoints !== undefined || action.afterJoints !== undefined) {
          this.replaceJointsForPiece(action.pieceId, action.afterJoints ?? []);
        }
        break;
      }
      case 'ROTATE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.rotation = action.afterRotation;
          p.attachedAnchorId = action.afterAnchorId;
        }
        if (action.beforeJoints !== undefined || action.afterJoints !== undefined) {
          this.replaceJointsForPiece(action.pieceId, action.afterJoints ?? []);
        }
        break;
      }
      case 'DETACH_JOINT': {
        const removedIds = new Set(action.removedJoints.map((j) => j.jointId));
        this.state.joints = joints.filter((j) => !removedIds.has(j.jointId));
        break;
      }
      case 'BIND_JOINT': {
        const existingIds = new Set(joints.map((j) => j.jointId));
        for (const cj of action.createdJoints) {
          if (!existingIds.has(cj.jointId)) {
            existingIds.add(cj.jointId);
            joints.push(deepClone(cj));
          }
        }
        break;
      }
    }

    activeUndo.push(action);
    this.incrementConstructionRevision(`REDO_${action.type}`);
    this.notify();
    return true;
  }

  // --- Bullseye Lifecycle Mutations ---

  public markBullseyeTriggered(): void {
    const piece = this.getPlacedBullseyePiece();
    if (!piece || piece.bullseyeExpired) return;
    piece.bullseyeTriggered = true;
    piece.bullseyeActive = true;
    this.saveToStorage();
  }

  public expireBullseyeForAttack(attackId: string): boolean {
    const piece = this.getPlacedBullseyePiece();
    if (!piece) return false;
    if (piece.bullseyeExpired) return false; // Never process expiration twice
    if (!piece.bullseyeTriggered) return false;
    piece.bullseyeExpired = true;
    piece.bullseyeActive = false;
    piece.consumedByAttackId = attackId;
    this.saveToStorage();
    return true;
  }

  public cancelBullseyeBeforeLaunch(reason: string): void {
    const piece = this.getPlacedBullseyePiece();
    if (!piece) return;
    piece.bullseyeActive = false;
    piece.bullseyeTriggered = false;
    piece.overrideCancellationReason = reason;
    this.saveToStorage();
  }

  public recordBullseyeCancellationReason(reason: string | null): void {
    const piece = this.getPlacedBullseyePiece();
    if (!piece) return;
    piece.overrideCancellationReason = reason;
  }

  // --- Post-Stability Wisp Placement & Protection Feedback ---

  public recomputeAllWispProtection(customState?: LevelState): void {
    const target = customState ?? this.state;
    for (const w of target.wisps) {
      if (!w.defaultPosition) {
        w.defaultPosition = getDefaultWispPosition(w.id);
      }
      if (w.isDispersed || w.placed === false) {
        w.shelterStatus = 'Exposed';
        w.sharedCollapseRisk = false;
        w.heavyOverheadHazard = false;
        w.protectionTags = ['Exposed'];
        w.hazardWarning = null;
        continue;
      }
      const validation = validateWispPlacementPosition(
        w.id,
        w.position,
        target.wisps,
        target.pieces,
        target.anchors,
      );
      w.isValid = validation.isValid;
      w.validationReason = validation.rejectionCode;
      const evaluation = evaluateWispProtectionAndRisks(
        w.position,
        w.id,
        target.wisps,
        target.pieces,
      );
      w.shelterStatus = evaluation.shelterStatus;
      w.sharedCollapseRisk = evaluation.sharedCollapseRisk;
      w.heavyOverheadHazard = evaluation.heavyOverheadHazard;
      w.limitedClearance = evaluation.limitedClearance;
      w.elevatedChamber = evaluation.elevatedChamber;
      w.protectionTags = evaluation.protectionTags;
      w.hazardWarning = evaluation.hazardWarning;
    }
  }

  public getWispPresenceDiagnostics(currentMode?: string): WispPresenceDiagnostics {
    const phase = currentMode ?? this.savedPhase;
    const battlefieldWisps = this.state.wisps.filter(
      (w) => w.placed === true && !w.isDispersed,
    );
    const stagingWisps = this.state.wisps.filter((w) => w.placed !== true);
    return {
      currentPhase: phase,
      wispBattlefieldCount: battlefieldWisps.length,
      wispBlockerCount: battlefieldWisps.length,
      wispStagingCount: stagingWisps.length,
      wisps: this.state.wisps.map((w) => {
        const placed = w.placed === true && !w.isDispersed;
        return {
          wispId: w.id,
          placed,
          position: placed ? { ...w.position } : null,
          hasActiveCollider: placed,
          blocksConstruction: placed,
          shelterState: w.isDispersed
            ? 'Dispersed'
            : placed
              ? (w.shelterStatus ?? 'Exposed')
              : 'Unplaced',
        };
      }),
    };
  }

  public enterPlaceWispsPhase(stageWisps = true): void {
    this.wispPlacementPhase = 'PLACE_WISPS';
    this.savedPhase = 'PLACE_WISPS';
    this.wispsRequiredBeforeSiege = true;
    this.lastDefaultSlotPlacementReport = null;
    this.lastRotationDiagnostics = null;
    this.lastWispPlacementDiagnostics = null;
    for (const w of this.state.wisps) {
      w.isDispersed = false;
      w.defaultPosition = w.defaultPosition ?? getDefaultWispPosition(w.id);
      if (stageWisps) {
        w.placed = false;
        w.isValid = false;
        w.validationReason = null;
      } else {
        const val = validateWispPlacementPosition(
          w.id,
          w.position,
          this.state.wisps,
          this.state.pieces,
          this.state.anchors,
        );
        w.placed = val.isValid;
        w.isValid = val.isValid;
        w.validationReason = val.rejectionCode;
      }
    }
    this.recomputeAllWispProtection();
    this.saveNamedSnapshot('STABLE_BUILD');
    this.saveNamedSnapshot('INITIAL_DESIGN');
    this.notify();
  }

  public validateWispPlacement(
    wispId: string,
    pos: Vector2,
  ): WispPlacementValidationResult {
    const res = validateWispPlacementPosition(
      wispId,
      pos,
      this.state.wisps,
      this.state.pieces,
      this.state.anchors,
    );
    this.lastWispPlacementDiagnostics = res.diagnostics ?? null;
    return res;
  }

  public placeWisp(
    wispId: string,
    pos: Vector2,
  ): { success: boolean; validation: WispPlacementValidationResult } {
    if (this.isReinforcementMode) {
      const failDiag: WispPlacementDiagnostics = {
        wispId,
        wispPosition: { ...pos },
        wispColliderBounds: null,
        localClearanceResult: 'CLEAR',
        overlappingConstructionColliderId: null,
        overlappingTerrainColliderId: null,
        overlappingWispId: null,
        sanctuaryBoundaryResult: 'OUTSIDE',
        warningClassifications: [],
        exteriorPathCheckEnabled: false,
        sealedEnclosureAccepted: false,
        lastPlacementRejectionReason: 'OUTSIDE_SANCTUARY_ZONE',
        playerFriendlyMessage: 'Surviving wisps cannot be moved during reinforcement.',
        timestamp: Date.now(),
      };
      this.lastWispPlacementDiagnostics = failDiag;
      return {
        success: false,
        validation: {
          isValid: false,
          rejectionCode: 'OUTSIDE_SANCTUARY_ZONE',
          playerFriendlyMessage: 'Surviving wisps cannot be moved during reinforcement.',
          overlappingId: null,
          diagnostics: failDiag,
        },
      };
    }
    const wisp = this.state.wisps.find((w) => w.id === wispId);
    if (!wisp) {
      return {
        success: false,
        validation: {
          isValid: false,
          rejectionCode: 'OUTSIDE_SANCTUARY_ZONE',
          playerFriendlyMessage: 'Wisp not found.',
          overlappingId: null,
        },
      };
    }

    const validation = this.validateWispPlacement(wispId, pos);
    this.lastWispPlacementDiagnostics = validation.diagnostics ?? null;
    if (!validation.isValid) {
      return { success: false, validation };
    }

    wisp.position = { x: Math.round(pos.x), y: Math.round(pos.y) };
    wisp.placed = true;
    wisp.isValid = true;
    wisp.validationReason = null;

    this.recomputeAllWispProtection();
    if (this.wispPlacementPhase === 'PLACE_WISPS' || this.wispPlacementPhase === 'PRE_SIEGE_REVIEW') {
      this.saveNamedSnapshot('PRE_SIEGE_WISPS');
      this.saveNamedSnapshot('INITIAL_DESIGN');
    }
    this.notify();
    return { success: true, validation };
  }

  public unstageWisp(wispId: string): boolean {
    if (this.isReinforcementMode) return false;
    const wisp = this.state.wisps.find((w) => w.id === wispId);
    if (!wisp) return false;
    wisp.placed = false;
    wisp.isValid = false;
    wisp.validationReason = null;
    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public placeAllWispsInDefaultSanctuarySlots(allowFallbackOffsets = false): number {
    if (this.isReinforcementMode) return 0;
    let placedCount = 0;
    const unplacedWispIds: string[] = [];
    const unplacedWispNames: string[] = [];
    const candidateOffsets: Vector2[] = allowFallbackOffsets
      ? [
          { x: 0, y: 0 },
          { x: 0, y: -18 },
          { x: -20, y: 0 },
          { x: 20, y: 0 },
          { x: -24, y: -20 },
          { x: 24, y: -20 },
          { x: 0, y: -36 },
        ]
      : [{ x: 0, y: 0 }];

    for (const w of this.state.wisps) {
      const defPos = w.defaultPosition ?? getDefaultWispPosition(w.id);
      let committed = false;
      let lastRejection: WispPlacementValidationResult['rejectionCode'] = null;
      for (const off of candidateOffsets) {
        const candidate = { x: defPos.x + off.x, y: defPos.y + off.y };
        const res = this.placeWisp(w.id, candidate);
        if (res.success) {
          placedCount++;
          committed = true;
          break;
        } else {
          lastRejection = res.validation.rejectionCode;
        }
      }
      if (!committed) {
        w.placed = false;
        w.isValid = false;
        w.validationReason = lastRejection;
        unplacedWispIds.push(w.id);
        unplacedWispNames.push(w.name ?? w.id);
      }
    }

    this.lastDefaultSlotPlacementReport = {
      placedCount,
      unplacedWispIds,
      unplacedWispNames,
      message:
        unplacedWispNames.length > 0
          ? `Default slot blocked for ${unplacedWispNames.join(', ')}. Drag remaining wisp(s) to an open sanctuary spot.`
          : null,
    };

    this.recomputeAllWispProtection();
    this.notify();
    return placedCount;
  }

  public areAllWispsPlacedAndValid(customState?: LevelState): boolean {
    const target = customState ?? this.state;
    const requiredCount = this.getRequiredWispCount(target);
    if (requiredCount <= 0 || target.wisps.length !== requiredCount) return false;
    const seenIds = new Set<string>();
    for (const w of target.wisps) {
      if (seenIds.has(w.id)) return false;
      seenIds.add(w.id);
      if (w.placed !== true) return false;
      const val = validateWispPlacementPosition(
        w.id,
        w.position,
        target.wisps,
        target.pieces,
        target.anchors,
      );
      if (!val.isValid) return false;
    }
    return true;
  }

  public getSharedCollapseRiskWarning(customState?: LevelState): string | null {
    const target = customState ?? this.state;
    const hasShared = target.wisps.some((w) => w.placed === true && w.sharedCollapseRisk);
    return hasShared ? 'Several wisps share the same collapse risk.' : null;
  }

  public enterPreSiegeReview(): boolean {
    this.recomputeAllWispProtection();
    if (!this.areAllWispsPlacedAndValid()) {
      return false;
    }
    this.wispPlacementPhase = 'PRE_SIEGE_REVIEW';
    this.savedPhase = 'PRE_SIEGE_REVIEW';
    this.saveNamedSnapshot('PRE_SIEGE_WISPS');
    this.saveNamedSnapshot('INITIAL_DESIGN');
    this.notify();
    return true;
  }

  public returnToPlaceWispsFromReview(): void {
    this.wispPlacementPhase = 'PLACE_WISPS';
    this.savedPhase = 'PLACE_WISPS';
    this.recomputeAllWispProtection();
    this.notify();
  }

  public returnFromWispPhaseToBuild(): void {
    // Return all five wisps to unplaced staging state (placed: false) and remove active wisp collision regions from BUILD
    for (const w of this.state.wisps) {
      const defPos = w.defaultPosition ?? getDefaultWispPosition(w.id);
      w.position = { ...defPos };
      w.defaultPosition = { ...defPos };
      w.isDispersed = false;
      w.placed = false;
      w.isValid = false;
      w.validationReason = null;
    }
    this.wispPlacementPhase = 'STAGED_IN_BUILD';
    this.wispsRequiredBeforeSiege = true;
    this.savedPhase = 'CONSTRUCTION';
    this.lastDefaultSlotPlacementReport = null;
    this.lastRotationDiagnostics = null;
    this.recomputeAllWispProtection();
    this.saveNamedSnapshot('STABLE_BUILD');
    this.saveNamedSnapshot('INITIAL_DESIGN');
    this.notify();
  }

  public lockWispsForSiege(): void {
    if (!this.areAllWispsPlacedAndValid()) {
      const customPositioned = new Map<string, Vector2>();
      for (const w of this.state.wisps) {
        const defPos = w.defaultPosition ?? getDefaultWispPosition(w.id);
        if (
          !w.placed &&
          (Math.abs(w.position.x - defPos.x) > 0.5 || Math.abs(w.position.y - defPos.y) > 0.5)
        ) {
          customPositioned.set(w.id, { ...w.position });
        }
      }
      this.placeAllWispsInDefaultSanctuarySlots(true);
      for (const [id, pos] of customPositioned.entries()) {
        const w = this.state.wisps.find((item) => item.id === id);
        if (w) {
          w.position = { ...pos };
          w.placed = true;
          w.isValid = true;
          w.validationReason = null;
        }
      }
    }
    this.recomputeAllWispProtection();
    this.wispPlacementPhase = 'LOCKED_FOR_SIEGE';
    this.saveNamedSnapshot('PRE_SIEGE_WISPS');
    this.saveNamedSnapshot('INITIAL_DESIGN');
    this.saveSessionMeta();
  }

  // --- Named Snapshots & Restoration ---

  public saveNamedSnapshot(type: SnapshotType, customState?: LevelState): void {
    if (!customState) {
      this.state.snapshotMetadata = this.buildSnapshotWispMetadata(this.state);
    }
    const snap = deepClone(customState ?? this.state);
    snap.snapshotMetadata = this.buildSnapshotWispMetadata(snap);
    this.snapshots[type] = snap;
    if (type === 'INITIAL_DESIGN') {
      this.preTestSnapshot = deepClone(snap);
    }
    this.saveSessionMeta();
  }

  public getNamedSnapshot(type: SnapshotType): LevelState | null {
    return this.snapshots[type] ? deepClone(this.snapshots[type]!) : null;
  }

  public getActiveSnapshotList(): SnapshotType[] {
    return (Object.keys(this.snapshots) as SnapshotType[]).filter(
      (k) => this.snapshots[k] !== null,
    );
  }

  public captureSnapshot(): void {
    const snap = deepClone(this.state);
    snap.snapshotMetadata = this.buildSnapshotWispMetadata(snap);
    this.preTestSnapshot = snap;
    this.preTestRevisionId = this.currentConstructionRevision;
    this.snapshots.INITIAL_DESIGN = deepClone(snap);
    this.saveSessionMeta();
  }

  public restorePreTestSnapshot(preserveTestedRevision = true): boolean {
    const snap = this.preTestSnapshot ?? this.snapshots.INITIAL_DESIGN;
    if (!snap) return false;
    this.state = deepClone(snap);
    this.isReinforcementMode = false;
    this.reinforcementUndoStack = [];
    this.reinforcementRedoStack = [];
    this.deliveryGranted = false;
    this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 };
    this.deliveredPieceIds = [];
    this.reinforcementMaterialsUsed = 0;
    this.guaranteedDeliveryUsed = 0;
    this.bullseyeConflictDiagnostic = null;
    if (preserveTestedRevision && this.preTestRevisionId !== null) {
      this.currentConstructionRevision = this.preTestRevisionId;
    } else {
      this.currentConstructionRevision++;
    }
    this.lastChecklistRecomputationReason = 'RESTORE_PRE_TEST_SNAPSHOT';
    this.savedPhase = 'CONSTRUCTION';
    this.notify();
    return true;
  }

  public restoreForRetryDesign(): boolean {
    const snap =
      this.snapshots.PRE_SIEGE_WISPS ??
      this.snapshots.INITIAL_DESIGN ??
      this.snapshots.STABLE_BUILD ??
      this.preTestSnapshot;
    if (!snap) return false;
    this.state = deepClone(snap);
    this.isReinforcementMode = false;
    this.reinforcementUndoStack = [];
    this.reinforcementRedoStack = [];
    this.deliveryGranted = false;
    this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 };
    this.deliveredPieceIds = [];
    this.reinforcementMaterialsUsed = 0;
    this.guaranteedDeliveryUsed = 0;
    this.bullseyeConflictDiagnostic = null;
    this.lastRotationDiagnostics = null;
    this.isAttemptCompleted = false;
    this.lastResults = null;
    this.snapshots.FINAL_RESULT = null;
    this.snapshots.POST_ATTACK_1 = null;
    this.snapshots.REINFORCEMENT_ENTRY = null;
    this.snapshots.REINFORCEMENT_COMPLETE = null;
    if (this.preTestRevisionId !== null) {
      this.currentConstructionRevision = this.preTestRevisionId;
    }
    for (const p of this.state.pieces) {
      p.condition = 'INTACT';
    }
    for (const j of this.state.joints ?? []) {
      j.state = 'INTACT';
      j.currentStress = 0;
      j.maxStressObserved = 0;
      j.brokenInPhase = null;
      j.brokenByAttackId = null;
      j.failureReason = null;
    }
    for (const w of this.state.wisps) {
      w.isDispersed = false;
      w.dispersalTime = undefined;
    }
    this.recomputeAllWispProtection();
    this.lastChecklistRecomputationReason = 'RESTORE_FOR_RETRY_DESIGN';
    this.savedPhase = 'CONSTRUCTION';
    this.notify();
    return true;
  }

  public restoreSnapshot(type: SnapshotType): boolean {
    const snap = this.snapshots[type];
    if (!snap) return false;
    this.state = deepClone(snap);
    this.bullseyeConflictDiagnostic = null;
    this.lastRotationDiagnostics = null;

    if (type === 'INITIAL_DESIGN' || type === 'STABLE_BUILD' || type === 'LEVEL_TEMPLATE') {
      this.isReinforcementMode = false;
      this.reinforcementUndoStack = [];
      this.reinforcementRedoStack = [];
      this.deliveryGranted = false;
      this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 };
      this.deliveredPieceIds = [];
      this.reinforcementMaterialsUsed = 0;
      this.guaranteedDeliveryUsed = 0;
    }

    if (type === 'LEVEL_TEMPLATE') {
      this.undoStack = [];
      this.redoStack = [];
      this.preTestSnapshot = null;
      this.preTestRevisionId = null;
      this.currentConstructionRevision = 1;
      this.testedRevisionId = null;
      this.stabilityPassedForRevisionId = null;
      this.acceptedRevisionId = null;
      this.stabilityTestRun = false;
      this.stabilityTestRestoredOrAccepted = false;
      this.guidanceSkipped = false;
      this.completionPresented = false;
      this.beginSiegeHighlightOnce = false;
      this.unstableHint = null;
      this.beamSelectedInInventory = false;
      this.activeDragPieceType = null;
      this.lastChecklistRecomputationReason = 'RESTORE_LEVEL_TEMPLATE';
      this.snapshots = {
        LEVEL_TEMPLATE: deepClone(INITIAL_LEVEL_STATE),
        STABLE_BUILD: null,
        INITIAL_DESIGN: null,
        PRE_SIEGE_WISPS: null,
        POST_ATTACK_1: null,
        REINFORCEMENT_ENTRY: null,
        REINFORCEMENT_COMPLETE: null,
        FINAL_RESULT: null,
      };
      this.wispPlacementPhase = 'STAGED_IN_BUILD';
      this.wispsRequiredBeforeSiege = false;
    } else if (type === 'INITIAL_DESIGN' || type === 'STABLE_BUILD' || type === 'PRE_SIEGE_WISPS') {
      if (this.preTestRevisionId !== null) {
        this.currentConstructionRevision = this.preTestRevisionId;
      }
      this.lastChecklistRecomputationReason = `RESTORE_${type}`;
    } else {
      this.currentConstructionRevision++;
      this.lastChecklistRecomputationReason = `RESTORE_SNAPSHOT_${type}`;
    }

    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  public hasSnapshot(): boolean {
    return (
      this.preTestSnapshot !== null ||
      this.snapshots.INITIAL_DESIGN !== null ||
      this.snapshots.STABLE_BUILD !== null
    );
  }

  public hasPreTestSnapshot(): boolean {
    return this.preTestSnapshot !== null || this.snapshots.INITIAL_DESIGN !== null;
  }

  public resetLevel(): void {
    this.resetGeneration++;
    this.activeAttemptId = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.isAttemptCompleted = false;

    const activeOverride = this.developerWispCountOverride;
    const activeCount = activeOverride ?? LEVEL_1_CONFIG.requiredWispCount;
    const selectedIds =
      activeOverride !== null
        ? getSelectedWispIdsForCount(activeCount)
        : [...LEVEL_1_CONFIG.selectedWispIds];

    const freshState = deepClone(INITIAL_LEVEL_STATE);
    freshState.attemptId = this.activeAttemptId;
    freshState.resetGeneration = this.resetGeneration;
    freshState.wisps = createWispsForConfiguration(selectedIds);
    // Explicitly unplace all wisps for clean BUILD template (0 battlefield wisps, 3 in staging awaiting placement)
    for (const w of freshState.wisps) {
      w.placed = false;
      w.isValid = false;
      w.isDispersed = false;
      w.validationReason = null;
      w.shelterStatus = 'Exposed';
    }
    // Exactly 5 prebuilt intact pieces, 0 player pieces
    freshState.pieces = deepClone(INITIAL_LEVEL_STATE.pieces).map((p) => ({
      ...p,
      condition: 'INTACT',
      isPrebuilt: true,
    }));
    freshState.joints = [];
    freshState.inventory = { ...INITIAL_LEVEL_STATE.inventory };
    freshState.requiredWispCount = activeCount;
    freshState.activeWispIds = [...selectedIds];
    freshState.minimumStableWispsForCompletion = getMinimumStableWispsForCompletion(activeCount);
    freshState.resultBands = buildResultBandsForWispCount(activeCount);
    freshState.developerWispCountOverride = activeOverride;
    freshState.snapshotMetadata = this.buildSnapshotWispMetadata(freshState);

    this.state = freshState;
    this.preTestSnapshot = null;
    this.preTestRevisionId = null;
    this.snapshots = {
      LEVEL_TEMPLATE: deepClone(freshState),
      STABLE_BUILD: null,
      INITIAL_DESIGN: null,
      PRE_SIEGE_WISPS: null,
      POST_ATTACK_1: null,
      REINFORCEMENT_ENTRY: null,
      REINFORCEMENT_COMPLETE: null,
      FINAL_RESULT: null,
    };
    this.undoStack = [];
    this.redoStack = [];
    this.reinforcementUndoStack = [];
    this.reinforcementRedoStack = [];
    this.isReinforcementMode = false;
    this.deliveryGranted = false;
    this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 };
    this.deliveredPieceIds = [];
    this.reinforcementMaterialsUsed = 0;
    this.guaranteedDeliveryUsed = 0;
    this.bullseyeConflictDiagnostic = null;
    this.lastRotationDiagnostics = null;
    this.lastDefaultSlotPlacementReport = null;
    this.currentConstructionRevision = 1;
    this.testedRevisionId = null;
    this.stabilityPassedForRevisionId = null;
    this.acceptedRevisionId = null;
    this.stabilityTestRun = false;
    this.stabilityTestRestoredOrAccepted = false;
    this.guidanceSkipped = false;
    this.completionPresented = false;
    this.beginSiegeHighlightOnce = false;
    this.unstableHint = null;
    this.beamSelectedInInventory = false;
    this.activeDragPieceType = null;
    this.lastChecklistRecomputationReason = 'RESET_LEVEL';
    this.lastTutorialTransition = 'RESET -> STEP_1_SELECT_BEAM';
    this.previousGuidedStep = 'STEP_1_SELECT_BEAM';
    this.lastResults = null;
    this.savedPhase = 'CONSTRUCTION';
    this.wispPlacementPhase = 'STAGED_IN_BUILD';
    this.wispsRequiredBeforeSiege = false;
    this.recomputeAllWispProtection();
    this.saveToStorage();
    this.saveSessionMeta();
    this.notify();
  }

  public startOver(): void {
    this.resetLevel();
  }

  public resetToDefault(): void {
    this.resetLevel();
  }

  public recordAttemptCompleted(results: Level1Results | null): void {
    this.isAttemptCompleted = true;
    this.lastResults = results;
    this.saveSessionMeta();
  }

  public hydrateState(
    targetState: LevelState,
    meta?: Partial<SavedSessionMeta>,
    expectedGeneration?: number,
  ): boolean {
    if (typeof expectedGeneration === 'number' && expectedGeneration < this.resetGeneration) {
      // Discard stale asynchronous hydration from an older reset generation
      return false;
    }
    if (meta?.activeAttemptId && meta.activeAttemptId !== this.activeAttemptId && this.resetGeneration > 1) {
      // Discard payload from mismatched attempt
      return false;
    }
    this.state = this.migratePersistedLevelState(targetState);
    if (meta) {
      if (meta.savedPhase) this.savedPhase = meta.savedPhase;
      if (meta.isReinforcementMode !== undefined) this.isReinforcementMode = meta.isReinforcementMode;
      if (meta.wispPlacementPhase) this.wispPlacementPhase = meta.wispPlacementPhase;
    }
    this.normalizeBuildPhaseWisps();
    this.validatePersistedTutorialAgainstDesign();
    this.recomputeAllWispProtection();
    this.notify();
    return true;
  }

  // --- Unlock & Tutorial State ---

  public markTutorialCompleted(): void {
    this.unlockState.tutorialCompleted = true;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
  }

  public grantSampleUnlock(): boolean {
    const newlyPresented = !this.unlockState.unlockPresentedOnce;
    this.unlockState.tutorialCompleted = true;
    this.unlockState.reinforcementReserveUnlocked = true;
    this.unlockState.unlockPresentedOnce = true;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
    return newlyPresented;
  }

  public clearTutorialState(): void {
    this.unlockState.tutorialCompleted = false;
    this.stabilityTestRun = false;
    this.stabilityTestRestoredOrAccepted = false;
    this.testedRevisionId = null;
    this.stabilityPassedForRevisionId = null;
    this.acceptedRevisionId = null;
    this.guidanceSkipped = false;
    this.completionPresented = false;
    this.beginSiegeHighlightOnce = false;
    this.unstableHint = null;
    this.beamSelectedInInventory = false;
    this.lastChecklistRecomputationReason = 'CLEAR_TUTORIAL_STATE';
    this.saveUnlockState();
    this.saveSessionMeta();
    this.listeners.forEach((fn) => fn());
  }

  public clearSampleUnlock(): void {
    this.unlockState.reinforcementReserveUnlocked = false;
    this.unlockState.unlockPresentedOnce = false;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
  }

  // --- Reload Recovery ---

  public setSavedPhase(phase: GameMode): void {
    this.savedPhase = phase;
    this.saveSessionMeta();
  }

  public recoverFromReload(): { recoveredPhase: GameMode; message: string } {
    const phase = this.savedPhase;

    // 1. Reload during Attack 1 -> restore INITIAL_DESIGN and return to CONSTRUCTION_READY
    if (
      (phase === 'PRE_ATTACK_VALIDATION' ||
        phase === 'ENEMY_INTRODUCTION' ||
        phase === 'AIMING_PREVIEW' ||
        phase === 'PROJECTILE_IN_FLIGHT' ||
        phase === 'IMPACT_RESOLUTION' ||
        phase === 'SETTLING') &&
      !this.isReinforcementMode &&
      !this.snapshots.REINFORCEMENT_COMPLETE
    ) {
      if (this.snapshots.INITIAL_DESIGN) {
        this.state = deepClone(this.snapshots.INITIAL_DESIGN);
      }
      this.savedPhase = 'CONSTRUCTION_READY';
      this.notify();
      return {
        recoveredPhase: 'CONSTRUCTION_READY',
        message: 'Reloaded during Attack 1: Restored INITIAL_DESIGN snapshot safely.',
      };
    }

    // 2. Reload during Reinforcement -> restore REINFORCEMENT_ENTRY without duplicating delivery
    if (
      phase === 'ATTACK_RESOLVED' ||
      phase === 'REINFORCEMENT_INTRO' ||
      phase === 'REINFORCEMENT_ACTIVE' ||
      phase === 'EMERGENCY_DELIVERY'
    ) {
      if (this.snapshots.REINFORCEMENT_ENTRY) {
        this.state = deepClone(this.snapshots.REINFORCEMENT_ENTRY);
      } else if (this.snapshots.POST_ATTACK_1) {
        this.state = deepClone(this.snapshots.POST_ATTACK_1);
      }
      this.isReinforcementMode = true;
      this.reinforcementUndoStack = [];
      this.reinforcementRedoStack = [];
      this.savedPhase = 'REINFORCEMENT_ACTIVE';
      this.notify();
      return {
        recoveredPhase: 'REINFORCEMENT_ACTIVE',
        message: 'Reloaded during Reinforcement: Restored REINFORCEMENT_ENTRY without duplicating delivery.',
      };
    }

    // 3. Reload during Attack 2 -> restore REINFORCEMENT_COMPLETE and return to FINAL_ATTACK_READY
    if (
      phase === 'REINFORCEMENT_VALIDATION' ||
      phase === 'FINAL_ATTACK_READY' ||
      ((phase === 'ENEMY_INTRODUCTION' ||
        phase === 'AIMING_PREVIEW' ||
        phase === 'PROJECTILE_IN_FLIGHT' ||
        phase === 'IMPACT_RESOLUTION' ||
        phase === 'SETTLING') &&
        Boolean(this.snapshots.REINFORCEMENT_COMPLETE))
    ) {
      if (this.snapshots.REINFORCEMENT_COMPLETE) {
        this.state = deepClone(this.snapshots.REINFORCEMENT_COMPLETE);
      }
      this.isReinforcementMode = false;
      this.savedPhase = 'FINAL_ATTACK_READY';
      this.notify();
      return {
        recoveredPhase: 'FINAL_ATTACK_READY',
        message: 'Reloaded during Attack 2: Restored REINFORCEMENT_COMPLETE snapshot.',
      };
    }

    // 4. Reload after completed attempt or during Results -> recover to fresh Level 1 template in BUILD
    if (
      phase === 'SEQUENCE_COMPLETE' ||
      phase === 'RESULTS' ||
      phase === 'UNLOCK_PRESENTATION' ||
      this.isAttemptCompleted
    ) {
      this.resetLevel();
      return {
        recoveredPhase: 'INITIAL_CONSTRUCTION',
        message: 'Previous attempt concluded. Restored fresh Level 1 template in BUILD phase.',
      };
    }

    // 5. Reload during Stability Test (TESTING_SIMULATION) -> restore pre-test snapshot and return to CONSTRUCTION
    if (phase === 'TESTING_SIMULATION') {
      if (this.snapshots.INITIAL_DESIGN) {
        this.state = deepClone(this.snapshots.INITIAL_DESIGN);
      }
      if (this.preTestRevisionId !== null) {
        this.currentConstructionRevision = this.preTestRevisionId;
      }
      this.savedPhase = 'INITIAL_CONSTRUCTION';
      this.lastChecklistRecomputationReason = 'RELOAD_DURING_STABILITY_TEST';
      this.notify();
      return {
        recoveredPhase: 'INITIAL_CONSTRUCTION',
        message: 'Reloaded during Stability Test: Restored pre-test editable design safely.',
      };
    }

    // 6. Reload on Fortress Stable screen (SETTLED) -> preserve settled pass state so player can Accept or Return to Build
    if (phase === 'SETTLED') {
      if (this.snapshots.INITIAL_DESIGN) {
        this.state = deepClone(this.snapshots.INITIAL_DESIGN);
      }
      if (this.preTestRevisionId !== null) {
        this.currentConstructionRevision = this.preTestRevisionId;
      }
      this.validatePersistedTutorialAgainstDesign();
      if (
        this.stabilityPassedForRevisionId === this.currentConstructionRevision
      ) {
        this.acceptedRevisionId = this.currentConstructionRevision;
        this.stabilityTestRestoredOrAccepted = true;
        this.savedPhase = 'CONSTRUCTION_READY';
        this.lastChecklistRecomputationReason = 'RELOAD_ON_FORTRESS_STABLE_AUTO_ACCEPT';
        this.notify();
        return {
          recoveredPhase: 'CONSTRUCTION_READY',
          message: 'Reloaded on Fortress Stable screen: Preserved passed stability and enabled Begin Siege.',
        };
      }
      this.savedPhase = 'INITIAL_CONSTRUCTION';
      this.lastChecklistRecomputationReason = 'RELOAD_FROM_SETTLED_TO_BUILD';
      this.notify();
      return {
        recoveredPhase: 'INITIAL_CONSTRUCTION',
        message: 'Restored editable construction state.',
      };
    }

    // 7. Reload during PLACE_WISPS or PRE_SIEGE_REVIEW -> restore committed wisp positions, deduplicate wisps, preserve construction & inventory
    if (
      phase === 'PLACE_WISPS' ||
      phase === 'PRE_SIEGE_REVIEW' ||
      this.wispPlacementPhase === 'PLACE_WISPS' ||
      this.wispPlacementPhase === 'PRE_SIEGE_REVIEW'
    ) {
      // Deduplicate wisps to guarantee exactly the 5 unique sanctuary wisps
      const seenWispIds = new Set<string>();
      const dedupedWisps = [];
      for (const w of this.state.wisps) {
        if (!seenWispIds.has(w.id)) {
          seenWispIds.add(w.id);
          dedupedWisps.push(w);
        }
      }
      this.state.wisps = dedupedWisps;
      this.recomputeAllWispProtection();

      const targetPhase: GameMode =
        (phase === 'PRE_SIEGE_REVIEW' || this.wispPlacementPhase === 'PRE_SIEGE_REVIEW') &&
        this.areAllWispsPlacedAndValid()
          ? 'PRE_SIEGE_REVIEW'
          : 'PLACE_WISPS';
      this.wispPlacementPhase = targetPhase === 'PRE_SIEGE_REVIEW' ? 'PRE_SIEGE_REVIEW' : 'PLACE_WISPS';
      this.savedPhase = targetPhase;
      this.lastChecklistRecomputationReason = `RELOAD_${targetPhase}`;
      this.notify();
      return {
        recoveredPhase: targetPhase,
        message: `Reloaded during ${targetPhase}: Restored committed wisp positions and accepted fortress structure.`,
      };
    }

    // Default: Initial construction
    this.validatePersistedTutorialAgainstDesign();
    this.recomputeAllWispProtection();
    this.savedPhase = 'INITIAL_CONSTRUCTION';
    this.lastChecklistRecomputationReason = 'RELOAD_CONSTRUCTION';
    this.notify();
    return {
      recoveredPhase: 'INITIAL_CONSTRUCTION',
      message: 'Restored editable construction state.',
    };
  }

  // --- Persistence & Validation ---

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const serialized = JSON.stringify(this.state);
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota or private browsing errors
    }
  }

  private saveSessionMeta(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const meta: SavedSessionMeta = {
        savedPhase: this.savedPhase,
        isReinforcementMode: this.isReinforcementMode,
        deliveryGranted: this.deliveryGranted,
        deliveredInventory: { ...this.deliveredInventory },
        deliveredPieceIds: [...this.deliveredPieceIds],
        reinforcementMaterialsUsed: this.reinforcementMaterialsUsed,
        guaranteedDeliveryUsed: this.guaranteedDeliveryUsed,
        snapshots: this.snapshots,
        lastResults: this.lastResults,
        stabilityTestRun: this.stabilityTestRun,
        stabilityTestRestoredOrAccepted: this.stabilityTestRestoredOrAccepted,
        currentConstructionRevision: this.currentConstructionRevision,
        preTestRevisionId: this.preTestRevisionId,
        testedRevisionId: this.testedRevisionId,
        stabilityPassedForRevisionId: this.stabilityPassedForRevisionId,
        acceptedRevisionId: this.acceptedRevisionId,
        guidanceSkipped: this.guidanceSkipped,
        tutorialSkippedByDeveloper: this.tutorialSkippedByDeveloper,
        completionPresented: this.completionPresented,
        beginSiegeHighlightOnce: this.beginSiegeHighlightOnce,
        unstableHint: this.unstableHint,
        currentGuidedStep: this.previousGuidedStep,
        wispPlacementPhase: this.wispPlacementPhase,
        wispsRequiredBeforeSiege: this.wispsRequiredBeforeSiege,
        developerWispCountOverride: this.developerWispCountOverride,
        activeAttemptId: this.activeAttemptId,
        resetGeneration: this.resetGeneration,
        isAttemptCompleted: this.isAttemptCompleted,
      };
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // Ignore
    }
  }

  private loadSessionMeta(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(META_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedSessionMeta>;
      if (typeof parsed.activeAttemptId === 'string') {
        this.activeAttemptId = parsed.activeAttemptId;
      }
      if (typeof parsed.resetGeneration === 'number') {
        this.resetGeneration = parsed.resetGeneration;
      }
      if (typeof parsed.isAttemptCompleted === 'boolean') {
        this.isAttemptCompleted = parsed.isAttemptCompleted;
      } else if (
        parsed.savedPhase === 'RESULTS' ||
        parsed.savedPhase === 'SEQUENCE_COMPLETE' ||
        parsed.savedPhase === 'UNLOCK_PRESENTATION'
      ) {
        this.isAttemptCompleted = true;
      }
      if (parsed.savedPhase) this.savedPhase = parsed.savedPhase;
      if (parsed.wispPlacementPhase) this.wispPlacementPhase = parsed.wispPlacementPhase;
      if (typeof parsed.wispsRequiredBeforeSiege === 'boolean') {
        this.wispsRequiredBeforeSiege = parsed.wispsRequiredBeforeSiege;
      }
      if (
        typeof parsed.developerWispCountOverride === 'number' &&
        parsed.developerWispCountOverride >= 1 &&
        parsed.developerWispCountOverride <= 5
      ) {
        this.developerWispCountOverride = parsed.developerWispCountOverride;
      } else if (parsed.developerWispCountOverride === null) {
        this.developerWispCountOverride = null;
      }
      if (typeof parsed.isReinforcementMode === 'boolean') {
        this.isReinforcementMode = parsed.isReinforcementMode;
      }
      if (typeof parsed.deliveryGranted === 'boolean') {
        this.deliveryGranted = parsed.deliveryGranted;
      }
      if (parsed.deliveredInventory) {
        this.deliveredInventory = {
          wood_beam: parsed.deliveredInventory.wood_beam ?? 0,
          wood_block: parsed.deliveredInventory.wood_block ?? 0,
          stone_block: parsed.deliveredInventory.stone_block ?? 0,
          bullseye_block: parsed.deliveredInventory.bullseye_block ?? 0,
        };
      }
      if (Array.isArray(parsed.deliveredPieceIds)) {
        this.deliveredPieceIds = [...parsed.deliveredPieceIds];
      }
      if (typeof parsed.reinforcementMaterialsUsed === 'number') {
        this.reinforcementMaterialsUsed = parsed.reinforcementMaterialsUsed;
      }
      if (typeof parsed.guaranteedDeliveryUsed === 'number') {
        this.guaranteedDeliveryUsed = parsed.guaranteedDeliveryUsed;
      }
      if (typeof parsed.stabilityTestRun === 'boolean') {
        this.stabilityTestRun = parsed.stabilityTestRun;
      }
      if (typeof parsed.stabilityTestRestoredOrAccepted === 'boolean') {
        this.stabilityTestRestoredOrAccepted = parsed.stabilityTestRestoredOrAccepted;
      }
      if (typeof parsed.currentConstructionRevision === 'number') {
        this.currentConstructionRevision = parsed.currentConstructionRevision;
      }
      if (parsed.preTestRevisionId !== undefined) {
        this.preTestRevisionId = parsed.preTestRevisionId;
      }
      if (parsed.testedRevisionId !== undefined) {
        this.testedRevisionId = parsed.testedRevisionId;
      }
      if (parsed.stabilityPassedForRevisionId !== undefined) {
        this.stabilityPassedForRevisionId = parsed.stabilityPassedForRevisionId;
      }
      if (parsed.acceptedRevisionId !== undefined) {
        this.acceptedRevisionId = parsed.acceptedRevisionId;
      }
      if (typeof parsed.guidanceSkipped === 'boolean') {
        this.guidanceSkipped = parsed.guidanceSkipped;
      }
      if (typeof parsed.tutorialSkippedByDeveloper === 'boolean') {
        this.tutorialSkippedByDeveloper = parsed.tutorialSkippedByDeveloper;
      }
      if (typeof parsed.completionPresented === 'boolean') {
        this.completionPresented = parsed.completionPresented;
      }
      if (typeof parsed.beginSiegeHighlightOnce === 'boolean') {
        this.beginSiegeHighlightOnce = parsed.beginSiegeHighlightOnce;
      }
      if (parsed.unstableHint !== undefined) {
        this.unstableHint = parsed.unstableHint;
      }
      if (parsed.currentGuidedStep) {
        this.previousGuidedStep = parsed.currentGuidedStep;
      }
      if (parsed.snapshots) {
        const migrateSnap = (s: LevelState | null | undefined): LevelState | null =>
          s ? this.migratePersistedLevelState(s) : null;
        this.snapshots = {
          LEVEL_TEMPLATE:
            migrateSnap(parsed.snapshots.LEVEL_TEMPLATE) ?? deepClone(INITIAL_LEVEL_STATE),
          STABLE_BUILD: migrateSnap(parsed.snapshots.STABLE_BUILD),
          INITIAL_DESIGN: migrateSnap(parsed.snapshots.INITIAL_DESIGN),
          PRE_SIEGE_WISPS: migrateSnap(parsed.snapshots.PRE_SIEGE_WISPS),
          POST_ATTACK_1: migrateSnap(parsed.snapshots.POST_ATTACK_1),
          REINFORCEMENT_ENTRY: migrateSnap(parsed.snapshots.REINFORCEMENT_ENTRY),
          REINFORCEMENT_COMPLETE: migrateSnap(parsed.snapshots.REINFORCEMENT_COMPLETE),
          FINAL_RESULT: migrateSnap(parsed.snapshots.FINAL_RESULT),
        };
        if (this.snapshots.INITIAL_DESIGN) {
          this.preTestSnapshot = deepClone(this.snapshots.INITIAL_DESIGN);
        }
      }
      if (parsed.lastResults) {
        const expectedCount = this.getRequiredWispCount(this.state);
        if (parsed.lastResults.totalWisps === expectedCount) {
          this.lastResults = parsed.lastResults;
        } else {
          this.lastResults = null;
        }
      }
    } catch {
      // Ignore corrupted session meta
    }
  }

  private saveUnlockState(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(this.unlockState));
    } catch {
      // Ignore
    }
  }

  private loadUnlockState(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(UNLOCK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.unlockState = {
          tutorialCompleted: Boolean(parsed.tutorialCompleted),
          reinforcementReserveUnlocked: Boolean(parsed.reinforcementReserveUnlocked),
          unlockPresentedOnce: Boolean(parsed.unlockPresentedOnce),
        };
      }
    } catch {
      // Ignore
    }
  }

  private loadFromStorage(): LevelState {
    try {
      if (typeof localStorage === 'undefined') {
        return deepClone(INITIAL_LEVEL_STATE);
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(INITIAL_LEVEL_STATE);

      const parsed = JSON.parse(raw);
      if (!this.isValidLevelState(parsed)) {
        return deepClone(INITIAL_LEVEL_STATE);
      }

      return parsed;
    } catch {
      return deepClone(INITIAL_LEVEL_STATE);
    }
  }

  private isValidLevelState(data: unknown): data is LevelState {
    if (!data || typeof data !== 'object') return false;
    const candidate = data as Partial<LevelState>;

    // Accept legacy schemaVersion 1 (5-wisp saves), schemaVersion 2 (3-wisp pre-modular saves), and current schemaVersion 3 for safe migration
    if (
      candidate.schemaVersion !== 1 &&
      candidate.schemaVersion !== 2 &&
      candidate.schemaVersion !== INITIAL_LEVEL_STATE.schemaVersion
    ) {
      return false;
    }
    if (candidate.levelId !== INITIAL_LEVEL_STATE.levelId) return false;
    if (!Array.isArray(candidate.pieces)) return false;
    if (!Array.isArray(candidate.joints)) {
      candidate.joints = [];
    }
    if (!candidate.inventory || typeof candidate.inventory !== 'object') return false;

    const validMaterials: MaterialType[] = ['wood_beam', 'wood_block', 'stone_block', 'bullseye_block'];
    if (typeof candidate.inventory.bullseye_block !== 'number') {
      const hasPlacedBullseye = candidate.pieces.some((p) => p && p.type === 'bullseye_block');
      candidate.inventory.bullseye_block = hasPlacedBullseye ? 0 : 1;
    }
    for (const mat of validMaterials) {
      const count = candidate.inventory[mat];
      if (typeof count !== 'number' || count < 0 || count > 25 || !Number.isInteger(count)) {
        return false;
      }
    }

    const seenIds = new Set<string>();
    for (const piece of candidate.pieces) {
      if (!piece || typeof piece.id !== 'string' || seenIds.has(piece.id)) return false;
      seenIds.add(piece.id);
      if (!validMaterials.includes(piece.type)) return false;
      if (
        !piece.position ||
        typeof piece.position.x !== 'number' ||
        typeof piece.position.y !== 'number' ||
        Number.isNaN(piece.position.x) ||
        Number.isNaN(piece.position.y)
      ) {
        return false;
      }
    }

    return true;
  }

  public clearStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(META_STORAGE_KEY);
        localStorage.removeItem(UNLOCK_STORAGE_KEY);
        localStorage.removeItem('alchemical_fortress_balance_telemetry_v1');
        localStorage.removeItem('alchemical_fortress_presentation_settings');
      }
    } catch {
      // Ignore
    }
    this.developerWispCountOverride = null;
    this.unlockState = {
      tutorialCompleted: false,
      reinforcementReserveUnlocked: false,
      unlockPresentedOnce: false,
    };
    this.resetLevel();
  }

  public clearAllPrototypeData(): void {
    this.clearStorage();
  }

  private normalizeAngle(rad: number): number {
    const twoPi = Math.PI * 2;
    let normalized = rad % twoPi;
    if (normalized > Math.PI) normalized -= twoPi;
    if (normalized <= -Math.PI) normalized += twoPi;
    return normalized;
  }
}
