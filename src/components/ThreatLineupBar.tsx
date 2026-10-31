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
  Sparkles,
  ChevronRight,
  FastForward,
  Heart,
  AlertTriangle,
} from 'lucide-react';
import { GameMode, LevelState, MaterialType } from '../game/types';

interface ThreatLineupBarProps {
  mode: GameMode;
  state: LevelState;
  currentAttackIndex: number;
  attacksRemaining: number;
  deliveredInventory: Record<MaterialType, number>;
  deliveryGranted: boolean;
  statusFeedback: string | null;
  reloadNotice: string | null;
  onAdvanceIntro: () => void;
  onSkipIntro: () => void;
  onBeginReinforcement: () => void;
  onAcknowledgeDelivery: () => void;
  onLaunchFinalAttack: () => void;
  onTriggerTutorialIntro: () => void;
}

export const ThreatLineupBar: React.FC<ThreatLineupBarProps> = ({
  mode,
  state,
  currentAttackIndex,
  attacksRemaining,
  deliveryGranted,
  statusFeedback,
  reloadNotice,
  onAdvanceIntro,
  onSkipIntro,
  onBeginReinforcement,
  onAcknowledgeDelivery,
  onLaunchFinalAttack,
  onTriggerTutorialIntro,
}) => {
  // Hide during active projectile simulation or results modal to keep screen clean
  if (
    mode === 'ENEMY_INTRODUCTION' ||
    mode === 'AIMING_PREVIEW' ||
    mode === 'PROJECTILE_IN_FLIGHT' ||
    mode === 'IMPACT_RESOLUTION' ||
    mode === 'SETTLING' ||
    mode === 'ATTACK_RESOLVED' ||
    mode === 'SEQUENCE_COMPLETE' ||
    mode === 'RESULTS' ||
    mode === 'UNLOCK_PRESENTATION' ||
    mode === 'TESTING_SIMULATION' ||
    mode === 'SETTLED'
  ) {
    return null;
  }

  const stableWisps = state.wisps.filter((w) => !w.isDispersed).length;
  const isReinforcing =
    mode === 'REINFORCEMENT_INTRO' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY' ||
    mode === 'FINAL_ATTACK_READY';

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-20 w-[96%] max-w-lg flex flex-col gap-1.5 pointer-events-none">
      {/* 1. Compact Incoming Threat Lineup Strip */}
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
          <div className="flex items-center gap-1" title="Protected Elemental Wisps">
            <Heart className="w-3 h-3 text-emerald-400 fill-emerald-400" />
            <span className="font-bold text-emerald-300">
              {stableWisps}/{state.wisps.length}
            </span>
          </div>
          <button
            onClick={onTriggerTutorialIntro}
            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-semibold cursor-pointer"
            title="Replay Level 1 Intro & Threat Preview"
          >
            Briefing
          </button>
        </div>
      </div>

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
                Complete the unfinished fortress to shield the 5 elemental wisps from 2 incoming siege waves.
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
                Keep at least 1 wisp safe to survive. Heavy falling stone or direct hits will disperse them!
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
                Attack 1 strikes upper/outer walls; Attack 2 (Heavy) crushes lower foundations. Build a roof & brace the left flank!
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

      {/* 3. Piece Eligibility / Debris Feedback Toast */}
      {(statusFeedback || reloadNotice) && (
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/95 border border-amber-500/50 text-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-semibold shadow-md self-center">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{statusFeedback || reloadNotice}</span>
        </div>
      )}
    </div>
  );
};
