/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Undo2,
  Redo2,
  Magnet,
  HelpCircle,
  Terminal,
  Shield,
  Gift,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GameMode } from '../game/types';
import { isEditableMode } from '../game/input/gestureController';

interface TopHUDProps {
  mode: GameMode;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  snapping: boolean;
  sampleUnlockActive?: boolean;
  isMuted?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSnap: () => void;
  onToggleMute?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp: () => void;
  onToggleDev: () => void;
  devOpen: boolean;
}

export const TopHUD: React.FC<TopHUDProps> = ({
  mode,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  snapping,
  sampleUnlockActive = false,
  isMuted = false,
  onUndo,
  onRedo,
  onToggleSnap,
  onToggleMute,
  onOpenSettings,
  onOpenHelp,
  onToggleDev,
  devOpen,
}) => {
  const isEditable = isEditableMode(mode);
  const isReinforcing =
    mode === 'REINFORCEMENT_INTRO' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY';

  let modeBadgeText = 'Build';
  let modeBadgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';

  if (isReinforcing) {
    modeBadgeText = 'Reinforce';
    modeBadgeClass = 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 animate-pulse';
  } else if (mode === 'TESTING_SIMULATION') {
    modeBadgeText = 'Testing';
    modeBadgeClass = 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse';
  } else if (mode === 'SETTLED') {
    modeBadgeText = 'Stable';
    modeBadgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  } else if (
    mode === 'RESULTS' ||
    mode === 'SEQUENCE_COMPLETE' ||
    mode === 'UNLOCK_PRESENTATION'
  ) {
    modeBadgeText = 'Results';
    modeBadgeClass = 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/50';
  } else if (!isEditable) {
    modeBadgeText = 'Siege';
    modeBadgeClass = 'bg-rose-500/25 text-rose-200 border border-rose-500/40';
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-2.5 py-2 bg-slate-950/85 border-b border-slate-800/80 backdrop-blur-md">
      {/* Left: Brand & Level Badge */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-md shrink-0">
          <Shield className="w-4 h-4 text-slate-950 stroke-[2.5]" />
        </div>
        <div className="truncate">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-100 truncate">
              Sanctuary Defense
            </h1>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${modeBadgeText ? modeBadgeClass : ''}`}
            >
              {modeBadgeText}
            </span>
            {sampleUnlockActive && (
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-500/20 text-purple-200 border border-purple-400/40"
                title="Reinforcement Reserve Sample Unlock Active"
              >
                <Gift className="w-2.5 h-2.5 text-purple-300" />
                Reserve+
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Construction, Presentation & Diagnostic Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!isEditable || !canUndo}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isEditable && canUndo
              ? 'bg-slate-800/90 text-slate-100 hover:bg-slate-700 active:scale-95 cursor-pointer'
              : 'bg-slate-900/50 text-slate-600 cursor-not-allowed'
          }`}
          title={isReinforcing ? `Undo Reinforcement (${undoCount})` : `Undo (${undoCount})`}
          aria-label="Undo"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Undo</span>
        </button>

        <button
          onClick={onRedo}
          disabled={!isEditable || !canRedo}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isEditable && canRedo
              ? 'bg-slate-800/90 text-slate-100 hover:bg-slate-700 active:scale-95 cursor-pointer'
              : 'bg-slate-900/50 text-slate-600 cursor-not-allowed'
          }`}
          title={isReinforcing ? `Redo Reinforcement (${redoCount})` : `Redo (${redoCount})`}
          aria-label="Redo"
        >
          <Redo2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Redo</span>
        </button>

        <button
          onClick={onToggleSnap}
          disabled={!isEditable}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            !isEditable
              ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
              : snapping
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700'
          }`}
          title={snapping ? 'Magnetic Snapping: ON' : 'Magnetic Snapping: OFF'}
          aria-label="Toggle Magnetic Snapping"
        >
          <Magnet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{snapping ? 'Snap ON' : 'Free'}</span>
        </button>

        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
              isMuted
                ? 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                : 'bg-slate-800/80 border-slate-700/70 text-slate-300 hover:text-white'
            }`}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            aria-label="Toggle Mute"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-amber-300 hover:text-amber-200 hover:bg-slate-700 transition-all cursor-pointer"
            title="Presentation & Camera Settings"
            aria-label="Presentation Settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={onToggleDev}
          className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
            devOpen
              ? 'bg-indigo-500/30 border-indigo-400/50 text-indigo-200'
              : 'bg-slate-800/80 border-slate-700/70 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Diagnostics & Telemetry"
          aria-label="Toggle Diagnostics"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenHelp}
          className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-slate-300 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
          title="How to Play"
          aria-label="How to Play"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
