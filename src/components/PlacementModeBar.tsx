/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, RotateCw, Check, X, CheckCheck, RefreshCw } from 'lucide-react';
import { DragState } from '../game/types';
import { MATERIAL_CONFIGS } from '../game/config';

interface PlacementModeBarProps {
  dragState: DragState | null;
  onRotate: (deltaRad: number) => void;
  onAcceptSnapAngle: () => void;
  onCycleCandidate?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const PlacementModeBar: React.FC<PlacementModeBarProps> = ({
  dragState,
  onRotate,
  onAcceptSnapAngle,
  onCycleCandidate,
  onConfirm,
  onCancel,
}) => {
  if (!dragState || dragState.source !== 'tap_staging') return null;

  const config = MATERIAL_CONFIGS[dragState.pieceType];
  const angleDeg = Math.round(((dragState.preferredRotation * 180) / Math.PI) % 360);
  const normalizedDeg = angleDeg < 0 ? angleDeg + 360 : angleDeg;
  const isValid = dragState.isValidPlacement;

  const proposedAngleDeg =
    dragState.activeSnap?.proposedAngle !== undefined
      ? Math.round(((dragState.activeSnap.proposedAngle * 180) / Math.PI) % 360)
      : null;
  const hasProposedDiff =
    dragState.activeSnap?.requiresRotationChange &&
    proposedAngleDeg !== null &&
    proposedAngleDeg !== normalizedDeg;

  const candidateCount = dragState.candidateCycleCount ?? 0;
  const candidateIdx = dragState.candidateCycleIndex ?? 0;

  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-900/98 border border-amber-400/80 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[96vw]">
      {/* Top row: piece info & status */}
      <div className="flex items-center justify-between w-full gap-2 border-b border-slate-800 pb-1 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="text-xs font-bold text-slate-100">
            Placement Mode: {config.name}
          </span>
          <span className="text-[10px] text-amber-300 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
            {normalizedDeg}°
          </span>
          {dragState.currentCandidateLabel && (
            <span className="text-[10px] text-teal-300 font-semibold bg-teal-950/80 px-1.5 py-0.5 rounded border border-teal-500/40">
              {dragState.currentCandidateLabel}
            </span>
          )}
        </div>

        <span
          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
            isValid
              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
              : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
          }`}
        >
          {isValid ? 'Ready to Place' : '🚫 Overlap / Blocked'}
        </span>
      </div>

      {/* Roof support status line when connecting a Roof Peak */}
      {dragState.roofSupportSummary && (
        <div
          className={`w-full text-center text-[10px] font-medium px-2 py-0.5 rounded border ${
            dragState.roofSupportSummary.lowerSupportUnresolved ||
            dragState.roofSupportSummary.supportColumnAppearsUnstable
              ? 'bg-amber-950/60 text-amber-200 border-amber-500/40'
              : 'bg-sky-950/60 text-sky-200 border-sky-500/40'
          }`}
        >
          {dragState.roofSupportSummary.summaryMessage}
        </div>
      )}

      {/* Middle row: rotation & proposed angle acceptance & candidate cycling */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {/* Coarse -45 */}
        <button
          onClick={() => onRotate(-Math.PI / 4)}
          className="flex items-center gap-0.5 px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 transition-all text-xs font-medium cursor-pointer"
          title="Rotate -45°"
        >
          <RotateCcw className="w-3 h-3 text-amber-400" />
          <span>-45°</span>
        </button>

        {/* Fine -15 */}
        <button
          onClick={() => onRotate(-Math.PI / 12)}
          className="px-1.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all text-[11px] font-medium cursor-pointer"
          title="Fine -15°"
        >
          -15°
        </button>

        {/* Fine +15 */}
        <button
          onClick={() => onRotate(Math.PI / 12)}
          className="px-1.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all text-[11px] font-medium cursor-pointer"
          title="Fine +15°"
        >
          +15°
        </button>

        {/* Coarse +45 */}
        <button
          onClick={() => onRotate(Math.PI / 4)}
          className="flex items-center gap-0.5 px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 transition-all text-xs font-medium cursor-pointer"
          title="Rotate +45°"
        >
          <RotateCw className="w-3 h-3 text-amber-400" />
          <span>+45°</span>
        </button>

        {/* Next connection candidate cycling when multiple valid connections exist */}
        {candidateCount > 1 && onCycleCandidate && (
          <button
            onClick={onCycleCandidate}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-teal-950/80 hover:bg-teal-900 border border-teal-400/60 text-teal-200 active:scale-95 transition-all text-xs font-medium cursor-pointer"
            title="Cycle to next nearby connection candidate (Tab)"
          >
            <RefreshCw className="w-3 h-3 text-teal-300" />
            <span>
              Next connection ({candidateIdx + 1}/{candidateCount})
            </span>
          </button>
        )}

        {/* Optional intentional acceptance of candidate snap rotation */}
        {hasProposedDiff && (
          <button
            onClick={onAcceptSnapAngle}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400/60 text-cyan-200 active:scale-95 transition-all text-xs font-medium cursor-pointer"
            title={`Snap angle to candidate socket (${proposedAngleDeg}°)`}
          >
            <CheckCheck className="w-3 h-3 text-cyan-300" />
            <span>Align to Socket ({proposedAngleDeg}°)</span>
          </button>
        )}
      </div>

      {/* Bottom row: Confirm & Cancel */}
      <div className="flex items-center gap-2 pt-0.5 w-full">
        <button
          onClick={onConfirm}
          disabled={!isValid}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-md ${
            isValid
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95 ring-1 ring-emerald-300/40'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          <span>Place Piece (Tap / Confirm)</span>
        </button>

        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium active:scale-95 transition-all cursor-pointer"
          title="Cancel Placement"
        >
          <X className="w-3.5 h-3.5 text-rose-400" />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
};
