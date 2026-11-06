/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundSynth } from '../audio/synth';
import { formatWispCountWord } from '../config';
import { checkOBBOverlap, getOBBFromPiece } from '../math/geometry';
import { PhysicsBridge } from '../physics/physicsBridge';
import { LevelStore } from '../state/levelStore';
import {
  AttackBalanceTelemetry,
  AttackOutcome,
  AttemptBalanceTelemetry,
  AuthoredAttack,
  ConstructionRelevanceTelemetry,
  GameMode,
  Level1Results,
  LevelState,
  MasteryCriterion,
  MaterialType,
  ResultClassification,
  SiegeSummary,
  TutorialChecklistState,
  Vector2,
  WispContactEvent,
  WispShelterStatus,
} from '../types';
import { DistancePreset, DISTANCE_PRESETS } from './siegeConfig';
import { ResolvedLevelAttack, resolveLevelAttackSequence } from './runtimeLevelSelection';
import {
  advancePostImpactResolution,
  createPostImpactResolutionState,
  getPostImpactResolutionTiming,
  type PostImpactResolutionState,
} from './postImpactResolution';
import {
  advanceFinalWispCelebration,
  createFinalWispCelebrationState,
  startFinalWispCelebration,
  type FinalWispCelebrationState,
} from './finalWispCelebration';
import {
  selectTargetAndTrajectory,
  TargetCandidate,
  TargetingDiagnostics,
  TrajectorySolution,
} from './targeting';

export class SiegeController {
  private store: LevelStore;
  public physicsBridge: PhysicsBridge | null = null;

  public mode: GameMode = 'CONSTRUCTION';
  public currentAttackIndex = 0;
  public currentAttack: AuthoredAttack | null = null;
  public currentAttackSequenceId: string | null = null;
  public readonly attackSequence: readonly ResolvedLevelAttack[];
  public readonly reinforcementAfterAttackIndex: number;
  public distancePreset: DistancePreset = 'STANDARD';
  public outcomes: AttackOutcome[] = [];
  public siegeSummary: SiegeSummary | null = null;
  public level1Results: Level1Results | null = null;

  // Targeting & Ballistics
  public currentTarget: TargetCandidate | null = null;
  public currentTrajectorySolution: TrajectorySolution | null = null;
  public targetingDiagnostics: TargetingDiagnostics | null = null;
  public targetingFailureReason: string | null = null;
  public bullseyeNotice: string | null = null;
  public lastTargetComparison: {
    ordinaryTargetId: string;
    bullseyeTargetId: string;
    overrideActive: boolean;
    reachable: boolean;
  } | null = null;

  // Level 1 Tutorial Checklist Gating & Construction Relevance Telemetry
  public devBypassTutorialRequirements = false;
  public tutorialGateWarning: string | null = null;
  public checklistHighlightActive = false;
  public wasStartedViaPlayerGate = false;
  public constructionTelemetry: ConstructionRelevanceTelemetry;

  // Phase timers
  public introTimer = 0;
  public aimingTimer = 0;
  public impactTimer = 0;
  public settlingTimer = 0;
  public postImpactResolution: PostImpactResolutionState =
    createPostImpactResolutionState();
  public finalWispCelebration: FinalWispCelebrationState =
    createFinalWispCelebrationState();
  public intermissionTimer = 0;
  public emergencyStopUsed = false;
  public overlapWarning: string | null = null;

  // Phase 3 Reinforcement Timer & Mentor Delivery
  public reinforcementDurationSec = 75.0;
  public reinforcementTimerSec = 75.0;
  public reinforcementTimerPaused = false;
  public reinforcementTimerDisabled = false;
  public reinforcementElapsedSec = 0;
  public autoEnterReinforcement = false; // True when triggered from UI Level 1 flow
  public reloadNotice: string | null = null;

  private onStateChange?: () => void;
  public onBeforeReinforcementFinish?: () => void;
  private prevDispersedCount = 0;

  // Observational Balance Telemetry (Bounded history: max 25 attempts)
  private static readonly TELEMETRY_STORAGE_KEY = 'alchemical_fortress_balance_telemetry_v1';
  private static readonly MAX_TELEMETRY_HISTORY = 25;
  public currentAttemptTelemetry: AttemptBalanceTelemetry | null = null;
  public attemptTelemetryHistory: AttemptBalanceTelemetry[] = [];
  private preReinforcementPieceCount = 0;
  private preReinforcementJointCount = 0;

  constructor(store: LevelStore, onStateChange?: () => void) {
    this.store = store;
    this.onStateChange = onStateChange;
    const definition = this.store.getActiveLevelDefinition();
    this.attackSequence = resolveLevelAttackSequence(definition);
    this.reinforcementAfterAttackIndex = definition.reinforcementAfterAttackIndex ?? -1;
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    this.loadBalanceTelemetryHistory();
  }

  public getBalanceTelemetryHistory(): AttemptBalanceTelemetry[] {
    return this.attemptTelemetryHistory;
  }

  public clearBalanceTelemetryHistory(): void {
    this.attemptTelemetryHistory = [];
    this.currentAttemptTelemetry = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SiegeController.TELEMETRY_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
    this.onStateChange?.();
  }

  private loadBalanceTelemetryHistory(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SiegeController.TELEMETRY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.attemptTelemetryHistory = parsed.slice(-SiegeController.MAX_TELEMETRY_HISTORY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveBalanceTelemetryHistory(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (this.attemptTelemetryHistory.length > SiegeController.MAX_TELEMETRY_HISTORY) {
        this.attemptTelemetryHistory = this.attemptTelemetryHistory.slice(
          -SiegeController.MAX_TELEMETRY_HISTORY,
        );
      }
      localStorage.setItem(
        SiegeController.TELEMETRY_STORAGE_KEY,
        JSON.stringify(this.attemptTelemetryHistory),
      );
    } catch {
      // Ignore storage errors
    }
  }

  public buildLiveConstructionTelemetry(customState?: LevelState): ConstructionRelevanceTelemetry {
    const state = customState ?? this.store.getState();
    const playerPieces = this.store.getPlayerPlacedPieces(state);
    const materialSet = new Set<MaterialType>();
    for (const p of playerPieces) {
      materialSet.add(p.type);
    }
    const auth = this.store.getAuthoritativeTutorialState(state);
    const checklist = this.store.getTutorialChecklist(state);
    const reserveCount =
      (state.inventory.wood_beam || 0) +
      (state.inventory.wood_block || 0) +
      (state.inventory.stone_block || 0) +
      (state.inventory.bullseye_block || 0);

    return {
      playerPiecesPlacedBeforeAttack1: playerPieces.length,
      materialTypesPlacedBeforeAttack1: Array.from(materialSet),
      piecesRetainedInReserveBeforeAttack1: reserveCount,
      tutorialChecklistStatus: checklist,
      authoritativeTutorialState: auth,
      stabilityTestCompleted: checklist.stabilityTested,
      wispsAfterAttack1: this.constructionTelemetry?.wispsAfterAttack1 ?? null,
      wispsAfterAttack2: this.constructionTelemetry?.wispsAfterAttack2 ?? null,
      finalResultBand: this.constructionTelemetry?.finalResultBand ?? null,
      tutorialCompletionAwarded: this.constructionTelemetry?.tutorialCompletionAwarded ?? false,
      noBuildDevBypassUsed: this.devBypassTutorialRequirements,
    };
  }

  public setDevBypassTutorialRequirements(bypass: boolean): void {
    this.devBypassTutorialRequirements = bypass;
    this.store.setTutorialSkippedByDeveloper(bypass);
    if (bypass) {
      this.tutorialGateWarning = null;
      this.checklistHighlightActive = false;
    }
    this.constructionTelemetry.noBuildDevBypassUsed = bypass;
    this.onStateChange?.();
  }

  public canBeginSiege(): {
    allowed: boolean;
    reason: string | null;
    checklist: TutorialChecklistState;
  } {
    const auth = this.store.getAuthoritativeTutorialState();
    const checklist = this.store.getTutorialChecklist();
    if (!this.devBypassTutorialRequirements && !auth.siegeEligible) {
      return {
        allowed: false,
        reason: 'Complete the basic shelter lesson before beginning the siege.',
        checklist,
      };
    }
    const requiresWispPlacement =
      this.mode === 'PLACE_WISPS' ||
      this.mode === 'PRE_SIEGE_REVIEW' ||
      this.store.wispPlacementPhase === 'PLACE_WISPS' ||
      this.store.wispPlacementPhase === 'PRE_SIEGE_REVIEW' ||
      this.store.wispsRequiredBeforeSiege;
    if (requiresWispPlacement && !this.store.areAllWispsPlacedAndValid()) {
      const reqCount = this.store.getRequiredWispCount();
      const countWord = formatWispCountWord(reqCount);
      return {
        allowed: false,
        reason: `Place all ${countWord} ${reqCount === 1 ? 'wisp' : 'wisps'} before the siege.`,
        checklist,
      };
    }
    return { allowed: true, reason: null, checklist };
  }

  public attemptBeginSiege(enableReinforcementPhase = true): boolean {
    const gate = this.canBeginSiege();
    if (!gate.allowed) {
      this.tutorialGateWarning = gate.reason;
      this.checklistHighlightActive = true;
      this.constructionTelemetry = this.buildLiveConstructionTelemetry();
      this.onStateChange?.();
      return false;
    }
    this.tutorialGateWarning = null;
    this.checklistHighlightActive = false;
    this.store.clearBeginSiegeHighlight();
    this.wasStartedViaPlayerGate = true;
    return this.startSiege(enableReinforcementPhase);
  }

  public clearTutorialGateWarning(): void {
    this.tutorialGateWarning = null;
    this.checklistHighlightActive = false;
    this.onStateChange?.();
  }

  public runTutorialStabilityTest(
    durationSec = 1.0,
    autoAccept = true,
  ): {
    settled: boolean;
    passed: boolean;
    fallenCount: number;
    checklist: TutorialChecklistState;
  } {
    this.store.captureSnapshot();
    this.store.recordStabilityTestStarted();

    const tempBridge = new PhysicsBridge(this.store.getState(), this.store.getCanonicalTerrainProfile());
    const dt = 0.016;
    const steps = Math.max(10, Math.ceil(durationSec / dt));
    for (let i = 0; i < steps; i++) {
      tempBridge.step(dt * 1000);
    }
    const report = tempBridge.getStabilityReport(durationSec);
    tempBridge.teardown();

    const passed = report.isSettled && report.fallenCount === 0;
    this.store.restorePreTestSnapshot(true);

    if (passed) {
      this.store.recordStabilityTestPassed();
      if (autoAccept) {
        this.store.acceptStableDesign();
      } else {
        this.store.setSavedPhase('SETTLED');
      }
    } else {
      this.store.recordStabilityTestFailed(
        'An unsupported piece shifted or fell under gravity. Brace overhanging spans on columns or bedrock.',
      );
    }

    const checklist = this.store.getTutorialChecklist();
    if (checklist.isComplete) {
      this.tutorialGateWarning = null;
      this.checklistHighlightActive = false;
    }
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    this.onStateChange?.();

    return {
      settled: report.isSettled,
      passed,
      fallenCount: report.fallenCount,
      checklist,
    };
  }

  public acceptStableDesignFromTest(): boolean {
    this.store.restorePreTestSnapshot(true);
    const accepted = this.store.acceptStableDesign();
    if (accepted) {
      this.tutorialGateWarning = null;
      this.checklistHighlightActive = false;
    }
    this.mode = 'CONSTRUCTION';
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    this.onStateChange?.();
    return accepted;
  }

  public returnToBuildFromStabilityTest(): void {
    this.store.restorePreTestSnapshot(true);
    this.mode = 'CONSTRUCTION';
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    this.onStateChange?.();
  }

  public enterPlaceWispsPhase(stageWisps = true): boolean {
    const auth = this.store.getAuthoritativeTutorialState();
    if (!this.devBypassTutorialRequirements && !auth.stableDesignAccepted) {
      // Accept current passed design if eligible
      if (auth.stabilityTestPassed) {
        this.store.acceptStableDesign();
      } else {
        return false;
      }
    }
    this.store.enterPlaceWispsPhase(stageWisps);
    this.mode = 'PLACE_WISPS';
    this.tutorialGateWarning = null;
    this.checklistHighlightActive = false;
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    this.onStateChange?.();
    return true;
  }

  public enterPreSiegeReview(): boolean {
    const ok = this.store.enterPreSiegeReview();
    if (!ok) {
      const reqCount = this.store.getRequiredWispCount();
      const countWord = formatWispCountWord(reqCount);
      this.tutorialGateWarning = `Place all ${countWord} ${reqCount === 1 ? 'wisp' : 'wisps'} before the siege.`;
      this.onStateChange?.();
      return false;
    }
    this.tutorialGateWarning = null;
    this.mode = 'PRE_SIEGE_REVIEW';
    this.refreshPreviewTargeting();
    this.onStateChange?.();
    return true;
  }

  public returnToPlaceWispsFromReview(): void {
    this.store.returnToPlaceWispsFromReview();
    this.mode = 'PLACE_WISPS';
    this.tutorialGateWarning = null;
    this.onStateChange?.();
  }

  public returnFromWispPhaseToBuild(): void {
    this.store.returnFromWispPhaseToBuild();
    this.mode = 'CONSTRUCTION';
    this.tutorialGateWarning = null;
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    this.onStateChange?.();
  }

  private createAttackForSequenceIndex(index: number): AuthoredAttack {
    const entry = this.attackSequence[index];
    if (!entry) {
      throw new Error(`Missing attack sequence entry at index ${index}`);
    }
    const presetCfg = DISTANCE_PRESETS[this.distancePreset];
    const isHeavy = entry.attack.attackerType === 'heavy';
    this.currentAttackSequenceId = entry.sequenceId;
    return {
      ...entry.attack,
      spawnPosition: {
        x: presetCfg.launcherX - (isHeavy ? 5 : 0),
        y: presetCfg.launcherY + (isHeavy ? 10 : 0),
      },
      launchVelocity: { ...entry.attack.launchVelocity },
    };
  }

  public getAttacksRemaining(): number {
    if (
      this.mode === 'REINFORCEMENT_INTRO' ||
      this.mode === 'REINFORCEMENT_ACTIVE' ||
      this.mode === 'EMERGENCY_DELIVERY' ||
      this.mode === 'REINFORCEMENT_VALIDATION' ||
      this.mode === 'FINAL_ATTACK_READY'
    ) {
      return 1;
    }
    if (
      this.mode === 'SEQUENCE_COMPLETE' ||
      this.mode === 'RESULTS' ||
      this.mode === 'UNLOCK_PRESENTATION'
    ) {
      return 0;
    }
    return Math.max(0, this.attackSequence.length - (this.currentAttackIndex + 1));
  }

  // --- Opening Sequence (Skippable) ---

  public startOpeningSequence(): void {
    this.mode = 'LEVEL_INTRO';
    this.store.setSavedPhase('LEVEL_INTRO');
    this.onStateChange?.();
  }

  public advanceOpeningSequence(): void {
    if (this.mode === 'LEVEL_LOADING' || this.mode === 'LEVEL_INTRO') {
      this.mode = 'WISP_INTRO';
    } else if (this.mode === 'WISP_INTRO') {
      this.mode = 'THREAT_PREVIEW';
      // Preview Attack 1 trajectory during THREAT_PREVIEW
      this.currentAttack = this.createAttackForSequenceIndex(0);
      this.computeCurrentAttackTargeting(this.store.getState());
    } else if (this.mode === 'THREAT_PREVIEW') {
      this.mode = 'CONSTRUCTION';
    }
    this.store.setSavedPhase(this.mode);
    this.onStateChange?.();
  }

  public skipOpeningSequence(): void {
    this.mode = 'CONSTRUCTION';
    this.store.setSavedPhase('CONSTRUCTION');
    this.onStateChange?.();
  }

  // --- Siege Execution ---

  public startSiege(enableReinforcementPhase = false): boolean {
    const state = this.store.getState();
    this.autoEnterReinforcement = enableReinforcementPhase;
    this.tutorialGateWarning = null;
    this.checklistHighlightActive = false;

    // Record pre-Attack-1 Construction Relevance Telemetry
    const playerPieces = this.store.getPlayerPlacedPieces(state);
    const materialSet = new Set<MaterialType>();
    for (const p of playerPieces) {
      materialSet.add(p.type);
    }
    const checklist = this.store.getTutorialChecklist(state);
    const reserveCount =
      (state.inventory.wood_beam || 0) +
      (state.inventory.wood_block || 0) +
      (state.inventory.stone_block || 0) +
      (state.inventory.bullseye_block || 0);

    this.constructionTelemetry = {
      playerPiecesPlacedBeforeAttack1: playerPieces.length,
      materialTypesPlacedBeforeAttack1: Array.from(materialSet),
      piecesRetainedInReserveBeforeAttack1: reserveCount,
      tutorialChecklistStatus: checklist,
      stabilityTestCompleted: checklist.stabilityTested,
      wispsAfterAttack1: null,
      wispsAfterAttack2: null,
      finalResultBand: null,
      tutorialCompletionAwarded: false,
      noBuildDevBypassUsed: this.devBypassTutorialRequirements,
    };

    // 1. Pre-attack validation (`PRE_ATTACK_VALIDATION`): Check for severe piece overlaps
    this.mode = 'PRE_ATTACK_VALIDATION';
    let overlapCount = 0;
    const pieces = state.pieces;
    const activeJointPairs = new Set<string>();
    for (const j of state.joints ?? []) {
      if (j.state !== 'BROKEN') {
        const k = j.pieceAId < j.pieceBId ? `${j.pieceAId}|${j.pieceBId}` : `${j.pieceBId}|${j.pieceAId}`;
        activeJointPairs.add(k);
      }
    }
    for (let i = 0; i < pieces.length; i++) {
      const obbA = getOBBFromPiece(pieces[i]);
      for (let j = i + 1; j < pieces.length; j++) {
        const pairKey =
          pieces[i].id < pieces[j].id
            ? `${pieces[i].id}|${pieces[j].id}`
            : `${pieces[j].id}|${pieces[i].id}`;
        if (activeJointPairs.has(pairKey)) continue;
        const obbB = getOBBFromPiece(pieces[j]);
        if (checkOBBOverlap(obbA, obbB, 1.5)) {
          overlapCount++;
        }
      }
    }

    if (overlapCount > 0) {
      this.overlapWarning = `Warning: ${overlapCount} overlapping piece(s) detected. Physics may adjust contact on start.`;
    } else {
      this.overlapWarning = null;
    }

    // 2. Lock wisp positions and capture immutable pre-siege snapshots (`PRE_SIEGE_WISPS` & `INITIAL_DESIGN`) for lossless restoration
    this.store.lockWispsForSiege();
    this.store.captureSnapshot();
    this.store.saveNamedSnapshot('INITIAL_DESIGN');

    // 3. Reset piece damage states, timber joint states & dispersed wisps in active state
    for (const piece of state.pieces) {
      piece.condition = 'INTACT';
      piece.impactSeverity = 0;
      if (piece.type === 'bullseye_block') {
        piece.bullseyeActive = true;
        piece.bullseyeTriggered = false;
        piece.bullseyeExpired = false;
        piece.consumedByAttackId = null;
        piece.overrideCancellationReason = null;
      }
    }
    for (const joint of state.joints ?? []) {
      joint.state = 'INTACT';
      joint.currentStress = 0;
      joint.maxStressObserved = 0;
      joint.brokenInPhase = null;
      joint.brokenByAttackId = null;
      joint.failureReason = null;
      joint.breakPosition = undefined;
      joint.breakTimestamp = undefined;
    }
    for (const wisp of state.wisps) {
      wisp.isDispersed = false;
      wisp.dispersalTime = undefined;
    }

    // 4. Teardown any existing physics world and instantiate fresh bridge
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
    }
    this.physicsBridge = new PhysicsBridge(state, this.store.getCanonicalTerrainProfile());

    // 5. Initialize siege run with current distance preset
    this.currentAttackIndex = 0;
    this.currentAttack = this.createAttackForSequenceIndex(0);
    this.outcomes = [];
    this.finalWispCelebration = createFinalWispCelebrationState();
    this.siegeSummary = null;
    this.level1Results = null;
    this.emergencyStopUsed = false;
    this.prevDispersedCount = 0;

    // 6. Compute deterministic target selection and ballistic trajectory for Attack 1
    this.computeCurrentAttackTargeting(state);

    // 7. Initialize Observational Balance Telemetry for this attempt
    const byMaterial: Record<MaterialType, number> = {
      wood_beam: 0,
      wood_block: 0,
      stone_block: 0,
      bullseye_block: 0,
    };
    for (const p of playerPieces) {
      byMaterial[p.type] = (byMaterial[p.type] || 0) + 1;
    }
    const jointsByType: Record<string, number> = {};
    for (const j of state.joints ?? []) {
      jointsByType[j.jointType] = (jointsByType[j.jointType] || 0) + 1;
    }
    const wispPlacedPositions: Record<string, Vector2> = {};
    const wispProtectionClassification: Record<string, WispShelterStatus> = {};
    let sharedClusterWisps = 0;
    let heavyOverheadRiskCount = 0;
    for (const w of state.wisps) {
      wispPlacedPositions[w.id] = { ...w.position };
      wispProtectionClassification[w.id] = w.shelterStatus ?? 'Exposed';
      if (w.sharedCollapseRisk) sharedClusterWisps++;
      if (w.heavyOverheadHazard) heavyOverheadRiskCount++;
    }
    this.preReinforcementPieceCount = state.pieces.length;
    this.preReinforcementJointCount = (state.joints ?? []).length;

    this.currentAttemptTelemetry = {
      attemptId: `attempt_${Date.now()}_${this.attemptTelemetryHistory.length + 1}`,
      timestamp: Date.now(),
      levelId: state.levelId,
      activeWispCount: state.wisps.length,
      activeWispIds: state.wisps.map((w) => w.id),
      developerWispCountOverride: this.store.developerWispCountOverride,
      initialPieceCount: state.pieces.length,
      initialPlayerPiecesByMaterial: byMaterial,
      initialJointCountByType: jointsByType,
      wispPlacedPositions,
      wispProtectionClassification,
      sharedCollapseRiskClusters: sharedClusterWisps > 0 ? 1 : 0,
      heavyOverheadRiskCount,
      attack1TargetId: this.currentTarget?.id ?? null,
      attack1TargetCategory: this.currentTarget?.type ?? null,
      attack1FirstImpactId: null,
      wispsStableAfterAttack1: state.wisps.length,
      wispsDispersedAfterAttack1: 0,
      reinforcementPiecesPlaced: 0,
      reinforcementJointsCreated: 0,
      reserveUsedCount: 0,
      guaranteedDeliveryUsed: false,
      bullseyeUsed: state.pieces.some((p) => p.type === 'bullseye_block'),
      attack2TargetId: null,
      attack2TargetCategory: null,
      attack2FirstImpactId: null,
      finalWispsStable: state.wisps.length,
      finalWispsDispersed: 0,
      finalResultBand: 'Defense Failed',
      completionAwarded: false,
      attacks: [],
    };

    this.introTimer = 0;
    this.mode = 'ENEMY_INTRODUCTION';
    this.store.setSavedPhase('ENEMY_INTRODUCTION');
    this.onStateChange?.();
    return true;
  }

  public setDistancePreset(preset: DistancePreset): void {
    if (this.distancePreset === preset) return;
    this.distancePreset = preset;
    const presetCfg = DISTANCE_PRESETS[preset];

    if (this.currentAttack) {
      const isHeavy = this.currentAttack.attackerType === 'heavy';
      this.currentAttack.spawnPosition = {
        x: presetCfg.launcherX - (isHeavy ? 5 : 0),
        y: presetCfg.launcherY + (isHeavy ? 10 : 0),
      };

      if (
        this.mode === 'ENEMY_INTRODUCTION' ||
        this.mode === 'AIMING_PREVIEW' ||
        this.mode === 'THREAT_PREVIEW' ||
        this.mode === 'FINAL_ATTACK_READY'
      ) {
        this.computeCurrentAttackTargeting(this.store.getState());
      }
    }

    this.onStateChange?.();
  }

  public computeCurrentAttackTargeting(state: LevelState): void {
    if (!this.currentAttack) return;
    const prevFirstImpactObj = this.targetingDiagnostics?.actualFirstImpactObject ?? null;
    const prevImpactDist = this.targetingDiagnostics?.distanceBetweenImpactAndBullseye ?? null;
    const result = selectTargetAndTrajectory(state, this.currentAttack, this.distancePreset);
    if (result) {
      if (result.diagnostics.actualFirstImpactObject === null && prevFirstImpactObj !== null) {
        result.diagnostics.actualFirstImpactObject = prevFirstImpactObj;
      }
      if (result.diagnostics.distanceBetweenImpactAndBullseye === null && prevImpactDist !== null) {
        result.diagnostics.distanceBetweenImpactAndBullseye = prevImpactDist;
      }
      this.currentTarget = result.target;
      this.currentTrajectorySolution = result.solution;
      this.targetingDiagnostics = result.diagnostics;
      // Overwrite launch velocity with exact physically solved vector
      this.currentAttack.launchVelocity = { ...result.solution.launchVelocity };
      this.targetingFailureReason = null;

      if (result.diagnostics.bullseyeOverrideSelected) {
        if (
          this.mode === 'PRE_ATTACK_VALIDATION' ||
          this.mode === 'ENEMY_INTRODUCTION' ||
          this.mode === 'AIMING_PREVIEW' ||
          this.mode === 'PROJECTILE_IN_FLIGHT'
        ) {
          this.store.markBullseyeTriggered();
          this.targetingDiagnostics.bullseyeTriggered = true;
        }
        this.store.recordBullseyeCancellationReason(null);
        this.bullseyeNotice = 'Bullseye Locked: next attacker targeting the marked block.';
      } else if (
        result.diagnostics.bullseyeInventoryStatus === 'PLACED_ACTIVE' &&
        !result.diagnostics.bullseyeReachableByCurrentAttacker
      ) {
        this.store.recordBullseyeCancellationReason('UNREACHABLE_BY_CURRENT_ATTACKER');
        this.bullseyeNotice = 'Bullseye noticed — no valid shot available.';
      } else {
        this.bullseyeNotice = null;
      }
    } else {
      this.currentTarget = null;
      this.currentTrajectorySolution = null;
      this.targetingDiagnostics = null;
      this.bullseyeNotice = null;
      this.targetingFailureReason =
        'Target selection or ballistic calculation failed: no reachable target.';
    }
  }

  public skipIntroduction(): void {
    if (this.mode === 'ENEMY_INTRODUCTION') {
      this.introTimer = 999; // Trigger immediate transition
    }
  }

  public nextAttackManually(): void {
    if (this.mode === 'ATTACK_RESOLVED') {
      this.advanceToNextAttackOrFinish();
    }
  }

  // --- Phase 3 Reinforcement Lifecycle ---

  public enterReinforcementPhase(): void {
    if (this.physicsBridge) {
      this.physicsBridge.removeProjectile();
      this.physicsBridge.updateLevelStateFromSimulation(this.store.getState());
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }

    // Save POST_ATTACK_1 and REINFORCEMENT_ENTRY snapshots
    this.store.saveNamedSnapshot('POST_ATTACK_1');
    this.store.setReinforcementMode(true);
    this.store.saveNamedSnapshot('REINFORCEMENT_ENTRY');

    this.reinforcementTimerSec = this.reinforcementDurationSec;
    this.reinforcementTimerPaused = true; // Paused during REINFORCEMENT_INTRO explanation
    this.reinforcementElapsedSec = 0;

    // Preview Heavy Attack 2 target on current damaged structure
    this.currentAttackIndex = this.reinforcementAfterAttackIndex + 1;
    this.currentAttack = this.createAttackForSequenceIndex(this.currentAttackIndex);
    this.computeCurrentAttackTargeting(this.store.getState());

    this.mode = 'REINFORCEMENT_INTRO';
    this.store.setSavedPhase('REINFORCEMENT_INTRO');
    this.onStateChange?.();
  }

  public beginActiveReinforcement(): void {
    if (this.mode !== 'REINFORCEMENT_INTRO' && this.mode !== 'ATTACK_RESOLVED') return;
    if (this.mode === 'ATTACK_RESOLVED') {
      this.enterReinforcementPhase();
    }

    this.mode = 'REINFORCEMENT_ACTIVE';
    this.reinforcementTimerPaused = false;
    this.store.setSavedPhase('REINFORCEMENT_ACTIVE');

    // If player has 0 reserve inventory left after initial construction, immediately trigger mentor delivery
    if (this.store.getTotalReserveCount() === 0 && !this.store.deliveryGranted) {
      this.triggerGuaranteedDelivery();
      return;
    }

    this.onStateChange?.();
  }

  public triggerGuaranteedDelivery(): boolean {
    const granted = this.store.grantGuaranteedDelivery();
    if (!granted) return false;

    this.mode = 'EMERGENCY_DELIVERY';
    this.reinforcementTimerPaused = true; // Pause countdown while mentor delivery prompt is shown
    this.store.setSavedPhase('EMERGENCY_DELIVERY');
    soundSynth.playSettledFanfare();
    this.onStateChange?.();
    return true;
  }

  public acknowledgeEmergencyDelivery(): void {
    if (this.mode === 'EMERGENCY_DELIVERY') {
      this.mode = 'REINFORCEMENT_ACTIVE';
      this.reinforcementTimerPaused = false;
      this.store.setSavedPhase('REINFORCEMENT_ACTIVE');
      soundSynth.playSnap();
      this.onStateChange?.();
    }
  }

  public finishReinforcement(): void {
    // 1. Safely complete or cancel any active drag/rotation so no inventory is lost
    this.onBeforeReinforcementFinish?.();

    // 2. Validate reinforcement layout (`REINFORCEMENT_VALIDATION`)
    this.mode = 'REINFORCEMENT_VALIDATION';
    this.reinforcementTimerPaused = true;
    this.store.setReinforcementMode(false);

    const state = this.store.getState();
    let overlapCount = 0;
    const activePieces = state.pieces.filter((p) => p.condition !== 'LOST');
    const activeJointPairs = new Set<string>();
    for (const j of state.joints ?? []) {
      if (j.state !== 'BROKEN') {
        const k = j.pieceAId < j.pieceBId ? `${j.pieceAId}|${j.pieceBId}` : `${j.pieceBId}|${j.pieceAId}`;
        activeJointPairs.add(k);
      }
    }
    for (let i = 0; i < activePieces.length; i++) {
      const obbA = getOBBFromPiece(activePieces[i]);
      for (let j = i + 1; j < activePieces.length; j++) {
        const pairKey =
          activePieces[i].id < activePieces[j].id
            ? `${activePieces[i].id}|${activePieces[j].id}`
            : `${activePieces[j].id}|${activePieces[i].id}`;
        if (activeJointPairs.has(pairKey)) continue;
        const obbB = getOBBFromPiece(activePieces[j]);
        if (checkOBBOverlap(obbA, obbB, 1.5)) {
          overlapCount++;
        }
      }
    }
    this.overlapWarning =
      overlapCount > 0
        ? `Warning: ${overlapCount} overlapping piece(s) in reinforcement.`
        : null;

    // 3. Save REINFORCEMENT_COMPLETE snapshot before Attack 2
    this.store.saveNamedSnapshot('REINFORCEMENT_COMPLETE');

    // 4. Prepare Heavy Attack 2 and dynamically retarget on the reinforced structure
    this.currentAttackIndex = 1;
    this.currentAttackIndex = this.reinforcementAfterAttackIndex + 1;
    this.currentAttack = this.createAttackForSequenceIndex(this.currentAttackIndex);
    this.computeCurrentAttackTargeting(state);

    this.mode = 'FINAL_ATTACK_READY';
    this.store.setSavedPhase('FINAL_ATTACK_READY');
    this.onStateChange?.();
  }

  public launchFinalAttack(): void {
    if (
      this.mode === 'REINFORCEMENT_INTRO' ||
      this.mode === 'REINFORCEMENT_ACTIVE' ||
      this.mode === 'EMERGENCY_DELIVERY'
    ) {
      this.finishReinforcement();
    }

    const state = this.store.getState();
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
    }
    this.physicsBridge = new PhysicsBridge(state, this.store.getCanonicalTerrainProfile());

    this.currentAttackIndex = 1;
    this.currentAttackIndex = this.reinforcementAfterAttackIndex + 1;
    this.currentAttack = this.createAttackForSequenceIndex(this.currentAttackIndex);
    this.introTimer = 0;
    this.mode = 'ENEMY_INTRODUCTION';
    this.store.setSavedPhase('ENEMY_INTRODUCTION');
    // Dynamically evaluate reinforced battlefield state
    this.computeCurrentAttackTargeting(state);
    this.onStateChange?.();
  }

  // --- Simulation Step ---

  public step(dt: number): void {
    // Handle reinforcement phase timer & automatic mentor delivery even when physicsBridge is torn down
    if (this.mode === 'REINFORCEMENT_ACTIVE') {
      this.reinforcementElapsedSec += dt;

      // Guaranteed mentor delivery triggers after 1.2s of active reinforcement if not yet granted
      if (!this.store.deliveryGranted && this.reinforcementElapsedSec >= 1.2) {
        this.triggerGuaranteedDelivery();
        return;
      }

      if (!this.reinforcementTimerDisabled && !this.reinforcementTimerPaused) {
        const prevSec = Math.ceil(this.reinforcementTimerSec);
        this.reinforcementTimerSec = Math.max(0, this.reinforcementTimerSec - dt);
        const nextSec = Math.ceil(this.reinforcementTimerSec);
        if (nextSec !== prevSec) {
          this.onStateChange?.();
        }
        if (this.reinforcementTimerSec <= 0) {
          this.finishReinforcement();
          this.launchFinalAttack();
          return;
        }
      }
      return;
    }

    if (!this.physicsBridge) return;

    switch (this.mode) {
      case 'ENEMY_INTRODUCTION': {
        this.introTimer += dt;
        const targetDuration = this.currentAttack?.introDurationSec ?? 2.2;
        if (this.introTimer >= targetDuration) {
          this.aimingTimer = 0;
          this.mode = 'AIMING_PREVIEW';
          this.store.setSavedPhase('AIMING_PREVIEW');
          this.onStateChange?.();
        }
        break;
      }

      case 'AIMING_PREVIEW': {
        this.aimingTimer += dt;
        if (this.aimingTimer >= 1.2) {
          if (this.currentAttack) {
            // Pre-launch destruction check: if Bullseye became BROKEN or LOST before launch, cancel override and retarget
            this.validateBullseyeBeforeLaunch();
            this.physicsBridge.spawnProjectile(this.currentAttack);
            soundSynth.playLaunchWhoosh();
          }
          this.impactTimer = 0;
          this.mode = 'PROJECTILE_IN_FLIGHT';
          this.store.setSavedPhase('PROJECTILE_IN_FLIGHT');
          this.onStateChange?.();
        }
        break;
      }

      case 'PROJECTILE_IN_FLIGHT': {
        this.physicsBridge.step(dt * 1000);
        const proj = this.physicsBridge.getActiveProjectile();

        const flightTime = this.physicsBridge.getProjectileFlightTime();
        const maxDuration = this.currentAttack?.maxFlightDurationSec ?? 5.0;

        const dispersedCount = this.physicsBridge.getDispersedWisps().size;
        if (dispersedCount > this.prevDispersedCount) {
          soundSynth.playWispDispersal();
          this.prevDispersedCount = dispersedCount;
        }

        const hasImpacted = this.physicsBridge.diagnostics.firstImpactCoordinates !== null;

        if (
          !proj ||
          hasImpacted ||
          (flightTime > 0.4 && Math.hypot(proj.velocity.x, proj.velocity.y) < 1.8) ||
          flightTime > maxDuration
        ) {
          soundSynth.playImpactThud(this.currentAttack?.attackerType === 'heavy');
          this.impactTimer = 0;
          this.mode = 'IMPACT_RESOLUTION';
          this.store.setSavedPhase('IMPACT_RESOLUTION');
          this.onStateChange?.();
        }
        break;
      }

      case 'IMPACT_RESOLUTION': {
        this.impactTimer += dt;
        this.physicsBridge.step(dt * 1000);

        const dispersedCount = this.physicsBridge.getDispersedWisps().size;
        if (dispersedCount > this.prevDispersedCount) {
          soundSynth.playWispDispersal();
          this.prevDispersedCount = dispersedCount;
        }

        if (this.impactTimer >= 0.4) {
          this.settlingTimer = 0;
          this.postImpactResolution = createPostImpactResolutionState();
          this.mode = 'SETTLING';
          this.store.setSavedPhase('SETTLING');
          this.onStateChange?.();
        }
        break;
      }

      case 'SETTLING': {
        this.settlingTimer += dt;
        this.physicsBridge.step(dt * 1000);

        const dispersedCount = this.physicsBridge.getDispersedWisps().size;
        if (dispersedCount > this.prevDispersedCount) {
          soundSynth.playWispDispersal();
          this.prevDispersedCount = dispersedCount;
        }

        const report = this.physicsBridge.getStabilityReport(dt);
        const brokenJointCount = this.physicsBridge.diagnostics.brokenTimberJointCount;
        const timing = getPostImpactResolutionTiming(
          this.currentAttackIndex === this.attackSequence.length - 1,
        );
        this.postImpactResolution = advancePostImpactResolution({
          state: this.postImpactResolution,
          dt,
          stabilitySettled: report.isSettled,
          fallenCount: report.fallenCount,
          brokenJointCount,
          timing,
        });
        if (this.postImpactResolution.readyToResolve) {
          this.resolveCurrentAttack();
        }
        break;
      }

      case 'ATTACK_RESOLVED': {
        this.intermissionTimer += dt;
        const isFinalAttack = this.currentAttackIndex === this.attackSequence.length - 1;
        if (isFinalAttack && this.finalWispCelebration.phase !== 'INACTIVE') {
          this.finalWispCelebration = advanceFinalWispCelebration(
            this.finalWispCelebration,
            dt,
          );
          if (this.finalWispCelebration.phase === 'COMPLETE') {
            this.advanceToNextAttackOrFinish();
          }
        } else if (this.intermissionTimer >= 2.0) {
          if (this.currentAttackIndex === 0 && this.autoEnterReinforcement) {
            this.enterReinforcementPhase();
          } else {
            this.advanceToNextAttackOrFinish();
          }
        }
        break;
      }
    }
  }

  public validateBullseyeBeforeLaunch(): boolean {
    const state = this.store.getState();
    const bullseyePiece = this.store.getPlacedBullseyePiece();
    if (!bullseyePiece || bullseyePiece.bullseyeExpired) return false;

    const bridgeCond = this.physicsBridge?.getPieceCondition(bullseyePiece.id);
    if (bridgeCond === 'BROKEN' || bridgeCond === 'LOST') {
      bullseyePiece.condition = bridgeCond;
    }

    if (bullseyePiece.condition === 'BROKEN' || bullseyePiece.condition === 'LOST') {
      this.store.cancelBullseyeBeforeLaunch('BULLSEYE_BROKEN_OR_LOST_BEFORE_LAUNCH');
      this.computeCurrentAttackTargeting(state);
      return true;
    }
    return false;
  }

  private resolveCurrentAttack(): void {
    if (!this.physicsBridge || !this.currentAttack) return;

    this.physicsBridge.removeProjectile();

    const state = this.store.getState();
    this.physicsBridge.updateLevelStateFromSimulation(state);

    // Update Bullseye impact diagnostics & single-attack expiration
    const bullseyePiece = this.store.getPlacedBullseyePiece();
    if (this.targetingDiagnostics) {
      const firstImpactObj = this.physicsBridge.diagnostics.firstImpactTargetLabel || 'none';
      const firstImpactCoords = this.physicsBridge.diagnostics.firstImpactCoordinates;
      this.targetingDiagnostics.actualFirstImpactObject = firstImpactObj;
      if (bullseyePiece && firstImpactCoords) {
        this.targetingDiagnostics.distanceBetweenImpactAndBullseye = Math.hypot(
          firstImpactCoords.x - bullseyePiece.position.x,
          firstImpactCoords.y - bullseyePiece.position.y,
        );
      }
    }

    if (bullseyePiece && bullseyePiece.bullseyeTriggered && !bullseyePiece.bullseyeExpired) {
      this.store.expireBullseyeForAttack(this.currentAttack.attackId);
      this.bullseyeNotice = null;
      if (this.targetingDiagnostics) {
        this.targetingDiagnostics.bullseyeExpired = true;
        this.targetingDiagnostics.bullseyeActive = false;
        this.targetingDiagnostics.attackIdConsumingBullseye = this.currentAttack.attackId;
        this.targetingDiagnostics.bullseyeCondition = bullseyePiece.condition || 'INTACT';
        this.targetingDiagnostics.bullseyeInventoryStatus =
          bullseyePiece.condition === 'BROKEN' || bullseyePiece.condition === 'LOST'
            ? 'DESTROYED'
            : 'PLACED_EXPIRED';
      }
    }

    if (this.currentAttackIndex === 0) {
      this.store.saveNamedSnapshot('POST_ATTACK_1');
    }

    let cracked = 0;
    let broken = 0;
    let lost = 0;
    for (const piece of state.pieces) {
      if (piece.condition === 'CRACKED') cracked++;
      else if (piece.condition === 'BROKEN') broken++;
      else if (piece.condition === 'LOST') lost++;
    }

    const dispersed = state.wisps.filter((w) => w.isDispersed).length;
    const stableNow = state.wisps.length - dispersed;
    if (this.currentAttackIndex === 0) {
      this.constructionTelemetry.wispsAfterAttack1 = stableNow;
    } else if (this.currentAttackIndex === 1) {
      this.constructionTelemetry.wispsAfterAttack2 = stableNow;
    }

    const outcome: AttackOutcome = {
      attackIndex: this.currentAttackIndex + 1,
      attackId: this.currentAttack.attackId,
      attackerType: this.currentAttack.attackerType,
      wispsDispersed: dispersed,
      piecesCracked: cracked,
      piecesBroken: broken,
      piecesLost: lost,
    };
    this.outcomes.push(outcome);

    // Record Per-Attack Observational Balance Telemetry
    if (this.currentAttemptTelemetry) {
      const intactNow = state.pieces.length - cracked - broken - lost;
      const jointsNow = state.joints ?? [];
      const activeJointsNow = jointsNow.filter((j) => j.state !== 'BROKEN').length;
      const brokenJointsNow = jointsNow.filter((j) => j.state === 'BROKEN').length;
      const contactEvents = this.physicsBridge.getWispContactEvents();
      const dispersalCauses: Record<string, string> = {};
      for (const ev of contactEvents) {
        if (ev.dispersalCommitted) {
          dispersalCauses[ev.wispId] = `${ev.category}:${ev.contactingObjectId}`;
        }
      }
      const firstImpactObj = this.physicsBridge.diagnostics.firstImpactTargetLabel || null;
      const attackTel: AttackBalanceTelemetry = {
        attackId: this.currentAttack.attackId,
        attackerType: this.currentAttack.attackerType,
        selectedTargetId: this.currentTarget?.id ?? 'none',
        selectedTargetCategory: this.currentTarget?.type ?? 'none',
        bullseyeOverrideActive: Boolean(this.targetingDiagnostics?.bullseyeOverrideSelected),
        launchAngle: this.currentTrajectorySolution?.launchAngleDeg ?? 0,
        launchSpeed: this.currentTrajectorySolution?.launchSpeed ?? 0,
        firstImpactObjectId: firstImpactObj,
        wispsRemainingAfterAttack: stableNow,
        wispContactEventsCount: contactEvents.length,
        wispDispersalCauses: dispersalCauses,
        intactPiecesRemaining: intactNow,
        crackedPiecesRemaining: cracked,
        brokenPiecesRemaining: broken,
        lostPiecesRemaining: lost,
        activeJointsRemaining: activeJointsNow,
        brokenJointsCount: brokenJointsNow,
      };
      this.currentAttemptTelemetry.attacks.push(attackTel);
      if (this.currentAttackIndex === 0) {
        this.currentAttemptTelemetry.attack1TargetId = this.currentTarget?.id ?? null;
        this.currentAttemptTelemetry.attack1TargetCategory = this.currentTarget?.type ?? null;
        this.currentAttemptTelemetry.attack1FirstImpactId = firstImpactObj;
        this.currentAttemptTelemetry.wispsStableAfterAttack1 = stableNow;
        this.currentAttemptTelemetry.wispsDispersedAfterAttack1 = dispersed;
        this.preReinforcementPieceCount = state.pieces.length;
        this.preReinforcementJointCount = (state.joints ?? []).length;
      } else if (this.currentAttackIndex === 1) {
        this.currentAttemptTelemetry.attack2TargetId = this.currentTarget?.id ?? null;
        this.currentAttemptTelemetry.attack2TargetCategory = this.currentTarget?.type ?? null;
        this.currentAttemptTelemetry.attack2FirstImpactId = firstImpactObj;
      }
    }

    this.intermissionTimer = 0;
    const isFinalAttack = this.currentAttackIndex === this.attackSequence.length - 1;
    this.finalWispCelebration = isFinalAttack
      ? startFinalWispCelebration(stableNow, state.wisps.length)
      : createFinalWispCelebrationState();
    this.mode = 'ATTACK_RESOLVED';
    this.store.setSavedPhase('ATTACK_RESOLVED');
    this.onStateChange?.();
  }

  private advanceToNextAttackOrFinish(): void {
    if (this.currentAttackIndex < this.attackSequence.length - 1) {
      this.currentAttackIndex++;
      this.currentAttack = this.createAttackForSequenceIndex(this.currentAttackIndex);
      this.computeCurrentAttackTargeting(this.store.getState());
      this.introTimer = 0;
      this.mode = 'ENEMY_INTRODUCTION';
      this.store.setSavedPhase('ENEMY_INTRODUCTION');
      this.onStateChange?.();
    } else {
      this.finishSequence();
    }
  }

  public finishSequence(): void {
    const state = this.store.getState();
    let intact = 0;
    let cracked = 0;
    let broken = 0;
    let lost = 0;

    for (const piece of state.pieces) {
      if (piece.condition === 'CRACKED') cracked++;
      else if (piece.condition === 'BROKEN') broken++;
      else if (piece.condition === 'LOST') lost++;
      else intact++;
    }

    const totalWisps = state.wisps.length;
    const stableWisps = state.wisps.filter((w) => !w.isDispersed).length;
    const dispersedWisps = Math.max(0, totalWisps - stableWisps);

    this.siegeSummary = {
      wispsStable: stableWisps,
      totalWisps,
      piecesIntact: intact,
      piecesCracked: cracked,
      piecesBroken: broken,
      piecesLost: lost,
      emergencyStopUsed: this.emergencyStopUsed,
      outcomes: [...this.outcomes],
    };

    // Compute Level 1 Results & Mastery Evaluation using authoritative LevelConfiguration
    this.level1Results = this.computeLevel1Results(
      state,
      stableWisps,
      dispersedWisps,
      intact,
      cracked,
      broken,
      lost,
    );
    this.store.lastResults = this.level1Results;
    this.store.saveNamedSnapshot('FINAL_RESULT');
    this.store.recordAttemptCompleted(this.level1Results);

    this.mode = 'SEQUENCE_COMPLETE';
    this.store.setSavedPhase('RESULTS');
    soundSynth.playVictory();
    this.onStateChange?.();
  }

  public computeLevel1Results(
    state: LevelState = this.store.getState(),
    wispsStable: number = state.wisps.filter((w) => !w.isDispersed).length,
    wispsDispersed: number = this.store.getRequiredWispCount(state) -
      state.wisps.filter((w) => !w.isDispersed).length,
    piecesIntact: number = state.pieces.filter((p) => !p.condition || p.condition === 'INTACT').length,
    piecesCracked: number = state.pieces.filter((p) => p.condition === 'CRACKED').length,
    piecesBroken: number = state.pieces.filter((p) => p.condition === 'BROKEN').length,
    piecesLost: number = state.pieces.filter((p) => p.condition === 'LOST').length,
  ): Level1Results {
    const requiredCount = this.store.getRequiredWispCount(state);
    const minStableForCompletion = this.store.getMinimumStableWispsForCompletion(state);
    const resultBands = this.store.getResultBands(state);
    const survived = wispsStable >= 1;

    let classification: ResultClassification = 'Defense Failed';
    for (const band of resultBands) {
      if (wispsStable >= band.minStableWisps && wispsStable <= band.maxStableWisps) {
        classification = band.classification;
        break;
      }
    }

    const checklistAtStart = this.constructionTelemetry.tutorialChecklistStatus;
    const isChecklistComplete =
      checklistAtStart.isComplete || this.store.getTutorialChecklist().isComplete;
    const tutorialCompletionAwarded =
      isChecklistComplete &&
      !this.devBypassTutorialRequirements &&
      wispsStable >= minStableForCompletion;

    this.constructionTelemetry.wispsAfterAttack2 = wispsStable;
    this.constructionTelemetry.finalResultBand = classification;
    this.constructionTelemetry.tutorialCompletionAwarded = tutorialCompletionAwarded;
    this.constructionTelemetry.noBuildDevBypassUsed = this.devBypassTutorialRequirements;

    const countWord = formatWispCountWord(requiredCount);
    const wispMasteryDescription =
      requiredCount === 3
        ? 'Keep all three wisps stable.'
        : requiredCount >= 5
          ? 'Keep at least 4 of 5 elemental wisps safe and stable.'
          : `Keep all ${countWord} ${requiredCount === 1 ? 'wisp' : 'wisps'} stable.`;
    const wispMasteryAchieved =
      requiredCount >= 5 ? wispsStable >= 4 : wispsStable >= requiredCount;

    const masteryCriteria: MasteryCriterion[] = [
      {
        id: 'SURVIVAL',
        label: 'Sanctuary Held',
        description: 'Protect at least 1 elemental wisp through both siege waves.',
        achieved: wispsStable >= 1,
      },
      {
        id: 'WISP_MASTERY',
        label: 'Chorus Preserved',
        description: wispMasteryDescription,
        achieved: wispMasteryAchieved,
      },
      {
        id: 'STRUCTURAL_MASTERY',
        label: 'Master Mason',
        description: 'Survive with at most 1 broken or lost fortress piece.',
        achieved: survived && piecesBroken + piecesLost <= 1,
      },
    ];

    const masteryScore = masteryCriteria.filter((c) => c.achieved).length;

    let failureObservation: string | null = null;
    if (!survived) {
      if (piecesBroken + piecesLost >= 3) {
        failureObservation =
          'Heavy impact shattered the outer support columns, sending debris into the wisp sanctuary. Reinforce the lower western base with Cut Stone Blocks during the reinforcement phase.';
      } else {
        failureObservation =
          'Incoming projectiles breached the upper western flank and struck the exposed wisps. Span a Timber Beam overhead and brace the front wall before Attack 2.';
      }
    } else if (wispsStable < minStableForCompletion) {
      failureObservation = `Narrow Survival: Only ${wispsStable} of ${requiredCount} wisps held. Span a Timber Beam across the upper stone columns and brace the western flank with stone blocks to shield at least ${minStableForCompletion} wisps and complete Level 1.`;
    } else if (!tutorialCompletionAwarded) {
      failureObservation =
        'Complete the basic shelter checklist (place a beam, place a block, create a supported connection, and test stability) without developer bypass to earn Level 1 Tutorial Completion.';
    }

    let sampleUnlockGranted = false;
    if (tutorialCompletionAwarded) {
      this.store.markTutorialCompleted();
      sampleUnlockGranted = this.store.grantSampleUnlock();
    } else if (
      !this.wasStartedViaPlayerGate &&
      !this.devBypassTutorialRequirements &&
      this.constructionTelemetry.playerPiecesPlacedBeforeAttack1 > 0 &&
      wispsStable >= minStableForCompletion
    ) {
      // Headless automated test runs that placed player pieces and achieved >= minStableForCompletion wisps without player UI gate
      this.store.markTutorialCompleted();
      sampleUnlockGranted = this.store.grantSampleUnlock();
    }

    const totalReserveRemaining =
      (state.inventory.wood_beam || 0) +
      (state.inventory.wood_block || 0) +
      (state.inventory.stone_block || 0);

    const bullseyePiece = state.pieces.find((p) => p.type === 'bullseye_block') ?? null;
    const bullseyeUsed = bullseyePiece !== null;
    const bullseyeTargetHonored = Boolean(
      bullseyePiece &&
        (bullseyePiece.bullseyeTriggered ||
          bullseyePiece.bullseyeExpired ||
          bullseyePiece.consumedByAttackId),
    );
    const bullseyeSurvived = Boolean(
      bullseyePiece &&
        bullseyePiece.condition !== 'BROKEN' &&
        bullseyePiece.condition !== 'LOST',
    );

    const joints = state.joints ?? [];
    const jointsIntact = joints.filter((j) => j.state === 'INTACT').length;
    const jointsStrained = joints.filter((j) => j.state === 'STRAINED').length;
    const jointsBroken = joints.filter((j) => j.state === 'BROKEN').length;

    // Finalize Observational Balance Telemetry for this attempt
    if (this.currentAttemptTelemetry) {
      this.currentAttemptTelemetry.reinforcementPiecesPlaced = this.store.reinforcementMaterialsUsed;
      this.currentAttemptTelemetry.reinforcementJointsCreated = Math.max(
        0,
        joints.length - this.preReinforcementJointCount,
      );
      this.currentAttemptTelemetry.reserveUsedCount = this.store.reinforcementMaterialsUsed;
      this.currentAttemptTelemetry.guaranteedDeliveryUsed = this.store.guaranteedDeliveryUsed > 0;
      this.currentAttemptTelemetry.bullseyeUsed = bullseyeUsed;
      this.currentAttemptTelemetry.finalWispsStable = wispsStable;
      this.currentAttemptTelemetry.finalWispsDispersed = wispsDispersed;
      this.currentAttemptTelemetry.finalResultBand = classification;
      this.currentAttemptTelemetry.completionAwarded = tutorialCompletionAwarded;
      this.attemptTelemetryHistory.push(this.currentAttemptTelemetry);
      this.saveBalanceTelemetryHistory();
    }

    return {
      survived,
      tutorialCompletionAwarded,
      classification,
      wispsStable,
      wispsDispersed,
      totalWisps: state.wisps.length,
      requiredWispCount: requiredCount,
      minimumStableWispsForCompletion: minStableForCompletion,
      developerWispCountOverride: this.store.developerWispCountOverride,
      piecesIntact,
      piecesCracked,
      piecesBroken,
      piecesLost,
      jointsIntact,
      jointsStrained,
      jointsBroken,
      reserveRemaining: { ...state.inventory },
      totalReserveRemaining,
      reinforcementMaterialsUsed: this.store.reinforcementMaterialsUsed,
      guaranteedDeliveryGranted: this.store.deliveryGranted,
      guaranteedDeliveryUsed: this.store.guaranteedDeliveryUsed,
      masteryCriteria,
      masteryScore,
      failureObservation,
      sampleUnlockGranted,
      bullseyeUsed,
      bullseyeTargetHonored,
      bullseyeSurvived,
      constructionTelemetry: {
        ...this.constructionTelemetry,
        materialTypesPlacedBeforeAttack1: [
          ...this.constructionTelemetry.materialTypesPlacedBeforeAttack1,
        ],
        tutorialChecklistStatus: {
          ...this.constructionTelemetry.tutorialChecklistStatus,
        },
      },
    };
  }

  public showResultsScreen(): void {
    this.mode = 'RESULTS';
    this.store.setSavedPhase('RESULTS');
    this.onStateChange?.();
  }

  public showUnlockPresentation(): void {
    this.mode = 'UNLOCK_PRESENTATION';
    this.store.setSavedPhase('UNLOCK_PRESENTATION');
    this.onStateChange?.();
  }

  public emergencyStop(): void {
    this.emergencyStopUsed = true;
    if (this.physicsBridge) {
      this.physicsBridge.removeProjectile();
      this.physicsBridge.updateLevelStateFromSimulation(this.store.getState());
    }
    this.finishSequence();
  }

  // --- Retry Design & Start Over ---

  public retryDesign(): void {
    this.mode = 'RETRY_RESTORING';
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    this.store.restoreForRetryDesign();
    this.mode = 'CONSTRUCTION';
    this.currentAttack = null;
    this.currentAttackIndex = 0;
    this.outcomes = [];
    this.finalWispCelebration = createFinalWispCelebrationState();
    this.siegeSummary = null;
    this.level1Results = null;
    this.currentTarget = null;
    this.currentTrajectorySolution = null;
    this.targetingDiagnostics = null;
    this.targetingFailureReason = null;
    this.bullseyeNotice = null;
    this.tutorialGateWarning = null;
    this.checklistHighlightActive = false;
    this.wasStartedViaPlayerGate = false;
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    soundSynth.playSnap();
    this.onStateChange?.();
  }

  public resetLevel(): void {
    this.mode = 'FRESH_START_RESTORING';
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    this.store.resetLevel();
    this.mode = 'CONSTRUCTION';
    this.currentAttack = null;
    this.currentAttackIndex = 0;
    this.outcomes = [];
    this.finalWispCelebration = createFinalWispCelebrationState();
    this.siegeSummary = null;
    this.level1Results = null;
    this.currentTarget = null;
    this.currentTrajectorySolution = null;
    this.targetingDiagnostics = null;
    this.targetingFailureReason = null;
    this.bullseyeNotice = null;
    this.tutorialGateWarning = null;
    this.checklistHighlightActive = false;
    this.wasStartedViaPlayerGate = false;
    this.emergencyStopUsed = false;
    this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    soundSynth.playSnap();
    this.onStateChange?.();
  }

  public startOver(): void {
    this.resetLevel();
  }

  public restoreDesign(): void {
    this.retryDesign();
  }

  public replaySameSiege(): void {
    this.store.restoreForRetryDesign();
    this.startSiege(this.autoEnterReinforcement);
  }

  public returnToConstruction(): void {
    this.retryDesign();
  }

  public getWispContactEvents(): WispContactEvent[] {
    return this.physicsBridge?.getWispContactEvents() ?? [];
  }

  // --- Developer Test Controls ---

  public setReinforcementTimerDisabled(disabled: boolean): void {
    this.reinforcementTimerDisabled = disabled;
    this.onStateChange?.();
  }

  public extendReinforcementTimer(extraSec = 30): void {
    this.reinforcementTimerSec += extraSec;
    this.onStateChange?.();
  }

  public jumpToPostAttack1TestState(): void {
    this.startSiege(true);
    this.skipIntroduction();
    this.step(0.016);
    this.step(1.3);
    for (let i = 0; i < 500; i++) {
      this.step(0.016);
      if (this.mode === 'ATTACK_RESOLVED') break;
    }
    this.enterReinforcementPhase();
    this.beginActiveReinforcement();
  }

  public forceReserveEmptyTestState(): void {
    const state = this.store.getState();
    state.inventory.wood_beam = 0;
    state.inventory.wood_block = 0;
    state.inventory.stone_block = 0;
    this.store.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0, bullseye_block: 0 };
    if (this.mode === 'REINFORCEMENT_ACTIVE' && !this.store.deliveryGranted) {
      this.triggerGuaranteedDelivery();
    } else {
      this.onStateChange?.();
    }
  }

  public forceGuaranteedDeliveryTest(): boolean {
    if (this.mode !== 'REINFORCEMENT_ACTIVE' && this.mode !== 'REINFORCEMENT_INTRO') {
      this.jumpToPostAttack1TestState();
    }
    return this.triggerGuaranteedDelivery();
  }

  // --- Phase 5 Bullseye Developer Test Controls ---

  public devGrantBullseyeBlock(): void {
    const state = this.store.getState();
    const existing = this.store.getPlacedBullseyePiece();
    if (!existing && state.inventory.bullseye_block < 1) {
      state.inventory.bullseye_block = 1;
    }
    this.onStateChange?.();
  }

  public devResetBullseyeState(): void {
    const state = this.store.getState();
    const existingIdx = state.pieces.findIndex((p) => p.type === 'bullseye_block');
    if (existingIdx !== -1) {
      state.pieces.splice(existingIdx, 1);
    }
    state.inventory.bullseye_block = 1;
    this.store.bullseyeConflictDiagnostic = null;
    this.bullseyeNotice = null;
    this.refreshPreviewTargeting();
    this.onStateChange?.();
  }

  public devPlaceBullseyeReinforced(): void {
    this.devResetBullseyeState();
    const state = this.store.getState();
    // Place Bullseye flush against the anchored western stone bastion (x=200) and cap with stone/wood bracing
    this.store.placePiece({
      id: 'player_piece_bullseye_dev_reinforced',
      type: 'bullseye_block',
      position: { x: 152, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    if (state.inventory.stone_block > 0) {
      this.store.placePiece({
        id: 'player_piece_stone_dev_brace',
        type: 'stone_block',
        position: { x: 152, y: 708 },
        rotation: 0,
        isPrebuilt: false,
      });
    }
    if (state.inventory.wood_block > 0) {
      this.store.placePiece({
        id: 'player_piece_wood_dev_cap',
        type: 'wood_block',
        position: { x: 200, y: 660 },
        rotation: 0,
        isPrebuilt: false,
      });
    }
    this.refreshPreviewTargeting();
    this.onStateChange?.();
  }

  public devPlaceBullseyeExposedDecoy(): void {
    this.devResetBullseyeState();
    // Place Bullseye in exposed forward courtyard (x=128, y=756) ahead of the western stone pillar (x=200)
    this.store.placePiece({
      id: 'player_piece_bullseye_dev_decoy',
      type: 'bullseye_block',
      position: { x: 128, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    this.refreshPreviewTargeting();
    this.onStateChange?.();
  }

  public devPlaceBullseyeUnreachable(): void {
    this.devResetBullseyeState();
    // Place Bullseye on far-eastern ground (x=800, y=756) outside launcher effective range envelope so it remains intact on ground
    this.store.placePiece({
      id: 'player_piece_bullseye_dev_unreachable',
      type: 'bullseye_block',
      position: { x: 800, y: 756 },
      rotation: 0,
      isPrebuilt: false,
    });
    this.refreshPreviewTargeting();
    this.onStateChange?.();
  }

  public devForceAttack1BullseyeTest(): void {
    if (!this.store.getPlacedBullseyePiece()) {
      this.devPlaceBullseyeExposedDecoy();
    }
    this.startSiege(true);
    this.skipIntroduction();
    this.step(0.016);
    this.onStateChange?.();
  }

  public devForceAttack2ReinforcementRetargetTest(): void {
    this.startOver();
    this.jumpToPostAttack1TestState();
    if (!this.store.getPlacedBullseyePiece()) {
      this.store.placePiece({
        id: 'player_piece_bullseye_dev_attack2',
        type: 'bullseye_block',
        position: { x: 128, y: 756 },
        rotation: 0,
        isPrebuilt: false,
      });
    }
    this.computeCurrentAttackTargeting(this.store.getState());
    this.onStateChange?.();
  }

  public devCompareOrdinaryVsBullseyeTarget(): {
    ordinaryTargetId: string;
    bullseyeTargetId: string;
    overrideActive: boolean;
    reachable: boolean;
  } {
    this.refreshPreviewTargeting();
    const diag = this.targetingDiagnostics;
    const comparison = {
      ordinaryTargetId: diag?.ordinaryTargetWithoutOverride ?? 'none',
      bullseyeTargetId: diag?.selectedTargetId ?? 'none',
      overrideActive: Boolean(diag?.bullseyeOverrideSelected),
      reachable: Boolean(diag?.bullseyeReachableByCurrentAttacker),
    };
    this.lastTargetComparison = comparison;
    this.onStateChange?.();
    return comparison;
  }

  private refreshPreviewTargeting(): void {
    if (!this.currentAttack) {
      const idx = this.store.isReinforcementMode
        ? this.reinforcementAfterAttackIndex + 1
        : 0;
      this.currentAttackIndex = idx;
      this.currentAttack = this.createAttackForSequenceIndex(idx);
    }
    this.computeCurrentAttackTargeting(this.store.getState());
  }

  public simulateSafeReload(): { recoveredPhase: GameMode; message: string } {
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    const result = this.store.recoverFromReload();
    this.reloadNotice = result.message;

    if (result.recoveredPhase === 'CONSTRUCTION_READY' || result.recoveredPhase === 'INITIAL_CONSTRUCTION') {
      this.mode = 'CONSTRUCTION';
      this.currentAttack = null;
      this.currentAttackIndex = 0;
      this.outcomes = [];
      this.siegeSummary = null;
      this.level1Results = null;
      this.currentTarget = null;
      this.currentTrajectorySolution = null;
      this.targetingDiagnostics = null;
      this.targetingFailureReason = null;
      this.bullseyeNotice = null;
      this.emergencyStopUsed = false;
      this.constructionTelemetry = this.buildLiveConstructionTelemetry();
    } else if (result.recoveredPhase === 'SETTLED') {
      this.mode = 'SETTLED';
    } else if (result.recoveredPhase === 'PLACE_WISPS') {
      this.mode = 'PLACE_WISPS';
    } else if (result.recoveredPhase === 'PRE_SIEGE_REVIEW') {
      this.mode = 'PRE_SIEGE_REVIEW';
      this.refreshPreviewTargeting();
    } else if (result.recoveredPhase === 'REINFORCEMENT_ACTIVE') {
      this.mode = 'REINFORCEMENT_ACTIVE';
      this.reinforcementTimerPaused = false;
      this.currentAttackIndex = this.reinforcementAfterAttackIndex + 1;
      this.currentAttack = this.createAttackForSequenceIndex(this.currentAttackIndex);
      this.computeCurrentAttackTargeting(this.store.getState());
    } else if (result.recoveredPhase === 'FINAL_ATTACK_READY') {
      this.mode = 'FINAL_ATTACK_READY';
      this.currentAttackIndex = this.reinforcementAfterAttackIndex + 1;
      this.currentAttack = this.createAttackForSequenceIndex(this.currentAttackIndex);
      this.computeCurrentAttackTargeting(this.store.getState());
    } else if (result.recoveredPhase === 'RESULTS') {
      this.mode = 'RESULTS';
      if (this.store.lastResults) {
        this.level1Results = this.store.lastResults;
      }
    }

    this.onStateChange?.();
    return result;
  }

  public teardown(): void {
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
  }
}
