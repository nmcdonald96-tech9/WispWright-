/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundSynth } from '../audio/synth';
import { checkOBBOverlap, getOBBFromPiece } from '../math/geometry';
import { PhysicsBridge } from '../physics/physicsBridge';
import { LevelStore } from '../state/levelStore';
import {
  AttackOutcome,
  AuthoredAttack,
  GameMode,
  Level1Results,
  LevelState,
  MasteryCriterion,
  ResultClassification,
  SiegeSummary,
} from '../types';
import { AUTHORED_ATTACKS, DistancePreset, DISTANCE_PRESETS } from './siegeConfig';
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
  public distancePreset: DistancePreset = 'STANDARD';
  public outcomes: AttackOutcome[] = [];
  public siegeSummary: SiegeSummary | null = null;
  public level1Results: Level1Results | null = null;

  // Targeting & Ballistics
  public currentTarget: TargetCandidate | null = null;
  public currentTrajectorySolution: TrajectorySolution | null = null;
  public targetingDiagnostics: TargetingDiagnostics | null = null;
  public targetingFailureReason: string | null = null;

  // Phase timers
  public introTimer = 0;
  public aimingTimer = 0;
  public impactTimer = 0;
  public settlingTimer = 0;
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

  constructor(store: LevelStore, onStateChange?: () => void) {
    this.store = store;
    this.onStateChange = onStateChange;
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
    return Math.max(0, AUTHORED_ATTACKS.length - (this.currentAttackIndex + 1));
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
      const presetCfg = DISTANCE_PRESETS[this.distancePreset];
      this.currentAttack = {
        ...AUTHORED_ATTACKS[0],
        spawnPosition: { x: presetCfg.launcherX, y: presetCfg.launcherY },
      };
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

    // 1. Pre-attack validation (`PRE_ATTACK_VALIDATION`): Check for severe piece overlaps
    this.mode = 'PRE_ATTACK_VALIDATION';
    let overlapCount = 0;
    const pieces = state.pieces;
    for (let i = 0; i < pieces.length; i++) {
      const obbA = getOBBFromPiece(pieces[i]);
      for (let j = i + 1; j < pieces.length; j++) {
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

    // 2. Capture immutable pre-siege snapshot (`INITIAL_DESIGN`) for lossless restoration
    this.store.captureSnapshot();
    this.store.saveNamedSnapshot('INITIAL_DESIGN');

    // 3. Reset piece damage states & dispersed wisps in active state
    for (const piece of state.pieces) {
      piece.condition = 'INTACT';
      piece.impactSeverity = 0;
    }
    for (const wisp of state.wisps) {
      wisp.isDispersed = false;
      wisp.dispersalTime = undefined;
    }

    // 4. Teardown any existing physics world and instantiate fresh bridge
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
    }
    this.physicsBridge = new PhysicsBridge(state);

    // 5. Initialize siege run with current distance preset
    this.currentAttackIndex = 0;
    const presetCfg = DISTANCE_PRESETS[this.distancePreset];
    this.currentAttack = {
      ...AUTHORED_ATTACKS[0],
      spawnPosition: { x: presetCfg.launcherX, y: presetCfg.launcherY },
    };
    this.outcomes = [];
    this.siegeSummary = null;
    this.level1Results = null;
    this.emergencyStopUsed = false;
    this.prevDispersedCount = 0;

    // 6. Compute deterministic target selection and ballistic trajectory for Attack 1
    this.computeCurrentAttackTargeting(state);

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
    const result = selectTargetAndTrajectory(state, this.currentAttack, this.distancePreset);
    if (result) {
      this.currentTarget = result.target;
      this.currentTrajectorySolution = result.solution;
      this.targetingDiagnostics = result.diagnostics;
      // Overwrite launch velocity with exact physically solved vector
      this.currentAttack.launchVelocity = { ...result.solution.launchVelocity };
      this.targetingFailureReason = null;
    } else {
      this.currentTarget = null;
      this.currentTrajectorySolution = null;
      this.targetingDiagnostics = null;
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
    const presetCfg = DISTANCE_PRESETS[this.distancePreset];
    this.currentAttack = {
      ...AUTHORED_ATTACKS[1],
      spawnPosition: { x: presetCfg.launcherX - 5, y: presetCfg.launcherY + 10 },
    };
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
    for (let i = 0; i < activePieces.length; i++) {
      const obbA = getOBBFromPiece(activePieces[i]);
      for (let j = i + 1; j < activePieces.length; j++) {
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
    const presetCfg = DISTANCE_PRESETS[this.distancePreset];
    this.currentAttack = {
      ...AUTHORED_ATTACKS[1],
      spawnPosition: { x: presetCfg.launcherX - 5, y: presetCfg.launcherY + 10 },
    };
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
    this.physicsBridge = new PhysicsBridge(state);

    this.currentAttackIndex = 1;
    const presetCfg = DISTANCE_PRESETS[this.distancePreset];
    this.currentAttack = {
      ...AUTHORED_ATTACKS[1],
      spawnPosition: { x: presetCfg.launcherX - 5, y: presetCfg.launcherY + 10 },
    };
    // Dynamically evaluate reinforced battlefield state
    this.computeCurrentAttackTargeting(state);

    this.introTimer = 0;
    this.mode = 'ENEMY_INTRODUCTION';
    this.store.setSavedPhase('ENEMY_INTRODUCTION');
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
        if (report.isSettled || this.settlingTimer >= 6.0) {
          this.resolveCurrentAttack();
        }
        break;
      }

      case 'ATTACK_RESOLVED': {
        this.intermissionTimer += dt;
        if (this.intermissionTimer >= 2.0) {
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

  private resolveCurrentAttack(): void {
    if (!this.physicsBridge || !this.currentAttack) return;

    this.physicsBridge.removeProjectile();

    const state = this.store.getState();
    this.physicsBridge.updateLevelStateFromSimulation(state);

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

    this.intermissionTimer = 0;
    this.mode = 'ATTACK_RESOLVED';
    this.store.setSavedPhase('ATTACK_RESOLVED');
    this.onStateChange?.();
  }

  private advanceToNextAttackOrFinish(): void {
    if (this.currentAttackIndex < AUTHORED_ATTACKS.length - 1) {
      this.currentAttackIndex++;
      const presetCfg = DISTANCE_PRESETS[this.distancePreset];
      this.currentAttack = {
        ...AUTHORED_ATTACKS[this.currentAttackIndex],
        spawnPosition: { x: presetCfg.launcherX - 5, y: presetCfg.launcherY + 10 },
      };
      this.computeCurrentAttackTargeting(this.store.getState());
      this.introTimer = 0;
      this.mode = 'ENEMY_INTRODUCTION';
      this.store.setSavedPhase('ENEMY_INTRODUCTION');
      this.onStateChange?.();
    } else {
      this.finishSequence();
    }
  }

  private finishSequence(): void {
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

    const stableWisps = state.wisps.filter((w) => !w.isDispersed).length;
    const dispersedWisps = state.wisps.length - stableWisps;

    this.siegeSummary = {
      wispsStable: stableWisps,
      totalWisps: state.wisps.length,
      piecesIntact: intact,
      piecesCracked: cracked,
      piecesBroken: broken,
      piecesLost: lost,
      emergencyStopUsed: this.emergencyStopUsed,
      outcomes: [...this.outcomes],
    };

    // Compute Phase 3 Level 1 Results & Mastery Evaluation
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

    this.mode = 'SEQUENCE_COMPLETE';
    this.store.setSavedPhase('RESULTS');
    soundSynth.playVictory();
    this.onStateChange?.();
  }

  private computeLevel1Results(
    state: LevelState,
    wispsStable: number,
    wispsDispersed: number,
    piecesIntact: number,
    piecesCracked: number,
    piecesBroken: number,
    piecesLost: number,
  ): Level1Results {
    const survived = wispsStable >= 1;
    let classification: ResultClassification = 'Defense Failed';
    if (wispsStable >= 5) {
      classification = 'Exceptional Defense';
    } else if (wispsStable === 4) {
      classification = 'Strong Defense';
    } else if (wispsStable === 3) {
      classification = 'Successful Defense';
    } else if (wispsStable >= 1) {
      classification = 'Narrow Survival';
    }

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
        description: 'Keep at least 4 of 5 elemental wisps safe and stable.',
        achieved: wispsStable >= 4,
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
    }

    let sampleUnlockGranted = false;
    if (survived) {
      this.store.markTutorialCompleted();
      sampleUnlockGranted = this.store.grantSampleUnlock();
    }

    const totalReserveRemaining =
      (state.inventory.wood_beam || 0) +
      (state.inventory.wood_block || 0) +
      (state.inventory.stone_block || 0);

    return {
      survived,
      classification,
      wispsStable,
      wispsDispersed,
      totalWisps: state.wisps.length,
      piecesIntact,
      piecesCracked,
      piecesBroken,
      piecesLost,
      reserveRemaining: { ...state.inventory },
      totalReserveRemaining,
      reinforcementMaterialsUsed: this.store.reinforcementMaterialsUsed,
      guaranteedDeliveryGranted: this.store.deliveryGranted,
      guaranteedDeliveryUsed: this.store.guaranteedDeliveryUsed,
      masteryCriteria,
      masteryScore,
      failureObservation,
      sampleUnlockGranted,
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
    this.store.restorePreTestSnapshot();
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
    soundSynth.playSnap();
    this.onStateChange?.();
  }

  public startOver(): void {
    this.mode = 'FRESH_START_RESTORING';
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    this.store.resetToDefault();
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
    soundSynth.playSnap();
    this.onStateChange?.();
  }

  public restoreDesign(): void {
    this.retryDesign();
  }

  public replaySameSiege(): void {
    this.store.restorePreTestSnapshot();
    this.startSiege(this.autoEnterReinforcement);
  }

  public returnToConstruction(): void {
    this.retryDesign();
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
    this.store.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0 };
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

  public simulateSafeReload(): { recoveredPhase: GameMode; message: string } {
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    const result = this.store.recoverFromReload();
    this.reloadNotice = result.message;

    if (result.recoveredPhase === 'CONSTRUCTION_READY' || result.recoveredPhase === 'INITIAL_CONSTRUCTION') {
      this.mode = 'CONSTRUCTION';
    } else if (result.recoveredPhase === 'REINFORCEMENT_ACTIVE') {
      this.mode = 'REINFORCEMENT_ACTIVE';
      this.reinforcementTimerPaused = false;
      const presetCfg = DISTANCE_PRESETS[this.distancePreset];
      this.currentAttack = {
        ...AUTHORED_ATTACKS[1],
        spawnPosition: { x: presetCfg.launcherX - 5, y: presetCfg.launcherY + 10 },
      };
      this.computeCurrentAttackTargeting(this.store.getState());
    } else if (result.recoveredPhase === 'FINAL_ATTACK_READY') {
      this.mode = 'FINAL_ATTACK_READY';
      this.currentAttackIndex = 1;
      const presetCfg = DISTANCE_PRESETS[this.distancePreset];
      this.currentAttack = {
        ...AUTHORED_ATTACKS[1],
        spawnPosition: { x: presetCfg.launcherX - 5, y: presetCfg.launcherY + 10 },
      };
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
