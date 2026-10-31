/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StabilityReport } from '../game/types';
import { PresentationMode } from '../game/presentation/presentationTypes';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface StabilityGaugeProps {
  report: StabilityReport;
  mode: string;
  presentationMode?: PresentationMode;
}

export const StabilityGauge: React.FC<StabilityGaugeProps> = ({
  report,
  mode,
  presentationMode = 'PLAYER',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDeveloperMode = presentationMode === 'DEVELOPER';

  if (!report.isSimulating) return null;

  // In Player Presentation Mode, hide the stability telemetry pill during active siege
  // so it never overlaps the battle HUD or character performance
  const isSiegePhase = mode !== 'TESTING_SIMULATION' && mode !== 'SETTLED';
  if (!isDeveloperMode && isSiegePhase) {
    return null;
  }

  const isCollapsed = report.fallenCount > 0;
  const isSettled = report.isSettled;

  return (
    <div className="fixed top-12 left-2 right-2 sm:left-auto sm:right-3 sm:w-72 z-20 transition-all duration-150">
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1.5 shadow-xl backdrop-blur-md">
        {/* Compact Single-Line Bar Header */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
            <span className="text-[11px] font-semibold text-slate-300 truncate">
              {isSettled ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  {isDeveloperMode
                    ? `Stable (${Math.round(report.settledRatio * 100)}%)`
                    : 'Fortress Stable'}
                </span>
              ) : isCollapsed ? (
                <span className="text-rose-400 font-bold flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  {isDeveloperMode
                    ? `Collapse (${report.fallenCount})`
                    : 'Structure Damaged'}
                </span>
              ) : (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {isDeveloperMode
                    ? `Settling (${Math.round(report.settledRatio * 100)}%)`
                    : 'Testing Stability...'}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick mini-meter in collapsed state */}
            <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  isSettled
                    ? 'bg-emerald-400'
                    : report.totalKineticEnergy > 0.3
                      ? 'bg-rose-500'
                      : 'bg-cyan-400'
                }`}
                style={{ width: `${Math.round(report.settledRatio * 100)}%` }}
              />
            </div>

            {isDeveloperMode && (
              <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className="p-0.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                aria-label={isExpanded ? 'Collapse stability details' : 'Expand stability details'}
                title="Toggle details"
              >
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expandable Details (Developer Presentation Only) */}
        {isDeveloperMode && isExpanded && (
          <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1.5 text-[10px]">
            <div className="flex justify-between text-slate-400 font-medium">
              <span>Kinetic Motion:</span>
              <span className="font-mono tabular-nums text-slate-200">
                {report.totalKineticEnergy.toFixed(4)} J
              </span>
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  isSettled ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(100, report.totalKineticEnergy * 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-slate-400 font-medium pt-0.5">
              <span>Settlement Progress:</span>
              <span className="font-mono tabular-nums text-cyan-300">
                {Math.round(report.settledRatio * 100)}%
              </span>
            </div>

            {report.fallenCount > 0 && (
              <div className="text-rose-400 font-medium pt-0.5 flex justify-between">
                <span>Fallen pieces:</span>
                <span className="font-mono font-bold">{report.fallenCount}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

