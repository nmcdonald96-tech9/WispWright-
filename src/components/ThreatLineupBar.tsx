/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Shield,
  Flame,
  Hammer,
  PackagePlus,
  ChevronRight,
  FastForward,
  Heart,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Sparkles,
} from 'lucide-react';
import {
  AuthoritativeTutorialState,
  GameMode,
  GuidedTutorialStep,
  LevelState,
  MaterialType,
  TutorialChecklistState,
} from '../game/types';
import { PresentationMode } from '../game/presentation/presentationTypes';

interface ThreatLineupBarProps {
  mode: GameMode;
  state: LevelState;
  currentAttackIndex: number;
  attacksRemaining: number;
  deliveredInventory: Record<MaterialType, number>;
  deliveryGranted: boolean;
  statusFeedback: string | null;
  reloadNotice: string | null;
  bullseyeNotice?: string | null;
  tutorialChecklist?: TutorialChecklistState;
  authoritativeTutorial?: AuthoritativeTutorialState;
  checklistHighlightActive?: boolean;
  tutorialGateWarning?: string | null;
  presentationMode?: PresentationMode;
  snapping?: boolean;
  activeConnectionHint?: string | null;
  onDismissConnectionHint?: () => void;
  onAdvanceIntro: () => void;
  onSkipIntro: () => void;
  onBeginReinforcement: () => void;
  onAcknowledgeDelivery: () => void;
  onLaunchFinalAttack: () => void;
  onTriggerTutorialIntro: () => void;
  onToggleSkipGuidance?: () => void;
}

function getGuidedStepInstruction(
  step: GuidedTutorialStep,
  snapping: boolean,
  mode: GameMode,
  stabilityTestPassed: boolean,
): { title: string; copy: string; lessonIndex: number } {
  switch (step) {
    case 'STEP_1_SELECT_BEAM':
      return {
        title: 'Shelter Lesson 1/4',
        copy: 'Press and drag the glowing beam onto the sanctuary, or tap to place.',
        lessonIndex: 1,
      };
    case 'STEP_2_PLACE_BEAM':
      return {
        title: 'Shelter Lesson 1/4',
        copy: 'Place the beam across these supports. It will help form a protective roof.',
        lessonIndex: 1,
      };
    case 'STEP_3_PLACE_BLOCK':
      return {
        title: 'Shelter Lesson 2/4',
        copy: 'Press and drag a wood block beneath the beam to support its weight, or tap to place.',
        lessonIndex: 2,
      };
    case 'STEP_4_CREATE_SUPPORT':
      return {
        title: 'Shelter Lesson 3/4',
        copy: snapping
          ? 'Bring the pieces close until the support point glows, then release.'
          : 'Enable Snap in the top bar or rest a piece directly on a support.',
        lessonIndex: 3,
      };
    case 'STEP_5_TEST_STABILITY':
      return {
        title: 'Shelter Lesson 4/4',
        copy:
          mode === 'TESTING_SIMULATION'
            ? 'Testing gravity stability... Watching for unsupported collapse.'
            : 'Test the shelter. Unsupported pieces will fall before the siege begins.',
        lessonIndex: 4,
      };
    case 'STEP_6_ACCEPT_OR_REVISE':
      return {
        title: 'Shelter Lesson 4/4',
        copy: stabilityTestPassed
          ? 'The shelter stands. Accept it, or return to make changes.'
          : 'Test the shelter. Unsupported pieces will fall before the siege begins.',
        lessonIndex: 4,
      };
    case 'COMPLETE':
    default:
      return {
        title: 'Shelter Lesson 4/4',
        copy: 'Basic shelter ready. Add more protection or begin the siege.',
        lessonIndex: 4,
      };
  }
}

export const ThreatLineupBar: React.FC<ThreatLineupBarProps> = ({
  mode,
  state,
  attacksRemaining,
  deliveryGranted,
  statusFeedback,
  reloadNotice,
  bullseyeNotice,
  tutorialChecklist,
  authoritativeTutorial,
  checklistHighlightActive = false,
  tutorialGateWarning,
  presentationMode = 'PLAYER',
  snapping = true,
  activeConnectionHint,
  onDismissConnectionHint,
  onAdvanceIntro,
  onSkipIntro,
  onBeginReinforcement,
  onAcknowledgeDelivery,
  onLaunchFinalAttack,
  onTriggerTutorialIntro,
  onToggleSkipGuidance,
}) => {
  // Hide during active siege projectile simulation or results modal to keep screen clean
  if (
    mode === 'ENEMY_INTRODUCTION' ||
    mode === 'AIMING_PREVIEW' ||
    mode === 'PROJECTILE_IN_FLIGHT' ||
    mode === 'IMPACT_RESOLUTION' ||
    mode === 'SETTLING' ||
    mode === 'ATTACK_RESOLVED' ||
    mode === 'SEQUENCE_COMPLETE' ||
    mode === 'RESULTS' ||
    mode === 'UNLOCK_PRESENTATION'
  ) {
    return null;
  }

  const stableWisps = state.wisps.filter((w) => !w.isDispersed).length;
  const isReinforcing =
    mode === 'REINFORCEMENT_INTRO' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY' ||
    mode === 'FINAL_ATTACK_READY';
  const isInitialConstruction =
    mode === 'CONSTRUCTION' ||
    mode === 'INITIAL_CONSTRUCTION' ||
    mode === 'CONSTRUCTION_READY' ||
    mode === 'TESTING_SIMULATION' ||
    mode === 'SETTLED';
  const placedBullseye = state.pieces.find((p) => p.type === 'bullseye_block') ?? null;

  const checklistItems = tutorialChecklist
    ? [
        { key: 'beam', shortLabel: 'Beam', label: 'Place a beam', done: tutorialChecklist.placedBeam },
        { key: 'block', shortLabel: 'Block', label: 'Place a block', done: tutorialChecklist.placedBlock },
        {
          key: 'support',
          shortLabel: 'Support',
          label: 'Create a supported connection',
          done: tutorialChecklist.hasSupportedConnection,
        },
        {
          key: 'stability',
          shortLabel: 'Stable',
          label: 'Test stability',
          done: Boolean(
            authoritativeTutorial
              ? authoritativeTutorial.stabilityTestPassed || authoritativeTutorial.stableDesignAccepted
              : tutorialChecklist.stabilityTested,
          ),
        },
      ]
    : [];

  const doneCount = checklistItems.filter((i) => i.done).length;
  const isLessonComplete = Boolean(
    authoritativeTutorial ? authoritativeTutorial.basicLessonComplete : tutorialChecklist?.isComplete,
  );
  const guidanceSkipped = Boolean(authoritativeTutorial?.guidanceSkipped);
  const currentStep = authoritativeTutorial?.currentGuidedStep ?? 'STEP_1_SELECT_BEAM';
  const stepInfo = getGuidedStepInstruction(
    currentStep,
    snapping,
    mode,
    Boolean(authoritativeTutorial?.stabilityTestPassed),
  );
  const unstableHint = authoritativeTutorial?.unstableHint ?? null;

  // Never show internal reload snapshot telemetry in Player Presentation Mode
  const visibleReloadNotice = presentationMode === 'DEVELOPER' ? reloadNotice : null;

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-20 w-[96%] max-w-lg flex flex-col gap-1.5 pointer-events-none">
      {/* 1. Compact Incoming Threat Lineup Strip (Hidden during TESTING_SIMULATION / SETTLED to give StabilityGauge & Lesson Card room) */}
      {mode !== 'TESTING_SIMULATION' && mode !== 'SETTLED' && (
        <div className="pointer-events-auto flex items-center justify-between gap-1.5 bg-slate-950/90 border border-slate-800/90 rounded-xl px-2.5 py-1.5 shadow-lg backdrop-blur-md text-[10px]">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {/* Wave 1 */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border whitespace-nowrap ${
                !isReinforcing
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-200 font-bold'
                  : 'bg-slate-900/70 border-slate-800 text-slate-500 line-through'
              }`}
              title="Attack 1: Vespera targets outer/upper defenses (especially wood)"
            >
              <Flame className="w-3 h-3 text-orange-400 shrink-0" />
              <span>1: Standard (Upper/Wood)</span>
            </div>

            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />

            {/* Reinforce Beat */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border whitespace-nowrap ${
                isReinforcing && mode !== 'FINAL_ATTACK_READY'
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-bold'
                  : deliveryGranted
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400'
                    : 'bg-slate-900/80 border-slate-700/70 text-slate-300'
              }`}
              title="Mid-battle reinforcement phase with Mentor Supply"
            >
              <Hammer className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Reinforce</span>
            </div>

            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />

            {/* Wave 2 */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border whitespace-nowrap ${
                isReinforcing
                  ? 'bg-rose-500/25 border-rose-500/60 text-rose-200 font-bold'
                  : 'bg-slate-900/80 border-slate-700/70 text-slate-300'
              }`}
              title="Attack 2: Grom the Slag-Brute targets lower load-bearing foundations"
            >
              <Shield className="w-3 h-3 text-rose-400 shrink-0" />
              <span>2: Heavy (Base/Support)</span>
            </div>
          </div>

          {/* Wisps & Attacks Left Counter */}
          <div className="flex items-center gap-2 shrink-0 pl-1 border-l border-slate-800">
            {isInitialConstruction ? (
              <div
                className="flex items-center gap-1"
                title="Wisps will be placed after the shelter passes stability testing."
              >
                <Sparkles className="w-3 h-3 text-teal-400 shrink-0" />
                <span className="font-bold text-teal-300 whitespace-nowrap">
                  Wisps awaiting placement: {state.wisps.length}
                </span>
              </div>
            ) : mode === 'PLACE_WISPS' || mode === 'PRE_SIEGE_REVIEW' ? (
              <div className="flex items-center gap-1" title="Placed Elemental Wisps">
                <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="font-bold text-emerald-300 whitespace-nowrap">
                  Place Wisps: {state.wisps.filter((w) => w.placed === true).length}/{state.wisps.length}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1" title="Surviving Elemental Wisps">
                <Heart className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                <span className="font-bold text-emerald-300 whitespace-nowrap">
                  Wisps stable: {stableWisps}/{state.wisps.length}
                </span>
              </div>
            )}
            <button
              onClick={onTriggerTutorialIntro}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-semibold cursor-pointer"
              title="Replay Level 1 Intro & Threat Preview"
            >
              Briefing
            </button>
          </div>
        </div>
      )}

      {/* 1A. Sequential Guided Placement Lesson & Compact Mobile Checklist */}
      {isInitialConstruction && tutorialChecklist && (
        <div
          className={`pointer-events-auto flex flex-col gap-1 rounded-xl px-2.5 py-1.5 shadow-md backdrop-blur-md border transition-all ${
            checklistHighlightActive && !isLessonComplete
              ? 'bg-amber-950/95 border-amber-400 ring-1 ring-amber-400/50'
              : isLessonComplete
                ? 'bg-emerald-950/88 border-emerald-500/60'
                : 'bg-slate-950/90 border-slate-800/90'
          }`}
        >
          {/* Header Row: Compact Progress Badge ("Shelter Lesson X/4") + Skip/Resume Guidance */}
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles
                className={`w-3 h-3 shrink-0 ${
                  isLessonComplete ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <span
                className={`font-bold uppercase tracking-wider truncate ${
                  isLessonComplete
                    ? 'text-emerald-300'
                    : checklistHighlightActive
                      ? 'text-amber-300'
                      : 'text-amber-200'
                }`}
              >
                {isLessonComplete
                  ? '✓ Shelter Lesson 4/4 Complete'
                  : `Shelter Lesson ${doneCount}/4`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Compact 4-step status pills */}
              <div className="flex items-center gap-1">
                {checklistItems.map((item) => (
                  <span
                    key={item.key}
                    title={item.label}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                      item.done
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                        : checklistHighlightActive
                          ? 'bg-amber-500/25 border-amber-400/70 text-amber-100'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400'
                    }`}
                  >
                    {item.done ? (
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                    )}
                    <span>{item.shortLabel}</span>
                  </span>
                ))}
              </div>

              {!isLessonComplete && onToggleSkipGuidance && (
                <button
                  onClick={onToggleSkipGuidance}
                  className="px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[9px] font-semibold cursor-pointer"
                  title={
                    guidanceSkipped
                      ? 'Resume guided placement hints'
                      : 'Skip visual placement coaching (keeps checklist active)'
                  }
                >
                  {guidanceSkipped ? 'Show Hints' : 'Skip Guidance'}
                </button>
              )}
            </div>
          </div>

          {/* Current Active Guided Instruction (One concise instruction at a time) */}
          {(!guidanceSkipped || isLessonComplete) && (
            <div
              className={`text-[11px] font-medium leading-snug px-1 py-0.5 ${
                isLessonComplete ? 'text-emerald-100 font-semibold' : 'text-slate-100'
              }`}
            >
              {stepInfo.copy}
            </div>
          )}

          {/* Unstable Test Feedback Hint */}
          {unstableHint && !isLessonComplete && (
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-rose-200 bg-rose-950/70 border border-rose-500/40 rounded-lg px-2 py-1 mt-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{unstableHint}</span>
            </div>
          )}

          {/* Gate Warning if player tapped Begin Siege before completing lesson */}
          {tutorialGateWarning && !isLessonComplete && (
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-amber-200 pt-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{tutorialGateWarning}</span>
            </div>
          )}
        </div>
      )}

      {/* 1B. Bullseye Status Strip (When Placed or Locked) */}
      {(bullseyeNotice || placedBullseye) && (
        <div
          className={`pointer-events-auto flex items-center justify-between gap-2 rounded-lg px-2.5 py-1 text-[10px] font-bold shadow border backdrop-blur-md ${
            placedBullseye?.bullseyeExpired
              ? 'bg-slate-900/85 border-slate-700/80 text-slate-400'
              : bullseyeNotice?.includes('no valid shot')
                ? 'bg-amber-950/90 border-amber-500/60 text-amber-200'
                : 'bg-rose-950/90 border-rose-500/60 text-rose-100'
          }`}
        >
          <span className="truncate">
            {placedBullseye?.bullseyeExpired
              ? '🗿 Bullseye Block spent — now acts as a normal Cut Stone Block.'
              : bullseyeNotice ||
                '🎯 Bullseye Block: Draws the next reachable enemy shot toward this block. Lasts for one attack.'}
          </span>
        </div>
      )}

      {/* 2. Contextual Non-Blocking Tutorial / Crisis / Reinforcement Banner */}
      {(mode === 'LEVEL_INTRO' ||
        mode === 'WISP_INTRO' ||
        mode === 'THREAT_PREVIEW' ||
        mode === 'REINFORCEMENT_INTRO' ||
        mode === 'EMERGENCY_DELIVERY' ||
        mode === 'FINAL_ATTACK_READY') && (
        <div className="pointer-events-auto bg-slate-950/95 border border-amber-500/60 rounded-xl px-3 py-2 shadow-xl backdrop-blur-md animate-in fade-in duration-150">
          {mode === 'LEVEL_INTRO' && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-200">
                <span className="font-bold text-amber-300">Level 1 · Sanctuary Defense: </span>
                Three wisps are depending on this shelter. Complete the fortress to shield them from 2 incoming siege waves.
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onAdvanceIntro}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold cursor-pointer"
                >
                  Next
                </button>
                <button
                  onClick={onSkipIntro}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                  title="Skip intro"
                >
                  <FastForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {mode === 'WISP_INTRO' && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-200">
                <span className="font-bold text-emerald-300">Protect the Wisps: </span>
                Three wisps are depending on this shelter. Place all three wisps after stability testing and keep at least 2 stable!
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onAdvanceIntro}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                >
                  See Threat
                </button>
                <button
                  onClick={onSkipIntro}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                >
                  <FastForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {mode === 'THREAT_PREVIEW' && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-200">
                <span className="font-bold text-orange-300">Incoming Lineup: </span>
                Attack 1 strikes upper/outer walls; Attack 2 (Heavy) crushes lower foundations. Place the{' '}
                <span className="font-bold text-rose-300">Bullseye Block</span> to draw the next reachable shot!
              </div>
              <button
                onClick={onSkipIntro}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shrink-0 cursor-pointer"
              >
                Start Building
              </button>
            </div>
          )}

          {mode === 'REINFORCEMENT_INTRO' && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-200">
                <span className="font-bold text-cyan-300">Reinforcement Phase: </span>
                Attack 1 weakened the western defense! Grom&apos;s Heavy Iron Slag-Shot is next. Place reserve pieces or reposition intact blocks.
              </div>
              <button
                onClick={onBeginReinforcement}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold shrink-0 cursor-pointer shadow"
              >
                Reinforce Now
              </button>
            </div>
          )}

          {mode === 'EMERGENCY_DELIVERY' && (
            <div className="flex items-center justify-between gap-2 bg-emerald-950/60 -mx-1 px-2 py-1 rounded-lg border border-emerald-500/40">
              <div className="flex items-center gap-2 text-xs text-emerald-100">
                <PackagePlus className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-300">Mentor Emergency Supply! </span>
                  Granted <span className="font-bold text-amber-300">+1 Timber Beam</span> &amp;{' '}
                  <span className="font-bold text-cyan-300">+1 Cut Stone Block</span> to brace against Grom&apos;s heavy shot.
                </div>
              </div>
              <button
                onClick={onAcknowledgeDelivery}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shrink-0 cursor-pointer shadow"
              >
                Use Supply
              </button>
            </div>
          )}

          {mode === 'FINAL_ATTACK_READY' && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-200">
                <span className="font-bold text-rose-300">Reinforcement Locked: </span>
                Grom the Slag-Brute has aimed at your reinforced foundation ({attacksRemaining} attack remaining).
              </div>
              <button
                onClick={onLaunchFinalAttack}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-[11px] font-bold shrink-0 cursor-pointer shadow"
              >
                Launch Final Wave
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. Piece Eligibility / Debris Feedback Toast (Reload notices Developer-only) */}
      {(statusFeedback || visibleReloadNotice) && (
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/95 border border-amber-500/50 text-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-semibold shadow-md self-center">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{statusFeedback || visibleReloadNotice}</span>
        </div>
      )}

      {/* 4. Non-Blocking One-Time Connection Discovery Hint */}
      {activeConnectionHint && !statusFeedback && (
        <div className="pointer-events-auto flex items-center justify-between gap-2 bg-emerald-950/92 border border-emerald-500/50 text-emerald-100 px-2.5 py-1 rounded-lg text-[10.5px] font-medium shadow-md self-center max-w-md">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{activeConnectionHint}</span>
          </div>
          {onDismissConnectionHint && (
            <button
              onClick={onDismissConnectionHint}
              className="px-1.5 py-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 text-[9.5px] font-bold shrink-0 cursor-pointer"
            >
              Got it
            </button>
          )}
        </div>
      )}
    </div>
  );
};
