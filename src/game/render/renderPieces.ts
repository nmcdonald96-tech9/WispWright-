/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import { MaterialType, PieceCondition, Vector2 } from '../types';

export function renderPiece(
  ctx: CanvasRenderingContext2D,
  type: MaterialType,
  pos: Vector2,
  rotation: number,
  isPrebuilt: boolean,
  isSelected: boolean,
  isFallen = false,
  alpha = 1.0,
  condition: PieceCondition = 'INTACT',
  impactSeverity = 0,
  isDeveloperMode = false,
): void {
  const config = MATERIAL_CONFIGS[type];
  const w = config.width;
  const h = config.height;
  const hw = w / 2;
  const hh = h / 2;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(rotation);
  ctx.globalAlpha = isFallen ? alpha * 0.45 : alpha;

  if (isSelected) {
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
  }

  if (type === 'wood_beam') {
    const beamGrad = ctx.createLinearGradient(0, -hh, 0, hh);
    if (isPrebuilt) {
      beamGrad.addColorStop(0, '#8c532b');
      beamGrad.addColorStop(0.5, '#6e3c1b');
      beamGrad.addColorStop(1, '#532c12');
    } else {
      beamGrad.addColorStop(0, '#c28148');
      beamGrad.addColorStop(0.5, '#a6642d');
      beamGrad.addColorStop(1, '#7e461b');
    }
    ctx.fillStyle = beamGrad;
    ctx.fillRect(-hw, -hh, w, h);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hw + 8, -hh + 6);
    ctx.lineTo(hw - 8, -hh + 6);
    ctx.moveTo(-hw + 14, 0);
    ctx.lineTo(hw - 14, 0);
    ctx.moveTo(-hw + 8, hh - 6);
    ctx.lineTo(hw - 8, hh - 6);
    ctx.stroke();

    ctx.strokeStyle = isSelected ? '#38bdf8' : isPrebuilt ? '#45220c' : '#573014';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(-hw, -hh, w, h);

    const bracketSize = 6;
    ctx.fillStyle = isPrebuilt ? '#b45309' : '#d97706';
    ctx.fillRect(-hw, -hh, bracketSize, bracketSize);
    ctx.fillRect(hw - bracketSize, -hh, bracketSize, bracketSize);
    ctx.fillRect(-hw, hh - bracketSize, bracketSize, bracketSize);
    ctx.fillRect(hw - bracketSize, hh - bracketSize, bracketSize, bracketSize);

    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'wood_block') {
    const blockGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    if (isPrebuilt) {
      blockGrad.addColorStop(0, '#7c4a27');
      blockGrad.addColorStop(1, '#5a3114');
    } else {
      blockGrad.addColorStop(0, '#b4743c');
      blockGrad.addColorStop(1, '#854d22');
    }
    ctx.fillStyle = blockGrad;
    ctx.fillRect(-hw, -hh, w, h);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = isSelected ? '#38bdf8' : isPrebuilt ? '#3e1d08' : '#5c3214';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(-hw, -hh, w, h);

    ctx.fillStyle = '#d97706';
    const rSize = 4;
    ctx.fillRect(-hw + 3, -hh + 3, rSize, rSize);
    ctx.fillRect(hw - 3 - rSize, -hh + 3, rSize, rSize);
    ctx.fillRect(-hw + 3, hh - 3 - rSize, rSize, rSize);
    ctx.fillRect(hw - 3 - rSize, hh - 3 - rSize, rSize, rSize);
  } else {
    const stoneGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    if (isPrebuilt) {
      stoneGrad.addColorStop(0, '#475569');
      stoneGrad.addColorStop(0.5, '#334155');
      stoneGrad.addColorStop(1, '#1e293b');
    } else {
      stoneGrad.addColorStop(0, '#64748b');
      stoneGrad.addColorStop(0.5, '#475569');
      stoneGrad.addColorStop(1, '#334155');
    }
    ctx.fillStyle = stoneGrad;
    ctx.fillRect(-hw, -hh, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-hw + 2, -hh + 2, w - 4, h - 4);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hw + 10, -hh + 6);
    ctx.lineTo(-hw + 18, 0);
    ctx.lineTo(-hw + 12, hh - 8);
    ctx.stroke();

    ctx.strokeStyle = isSelected ? '#38bdf8' : isPrebuilt ? '#1e293b' : '#334155';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(-hw, -hh, w, h);

    if (isPrebuilt) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.moveTo(-6, -4);
      ctx.lineTo(6, 4);
      ctx.stroke();
    }
  }

  // Subtle corner rivet / anchor glyph on prebuilt foundations
  if (isPrebuilt) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.arc(hw - 6, -hh + 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Expressive Structural Damage & Cracking Overlay (No CRK text in Player Presentation Mode)
  if (condition === 'CRACKED') {
    // Deep multi-branch dark fracture lines
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.45, -hh);
    ctx.lineTo(-hw * 0.12, -hh * 0.15);
    ctx.lineTo(-hw * 0.38, hh * 0.78);
    ctx.moveTo(-hw * 0.12, -hh * 0.15);
    ctx.lineTo(hw * 0.22, hh * 0.45);
    ctx.moveTo(hw * 0.25, -hh);
    ctx.lineTo(hw * 0.08, -hh * 0.2);
    ctx.lineTo(hw * 0.42, hh * 0.35);
    ctx.stroke();

    // Amber stress-fracture highlight along crack edge
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.42, -hh);
    ctx.lineTo(-hw * 0.09, -hh * 0.15);
    ctx.lineTo(-hw * 0.35, hh * 0.78);
    ctx.stroke();

    // Missing chip notch on top/bottom border
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -hh);
    ctx.lineTo(-hw * 0.38, -hh);
    ctx.lineTo(-hw * 0.44, -hh + 5);
    ctx.closePath();
    ctx.fill();

    if (isDeveloperMode) {
      ctx.fillStyle = 'rgba(120, 53, 15, 0.9)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.fillRect(-16, -7, 32, 14);
      ctx.strokeRect(-16, -7, 32, 14);
      ctx.fillStyle = '#fef3c7';
      ctx.font = '700 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️ CRK', 0, 0);
    }
  } else if (condition === 'BROKEN') {
    // Darkened shattered debris wash
    ctx.fillStyle = 'rgba(9, 13, 22, 0.56)';
    ctx.fillRect(-hw, -hh, w, h);

    // Heavy shattered through-cracks
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.65, -hh);
    ctx.lineTo(-hw * 0.18, -hh * 0.1);
    ctx.lineTo(0, hh * 0.45);
    ctx.lineTo(-hw * 0.15, hh);
    ctx.moveTo(hw * 0.12, -hh);
    ctx.lineTo(hw * 0.48, 0);
    ctx.lineTo(hw * 0.25, hh);
    ctx.moveTo(-hw, 0);
    ctx.lineTo(hw, hh * 0.2);
    ctx.stroke();

    // Red-orange structural failure outline dash
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-hw + 1, -hh + 1, w - 2, h - 2);
    ctx.setLineDash([]);

    if (isDeveloperMode) {
      ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1;
      ctx.fillRect(-21, -7, 42, 14);
      ctx.strokeRect(-21, -7, 42, 14);
      ctx.fillStyle = '#fee2e2';
      ctx.font = '700 7.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ DEBRIS', 0, 0);
    }
  }

  ctx.restore();
}
