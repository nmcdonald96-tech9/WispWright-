/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Crosshair,
  Flame,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import React from 'react';
import { BullseyeLogicalState, MaterialType, WispEntity } from '../game/types';

interface PreSiegeReviewPanelProps {
  wisps: WispEntity[];
  inventory: Record<MaterialType, number>;
  bullseyeState: BullseyeLogicalState;
  sharedCollapseWarning: string | null;
  onReturnToPlaceWisps: () => void;
  onReturnToBuild: () => void;
  onBeginSiege: () => void;
}

export const PreSiegeReviewPanel: React.FC<PreSiegeReviewPanelProps> = ({
  wisps,
  inventory,
  bullseyeState,
  sharedCollapseWarning,
  onReturnToPlaceWisps,
  onReturnToBuild,
  onBeginSiege,
}) => {
  const exposedWisps = wisps.filter((w) => w.shelterStatus === 'Exposed');
  const heavyHazardWisps = wisps.filter((w) => w.heavyOverheadHazard);
  const reserveCount =
    (inventory.wood_beam || 0) +
    (inventory.wood_block || 0) +
    (inventory.stone_block || 0);

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[95vw] max-w-3xl pointer-events-auto bg-slate-950/95 border border-sky-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[10px] font-bold uppercase tracking-wider">
              Phase 5 · Pre-Siege Review
            </span>
            <h2 className="text-sm font-bold text-white">
              Sanctuary Formation & Incoming Siege Briefing
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Review your {wisps.length === 3 ? 'three' : wisps.length} wisp positions, incoming attack order, and reserve supplies before locking the siege.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onReturnToBuild}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-semibold transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Build</span>
          </button>

          <button
            onClick={onReturnToPlaceWisps}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-950/90 hover:bg-teal-900 text-teal-200 border border-teal-500/50 text-xs font-semibold transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            <span>Return to Place Wisps</span>
          </button>

          <button
            onClick={onBeginSiege}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white border border-amber-300 text-xs font-extrabold uppercase tracking-wider shadow-lg shadow-amber-900/50 transition cursor-pointer"
          >
            <Flame className="w-4 h-4" />
            <span>Begin Siege</span>
          </button>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* 1. Active Wisp Positions & Protection Status */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 text-teal-300 font-bold mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Wisp Sanctuary Positions ({wisps.length}/{wisps.length})</span>
          </div>
          <div className="space-y-1">
            {wisps.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-1 text-[11px] bg-slate-950/70 px-2 py-1 rounded"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: w.color }}
                  />
                  <span className="font-semibold text-slate-200">
                    {w.name.replace('Wisp ', '')}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({Math.round(w.position.x)}, {Math.round(w.position.y)})
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    w.heavyOverheadHazard
                      ? 'bg-amber-950 text-amber-300'
                      : w.shelterStatus === 'Well sheltered'
                        ? 'bg-emerald-950 text-emerald-300'
                        : w.shelterStatus === 'Partially sheltered'
                          ? 'bg-sky-950 text-sky-300'
                          : 'bg-amber-950/80 text-amber-200'
                  }`}
                >
                  {w.heavyOverheadHazard
                    ? '⚠ Heavy Hazard'
                    : w.shelterStatus || 'Exposed'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Incoming Projectile Order & Reinforcement Timing */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sky-300 font-bold mb-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Attack Order & Reinforcement</span>
            </div>
            <ol className="space-y-1.5 text-[11px] text-slate-300">
              <li className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded">
                <span className="font-semibold text-amber-300">1. Attack 1</span>
                <span>Standard Shot (Pyrite Spark)</span>
              </li>
              <li className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded">
                <span className="font-semibold text-teal-300">2. Reinforcement</span>
                <span>15s Repair + Mentor Supply</span>
              </li>
              <li className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded">
                <span className="font-semibold text-rose-300">3. Attack 2</span>
                <span>Heavy Breacher (Grom)</span>
              </li>
            </ol>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            Beginning the siege locks wisp positions for both attacks.
          </div>
        </div>

        {/* 3. Remaining Reserve Inventory, Bullseye Status & Warnings */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div>
              <div className="flex items-center gap-1.5 text-amber-300 font-bold mb-1">
                <Package className="w-3.5 h-3.5" />
                <span>Reserve Inventory ({reserveCount} Pieces)</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-center">
                <div className="bg-slate-950/80 py-1 rounded border border-slate-800">
                  <div className="font-bold text-amber-200">{inventory.wood_beam || 0}</div>
                  <div className="text-slate-400">Beams</div>
                </div>
                <div className="bg-slate-950/80 py-1 rounded border border-slate-800">
                  <div className="font-bold text-amber-200">{inventory.wood_block || 0}</div>
                  <div className="text-slate-400">Wood Blk</div>
                </div>
                <div className="bg-slate-950/80 py-1 rounded border border-slate-800">
                  <div className="font-bold text-slate-200">{inventory.stone_block || 0}</div>
                  <div className="text-slate-400">Stone Blk</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded text-[11px]">
              <span className="flex items-center gap-1 text-rose-300 font-semibold">
                <Crosshair className="w-3.5 h-3.5" />
                Bullseye Status:
              </span>
              <span className="font-bold text-slate-200">
                {bullseyeState.inventoryStatus === 'PLACED_ACTIVE'
                  ? 'Active on Battlefield'
                  : bullseyeState.inventoryStatus === 'PLACED_UNREACHABLE'
                    ? 'Placed (Unreachable)'
                    : 'In Reserve'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          <div className="space-y-1 mt-2">
            {sharedCollapseWarning && (
              <div className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/70 border border-amber-500/40 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{sharedCollapseWarning}</span>
              </div>
            )}
            {heavyHazardWisps.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/70 border border-amber-500/40 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>
                  Heavy overhead hazard ({heavyHazardWisps.length} wisp
                  {heavyHazardWisps.length > 1 ? 's' : ''})
                </span>
              </div>
            )}
            {exposedWisps.length > 0 && !sharedCollapseWarning && heavyHazardWisps.length === 0 && (
              <div className="flex items-center gap-1 text-[10px] text-sky-200 bg-sky-950/60 border border-sky-500/30 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3 shrink-0 text-sky-400" />
                <span>
                  {exposedWisps.length} wisp{exposedWisps.length > 1 ? 's' : ''} currently exposed to high-arc shots.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
