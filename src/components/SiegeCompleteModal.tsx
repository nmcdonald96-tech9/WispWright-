/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  RefreshCw,
  Heart,
  Hammer,
  CheckCircle2,
  Circle,
  Gift,
  Sparkles,
  Play,
  AlertTriangle,
} from 'lucide-react';
import { Level1Results, SiegeSummary, UnlockState } from '../game/types';

interface SiegeCompleteModalProps {
  summary: SiegeSummary | null;
  results: Level1Results | null;
  unlockState: UnlockState;
  hasReplayFrames?: boolean;
  onWatchCinematicReplay?: () => void;
  onReplaySameSiege: () => void;
  onRetryDesign: () => void;
  onStartOver: () => void;
}

export const SiegeCompleteModal: React.FC<SiegeCompleteModalProps> = ({
  summary,
  results,
  unlockState,
  hasReplayFrames = false,
  onWatchCinematicReplay,
  onReplaySameSiege,
  onRetryDesign,
  onStartOver,
}) => {
  const [showUnlockView, setShowUnlockView] = useState(
    Boolean(results?.sampleUnlockGranted && results?.tutorialCompletionAwarded),
  );

  if (!summary && !results) return null;

  const wispsStable = results?.wispsStable ?? summary?.wispsStable ?? 0;
  const totalWisps = results?.totalWisps ?? summary?.totalWisps ?? 3;
  const minForCompletion = results?.minimumStableWispsForCompletion ?? Math.max(1, Math.min(totalWisps, totalWisps === 3 ? 2 : Math.ceil(totalWisps * 0.6)));
  const wispsDispersed = results?.wispsDispersed ?? totalWisps - wispsStable;
  const survived = wispsStable >= 1;
  const tutorialCompletionAwarded = Boolean(results?.tutorialCompletionAwarded);
  const isNarrowSurvival = survived && wispsStable < minForCompletion;
  const classification =
    results?.classification ??
    (wispsStable === totalWisps
      ? 'Exceptional Defense'
      : wispsStable >= minForCompletion
        ? 'Successful Defense'
        : wispsStable >= 1
          ? 'Narrow Survival'
          : 'Defense Failed');

  const piecesIntact = results?.piecesIntact ?? summary?.piecesIntact ?? 0;
  const piecesCracked = results?.piecesCracked ?? summary?.piecesCracked ?? 0;
  const piecesBroken = results?.piecesBroken ?? summary?.piecesBroken ?? 0;
  const piecesLost = results?.piecesLost ?? summary?.piecesLost ?? 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-2.5 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-slate-100">
        {showUnlockView && tutorialCompletionAwarded ? (
          /* Immediate Sample Unlock Presentation View */
          <div className="flex flex-col items-center text-center py-2 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/30 to-amber-500/30 border border-purple-400/50 flex items-center justify-center shadow-lg">
              <Gift className="w-8 h-8 text-amber-300" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                <span>Level 1 Reward Unlocked</span>
              </div>
              <h2 className="text-lg font-extrabold text-white">
                Reinforcement Reserve Unlocked
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
                Your defense of the Elemental Sanctuary has unlocked the Alchemical Mentor&apos;s permanent{' '}
                <span className="text-emerald-300 font-semibold">Emergency Reinforcement Reserve</span>{' '}
                (+1 Timber Beam &amp; +1 Cut Stone Block during mid-siege reinforcement).
              </p>
            </div>

            <div className="w-full bg-slate-950/80 border border-purple-500/30 rounded-xl p-3 text-left text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Unlock Status:</span>
                <span className="text-emerald-400 font-bold">SAVED TO PROFILE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Tutorial Level 1:</span>
                <span className="text-cyan-300 font-bold">COMPLETED</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Defense Rating:</span>
                <span className="text-amber-300 font-bold">{classification}</span>
              </div>
            </div>

            <button
              onClick={() => setShowUnlockView(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-extrabold text-xs shadow-lg cursor-pointer transition-all"
            >
              View Full Battle Report &amp; Mastery
            </button>
          </div>
        ) : (
          /* Full Level 1 Results & Mastery Evaluation View */
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  tutorialCompletionAwarded
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : survived
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                      : 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                }`}
              >
                {tutorialCompletionAwarded ? (
                  <ShieldCheck className="w-6 h-6" />
                ) : (
                  <ShieldAlert className="w-6 h-6" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {tutorialCompletionAwarded
                    ? 'Level 1 Complete · Sanctuary Held'
                    : isNarrowSurvival
                      ? `Narrow Survival · Protect ${minForCompletion}+ Wisps to Complete Level 1`
                      : survived
                        ? 'Sanctuary Survived · Complete Tutorial Checklist'
                        : 'Level 1 Outcome · Sanctuary Breached'}
                </div>
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white truncate">
                  {classification}
                </h2>
                <p className="text-xs text-slate-400">
                  {tutorialCompletionAwarded
                    ? `${wispsStable} of ${totalWisps} elemental wisps survived both siege waves.`
                    : isNarrowSurvival
                      ? `${wispsStable} of ${totalWisps} wisps held, but at least ${minForCompletion} wisps must remain stable to complete Level 1.`
                      : survived
                        ? `${wispsStable} of ${totalWisps} wisps survived.`
                        : `All ${totalWisps} elemental wisps were dispersed during the siege.`}
                </p>
              </div>
            </div>

            {/* Failure or Narrow Survival Structural Guidance */}
            {(!tutorialCompletionAwarded && results?.failureObservation) && (
              <div
                className={`mb-3 rounded-xl p-2.5 flex items-start gap-2 text-xs border ${
                  !survived
                    ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                    : 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    !survived ? 'text-rose-400' : 'text-amber-400'
                  }`}
                />
                <div>
                  <div
                    className={`font-bold mb-0.5 ${
                      !survived ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    {!survived ? 'Structural Observation:' : 'Construction Hint:'}
                  </div>
                  <div>{results.failureObservation}</div>
                </div>
              </div>
            )}

            {/* Wisp Survival & Reserve Metrics */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 mb-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Heart
                    className={`w-4 h-4 ${
                      survived ? 'text-emerald-400 fill-emerald-400' : 'text-rose-500'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-200">
                    Protected Wisps (Safe / Dispersed)
                  </span>
                </div>
                <span
                  className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                    survived
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {wispsStable} Safe · {wispsDispersed} Dispersed
                </span>
              </div>

              {/* Piece Condition Breakdown */}
              <div className="grid grid-cols-4 gap-1.5 text-center pt-1.5 border-t border-slate-800/80">
                <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                  <div className="text-sm font-black text-emerald-400">{piecesIntact}</div>
                  <div className="text-[9px] text-slate-400 uppercase">Intact</div>
                </div>
                <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                  <div className="text-sm font-black text-amber-400">{piecesCracked}</div>
                  <div className="text-[9px] text-slate-400 uppercase">Cracked</div>
                </div>
                <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                  <div className="text-sm font-black text-rose-400">{piecesBroken}</div>
                  <div className="text-[9px] text-slate-400 uppercase">Broken</div>
                </div>
                <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                  <div className="text-sm font-black text-slate-400">{piecesLost}</div>
                  <div className="text-[9px] text-slate-500 uppercase">Lost</div>
                </div>
              </div>

              {/* Reserve & Reinforcement Accounting */}
              {results && (
                <>
                  <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-800/80 text-[10px]">
                    <div className="bg-slate-900/70 rounded px-2 py-1 flex flex-col">
                      <span className="text-slate-400">Reserve Left</span>
                      <span className="font-bold text-cyan-300">
                        {results.totalReserveRemaining} pcs
                      </span>
                    </div>
                    <div className="bg-slate-900/70 rounded px-2 py-1 flex flex-col">
                      <span className="text-slate-400">Reinforced Used</span>
                      <span className="font-bold text-amber-300">
                        {results.reinforcementMaterialsUsed} pcs
                      </span>
                    </div>
                    <div className="bg-slate-900/70 rounded px-2 py-1 flex flex-col">
                      <span className="text-slate-400">Mentor Supply</span>
                      <span className="font-bold text-emerald-300">
                        {results.guaranteedDeliveryGranted
                          ? `Granted (${results.guaranteedDeliveryUsed} used)`
                          : 'Unused'}
                      </span>
                    </div>
                  </div>

                  {/* Phase 5 Bullseye Block Summary */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-800/80 text-[10px]">
                    <div className="bg-slate-900/70 rounded px-2 py-1 flex flex-col">
                      <span className="text-slate-400">Bullseye used:</span>
                      <span className="font-bold text-rose-300">
                        {results.bullseyeUsed ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="bg-slate-900/70 rounded px-2 py-1 flex flex-col">
                      <span className="text-slate-400">Bullseye target honored:</span>
                      <span className="font-bold text-amber-300">
                        {results.bullseyeTargetHonored ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="bg-slate-900/70 rounded px-2 py-1 flex flex-col">
                      <span className="text-slate-400">Bullseye survived:</span>
                      <span className="font-bold text-emerald-300">
                        {results.bullseyeSurvived ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 3-Part Mastery Evaluation Preview */}
            {results && (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 mb-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                    Level 1 Mastery Evaluation
                  </span>
                  <span className="text-[10px] font-bold text-slate-300">
                    {results.masteryScore} / 3 Achieved
                  </span>
                </div>
                <div className="space-y-1.5">
                  {results.masteryCriteria.map((criterion) => (
                    <div
                      key={criterion.id}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-xs ${
                        criterion.achieved
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {criterion.achieved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="font-bold text-[11px]">{criterion.label}</div>
                          <div className="text-[9px] opacity-80 truncate">
                            {criterion.description}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-2 shrink-0 ${
                          criterion.achieved
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {criterion.achieved ? 'DONE' : 'MISSED'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sample Unlock Banner */}
            {unlockState.reinforcementReserveUnlocked && (
              <div className="flex items-center justify-between bg-purple-950/40 border border-purple-500/40 rounded-xl px-2.5 py-1.5 mb-3 text-xs">
                <div className="flex items-center gap-2 text-purple-200">
                  <Gift className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="font-semibold text-[11px]">
                    Unlock: <span className="text-amber-300">Reinforcement Reserve</span>
                  </span>
                </div>
                <button
                  onClick={() => setShowUnlockView(true)}
                  className="px-2 py-0.5 rounded bg-purple-600/40 hover:bg-purple-600/60 text-purple-100 text-[10px] font-bold cursor-pointer"
                >
                  Inspect
                </button>
              </div>
            )}

            {/* Distinct Retry Design vs Start Over vs Replay Actions */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onRetryDesign}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg active:scale-98 transition-all cursor-pointer"
                  title="Restore your exact pre-Attack-1 fortress design and inventory"
                >
                  <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Retry Design</span>
                </button>

                <button
                  onClick={onStartOver}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold text-xs active:scale-98 transition-all cursor-pointer"
                  title="Reset Level: Clean Level 1 template with full starting inventory"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reset Level</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {hasReplayFrames && onWatchCinematicReplay && (
                  <button
                    onClick={onWatchCinematicReplay}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-700/80 text-[11px] font-semibold active:scale-98 transition-all cursor-pointer"
                    title="Watch read-only visual replay of the siege without re-running physics"
                  >
                    <Play className="w-3 h-3 text-purple-300 fill-purple-300" />
                    <span>Watch Visual Replay</span>
                  </button>
                )}

                <button
                  onClick={onReplaySameSiege}
                  className={`${
                    hasReplayFrames && onWatchCinematicReplay ? '' : 'col-span-2'
                  } flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold active:scale-98 transition-all cursor-pointer`}
                >
                  <Play className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span>Replay Same Siege</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
