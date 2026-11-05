/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundSynth } from '../audio/synth';
import { MATERIAL_CONFIGS } from '../config';
import { PhysicsBridge } from '../physics/physicsBridge';
import { SiegeController } from '../siege/siegeController';
import { LevelState, Vector2, WispEntity } from '../types';
import {
  CameraDirectorMode,
  CosmeticParticle,
  DEFAULT_PRESENTATION_SETTINGS,
  HeavyAttackerAnimState,
  PovBufferedTransform,
  PovCameraPose,
  PresentationDiagnostics,
  PresentationEvent,
  PresentationEventType,
  PresentationSettings,
  ReplayKeyframe,
  StandardAttackerAnimState,
  WispPersonalityTendency,
  WispPresentationData,
  WispReactionState,
} from './presentationTypes';

import {
  advanceConstructionTransformationState,
  deriveConstructionTransformationState,
} from './constructionTransformation';
import type { ConstructionTransformationPresentationState } from './constructionTransformation';
const PRESENTATION_SETTINGS_STORAGE_KEY = 'alchemical_fortress_phase4_presentation_v1';

const WISP_PERSONALITIES: Record<string, { isHero: boolean; tendency: WispPersonalityTendency }> = {
  wisp_ignis: { isHero: true, tendency: 'BRAVE' },
  wisp_zephyr: { isHero: false, tendency: 'EASILY_DISTRACTED' },
  wisp_terran: { isHero: false, tendency: 'SERIOUS' },
  wisp_marinus: { isHero: false, tendency: 'NERVOUS' },
  wisp_aetheris: { isHero: false, tendency: 'CURIOUS' },
};

export class PresentationDirector {
  public settings: PresentationSettings;

  // Formal Camera Director state
  public currentCameraMode: CameraDirectorMode = 'CONSTRUCTION_CAMERA';
  public requestedCameraMode: CameraDirectorMode = 'CONSTRUCTION_CAMERA';
  public previousCameraMode: CameraDirectorMode = 'CONSTRUCTION_CAMERA';
  public cameraTargetId = 'fortress_sanctuary';
  public cameraModeOverride: CameraDirectorMode | null = null;
  public povFallbackActive = false;
  public povFallbackReason: string | null = null;
  public lastSkippedSequence: string | null = null;

  // True First-Person Projectile POV State & Transform Buffer
  public povPose: PovCameraPose = {
    isActive: false,
    stage: 'INACTIVE',
    cameraOrigin: { x: -460, y: 640 },
    forwardVector: { x: 1, y: 0 },
    pitchRad: 0,
    rollRad: 0,
    fovScale: 1.0,
    launcherRecedeProgress: 0,
    recoilJoltOffset: { x: 0, y: 0 },
    distanceToTarget: 0,
    predictedTimeToImpactSec: 999,
  };
  public povTransformBuffer: PovBufferedTransform[] = [];
  public povInterpolationAlpha = 0;
  public presentationTimeScale = 1.0;
  public readonly authoritativePhysicsTimeScale = 1.0;
  public readonly preImpactCutThresholdSec = 0.24; // 240ms pre-impact cut (within 150-350ms target)
  public actualCutReason: string | null = null;
  public expectedFirstObstructionId: string | null = null;
  private smoothedPovForward: Vector2 = { x: 1, y: 0 };
  private smoothedPovRoll = 0;

  // Cosmetic screen-space shake (NEVER applied to screenToWorld or physics)
  public shakeOffset: Vector2 = { x: 0, y: 0 };
  private shakeIntensity = 0;
  private shakeTimer = 0;

  // Character states
  public standardAttackerState: StandardAttackerAnimState = 'IDLE_WAIT';
  public heavyAttackerState: HeavyAttackerAnimState = 'HEAVY_IDLE';
  public launcherStrain = 0;
  public activeCaption: string | null = null;
  private captionTimer = 0;

  // Wisp presentation states & one-time dispersal tracking
  public wispStates: Map<string, WispPresentationData> = new Map();
  private wispDispersalStartTimes: Map<string, number> = new Map();
  private wispDispersalCompleted: Set<string> = new Set();

  // Cosmetic particles
  public particles: CosmeticParticle[] = [];

  // Event tracking (prevents duplicate sound/animation firing in same attack)
  private firedAttackEvents: Set<string> = new Set();
  private lastEvent: PresentationEventType | null = null;
  private trackedAttackIndex = -1;
  private trackedPhase = '';
  private constructionTransformationState: ConstructionTransformationPresentationState = {
    mode: 'PROTOTYPE',
    transformationProgress: 0,
    isAcceptedRevision: false,
  };

  // Safe Read-Only Visual Replay
  public replayFrames: ReplayKeyframe[] = [];
  public isReplaying = false;
  public replayPlaybackIndex = 0;
  private replaySampleAccumulator = 0;

  // Isolated Developer Presentation Preview state
  public devPreviewType:
    | 'NONE'
    | 'STANDARD_INTRO'
    | 'HEAVY_INTRO'
    | 'STANDARD_FLIGHT'
    | 'HEAVY_FLIGHT'
    | 'WISP_REACTION'
    | 'WISP_DISPERSAL' = 'NONE';
  public devPreviewTimer = 0;
  public devWispReactionOverride: WispReactionState | null = null;
  public devForcePovFallback = false;

  constructor() {
    this.settings = this.loadSettings();
    this.syncAudioSettings();
  }

  /** Read-only presentation state for transformed construction rendering. */
  public getConstructionTransformationState(): Readonly<ConstructionTransformationPresentationState> {
    return this.constructionTransformationState;
  }

  /** Reconstructs an accepted hydrated session without replaying the reveal. */
  public initializeConstructionTransformation(
    phase: string,
    acceptedRevisionId: number | null,
    currentConstructionRevision: number,
  ): void {
    this.constructionTransformationState = deriveConstructionTransformationState({
      phase,
      acceptedRevisionId,
      currentConstructionRevision,
      reducedMotion: this.settings.reducedMotion,
    });
  }

  /** Advances the cosmetic reveal from read-only gameplay inputs. */
  public updateConstructionTransformation(
    dt: number,
    phase: string,
    acceptedRevisionId: number | null,
    currentConstructionRevision: number,
  ): void {
    this.constructionTransformationState = advanceConstructionTransformationState({
      phase,
      acceptedRevisionId,
      currentConstructionRevision,
      currentState: this.constructionTransformationState,
      deltaSec: dt,
      reducedMotion: this.settings.reducedMotion,
    });
  }

  private loadSettings(): PresentationSettings {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_PRESENTATION_SETTINGS };
    }
    try {
      const raw = window.localStorage.getItem(PRESENTATION_SETTINGS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PRESENTATION_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<PresentationSettings>;
      if (parsed.schemaVersion !== DEFAULT_PRESENTATION_SETTINGS.schemaVersion) {
        return { ...DEFAULT_PRESENTATION_SETTINGS };
      }
      return {
        ...DEFAULT_PRESENTATION_SETTINGS,
        ...parsed,
      };
    } catch {
      return { ...DEFAULT_PRESENTATION_SETTINGS };
    }
  }

  public saveSettings(): void {
    this.syncAudioSettings();
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        PRESENTATION_SETTINGS_STORAGE_KEY,
        JSON.stringify(this.settings),
      );
    } catch {
      // Ignore quota errors
    }
  }

  public updateSettings(partial: Partial<PresentationSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
    };
    if (partial.enableExperimentalPOV !== undefined) {
      if (partial.enableExperimentalPOV && this.settings.preferredFlightCamera !== 'EXPERIMENTAL_POV') {
        this.settings.preferredFlightCamera = 'EXPERIMENTAL_POV';
      } else if (!partial.enableExperimentalPOV && this.settings.preferredFlightCamera === 'EXPERIMENTAL_POV') {
        this.settings.preferredFlightCamera = 'SIDE_FOLLOW';
      }
    }
    if (partial.preferredFlightCamera !== undefined) {
      this.settings.enableExperimentalPOV = partial.preferredFlightCamera === 'EXPERIMENTAL_POV';
    }
    this.saveSettings();
  }

  public clearPresentationSettings(): void {
    this.settings = { ...DEFAULT_PRESENTATION_SETTINGS };
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(PRESENTATION_SETTINGS_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    this.syncAudioSettings();
  }

  private syncAudioSettings(): void {
    soundSynth.setMuted(this.settings.isMuted);
    soundSynth.setVolumes(this.settings.sfxVolume, this.settings.voiceVolume);
    soundSynth.setReducedIntensity(this.settings.reducedIntensity || this.settings.reducedMotion);
  }

  public setCaption(text: string | null, durationSec = 2.8): void {
    if (!this.settings.enableSubtitles) {
      this.activeCaption = null;
      return;
    }
    this.activeCaption = text;
    this.captionTimer = durationSec;
  }

  public triggerCosmeticShake(intensity: number, durationSec = 0.32): void {
    if (this.settings.reducedMotion || this.settings.reducedIntensity) {
      this.shakeIntensity = 0;
      this.shakeTimer = 0;
      this.shakeOffset = { x: 0, y: 0 };
      return;
    }
    this.shakeIntensity = Math.min(12, Math.max(this.shakeIntensity, intensity));
    this.shakeTimer = Math.max(this.shakeTimer, durationSec);
  }

  public emitEvent(
    type: PresentationEventType,
    timeSec: number,
    attackIndex?: number,
    payload?: PresentationEvent['payload'],
  ): boolean {
    const key = `${attackIndex ?? 0}:${type}:${payload?.wispId ?? ''}`;
    if (this.firedAttackEvents.has(key)) {
      return false;
    }
    this.firedAttackEvents.add(key);
    this.lastEvent = type;

    // Trigger corresponding audio cues & short personality-driven captions (< 58 chars for mobile portrait)
    switch (type) {
      case 'ATTACKER_INTRO_STARTED': {
        if (payload?.attackerType === 'heavy') {
          soundSynth.playHeavyAttackerEffort();
          this.setCaption(
            'Grom: "Pyrite makes sparks. Grom brings GRAVITY."',
            2.2,
          );
        } else {
          soundSynth.playStandardAttackerBoast();
          this.setCaption(
            'Pyrite Spark: "Step aside! Behold true aerodynamics!"',
            2.0,
          );
        }
        break;
      }
      case 'TARGET_SELECTED': {
        soundSynth.playLauncherTension(payload?.attackerType === 'heavy');
        if (payload?.isBullseyeOverride) {
          if (payload?.attackerType === 'heavy') {
            this.setCaption(
              'Grom: "Ooh, a painted target rune! Grom accepts the challenge."',
              1.9,
            );
          } else {
            this.setCaption(
              'Pyrite Spark: "Did that painted block just WAVE at me?!"',
              1.9,
            );
          }
        } else if (payload?.attackerType === 'heavy') {
          this.setCaption(
            'Grom: "Nice pillars. Shame if I sat on \'em."',
            1.8,
          );
        } else {
          this.setCaption(
            'Pyrite Spark: "Ooh, that roof looks splinter-ready!"',
            1.8,
          );
        }
        break;
      }
      case 'PROJECTILE_RELEASED': {
        if (payload?.attackerType === 'heavy') {
          soundSynth.playHeavyLaunch();
          this.setCaption('Grom: "WHOA—it actually lifted me?! BWAHAHA!"', 1.5);
        } else {
          soundSynth.playStandardLaunch();
          this.setCaption('Pyrite Spark: "Wait—who over-cranked the coil?!"', 1.5);
        }
        break;
      }
      case 'PROJECTILE_APEX_REACHED': {
        soundSynth.playProjectileWind(payload?.attackerType === 'heavy');
        if (payload?.attackerType === 'heavy') {
          this.setCaption('Grom: "I\'m a graceful soaring boulder!"', 1.4);
        } else {
          this.setCaption('Pyrite Spark: "Great view! ...Uh oh, going down!"', 1.4);
        }
        break;
      }
      case 'PROJECTILE_NEAR_TARGET': {
        soundSynth.playWispWarning();
        break;
      }
      case 'FIRST_IMPACT': {
        soundSynth.playStoneImpact(payload?.severity ?? 15);
        this.triggerCosmeticShake(payload?.attackerType === 'heavy' ? 7.5 : 4.2, 0.28);
        break;
      }
      case 'MAJOR_IMPACT': {
        soundSynth.playMajorBreak();
        this.triggerCosmeticShake(9.5, 0.38);
        if (payload?.attackerType === 'heavy') {
          this.setCaption('Grom: "CRUNCH! Nothing beats superior density!"', 2.0);
        } else {
          this.setCaption('Pyrite Spark: "Ha! Pure ballistic artistry!"', 2.0);
        }
        break;
      }
      case 'WISP_DISPERSED': {
        soundSynth.playWispDispersal();
        this.setCaption('Ignis: "Hold fast! A companion returned to the aether!"', 2.2);
        break;
      }
      case 'STRUCTURE_SETTLED': {
        soundSynth.playWispRelief();
        if (payload?.attackerType === 'heavy') {
          if (this.heavyAttackerState === 'WEAK_HIT_GRUMBLE') {
            this.setCaption('Grom: "Bah! Only cracked it? Warm-up tap!"', 2.0);
          } else if (this.heavyAttackerState === 'POST_IMPACT_STUNNED') {
            soundSynth.playEmbarrassedMiss();
            this.setCaption('Grom: "Hey! Who moved the fortress?!"', 2.0);
          }
        } else {
          if (this.standardAttackerState === 'WEAK_HIT_SHRUG') {
            this.setCaption('Pyrite Spark: "A tactical surface scorch! Totally planned!"', 2.0);
          } else if (this.standardAttackerState === 'EMBARRASSED_MISS') {
            soundSynth.playEmbarrassedMiss();
            this.setCaption('Pyrite Spark: "Warning shot! Just calibrating the wind!"', 2.0);
          }
        }
        break;
      }
      case 'REINFORCEMENT_STARTED': {
        this.setCaption(
          'Grom: "Keep stacking twigs! My turn is next!"',
          2.6,
        );
        break;
      }
      case 'FINAL_RESULTS_READY': {
        soundSynth.playResultsCelebration();
        break;
      }
    }

    return true;
  }

  public recordSkip(sequenceName: string): void {
    this.lastSkippedSequence = sequenceName;
  }

  // --- Safe Visual Replay ---

  public startReplay(): boolean {
    if (this.replayFrames.length === 0) return false;
    this.isReplaying = true;
    this.replayPlaybackIndex = 0;
    this.setCameraMode('REPLAY_CAMERA', 'cinematic_replay');
    this.setCaption('Visual Replay: Observing recorded shot trajectory & impact', 3.0);
    return true;
  }

  public skipReplay(): void {
    if (!this.isReplaying) return;
    this.isReplaying = false;
    this.replayPlaybackIndex = 0;
    this.recordSkip('REPLAY_SEQUENCE');
  }

  public clearReplayData(): void {
    this.isReplaying = false;
    this.replayFrames = [];
    this.replayPlaybackIndex = 0;
  }

  public getCurrentReplayFrame(): ReplayKeyframe | null {
    if (!this.isReplaying || this.replayFrames.length === 0) return null;
    const idx = Math.min(this.replayFrames.length - 1, Math.floor(this.replayPlaybackIndex));
    return this.replayFrames[idx] || null;
  }

  // --- Isolated Developer Presentation Previews ---

  public previewStandardIntro(): void {
    this.devPreviewType = 'STANDARD_INTRO';
    this.devPreviewTimer = 2.6;
    soundSynth.playStandardAttackerBoast();
    this.setCaption('[Dev Preview] Pyrite Spark: Boast + Proud Chest Puff + Spark Flourish', 2.5);
  }

  public previewHeavyIntro(): void {
    this.devPreviewType = 'HEAVY_INTRO';
    this.devPreviewTimer = 3.0;
    soundSynth.playHeavyAttackerEffort();
    this.setCaption('[Dev Preview] Grom the Slag-Brute: Heavy Stomp + Helper Clamps + Strain', 2.8);
  }

  public previewStandardFlight(): void {
    this.devPreviewType = 'STANDARD_FLIGHT';
    this.devPreviewTimer = 2.4;
    soundSynth.playStandardLaunch();
    this.setCaption('[Dev Preview] Pyrite Spark In-Flight: Confident -> Apex Surprise -> Panic', 2.4);
  }

  public previewHeavyFlight(): void {
    this.devPreviewType = 'HEAVY_FLIGHT';
    this.devPreviewTimer = 2.4;
    soundSynth.playHeavyLaunch();
    this.setCaption('[Dev Preview] Grom In-Flight: Heavy Momentum -> Airborne Delight', 2.4);
  }

  public triggerWispReactionPreview(state: WispReactionState | null): void {
    this.devWispReactionOverride = state;
    if (state) {
      this.devPreviewType = 'WISP_REACTION';
      this.devPreviewTimer = 3.0;
      this.setCaption(`[Dev Preview] Wisp Reaction Override: ${state}`, 2.5);
    } else if (this.devPreviewType === 'WISP_REACTION') {
      this.devPreviewType = 'NONE';
    }
  }

  public previewWispDispersalCosmetic(timeSec: number): void {
    this.devPreviewType = 'WISP_DISPERSAL';
    this.devPreviewTimer = 1.6;
    this.wispDispersalStartTimes.set('wisp_ignis_preview', timeSec);
    soundSynth.playWispDispersal();
    this.spawnDispersalParticles({ x: 350, y: 635 }, '#ff6b35', '#ffd166');
    this.setCaption('[Dev Preview] Harmless Multi-Stage Wisp Dispersal (Gather -> Swirl -> Ascend)', 2.4);
  }

  public forceCameraModeOverride(mode: CameraDirectorMode | null): void {
    this.cameraModeOverride = mode;
  }

  public testPovFallback(force: boolean): void {
    this.devForcePovFallback = force;
    if (force) {
      this.povFallbackReason = 'DEV_FORCED_POV_FALLBACK_TEST';
    } else {
      this.povFallbackReason = null;
    }
  }

  public testImpactSeverityCosmetic(severity: 'LIGHT' | 'MEDIUM' | 'HEAVY'): void {
    if (severity === 'LIGHT') {
      soundSynth.playWoodImpact(6);
      this.triggerCosmeticShake(2.5, 0.2);
      this.spawnImpactParticles({ x: 340, y: 580 }, '#d97706', 8);
    } else if (severity === 'MEDIUM') {
      soundSynth.playCrack();
      this.triggerCosmeticShake(5.5, 0.3);
      this.spawnImpactParticles({ x: 340, y: 580 }, '#f59e0b', 16);
    } else {
      soundSynth.playMajorBreak();
      this.triggerCosmeticShake(9.0, 0.4);
      this.spawnImpactParticles({ x: 340, y: 580 }, '#ef4444', 26);
    }
  }

  // --- Main Per-Frame Update (Read-Only on Authoritative State) ---

  public update(
    dt: number,
    timeSec: number,
    levelState: LevelState,
    siege: SiegeController,
    activeBridge: PhysicsBridge | null,
    effectiveMode: string,
  ): void {
    // 1. Update timers & shake
    if (this.captionTimer > 0) {
      this.captionTimer = Math.max(0, this.captionTimer - dt);
      if (this.captionTimer <= 0) {
        this.activeCaption = null;
      }
    }

    if (this.devPreviewTimer > 0) {
      this.devPreviewTimer = Math.max(0, this.devPreviewTimer - dt);
      if (this.devPreviewTimer <= 0) {
        this.devPreviewType = 'NONE';
        this.devWispReactionOverride = null;
      }
    }

    if (this.shakeTimer > 0 && !this.settings.reducedMotion && !this.settings.reducedIntensity) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / 0.35;
      const amp = this.shakeIntensity * Math.min(1, decay);
      this.shakeOffset = {
        x: Math.sin(timeSec * 58) * amp,
        y: Math.cos(timeSec * 67) * amp * 0.75,
      };
    } else {
      this.shakeOffset = { x: 0, y: 0 };
      this.shakeIntensity = 0;
    }

    // 2. Step Replay if active
    if (this.isReplaying) {
      this.replayPlaybackIndex += dt * 30; // 30 fps recorded keyframes
      if (this.replayPlaybackIndex >= this.replayFrames.length) {
        this.isReplaying = false;
        this.replayPlaybackIndex = 0;
      }
    }

    // 3. Detect phase/attack changes to reset one-time per-attack event sets
    if (siege.currentAttackIndex !== this.trackedAttackIndex && effectiveMode === 'ENEMY_INTRODUCTION') {
      this.trackedAttackIndex = siege.currentAttackIndex;
      this.firedAttackEvents.clear();
      if (siege.currentAttackIndex === 0) {
        this.replayFrames = [];
        this.wispDispersalStartTimes.clear();
        this.wispDispersalCompleted.clear();
      }
    }

    if (effectiveMode === 'CONSTRUCTION') {
      this.firedAttackEvents.clear();
      this.wispDispersalStartTimes.clear();
      this.wispDispersalCompleted.clear();
      this.povTransformBuffer = [];
      this.actualCutReason = null;
      this.presentationTimeScale = 1.0;
      this.povPose.isActive = false;
      this.povPose.stage = 'INACTIVE';
    }

    // 4. Update Camera Director Mode & True Projectile POV Pose
    this.updateCameraDirector(timeSec, levelState, siege, activeBridge, effectiveMode);

    // 5. Update Attacker Animation States & Launcher Strain
    this.updateAttackerStates(timeSec, siege, activeBridge, effectiveMode);

    // 6. Update Wisp Priority Reaction System & One-Time Dispersal
    this.updateWispReactions(dt, timeSec, levelState.wisps, siege, activeBridge, effectiveMode);

    // 7. Record Read-Only Replay Keyframes during live flight/impact
    this.recordReplayKeyframeIfNeeded(dt, timeSec, levelState, siege, activeBridge, effectiveMode);

    // 8. Update Cosmetic Particles
    this.updateParticles(dt);

    this.trackedPhase = effectiveMode;
  }

  private setCameraMode(mode: CameraDirectorMode, targetId: string): void {
    this.requestedCameraMode = mode;
    const effective = this.cameraModeOverride ?? mode;
    if (this.currentCameraMode !== effective) {
      this.previousCameraMode = this.currentCameraMode;
      this.currentCameraMode = effective;
    }
    this.cameraTargetId = targetId;
  }

  private updateCameraDirector(
    timeSec: number,
    levelState: LevelState,
    siege: SiegeController,
    activeBridge: PhysicsBridge | null,
    effectiveMode: string,
  ): void {
    if (this.isReplaying) {
      this.presentationTimeScale = 1.0;
      this.povPose.isActive = false;
      this.setCameraMode('REPLAY_CAMERA', 'recorded_replay');
      return;
    }

    const attackerType = siege.currentAttack?.attackerType ?? 'standard';
    const wantsPOV =
      this.settings.preferredFlightCamera === 'EXPERIMENTAL_POV' ||
      this.settings.enableExperimentalPOV;

    if (
      effectiveMode === 'CONSTRUCTION' ||
      effectiveMode === 'INITIAL_CONSTRUCTION' ||
      effectiveMode === 'CONSTRUCTION_READY' ||
      effectiveMode === 'PLACE_WISPS' ||
      effectiveMode === 'LEVEL_LOADING' ||
      effectiveMode === 'LEVEL_INTRO' ||
      effectiveMode === 'WISP_INTRO' ||
      effectiveMode === 'TESTING_SIMULATION' ||
      effectiveMode === 'SETTLED'
    ) {
      this.povFallbackActive = false;
      this.povFallbackReason = null;
      this.presentationTimeScale = 1.0;
      this.povPose.isActive = false;
      this.povPose.stage = 'INACTIVE';
      this.setCameraMode('CONSTRUCTION_CAMERA', 'fortress_sanctuary');
      return;
    }

    if (effectiveMode === 'THREAT_PREVIEW' || effectiveMode === 'PRE_SIEGE_REVIEW') {
      this.presentationTimeScale = 1.0;
      this.povPose.isActive = false;
      this.setCameraMode('THREAT_PREVIEW_CAMERA', 'battlefield_corridor');
      return;
    }

    if (effectiveMode === 'ENEMY_INTRODUCTION') {
      this.presentationTimeScale = 1.0;
      this.povPose.isActive = false;
      this.povTransformBuffer = [];
      this.actualCutReason = null;
      this.emitEvent('ATTACKER_INTRO_STARTED', timeSec, siege.currentAttackIndex, { attackerType });
      const totalIntro = siege.currentAttack?.introDurationSec ?? 2.2;
      if (!this.settings.enableCinematics || this.settings.reducedMotion) {
        this.setCameraMode('AIMING_CAMERA', 'tactical_overview');
      } else if (siege.introTimer < totalIntro * 0.62) {
        this.setCameraMode('ATTACKER_INTRO_CAMERA', `attacker_${attackerType}`);
      } else {
        this.emitEvent('TARGET_SELECTED', timeSec, siege.currentAttackIndex, {
          attackerType,
          isBullseyeOverride: Boolean(siege.targetingDiagnostics?.bullseyeOverrideSelected),
        });
        this.setCameraMode(
          'TARGET_REVEAL_CAMERA',
          siege.currentTarget?.id ?? 'target_zone',
        );
      }
      return;
    }

    if (effectiveMode === 'AIMING_PREVIEW' || effectiveMode === 'FINAL_ATTACK_READY') {
      this.presentationTimeScale = 1.0;
      this.povTransformBuffer = [];
      this.actualCutReason = null;
      this.emitEvent('TRAJECTORY_CONFIRMED', timeSec, siege.currentAttackIndex, { attackerType });
      if (siege.aimingTimer > 0.6) {
        this.emitEvent('LAUNCH_PREPARED', timeSec, siege.currentAttackIndex, { attackerType });
      }

      // If POV Experimental is selected and we are in AIMING_PREVIEW, seat the player inside the launcher cradle!
      if (
        effectiveMode === 'AIMING_PREVIEW' &&
        wantsPOV &&
        !this.devForcePovFallback &&
        siege.currentAttack &&
        siege.currentTarget
      ) {
        const spawnPos = siege.currentAttack.spawnPosition;
        const launchVel = siege.currentAttack.launchVelocity;
        const vLen = Math.max(0.001, Math.hypot(launchVel.x, launchVel.y));
        const fwd = { x: launchVel.x / vLen, y: launchVel.y / vLen };
        this.smoothedPovForward = { ...fwd };
        this.smoothedPovRoll = 0;
        const radius = siege.currentAttack.radius;
        const cameraOrigin = {
          x: spawnPos.x + fwd.x * (radius * 0.45),
          y: spawnPos.y + fwd.y * (radius * 0.45),
        };
        const targetPos = siege.currentTarget.position;
        const distToTarget = Math.hypot(targetPos.x - spawnPos.x, targetPos.y - spawnPos.y);
        const predImpact =
          siege.currentTrajectorySolution?.predictedFlightDurationSec ??
          distToTarget / (vLen * 60);

        this.povFallbackActive = false;
        this.povFallbackReason = null;
        this.expectedFirstObstructionId = siege.currentTarget.id;
        this.povPose = {
          isActive: true,
          stage: 'SEATED_IN_LAUNCHER',
          cameraOrigin,
          forwardVector: fwd,
          pitchRad: Math.atan2(fwd.y, fwd.x),
          rollRad: 0,
          fovScale: 1.0,
          launcherRecedeProgress: 0,
          recoilJoltOffset: { x: 0, y: 0 },
          distanceToTarget: distToTarget,
          predictedTimeToImpactSec: predImpact,
        };
        this.setCameraMode('PROJECTILE_POV_CAMERA', 'projectile_pov_launcher_seat');
        return;
      }

      this.povPose.isActive = false;
      this.povPose.stage = 'INACTIVE';
      this.setCameraMode('AIMING_CAMERA', 'launcher_and_fortress');
      return;
    }

    if (effectiveMode === 'PROJECTILE_IN_FLIGHT') {
      this.emitEvent('PROJECTILE_RELEASED', timeSec, siege.currentAttackIndex, { attackerType });
      const proj = activeBridge?.getActiveProjectile();
      const flightTime = activeBridge?.getProjectileFlightTime() ?? 0;
      const hasPhysicalImpact =
        activeBridge?.diagnostics.firstImpactCoordinates !== null &&
        activeBridge?.diagnostics.firstImpactCoordinates !== undefined;

      // 1. Immediate early impact safety check: NEVER remain in first-person through collision!
      if (!proj || hasPhysicalImpact) {
        this.presentationTimeScale = 1.0;
        this.povPose.isActive = false;
        this.povPose.stage = 'CUTAWAY_TO_IMPACT';
        if (!this.actualCutReason) {
          this.actualCutReason = 'EARLY_PHYSICAL_CONTACT';
        }
        this.setCameraMode('IMPACT_CAMERA', siege.currentTarget?.id ?? 'impact_zone');
        return;
      }

      if (Math.abs(proj.velocity.y) < 2.2 && flightTime > 0.25) {
        this.emitEvent('PROJECTILE_APEX_REACHED', timeSec, siege.currentAttackIndex, {
          attackerType,
          position: proj.position,
        });
      }

      const targetPos = siege.currentTarget?.position ?? { x: 350, y: 580 };
      const distToTarget = Math.hypot(
        proj.position.x - targetPos.x,
        proj.position.y - targetPos.y,
      );

      if (distToTarget < 210) {
        this.emitEvent('PROJECTILE_NEAR_TARGET', timeSec, siege.currentAttackIndex, {
          attackerType,
          position: proj.position,
        });
      }

      // 2. Compute authoritative velocity, forward ray, nearest obstruction, and predicted time to impact
      const speedPerStep = Math.hypot(proj.velocity.x, proj.velocity.y);
      const speedPerSec = speedPerStep * 60;
      const rawFwd =
        speedPerStep > 0.001
          ? { x: proj.velocity.x / speedPerStep, y: proj.velocity.y / speedPerStep }
          : this.smoothedPovForward;

      let minObstructionDist = 9999;
      let nearestObstructionId: string | null = null;
      const simPieces = activeBridge ? activeBridge.getSimulatedTransforms(levelState.pieces) : [];
      for (const sp of simPieces) {
        if (sp.condition === 'LOST') continue;
        const dx = sp.position.x - proj.position.x;
        const dy = sp.position.y - proj.position.y;
        const forwardProj = dx * rawFwd.x + dy * rawFwd.y;
        if (forwardProj <= -10) continue;
        const perpDist = Math.abs(-dx * rawFwd.y + dy * rawFwd.x);
        const cfg = MATERIAL_CONFIGS[sp.type];
        const pieceBoundingRadius = Math.hypot(cfg.width, cfg.height) * 0.42;
        if (perpDist <= pieceBoundingRadius + proj.radius + 22) {
          const surfaceDist = Math.max(
            0,
            Math.hypot(dx, dy) - pieceBoundingRadius - proj.radius,
          );
          if (surfaceDist < minObstructionDist) {
            minObstructionDist = surfaceDist;
            nearestObstructionId = sp.pieceId;
          }
        }
      }

      this.expectedFirstObstructionId =
        nearestObstructionId ?? siege.currentTarget?.id ?? null;

      const effectiveContactDist = Math.min(distToTarget, minObstructionDist);
      const predictedTimeToImpactSec =
        speedPerSec > 10 ? effectiveContactDist / speedPerSec : 999;

      // 3. Pre-Impact Cut Check (150ms-350ms before contact, or obstruction/target proximity)
      if (
        minObstructionDist <= 145 ||
        predictedTimeToImpactSec <= this.preImpactCutThresholdSec ||
        distToTarget <= 175
      ) {
        this.presentationTimeScale = 1.0;
        this.povPose.isActive = false;
        this.povPose.stage = 'CUTAWAY_TO_IMPACT';
        this.povPose.distanceToTarget = distToTarget;
        this.povPose.predictedTimeToImpactSec = predictedTimeToImpactSec;
        if (!this.actualCutReason) {
          this.actualCutReason =
            minObstructionDist <= 145
              ? 'APPROACHING_FIRST_OBSTRUCTION'
              : predictedTimeToImpactSec <= this.preImpactCutThresholdSec
                ? 'PREDICTED_TIME_TO_IMPACT_THRESHOLD'
                : 'TARGET_PROXIMITY_THRESHOLD';
        }
        this.setCameraMode('IMPACT_CAMERA', siege.currentTarget?.id ?? 'impact_zone');
        return;
      }

      // 4. Evaluate Flight Camera Mode (POV Experimental vs Follow vs Tactical)
      if (wantsPOV) {
        let fallbackReason: string | null = null;
        if (this.devForcePovFallback) {
          fallbackReason = 'DEV_FORCED_POV_FALLBACK_TEST';
        } else if (speedPerStep < 1.2) {
          fallbackReason = 'NEAR_ZERO_VELOCITY_VECTOR';
        } else if (
          !Number.isFinite(proj.position.x) ||
          !Number.isFinite(proj.position.y) ||
          proj.position.x < -1200 ||
          proj.position.x > 1400 ||
          proj.position.y < -600 ||
          proj.position.y > 900
        ) {
          fallbackReason = 'INVALID_CAMERA_BOUNDS';
        } else if (!siege.currentTarget) {
          fallbackReason = 'NO_VALID_TARGET_REFERENCE';
        } else if (flightTime < 0.08 && effectiveContactDist < 195) {
          fallbackReason = 'IMPACT_TOO_CLOSE_AFTER_RELEASE';
        }

        if (fallbackReason !== null) {
          this.povFallbackActive = true;
          this.povFallbackReason = fallbackReason;
          this.presentationTimeScale = 1.0;
          this.povPose.isActive = false;
          this.povPose.stage = 'INACTIVE';
          this.setCameraMode('PROJECTILE_SIDE_FOLLOW_CAMERA', 'active_projectile');
          return;
        }

        // Valid True First-Person Projectile POV!
        this.povFallbackActive = false;
        this.povFallbackReason = null;

        // Record authoritative transform in POV Transform Buffer
        const lastBuf = this.povTransformBuffer[this.povTransformBuffer.length - 1];
        if (!lastBuf || Math.abs(lastBuf.flightTime - flightTime) > 0.001) {
          if (this.povTransformBuffer.length < 240) {
            this.povTransformBuffer.push({
              position: { ...proj.position },
              velocity: { ...proj.velocity },
              rotation: proj.rotation,
              flightTime,
            });
          }
        }

        const isReducedMotion =
          this.settings.reducedMotion || this.settings.povMotion === 'REDUCED';

        // Smooth forward travel direction vector (decoupled from body spin)
        const smoothFactor = isReducedMotion ? 0.15 : 0.24;
        const nx =
          this.smoothedPovForward.x + (rawFwd.x - this.smoothedPovForward.x) * smoothFactor;
        const ny =
          this.smoothedPovForward.y + (rawFwd.y - this.smoothedPovForward.y) * smoothFactor;
        const nLen = Math.max(0.001, Math.hypot(nx, ny));
        this.smoothedPovForward = { x: nx / nLen, y: ny / nLen };

        // Interpolate visual position between fixed physics steps during dilated POV flight
        const interpX = proj.position.x + proj.velocity.x * this.povInterpolationAlpha;
        const interpY = proj.position.y + proj.velocity.y * this.povInterpolationAlpha;

        // Place POV camera origin slightly forward of projectile center so it never clips inside body art
        const forwardOffset = proj.radius * 0.55;
        const cameraOrigin = {
          x: interpX + this.smoothedPovForward.x * forwardOffset,
          y: interpY + this.smoothedPovForward.y * forwardOffset,
        };

        // Clamped, damped cosmetic roll separated from body spin
        if (this.settings.povCameraRoll === 'OFF') {
          this.smoothedPovRoll = 0;
        } else {
          const maxRoll =
            isReducedMotion || this.settings.povCameraRoll === 'REDUCED' ? 0.02 : 0.06;
          const targetRoll = Math.max(
            -maxRoll,
            Math.min(
              maxRoll,
              this.smoothedPovForward.y * 0.085 + Math.sin(proj.rotation) * 0.015,
            ),
          );
          this.smoothedPovRoll += (targetRoll - this.smoothedPovRoll) * 0.18;
        }

        // Determine POV Flight Stage & Cinematic Presentation Time Dilation
        let stage: PovCameraPose['stage'] = 'ASCENT';
        if (flightTime < 0.22) stage = 'RELEASE_JOLT';
        else if (proj.velocity.y < -1.8) stage = 'ASCENT';
        else if (Math.abs(proj.velocity.y) <= 1.8) stage = 'APEX';
        else stage = 'DESCENT';

        if (stage === 'RELEASE_JOLT') {
          this.presentationTimeScale = isReducedMotion ? 0.85 : 0.88;
        } else if (predictedTimeToImpactSec > 0.42) {
          this.presentationTimeScale = isReducedMotion ? 0.72 : 0.40;
        } else {
          const ramp = Math.max(
            0,
            Math.min(
              1,
              (0.42 - predictedTimeToImpactSec) /
                Math.max(0.05, 0.42 - this.preImpactCutThresholdSec),
            ),
          );
          const baseSlow = isReducedMotion ? 0.72 : 0.40;
          this.presentationTimeScale = baseSlow + ramp * (0.88 - baseSlow);
        }

        const launcherRecedeProgress = Math.min(1, flightTime / 0.3);
        const joltMult =
          this.settings.povLaunchJolt === 'OFF'
            ? 0
            : this.settings.povLaunchJolt === 'REDUCED' || isReducedMotion
              ? 0.35
              : attackerType === 'heavy'
                ? 1.35
                : 1.0;
        const joltDecay = Math.max(0, 1 - flightTime / 0.24);
        const recoilJoltOffset = {
          x: Math.sin(flightTime * 95) * 6 * joltDecay * joltMult,
          y: Math.cos(flightTime * 110) * 5 * joltDecay * joltMult,
        };
        const fovScale = isReducedMotion ? 1.0 : 1.0 + joltDecay * 0.14 * joltMult;

        this.povPose = {
          isActive: true,
          stage,
          cameraOrigin,
          forwardVector: { ...this.smoothedPovForward },
          pitchRad: Math.atan2(this.smoothedPovForward.y, this.smoothedPovForward.x),
          rollRad: this.smoothedPovRoll,
          fovScale,
          launcherRecedeProgress,
          recoilJoltOffset,
          distanceToTarget: distToTarget,
          predictedTimeToImpactSec,
        };

        this.setCameraMode('PROJECTILE_POV_CAMERA', 'projectile_pov');
      } else if (this.settings.preferredFlightCamera === 'TACTICAL_WIDE') {
        this.povFallbackActive = false;
        this.povFallbackReason = null;
        this.presentationTimeScale = 1.0;
        this.povPose.isActive = false;
        this.povPose.stage = 'INACTIVE';
        this.setCameraMode('AIMING_CAMERA', 'tactical_wide_flight');
      } else {
        this.povFallbackActive = false;
        this.povFallbackReason = null;
        this.presentationTimeScale = 1.0;
        this.povPose.isActive = false;
        this.povPose.stage = 'INACTIVE';
        this.setCameraMode('PROJECTILE_SIDE_FOLLOW_CAMERA', 'active_projectile');
      }
      return;
    }

    // All post-impact & resolution phases run at 1.0x time scale with external cameras
    this.presentationTimeScale = 1.0;
    this.povPose.isActive = false;

    if (effectiveMode === 'IMPACT_RESOLUTION') {
      const firstImpact = activeBridge?.diagnostics.firstImpactCoordinates ?? undefined;
      if (
        this.emitEvent('FIRST_IMPACT', timeSec, siege.currentAttackIndex, {
          attackerType,
          position: firstImpact,
          severity: attackerType === 'heavy' ? 28 : 14,
        }) &&
        firstImpact
      ) {
        this.spawnImpactParticles(
          firstImpact,
          attackerType === 'heavy' ? '#ef4444' : '#f59e0b',
          attackerType === 'heavy' ? 22 : 14,
        );
      }
      this.setCameraMode('IMPACT_CAMERA', 'impact_zone');
      return;
    }

    if (effectiveMode === 'SETTLING') {
      const awakeCount = activeBridge?.diagnostics.awakeBodyCount ?? 0;
      const brokenCount = activeBridge?.diagnostics.piecesBrokenCount ?? 0;
      if (brokenCount > 0) {
        this.emitEvent('MAJOR_IMPACT', timeSec, siege.currentAttackIndex, {
          attackerType,
          severity: 25,
        });
      }
      if (awakeCount > 2 && siege.settlingTimer < 1.8) {
        this.emitEvent('STRUCTURE_COLLAPSE_STARTED', timeSec, siege.currentAttackIndex, {
          attackerType,
        });
        this.setCameraMode('COLLAPSE_CAMERA', 'structural_collapse');
      } else {
        this.setCameraMode('SETTLEMENT_CAMERA', 'fortress_settlement');
      }
      return;
    }

    if (effectiveMode === 'ATTACK_RESOLVED') {
      this.emitEvent('STRUCTURE_SETTLED', timeSec, siege.currentAttackIndex, { attackerType });
      this.setCameraMode('SETTLEMENT_CAMERA', 'fortress_resolved');
      return;
    }

    if (
      effectiveMode === 'REINFORCEMENT_INTRO' ||
      effectiveMode === 'REINFORCEMENT_ACTIVE' ||
      effectiveMode === 'EMERGENCY_DELIVERY' ||
      effectiveMode === 'REINFORCEMENT_VALIDATION'
    ) {
      this.emitEvent('REINFORCEMENT_STARTED', timeSec, siege.currentAttackIndex);
      this.setCameraMode('REINFORCEMENT_CAMERA', 'reinforcement_sanctuary');
      return;
    }

    this.emitEvent('FINAL_RESULTS_READY', timeSec, siege.currentAttackIndex);
    this.setCameraMode('RESULTS_CAMERA', 'final_results');
  }

  private updateAttackerStates(
    timeSec: number,
    siege: SiegeController,
    activeBridge: PhysicsBridge | null,
    effectiveMode: string,
  ): void {
    // Handle isolated developer preview first
    if (this.devPreviewType === 'STANDARD_INTRO') {
      const p = 1 - this.devPreviewTimer / 2.6;
      if (p < 0.25) this.standardAttackerState = 'INTRO_HOP_IN';
      else if (p < 0.55) this.standardAttackerState = 'PROUD_CHEST_PUFF';
      else if (p < 0.8) this.standardAttackerState = 'WARMUP_HOP';
      else this.standardAttackerState = 'AIM_LEAN_FORWARD';
      this.launcherStrain = Math.sin(p * Math.PI) * 0.45;
      return;
    }

    if (this.devPreviewType === 'HEAVY_INTRO') {
      const p = 1 - this.devPreviewTimer / 3.0;
      if (p < 0.25) this.heavyAttackerState = 'HEAVY_STEP_IN';
      else if (p < 0.5) this.heavyAttackerState = 'GROUND_THUMP';
      else if (p < 0.78) this.heavyAttackerState = 'ASSISTED_MOUNT';
      else this.heavyAttackerState = 'LAUNCHER_FULL_STRAIN';
      this.launcherStrain = Math.min(1, p * 1.25);
      return;
    }

    if (this.devPreviewType === 'STANDARD_FLIGHT') {
      const p = 1 - this.devPreviewTimer / 2.4;
      if (p < 0.35) this.standardAttackerState = 'FLIGHT_CONFIDENT';
      else if (p < 0.68) this.standardAttackerState = 'APEX_SURPRISE';
      else this.standardAttackerState = 'DESCENT_PANIC';
      return;
    }

    if (this.devPreviewType === 'HEAVY_FLIGHT') {
      const p = 1 - this.devPreviewTimer / 2.4;
      if (p < 0.35) this.heavyAttackerState = 'RELEASE_SURPRISE';
      else if (p < 0.7) this.heavyAttackerState = 'HEAVY_FLIGHT_MOMENTUM';
      else this.heavyAttackerState = 'AIRBORNE_DELIGHT';
      return;
    }

    const isHeavy = siege.currentAttack?.attackerType === 'heavy';

    if (effectiveMode === 'ENEMY_INTRODUCTION') {
      const dur = siege.currentAttack?.introDurationSec ?? 2.2;
      const ratio = Math.min(1, siege.introTimer / dur);
      const isBullseye = Boolean(siege.targetingDiagnostics?.bullseyeOverrideSelected);
      if (isHeavy) {
        if (ratio < 0.28) this.heavyAttackerState = 'HEAVY_STEP_IN';
        else if (ratio < 0.55) this.heavyAttackerState = 'GROUND_THUMP';
        else if (ratio < 0.82)
          this.heavyAttackerState = isBullseye ? 'BULLSEYE_ACK_DELIGHTED' : 'ASSISTED_MOUNT';
        else this.heavyAttackerState = 'HEAVY_READY_POSE';
        this.launcherStrain = Math.min(0.85, ratio * 0.9);
      } else {
        if (ratio < 0.25) this.standardAttackerState = 'INTRO_HOP_IN';
        else if (ratio < 0.52) this.standardAttackerState = 'PROUD_CHEST_PUFF';
        else if (ratio < 0.78)
          this.standardAttackerState = isBullseye ? 'BULLSEYE_ACK_OFFENDED' : 'WARMUP_HOP';
        else this.standardAttackerState = 'LOAD_INTO_CRADLE';
        this.launcherStrain = Math.min(0.45, ratio * 0.5);
      }
      return;
    }

    if (effectiveMode === 'AIMING_PREVIEW' || effectiveMode === 'FINAL_ATTACK_READY') {
      const ratio = Math.min(1, siege.aimingTimer / 1.2);
      if (isHeavy) {
        this.heavyAttackerState = ratio < 0.5 ? 'DEEP_COMPRESSION' : 'LAUNCHER_FULL_STRAIN';
        this.launcherStrain = 0.75 + ratio * 0.25;
      } else {
        this.standardAttackerState = ratio < 0.6 ? 'AIM_LEAN_FORWARD' : 'LAUNCH_ANTICIPATION';
        this.launcherStrain = 0.4 + ratio * 0.35;
      }
      return;
    }

    if (effectiveMode === 'PROJECTILE_IN_FLIGHT') {
      this.launcherStrain = Math.max(0, this.launcherStrain - 0.08);
      const proj = activeBridge?.getActiveProjectile();
      const vy = proj?.velocity.y ?? 0;
      const targetPos = siege.currentTarget?.position ?? { x: 350, y: 580 };
      const dist = proj
        ? Math.hypot(proj.position.x - targetPos.x, proj.position.y - targetPos.y)
        : 500;

      if (isHeavy) {
        if (dist < 180) this.heavyAttackerState = 'HEAVY_IMPACT_BRACE';
        else if (vy < -2.2) this.heavyAttackerState = 'RELEASE_SURPRISE';
        else if (Math.abs(vy) <= 2.2) this.heavyAttackerState = 'AIRBORNE_DELIGHT';
        else this.heavyAttackerState = 'HEAVY_FLIGHT_MOMENTUM';
      } else {
        if (dist < 170) this.standardAttackerState = 'IMPACT_BRACE';
        else if (vy < -2.2) this.standardAttackerState = 'FLIGHT_CONFIDENT';
        else if (Math.abs(vy) <= 2.2) this.standardAttackerState = 'APEX_SURPRISE';
        else this.standardAttackerState = 'DESCENT_PANIC';
      }
      return;
    }

    if (effectiveMode === 'IMPACT_RESOLUTION' || effectiveMode === 'SETTLING' || effectiveMode === 'ATTACK_RESOLVED') {
      this.launcherStrain = 0;
      const brokenCount = activeBridge?.diagnostics.piecesBrokenCount ?? 0;
      const crackedCount = activeBridge?.diagnostics.piecesCrackedCount ?? 0;
      if (isHeavy) {
        if (brokenCount > 0) this.heavyAttackerState = 'POST_IMPACT_TRIUMPH';
        else if (crackedCount > 0) this.heavyAttackerState = 'WEAK_HIT_GRUMBLE';
        else this.heavyAttackerState = 'POST_IMPACT_STUNNED';
      } else {
        if (brokenCount > 0) this.standardAttackerState = 'SMUG_CELEBRATION';
        else if (crackedCount > 0) this.standardAttackerState = 'WEAK_HIT_SHRUG';
        else this.standardAttackerState = 'EMBARRASSED_MISS';
      }
      return;
    }

    this.launcherStrain = 0;
    this.standardAttackerState = 'IDLE_WAIT';
    this.heavyAttackerState = 'HEAVY_IDLE';
  }

  private updateWispReactions(
    dt: number,
    timeSec: number,
    wisps: WispEntity[],
    siege: SiegeController,
    activeBridge: PhysicsBridge | null,
    effectiveMode: string,
  ): void {
    const activeProj = activeBridge?.getActiveProjectile();
    const awakeBodies = activeBridge?.diagnostics.awakeBodyCount ?? 0;
    const survivingWisps = wisps.filter((wisp) => !wisp.isDispersed);
    const survivorIndexById = new Map(
      survivingWisps.map((wisp, index) => [wisp.id, index]),
    );
    const celebrationIsActive =
      effectiveMode === 'ATTACK_RESOLVED' &&
      siege.finalWispCelebration.phase === 'CELEBRATING';

    for (let i = 0; i < wisps.length; i++) {
      const wisp = wisps[i];
      const meta = WISP_PERSONALITIES[wisp.id] ?? {
        isHero: i === 0,
        tendency: 'CURIOUS' as WispPersonalityTendency,
      };

      // Priority 1: Dispersal (One-time multi-stage harmless cosmetic effect)
      if (wisp.isDispersed) {
        if (!this.wispDispersalStartTimes.has(wisp.id)) {
          this.wispDispersalStartTimes.set(wisp.id, timeSec);
          this.emitEvent('WISP_DISPERSED', timeSec, siege.currentAttackIndex, {
            wispId: wisp.id,
            position: wisp.position,
          });
          this.spawnDispersalParticles(wisp.position, wisp.color, wisp.glowColor);
        }
        const elapsed = timeSec - (this.wispDispersalStartTimes.get(wisp.id) ?? timeSec);
        const progress = Math.min(1, elapsed / 1.35);
        let dispState: WispReactionState = 'DISPERSED_FADING';
        if (progress < 0.25) dispState = 'DISPERSING_GATHER';
        else if (progress < 0.58) dispState = 'DISPERSING_SWIRL';
        else if (progress < 0.88) dispState = 'DISPERSING_ASCEND';
        else {
          dispState = 'DISPERSED_FADING';
          this.wispDispersalCompleted.add(wisp.id);
        }

        this.wispStates.set(wisp.id, {
          wispId: wisp.id,
          isHero: meta.isHero,
          tendency: meta.tendency,
          reactionState: dispState,
          dispersalProgress: progress,
          lookTarget: null,
          blinkPhase: 0,
        });
        continue;
      }

      // Check Developer Wisp Reaction Override
      if (this.devWispReactionOverride) {
        this.wispStates.set(wisp.id, {
          wispId: wisp.id,
          isHero: meta.isHero,
          tendency: meta.tendency,
          reactionState: this.devWispReactionOverride,
          dispersalProgress: 0,
          lookTarget: activeProj?.position ?? null,
          blinkPhase: 0,
        });
        continue;
      }

      let state: WispReactionState = 'CALM_IDLE';
      let lookTarget: Vector2 | null = null;

      // Priority 2: Immediate Danger (Incoming Projectile)
      if (activeProj) {
        lookTarget = activeProj.position;
        const dist = Math.hypot(
          activeProj.position.x - wisp.position.x,
          activeProj.position.y - wisp.position.y,
        );
        if (dist < 140) {
          state = meta.tendency === 'NERVOUS' ? 'COWER' : 'BRACE_FOR_IMPACT';
          this.emitEvent('WISP_NEAR_MISS', timeSec, siege.currentAttackIndex, {
            wispId: wisp.id,
            position: wisp.position,
          });
        } else if (dist < 260) {
          state = meta.tendency === 'BRAVE' ? 'ALARMED_ALERT' : 'GASP';
        } else {
          state = 'WATCH_TRAJECTORY';
        }
      }
      // Priority 3: Nearby Collapse or Heavy Debris
      else if (effectiveMode === 'IMPACT_RESOLUTION' || effectiveMode === 'SETTLING') {
        if (awakeBodies > 3) {
          state = meta.tendency === 'NERVOUS' ? 'COWER' : 'DODGE_LEAN';
        } else if (awakeBodies > 0) {
          state = 'STARTLED_JUMP';
        } else {
          state = 'RELIEVED_EXHALE';
        }
      }
      // Priority 4: Phase Transition Reactions
      else if (effectiveMode === 'EMERGENCY_DELIVERY') {
        state = 'MENTOR_GRATITUDE';
      } else if (
        effectiveMode === 'REINFORCEMENT_INTRO' ||
        effectiveMode === 'REINFORCEMENT_ACTIVE'
      ) {
        state = 'REINFORCEMENT_HOPE';
      } else if (
   effectiveMode === 'ATTACK_RESOLVED' &&
   siege.finalWispCelebration.phase === 'CELEBRATING'
 ) {
   state = 'CELEBRATION_CHORUS';
 } else if (
   effectiveMode === 'SEQUENCE_COMPLETE' ||
        effectiveMode === 'RESULTS' ||
        effectiveMode === 'UNLOCK_PRESENTATION'
      ) {
        const totalWisps = Math.max(1, wisps.length);
        const survivedCount = wisps.filter((w) => !w.isDispersed).length;
        if (survivedCount === totalWisps) state = 'CELEBRATION_CHORUS';
        else if (survivedCount === totalWisps - 1 && survivedCount >= 2) state = 'RELIEVED_EXHALE';
        else if (survivedCount >= 1) state = 'SOLEMN_SURVIVAL';
        else state = 'DEFEAT_MOURN';
      }
      // Priority 5: Threat Awareness
      else if (
        effectiveMode === 'ENEMY_INTRODUCTION' ||
        effectiveMode === 'AIMING_PREVIEW' ||
        effectiveMode === 'THREAT_PREVIEW' ||
        effectiveMode === 'FINAL_ATTACK_READY'
      ) {
        lookTarget = siege.currentTarget?.position ?? siege.currentAttack?.spawnPosition ?? null;
        state = effectiveMode === 'ENEMY_INTRODUCTION' ? 'SPOT_ATTACKER' : 'WATCH_TRAJECTORY';
      }
      // Priority 6: Calm Idle & Periodic Personality Quirks
      else {
        const cycle = (timeSec * 0.8 + i * 1.37) % 6.0;
        if (cycle > 5.7) {
          state = 'BLINK';
        } else if (cycle > 4.2 && meta.tendency === 'EASILY_DISTRACTED') {
          state = 'LOOK_AROUND';
        } else {
          state = 'CALM_IDLE';
        }
      }

      const blinkPhase = Math.sin(timeSec * 3.5 + i * 2.1) > 0.96 ? 1 : 0;
      const celebrationSurvivorIndex = survivorIndexById.get(wisp.id);

      this.wispStates.set(wisp.id, {
        wispId: wisp.id,
        isHero: meta.isHero,
        tendency: meta.tendency,
        reactionState: state,
        dispersalProgress: 0,
        lookTarget,
        blinkPhase,
        celebrationElapsedSec:
          celebrationIsActive && celebrationSurvivorIndex !== undefined
            ? siege.finalWispCelebration.elapsedSec
            : undefined,
        celebrationSurvivorIndex:
          celebrationIsActive ? celebrationSurvivorIndex : undefined,
        celebrationSurvivorCount:
          celebrationIsActive ? survivingWisps.length : undefined,
        celebrationTotalWispCount:
          celebrationIsActive ? wisps.length : undefined,
      });
    }

    // Remove any stale wispStates entries that are not in the active level wisps
    const activeIds = new Set(wisps.map((w) => w.id));
    for (const key of Array.from(this.wispStates.keys())) {
      if (!activeIds.has(key)) {
        this.wispStates.delete(key);
      }
    }
  }

  private recordReplayKeyframeIfNeeded(
    dt: number,
    timeSec: number,
    levelState: LevelState,
    siege: SiegeController,
    activeBridge: PhysicsBridge | null,
    effectiveMode: string,
  ): void {
    if (
      !activeBridge ||
      (effectiveMode !== 'PROJECTILE_IN_FLIGHT' &&
        effectiveMode !== 'IMPACT_RESOLUTION' &&
        effectiveMode !== 'SETTLING')
    ) {
      return;
    }

    this.replaySampleAccumulator += dt;
    if (this.replaySampleAccumulator < 1 / 30) return;
    this.replaySampleAccumulator = 0;

    if (this.replayFrames.length >= 260) return;

    const proj = activeBridge.getActiveProjectile();
    const simPieces = activeBridge.getSimulatedTransforms(levelState.pieces);

    this.replayFrames.push({
      timestamp: timeSec,
      cameraCenter: proj
        ? { x: Math.max(150, Math.min(480, proj.position.x + 60)), y: 540 }
        : { x: 380, y: 540 },
      cameraScale: 1.0,
      projectile: proj
        ? {
            position: { ...proj.position },
            velocity: { ...proj.velocity },
            radius: proj.radius,
            attackerType: proj.attack.attackerType,
          }
        : null,
      pieces: simPieces.map((p) => ({
        id: p.pieceId,
        type: p.type,
        position: { ...p.position },
        rotation: p.rotation,
        isPrebuilt: p.isPrebuilt,
        condition: p.condition,
        impactSeverity: p.impactSeverity,
      })),
      wisps: levelState.wisps.map((w) => {
        const ws = this.wispStates.get(w.id);
        return {
          id: w.id,
          position: { ...w.position },
          isDispersed: Boolean(w.isDispersed),
          reactionState: ws?.reactionState ?? 'CALM_IDLE',
          dispersalProgress: ws?.dispersalProgress ?? 0,
        };
      }),
    });
  }

  public spawnImpactParticles(origin: Vector2, color: string, count: number): void {
    if (this.settings.reducedMotion) return;
    const cap = this.settings.reducedIntensity ? Math.ceil(count * 0.5) : count;
    for (let i = 0; i < cap; i++) {
      const angle = (Math.PI * 2 * i) / cap + (Math.random() - 0.5) * 0.4;
      const speed = 45 + Math.random() * 140;
      this.particles.push({
        id: `imp_${Date.now()}_${i}`,
        position: { x: origin.x, y: origin.y },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 40 },
        radius: 2.5 + Math.random() * 3.5,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        shape: i % 2 === 0 ? 'spark' : 'shard',
      });
    }
  }

  public spawnDispersalParticles(origin: Vector2, color: string, glowColor: string): void {
    const count = this.settings.reducedMotion ? 8 : 20;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 25 + Math.random() * 55;
      this.particles.push({
        id: `disp_${Date.now()}_${i}`,
        position: { x: origin.x, y: origin.y },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 55 },
        radius: 3 + Math.random() * 4,
        color: i % 2 === 0 ? color : glowColor,
        alpha: 1,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.4,
        shape: i % 3 === 0 ? 'rune' : 'orb',
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.velocity.y += 180 * dt; // cosmetic gravity
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
    }
  }

  public getDiagnostics(
    effectiveMode: string,
    siege: SiegeController,
    activeBridge: PhysicsBridge | null,
  ): PresentationDiagnostics {
    const wispSummary: Record<string, WispReactionState> = {};
    this.wispStates.forEach((val, key) => {
      wispSummary[key] = val.reactionState;
    });

    const activeProj = activeBridge?.getActiveProjectile();
    const attackerType = siege.currentAttack?.attackerType ?? null;

    let projectilePresState = 'INACTIVE';
    if (activeProj) {
      projectilePresState =
        attackerType === 'heavy' ? this.heavyAttackerState : this.standardAttackerState;
    } else if (this.devPreviewType === 'STANDARD_FLIGHT') {
      projectilePresState = this.standardAttackerState;
    } else if (this.devPreviewType === 'HEAVY_FLIGHT') {
      projectilePresState = this.heavyAttackerState;
    }

    return {
      currentGameplayState: effectiveMode,
      presentationMode: this.settings.presentationMode,
      currentCameraMode: this.currentCameraMode,
      requestedCameraMode: this.requestedCameraMode,
      previousCameraMode: this.previousCameraMode,
      cameraTarget: this.cameraTargetId,
      povCameraEnabled:
        this.settings.enableExperimentalPOV ||
        this.settings.preferredFlightCamera === 'EXPERIMENTAL_POV',
      povActive: this.currentCameraMode === 'PROJECTILE_POV_CAMERA' && this.povPose.isActive,
      povFallbackActive: this.povFallbackActive,
      povFallbackReason: this.povFallbackReason,
      projectileWorldPosition: activeProj ? { ...activeProj.position } : null,
      projectileVelocityVector: activeProj ? { ...activeProj.velocity } : null,
      povForwardVector: this.povPose.isActive ? { ...this.povPose.forwardVector } : null,
      cameraWorldPosition: this.povPose.isActive ? { ...this.povPose.cameraOrigin } : null,
      cameraRollRad: this.povPose.isActive ? this.povPose.rollRad : 0,
      distanceToSelectedTarget: this.povPose.isActive
        ? this.povPose.distanceToTarget
        : activeProj && siege.currentTarget
          ? Math.hypot(
              activeProj.position.x - siege.currentTarget.position.x,
              activeProj.position.y - siege.currentTarget.position.y,
            )
          : null,
      predictedTimeToImpactSec: this.povPose.isActive
        ? this.povPose.predictedTimeToImpactSec
        : null,
      expectedFirstObstruction:
        this.expectedFirstObstructionId ?? siege.currentTarget?.id ?? null,
      preImpactCutThresholdSec: this.preImpactCutThresholdSec,
      actualCutReason: this.actualCutReason,
      presentationTimeScale: this.presentationTimeScale,
      authoritativePhysicsTimeScale: this.authoritativePhysicsTimeScale,
      transformBufferLength: this.povTransformBuffer.length,
      actualFirstImpactObject: activeBridge?.diagnostics.firstImpactTargetLabel ?? null,
      retryDesignEnabledDuringFlight: false,
      activeAttacker: siege.currentAttack?.name ?? null,
      attackerAnimationState:
        attackerType === 'heavy' ? this.heavyAttackerState : this.standardAttackerState,
      launcherAnimationState:
        this.launcherStrain > 0.7
          ? 'HIGH_STRAIN_COMPRESSION'
          : this.launcherStrain > 0.1
            ? 'TENSION_LOADING'
            : 'IDLE_READY',
      selectedTargetId: siege.currentTarget?.id ?? null,
      selectedArcType: siege.currentTrajectorySolution?.trajectoryType ?? null,
      projectilePresentationState: projectilePresState,
      heroWispState: wispSummary['wisp_ignis'] ?? 'CALM_IDLE',
      companionWispStates: wispSummary,
      dispersalAnimationCount: this.wispDispersalStartTimes.size,
      activeParticleCount: this.particles.length,
      activeSoundCount: soundSynth.activeSoundCount,
      lastPresentationEvent: this.lastEvent,
      lastSoundTrigger: soundSynth.lastSoundTrigger,
      reducedMotionEnabled: this.settings.reducedMotion,
      cinematicsEnabled: this.settings.enableCinematics,
      audioMuted: this.settings.isMuted,
      replayState: this.isReplaying
        ? `PLAYING (${Math.floor(this.replayPlaybackIndex)}/${this.replayFrames.length})`
        : this.replayFrames.length > 0
          ? `READY (${this.replayFrames.length} frames)`
          : 'EMPTY',
      lastSkippedSequence: this.lastSkippedSequence,
    };
  }
}
