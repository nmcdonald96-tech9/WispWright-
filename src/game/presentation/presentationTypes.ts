/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttackerType, MaterialType, PieceCondition, Vector2 } from '../types';

export type CameraDirectorMode =
  | 'CONSTRUCTION_CAMERA'
  | 'THREAT_PREVIEW_CAMERA'
  | 'ATTACKER_INTRO_CAMERA'
  | 'TARGET_REVEAL_CAMERA'
  | 'AIMING_CAMERA'
  | 'PROJECTILE_SIDE_FOLLOW_CAMERA'
  | 'PROJECTILE_POV_CAMERA'
  | 'IMPACT_CAMERA'
  | 'COLLAPSE_CAMERA'
  | 'SETTLEMENT_CAMERA'
  | 'REINFORCEMENT_CAMERA'
  | 'RESULTS_CAMERA'
  | 'REPLAY_CAMERA';

export type FlightCameraPreference =
  | 'TACTICAL_WIDE'
  | 'SIDE_FOLLOW'
  | 'EXPERIMENTAL_POV';

export type PlayerCameraModeLabel = 'Tactical' | 'Follow' | 'POV Experimental';

export function getPlayerCameraModeLabel(pref: FlightCameraPreference): PlayerCameraModeLabel {
  if (pref === 'TACTICAL_WIDE') return 'Tactical';
  if (pref === 'EXPERIMENTAL_POV') return 'POV Experimental';
  return 'Follow';
}

export type PresentationMode = 'PLAYER' | 'DEVELOPER';
export type PovMotionLevel = 'FULL' | 'REDUCED';
export type PovEffectLevel = 'FULL' | 'REDUCED' | 'OFF';

export type PovStage =
  | 'INACTIVE'
  | 'SEATED_IN_LAUNCHER'
  | 'RELEASE_JOLT'
  | 'ASCENT'
  | 'APEX'
  | 'DESCENT'
  | 'CUTAWAY_TO_IMPACT';

export interface PovCameraPose {
  isActive: boolean;
  stage: PovStage;
  cameraOrigin: Vector2;
  forwardVector: Vector2;
  pitchRad: number;
  rollRad: number;
  fovScale: number;
  launcherRecedeProgress: number;
  recoilJoltOffset: Vector2;
  distanceToTarget: number;
  predictedTimeToImpactSec: number;
}

export interface PovBufferedTransform {
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  flightTime: number;
}

export interface PresentationSettings {
  schemaVersion: number;
  presentationMode: PresentationMode;
  isMuted: boolean;
  sfxVolume: number; // 0.0 to 1.0
  voiceVolume: number; // 0.0 to 1.0
  reducedMotion: boolean;
  enableCinematics: boolean;
  enableExperimentalPOV: boolean;
  preferredFlightCamera: FlightCameraPreference;
  enableSubtitles: boolean;
  reducedIntensity: boolean;
  // POV Motion Comfort Settings
  povMotion: PovMotionLevel;
  povCameraRoll: PovEffectLevel;
  povLaunchJolt: PovEffectLevel;
  povSpeedLines: boolean;
  povAutoFallback: boolean;
}

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  schemaVersion: 1,
  presentationMode: 'PLAYER',
  isMuted: false,
  sfxVolume: 0.8,
  voiceVolume: 0.85,
  reducedMotion: false,
  enableCinematics: true,
  enableExperimentalPOV: false,
  preferredFlightCamera: 'SIDE_FOLLOW',
  enableSubtitles: true,
  reducedIntensity: false,
  povMotion: 'FULL',
  povCameraRoll: 'FULL',
  povLaunchJolt: 'FULL',
  povSpeedLines: true,
  povAutoFallback: true,
};

export type PresentationEventType =
  | 'ATTACKER_INTRO_STARTED'
  | 'TARGET_SELECTED'
  | 'TRAJECTORY_CONFIRMED'
  | 'LAUNCH_PREPARED'
  | 'PROJECTILE_RELEASED'
  | 'PROJECTILE_APEX_REACHED'
  | 'PROJECTILE_NEAR_TARGET'
  | 'FIRST_IMPACT'
  | 'MAJOR_IMPACT'
  | 'WISP_NEAR_MISS'
  | 'WISP_DISPERSED'
  | 'STRUCTURE_COLLAPSE_STARTED'
  | 'STRUCTURE_SETTLED'
  | 'REINFORCEMENT_STARTED'
  | 'FINAL_RESULTS_READY';

export interface PresentationEvent {
  type: PresentationEventType;
  timestamp: number;
  attackIndex?: number;
  payload?: {
    attackerType?: AttackerType;
    wispId?: string;
    position?: Vector2;
    severity?: number;
    isBullseyeOverride?: boolean;
  };
}

export type StandardAttackerAnimState =
  | 'IDLE_WAIT'
  | 'INTRO_HOP_IN'
  | 'PROUD_CHEST_PUFF'
  | 'SPARK_FLOURISH'
  | 'WARMUP_HOP'
  | 'BULLSEYE_ACK_OFFENDED'
  | 'LOAD_INTO_CRADLE'
  | 'AIM_LEAN_FORWARD'
  | 'LAUNCH_ANTICIPATION'
  | 'RELEASE_STRETCH'
  | 'FLIGHT_CONFIDENT'
  | 'APEX_SURPRISE'
  | 'DESCENT_PANIC'
  | 'IMPACT_BRACE'
  | 'POST_IMPACT_DIZZY'
  | 'SMUG_CELEBRATION'
  | 'WEAK_HIT_SHRUG'
  | 'EMBARRASSED_MISS'
  | 'SETTLED_IDLE'
  | 'REPLAY_POSE';

export type HeavyAttackerAnimState =
  | 'HEAVY_IDLE'
  | 'HEAVY_STEP_IN'
  | 'GROUND_THUMP'
  | 'ASSISTED_MOUNT'
  | 'BULLSEYE_ACK_DELIGHTED'
  | 'LAUNCHER_CREAK_LOAD'
  | 'DEEP_COMPRESSION'
  | 'LAUNCHER_FULL_STRAIN'
  | 'HEAVY_READY_POSE'
  | 'RELEASE_SURPRISE'
  | 'HEAVY_FLIGHT_MOMENTUM'
  | 'AIRBORNE_DELIGHT'
  | 'HEAVY_IMPACT_BRACE'
  | 'POST_IMPACT_TRIUMPH'
  | 'WEAK_HIT_GRUMBLE'
  | 'POST_IMPACT_STUNNED'
  | 'HEAVY_SETTLED';

export type GromFacingPose = 'FRONT' | 'THREE_QUARTER' | 'SIDE';

export interface GromRigPose {
  facing: GromFacingPose;
  squashX: number;
  squashY: number;
  browTiltLeft: number;
  browTiltRight: number;
  browLiftY: number;
  eyeOpenLeft: number;
  eyeOpenRight: number;
  pupilOffset: Vector2;
  mouthState: 'STOIC' | 'GRIN' | 'SURPRISE_O' | 'GRIT_BRACE' | 'GRUMBLE';
  leftArmAngle: number;
  rightArmAngle: number;
  armorSecondaryLag: Vector2;
}

export type WispPersonalityTendency =
  | 'BRAVE'
  | 'EASILY_DISTRACTED'
  | 'SERIOUS'
  | 'NERVOUS'
  | 'CURIOUS';

export type WispReactionState =
  | 'CALM_IDLE'
  | 'BLINK'
  | 'LOOK_AROUND'
  | 'SPOT_ATTACKER'
  | 'WATCH_TRAJECTORY'
  | 'ALARMED_ALERT'
  | 'GASP'
  | 'BRACE_FOR_IMPACT'
  | 'COWER'
  | 'STARTLED_JUMP'
  | 'DODGE_LEAN'
  | 'RELIEVED_EXHALE'
  | 'REINFORCEMENT_HOPE'
  | 'MENTOR_GRATITUDE'
  | 'CELEBRATION_CHORUS'
  | 'SOLEMN_SURVIVAL'
  | 'DEFEAT_MOURN'
  | 'DISPERSING_GATHER'
  | 'DISPERSING_SWIRL'
  | 'DISPERSING_ASCEND'
  | 'DISPERSED_FADING';

export interface WispPresentationData {
  wispId: string;
  isHero: boolean;
  tendency: WispPersonalityTendency;
  reactionState: WispReactionState;
  dispersalProgress: number; // 0 to 1
  lookTarget: Vector2 | null;
  blinkPhase: number;
  transitionProgress?: number;
  celebrationElapsedSec?: number;
  celebrationSurvivorIndex?: number;
  celebrationSurvivorCount?: number;
  celebrationTotalWispCount?: number;
}

export interface CosmeticParticle {
  id: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'spark' | 'shard' | 'orb' | 'rune';
}

export interface ReplayKeyframe {
  timestamp: number;
  cameraCenter: Vector2;
  cameraScale: number;
  projectile: {
    position: Vector2;
    velocity: Vector2;
    radius: number;
    attackerType: AttackerType;
  } | null;
  pieces: {
    id: string;
    type: MaterialType;
    position: Vector2;
    rotation: number;
    isPrebuilt: boolean;
    condition: PieceCondition;
    impactSeverity: number;
  }[];
  wisps: {
    id: string;
    position: Vector2;
    isDispersed: boolean;
    reactionState: WispReactionState;
    dispersalProgress: number;
  }[];
}

export interface PresentationDiagnostics {
  currentGameplayState: string;
  presentationMode: PresentationMode;
  currentCameraMode: CameraDirectorMode;
  requestedCameraMode: CameraDirectorMode;
  previousCameraMode: CameraDirectorMode;
  cameraTarget: string;
  povCameraEnabled: boolean;
  povActive: boolean;
  povFallbackActive: boolean;
  povFallbackReason: string | null;
  projectileWorldPosition: Vector2 | null;
  projectileVelocityVector: Vector2 | null;
  povForwardVector: Vector2 | null;
  cameraWorldPosition: Vector2 | null;
  cameraRollRad: number;
  distanceToSelectedTarget: number | null;
  predictedTimeToImpactSec: number | null;
  expectedFirstObstruction: string | null;
  preImpactCutThresholdSec: number;
  actualCutReason: string | null;
  presentationTimeScale: number;
  authoritativePhysicsTimeScale: number;
  transformBufferLength: number;
  actualFirstImpactObject: string | null;
  retryDesignEnabledDuringFlight: boolean;
  activeAttacker: string | null;
  attackerAnimationState: string;
  launcherAnimationState: string;
  selectedTargetId: string | null;
  selectedArcType: string | null;
  projectilePresentationState: string;
  heroWispState: WispReactionState;
  companionWispStates: Record<string, WispReactionState>;
  dispersalAnimationCount: number;
  activeParticleCount: number;
  activeSoundCount: number;
  lastPresentationEvent: PresentationEventType | null;
  lastSoundTrigger: string;
  reducedMotionEnabled: boolean;
  cinematicsEnabled: boolean;
  audioMuted: boolean;
  replayState: string;
  lastSkippedSequence: string | null;
}
