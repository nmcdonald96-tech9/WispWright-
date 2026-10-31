/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HelpCircle, X, Shield, Magnet, Play, RotateCcw } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl text-slate-200 space-y-3.5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold tracking-wide text-white">
              Wispwright Field Manual
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Objective */}
        <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-slate-200">The Objective</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Construct physical ramparts over the five protected elemental wisps
              (Ignis, Zephyr, Terran, Marinus, Aetheris) using wood beams, wood blocks, and heavy stone.
            </p>
          </div>
        </div>

        {/* Section 2: Construction Controls */}
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <Magnet className="w-4 h-4 text-amber-400" />
            <span>Placement & Snapping</span>
          </div>
          <ul className="text-[11px] text-slate-300 space-y-1 list-disc pl-4 leading-relaxed">
            <li>
              <strong>Drag from Inventory:</strong> Touch or click any material card in the bottom tray and drag into the sanctuary.
            </li>
            <li>
              <strong>Lift Offset:</strong> On touchscreens, pieces hover slightly above your finger so contact edges stay visible.
            </li>
            <li>
              <strong>Bedrock Anchors:</strong> Ancient runic pylons rooted in bedrock create rigid welds to hold heavy overhangs.
            </li>
            <li>
              <strong>Rotate & Adjust:</strong> Tap any placed piece to rotate in 45° increments or 5° fine steps, or return it to inventory.
            </li>
            <li>
              <strong>Snap Toggle:</strong> Toggle magnetic snap OFF anytime for organic, freeform stacking.
            </li>
          </ul>
        </div>

        {/* Section 3: Stability Testing */}
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <Play className="w-4 h-4 text-emerald-400" />
            <span>Physical Stability Testing</span>
          </div>
          <ul className="text-[11px] text-slate-300 space-y-1 list-disc pl-4 leading-relaxed">
            <li>
              Tap <strong>Test Fortress</strong> to activate dynamic gravity and mass.
            </li>
            <li>
              Stone blocks are 4x heavier than wood. Heavy unsupported stone can topple or crush wooden spans!
            </li>
            <li>
              Observe the fortress until motion settles to verify stability.
            </li>
            <li>
              Tap <span className="text-amber-300 font-semibold">Restore Design</span> anytime to instantly return to your pre-test editable design losslessly.
            </li>
          </ul>
        </div>

        {/* Section 4: Camera */}
        <div className="space-y-1 text-[11px] text-slate-400 border-t border-slate-800 pt-2">
          <div><strong>Camera Navigation:</strong> Drag on empty terrain to pan. Use pinch-zoom or the visible <strong>[+]</strong> and <strong>[-]</strong> buttons.</div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 active:scale-98 text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all"
        >
          Close & Begin Construction
        </button>
      </div>
    </div>
  );
};
