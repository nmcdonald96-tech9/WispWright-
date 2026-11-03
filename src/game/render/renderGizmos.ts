/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import { getPieceSnapSocketsForTransform, Vec2 } from '../math/geometry';
import { validateWispPlacementPosition, WISP_SANCTUARY_ZONE } from '../math/wispPlacement';
import {
  AuthoritativeTutorialState,
  DragState,
  EnvironmentalAnchor,
  GameMode,
  PlacedPiece,
  RotationValidationDiagnostics,
  TimberJoint,
  Vector2,
  WispDragState,
  WispEntity,
} from '../types';
import { renderPiece } from './renderPieces';

export function renderTimberJoints(
  ctx: CanvasRenderingContext2D,
  joints: TimberJoint[] | undefined,
  pieces: Array<{ id?: string; pieceId?: string; position: Vector2; rotation: number }>,
  isSimulation: boolean,
  timeSec: number,
  reducedMotion = false,
  isDeveloperMode = false,
): void {
  if (!joints || joints.length === 0) return;

  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(timeSec * 5.2);

  for (const joint of joints) {
    if (joint.state === 'BROKEN') {
      // Brief splinter & dust burst for 1.2s after a joint breaks in simulation
      if (
        isSimulation &&
        joint.breakPosition &&
        joint.breakTimestamp &&
        Date.now() - joint.breakTimestamp < 1200
      ) {
        const elapsed = (Date.now() - joint.breakTimestamp) / 1200;
        const alpha = Math.max(0, 1 - elapsed);
        const bp = joint.breakPosition;
        ctx.save();
        ctx.translate(bp.x, bp.y);
        ctx.globalAlpha = alpha;

        // Expanding dust ring
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.75)';
        ctx.lineWidth = 1.8 * (1 - elapsed * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, 6 + elapsed * 22, 0, Math.PI * 2);
        ctx.stroke();

        // Radial wood splinters
        const splinterAngles = [0.2, 1.1, 2.0, 2.9, 3.8, 4.9, 5.7];
        ctx.fillStyle = '#d97706';
        for (let i = 0; i < splinterAngles.length; i++) {
          const ang = splinterAngles[i];
          const dist = 4 + elapsed * (16 + (i % 3) * 5);
          ctx.save();
          ctx.translate(Math.cos(ang) * dist, Math.sin(ang) * dist);
          ctx.rotate(ang + elapsed * 2.2);
          ctx.fillRect(-3.5, -1.2, 7, 2.4);
          ctx.restore();
        }
        ctx.restore();
      }
      continue;
    }

    const pieceA = pieces.find((p) => (p.id ?? p.pieceId) === joint.pieceAId);
    const pieceB = pieces.find((p) => (p.id ?? p.pieceId) === joint.pieceBId);
    if (!pieceA || !pieceB) continue;

    const worldA = Vec2.add(pieceA.position, Vec2.rotate(joint.localAnchorA, pieceA.rotation));
    const worldB = Vec2.add(pieceB.position, Vec2.rotate(joint.localAnchorB, pieceB.rotation));
    const midX = (worldA.x + worldB.x) * 0.5;
    const midY = (worldA.y + worldB.y) * 0.5;
    const isStrained = joint.state === 'STRAINED';
    const isRoofPeak = joint.jointType === 'ROOF_PEAK' || joint.visualJointCapType === 'PEAK_CAP';
    const isBrace = joint.jointType === 'DIAGONAL_BRACE';
    const isAlchemical =
      joint.visualJointCapType === 'ALCHEMICAL_CLAMP' ||
      joint.materialPairKey === 'WOOD_STONE' ||
      joint.materialPairKey === 'WOOD_ENVIRONMENT';
    const isMasonry =
      joint.visualJointCapType === 'MASONRY_SEAM' ||
      joint.materialPairKey === 'STONE_STONE' ||
      joint.materialPairKey === 'STONE_ENVIRONMENT';

    ctx.save();

    // Connecting binding strap between the two joined sockets
    ctx.strokeStyle = isStrained
      ? `rgba(245, 158, 11, ${0.85 + pulse * 0.15})`
      : isRoofPeak
        ? 'rgba(56, 189, 248, 0.88)'
        : isAlchemical
          ? 'rgba(192, 132, 252, 0.9)'
          : isMasonry
            ? 'rgba(148, 163, 184, 0.9)'
            : isBrace
              ? 'rgba(16, 185, 129, 0.88)'
              : 'rgba(45, 212, 191, 0.82)';
    ctx.lineWidth = isStrained ? 3.2 : 2.5;
    ctx.beginPath();
    ctx.moveTo(worldA.x, worldA.y);
    ctx.lineTo(worldB.x, worldB.y);
    ctx.stroke();

    // Joinery gusset plate / apex cap / alchemical clamp / masonry glyph at midpoint
    ctx.translate(midX, midY);
    if (isStrained) {
      // Strain warning halo
      ctx.fillStyle = `rgba(245, 158, 11, ${0.22 + pulse * 0.16})`;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + pulse * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isRoofPeak) {
      // Roof peak chevron ridge cap
      ctx.fillStyle = isStrained ? '#f59e0b' : '#38bdf8';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(6.5, 4);
      ctx.lineTo(-6.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (isAlchemical) {
      // Wood-to-Stone Alchemical Clamp / glowing purple-cyan rune band
      ctx.fillStyle = isStrained ? '#f59e0b' : '#c084fc';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, isStrained ? 5.6 : 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (isMasonry) {
      // Stone-to-Stone Mortar Seam / Masonry Glyph
      ctx.fillStyle = isStrained ? '#f59e0b' : '#94a3b8';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.fillRect(-5.2, -3.2, 10.4, 6.4);
      ctx.strokeRect(-5.2, -3.2, 10.4, 6.4);
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = isStrained ? '#f59e0b' : isBrace ? '#10b981' : '#14b8a6';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      const r = isStrained ? 5 : 4.2;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.rotate(-Math.PI / 4);
    }

    if (isDeveloperMode) {
      ctx.font = '700 8.5px monospace';
      ctx.fillStyle = isStrained ? '#fde68a' : '#99f6e4';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${joint.jointType} · ${joint.materialPairKey ?? 'WOOD_WOOD'} · ${joint.state} (${joint.currentStress.toFixed(1)})`,
        0,
        -10,
      );
    }

    ctx.restore();
  }
}

export function renderGizmos(
  ctx: CanvasRenderingContext2D,
  dragState: DragState | null,
  selectedPiece: PlacedPiece | null,
  touchContactWorldPos?: Vector2,
  isDeveloperMode = false,
  rotationDiagnostics?: RotationValidationDiagnostics | null,
  allPieces?: PlacedPiece[],
  wisps?: WispEntity[],
): void {
  // 1. Render Active Drag Ghost & Overlap Status
  if (dragState) {
    const config = MATERIAL_CONFIGS[dragState.pieceType];
    const hw = config.width / 2;
    const hh = config.height / 2;
    const pos = dragState.currentWorldPos;
    const rot = dragState.rotation;
    const scale = dragState.ghostPresentationScale ?? 1.0;
    const isInTray =
      dragState.inventoryLiftState === 'UI_LIFT' ||
      dragState.inventoryLiftState === 'RETURNING_TO_INVENTORY';

    // Lift offset tether line (if finger touch position is provided)
    if (touchContactWorldPos) {
      ctx.save();
      ctx.strokeStyle = isInTray ? 'rgba(45, 212, 191, 0.55)' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(touchContactWorldPos.x, touchContactWorldPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      // Touch contact reticle
      ctx.fillStyle = isInTray ? 'rgba(45, 212, 191, 0.35)' : 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.arc(touchContactWorldPos.x, touchContactWorldPos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Snap Connector Guide & Endpoint Socket Highlight
    if (dragState.activeSnap && !isInTray) {
      const snapSock = dragState.activeSnap.socket;
      ctx.save();
      const isAnchor = snapSock.type === 'anchor';
      const isTimberJoint = dragState.connectionCategory === 'TIMBER_JOINT';
      const isEndpoint =
        dragState.activeSnap.pieceSocket?.socketKind === 'beam_end' ||
        snapSock.socketKind === 'beam_end';
      const snapColor = isAnchor
        ? '#38bdf8'
        : isTimberJoint
          ? '#10b981'
          : isEndpoint
            ? '#2dd4bf'
            : '#fbbf24';

      ctx.strokeStyle = snapColor;
      ctx.lineWidth = isTimberJoint ? 2.6 : 2.2;
      ctx.beginPath();
      ctx.arc(
        snapSock.worldPos.x,
        snapSock.worldPos.y,
        isTimberJoint ? 11 : isEndpoint ? 9 : 8,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      // Inner socket dot for active endpoint connection
      ctx.fillStyle = snapColor;
      ctx.beginPath();
      ctx.arc(snapSock.worldPos.x, snapSock.worldPos.y, isTimberJoint ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Magnetic connection pulse line
      ctx.beginPath();
      ctx.moveTo(snapSock.worldPos.x, snapSock.worldPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
    }

    // Ghost Piece Body (scaled smoothly from miniature card scale to world scale)
    ctx.save();
    if (Math.abs(scale - 1.0) > 0.005) {
      ctx.translate(pos.x, pos.y);
      ctx.scale(scale, scale);
      ctx.translate(-pos.x, -pos.y);
    }
    renderPiece(
      ctx,
      dragState.pieceType,
      pos,
      rot,
      false,
      true,
      false,
      isInTray ? 0.9 : dragState.isValidPlacement ? 0.88 : 0.62,
    );
    ctx.restore();

    // Render Beam Endpoint & Side Socket Pips on Ghost (so player sees where beam ends snap)
    if (dragState.pieceType === 'wood_beam' && !isInTray) {
      const ghostSockets = getPieceSnapSocketsForTransform(
        dragState.pieceType,
        pos,
        rot,
        'ghost',
      );
      ctx.save();
      for (const gs of ghostSockets) {
        const isPrimarySocket =
          gs.localName === 'END_A_CENTER' ||
          gs.localName === 'END_B_CENTER' ||
          gs.localName === 'SIDE_TOP_CENTER' ||
          gs.localName === 'SIDE_BOTTOM_CENTER';
        if (!isPrimarySocket && !isDeveloperMode) continue;

        const isActivePieceSock =
          dragState.activeSnap?.pieceSocket?.localName === gs.localName;
        const isEnd = gs.socketKind === 'beam_end';

        ctx.fillStyle = isActivePieceSock
          ? '#10b981'
          : isEnd
            ? 'rgba(56, 189, 248, 0.85)'
            : 'rgba(251, 191, 36, 0.7)';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(
          gs.worldPos.x,
          gs.worldPos.y,
          isActivePieceSock ? 5.5 : isEnd ? 3.8 : 3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Proposed Rotation Preview Ghost Outline (if socket proposes a different angle than player preference)
    if (
      !isInTray &&
      dragState.activeSnap?.requiresRotationChange &&
      dragState.activeSnap.proposedAngle !== undefined
    ) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(dragState.activeSnap.proposedAngle);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-hw, -hh, config.width, config.height);
      ctx.restore();
    }

    if (isInTray) {
      // Tray Lift / Return Feedback Badge
      ctx.save();
      ctx.font = '700 10px system-ui, sans-serif';
      const badgeText =
        dragState.inventoryLiftState === 'RETURNING_TO_INVENTORY'
          ? '↩ RELEASE TO RETURN TO TRAY (NO COST)'
          : '↑ DRAG UP INTO BATTLEFIELD';
      const textWidth = ctx.measureText(badgeText).width;
      const bx = pos.x - textWidth / 2 - 8;
      const by = pos.y - hh * scale - 24;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(bx, by, textWidth + 16, 19, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ccfbf1';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 8, by + 9.5);
      ctx.restore();
    } else if (!dragState.isValidPlacement) {
      // Invalid Overlap / Warning Hash Overlay
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rot);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.fillRect(-hw, -hh, config.width, config.height);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(-hw, -hh, config.width, config.height);
      ctx.restore();

      // Warning Badge (Player-friendly vs Developer diagnostic specificity)
      ctx.save();
      ctx.font = '700 10.5px system-ui, sans-serif';
      const friendlyMsg =
        dragState.playerFriendlyRejectionMessage || 'Blocked by another piece';
      const badgeText = isDeveloperMode
        ? `🚫 ${dragState.placementRejectionReason || 'BLOCKED'} [${dragState.overlapClassification || 'OVERLAP'} · ${dragState.overlapColliderId || 'bounds'} · ${(dragState.penetrationDepth ?? 0).toFixed(1)}px]`
        : `🚫 ${friendlyMsg}`;
      const textWidth = ctx.measureText(badgeText).width;
      const bx = pos.x - textWidth / 2 - 8;
      const by = pos.y - Math.max(hw, hh) - 22;

      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.2;
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
      // Valid Snap Badge: clearly distinguish Environmental Anchor, Roof Peak, Diagonal Brace, Timber Splice, Timber Face, T-Joint, Supported Contact, and Position Snap
      ctx.save();
      const isAnchor = dragState.activeSnap.socket.type === 'anchor';
      const isTimberJoint = dragState.connectionCategory === 'TIMBER_JOINT';
      const isRotMismatch = Boolean(dragState.activeSnap.requiresRotationChange);
      const currDeg = Math.round(((dragState.rotation * 180) / Math.PI) % 360);
      const normCurrDeg = currDeg < 0 ? currDeg + 360 : currDeg;
      const compat = dragState.activeSnap.compatibilityLabel || 'SURFACE_CONTACT';
      const taxonomy = dragState.connectionTaxonomy || 'SUPPORTED_CONTACT';
      const jointCount = dragState.proposedTimberJoints?.length ?? (dragState.proposedTimberJoint ? 1 : 0);

      // Render Balanced Peak Adjustment Partner Preview Outline when active
      if (
        dragState.balancedAdjustmentActive &&
        dragState.partnerPieceAdjustment &&
        allPieces
      ) {
        const partner = allPieces.find((p) => p.id === dragState.partnerPieceAdjustment?.pieceId);
        if (partner) {
          const pCfg = MATERIAL_CONFIGS[partner.type];
          const adjPos =
            dragState.partnerPieceAdjustment.afterPos ??
            dragState.partnerPieceAdjustment.proposedPosition ??
            partner.position;
          ctx.save();
          ctx.translate(adjPos.x, adjPos.y);
          ctx.rotate(partner.rotation);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.strokeRect(-pCfg.width / 2, -pCfg.height / 2, pCfg.width, pCfg.height);
          ctx.restore();
        }
      }

      // Highlight secondary proposed joint endpoints if a piece links at both ends
      if (dragState.proposedTimberJoints && dragState.proposedTimberJoints.length > 1) {
        for (const pj of dragState.proposedTimberJoints) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(pj.worldPosition.x, pj.worldPosition.y, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      let badgeText: string;
      let bgColor = 'rgba(67, 20, 7, 0.92)';
      let borderColor = '#f59e0b';
      let textColor = '#fef3c7';

      if (isAnchor) {
        if (dragState.explicitJointProposed) {
          badgeText = '⚓ BEDROCK ANCHOR (STRONG RIGID WELD)';
          bgColor = 'rgba(8, 47, 73, 0.95)';
          borderColor = '#38bdf8';
          textColor = '#e0f2fe';
        } else {
          badgeText = `⚓ ANCHOR SUPPORT (${normCurrDeg}° UPRIGHT POST)`;
          bgColor = 'rgba(13, 148, 136, 0.92)';
          borderColor = '#2dd4bf';
          textColor = '#ccfbf1';
        }
      } else if (isTimberJoint) {
        let jointLabel = 'TIMBER JOINT';
        if (taxonomy === 'ROOF_PEAK') {
          if (dragState.roofSupportSummary) {
            jointLabel = dragState.roofSupportSummary.summaryMessage.toUpperCase();
          } else {
            jointLabel = dragState.lowerSupportsDetected
              ? 'ROOF PEAK (SUPPORTED APEX)'
              : 'ROOF PEAK (NEEDS LOWER SUPPORTS)';
          }
        } else if (taxonomy === 'TIMBER_CORNER') {
          jointLabel = 'TIMBER CORNER JOINT';
        } else if (taxonomy === 'RAFTER_CORNER_SEAT') {
          jointLabel = 'CORNER JOINT';
        } else if (taxonomy === 'DIAGONAL_BRACE') {
          jointLabel = jointCount > 1 ? `BRACE JOINT (${jointCount} ENDS LINKED)` : 'BRACE JOINT';
        } else if (taxonomy === 'TIMBER_SPLICE') {
          jointLabel = 'TIMBER SPLICE';
        } else if (taxonomy === 'TIMBER_T_JOINT') {
          jointLabel = 'TIMBER T-JOINT';
        } else if (taxonomy === 'TIMBER_FACE') {
          jointLabel = 'TIMBER FACE JOINT';
        }
        const cycleSuffix =
          (dragState.candidateCycleCount ?? 0) > 1
            ? ` [${(dragState.candidateCycleIndex ?? 0) + 1}/${dragState.candidateCycleCount} · Tab]`
            : '';
        badgeText = isDeveloperMode
          ? `🔗 ${jointLabel}: (${normCurrDeg}° · ${dragState.activeSnap.pieceSocket?.localName}→${dragState.activeSnap.socket.localName})${cycleSuffix}`
          : `🔗 ${jointLabel} (${normCurrDeg}°)${cycleSuffix}`;
        bgColor = taxonomy === 'ROOF_PEAK' ? 'rgba(8, 47, 73, 0.95)' : 'rgba(6, 78, 59, 0.95)';
        borderColor = taxonomy === 'ROOF_PEAK' ? '#38bdf8' : '#10b981';
        textColor = taxonomy === 'ROOF_PEAK' ? '#e0f2fe' : '#d1fae5';
      } else if (taxonomy === 'RAFTER_CORNER_SEAT') {
        badgeText = isDeveloperMode
          ? `✦ CORNER SUPPORTED (${compat} · ${normCurrDeg}°)`
          : `✦ CORNER SUPPORTED (${normCurrDeg}°)`;
        bgColor = 'rgba(67, 20, 7, 0.92)';
        borderColor = '#f59e0b';
        textColor = '#fef3c7';
      } else if (
        compat === 'BEAM_END_TO_BLOCK_EDGE' ||
        compat === 'BLOCK_EDGE_TO_BEAM_END'
      ) {
        badgeText = isDeveloperMode
          ? `✦ SUPPORTED CONTACT (${compat} · ${normCurrDeg}°)`
          : `✦ SUPPORTED CONTACT (${normCurrDeg}°)`;
        bgColor = 'rgba(67, 20, 7, 0.92)';
        borderColor = '#f59e0b';
        textColor = '#fef3c7';
      } else if (isRotMismatch) {
        badgeText = `✦ POSITION SNAP (${normCurrDeg}° PRESERVED)`;
        bgColor = 'rgba(15, 23, 42, 0.95)';
        borderColor = '#38bdf8';
        textColor = '#bae6fd';
      } else {
        badgeText = `✦ SUPPORTED CONTACT (${normCurrDeg}°)`;
        bgColor = 'rgba(67, 20, 7, 0.92)';
        borderColor = '#f59e0b';
        textColor = '#fef3c7';
      }

      ctx.font = '700 10px system-ui, sans-serif';
      const textWidth = ctx.measureText(badgeText).width;
      const bx = pos.x - textWidth / 2 - 8;
      const by = pos.y - Math.max(hw * Math.abs(Math.sin(rot)) + hh * Math.abs(Math.cos(rot)), hh) - 22;

      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(bx, by, textWidth + 16, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 8, by + 10);
      ctx.restore();
    }
  }

  // 2. Selected Piece Reticle & Endpoint Socket Indicators
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

    // Render Beam Endpoint Sockets on selected beam so player sees available top/bottom/end sockets
    if (selectedPiece.type === 'wood_beam' && cond !== 'BROKEN') {
      const selSockets = getPieceSnapSocketsForTransform(
        selectedPiece.type,
        selectedPiece.position,
        selectedPiece.rotation,
        selectedPiece.id,
      );
      ctx.save();
      for (const ss of selSockets) {
        const isPrimary =
          ss.localName === 'END_A_CENTER' ||
          ss.localName === 'END_B_CENTER' ||
          ss.localName === 'SIDE_TOP_CENTER' ||
          ss.localName === 'SIDE_BOTTOM_CENTER';
        if (!isPrimary && !isDeveloperMode) continue;

        ctx.fillStyle =
          ss.socketKind === 'beam_end' ? '#2dd4bf' : 'rgba(251, 191, 36, 0.85)';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ss.worldPos.x, ss.worldPos.y, ss.socketKind === 'beam_end' ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

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

    // 3. Rejected Rotation Preview & Conflicting Collider Highlight (shown briefly after a blocked rotation)
    const showRejectedRotation =
      rotationDiagnostics &&
      !rotationDiagnostics.rotationAccepted &&
      rotationDiagnostics.selectedPieceId === selectedPiece.id &&
      Date.now() - rotationDiagnostics.timestamp < 2400;

    if (showRejectedRotation && rotationDiagnostics) {
      // Highlight conflicting piece or placed wisp if identified
      if (rotationDiagnostics.conflictingColliderId && allPieces) {
        const conflictPiece = allPieces.find(
          (p) => p.id === rotationDiagnostics.conflictingColliderId,
        );
        if (conflictPiece) {
          const cCfg = MATERIAL_CONFIGS[conflictPiece.type];
          ctx.save();
          ctx.translate(conflictPiece.position.x, conflictPiece.position.y);
          ctx.rotate(conflictPiece.rotation);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fillRect(-cCfg.width / 2, -cCfg.height / 2, cCfg.width, cCfg.height);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(-cCfg.width / 2 - 2, -cCfg.height / 2 - 2, cCfg.width + 4, cCfg.height + 4);
          ctx.restore();
        }
      }
      if (rotationDiagnostics.conflictingColliderId && wisps) {
        const conflictWisp = wisps.find(
          (w) => w.placed === true && w.id === rotationDiagnostics.conflictingColliderId,
        );
        if (conflictWisp) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            conflictWisp.position.x,
            conflictWisp.position.y,
            conflictWisp.radius + 9,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
          ctx.fill();
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw rejected proposed rotated outline in dashed red while piece stays at committed angle
      ctx.save();
      ctx.translate(selectedPiece.position.x, selectedPiece.position.y);
      ctx.rotate(rotationDiagnostics.proposedAngle);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fillRect(-hw, -hh, config.width, config.height);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(-hw, -hh, config.width, config.height);
      ctx.setLineDash([]);
      ctx.restore();

      // Concise Rotation Blocked Badge
      ctx.save();
      ctx.font = '700 10.5px system-ui, sans-serif';
      const friendlyMsg =
        rotationDiagnostics.playerFriendlyMessage || 'Rotation blocked by another piece.';
      const rotBadgeText = isDeveloperMode
        ? `🚫 ${rotationDiagnostics.lastRejectionReason} [${rotationDiagnostics.conflictingColliderId || 'collider'} · ${rotationDiagnostics.penetrationDepth.toFixed(1)}px]`
        : `🚫 ${friendlyMsg}`;
      const rtw = ctx.measureText(rotBadgeText).width;
      const rbx = selectedPiece.position.x - rtw / 2 - 8;
      const rby = selectedPiece.position.y - Math.max(hw, hh) - 28;

      ctx.fillStyle = 'rgba(127, 29, 29, 0.96)';
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(rbx, rby, rtw + 16, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fee2e2';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(rotBadgeText, rbx + 8, rby + 10);
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

/**
 * Renders wisp clearance volumes during construction/reinforcement and the valid sanctuary
 * placement region, wisp protection badges, and active wisp placement ghost during PLACE_WISPS / PRE_SIEGE_REVIEW.
 */
export function renderWispClearanceAndPlacementOverlay(
  ctx: CanvasRenderingContext2D,
  wisps: WispEntity[],
  dragState: DragState | null,
  wispDragState: WispDragState | null,
  selectedWispId: string | null,
  mode: GameMode,
  timeSec: number,
  reducedMotion = false,
  pieces: PlacedPiece[] = [],
  anchors: EnvironmentalAnchor[] = [],
): void {
  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(timeSec * 3.6);
  const isWispPhase = mode === 'PLACE_WISPS' || mode === 'PRE_SIEGE_REVIEW';

  ctx.save();

  // 1. During Reinforcement (when surviving wisps have placed === true): show wisp clearance volumes when dragging a piece.
  // During BUILD, wisps have placed === false, so zero wisp clearance circles are rendered.
  if (!isWispPhase && dragState) {
    const isWispOverlap = dragState.placementRejectionReason === 'WISP_OVERLAP';
    for (const wisp of wisps) {
      if (wisp.isDispersed || wisp.placed !== true) continue;
      const isCollidingThisWisp =
        isWispOverlap && dragState.overlapColliderId === wisp.id;
      const r = wisp.radius + 7.5;

      ctx.save();
      ctx.beginPath();
      ctx.arc(wisp.position.x, wisp.position.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isCollidingThisWisp
        ? `rgba(239, 68, 68, ${0.28 + pulse * 0.14})`
        : 'rgba(56, 189, 248, 0.08)';
      ctx.fill();
      ctx.lineWidth = isCollidingThisWisp ? 2.2 : 1.2;
      ctx.strokeStyle = isCollidingThisWisp
        ? '#f87171'
        : 'rgba(125, 211, 252, 0.45)';
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 2. During PLACE_WISPS and PRE_SIEGE_REVIEW: render valid sanctuary placement zone & wisp status
  if (isWispPhase) {
    const z = WISP_SANCTUARY_ZONE;
    const zw = z.maxX - z.minX;
    const zh = z.maxY - z.minY;

    // Subtle sanctuary zone fill and dashed boundary
    ctx.fillStyle =
      mode === 'PLACE_WISPS'
        ? `rgba(20, 184, 166, ${0.04 + pulse * 0.02})`
        : 'rgba(56, 189, 248, 0.03)';
    ctx.fillRect(z.minX, z.minY, zw, zh);

    ctx.strokeStyle =
      mode === 'PLACE_WISPS'
        ? `rgba(45, 212, 191, ${0.55 + pulse * 0.25})`
        : 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(z.minX, z.minY, zw, zh);
    ctx.setLineDash([]);

    // Zone header label at top of sanctuary region
    const headerLabel =
      mode === 'PLACE_WISPS'
        ? `✦ VALID WISP SANCTUARY REGION — DRAG OR TAP TO PLACE ALL ${wisps.length} WISPS`
        : '✦ PRE-SIEGE SANCTUARY FORMATION LOCKED FOR REVIEW';
    ctx.font = '700 10px system-ui, sans-serif';
    const htw = ctx.measureText(headerLabel).width;
    const hbx = (z.minX + z.maxX) / 2 - htw / 2 - 10;
    const hby = z.minY - 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = mode === 'PLACE_WISPS' ? '#2dd4bf' : '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(hbx, hby, htw + 20, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ccfbf1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(headerLabel, hbx + 10, hby + 9);

    // Render default slot reticles for unplaced wisps (only if not blocked by a player-built piece) and protection badges for placed wisps
    for (const wisp of wisps) {
      if (wisp.placed !== true) {
        const defPos = wisp.defaultPosition ?? wisp.position;
        const slotValidation = validateWispPlacementPosition(
          wisp.id,
          defPos,
          wisps,
          pieces,
          anchors,
        );
        if (!slotValidation.isValid) {
          // Do not suggest a default slot that is blocked by a placed fortress piece
          continue;
        }
        const isSelected = selectedWispId === wisp.id;
        ctx.save();
        ctx.beginPath();
        ctx.arc(defPos.x, defPos.y, wisp.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? `rgba(45, 212, 191, ${0.18 + pulse * 0.1})`
          : 'rgba(15, 23, 42, 0.45)';
        ctx.fill();
        ctx.lineWidth = isSelected ? 2 : 1.3;
        ctx.strokeStyle = isSelected ? '#5eead4' : wisp.color + '88';
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = '600 9px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(226, 232, 240, 0.78)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wisp.name.replace('Wisp ', ''), defPos.x, defPos.y);
        ctx.restore();
        continue;
      }

      // Skip badge on the wisp currently being dragged from world
      if (wispDragState && wispDragState.wispId === wisp.id) continue;

      const isSelected = selectedWispId === wisp.id;
      const shelter = wisp.shelterStatus ?? 'Exposed';
      const hasHeavy = Boolean(wisp.heavyOverheadHazard);
      const hasShared = Boolean(wisp.sharedCollapseRisk);

      // Selection / spacing ring around placed wisp
      ctx.save();
      ctx.beginPath();
      ctx.arc(wisp.position.x, wisp.position.y, wisp.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected
        ? '#5eead4'
        : hasHeavy
          ? 'rgba(245, 158, 11, 0.75)'
          : shelter === 'Well sheltered'
            ? 'rgba(52, 211, 153, 0.65)'
            : shelter === 'Partially sheltered'
              ? 'rgba(56, 189, 248, 0.6)'
              : 'rgba(251, 191, 36, 0.6)';
      ctx.lineWidth = isSelected ? 2.2 : 1.4;
      ctx.stroke();

      // Compact protection & hazard pill above placed wisp
      const shortName = wisp.name.replace('Wisp ', '');
      const statusIcon =
        hasHeavy
          ? '⚠ Heavy Overhead'
          : hasShared
            ? `⚡ ${shelter} (Shared)`
            : shelter === 'Well sheltered'
              ? '🛡 Well Sheltered'
              : shelter === 'Partially sheltered'
                ? '◐ Partial Shelter'
                : '○ Exposed';
      const badge = `${shortName}: ${statusIcon}`;
      ctx.font = '700 9px system-ui, sans-serif';
      const btw = ctx.measureText(badge).width;
      const bpx = wisp.position.x - btw / 2 - 6;
      const bpy = wisp.position.y - wisp.radius - 24;

      ctx.fillStyle = hasHeavy
        ? 'rgba(120, 53, 15, 0.92)'
        : hasShared
          ? 'rgba(113, 63, 18, 0.92)'
          : shelter === 'Well sheltered'
            ? 'rgba(6, 78, 59, 0.9)'
            : 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = hasHeavy
        ? '#f59e0b'
        : hasShared
          ? '#facc15'
          : shelter === 'Well sheltered'
            ? '#34d399'
            : '#38bdf8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(bpx, bpy, btw + 12, 15, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, bpx + 6, bpy + 7.5);
      ctx.restore();
    }

    // 3. Render single active Wisp Placement Ghost when dragging a wisp
    if (wispDragState) {
      const targetWisp = wisps.find((w) => w.id === wispDragState.wispId);
      const r = targetWisp?.radius ?? 14;
      const pos = wispDragState.currentWorldPos;
      const valid = wispDragState.isValidPlacement;

      ctx.save();
      ctx.translate(pos.x, pos.y);

      // Outer validation ring
      ctx.beginPath();
      ctx.arc(0, 0, r + 11, 0, Math.PI * 2);
      ctx.fillStyle = valid
        ? 'rgba(16, 185, 129, 0.22)'
        : 'rgba(239, 68, 68, 0.28)';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = valid ? '#34d399' : '#f87171';
      ctx.setLineDash(valid ? [] : [5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ghost wisp orb
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = targetWisp ? targetWisp.color + 'cc' : 'rgba(56, 189, 248, 0.8)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Ghost feedback banner above wisp ghost
      const hasWarning = Boolean(wispDragState.hazardWarning);
      const feedbackText = !valid
        ? `✕ ${wispDragState.playerFriendlyMessage || 'Invalid wisp position'}`
        : wispDragState.hazardWarning
          ? `⚠ ${wispDragState.name}: ${wispDragState.hazardWarning}`
          : `✓ ${wispDragState.name}: ${wispDragState.shelterStatus}`;
      ctx.font = '700 10px system-ui, sans-serif';
      const ftw = ctx.measureText(feedbackText).width;
      const fbx = -ftw / 2 - 8;
      const fby = -r - 34;

      ctx.fillStyle = !valid
        ? 'rgba(127, 29, 29, 0.95)'
        : hasWarning
          ? 'rgba(120, 53, 15, 0.95)'
          : 'rgba(6, 78, 59, 0.95)';
      ctx.strokeStyle = !valid
        ? '#f87171'
        : hasWarning
          ? '#fbbf24'
          : '#34d399';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(fbx, fby, ftw + 16, 19, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(feedbackText, fbx + 8, fby + 9.5);

      ctx.restore();
    }
  }

  ctx.restore();
}


