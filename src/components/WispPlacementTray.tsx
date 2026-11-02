/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, Sparkles } from 'lucide-react';
import React from 'react';
import { WispEntity } from '../game/types';

interface WispPlacementTrayProps {
  wisps: WispEntity[];
  selectedWispId: string | null;
  sharedCollapseWarning: string | null;
  defaultSlotReportMessage?: string | null;
  onSelectWisp: (wispId: string) => void;
  onWispPointerDown: (wispId: string, e: React.PointerEvent<HTMLElement>) => void;
  onPlaceAllDefaults: () => void;
  onReturnToBuild: () => void;
  onEnterPreSiegeReview: () => void;
  allWispsPlacedAndValid: boolean;
}

export const WispPlacementTray: React.FC<WispPlacementTrayProps> = ({
  wisps,
  selectedWispId,
  sharedCollapseWarning,
  defaultSlotReportMessage,
  onSelectWisp,
  onWispPointerDown,
  onPlaceAllDefaults,
  onReturnToBuild,
  onEnterPreSiegeReview,
  allWispsPlacedAndValid,
}) => {
  const placedCount = wisps.filter((w) => w.placed === true && w.isValid !== false).length;
  const heavyHazardWisps = wisps.filter(
    (w) => w.placed === true && w.heavyOverheadHazard,
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none flex flex-col items-center px-3 pb-3 gap-2">
      {/* Non-blocking Risk & Hazard Warnings + Blocked Default Slot Report */}
      {(defaultSlotReportMessage || sharedCollapseWarning || heavyHazardWisps.length > 0) && (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 max-w-2xl">
          {defaultSlotReportMessage && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-950/95 border border-rose-500/60 text-rose-200 text-xs font-semibold shadow-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{defaultSlotReportMessage}</span>
            </div>
          )}
          {sharedCollapseWarning && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/90 border border-amber-500/60 text-amber-200 text-xs font-semibold shadow-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{sharedCollapseWarning}</span>
            </div>
          )}
          {heavyHazardWisps.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/90 border border-amber-500/60 text-amber-200 text-xs font-semibold shadow-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Heavy overhead hazard above{' '}
                {heavyHazardWisps.map((w) => w.name.replace('Wisp ', '')).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Staging Tray */}
      <div className="pointer-events-auto w-full max-w-3xl bg-slate-950/95 border border-teal-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-teal-500/20 border border-teal-400/40 text-teal-300 text-[10px] font-bold uppercase tracking-wider">
              Phase 4 · Place Wisps ({placedCount}/5 Placed)
            </span>
            <span className="text-xs text-slate-300 hidden sm:inline">
              Drag each wisp into valid sanctuary space or tap a wisp then tap the sanctuary.
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onReturnToBuild}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-semibold transition cursor-pointer"
              title="Return to Build (preserves structure, resets uncommitted wisps)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Build</span>
            </button>

            <button
              onClick={onPlaceAllDefaults}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-950/90 hover:bg-teal-900 text-teal-200 border border-teal-500/50 text-xs font-semibold transition cursor-pointer"
              title="Place wisps in valid default sanctuary slots (skips slots blocked by pieces)"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              <span>Default Slots</span>
            </button>

            <button
              onClick={onEnterPreSiegeReview}
              disabled={!allWispsPlacedAndValid}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                allWispsPlacedAndValid
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-300 shadow-lg shadow-emerald-900/50 cursor-pointer'
                  : 'bg-slate-800/70 text-slate-500 border border-slate-700/60 cursor-not-allowed'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Pre-Siege Review</span>
            </button>
          </div>
        </div>

        {/* Five Wisp Staging Cards */}
        <div className="grid grid-cols-5 gap-2">
          {wisps.map((wisp) => {
            const isPlaced = wisp.placed === true && wisp.isValid !== false;
            const isSelected = selectedWispId === wisp.id;
            const shelter = wisp.shelterStatus ?? 'Exposed';
            const hasHeavy = Boolean(wisp.heavyOverheadHazard);
            const hasShared = Boolean(wisp.sharedCollapseRisk);

            return (
              <div
                key={wisp.id}
                onPointerDown={(e) => onWispPointerDown(wisp.id, e)}
                onClick={() => onSelectWisp(wisp.id)}
                className={`relative flex flex-col items-center p-2 rounded-xl border transition select-none touch-none cursor-grab active:cursor-grabbing ${
                  isSelected
                    ? 'bg-teal-950/70 border-teal-400 shadow-md shadow-teal-950/50'
                    : isPlaced
                      ? 'bg-slate-900/90 border-emerald-500/40 hover:border-emerald-400/60'
                      : 'bg-slate-900/75 border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-white/80 shrink-0"
                    style={{
                      backgroundColor: wisp.color,
                      boxShadow: `0 0 8px ${wisp.glowColor}`,
                    }}
                  />
                  <span className="text-xs font-bold text-slate-100 truncate">
                    {wisp.name.replace('Wisp ', '')}
                  </span>
                </div>

                {isPlaced ? (
                  <div className="flex flex-col items-center gap-0.5 w-full">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" />
                      Placed ({Math.round(wisp.position.x)}, {Math.round(wisp.position.y)})
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate max-w-full ${
                        hasHeavy
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                          : hasShared
                            ? 'bg-yellow-950 text-yellow-200 border border-yellow-500/40'
                            : shelter === 'Well sheltered'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : shelter === 'Partially sheltered'
                                ? 'bg-sky-950 text-sky-300 border border-sky-500/40'
                                : 'bg-slate-800 text-amber-200 border border-amber-500/30'
                      }`}
                    >
                      {hasHeavy
                        ? '⚠ Heavy Overhead'
                        : hasShared
                          ? `⚡ ${shelter}`
                          : shelter}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                      {isSelected ? '✦ Tap Sanctuary' : 'Drag or Tap'}
                    </span>
                    <span className="text-[9px] text-slate-400">Unplaced</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
