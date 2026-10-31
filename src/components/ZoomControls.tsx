/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ZoomIn, ZoomOut, Compass, Eye } from 'lucide-react';
import { FlightCameraPreference } from '../game/presentation/presentationTypes';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  currentZoom: number;
  flightCamera?: FlightCameraPreference;
  onCycleFlightCamera?: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  currentZoom,
  flightCamera = 'SIDE_FOLLOW',
  onCycleFlightCamera,
}) => {
  const camBadge =
    flightCamera === 'EXPERIMENTAL_POV'
      ? 'POV EXP'
      : flightCamera === 'TACTICAL_WIDE'
        ? 'TACTICAL'
        : 'FOLLOW';

  return (
    <div className="fixed right-3 top-14 z-20 flex flex-col gap-1.5 bg-slate-950/85 border border-slate-800/80 rounded-xl p-1 shadow-lg backdrop-blur-md">
      <button
        onClick={onZoomIn}
        className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white active:scale-95 transition-all cursor-pointer"
        aria-label="Zoom in camera"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <button
        onClick={onZoomOut}
        className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white active:scale-95 transition-all cursor-pointer"
        aria-label="Zoom out camera"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <button
        onClick={onResetView}
        className="p-2 rounded-lg bg-slate-900 text-amber-300 hover:bg-slate-800 hover:text-amber-200 active:scale-95 transition-all cursor-pointer"
        aria-label="Recenter Fortress"
        title="Recenter Fortress"
      >
        <Compass className="w-4 h-4" />
      </button>

      {onCycleFlightCamera && (
        <button
          onClick={onCycleFlightCamera}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg border text-[7.5px] font-bold transition-all cursor-pointer ${
            flightCamera === 'EXPERIMENTAL_POV'
              ? 'bg-amber-500/25 border-amber-400 text-amber-200'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
          title="Cycle Camera Mode (Follow / POV Experimental / Tactical)"
        >
          <Eye className="w-3.5 h-3.5 mb-0.5" />
          <span>{camBadge}</span>
        </button>
      )}

      <div className="text-[9px] text-center text-slate-500 font-mono py-0.5 select-none">
        {Math.round(currentZoom * 100)}%
      </div>
    </div>
  );
};
