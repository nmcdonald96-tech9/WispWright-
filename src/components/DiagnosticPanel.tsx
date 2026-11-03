/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AttemptBalanceTelemetry,
  ConstructionDiagnostics,
  ConstructionRelevanceTelemetry,
  DeveloperWispOverrideDiagnostics,
  GameMode,
  InventoryCategory,
  LevelState,
  MaterialType,
  SnapshotType,
  UnlockState,
} from '../game/types';
import { DetailedPhysicsDiagnostics } from '../game/physics/physicsBridge';
import { TargetingDiagnostics } from '../game/siege/targeting';
import { DistancePreset, DISTANCE_PRESETS } from '../game/siege/siegeConfig';
import {
  CameraDirectorMode,
  PresentationDiagnostics,
  WispReactionState,
} from '../game/presentation/presentationTypes';
import {
  Terminal,
  Trash2,
  X,
  Activity,
  Target,
  Compass,
  Wrench,
  ChevronDown,
  ChevronUp,
  Layers,
  Film,
  Sparkles,
  CheckSquare,
} from 'lucide-react';

interface DiagnosticPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: GameMode;
  selectedPieceId: string | null;
  state: LevelState;
  undoCount: number;
  redoCount: number;
  constructionHistory: { undo: number; redo: number };
  reinforcementHistory: { undo: number; redo: number };
  zoom: number;
  hasSnapshot: boolean;
  activeSnapshots: SnapshotType[];
  categoryCounts: Record<InventoryCategory, number>;
  deliveryGranted: boolean;
  deliveredInventory: Record<MaterialType, number>;
  guaranteedDeliveryUsed: number;
  currentAttackIndex: number;
  attacksRemaining: number;
  reinforcementTimerSec: number;
  reinforcementTimerDisabled: boolean;
  unlockState: UnlockState;
  physicsDiagnostics: DetailedPhysicsDiagnostics | null;
  targetingDiagnostics?: TargetingDiagnostics | null;
  presentationDiagnostics?: PresentationDiagnostics | null;
  constructionTelemetry?: ConstructionRelevanceTelemetry;
  constructionDiagnostics?: ConstructionDiagnostics | null;
  devBypassTutorialRequirements?: boolean;
  onToggleDevBypassTutorialRequirements?: () => void;
  distancePreset?: DistancePreset;
  onSelectDistancePreset?: (preset: DistancePreset) => void;
  cameraFramingMode?: string;
  actualFlightTime?: number;
  // Phase 3 Developer Test Controls (9)
  onToggleDisableTimer: () => void;
  onExtendTimer30s: () => void;
  onJumpToPostAttack1: () => void;
  onGrantReserveEmpty: () => void;
  onForceGuaranteedDelivery: () => void;
  onSimulateSafeReload: () => void;
  onClearTutorialState: () => void;
  onClearSampleUnlock: () => void;
  onClearStorage: () => void;
  // Phase 4 Developer Presentation Controls (13)
  onPreviewStandardIntro?: () => void;
  onPreviewHeavyIntro?: () => void;
  onTriggerWispReaction?: (state: WispReactionState | null) => void;
  onPreviewStandardFlight?: () => void;
  onPreviewHeavyFlight?: () => void;
  onPreviewWispDispersalCosmetic?: () => void;
  onForceCameraOverride?: (mode: CameraDirectorMode | null) => void;
  onToggleExperimentalPOV?: () => void;
  onTestPovFallback?: () => void;
  onTestImpactSeverity?: (severity: 'LIGHT' | 'MEDIUM' | 'HEAVY') => void;
  onToggleReplay?: () => void;
  onClearPresentationSettings?: () => void;
  onClearReplayData?: () => void;
  // Phase 5 Bullseye Taunt Diagnostics & Developer Controls (8)
  bullseyeConflictDiagnostic?: string | null;
  lastTargetComparison?: {
    ordinaryTargetId: string;
    bullseyeTargetId: string;
    overrideActive: boolean;
    reachable: boolean;
  } | null;
  onDevGrantBullseye?: () => void;
  onDevPlaceBullseyeReinforced?: () => void;
  onDevPlaceBullseyeExposedDecoy?: () => void;
  onDevPlaceBullseyeUnreachable?: () => void;
  onDevResetBullseyeState?: () => void;
  onDevForceAttack1BullseyeTest?: () => void;
  onDevForceAttack2ReinforcementRetargetTest?: () => void;
  onDevCompareOrdinaryVsBullseyeTarget?: () => void;
  // Variable Wisp-Count Override & Balance Observability Telemetry
  developerWispOverrideDiagnostics?: DeveloperWispOverrideDiagnostics;
  onSetDeveloperWispCountOverride?: (count: 1 | 2 | 3 | 4 | 5 | null) => void;
  balanceTelemetryHistory?: AttemptBalanceTelemetry[];
  onClearBalanceTelemetryHistory?: () => void;
}

export const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({
  isOpen,
  onClose,
  mode,
  selectedPieceId,
  state,
  constructionHistory,
  reinforcementHistory,
  zoom,
  hasSnapshot,
  activeSnapshots,
  categoryCounts,
  deliveryGranted,
  deliveredInventory,
  guaranteedDeliveryUsed,
  currentAttackIndex,
  attacksRemaining,
  reinforcementTimerSec,
  reinforcementTimerDisabled,
  unlockState,
  physicsDiagnostics,
  targetingDiagnostics,
  presentationDiagnostics,
  constructionTelemetry,
  constructionDiagnostics,
  devBypassTutorialRequirements = false,
  onToggleDevBypassTutorialRequirements,
  distancePreset = 'STANDARD',
  onSelectDistancePreset,
  cameraFramingMode = 'CONSTRUCTION_CAMERA',
  actualFlightTime,
  onToggleDisableTimer,
  onExtendTimer30s,
  onJumpToPostAttack1,
  onGrantReserveEmpty,
  onForceGuaranteedDelivery,
  onSimulateSafeReload,
  onClearTutorialState,
  onClearSampleUnlock,
  onClearStorage,
  onPreviewStandardIntro,
  onPreviewHeavyIntro,
  onTriggerWispReaction,
  onPreviewStandardFlight,
  onPreviewHeavyFlight,
  onPreviewWispDispersalCosmetic,
  onForceCameraOverride,
  onToggleExperimentalPOV,
  onTestPovFallback,
  onTestImpactSeverity,
  onToggleReplay,
  onClearPresentationSettings,
  onClearReplayData,
  bullseyeConflictDiagnostic,
  lastTargetComparison,
  onDevGrantBullseye,
  onDevPlaceBullseyeReinforced,
  onDevPlaceBullseyeExposedDecoy,
  onDevPlaceBullseyeUnreachable,
  onDevDevResetBullseyeState: _unusedReset,
  onDevResetBullseyeState,
  onDevForceAttack1BullseyeTest,
  onDevForceAttack2ReinforcementRetargetTest,
  onDevCompareOrdinaryVsBullseyeTarget,
  developerWispOverrideDiagnostics,
  onSetDeveloperWispCountOverride,
  balanceTelemetryHistory = [],
  onClearBalanceTelemetryHistory,
}: DiagnosticPanelProps & { onDevDevResetBullseyeState?: () => void }) => {
  const [devControlsExpanded, setDevControlsExpanded] = useState(false);
  const [bullseyeControlsExpanded, setBullseyeControlsExpanded] = useState(true);
  const [presControlsExpanded, setPresControlsExpanded] = useState(true);
  const [presDiagExpanded, setPresDiagExpanded] = useState(true);

  if (!isOpen) return null;

  const activePreset = targetingDiagnostics?.distancePreset || distancePreset;
  const deliveredRemaining =
    (deliveredInventory.wood_beam || 0) +
    (deliveredInventory.wood_block || 0) +
    (deliveredInventory.stone_block || 0);

  return (
    <div className="fixed top-12 left-2 z-30 w-90 max-w-[95vw] max-h-[85vh] overflow-y-auto bg-slate-950/95 border border-indigo-700/60 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-mono animate-in fade-in zoom-in-95 duration-100">
      <div className="flex items-center justify-between border-b border-indigo-800/50 pb-1.5 mb-2">
        <div className="flex items-center gap-1.5 text-indigo-300 font-bold">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span>PHASE 4 PRESENTATION &amp; GAME DIAGNOSTICS</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
          aria-label="Close diagnostics"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5 text-slate-300 text-[10px]">
        {/* 1. Phase 4 Presentation Diagnostics (25 Fields) */}
        {presentationDiagnostics && (
          <div className="border border-amber-500/40 rounded-lg p-1.5 bg-slate-900/90">
            <button
              onClick={() => setPresDiagExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between text-[10px] font-bold text-amber-300 pb-1 cursor-pointer"
            >
              <span className="flex items-center gap-1">
                <Film className="w-3 h-3 text-amber-400" />
                <span>PHASE 4 PRESENTATION TELEMETRY (25 FIELDS)</span>
              </span>
              {presDiagExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {presDiagExpanded && (
              <div className="space-y-0.5 text-[9.5px] border-t border-slate-800 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">1. Gameplay State:</span>
                  <span className="font-bold text-cyan-300">
                    {presentationDiagnostics.currentGameplayState}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">2-4. Cam (Cur / Req / Prev):</span>
                  <span className="text-amber-300 font-semibold truncate max-w-[175px]">
                    {presentationDiagnostics.currentCameraMode} /{' '}
                    {presentationDiagnostics.requestedCameraMode} /{' '}
                    {presentationDiagnostics.previousCameraMode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">5. Camera Target:</span>
                  <span className="text-slate-200">{presentationDiagnostics.cameraTarget}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">6-7. POV On / Fallback:</span>
                  <span className="text-purple-300 font-bold">
                    {presentationDiagnostics.povCameraEnabled ? 'ON' : 'OFF'} ·{' '}
                    {presentationDiagnostics.povFallbackReason || 'NONE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">8-9. Attacker / Anim State:</span>
                  <span className="text-orange-300 font-bold truncate max-w-[175px]">
                    {presentationDiagnostics.activeAttacker || 'None'} ·{' '}
                    {presentationDiagnostics.attackerAnimationState}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">10. Launcher Anim State:</span>
                  <span className="text-amber-200">
                    {presentationDiagnostics.launcherAnimationState}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">11-12. Target ID / Arc:</span>
                  <span className="text-cyan-300">
                    {presentationDiagnostics.selectedTargetId || 'none'} ·{' '}
                    {presentationDiagnostics.selectedArcType || 'none'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">13. Projectile Pres State:</span>
                  <span className="text-rose-300 font-bold">
                    {presentationDiagnostics.projectilePresentationState}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">14. Hero Wisp (Ignis):</span>
                  <span className="text-emerald-300 font-bold">
                    {presentationDiagnostics.heroWispState}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">15. Companion Wisps:</span>
                  <span
                    className="text-emerald-200 truncate max-w-[170px]"
                    title={JSON.stringify(presentationDiagnostics.companionWispStates)}
                  >
                    Z:{presentationDiagnostics.companionWispStates['wisp_zephyr'] || 'IDLE'} · T:
                    {presentationDiagnostics.companionWispStates['wisp_terran'] || 'IDLE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">16-18. Disp / Part / Snd:</span>
                  <span className="text-slate-200">
                    {presentationDiagnostics.dispersalAnimationCount} disp ·{' '}
                    {presentationDiagnostics.activeParticleCount} ptc ·{' '}
                    {presentationDiagnostics.activeSoundCount} snd
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">19-20. Last Evt / Sound:</span>
                  <span className="text-amber-300 truncate max-w-[175px]">
                    {presentationDiagnostics.lastPresentationEvent || 'none'} /{' '}
                    {presentationDiagnostics.lastSoundTrigger}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">21-23. RedMot / Cin / Mute:</span>
                  <span className="text-cyan-200">
                    RM:{presentationDiagnostics.reducedMotionEnabled ? 'Y' : 'N'} · Cin:
                    {presentationDiagnostics.cinematicsEnabled ? 'Y' : 'N'} · Mute:
                    {presentationDiagnostics.audioMuted ? 'Y' : 'N'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">24-25. Replay / Last Skip:</span>
                  <span className="text-purple-300 font-bold truncate max-w-[175px]">
                    {presentationDiagnostics.replayState} ·{' '}
                    {presentationDiagnostics.lastSkippedSequence || 'none'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-0.5 mt-0.5">
                  <span className="text-slate-400">26. Presentation Mode:</span>
                  <span
                    className={`font-bold ${
                      presentationDiagnostics.presentationMode === 'DEVELOPER'
                        ? 'text-indigo-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {presentationDiagnostics.presentationMode} PRESENTATION
                  </span>
                </div>

                {/* TRUE PROJECTILE POV & TIMING DIAGNOSTICS (20 REQUIRED FIELDS) */}
                <div className="border-t border-amber-500/30 pt-1 mt-1 space-y-0.5">
                  <div className="text-[9.5px] font-bold text-amber-300">
                    TRUE PROJECTILE POV &amp; TIMING TELEMETRY (20 FIELDS)
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">POV Active / Fallback:</span>
                    <span className="text-cyan-300 font-bold">
                      {presentationDiagnostics.povActive ? 'ACTIVE' : 'INACTIVE'} · FB:{' '}
                      {presentationDiagnostics.povFallbackActive ? 'YES' : 'NO'} (
                      {presentationDiagnostics.povFallbackReason || 'NONE'})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Proj Pos / Cam Origin:</span>
                    <span className="text-slate-200">
                      {presentationDiagnostics.projectileWorldPosition
                        ? `(${Math.round(presentationDiagnostics.projectileWorldPosition.x)},${Math.round(presentationDiagnostics.projectileWorldPosition.y)})`
                        : 'none'}{' '}
                      /{' '}
                      {presentationDiagnostics.cameraWorldPosition
                        ? `(${Math.round(presentationDiagnostics.cameraWorldPosition.x)},${Math.round(presentationDiagnostics.cameraWorldPosition.y)})`
                        : 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vel Vec / POV Forward:</span>
                    <span className="text-amber-200">
                      {presentationDiagnostics.projectileVelocityVector
                        ? `(${Math.round(presentationDiagnostics.projectileVelocityVector.x)},${Math.round(presentationDiagnostics.projectileVelocityVector.y)})`
                        : 'none'}{' '}
                      /{' '}
                      {presentationDiagnostics.povForwardVector
                        ? `(${presentationDiagnostics.povForwardVector.x.toFixed(2)},${presentationDiagnostics.povForwardVector.y.toFixed(2)})`
                        : 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cam Roll / Dist Target:</span>
                    <span className="text-emerald-300 font-bold">
                      {presentationDiagnostics.cameraRollRad.toFixed(3)} rad ·{' '}
                      {presentationDiagnostics.distanceToSelectedTarget !== null
                        ? `${Math.round(presentationDiagnostics.distanceToSelectedTarget)}px`
                        : '---'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pred TTI / Cut Thresh:</span>
                    <span className="text-rose-300 font-bold">
                      {presentationDiagnostics.predictedTimeToImpactSec !== null
                        ? `${presentationDiagnostics.predictedTimeToImpactSec.toFixed(2)}s`
                        : '---'}{' '}
                      / {presentationDiagnostics.preImpactCutThresholdSec.toFixed(2)}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Obstruction / Cut Reason:</span>
                    <span className="text-purple-300 truncate max-w-[175px]">
                      {presentationDiagnostics.expectedFirstObstruction || 'none'} /{' '}
                      {presentationDiagnostics.actualCutReason || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">TimeScale (Pres / Phys):</span>
                    <span className="text-cyan-300 font-bold">
                      {presentationDiagnostics.presentationTimeScale.toFixed(2)}x /{' '}
                      {presentationDiagnostics.authoritativePhysicsTimeScale.toFixed(2)}x (Buf:{' '}
                      {presentationDiagnostics.transformBufferLength})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">1st Impact / RetryInFlight:</span>
                    <span className="text-emerald-300 font-bold">
                      {presentationDiagnostics.actualFirstImpactObject || 'none'} · RetryUI:{' '}
                      {presentationDiagnostics.retryDesignEnabledDuringFlight ? 'LEAK!' : 'FALSE'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Collapsible 13 Phase 4 Developer Presentation Controls */}
        <div className="border-t border-purple-900/60 pt-1.5">
          <button
            onClick={() => setPresControlsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-purple-300 py-0.5 cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>PHASE 4 PRESENTATION CONTROLS (13 ACTIONS)</span>
            </span>
            {presControlsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {presControlsExpanded && (
            <div className="space-y-1 mt-1 bg-slate-900/90 p-1.5 rounded border border-slate-800">
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={onPreviewStandardIntro}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  1. Preview Standard Intro
                </button>
                <button
                  onClick={onPreviewHeavyIntro}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  2. Preview Heavy Intro
                </button>
                <button
                  onClick={onPreviewStandardFlight}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  4. Preview Std Flight
                </button>
                <button
                  onClick={onPreviewHeavyFlight}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  5. Preview Heavy Flight
                </button>
                <button
                  onClick={onPreviewWispDispersalCosmetic}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  6. Preview Wisp Dispersal
                </button>
                <button
                  onClick={onToggleExperimentalPOV}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  8. Toggle Projectile POV
                </button>
                <button
                  onClick={onTestPovFallback}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  9. Test POV Fallback
                </button>
                <button
                  onClick={onToggleReplay}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  11. Start / Skip Replay
                </button>
                <button
                  onClick={onClearPresentationSettings}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  12. Clear Pres Settings
                </button>
                <button
                  onClick={onClearReplayData}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
                >
                  13. Clear Replay Data
                </button>
              </div>

              {/* 3. Wisp Reaction Trigger Strip */}
              <div className="pt-1 border-t border-slate-800">
                <div className="text-[8.5px] text-slate-400 mb-0.5">
                  3. Trigger Wisp Reaction State:
                </div>
                <div className="grid grid-cols-6 gap-0.5">
                  {(
                    [
                      ['CALM_IDLE', 'Calm'],
                      ['ALARMED_ALERT', 'Alert'],
                      ['BRACE_FOR_IMPACT', 'Brace'],
                      ['STARTLED_JUMP', 'Jump'],
                      ['RELIEVED_EXHALE', 'Relief'],
                      ['CELEBRATION_CHORUS', 'Cheer'],
                    ] as [WispReactionState, string][]
                  ).map(([st, label]) => (
                    <button
                      key={st}
                      onClick={() => onTriggerWispReaction?.(st)}
                      className="py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 text-[8.5px] font-bold cursor-pointer"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 7. Camera Mode Override Strip */}
              <div className="pt-1 border-t border-slate-800">
                <div className="text-[8.5px] text-slate-400 mb-0.5">
                  7. Force Camera Mode Override:
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  {(
                    [
                      [null, 'Auto'],
                      ['ATTACKER_INTRO_CAMERA', 'Intro'],
                      ['TARGET_REVEAL_CAMERA', 'Target'],
                      ['PROJECTILE_POV_CAMERA', 'POV'],
                    ] as [CameraDirectorMode | null, string][]
                  ).map(([cm, label]) => (
                    <button
                      key={label}
                      onClick={() => onForceCameraOverride?.(cm)}
                      className="py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 text-[8.5px] font-bold cursor-pointer"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10. Impact Severity Cosmetic Preview Strip */}
              <div className="pt-1 border-t border-slate-800">
                <div className="text-[8.5px] text-slate-400 mb-0.5">
                  10. Test Impact Presentation Severity (Cosmetic):
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['LIGHT', 'MEDIUM', 'HEAVY'] as const).map((sev) => (
                    <button
                      key={sev}
                      onClick={() => onTestImpactSeverity?.(sev)}
                      className="py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[8.5px] font-bold cursor-pointer"
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Level State Machine & Camera */}
        <div className="bg-slate-900/80 rounded p-1.5 space-y-1 border-t border-slate-800">
          <div className="flex justify-between">
            <span className="text-slate-400">Level State / Zoom:</span>
            <span className="font-bold text-cyan-400">
              {mode} · {Math.round(zoom * 100)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Attack Index / Rem / Timer:</span>
            <span className="text-amber-300 font-bold">
              Atk {currentAttackIndex + 1} / {attacksRemaining} rem ·{' '}
              {reinforcementTimerDisabled ? 'OFF' : `${Math.ceil(reinforcementTimerSec)}s`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">History (Build / Reinf):</span>
            <span className="text-slate-200">
              {constructionHistory.undo}/{constructionHistory.redo} ·{' '}
              {reinforcementHistory.undo}/{reinforcementHistory.redo}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Selected Piece:</span>
            <span className="text-slate-200 truncate max-w-[140px]">
              {selectedPieceId || 'none'}
            </span>
          </div>
        </div>

        {/* 3A-WISP. Developer Wisp-Count Override & Variable Wisp Diagnostics */}
        {developerWispOverrideDiagnostics && (
          <div className="border-t border-teal-800/60 pt-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-[10px] font-bold text-teal-300">
                <Sparkles className="w-3 h-3 text-teal-400" />
                <span>DEVELOPER WISP-COUNT OVERRIDE</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-300">
                Req: {developerWispOverrideDiagnostics.activeRequiredWispCount} (Ov:{' '}
                {developerWispOverrideDiagnostics.developerWispCountOverride ?? 'Default 3'})
              </span>
            </div>
            <div className="bg-slate-900/90 rounded p-1.5 space-y-1 text-[9.5px]">
              <div className="grid grid-cols-6 gap-1">
                {([1, 2, 3, 4, 5] as const).map((cnt) => {
                  const isActive =
                    developerWispOverrideDiagnostics.activeRequiredWispCount === cnt &&
                    (developerWispOverrideDiagnostics.developerWispCountOverride === cnt ||
                      (developerWispOverrideDiagnostics.developerWispCountOverride === null &&
                        cnt === developerWispOverrideDiagnostics.configuredLevelRequiredWispCount));
                  return (
                    <button
                      key={cnt}
                      onClick={() => onSetDeveloperWispCountOverride?.(cnt)}
                      className={`py-0.5 px-1 rounded text-[9px] font-bold cursor-pointer border ${
                        isActive
                          ? 'bg-teal-600 text-white border-teal-300'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      {cnt} Wisp{cnt > 1 ? 's' : ''}
                    </button>
                  );
                })}
                <button
                  onClick={() => onSetDeveloperWispCountOverride?.(null)}
                  className="py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[8.5px] font-bold cursor-pointer"
                  title="Reset to Level 1 Default (3 Wisps)"
                >
                  Def (3)
                </button>
              </div>
              <div className="flex justify-between pt-0.5">
                <span className="text-slate-400">Active Wisp IDs:</span>
                <span className="text-teal-200 font-semibold truncate max-w-[180px]">
                  {developerWispOverrideDiagnostics.activeWispIds
                    .map((id) => id.replace('wisp_', ''))
                    .join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Placed / Staging / MinComplete:</span>
                <span className="text-emerald-300 font-bold">
                  {developerWispOverrideDiagnostics.placedWispCount} placed ·{' '}
                  {developerWispOverrideDiagnostics.stagingWispCount} stg · min{' '}
                  {developerWispOverrideDiagnostics.minimumStableWispsForCompletion}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 3A-BAL. Observational Balance Telemetry History (Max 25 Runs) */}
        <div className="border-t border-cyan-900/60 pt-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-cyan-300">
              OBSERVATIONAL BALANCE TELEMETRY ({balanceTelemetryHistory.length}/25)
            </span>
            {balanceTelemetryHistory.length > 0 && onClearBalanceTelemetryHistory && (
              <button
                onClick={onClearBalanceTelemetryHistory}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[8.5px] cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {balanceTelemetryHistory.length > 0 ? (
            <div className="bg-slate-900/90 rounded p-1.5 space-y-0.5 text-[9px]">
              {(() => {
                const latest = balanceTelemetryHistory[balanceTelemetryHistory.length - 1];
                return (
                  <>
                    <div className="flex justify-between text-amber-200 font-bold">
                      <span>Latest ({latest.levelId} · {latest.activeWispCount} wisps):</span>
                      <span>{latest.finalResultBand}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Atk1 / Atk2 Targets:</span>
                      <span className="truncate max-w-[170px]">
                        {latest.attack1TargetId || 'none'} / {latest.attack2TargetId || 'none'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Survived / Reinf / Bullseye:</span>
                      <span>
                        {latest.finalWispsStable}/{latest.activeWispCount} · Reinf:{latest.reinforcementPiecesPlaced} · Bull:{latest.bullseyeUsed ? 'Y' : 'N'}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="bg-slate-900/60 rounded p-1 text-[9px] text-slate-500">
              No completed siege runs recorded yet in this session.
            </div>
          )}
        </div>

        {/* 3B. Construction Inventory-Lift, Beam-Endpoint Snap & Rotation Telemetry (All 38 fields) */}
        {constructionDiagnostics && (
          <div className="border-t border-amber-500/30 pt-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-300 mb-1">
              <Compass className="w-3 h-3 text-amber-400" />
              <span>INVENTORY-LIFT &amp; ENDPOINT SNAP TELEMETRY</span>
            </div>
            <div className="bg-slate-900/80 rounded p-1.5 space-y-1 text-[9.5px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Interaction / Lift State:</span>
                <span className="text-cyan-300 font-bold">
                  {constructionDiagnostics.activePointerInteractionType} ·{' '}
                  {constructionDiagnostics.inventoryLiftState}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Item ID / Ghost Scale:</span>
                <span className="text-amber-200">
                  {constructionDiagnostics.activeInventoryItemId || 'none'} · Pres:{' '}
                  {constructionDiagnostics.ghostPresentationScale.toFixed(2)}x / World:{' '}
                  {constructionDiagnostics.ghostWorldScale.toFixed(1)}x
                </span>
              </div>
              {constructionDiagnostics.inventorySourceCardBounds && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Source Card Bounds:</span>
                  <span className="text-slate-300 font-mono">
                    ({Math.round(constructionDiagnostics.inventorySourceCardBounds.x)},
                    {Math.round(constructionDiagnostics.inventorySourceCardBounds.y)} ·{' '}
                    {Math.round(constructionDiagnostics.inventorySourceCardBounds.width)}×
                    {Math.round(constructionDiagnostics.inventorySourceCardBounds.height)})
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Pointer UI / World:</span>
                <span className="text-slate-300 font-mono">
                  {constructionDiagnostics.pointerUiCoordinates
                    ? `(${Math.round(constructionDiagnostics.pointerUiCoordinates.x)},${Math.round(constructionDiagnostics.pointerUiCoordinates.y)})`
                    : 'none'}{' '}
                  /{' '}
                  {constructionDiagnostics.pointerWorldCoordinates
                    ? `(${Math.round(constructionDiagnostics.pointerWorldCoordinates.x)},${Math.round(constructionDiagnostics.pointerWorldCoordinates.y)})`
                    : 'none'}
                </span>
              </div>
              {constructionDiagnostics.ghostWorldCoordinates && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Ghost Pos / Corr Vec:</span>
                  <span className="text-slate-300 font-mono">
                    ({Math.round(constructionDiagnostics.ghostWorldCoordinates.x)},{' '}
                    {Math.round(constructionDiagnostics.ghostWorldCoordinates.y)}) · Δ:
                    {constructionDiagnostics.positionCorrectionVector
                      ? `(${Math.round(constructionDiagnostics.positionCorrectionVector.x)},${Math.round(constructionDiagnostics.positionCorrectionVector.y)})`
                      : '(0,0)'}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Preferred / Current Rot:</span>
                <span className="text-emerald-300 font-bold">
                  {Math.round(
                    ((constructionDiagnostics.preferredPlayerRotation * 180) / Math.PI) % 360,
                  )}
                  ° / {Math.round(((constructionDiagnostics.ghostRotation * 180) / Math.PI) % 360)}
                  ° · {constructionDiagnostics.rotationSource} (rev{' '}
                  {constructionDiagnostics.manualRotationRevision})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Piece Sock → Target Sock:</span>
                <span className="text-teal-300 font-semibold truncate max-w-[175px]">
                  {constructionDiagnostics.activePieceSocketId || 'none'} →{' '}
                  {constructionDiagnostics.activeTargetSocketId || 'none'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Compatibility / Dist:</span>
                <span className="text-amber-300 truncate max-w-[175px]">
                  {constructionDiagnostics.socketCompatibility || 'NONE'} ·{' '}
                  {constructionDiagnostics.candidateWorldDistance !== null
                    ? `${constructionDiagnostics.candidateWorldDistance.toFixed(1)}px`
                    : '---'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cand Lock / Rel Radius:</span>
                <span className="text-cyan-200">
                  {constructionDiagnostics.candidateLockActive ? 'LOCKED' : 'UNLOCKED'} · R=
                  {constructionDiagnostics.candidateLockReleaseRadius}px
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prop Rot / Joint / Support:</span>
                <span className="text-purple-300">
                  {constructionDiagnostics.proposedRotation !== null
                    ? `${Math.round(((constructionDiagnostics.proposedRotation * 180) / Math.PI) % 360)}°`
                    : 'none'}{' '}
                  · Jnt:{constructionDiagnostics.explicitJointProposed ? 'YES' : 'NO'} · Sup:
                  {constructionDiagnostics.supportedContactPredicted ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Rejection / Overlap / Pen:</span>
                <span className="text-rose-300 truncate max-w-[175px]">
                  {constructionDiagnostics.placementRejectionReason || 'VALID'} ·{' '}
                  {constructionDiagnostics.overlapColliderId || 'none'} (
                  {constructionDiagnostics.penetrationDepth.toFixed(1)}px)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Decr / Commit / Cancel:</span>
                <span className="text-slate-300">
                  Decr: {constructionDiagnostics.inventoryDecrementCountForCurrentInteraction} ·
                  Commits: {constructionDiagnostics.placementCommitCount} · Cancel:{' '}
                  {constructionDiagnostics.cancellationReason || 'none'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cam Suppressed / Snap Rej:</span>
                <span className="text-orange-300 truncate max-w-[170px]">
                  CamSup:{' '}
                  {constructionDiagnostics.cameraMovementSuppressedDuringDrag
                    ? 'YES'
                    : 'NO'}{' '}
                  · {constructionDiagnostics.lastSnapRejectionReason || 'NONE'}
                </span>
              </div>

              {/* Rotation Validation Diagnostics */}
              {constructionDiagnostics.rotationDiagnostics && (
                <div className="pt-1 mt-1 border-t border-slate-800 space-y-0.5">
                  <div className="text-[9px] font-bold text-amber-300 uppercase">
                    Rotation Transaction Validation
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Piece / Accepted:</span>
                    <span
                      className={`font-bold ${
                        constructionDiagnostics.rotationDiagnostics.rotationAccepted
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {constructionDiagnostics.rotationDiagnostics.selectedPieceId || 'none'} ·{' '}
                      {constructionDiagnostics.rotationDiagnostics.rotationAccepted
                        ? 'ACCEPTED'
                        : 'REJECTED'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Committed → Proposed:</span>
                    <span className="text-cyan-300 font-mono">
                      {Math.round(
                        (constructionDiagnostics.rotationDiagnostics.currentCommittedAngle * 180) /
                          Math.PI,
                      )}
                      ° →{' '}
                      {Math.round(
                        (constructionDiagnostics.rotationDiagnostics.proposedAngle * 180) / Math.PI,
                      )}
                      °
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Final / Sweep Overlaps:</span>
                    <span className="text-amber-200 font-mono">
                      Final: {constructionDiagnostics.rotationDiagnostics.rotationFinalOverlapCount}{' '}
                      · Sweep:{' '}
                      {constructionDiagnostics.rotationDiagnostics.rotationSweepOverlapCount} ·
                      ConnIncompat:{' '}
                      {constructionDiagnostics.rotationDiagnostics.connectionIncompatibility
                        ? 'YES'
                        : 'NO'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reason / Collider / Pen:</span>
                    <span className="text-rose-300 truncate max-w-[175px]">
                      {constructionDiagnostics.rotationDiagnostics.lastRejectionReason} ·{' '}
                      {constructionDiagnostics.rotationDiagnostics.conflictingColliderId || 'none'}{' '}
                      ({constructionDiagnostics.rotationDiagnostics.penetrationDepth.toFixed(1)}px)
                    </span>
                  </div>
                </div>
              )}

              {/* Build-Phase Wisp Presence Diagnostics */}
              {constructionDiagnostics.wispPresenceDiagnostics && (
                <div className="pt-1 mt-1 border-t border-slate-800 space-y-0.5">
                  <div className="text-[9px] font-bold text-teal-300 uppercase">
                    Wisp Presence Accounting ({constructionDiagnostics.wispPresenceDiagnostics.currentPhase})
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Battlefield / Blocker / Staging:</span>
                    <span className="text-teal-200 font-bold font-mono">
                      BF: {constructionDiagnostics.wispPresenceDiagnostics.wispBattlefieldCount} ·
                      Blk: {constructionDiagnostics.wispPresenceDiagnostics.wispBlockerCount} ·
                      Stg: {constructionDiagnostics.wispPresenceDiagnostics.wispStagingCount}
                    </span>
                  </div>
                  <div className="space-y-0.5 pt-0.5">
                    {constructionDiagnostics.wispPresenceDiagnostics.wisps.map((w) => (
                      <div key={w.wispId} className="flex justify-between text-[8.5px]">
                        <span className="text-slate-400">{w.wispId.replace('wisp_', '')}:</span>
                        <span className={w.placed ? 'text-emerald-300' : 'text-slate-400'}>
                          placed={String(w.placed)} · pos=
                          {w.position ? `(${Math.round(w.position.x)},${Math.round(w.position.y)})` : 'null'}{' '}
                          · blk={String(w.blocksConstruction)} · {w.shelterState}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Wisp Placement & Enclosure Validation Diagnostics */}
              {constructionDiagnostics.wispPlacementDiagnostics && (
                <div className="pt-1 mt-1 border-t border-slate-800 space-y-0.5">
                  <div className="text-[9px] font-bold text-cyan-300 uppercase">
                    Wisp Placement &amp; Enclosure Validation
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Wisp ID / Pos / Bounds:</span>
                    <span className="text-cyan-200 font-mono">
                      {constructionDiagnostics.wispPlacementDiagnostics.wispId || 'none'} ·{' '}
                      {constructionDiagnostics.wispPlacementDiagnostics.wispPosition
                        ? `(${Math.round(constructionDiagnostics.wispPlacementDiagnostics.wispPosition.x)},${Math.round(constructionDiagnostics.wispPlacementDiagnostics.wispPosition.y)})`
                        : 'null'}{' '}
                      · r=
                      {constructionDiagnostics.wispPlacementDiagnostics.wispColliderBounds?.radius ?? 18}
                      px
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Clearance / Sealed Enclosure:</span>
                    <span className="text-emerald-300 font-bold">
                      {constructionDiagnostics.wispPlacementDiagnostics.localClearanceResult} ·
                      Sealed: {constructionDiagnostics.wispPlacementDiagnostics.sealedEnclosureAccepted ? 'YES' : 'NO'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Overlap Pieces / Terrain / Wisps:</span>
                    <span className="text-amber-200 font-mono">
                      P: {constructionDiagnostics.wispPlacementDiagnostics.overlappingConstructionColliderId || 'none'} ·
                      T: {constructionDiagnostics.wispPlacementDiagnostics.overlappingTerrainColliderId || 'none'} ·
                      W: {constructionDiagnostics.wispPlacementDiagnostics.overlappingWispId || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sanctuary Bounds / Ext Path:</span>
                    <span className="text-purple-300 font-mono">
                      {constructionDiagnostics.wispPlacementDiagnostics.sanctuaryBoundaryResult} ·
                      ExtPathCheck: {String(constructionDiagnostics.wispPlacementDiagnostics.exteriorPathCheckEnabled)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Warnings / Rejection:</span>
                    <span className="text-rose-300 truncate max-w-[175px]">
                      {constructionDiagnostics.wispPlacementDiagnostics.warningClassifications.length > 0
                        ? `[${constructionDiagnostics.wispPlacementDiagnostics.warningClassifications.join(', ')}]`
                        : 'NONE'}{' '}
                      · Rej: {constructionDiagnostics.wispPlacementDiagnostics.lastPlacementRejectionReason || 'VALID'}
                    </span>
                  </div>
                </div>
              )}

              {/* Timber Joint Diagnostics (20 Fields) */}
              {constructionDiagnostics.timberJointDiagnostics && (
                <div className="pt-1 mt-1 border-t border-slate-800 space-y-0.5">
                  <div className="text-[9px] font-bold text-emerald-300 uppercase">
                    Timber Joint Telemetry (20 Fields)
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">1-2. Snap On / Drag Piece:</span>
                    <span className="text-emerald-300 font-bold font-mono">
                      Snap: {constructionDiagnostics.timberJointDiagnostics.snapEnabled ? 'ON' : 'OFF'} ·{' '}
                      {constructionDiagnostics.timberJointDiagnostics.activeDraggingPieceId || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">3-5. Sockets (Src → Tgt):</span>
                    <span className="text-cyan-300 font-mono truncate max-w-[175px]">
                      {constructionDiagnostics.timberJointDiagnostics.activeSourceSocketId || 'none'} →{' '}
                      {constructionDiagnostics.timberJointDiagnostics.activeTargetPieceId || 'none'}.
                      {constructionDiagnostics.timberJointDiagnostics.activeTargetSocketId || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">6-8. Dist / Cat / Eligible:</span>
                    <span className="text-amber-200 font-mono">
                      {constructionDiagnostics.timberJointDiagnostics.socketWorldDistance !== null
                        ? `${constructionDiagnostics.timberJointDiagnostics.socketWorldDistance.toFixed(1)}px`
                        : '---'}{' '}
                      · {constructionDiagnostics.timberJointDiagnostics.proposedConnectionCategory} ·{' '}
                      {constructionDiagnostics.timberJointDiagnostics.jointEligibility ? 'ELIGIBLE' : 'NO'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">9-11. Overlap / Pen / Conflict:</span>
                    <span className="text-rose-300 font-mono truncate max-w-[175px]">
                      {constructionDiagnostics.timberJointDiagnostics.overlapClassification} ·{' '}
                      {constructionDiagnostics.timberJointDiagnostics.penetrationDepth.toFixed(1)}px (
                      {constructionDiagnostics.timberJointDiagnostics.conflictingPieceId || 'none'})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">12-13. Preferred / Committed Rot:</span>
                    <span className="text-purple-300 font-mono">
                      Pref: {Math.round((constructionDiagnostics.timberJointDiagnostics.manualPreferredRotation * 180) / Math.PI)}° ·{' '}
                      Committed: {Math.round((constructionDiagnostics.timberJointDiagnostics.committedRotation * 180) / Math.PI)}°
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">14. Created Joint ID:</span>
                    <span className="text-slate-200 font-mono truncate max-w-[175px]">
                      {constructionDiagnostics.timberJointDiagnostics.createdTimberJointId || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">15-18. Joints (Act / Int / Str / Brk):</span>
                    <span className="text-emerald-300 font-bold font-mono">
                      Act: {constructionDiagnostics.timberJointDiagnostics.activeTimberJointCount} ·{' '}
                      <span className="text-emerald-400">{constructionDiagnostics.timberJointDiagnostics.intactJointCount}I</span> ·{' '}
                      <span className="text-amber-400">{constructionDiagnostics.timberJointDiagnostics.strainedJointCount}S</span> ·{' '}
                      <span className="text-rose-400">{constructionDiagnostics.timberJointDiagnostics.brokenJointCount}B</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">19. Last Break (Reason / Phase):</span>
                    <span className="text-rose-300 font-mono truncate max-w-[175px]">
                      {constructionDiagnostics.timberJointDiagnostics.lastJointBreakReason || 'none'} (
                      {constructionDiagnostics.timberJointDiagnostics.lastJointBreakAttackOrPhase || '---'})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">20. Player Feedback Msg:</span>
                    <span className="text-teal-200 truncate max-w-[175px]" title={constructionDiagnostics.timberJointDiagnostics.playerFriendlyJointMessage || ''}>
                      {constructionDiagnostics.timberJointDiagnostics.playerFriendlyJointMessage || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">21. Edit Preview / Taxonomy:</span>
                    <span className="text-cyan-300 font-mono">
                      {constructionDiagnostics.timberJointDiagnostics.jointEditPreviewActive ? 'PREVIEW' : 'IDLE'} ·{' '}
                      {constructionDiagnostics.timberJointDiagnostics.connectionTaxonomy || 'FREE_CONTACT'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">22. Susp / Pres / Rem / New:</span>
                    <span className="text-amber-200 font-mono">
                      S:{constructionDiagnostics.timberJointDiagnostics.suspendedJointIds?.length ?? 0} ·{' '}
                      P:{constructionDiagnostics.timberJointDiagnostics.preservedJointIds?.length ?? 0} ·{' '}
                      R:{constructionDiagnostics.timberJointDiagnostics.removedJointIds?.length ?? 0} ·{' '}
                      N:{constructionDiagnostics.timberJointDiagnostics.createdJointIds?.length ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">23. Faces (Src → Tgt):</span>
                    <span className="text-purple-300 font-mono truncate max-w-[175px]">
                      {constructionDiagnostics.timberJointDiagnostics.activeSourceFaceId || 'none'} →{' '}
                      {constructionDiagnostics.timberJointDiagnostics.activeTargetFaceId || 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">24. Roof Peak / Brace:</span>
                    <span className="text-emerald-300 font-mono">
                      Peak:{constructionDiagnostics.timberJointDiagnostics.roofPeakDetected ? 'YES' : 'NO'} (Sup:{constructionDiagnostics.timberJointDiagnostics.roofPeakLowerSupportsDetected ? 'Y' : 'N'}) ·{' '}
                      Brace:{constructionDiagnostics.timberJointDiagnostics.diagonalBraceDetected ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. Inventory & Piece Condition Categories */}
        <div className="border-t border-slate-800/80 pt-1.5">
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 mb-1">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span>INVENTORY &amp; BATTLEFIELD ACCOUNTING</span>
          </div>
          <div className="bg-slate-900/80 rounded p-1.5 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Reserve (Beam/Blk/Stn):</span>
              <span className="text-amber-300 font-bold">
                {state.inventory.wood_beam} / {state.inventory.wood_block} /{' '}
                {state.inventory.stone_block} (Tot: {categoryCounts.STARTING_RESERVE})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Int / Crk / Brk / Lst:</span>
              <span className="text-slate-200">
                <span className="text-emerald-400 font-bold">{categoryCounts.PLACED_INTACT}I</span>{' '}
                · <span className="text-amber-400 font-bold">{categoryCounts.PLACED_CRACKED}C</span>{' '}
                · <span className="text-rose-400 font-bold">{categoryCounts.BROKEN_DEBRIS}B</span> ·{' '}
                <span className="text-slate-400 font-bold">{categoryCounts.LOST}L</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Delivery (Grant/Rem/Used):</span>
              <span className="text-emerald-300 font-bold">
                {deliveryGranted ? 'YES' : 'NO'} · {deliveredRemaining} rem ·{' '}
                {guaranteedDeliveryUsed} used
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Wisps (Active / Disp):</span>
              <span className="font-bold text-emerald-400">
                {physicsDiagnostics?.wispsStableCount ??
                  state.wisps.filter((w) => !w.isDispersed).length}{' '}
                active /{' '}
                {physicsDiagnostics?.wispsDispersedCount ??
                  state.wisps.filter((w) => w.isDispersed).length}{' '}
                dispersed
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">
                Snapshots ({hasSnapshot ? 'OK' : '0'}) / Unlocks:
              </span>
              <span className="text-cyan-300 truncate max-w-[155px]">
                {activeSnapshots.length} snaps · Tut:{unlockState.tutorialCompleted ? 'Y' : 'N'}
              </span>
            </div>
          </div>
        </div>

        {/* 4B. Level 1 Construction Relevance Telemetry (10 Fields) & Dev No-Build Bypass */}
        {constructionTelemetry && (
          <div className="border-t border-emerald-900/60 pt-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                <CheckSquare className="w-3 h-3 text-emerald-400" />
                <span>CONSTRUCTION RELEVANCE TELEMETRY (10 FIELDS)</span>
              </div>
              <button
                onClick={onToggleDevBypassTutorialRequirements}
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold border cursor-pointer transition-all ${
                  devBypassTutorialRequirements
                    ? 'bg-amber-600 text-white border-amber-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-200 border-slate-700'
                }`}
                title="Developer No-Build Test Bypass: Allow Begin Siege without completing tutorial checklist"
              >
                {devBypassTutorialRequirements
                  ? 'Bypass Tutorial Requirements: ON'
                  : 'Bypass Tutorial Requirements'}
              </button>
            </div>

            <div className="bg-slate-900/90 rounded p-1.5 space-y-0.5 text-[9.5px] border border-emerald-950/60">
              <div className="flex justify-between">
                <span className="text-slate-400">1. Player Pieces Placed (Pre-Atk1):</span>
                <span className="text-emerald-300 font-bold">
                  {constructionTelemetry.playerPiecesPlacedBeforeAttack1}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">2. Material Types Placed:</span>
                <span className="text-amber-300 truncate max-w-[175px]">
                  {constructionTelemetry.materialTypesPlacedBeforeAttack1.length > 0
                    ? constructionTelemetry.materialTypesPlacedBeforeAttack1.join(', ')
                    : 'none'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">3. Pieces Retained in Reserve:</span>
                <span className="text-cyan-300 font-bold">
                  {constructionTelemetry.piecesRetainedInReserveBeforeAttack1}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">4. Checklist (Bm/Blk/Sup/Stb):</span>
                <span className="text-emerald-200 font-bold">
                  {constructionTelemetry.tutorialChecklistStatus.placedBeam ? 'Y' : 'N'}/
                  {constructionTelemetry.tutorialChecklistStatus.placedBlock ? 'Y' : 'N'}/
                  {constructionTelemetry.tutorialChecklistStatus.hasSupportedConnection ? 'Y' : 'N'}/
                  {constructionTelemetry.tutorialChecklistStatus.stabilityTested ? 'Y' : 'N'} (
                  {constructionTelemetry.tutorialChecklistStatus.isComplete
                    ? 'COMPLETE'
                    : 'INCOMPLETE'}
                  )
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">5. Stability Test Completed:</span>
                <span className="text-amber-200 font-bold">
                  {constructionTelemetry.stabilityTestCompleted ? 'TRUE' : 'FALSE'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">6-7. Wisps (After Atk1 / Atk2):</span>
                <span className="text-emerald-300 font-bold">
                  {constructionTelemetry.wispsAfterAttack1 ?? '---'} /{' '}
                  {constructionTelemetry.wispsAfterAttack2 ?? '---'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">8. Final Result Band:</span>
                <span className="text-cyan-300 font-bold">
                  {constructionTelemetry.finalResultBand || 'PENDING'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">9-10. Tut Completion / Dev Bypass:</span>
                <span className="text-purple-300 font-bold">
                  Awarded: {constructionTelemetry.tutorialCompletionAwarded ? 'TRUE' : 'FALSE'} ·
                  Bypass: {constructionTelemetry.noBuildDevBypassUsed ? 'TRUE' : 'FALSE'}
                </span>
              </div>

              {/* 16 Required Authoritative Tutorial & Guided Placement Diagnostics */}
              {constructionTelemetry.authoritativeTutorialState && (
                <div className="border-t border-emerald-800/60 pt-1 mt-1 space-y-0.5">
                  <div className="text-[9.5px] font-bold text-amber-300">
                    AUTHORITATIVE TUTORIAL &amp; REVISION TELEMETRY (16 FIELDS)
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">1. Guided Step:</span>
                    <span className="text-cyan-300 font-bold">
                      {constructionTelemetry.authoritativeTutorialState.currentGuidedStep}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">2-4. Beam / Block / Support:</span>
                    <span className="text-emerald-300 font-bold">
                      {constructionTelemetry.authoritativeTutorialState.beamPlaced ? 'Y' : 'N'} /{' '}
                      {constructionTelemetry.authoritativeTutorialState.blockPlaced ? 'Y' : 'N'} /{' '}
                      {constructionTelemetry.authoritativeTutorialState.supportedConnectionCreated
                        ? 'Y'
                        : 'N'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">5-6. Rev (Cur / Tested):</span>
                    <span className="text-amber-200 font-bold">
                      r{constructionTelemetry.authoritativeTutorialState.currentConstructionRevision}{' '}
                      /{' '}
                      {constructionTelemetry.authoritativeTutorialState.testedRevisionId !== null
                        ? `r${constructionTelemetry.authoritativeTutorialState.testedRevisionId}`
                        : 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">7-8. TestPassed / DesignAccepted:</span>
                    <span className="text-emerald-300 font-bold">
                      {constructionTelemetry.authoritativeTutorialState.stabilityTestPassed
                        ? 'TRUE'
                        : 'FALSE'}{' '}
                      /{' '}
                      {constructionTelemetry.authoritativeTutorialState.stableDesignAccepted
                        ? 'TRUE'
                        : 'FALSE'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">9-11. LessonDone / SiegeElig / Skip:</span>
                    <span className="text-cyan-200 font-bold">
                      {constructionTelemetry.authoritativeTutorialState.basicLessonComplete
                        ? 'Y'
                        : 'N'}{' '}
                      / {constructionTelemetry.authoritativeTutorialState.siegeEligible ? 'Y' : 'N'}{' '}
                      /{' '}
                      {constructionTelemetry.authoritativeTutorialState.guidanceSkipped ? 'Y' : 'N'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">12. Highlighted Item ID:</span>
                    <span className="text-amber-300 font-bold">
                      {constructionTelemetry.authoritativeTutorialState.currentHighlightedItemId ||
                        'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">13. Suggested Region:</span>
                    <span className="text-slate-200 truncate max-w-[175px]">
                      {constructionTelemetry.authoritativeTutorialState
                        .currentSuggestedPlacementRegion
                        ? `${constructionTelemetry.authoritativeTutorialState.currentSuggestedPlacementRegion.pieceType} @ (${constructionTelemetry.authoritativeTutorialState.currentSuggestedPlacementRegion.center.x},${constructionTelemetry.authoritativeTutorialState.currentSuggestedPlacementRegion.center.y})`
                        : 'none'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">14. Recompute Reason:</span>
                    <span className="text-emerald-200 truncate max-w-[175px]">
                      {
                        constructionTelemetry.authoritativeTutorialState
                          .lastChecklistRecomputationReason
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">15. Last Transition:</span>
                    <span className="text-purple-200 truncate max-w-[175px]">
                      {constructionTelemetry.authoritativeTutorialState.lastTutorialTransition}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">16. Blocking Reason:</span>
                    <span className="text-rose-300 font-bold truncate max-w-[175px]">
                      {constructionTelemetry.authoritativeTutorialState
                        .lastTutorialBlockingReason || 'NONE'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. Collapsible Phase 3 Developer Gameplay Test Controls (9) */}
        <div className="border-t border-amber-900/60 pt-1.5">
          <button
            onClick={() => setDevControlsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-amber-300 py-0.5 cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <Wrench className="w-3 h-3 text-amber-400" />
              <span>GAMEPLAY TEST CONTROLS (9 ACTIONS)</span>
            </span>
            {devControlsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {devControlsExpanded && (
            <div className="grid grid-cols-2 gap-1 mt-1 bg-slate-900/90 p-1.5 rounded border border-slate-800">
              <button
                onClick={onToggleDisableTimer}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                1. {reinforcementTimerDisabled ? 'Enable Timer' : 'Disable Reinf Timer'}
              </button>
              <button
                onClick={onExtendTimer30s}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                2. Extend Timer +30s
              </button>
              <button
                onClick={onJumpToPostAttack1}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                3. Jump Post-Attack-1
              </button>
              <button
                onClick={onGrantReserveEmpty}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                4. Empty Reserve Test
              </button>
              <button
                onClick={onForceGuaranteedDelivery}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                5. Force Mentor Supply
              </button>
              <button
                onClick={onSimulateSafeReload}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                6. Simulate Safe Reload
              </button>
              <button
                onClick={onClearTutorialState}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                7. Clear Tutorial State
              </button>
              <button
                onClick={onClearSampleUnlock}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                8. Clear Sample Unlock
              </button>
              <button
                onClick={onClearStorage}
                className="col-span-2 flex items-center justify-center gap-1 p-1 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800 text-[9px] font-bold cursor-pointer"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>9. Clear All Prototype Data (Dev)</span>
              </button>
            </div>
          )}
        </div>

        {/* 5B. Collapsible Phase 5 Bullseye Taunt Developer Test Controls (8) */}
        <div className="border-t border-rose-900/60 pt-1.5">
          <button
            onClick={() => setBullseyeControlsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-rose-300 py-0.5 cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3 text-rose-400" />
              <span>PHASE 5 BULLSEYE TAUNT CONTROLS (8 ACTIONS)</span>
            </span>
            {bullseyeControlsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {bullseyeControlsExpanded && (
            <div className="grid grid-cols-2 gap-1 mt-1 bg-slate-900/90 p-1.5 rounded border border-rose-900/40">
              <button
                onClick={onDevGrantBullseye}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                1. Grant Bullseye Block
              </button>
              <button
                onClick={onDevPlaceBullseyeReinforced}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                2. Place Reinforced
              </button>
              <button
                onClick={onDevPlaceBullseyeExposedDecoy}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                3. Place Exposed Decoy
              </button>
              <button
                onClick={onDevPlaceBullseyeUnreachable}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-orange-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                4. Place Unreachable
              </button>
              <button
                onClick={onDevResetBullseyeState}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                5. Reset Bullseye State
              </button>
              <button
                onClick={onDevForceAttack1BullseyeTest}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                6. Force Atk 1 Test
              </button>
              <button
                onClick={onDevForceAttack2ReinforcementRetargetTest}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-200 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                7. Force Atk 2 Retarget
              </button>
              <button
                onClick={onDevCompareOrdinaryVsBullseyeTarget}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[9px] font-semibold cursor-pointer text-left truncate"
              >
                8. Compare Ordinary vs Taunt
              </button>
              {lastTargetComparison && (
                <div className="col-span-2 bg-slate-950/90 rounded p-1 border border-slate-800 text-[8.5px] text-slate-300">
                  Ord: <span className="text-cyan-300 font-bold">{lastTargetComparison.ordinaryTargetId}</span> ·
                  Selected: <span className="text-rose-300 font-bold">{lastTargetComparison.bullseyeTargetId}</span> ·
                  Override: {lastTargetComparison.overrideActive ? 'YES' : 'NO'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. Distance Preset Selector */}
        <div className="border-t border-slate-800/80 pt-1.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-300">
              <Compass className="w-3 h-3 text-amber-400" />
              <span>DISTANCE PRESET</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">{activePreset}</span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['NEAR', 'STANDARD', 'FAR'] as DistancePreset[]).map((p) => {
              const cfg = DISTANCE_PRESETS[p];
              const isSelected = activePreset === p;
              return (
                <button
                  key={p}
                  onClick={() => onSelectDistancePreset?.(p)}
                  className={`py-1 px-1.5 rounded text-center text-[9px] font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-amber-600 text-white border-amber-400 shadow'
                      : 'bg-slate-900/90 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    {p} ({cfg.distanceToFront}px)
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7. Ballistic Targeting & Phase 5 Bullseye Diagnostics (15 Required Fields) */}
        {targetingDiagnostics && (
          <div className="border-t border-amber-900/60 pt-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-300 mb-1">
              <Target className="w-3 h-3 text-amber-400" />
              <span>BALLISTIC TARGETING &amp; BULLSEYE TELEMETRY (15 FIELDS)</span>
            </div>
            <div className="bg-slate-900/90 rounded p-1.5 space-y-0.5 text-[9.5px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Launch / Target:</span>
                <span className="text-cyan-300 truncate max-w-[175px]">
                  ({Math.round(targetingDiagnostics.launchOriginWorldCoordinates.x)},{' '}
                  {Math.round(targetingDiagnostics.launchOriginWorldCoordinates.y)}) →{' '}
                  {targetingDiagnostics.selectedTargetId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vel / Ang / Arc:</span>
                <span className="text-amber-300">
                  ({targetingDiagnostics.launchVelocity.x.toFixed(1)},{' '}
                  {targetingDiagnostics.launchVelocity.y.toFixed(1)}) ·{' '}
                  {targetingDiagnostics.launchAngle.toFixed(1)}° ·{' '}
                  {targetingDiagnostics.selectedTrajectoryType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Flight (Pred/Act):</span>
                <span className="text-emerald-300 font-bold">
                  {targetingDiagnostics.predictedFlightDurationSec.toFixed(2)}s /{' '}
                  {physicsDiagnostics?.firstImpactFlightDurationSec !== null &&
                  physicsDiagnostics?.firstImpactFlightDurationSec !== undefined
                    ? `${physicsDiagnostics.firstImpactFlightDurationSec.toFixed(2)}s`
                    : actualFlightTime
                      ? `${actualFlightTime.toFixed(2)}s`
                      : '---'}
                </span>
              </div>
              <div className="border-t border-slate-800 pt-1 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">1-3. Bullseye ID/Inv/Cond:</span>
                  <span className="text-rose-300 font-bold">
                    {targetingDiagnostics.bullseyePieceId} ·{' '}
                    {targetingDiagnostics.bullseyeInventoryStatus} ·{' '}
                    {targetingDiagnostics.bullseyeCondition}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">4-6. Act / Trig / Exp:</span>
                  <span className="text-amber-200 font-bold">
                    Act:{targetingDiagnostics.bullseyeActive ? 'Y' : 'N'} · Trig:
                    {targetingDiagnostics.bullseyeTriggered ? 'Y' : 'N'} · Exp:
                    {targetingDiagnostics.bullseyeExpired ? 'Y' : 'N'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">7-9. Coords / Reach / Arcs:</span>
                  <span className="text-cyan-300">
                    {targetingDiagnostics.bullseyeWorldCoordinates
                      ? `(${Math.round(targetingDiagnostics.bullseyeWorldCoordinates.x)},${Math.round(targetingDiagnostics.bullseyeWorldCoordinates.y)})`
                      : 'none'}{' '}
                    · R:{targetingDiagnostics.bullseyeReachableByCurrentAttacker ? 'Y' : 'N'} · #
                    {targetingDiagnostics.validBullseyeTrajectoryCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">10-12. Override / Atk / Cancel:</span>
                  <span className="text-emerald-300 truncate max-w-[175px]">
                    Ov:{targetingDiagnostics.bullseyeOverrideSelected ? 'YES' : 'NO'} ·{' '}
                    {targetingDiagnostics.attackIdConsumingBullseye || 'none'} ·{' '}
                    {targetingDiagnostics.overrideCancellationReason || 'none'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">13-15. Imp / Dist / OrdTarget:</span>
                  <span className="text-purple-300 truncate max-w-[175px]">
                    {targetingDiagnostics.actualFirstImpactObject || 'none'} ·{' '}
                    {targetingDiagnostics.distanceBetweenImpactAndBullseye !== null
                      ? `${Math.round(targetingDiagnostics.distanceBetweenImpactAndBullseye)}px`
                      : '---'}{' '}
                    · {targetingDiagnostics.ordinaryTargetWithoutOverride || 'none'}
                  </span>
                </div>
                {bullseyeConflictDiagnostic && (
                  <div className="text-[8.5px] text-rose-400 font-bold">
                    Conflict: {bullseyeConflictDiagnostic}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {physicsDiagnostics && (
          <div className="border-t border-indigo-950/80 pt-1.5 space-y-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-300">
              <Activity className="w-3 h-3 text-indigo-400" />
              <span>LIVE PHYSICS TELEMETRY</span>
            </div>
            <div className="bg-slate-900/80 rounded p-1.5 space-y-0.5 text-[9.5px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Bodies / Constraints:</span>
                <span className="text-slate-200 font-bold">
                  {physicsDiagnostics.physicsBodyCount} bodies /{' '}
                  {physicsDiagnostics.constraintCount} constraints
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Awake / Sleeping:</span>
                <span className="text-emerald-400">
                  {physicsDiagnostics.awakeBodyCount} awake /{' '}
                  {physicsDiagnostics.sleepingBodyCount} sleeping
                </span>
              </div>
            </div>

            {/* Wisp–Debris Contact Diagnostics */}
            <div className="bg-slate-900/90 border border-amber-900/40 rounded p-2 text-[9.5px] space-y-1.5">
              <div className="flex items-center justify-between font-bold text-amber-300">
                <span>WISP–DEBRIS CONTACT DIAGNOSTICS</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-200">
                  {physicsDiagnostics.wispContactEvents?.length ?? 0} events
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
                <div className="bg-slate-950/60 p-1 rounded border border-slate-800">
                  <div className="text-slate-400">Harmless</div>
                  <div className="text-slate-200 font-bold">{physicsDiagnostics.wispHarmlessContactCount ?? 0}</div>
                </div>
                <div className="bg-slate-950/60 p-1 rounded border border-slate-800">
                  <div className="text-rose-400">Debris Hits</div>
                  <div className="text-rose-300 font-bold">{physicsDiagnostics.wispDebrisHitCount ?? 0}</div>
                </div>
                <div className="bg-slate-950/60 p-1 rounded border border-slate-800">
                  <div className="text-indigo-400">Cosmetic</div>
                  <div className="text-indigo-300 font-bold">{physicsDiagnostics.wispCosmeticOverlapCount ?? 0}</div>
                </div>
              </div>

              {physicsDiagnostics.lastWispContactEvent && (
                <div className="mt-1 p-1.5 bg-slate-950/80 rounded border border-amber-950/60 text-[8.5px] font-mono space-y-0.5">
                  <div className="flex justify-between text-amber-200 font-bold">
                    <span>Latest: {physicsDiagnostics.lastWispContactEvent.wispId}</span>
                    <span className={physicsDiagnostics.lastWispContactEvent.dispersalCommitted ? 'text-rose-400' : 'text-emerald-400'}>
                      {physicsDiagnostics.lastWispContactEvent.category}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    Piece: {physicsDiagnostics.lastWispContactEvent.contactingObjectId} ({physicsDiagnostics.lastWispContactEvent.contactingObjectMaterial}, m={physicsDiagnostics.lastWispContactEvent.contactingObjectMass})
                  </div>
                  <div className="text-slate-400">
                    Speed: lin={physicsDiagnostics.lastWispContactEvent.relativeLinearSpeed} + ang={physicsDiagnostics.lastWispContactEvent.relativeAngularSpeedAtContact} = tot <span className="text-slate-200 font-bold">{physicsDiagnostics.lastWispContactEvent.totalContactSpeed} px/t</span>
                  </div>
                  <div className="text-slate-400">
                    Impulse: N={physicsDiagnostics.lastWispContactEvent.normalImpulse} | T={physicsDiagnostics.lastWispContactEvent.tangentialImpulse} (thresh={physicsDiagnostics.lastWispContactEvent.wispDebrisImpactThreshold})
                  </div>
                  {physicsDiagnostics.lastWispContactEvent.notDispersedReason && (
                    <div className="text-slate-400 italic">
                      Reason: {physicsDiagnostics.lastWispContactEvent.notDispersedReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
