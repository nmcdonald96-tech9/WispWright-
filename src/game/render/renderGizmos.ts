/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import { AuthoritativeTutorialState, DragState, PlacedPiece, Vector2 } from '../types';
import { renderPiece } from './renderPieces';

export function renderGizmos(
  ctx: CanvasRenderingContext2D,
  dragState: DragState | null,
  selectedPiece: PlacedPiece | null,
  touchContactWorldPos?: Vector2,
): void {
  // 1. Render Active Drag Ghost & Overlap Status
  if (dragState) {
    const config = MATERIAL_CONFIGS[dragState.pieceType];
    const hw = config.width / 2;
    const hh = config.height / 2;
    const pos = dragState.currentWorldPos;
    const rot = dragState.rotation;

    // Lift offset tether line (if finger touch position is provided)
    if (touchContactWorldPos) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(touchContactWorldPos.x, touchContactWorldPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      // Touch contact reticle
      ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.arc(touchContactWorldPos.x, touchContactWorldPos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Snap Connector Guide
    if (dragState.activeSnap) {
      const snapSock = dragState.activeSnap.socket;
      ctx.save();
      const isAnchor = snapSock.type === 'anchor';
      ctx.strokeStyle = isAnchor ? '#38bdf8' : '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(snapSock.worldPos.x, snapSock.worldPos.y, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Magnetic connection pulse line
      ctx.beginPath();
      ctx.moveTo(snapSock.worldPos.x, snapSock.worldPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
    }

    // Ghost Piece Body
    renderPiece(
      ctx,
      dragState.pieceType,
      pos,
      rot,
      false,
      true,
      false,
      dragState.isValidPlacement ? 0.85 : 0.6,
    );

    // Invalid Overlap / Warning Hash Overlay
    if (!dragState.isValidPlacement) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rot);

      // Red/amber hash pattern
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.fillRect(-hw, -hh, config.width, config.height);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(-hw, -hh, config.width, config.height);

      // Warning Badge (Do not communicate with color alone)
      ctx.restore();
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      const badgeText = '🚫 BLOCKED: OVERLAP';
      const textWidth = ctx.measureText(badgeText).width;
      const bx = pos.x - textWidth / 2 - 8;
      const by = pos.y - hh - 28;

      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, textWidth + 16, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fee2e2';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 8, by + 10);
      ctx.restore();
    } else if (dragState.activeSnap) {
      // Valid Snap Badge
      ctx.save();
      const isAnchor = dragState.activeSnap.socket.type === 'anchor';
      const badgeText = isAnchor ? '⚓ BEDROCK ANCHOR (RIGID WELD)' : '✦ SURFACE CONTACT (FRICTION)';
      ctx.font = '700 10px system-ui, sans-serif';
      const textWidth = ctx.measureText(badgeText).width;
      const bx = pos.x - textWidth / 2 - 8;
      const by = pos.y - hh - 24;

      ctx.fillStyle = isAnchor ? 'rgba(8, 47, 73, 0.95)' : 'rgba(67, 20, 7, 0.9)';
      ctx.strokeStyle = isAnchor ? '#38bdf8' : '#f59e0b';
      ctx.lineWidth = isAnchor ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, textWidth + 16, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isAnchor ? '#e0f2fe' : '#fef3c7';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 8, by + 10);
      ctx.restore();
    }
  }

  // 2. Selected Piece Reticle
  if (selectedPiece && !dragState) {
    const config = MATERIAL_CONFIGS[selectedPiece.type];
    const hw = config.width / 2;
    const hh = config.height / 2;
    const cond = selectedPiece.condition || 'INTACT';

    ctx.save();
    ctx.translate(selectedPiece.position.x, selectedPiece.position.y);
    ctx.rotate(selectedPiece.rotation);

    // Outline color based on condition
    const reticleColor =
      cond === 'BROKEN' ? '#ef4444' : cond === 'CRACKED' ? '#f59e0b' : '#38bdf8';

    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-hw - 4, -hh - 4, config.width + 8, config.height + 8);
    ctx.setLineDash([]);

    // Corner targeting pips
    const pips = [
      { x: -hw - 4, y: -hh - 4 },
      { x: hw + 4, y: -hh - 4 },
      { x: hw + 4, y: hh + 4 },
      { x: -hw - 4, y: hh + 4 },
    ];
    ctx.fillStyle = reticleColor;
    for (const p of pips) {
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    ctx.restore();

    // Non-color-only status badge above selected damaged/prebuilt/bullseye piece
    if (
      cond === 'BROKEN' ||
      cond === 'CRACKED' ||
      selectedPiece.isPrebuilt ||
      selectedPiece.type === 'bullseye_block'
    ) {
      ctx.save();
      const label =
        cond === 'BROKEN'
          ? '⚡ BROKEN DEBRIS (NON-REUSABLE)'
          : cond === 'CRACKED'
            ? '⚠️ CRACKED (LOCKED IN PLACE)'
            : selectedPiece.type === 'bullseye_block'
              ? selectedPiece.bullseyeExpired
                ? '🗿 BULLSEYE SPENT (NORMAL STONE BLOCK)'
                : '🎯 BULLSEYE BLOCK (DRAWS NEXT REACHABLE SHOT)'
              : '⚓ ANCIENT FOUNDATION (FIXED)';
      ctx.font = '700 10px system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const bx = selectedPiece.position.x - tw / 2 - 8;
      const by = selectedPiece.position.y - hh - 26;

      ctx.fillStyle =
        cond === 'BROKEN'
          ? 'rgba(127, 29, 29, 0.94)'
          : cond === 'CRACKED'
            ? 'rgba(120, 53, 15, 0.94)'
            : selectedPiece.type === 'bullseye_block' && !selectedPiece.bullseyeExpired
              ? 'rgba(76, 5, 25, 0.94)'
              : 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle =
        selectedPiece.type === 'bullseye_block' && !selectedPiece.bullseyeExpired
          ? '#f43f5e'
          : reticleColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 16, 19, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 8, by + 9.5);
      ctx.restore();
    }
  }
}

/**
 * Renders distinct world-space tutorial placement suggestion (ghost piece, dashed region,
 * downward placement arrow, and support-socket callouts) during Guided Lesson Steps 1-4.
 */
export function renderTutorialGuidanceOverlay(
  ctx: CanvasRenderingContext2D,
  tutorialState: AuthoritativeTutorialState,
  timeSec: number,
  reducedMotion = false,
): void {
  if (tutorialState.guidanceSkipped || tutorialState.basicLessonComplete) return;
  const region = tutorialState.currentSuggestedPlacementRegion;
  if (!region) return;

  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(timeSec * 3.8);
  const hw = region.width / 2;
  const hh = region.height / 2;
  const cx = region.center.x;
  const cy = region.center.y;

  ctx.save();

  // 1. Subtle tolerance zone spotlight halo
  const haloGrad = ctx.createRadialGradient(
    cx,
    cy,
    12,
    cx,
    cy,
    region.toleranceRadius,
  );
  haloGrad.addColorStop(0, `rgba(45, 212, 191, ${0.14 + pulse * 0.08})`);
  haloGrad.addColorStop(0.7, 'rgba(45, 212, 191, 0.04)');
  haloGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, region.toleranceRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2. Translucent ghost piece at suggested placement
  renderPiece(
    ctx,
    region.pieceType,
    region.center,
    0,
    false,
    false,
    false,
    0.34 + pulse * 0.12,
  );

  // 3. Distinct double-dashed tutorial placement frame (Teal-Emerald tutorial motif)
  ctx.strokeStyle = `rgba(94, 234, 212, ${0.75 + pulse * 0.25})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 4]);
  ctx.strokeRect(cx - hw - 5, cy - hh - 5, region.width + 10, region.height + 10);
  ctx.setLineDash([]);

  // Corner brackets so highlight does not rely on color alone
  const bLen = 8;
  const corners = [
    { x: cx - hw - 5, y: cy - hh - 5, dx: bLen, dy: bLen },
    { x: cx + hw + 5, y: cy - hh - 5, dx: -bLen, dy: bLen },
    { x: cx + hw + 5, y: cy + hh + 5, dx: -bLen, dy: -bLen },
    { x: cx - hw - 5, y: cy + hh + 5, dx: bLen, dy: -bLen },
  ];
  ctx.strokeStyle = '#ccfbf1';
  ctx.lineWidth = 2.2;
  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x + c.dx, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.dy);
    ctx.stroke();
  }

  // 4. Support-point diamond callouts on nearby columns/bedrock
  for (let i = 0; i < region.supportPoints.length; i++) {
    const sp = region.supportPoints[i];
    const isPrimary = i === 0;
    const r = isPrimary ? 8 + pulse * 2.5 : 6;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = isPrimary ? 'rgba(20, 184, 166, 0.35)' : 'rgba(56, 189, 248, 0.22)';
    ctx.strokeStyle = isPrimary ? '#5eead4' : '#7dd3fc';
    ctx.lineWidth = isPrimary ? 2 : 1.4;
    ctx.fillRect(-r / 2, -r / 2, r, r);
    ctx.strokeRect(-r / 2, -r / 2, r, r);
    ctx.restore();
  }

  // 5. Downward Placement Arrow & Tutorial Label Badge above ghost piece
  const bounceY = reducedMotion ? 0 : Math.sin(timeSec * 4.5) * 4;
  const arrowTipY = cy - hh - 12 + bounceY;
  const arrowTopY = arrowTipY - 18;

  ctx.strokeStyle = '#5eead4';
  ctx.fillStyle = '#5eead4';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, arrowTopY);
  ctx.lineTo(cx, arrowTipY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 6, arrowTipY - 6);
  ctx.lineTo(cx, arrowTipY + 1);
  ctx.lineTo(cx + 6, arrowTipY - 6);
  ctx.closePath();
  ctx.fill();

  const badgeText =
    tutorialState.currentGuidedStep === 'STEP_4_CREATE_SUPPORT'
      ? '✦ ALIGN TO GLOWING SUPPORT POINT'
      : region.pieceType === 'wood_beam'
        ? '✦ SUGGESTED: ROOF BEAM SPAN'
        : '✦ SUGGESTED: SUPPORT BLOCK';
  ctx.font = '700 10px system-ui, sans-serif';
  const tw = ctx.measureText(badgeText).width;
  const bx = cx - tw / 2 - 8;
  const by = arrowTopY - 22;

  ctx.fillStyle = 'rgba(4, 47, 46, 0.92)';
  ctx.strokeStyle = '#2dd4bf';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(bx, by, tw + 16, 18, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ccfbf1';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, bx + 8, by + 9);

  ctx.restore();
}

