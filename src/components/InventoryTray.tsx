/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PackagePlus } from 'lucide-react';
import { MATERIAL_CONFIGS } from '../game/config';
import { MaterialType } from '../game/types';

interface InventoryTrayProps {
  inventory: Record<MaterialType, number>;
  deliveredInventory?: Record<MaterialType, number>;
  isReinforcement?: boolean;
  disabled: boolean;
  onStartDrag: (type: MaterialType, clientX: number, clientY: number) => void;
}

export const InventoryTray: React.FC<InventoryTrayProps> = ({
  inventory,
  deliveredInventory,
  isReinforcement = false,
  disabled,
  onStartDrag,
}) => {
  const materials: MaterialType[] = ['wood_beam', 'wood_block', 'stone_block'];

  const handlePointerDown = (type: MaterialType, e: React.PointerEvent) => {
    if (disabled || (inventory[type] || 0) <= 0) return;
    onStartDrag(type, e.clientX, e.clientY);
  };

  return (
    <div className="w-full bg-slate-950/92 border-t border-slate-800/80 px-2.5 py-1.5 backdrop-blur-md safe-bottom">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
          <span>{isReinforcement ? 'Reinforcement Reserve' : 'Fortress Materials'}</span>
          {isReinforcement && (
            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px]">
              Reposition Intact Pieces Allowed
            </span>
          )}
        </span>
        <span className="text-[9px] text-slate-400">
          {isReinforcement ? 'Drag reserve or intact blocks' : 'Drag piece into fortress'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {materials.map((type) => {
          const config = MATERIAL_CONFIGS[type];
          const count = inventory[type] || 0;
          const deliveredCount = deliveredInventory?.[type] || 0;
          const isAvailable = count > 0 && !disabled;

          return (
            <div
              key={type}
              onPointerDown={(e) => handlePointerDown(type, e)}
              className={`relative flex flex-col items-center justify-between p-1.5 rounded-xl border transition-all select-none touch-none ${
                isAvailable
                  ? deliveredCount > 0
                    ? 'bg-emerald-950/50 border-emerald-500/70 hover:border-emerald-400 active:scale-95 cursor-grab active:cursor-grabbing shadow-md'
                    : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-500 active:scale-95 cursor-grab active:cursor-grabbing shadow-sm'
                  : 'bg-slate-950/50 border-slate-800/40 opacity-45 cursor-not-allowed'
              }`}
              style={{ minHeight: '62px' }}
              role="button"
              tabIndex={isAvailable ? 0 : -1}
              aria-label={`Select ${config.name}, ${count} remaining`}
            >
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
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                ×{count}
              </div>

              {/* Material Miniature Icon */}
              <div className="h-7 flex items-center justify-center my-0.5 pointer-events-none">
                {type === 'wood_beam' && (
                  <div
                    className="w-14 h-2.5 rounded-xs border shadow-sm"
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
              </div>

              {/* Name & Quick Spec */}
              <div className="text-center w-full pointer-events-none">
                <div className="text-[10px] font-semibold text-slate-200 truncate">
                  {config.name}
                </div>
                <div className="text-[8px] text-slate-400 truncate">
                  {type === 'stone_block' ? 'Heavy 5.5x' : 'Light Wood'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
