/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import { MaterialType, PieceCondition, Vector2 } from '../types';
import {
  deriveConstructionDamageVisualProfile,
  deriveConstructionMaterialLightingProfile,
} from '../presentation/constructionTransformation';
import type { PieceVisualDescriptor } from '../presentation/constructionTransformation';

export interface TransformedPieceDecorationStyle {
  alpha: number;
  family: 'WOOD_BEAM' | 'WOOD_BLOCK' | 'STONE' | 'NONE';
  variant: number;
  prebuiltRune: boolean;
}

export function getTransformedPieceDecorationStyle(
  descriptor: PieceVisualDescriptor | undefined,
  isPrebuilt: boolean,
): TransformedPieceDecorationStyle {
  const alpha = Math.max(0, Math.min(1, descriptor?.transformationProgress ?? 0));
  const type = descriptor?.materialType;
  return {
    alpha,
    family:
      alpha <= 0 || !type
        ? 'NONE'
        : type === 'wood_beam'
          ? 'WOOD_BEAM'
          : type === 'wood_block'
            ? 'WOOD_BLOCK'
            : 'STONE',
    variant: descriptor?.variantStyle ?? 0,
    prebuiltRune: Boolean(isPrebuilt && type === 'stone_block' && alpha > 0),
  };
}

export interface TransformedMaterialLightingRenderStyle {
  family: 'WOOD_BEAM_MATERIAL' | 'WOOD_BLOCK_MATERIAL' | 'STONE_MATERIAL';
  alpha: number;
  bevelWidthPx: number;
  grainPathCount: number;
  knotCount: number;
  topHighlightAlpha: number;
  lowerEdgeShadowAlpha: number;
  hardwareShadowOffset: { x: number; y: number };
  hardwareHighlightAlpha: number;
  contactShadowAlpha: number;
  recessShadowAlpha: number;
  runeGlowAlpha: number;
  runeGrooveAlpha: number;
  crackAlpha: number;
  exposedMaterialAlpha: number;
  sideFaceDamageAlpha: number;
  chipCount: number;
}

export function getTransformedMaterialLightingRenderStyle(
  descriptor: PieceVisualDescriptor,
  isPrebuilt: boolean,
  reducedIntensity = false,
): TransformedMaterialLightingRenderStyle {
  const material = deriveConstructionMaterialLightingProfile({
    descriptor,
    isPrebuilt,
    reducedIntensity,
  });
  const damage = deriveConstructionDamageVisualProfile(descriptor);
  return {
    family: material.family,
    alpha: material.alpha,
    bevelWidthPx: material.bevelWidthPx,
    grainPathCount: material.grainPathCount,
    knotCount: material.knotCount,
    topHighlightAlpha: material.topHighlightAlpha,
    lowerEdgeShadowAlpha: material.lowerEdgeShadowAlpha,
    hardwareShadowOffset: material.hardwareShadowOffset,
    hardwareHighlightAlpha: material.hardwareHighlightAlpha,
    contactShadowAlpha: material.contactShadowAlpha,
    recessShadowAlpha: material.recessShadowAlpha,
    runeGlowAlpha: material.runeGlowAlpha,
    runeGrooveAlpha: material.runeGrooveAlpha,
    crackAlpha: damage.crackAlpha,
    exposedMaterialAlpha: damage.exposedMaterialAlpha,
    sideFaceDamageAlpha: damage.sideFaceDamageAlpha,
    chipCount: damage.chipCount,
  };
}

function renderMaterialLightingPass(
  ctx: CanvasRenderingContext2D,
  descriptor: PieceVisualDescriptor,
  isPrebuilt: boolean,
  hw: number,
  hh: number,
): void {
  const style = getTransformedMaterialLightingRenderStyle(descriptor, isPrebuilt);
  if (style.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= style.alpha;

  // Upper-left key-light bevel and lower-right form shadow.
  ctx.strokeStyle = `rgba(255, 247, 237, ${style.topHighlightAlpha})`;
  ctx.lineWidth = Math.max(0.8, style.bevelWidthPx * 0.55);
  ctx.beginPath();
  ctx.moveTo(-hw + 2, -hh + 2);
  ctx.lineTo(hw - 3, -hh + 2);
  ctx.moveTo(-hw + 2, -hh + 2);
  ctx.lineTo(-hw + 2, hh - 3);
  ctx.stroke();

  ctx.strokeStyle = `rgba(15, 23, 42, ${style.lowerEdgeShadowAlpha})`;
  ctx.lineWidth = Math.max(1, style.bevelWidthPx * 0.65);
  ctx.beginPath();
  ctx.moveTo(-hw + 3, hh - 2);
  ctx.lineTo(hw - 2, hh - 2);
  ctx.moveTo(hw - 2, -hh + 3);
  ctx.lineTo(hw - 2, hh - 2);
  ctx.stroke();

  if (style.family === 'WOOD_BEAM_MATERIAL' || style.family === 'WOOD_BLOCK_MATERIAL') {
    // Deterministic layered grain. No runtime randomness or allocation-heavy paths.
    ctx.strokeStyle = 'rgba(67, 38, 18, 0.46)';
    ctx.lineWidth = 0.75;
    for (let index = 0; index < style.grainPathCount; index++) {
      const y = -hh * 0.45 + ((index + 1) / (style.grainPathCount + 1)) * hh * 0.9;
      const phase = ((descriptor.seed >>> (index * 3)) & 7) - 3.5;
      ctx.beginPath();
      ctx.moveTo(-hw + 10, y);
      ctx.bezierCurveTo(-hw * 0.35, y + phase * 0.35, hw * 0.35, y - phase * 0.3, hw - 10, y);
      ctx.stroke();
    }
    if (style.knotCount > 0) {
      const knotX = -hw * 0.2 + (descriptor.seed % 41) / 40 * hw * 0.4;
      ctx.strokeStyle = 'rgba(54, 31, 15, 0.62)';
      ctx.beginPath();
      ctx.ellipse(knotX, 0, 4.2, 2.4, 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Recessed ember channel with restrained local spill.
    ctx.shadowColor = `rgba(251, 146, 60, ${Math.min(0.36, style.hardwareHighlightAlpha * 0.55)})`;
    ctx.shadowBlur = 3.5;
    ctx.strokeStyle = `rgba(251, 146, 60, ${style.hardwareHighlightAlpha * 0.72})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.32, 0);
    ctx.lineTo(hw * 0.32, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    // Stone mortar recess and deterministic mineral mark.
    ctx.strokeStyle = `rgba(15, 23, 42, ${style.recessShadowAlpha})`;
    ctx.lineWidth = 1.25;
    const course = descriptor.variantStyle % 2 === 0 ? 0 : -hh * 0.16;
    ctx.beginPath();
    ctx.moveTo(-hw + 4, course);
    ctx.lineTo(hw - 4, course);
    ctx.moveTo(-hw * 0.42, course);
    ctx.lineTo(-hw * 0.42, hh - 4);
    ctx.moveTo(hw * 0.42, -hh + 4);
    ctx.lineTo(hw * 0.42, course);
    ctx.stroke();
    if (isPrebuilt && style.runeGrooveAlpha > 0) {
      ctx.strokeStyle = `rgba(8, 47, 73, ${style.runeGrooveAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowColor = `rgba(34, 211, 238, ${style.runeGlowAlpha})`;
      ctx.shadowBlur = 4;
      ctx.strokeStyle = `rgba(103, 232, 249, ${Math.min(0.9, style.runeGrooveAlpha)})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Existing damage authority drives only presentation across front and side edges.
  if (style.crackAlpha > 0) {
    const exposed = style.family === 'STONE_MATERIAL' ? '148, 163, 184' : '254, 215, 170';
    ctx.strokeStyle = `rgba(9, 13, 22, ${style.crackAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.28, -hh);
    ctx.lineTo(-hw * 0.08, -hh * 0.12);
    ctx.lineTo(hw * 0.14, hh * 0.38);
    ctx.lineTo(hw - 1, hh * 0.54);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${exposed}, ${style.exposedMaterialAlpha * 0.75})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.25, -hh);
    ctx.lineTo(-hw * 0.05, -hh * 0.12);
    ctx.lineTo(hw * 0.17, hh * 0.38);
    ctx.stroke();
  }
  ctx.restore();
}

function renderTransformedPieceDetails(
  ctx: CanvasRenderingContext2D,
  descriptor: PieceVisualDescriptor,
  isPrebuilt: boolean,
  hw: number,
  hh: number,
): void {
  const style = getTransformedPieceDecorationStyle(descriptor, isPrebuilt);
  if (style.family === 'NONE') return;
  ctx.save();
  ctx.globalAlpha *= style.alpha;
  if (style.family === 'WOOD_BEAM') {
    ctx.strokeStyle = 'rgba(254, 215, 170, 0.48)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-hw + 7, -hh + 3);
    ctx.lineTo(hw - 7, -hh + 3);
    ctx.moveTo(-hw + 7, hh - 3);
    ctx.lineTo(hw - 7, hh - 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.52)';
    ctx.lineWidth = 0.9;
    const grainOffset = (style.variant - 1.5) * 1.4;
    ctx.beginPath();
    ctx.moveTo(-hw + 17, grainOffset);
    ctx.bezierCurveTo(-hw * 0.35, grainOffset - 2, hw * 0.35, grainOffset + 2, hw - 17, grainOffset);
    ctx.stroke();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.82)';
    ctx.fillRect(-hw + 5, -hh + 2, 7, hh * 2 - 4);
    ctx.fillRect(hw - 12, -hh + 2, 7, hh * 2 - 4);
    ctx.fillStyle = '#cbd5e1';
    for (const x of [-hw + 8.5, hw - 8.5]) {
      ctx.beginPath();
      ctx.arc(x, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.62)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.35, 0);
    ctx.lineTo(hw * 0.35, 0);
    ctx.stroke();
  } else if (style.family === 'WOOD_BLOCK') {
    ctx.strokeStyle = 'rgba(254, 215, 170, 0.48)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(-hw + 5, -hh + 5, hw * 2 - 10, hh * 2 - 10);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.86)';
    ctx.lineWidth = 3;
    const inset = 5;
    for (const [x, y] of [
      [-hw + inset, -hh + inset], [hw - inset, -hh + inset],
      [-hw + inset, hh - inset], [hw - inset, hh - inset],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y + (y < 0 ? 7 : -7));
      ctx.lineTo(x, y);
      ctx.lineTo(x + (x < 0 ? 7 : -7), y);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-hw + 4, -hh + 4, hw * 2 - 8, hh * 2 - 8);
    const courseY = style.variant % 2 === 0 ? 0 : -hh * 0.18;
    ctx.beginPath();
    ctx.moveTo(-hw + 3, courseY);
    ctx.lineTo(hw - 3, courseY);
    ctx.moveTo(0, -hh + 3);
    ctx.lineTo(0, courseY);
    ctx.moveTo(-hw * 0.45, courseY);
    ctx.lineTo(-hw * 0.45, hh - 3);
    ctx.moveTo(hw * 0.45, courseY);
    ctx.lineTo(hw * 0.45, hh - 3);
    ctx.stroke();
    if (style.prebuiltRune) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.78)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface BullseyeRenderFlags {
  active?: boolean;
  triggered?: boolean;
  expired?: boolean;
  unreachable?: boolean;
  timeSec?: number;
  reducedMotion?: boolean;
}

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
  bullseyeFlags?: BullseyeRenderFlags,
  visualDescriptor?: PieceVisualDescriptor,
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
  } else if (type === 'bullseye_block') {
    const isExpired = Boolean(bullseyeFlags?.expired) || condition === 'BROKEN';
    const isTriggered = Boolean(bullseyeFlags?.triggered) && !isExpired;
    const isUnreachable = Boolean(bullseyeFlags?.unreachable) && !isExpired;
    const isActive = !isExpired && (bullseyeFlags?.active ?? true);
    const t = bullseyeFlags?.reducedMotion ? 0 : (bullseyeFlags?.timeSec ?? 0);

    // Base reinforced stone block chassis
    const stoneGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    if (isExpired) {
      stoneGrad.addColorStop(0, '#64748b');
      stoneGrad.addColorStop(0.5, '#475569');
      stoneGrad.addColorStop(1, '#334155');
    } else {
      stoneGrad.addColorStop(0, '#4c1d3d');
      stoneGrad.addColorStop(0.5, '#3b1730');
      stoneGrad.addColorStop(1, '#231020');
    }
    ctx.fillStyle = stoneGrad;
    ctx.fillRect(-hw, -hh, w, h);

    // Inner stone bevel
    ctx.strokeStyle = isExpired ? 'rgba(255, 255, 255, 0.12)' : 'rgba(251, 113, 133, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-hw + 2, -hh + 2, w - 4, h - 4);

    // Corner brass/iron clasps
    ctx.fillStyle = isExpired ? '#475569' : '#f59e0b';
    const cSz = 5;
    ctx.fillRect(-hw + 2, -hh + 2, cSz, cSz);
    ctx.fillRect(hw - 2 - cSz, -hh + 2, cSz, cSz);
    ctx.fillRect(-hw + 2, hh - 2 - cSz, cSz, cSz);
    ctx.fillRect(hw - 2 - cSz, hh - 2 - cSz, cSz, cSz);

    // Concentric Target Rings
    const pulse = isActive && !isUnreachable ? 1 + Math.sin(t * 6) * 0.06 : 1;
    ctx.save();
    ctx.scale(pulse, pulse);

    // Outer target ring
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fillStyle = isExpired
      ? 'rgba(51, 65, 85, 0.85)'
      : isUnreachable
        ? 'rgba(120, 53, 15, 0.7)'
        : '#e11d48';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = isExpired ? '#94a3b8' : '#fda4af';
    ctx.stroke();

    // Middle cream/gold ring
    ctx.beginPath();
    ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
    ctx.fillStyle = isExpired ? '#64748b' : '#fef3c7';
    ctx.fill();

    // Inner bullseye core
    ctx.beginPath();
    ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = isExpired ? '#334155' : '#be123c';
    ctx.fill();

    // Expressive Mocking Carved Face inside the Bullseye
    if (isExpired) {
      // Dormant sleeping carved face (spent taunt)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -2);
      ctx.lineTo(-2, -2);
      ctx.moveTo(2, -2);
      ctx.lineTo(7, -2);
      ctx.moveTo(-4, 5);
      ctx.lineTo(4, 5);
      ctx.stroke();
    } else {
      // Cheeky winking/taunting eyes & cocked eyebrows
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-5, -2.5, 2.1, 0, Math.PI * 2);
      ctx.arc(5, -2.5, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Eye glint
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-5.5, -3.2, 0.9, 0, Math.PI * 2);
      ctx.arc(4.5, -3.2, 1.0, 0, Math.PI * 2);
      ctx.fill();

      // Cocked mocking eyebrows
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-9, -6.5);
      ctx.lineTo(-2, -4.5);
      ctx.moveTo(2, -5.5);
      ctx.lineTo(9, -8);
      ctx.stroke();

      // Smug taunting grin with tiny carved tooth
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, 3, 6.2, 0.1, Math.PI - 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(-1.5, 3.2, 3, 2.3);
    }
    ctx.restore();

    // Waving Alchemical Taunt Hand when Active & Reachable
    if (isActive && !isUnreachable) {
      const waveAngle = Math.sin(t * 10) * 0.42;
      ctx.save();
      ctx.translate(-hw - 3, -hh + 6);
      ctx.rotate(-0.45 + waveAngle);
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Little waving fingers
      ctx.fillRect(-4, -7.5, 2.2, 4);
      ctx.fillRect(-1, -8.5, 2.2, 4.5);
      ctx.fillRect(2, -7.5, 2.2, 4);
      ctx.restore();
    }

    // Triggered Target Lock Halo
    if (isTriggered) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(-hw - 4, -hh - 4, w + 8, h + 8);
      ctx.restore();
    }

    // Unreachable Warning Indicator on Block
    if (isUnreachable) {
      ctx.save();
      ctx.fillStyle = 'rgba(120, 53, 15, 0.92)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-hw + 2, hh - 13, w - 4, 11);
      ctx.strokeRect(-hw + 2, hh - 13, w - 4, 11);
      ctx.fillStyle = '#fef3c7';
      ctx.font = '700 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NO SHOT', 0, hh - 7.5);
      ctx.restore();
    }

    // Outer frame border
    ctx.strokeStyle = isSelected
      ? '#38bdf8'
      : isExpired
        ? '#334155'
        : isTriggered
          ? '#fbbf24'
          : '#f43f5e';
    ctx.lineWidth = isSelected || isTriggered ? 2.5 : 1.8;
    ctx.strokeRect(-hw, -hh, w, h);
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

  if (visualDescriptor && visualDescriptor.transformationProgress > 0) {
    renderTransformedPieceDetails(ctx, visualDescriptor, isPrebuilt, hw, hh);
    renderMaterialLightingPass(ctx, visualDescriptor, isPrebuilt, hw, hh);
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
