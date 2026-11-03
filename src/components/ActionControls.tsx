/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Play,
  RotateCcw,
  RefreshCw,
  AlertOctagon,
  Flame,
  Clock,
  CheckCircle2,
  Swords,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import { AuthoritativeTutorialState, GameMode } from '../game/types';

interface ActionControlsProps {
  mode: GameMode;
  reinforcementTimerSec?: number;
  reinforcementTimerDisabled?: boolean;
  reinforcementTimerPaused?: boolean;
  tutorialChecklistReady?: boolean;
  needsStabilityTest?: boolean;
  authoritativeTutorial?: AuthoritativeTutorialState;
  isStabilityTestPassed?: boolean;
  onTestFortress: () => void;
  onTestSiege: () => void;
  onAcceptStableDesign?: () => void;
  onReturnToBuild?: () => void;
  onFinishReinforcement: () => void;
  onLaunchFinalAttack: () => void;
  onRestoreDesign: () => void;
  onEmergencyStop: () => void;
  onResetLevel: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  mode,
  reinforcementTimerSec = 75,
  reinforcementTimerDisabled = false,
  reinforcementTimerPaused = false,
  tutorialChecklistReady = true,
  needsStabilityTest = false,
  authoritativeTutorial,
  isStabilityTestPassed = false,
  onTestFortress,
  onTestSiege,
  onAcceptStableDesign,
  onReturnToBuild,
  onFinishReinforcement,
  onLaunchFinalAttack,
  onRestoreDesign,
  onEmergencyStop,
  onResetLevel,
}) => {
  const isInitialConstruction =
    mode === 'CONSTRUCTION' ||
    mode === 'INITIAL_CONSTRUCTION' ||
    mode === 'CONSTRUCTION_READY' ||
    mode === 'LEVEL_INTRO' ||
    mode === 'WISP_INTRO' ||
    mode === 'THREAT_PREVIEW';

  const isReinforcing =
    mode === 'REINFORCEMENT_INTRO' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY';

  const highlightTarget = authoritativeTutorial?.currentHighlightedItemId ?? null;
  const highlightBeginSiege = highlightTarget === 'begin_siege';
  const highlightTestStability =
    highlightTarget === 'test_stability' || needsStabilityTest;

  if (isInitialConstruction) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={onTestSiege}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer ${
            tutorialChecklistReady
              ? highlightBeginSiege
                ? 'bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white shadow-lg shadow-amber-500/40 ring-2 ring-amber-300 animate-pulse'
                : 'bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-950/50'
              : 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 border border-slate-700'
          }`}
          title={
            tutorialChecklistReady
              ? 'Begin the Level 1 two-wave siege defense'
              : 'Complete the basic shelter lesson before beginning the siege.'
          }
        >
          {tutorialChecklistReady ? (
            <Flame className="w-3.5 h-3.5 fill-amber-200 text-amber-100" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>Begin Siege</span>
        </button>

        <button
          onClick={onTestFortress}
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-semibold text-xs active:scale-95 transition-all cursor-pointer ${
            highlightTestStability
              ? 'bg-amber-500/30 hover:bg-amber-500/40 text-amber-100 border border-amber-300 ring-2 ring-amber-400/70 shadow-md shadow-amber-950/50'
              : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
          }`}
          title="Test structural stability under gravity only"
        >
          <Play className="w-3 h-3 fill-amber-300" />
          <span>Test Stability</span>
        </button>

        <button
          onClick={onResetLevel}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium active:scale-95 transition-all cursor-pointer ml-auto"
          title="Reset Level: Reset to clean Level 1 template"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset Level</span>
        </button>
      </div>
    );
  }

  // Pure Stability Test in Progress (TESTING_SIMULATION)
  if (mode === 'TESTING_SIMULATION') {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Testing shelter stability under gravity...</span>
        </div>
        <button
          onClick={onReturnToBuild || onEmergencyStop}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
          title="Stop stability test and return to editable fortress"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-amber-300" />
          <span>Return to Build</span>
        </button>
      </div>
    );
  }

  // Stability Test Completed (SETTLED) — Clear forward & backward exit paths, NEVER "Retry Design"
  if (mode === 'SETTLED') {
    const passed = Boolean(authoritativeTutorial?.stabilityTestPassed || isStabilityTestPassed);
    const allBuildStepsDone = Boolean(
      authoritativeTutorial
        ? authoritativeTutorial.beamPlaced &&
            authoritativeTutorial.blockPlaced &&
            authoritativeTutorial.supportedConnectionCreated
        : true,
    );

    return (
      <div className="flex items-center justify-between gap-2">
        {passed && (
          <button
            onClick={onAcceptStableDesign || onReturnToBuild}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all cursor-pointer ${
              allBuildStepsDone
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 ring-2 ring-emerald-300/80 shadow-emerald-950/60'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Accept this stable fortress design and return to pre-siege review"
          >
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            <span>Accept Stable Design</span>
          </button>
        )}

        <button
          onClick={onReturnToBuild || onRestoreDesign}
          className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-xs active:scale-95 transition-all cursor-pointer ${
            passed
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              : 'flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold shadow-lg'
          }`}
          title="Restore your pre-test fortress layout and continue editing"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Build</span>
        </button>
      </div>
    );
  }

  if (isReinforcing) {
    const secs = Math.ceil(reinforcementTimerSec);
    const isLowTime = !reinforcementTimerDisabled && secs <= 15;

    return (
      <div className="flex items-center justify-between gap-1.5">
        {/* Reinforcement Timer Badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold ${
            reinforcementTimerDisabled
              ? 'bg-slate-900 border-slate-700 text-slate-400'
              : isLowTime
                ? 'bg-amber-950/80 border-amber-500 text-amber-300 animate-pulse'
                : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200'
          }`}
          title="Reinforcement countdown timer before Heavy Attack 2"
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>
            {reinforcementTimerDisabled
              ? 'TIMER OFF'
              : reinforcementTimerPaused
                ? `${secs}s (PAUSED)`
                : `${secs}s`}
          </span>
        </div>

        {/* Finish Reinforcement CTA */}
        <button
          onClick={onFinishReinforcement}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
          title="Lock in reinforcement and face Grom's Final Heavy Attack"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Finish Reinforcement</span>
        </button>

        {/* Retry Initial Design */}
        <button
          onClick={onRestoreDesign}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium active:scale-95 transition-all cursor-pointer"
          title="Retry Design: Restore exact pre-Attack-1 fortress layout"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Retry</span>
        </button>
      </div>
    );
  }

  if (mode === 'FINAL_ATTACK_READY') {
    return (
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onLaunchFinalAttack}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <Swords className="w-4 h-4" />
          <span>Launch Final Attack (Grom · Heavy Shot)</span>
        </button>

        <button
          onClick={onRestoreDesign}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium active:scale-95 transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry Design</span>
        </button>
      </div>
    );
  }

  if (
    mode === 'RESULTS' ||
    mode === 'SEQUENCE_COMPLETE' ||
    mode === 'UNLOCK_PRESENTATION'
  ) {
    return (
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onRestoreDesign}
          className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
          title="Retry Design: Restore your submitted fortress design and inventory"
        >
          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Retry Design</span>
        </button>

        <button
          onClick={onResetLevel}
          className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold text-xs active:scale-95 transition-all cursor-pointer"
          title="Reset Level: Clean Level 1 template with full starting inventory"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>Reset Level</span>
        </button>
      </div>
    );
  }

  // Active Siege Simulation States (Enemy Intro, Aiming, Flight, Impact, Settling):
  const isActiveSiegeSimulation =
    mode === 'ENEMY_INTRODUCTION' ||
    mode === 'AIMING_PREVIEW' ||
    mode === 'PROJECTILE_IN_FLIGHT' ||
    mode === 'IMPACT_RESOLUTION' ||
    mode === 'SETTLING' ||
    mode === 'PLACE_WISPS' ||
    mode === 'PRE_SIEGE_REVIEW';

  if (isActiveSiegeSimulation) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onRestoreDesign}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/50 active:scale-95 transition-all cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>Retry Design</span>
      </button>

      <button
        onClick={onEmergencyStop}
        className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800 text-xs font-medium active:scale-95 transition-all cursor-pointer"
        title="Stop physics immediately and restore design"
      >
        <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
        <span className="hidden sm:inline">Stop &amp; Restore</span>
      </button>
    </div>
  );
};
