/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, RotateCw, Trash2, Lock, Anchor, X, AlertTriangle, Zap } from 'lucide-react';
import { PlacedPiece } from '../game/types';
import { MATERIAL_CONFIGS } from '../game/config';

interface PieceToolbarProps {
  selectedPiece: PlacedPiece | null;
  isReinforcement?: boolean;
  onRotate: (deltaAngle: number) => void;
  onRemove: () => void;
  onDeselect: () => void;
}

export const PieceToolbar: React.FC<PieceToolbarProps> = ({
  selectedPiece,
  isReinforcement = false,
  onRotate,
  onRemove,
  onDeselect,
}) => {
  if (!selectedPiece) return null;

  const config = MATERIAL_CONFIGS[selectedPiece.type];
  const angleDeg = Math.round(((selectedPiece.rotation * 180) / Math.PI) % 360);
  const condition = selectedPiece.condition || 'INTACT';
  const isLockedInReinforcement =
    selectedPiece.isPrebuilt ||
    condition === 'BROKEN' ||
    (isReinforcement && condition === 'CRACKED');

  return (
    <div className="fixed bottom-38 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[96vw]">
      {/* Piece Info */}
      <div className="flex flex-col pr-2 border-r border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-100">{config.name}</span>
          {selectedPiece.attachedAnchorId && (
            <span
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold"
              title="Rigidly welded to Environmental Anchor"
            >
              <Anchor className="w-2.5 h-2.5" />
              ANCHORED
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">
          Angle: {angleDeg}° · {condition}
        </span>
      </div>

      {selectedPiece.isPrebuilt ? (
        <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-300/90 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <Lock className="w-3.5 h-3.5" />
          <span>Ancient Foundation (Fixed)</span>
        </div>
      ) : condition === 'BROKEN' ? (
        <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-rose-300 bg-rose-950/70 rounded-lg border border-rose-500/40">
          <Zap className="w-3.5 h-3.5 text-rose-400" />
          <span>Broken Debris — Non-Reusable</span>
        </div>
      ) : isLockedInReinforcement && condition === 'CRACKED' ? (
        <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-amber-300 bg-amber-950/70 rounded-lg border border-amber-500/40">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>Cracked — Locked in Place</span>
        </div>
      ) : (
        <>
          <button
            onClick={() => onRotate(-Math.PI / 4)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 transition-all cursor-pointer text-xs font-medium"
            title="Rotate Counter-Clockwise (-45°)"
            aria-label="Rotate Counter-Clockwise"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>-45°</span>
          </button>

          <button
            onClick={() => onRotate(Math.PI / 4)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 transition-all cursor-pointer text-xs font-medium"
            title="Rotate Clockwise (+45°)"
            aria-label="Rotate Clockwise"
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span>+45°</span>
          </button>

          <button
            onClick={onRemove}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 active:scale-95 transition-all cursor-pointer text-xs font-medium ml-0.5"
            title="Return to Inventory"
            aria-label="Return piece to inventory"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Return</span>
          </button>
        </>
      )}

      {/* Deselect button */}
      <button
        onClick={onDeselect}
        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer ml-0.5"
        title="Deselect"
        aria-label="Deselect piece"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
