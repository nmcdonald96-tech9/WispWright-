/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { PackagePlus } from 'lucide-react';
import { MATERIAL_CONFIGS } from '../game/config';
import { MaterialType, SourceCardBounds } from '../game/types';

interface InventoryTrayProps {
  inventory: Record<MaterialType, number>;
  deliveredInventory?: Record<MaterialType, number>;
  isReinforcement?: boolean;
  disabled: boolean;
  highlightFocus?: boolean;
  highlightedMaterial?: MaterialType | null;
  guidanceActive?: boolean;
  activeLiftItemType?: MaterialType | null;
  onPointerDownItem?: (
    type: MaterialType,
    e: React.PointerEvent<HTMLElement>,
    cardBounds: SourceCardBounds,
    trayTopY: number,
  ) => void;
  onStartDrag?: (type: MaterialType, clientX: number, clientY: number) => void;
}

export const InventoryTray: React.FC<InventoryTrayProps> = ({
  inventory,
  deliveredInventory,
  isReinforcement = false,
  disabled,
  highlightFocus = false,
  highlightedMaterial = null,
  guidanceActive = false,
  activeLiftItemType = null,
  onPointerDownItem,
  onStartDrag,
}) => {
  const trayRef = useRef<HTMLDivElement | null>(null);
  const materials: MaterialType[] = ['wood_beam', 'wood_block', 'stone_block', 'bullseye_block'];

  const handlePointerDown = (type: MaterialType, e: React.PointerEvent<HTMLElement>) => {
    if (disabled || (inventory[type] || 0) <= 0) return;
    const cardRect = e.currentTarget.getBoundingClientRect();
    const cardBounds: SourceCardBounds = {
      x: cardRect.left,
      y: cardRect.top,
      width: cardRect.width,
      height: cardRect.height,
    };
    const trayRect = trayRef.current?.getBoundingClientRect();
    const trayTopY = trayRect ? trayRect.top : window.innerHeight - 92;

    if (onPointerDownItem) {
      onPointerDownItem(type, e, cardBounds, trayTopY);
    } else if (onStartDrag) {
      onStartDrag(type, e.clientX, e.clientY);
    }
  };

  return (
    <div
      ref={trayRef}
      data-inventory-tray="true"
      className={`w-full border-t px-2.5 py-1.5 backdrop-blur-md safe-bottom transition-all ${
        highlightFocus
          ? 'bg-amber-950/60 border-amber-400 ring-1 ring-amber-400/60'
          : 'bg-slate-950/92 border-slate-800/80'
      }`}
    >
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
          <span>{isReinforcement ? 'Reinforcement Reserve' : 'Fortress Materials'}</span>
          {highlightedMaterial && guidanceActive && !isReinforcement && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-200 border border-amber-400/60 text-[9px] animate-pulse">
              {highlightedMaterial === 'wood_beam'
                ? 'Step 1: Drag or Tap Beam →'
                : 'Step 2: Drag or Tap Block →'}
            </span>
          )}
          {highlightFocus && !highlightedMaterial && !isReinforcement && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-200 border border-amber-400/50 text-[9px]">
              Drag a Beam &amp; Block onto the Sanctuary
            </span>
          )}
          {isReinforcement && (
            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px]">
              Reposition Intact Pieces Allowed
            </span>
          )}
        </span>
        <span className="text-[9px] text-slate-400 truncate ml-2">
          Bullseye Block: Draws the next reachable enemy shot (1 attack)
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {materials.map((type) => {
          const config = MATERIAL_CONFIGS[type];
          const count = inventory[type] || 0;
          const deliveredCount = deliveredInventory?.[type] || 0;
          const isAvailable = count > 0 && !disabled;
          const isBullseye = type === 'bullseye_block';
          const isLiftingFromCard = activeLiftItemType === type;
          const isGuidedTarget =
            !isReinforcement && guidanceActive && highlightedMaterial === type && isAvailable;
          const isDimmedByGuidance =
            !isReinforcement &&
            guidanceActive &&
            highlightedMaterial !== null &&
            highlightedMaterial !== type;

          return (
            <div
              key={type}
              data-inventory-card="true"
              onPointerDown={(e) => handlePointerDown(type, e)}
              className={`relative flex flex-col items-center justify-between p-1.5 rounded-xl border transition-all select-none touch-none ${
                isAvailable
                  ? isLiftingFromCard
                    ? 'bg-cyan-950/70 border-cyan-400 ring-2 ring-cyan-400/90 scale-[0.96] shadow-inner cursor-grabbing'
                    : isGuidedTarget
                      ? 'bg-amber-950/75 border-amber-400 ring-2 ring-amber-400/80 shadow-lg shadow-amber-500/25 active:scale-95 cursor-grab active:cursor-grabbing'
                      : deliveredCount > 0
                        ? 'bg-emerald-950/50 border-emerald-500/70 hover:border-emerald-400 active:scale-95 cursor-grab active:cursor-grabbing shadow-md'
                        : isBullseye
                          ? 'bg-rose-950/60 border-rose-500/70 hover:border-rose-400 active:scale-95 cursor-grab active:cursor-grabbing shadow-md'
                          : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-500 active:scale-95 cursor-grab active:cursor-grabbing shadow-sm'
                  : 'bg-slate-950/50 border-slate-800/40 opacity-45 cursor-not-allowed'
              } ${isDimmedByGuidance && isAvailable ? 'opacity-70' : ''}`}
              style={{ minHeight: '62px' }}
              role="button"
              tabIndex={isAvailable ? 0 : -1}
              aria-label={`Select ${config.name}, ${count} remaining`}
              title={config.description}
            >
              {/* Guided Drag Callout Badge */}
              {isGuidedTarget && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[8px] font-extrabold uppercase tracking-wider shadow whitespace-nowrap pointer-events-none">
                  Drag / Tap
                </div>
              )}

              {/* Mentor Delivered Badge */}
              {deliveredCount > 0 && (
                <div
                  className="absolute top-1 left-1 flex items-center gap-0.5 px-1 py-0.2 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 text-[8px] font-bold"
                  title="Includes Mentor Emergency Supply"
                >
                  <PackagePlus className="w-2.5 h-2.5 text-emerald-300" />
                  <span>+{deliveredCount}</span>
                </div>
              )}

              {/* Count Badge */}
              <div
                className={`absolute top-1 right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono tabular-nums ${
                  count > 0
                    ? isBullseye
                      ? 'bg-rose-500/25 text-rose-200 border border-rose-400/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                ×{count}
              </div>

              {/* Material Miniature Icon */}
              <div className="h-7 flex items-center justify-center my-0.5 pointer-events-none">
                {type === 'wood_beam' && (
                  <div
                    className="w-11 h-2.5 rounded-xs border shadow-sm"
                    style={{
                      background: 'linear-gradient(to bottom, #c28148, #7e461b)',
                      borderColor: '#573014',
                    }}
                  />
                )}
                {type === 'wood_block' && (
                  <div
                    className="w-6 h-6 rounded-xs border shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #b4743c, #854d22)',
                      borderColor: '#5c3214',
                    }}
                  />
                )}
                {type === 'stone_block' && (
                  <div
                    className="w-6 h-6 rounded-xs border shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #64748b, #334155)',
                      borderColor: '#1e293b',
                    }}
                  />
                )}
                {type === 'bullseye_block' && (
                  <div
                    className="w-6 h-6 rounded-xs border shadow-sm flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #4c1d3d, #231020)',
                      borderColor: '#f43f5e',
                    }}
                  >
                    <div className="w-4 h-4 rounded-full bg-rose-600 border border-amber-200 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-200" />
                    </div>
                  </div>
                )}
              </div>

              {/* Name & Quick Spec */}
              <div className="text-center w-full pointer-events-none">
                <div className="text-[9.5px] font-semibold text-slate-200 truncate">
                  {config.name}
                </div>
                <div className="text-[8px] text-slate-400 truncate">
                  {type === 'bullseye_block'
                    ? 'Draws 1 Shot'
                    : type === 'stone_block'
                      ? 'Heavy 5.5x'
                      : 'Light Wood'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
