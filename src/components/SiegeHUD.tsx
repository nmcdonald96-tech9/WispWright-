/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FastForward, AlertOctagon, Heart, Hammer, Play, Film, Eye } from 'lucide-react';
import { LevelState } from '../game/types';
import { SiegeController } from '../game/siege/siegeController';
import {
  FlightCameraPreference,
  getPlayerCameraModeLabel,
} from '../game/presentation/presentationTypes';

interface SiegeHUDProps {
  siegeController: SiegeController;
  state: LevelState;
  flightCamera?: FlightCameraPreference;
  onCycleFlightCamera?: () => void;
  isReplaying?: boolean;
  hasReplayFrames?: boolean;
  onStartReplay?: () => void;
  onSkipReplay?: () => void;
  onSkipIntro: () => void;
  onEnterReinforcement: () => void;
  onNextAttack: () => void;
  onEmergencyStop: () => void;
  onRestoreDesign: () => void;
}

export const SiegeHUD: React.FC<SiegeHUDProps> = ({
  siegeController,
  state,
  flightCamera = 'SIDE_FOLLOW',
  onCycleFlightCamera,
  isReplaying = false,
  hasReplayFrames = false,
  onStartReplay,
  onSkipReplay,
  onSkipIntro,
  onEnterReinforcement,
  onNextAttack,
  onEmergencyStop,
}) => {
  const mode = siegeController.mode;
  if (
    !isReplaying &&
    mode !== 'ENEMY_INTRODUCTION' &&
    mode !== 'AIMING_PREVIEW' &&
    mode !== 'PROJECTILE_IN_FLIGHT' &&
    mode !== 'IMPACT_RESOLUTION' &&
    mode !== 'SETTLING' &&
    mode !== 'ATTACK_RESOLVED'
  ) {
    return null;
  }

  const currentAttack = siegeController.currentAttack;
  const attackIndex = siegeController.currentAttackIndex + 1;
  const totalAttacks = 2;
  const attacksRemaining = siegeController.getAttacksRemaining();

  const totalWisps = state.wisps.length;
  const stableWisps = state.wisps.filter((w) => !w.isDispersed).length;
  const cameraModeLabel = getPlayerCameraModeLabel(flightCamera);

  // During ENEMY_INTRODUCTION: collapse after ~1.0s so character performance occupies the primary view
  const isIntroCollapsed =
    !isReplaying && mode === 'ENEMY_INTRODUCTION' && siegeController.introTimer >= 1.0;

  let intactCount = 0;
  let crackedCount = 0;
  let brokenCount = 0;
  let lostCount = 0;
  for (const p of state.pieces) {
    if (p.condition === 'CRACKED') crackedCount++;
    else if (p.condition === 'BROKEN') brokenCount++;
    else if (p.condition === 'LOST') lostCount++;
    else intactCount++;
  }

  const reserveRemaining =
    (state.inventory.wood_beam || 0) +
    (state.inventory.wood_block || 0) +
    (state.inventory.stone_block || 0);

  return (
    <>
      {/* 1. Top Battle & Intro HUD */}
      {isIntroCollapsed ? (
        /* Collapsed Minimal Strip after ~1s of Attacker Introduction */
        <div className="fixed top-11 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-950/80 border border-amber-500/40 rounded-xl px-2.5 py-1 shadow-lg backdrop-blur-md transition-all duration-200">
          <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap">
            Atk {attackIndex}/{totalAttacks} · {currentAttack?.name}
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 whitespace-nowrap">
            <Heart className="w-3 h-3 text-rose-400 fill-rose-500" />
            {stableWisps}/{totalWisps}
          </span>
          <button
            onClick={onSkipIntro}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-600/35 hover:bg-amber-600/55 text-amber-100 border border-amber-400/50 text-[10px] font-bold active:scale-95 transition-all cursor-pointer ml-1"
            title="Skip intro to aiming preview"
          >
            <FastForward className="w-3 h-3" />
            <span>Skip Intro</span>
          </button>
        </div>
      ) : mode === 'ENEMY_INTRODUCTION' && !isReplaying ? (
        /* Initial < 1.0s Compact Attacker Identifier */
        <div className="fixed top-11 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md bg-slate-950/88 border border-amber-500/50 rounded-xl px-3 py-1.5 shadow-xl backdrop-blur-md transition-all duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-600 to-rose-700 flex items-center justify-center text-white font-black text-xs shrink-0">
                {attackIndex}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-amber-300 truncate">
                  {currentAttack?.name}{' '}
                  <span className="text-[10px] font-normal text-slate-300">
                    · {currentAttack?.title}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Attack {attackIndex} of {totalAttacks}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 px-2 py-0.5 rounded-lg text-[11px] font-bold text-emerald-300">
                <Heart className="w-3 h-3 text-rose-400 fill-rose-500" />
                <span>
                  {stableWisps}/{totalWisps}
                </span>
              </div>
              <button
                onClick={onSkipIntro}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-600/35 hover:bg-amber-600/55 text-amber-100 border border-amber-400/50 text-[10px] font-bold cursor-pointer"
              >
                <FastForward className="w-3 h-3" />
                <span>Skip Intro</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Pre-Launch & Active Battle Compact HUD (Never covers target or flight corridor) */
        <div className="fixed top-11 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-md bg-slate-950/88 border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all">
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            {/* Current Attack & Remaining */}
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold">
                Atk {attackIndex}/{totalAttacks}
              </span>
              <span className="text-[10px] text-slate-300 font-semibold">
                {attacksRemaining > 0 ? `${attacksRemaining} rem` : 'Final Wave'}
              </span>
            </div>

            {/* Wisps Stable */}
            <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded-lg text-[11px] font-bold">
              <Heart
                className={`w-3 h-3 ${
                  stableWisps > 0 ? 'text-rose-400 fill-rose-500' : 'text-slate-600'
                }`}
              />
              <span className="text-slate-300">Wisps:</span>
              <span className={stableWisps > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {stableWisps}/{totalWisps}
              </span>
            </div>

            {/* Camera Preference Selector */}
            <button
              onClick={onCycleFlightCamera}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-cyan-300 cursor-pointer"
              title="Cycle Camera Mode (Tactical / Follow / POV Experimental)"
            >
              <Eye className="w-3 h-3 text-cyan-400" />
              <span>{cameraModeLabel}</span>
            </button>
          </div>

          {siegeController.bullseyeNotice &&
            (mode === 'AIMING_PREVIEW' || mode === 'PROJECTILE_IN_FLIGHT') && (
              <div
                className={`mt-1 pt-1 border-t border-slate-800/80 text-[10px] font-bold truncate ${
                  siegeController.bullseyeNotice.includes('no valid shot')
                    ? 'text-amber-300'
                    : 'text-rose-300'
                }`}
              >
                🎯 {siegeController.bullseyeNotice}
              </div>
            )}

          {/* Post-Attack-1 Assessment Summary & Action Row */}
          {mode === 'ATTACK_RESOLVED' && !isReplaying && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800/90 flex flex-col gap-1.5">
              {attackIndex === 1 && (
                <div className="grid grid-cols-5 gap-1 text-center text-[9.5px]">
                  <div className="bg-slate-900/80 rounded py-0.5 border border-slate-800">
                    <span className="text-emerald-400 font-bold">{intactCount}</span>{' '}
                    <span className="text-slate-400">Intact</span>
                  </div>
                  <div className="bg-slate-900/80 rounded py-0.5 border border-slate-800">
                    <span className="text-amber-400 font-bold">{crackedCount}</span>{' '}
                    <span className="text-slate-400">Cracked</span>
                  </div>
                  <div className="bg-slate-900/80 rounded py-0.5 border border-slate-800">
                    <span className="text-rose-400 font-bold">{brokenCount}</span>{' '}
                    <span className="text-slate-400">Broken</span>
                  </div>
                  <div className="bg-slate-900/80 rounded py-0.5 border border-slate-800">
                    <span className="text-slate-400 font-bold">{lostCount}</span>{' '}
                    <span className="text-slate-500">Lost</span>
                  </div>
                  <div className="bg-slate-900/80 rounded py-0.5 border border-slate-800">
                    <span className="text-cyan-300 font-bold">{reserveRemaining}</span>{' '}
                    <span className="text-slate-400">Res</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-1.5">
                {hasReplayFrames && onStartReplay && (
                  <button
                    onClick={onStartReplay}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-700 text-[10px] font-semibold cursor-pointer"
                  >
                    <Film className="w-3 h-3 text-purple-300" />
                    <span>Replay Shot</span>
                  </button>
                )}

                {attackIndex === 1 ? (
                  <button
                    onClick={onEnterReinforcement}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer shadow"
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    <span>Enter Reinforcement</span>
                  </button>
                ) : (
                  <button
                    onClick={onNextAttack}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer shadow"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>View Results</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Skip Replay Bar */}
          {isReplaying && onSkipReplay && (
            <div className="mt-1.5 pt-1 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-300">
                Shot Replay (Read-Only)
              </span>
              <button
                onClick={onSkipReplay}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-600/40 hover:bg-purple-600/60 text-purple-100 border border-purple-400/50 text-[10px] font-bold cursor-pointer"
              >
                <FastForward className="w-3 h-3" />
                <span>Skip Replay</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Small Persistent Corner Control for Emergency Stop */}
      <button
        onClick={onEmergencyStop}
        className="fixed bottom-16 right-3 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-950/85 hover:bg-rose-900 text-rose-200 border border-rose-700/70 text-[10px] font-bold shadow-lg backdrop-blur-md active:scale-95 transition-all cursor-pointer"
        title="Emergency Stop Simulation"
      >
        <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
        <span>Stop</span>
      </button>
    </>
  );
};

