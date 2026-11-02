/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Trash2,
  Lock,
  Anchor,
  X,
  AlertTriangle,
  Zap,
  Minimize2,
  Maximize2,
  Link2,
} from 'lucide-react';
import { PlacedPiece } from '../game/types';
import { MATERIAL_CONFIGS } from '../game/config';

interface PieceToolbarProps {
  selectedPiece: PlacedPiece | null;
  activeJointCount?: number;
  isDragging?: boolean;
  isReinforcement?: boolean;
  isPositionedTop?: boolean;
  onRotate: (deltaAngle: number) => void;
  onDetachConnection?: () => void;
  onRemove: () => void;
  onDeselect: () => void;
}

export const PieceToolbar: React.FC<PieceToolbarProps> = ({
  selectedPiece,
  activeJointCount = 0,
  isDragging = false,
  isReinforcement = false,
  isPositionedTop = false,
  onRotate,
  onDetachConnection,
  onRemove,
  onDeselect,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // Automatically hide toolbar during active drag so it never covers the dragged piece or snap points
  if (!selectedPiece || isDragging) return null;

  const config = MATERIAL_CONFIGS[selectedPiece.type];
  const angleDeg = Math.round(((selectedPiece.rotation * 180) / Math.PI) % 360);
  const normalizedDeg = angleDeg < 0 ? angleDeg + 360 : angleDeg;
  const condition = selectedPiece.condition || 'INTACT';
  const isLockedInReinforcement =
    selectedPiece.isPrebuilt ||
    condition === 'BROKEN' ||
    (isReinforcement && condition === 'CRACKED');

  const positionClass = isPositionedTop
    ? 'fixed top-20 left-1/2 -translate-x-1/2 z-20'
    : 'fixed bottom-36 left-1/2 -translate-x-1/2 z-20';

  if (collapsed) {
    return (
      <div
        className={`${positionClass} flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/95 border border-slate-700/90 shadow-2xl backdrop-blur-md animate-in fade-in duration-150`}
      >
        <span className="text-[10px] font-bold text-slate-200">
          {config.name} ({normalizedDeg}°)
        </span>
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          title="Expand Toolbar"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
        <button
          onClick={onDeselect}
          className="p-1 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          title="Deselect"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${positionClass} flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[96vw] flex-wrap justify-center`}
    >
      {/* Piece Info */}
      <div className="flex flex-col pr-2 border-r border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-100">{config.name}</span>
          {selectedPiece.attachedAnchorId && (
            <>
              <span
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold"
                title="Rigidly welded to Environmental Anchor"
              >
                <Anchor className="w-2.5 h-2.5" />
                ANCHORED
              </span>
              {onDetachConnection && !selectedPiece.isPrebuilt && (
                <button
                  onClick={onDetachConnection}
                  className="px-1.5 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/50 text-[9px] font-bold transition cursor-pointer"
                  title="Detach this anchor connection so the piece can rotate freely"
                >
                  Detach
                </button>
              )}
            </>
          )}
          {activeJointCount > 0 && (
            <>
              <span
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold"
                title="Connected to another Timber Beam via a breakable Timber Joint"
              >
                <Link2 className="w-2.5 h-2.5" />
                TIMBER JOINT ({activeJointCount})
              </span>
              {onDetachConnection && !selectedPiece.isPrebuilt && (
                <button
                  onClick={onDetachConnection}
                  className="px-1.5 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/50 text-[9px] font-bold transition cursor-pointer"
                  title="Detach Timber Joint so this beam can move or rotate independently"
                >
                  Detach Joint
                </button>
              )}
            </>
          )}
        </div>
        <span className="text-[10px] text-slate-400">
          Angle: {normalizedDeg}° · {condition}
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
        <div className="flex items-center gap-1">
          {/* Coarse -45 */}
          <button
            onClick={() => onRotate(-Math.PI / 4)}
            className="flex items-center gap-0.5 px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 transition-all cursor-pointer text-xs font-medium"
            title="Rotate Counter-Clockwise (-45°)"
            aria-label="Rotate Counter-Clockwise"
          >
            <RotateCcw className="w-3 h-3 text-amber-400" />
            <span>-45°</span>
          </button>

          {/* Fine -15 */}
          <button
            onClick={() => onRotate(-Math.PI / 12)}
            className="px-1.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all cursor-pointer text-[11px] font-medium"
            title="Fine Rotate -15°"
            aria-label="Fine Rotate -15°"
          >
            -15°
          </button>

          {/* Fine +15 */}
          <button
            onClick={() => onRotate(Math.PI / 12)}
            className="px-1.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all cursor-pointer text-[11px] font-medium"
            title="Fine Rotate +15°"
            aria-label="Fine Rotate +15°"
          >
            +15°
          </button>

          {/* Coarse +45 */}
          <button
            onClick={() => onRotate(Math.PI / 4)}
            className="flex items-center gap-0.5 px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 transition-all cursor-pointer text-xs font-medium"
            title="Rotate Clockwise (+45°)"
            aria-label="Rotate Clockwise"
          >
            <RotateCw className="w-3 h-3 text-amber-400" />
            <span>+45°</span>
          </button>

          {/* Return to inventory */}
          <button
            onClick={onRemove}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 active:scale-95 transition-all cursor-pointer text-xs font-medium ml-0.5"
            title="Return to Inventory"
            aria-label="Return piece to inventory"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Return</span>
          </button>
        </div>
      )}

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(true)}
        className="p-1 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer ml-0.5"
        title="Compact View"
        aria-label="Compact toolbar"
      >
        <Minimize2 className="w-3.5 h-3.5" />
      </button>

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
