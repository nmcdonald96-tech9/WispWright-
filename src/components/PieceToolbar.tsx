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
  Unlink,
} from 'lucide-react';
import { PlacedPiece, ProposedTimberJoint, TimberJoint } from '../game/types';
import { MATERIAL_CONFIGS } from '../game/config';

interface PieceToolbarProps {
  selectedPiece: PlacedPiece | null;
  activeJointCount?: number;
  activeJoints?: TimberJoint[];
  manualBindCandidates?: ProposedTimberJoint[];
  manualBindCandidateIndex?: number;
  isDragging?: boolean;
  isReinforcement?: boolean;
  isPositionedTop?: boolean;
  onRotate: (deltaAngle: number) => void;
  onBindConnection?: () => void;
  onCycleBindCandidate?: () => void;
  onDetachConnection?: (jointId?: string) => void;
  onRemove: () => void;
  onDeselect: () => void;
}

export const PieceToolbar: React.FC<PieceToolbarProps> = ({
  selectedPiece,
  activeJointCount = 0,
  activeJoints = [],
  manualBindCandidates = [],
  manualBindCandidateIndex = 0,
  isDragging = false,
  isReinforcement = false,
  isPositionedTop = false,
  onRotate,
  onBindConnection,
  onCycleBindCandidate,
  onDetachConnection,
  onRemove,
  onDeselect,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

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

  const hasConnections = Boolean(selectedPiece.attachedAnchorId || activeJointCount > 0);
  const activeBindCandidate =
    manualBindCandidates.length > 0
      ? manualBindCandidates[manualBindCandidateIndex % manualBindCandidates.length]
      : null;

  return (
    <div
      className={`${positionClass} flex flex-col items-center gap-1 max-w-[96vw]`}
    >
      {/* Secondary Optional Connection Inspector Popover */}
      {inspectorOpen && hasConnections && !selectedPiece.isPrebuilt && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-emerald-500/40 shadow-xl backdrop-blur-md text-[10px]">
          <span className="text-slate-300 font-semibold">
            Connections (drag/rotate edits automatically):
          </span>
          {selectedPiece.attachedAnchorId && onDetachConnection && (
            <button
              onClick={() => {
                onDetachConnection();
                setInspectorOpen(false);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/50 font-bold cursor-pointer"
              title="Optionally detach anchor weld in place"
            >
              <Unlink className="w-2.5 h-2.5" />
              <span>Detach Anchor</span>
            </button>
          )}
          {activeJoints.map((j, idx) => (
            <button
              key={j.jointId}
              onClick={() => {
                onDetachConnection?.(j.jointId);
                if (activeJoints.length <= 1) setInspectorOpen(false);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-amber-950 text-emerald-200 hover:text-amber-200 border border-emerald-500/40 font-semibold cursor-pointer"
              title={`Optionally detach ${j.jointType} (${j.socketAId} ↔ ${j.socketBId})`}
            >
              <Unlink className="w-2.5 h-2.5" />
              <span>
                Detach #{idx + 1} ({j.jointType.replace('TIMBER_', '')})
              </span>
            </button>
          ))}
          {activeJointCount > 1 && onDetachConnection && (
            <button
              onClick={() => {
                onDetachConnection();
                setInspectorOpen(false);
              }}
              className="px-1.5 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/50 font-bold cursor-pointer"
            >
              Detach All ({activeJointCount})
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 flex-wrap justify-center">
        {/* Piece Info & Secondary Connection Status Badge */}
        <div className="flex flex-col pr-2 border-r border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-100">{config.name}</span>
            {selectedPiece.attachedAnchorId && (
              <button
                type="button"
                onClick={() => setInspectorOpen((prev) => !prev)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold cursor-pointer"
                title="Anchored — drag or rotate directly, or tap to inspect connection"
              >
                <Anchor className="w-2.5 h-2.5" />
                <span>ANCHORED</span>
              </button>
            )}
            {activeJointCount > 0 && (
              <button
                type="button"
                onClick={() => setInspectorOpen((prev) => !prev)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold cursor-pointer"
                title="Connected via Structural Binding — drag or rotate directly to re-snap, or tap for optional detach"
              >
                <Link2 className="w-2.5 h-2.5" />
                <span>BOUND ({activeJointCount})</span>
              </button>
            )}
            {!selectedPiece.isPrebuilt && activeBindCandidate && onBindConnection && (
              <button
                type="button"
                onClick={onBindConnection}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/25 hover:bg-purple-500/40 text-purple-200 border border-purple-400/50 text-[9px] font-bold cursor-pointer"
                title={`Bind Connection (${activeBindCandidate.jointType} · ${activeBindCandidate.sourceSocketName} ↔ ${activeBindCandidate.targetSocketName})`}
              >
                <Link2 className="w-2.5 h-2.5" />
                <span>Bind Connection</span>
              </button>
            )}
            {!selectedPiece.isPrebuilt &&
              manualBindCandidates.length > 1 &&
              onCycleBindCandidate && (
                <button
                  type="button"
                  onClick={onCycleBindCandidate}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600/60 text-[9px] font-semibold cursor-pointer"
                  title="Cycle nearby binding target"
                >
                  Target {(manualBindCandidateIndex % manualBindCandidates.length) + 1}/
                  {manualBindCandidates.length}
                </button>
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
    </div>
  );
};
