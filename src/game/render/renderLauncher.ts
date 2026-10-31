/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WORLD_CONFIG } from '../config';
import {
  HeavyAttackerAnimState,
  StandardAttackerAnimState,
} from '../presentation/presentationTypes';
import { TargetCandidate } from '../siege/targeting';
import { AuthoredAttack, Vector2 } from '../types';
import { renderGromSlagBruteBody, renderPyriteSparkBody } from './renderProjectiles';

export function sampleBallisticTrajectory(
  spawnPos: Vector2,
  launchVel: Vector2,
  steps = 26,
  dtSec = 0.08,
): Vector2[] {
  const points: Vector2[] = [];
  const stepMs = 1000 / 60;
  const stepSec = 1 / 60;
  const gravityScale = 0.001;
  const airFriction = 0.003;
  const accelPerStepY = WORLD_CONFIG.gravity * gravityScale * (stepMs * stepMs);

  let x = spawnPos.x;
  let y = spawnPos.y;
  let vxStep = launchVel.x * stepSec;
  let vyStep = launchVel.y * stepSec;

  const totalSimSteps = Math.ceil((steps * dtSec) / stepSec);
  const sampleInterval = Math.max(1, Math.floor(dtSec / stepSec));

  points.push({ x, y });
  for (let s = 1; s <= totalSimSteps; s++) {
    vyStep += accelPerStepY;
    vxStep *= 1 - airFriction;
    vyStep *= 1 - airFriction;
    x += vxStep;
    y += vyStep;
    if (s % sampleInterval === 0) {
      points.push({ x, y });
    }
    if (y > WORLD_CONFIG.groundY + 20) break;
  }
  return points;
}

export function renderLauncher(
  ctx: CanvasRenderingContext2D,
  currentAttack: AuthoredAttack | null,
  showTrajectory: boolean,
  isIntro: boolean,
  timeSec: number,
  currentTarget?: TargetCandidate | null,
  standardState: StandardAttackerAnimState = 'IDLE_WAIT',
  heavyState: HeavyAttackerAnimState = 'HEAVY_IDLE',
  launcherStrain = 0,
  reducedMotion = false,
  isDeveloperMode = false,
): void {
  const spawnX = currentAttack?.spawnPosition.x ?? -460;
  const spawnY = currentAttack?.spawnPosition.y ?? 640;
  const groundY = WORLD_CONFIG.groundY;
  const isHeavy = currentAttack?.attackerType === 'heavy';
  const animTime = reducedMotion ? 0 : timeSec;

  ctx.save();

  // 1. Render Ballistic Trajectory Preview & Target Glyph
  if (showTrajectory && currentAttack) {
    const pts = sampleBallisticTrajectory(
      currentAttack.spawnPosition,
      currentAttack.launchVelocity,
      34,
      0.07,
    );

    ctx.save();
    ctx.strokeStyle = isHeavy
      ? 'rgba(239, 68, 68, 0.55)'
      : 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = isHeavy ? 3.2 : 2.4;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -animTime * 28;

    ctx.beginPath();
    pts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Glowing alchemical arc nodes along trajectory
    ctx.setLineDash([]);
    for (let i = 2; i < pts.length; i += 3) {
      const pt = pts[i];
      const alpha = Math.max(0.12, 0.82 - i / pts.length);
      ctx.fillStyle = isHeavy
        ? `rgba(248, 113, 113, ${alpha})`
        : `rgba(251, 191, 36, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isHeavy ? 4.0 : 3.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Expressive Alchemical Target Glyph on the selected fortress objective
    if (currentTarget) {
      const tx = currentTarget.position.x;
      const ty = currentTarget.position.y;
      const pulse = 1 + 0.14 * Math.sin(animTime * 6);
      const primaryColor = isHeavy ? '#ef4444' : '#f59e0b';
      const glowFill = isHeavy
        ? 'rgba(239, 68, 68, 0.16)'
        : 'rgba(245, 158, 11, 0.16)';

      ctx.save();
      ctx.translate(tx, ty);

      // Soft target acknowledgment aura
      ctx.fillStyle = glowFill;
      ctx.beginPath();
      ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Outer alchemical target ring
      const isBullseyeTarget = currentTarget.material === 'bullseye_block';
      ctx.strokeStyle = isBullseyeTarget ? '#f43f5e' : primaryColor;
      ctx.lineWidth = isBullseyeTarget ? 3.0 : 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, (isBullseyeTarget ? 24 : 20) * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Inner bullseye diamond glyph
      ctx.save();
      ctx.rotate(animTime * 0.8);
      ctx.strokeStyle = isBullseyeTarget ? '#fde047' : isHeavy ? '#fca5a5' : '#fde68a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Four inward-pointing threat chevrons
      for (let c = 0; c < 4; c++) {
        ctx.save();
        ctx.rotate((c * Math.PI) / 2);
        const d = 24 * pulse;
        ctx.fillStyle = isBullseyeTarget ? '#f43f5e' : primaryColor;
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + 6, -4);
        ctx.lineTo(d + 6, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Raw target ID badge is ONLY shown in Developer Presentation mode
      if (isDeveloperMode) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1.2;
        ctx.fillRect(-72, -44, 144, 18);
        ctx.strokeRect(-72, -44, 144, 18);
        ctx.fillStyle = isHeavy ? '#fca5a5' : '#fde68a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`TARGET: ${currentTarget.id}`, 0, -32);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // 2. Render Original Alchemical Arcane-Pneumatic Siege Launcher (Centered on spawnPosition)
  ctx.save();
  ctx.translate(spawnX, groundY);

  const strainBend = isHeavy ? launcherStrain * 10 : launcherStrain * 4.5;
  const platformShakeX =
    isHeavy && launcherStrain > 0.65 && !reducedMotion
      ? Math.sin(animTime * 42) * 1.8
      : 0;

  ctx.translate(platformShakeX, 0);

  // Heavy Basalt & Brass Pedestal Base
  ctx.fillStyle = '#272030';
  ctx.strokeStyle = '#5d4e70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-58, 0);
  ctx.lineTo(-44, -36);
  ctx.lineTo(44, -36);
  ctx.lineTo(58, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pressure Gauge & Steam Vents on Pedestal Front
  ctx.save();
  ctx.translate(-22, -18);
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = isHeavy ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const needleAngle =
    -Math.PI * 0.75 + (launcherStrain + (isHeavy ? 0.35 : 0.1)) * Math.PI * 1.25;
  ctx.strokeStyle = isHeavy ? '#f87171' : '#fde047';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(needleAngle) * 7, Math.sin(needleAngle) * 7);
  ctx.stroke();
  ctx.restore();

  // Steam / Ember Pressure Vents when under heavy strain
  if (launcherStrain > 0.3 && !reducedMotion) {
    const ventAlpha = Math.min(0.75, launcherStrain * 0.8);
    ctx.fillStyle = isHeavy
      ? `rgba(248, 113, 113, ${ventAlpha})`
      : `rgba(253, 224, 71, ${ventAlpha})`;
    for (let v = 0; v < 3; v++) {
      const vy = -38 - ((animTime * 40 + v * 12) % 26);
      const vx = 34 + v * 5 + Math.sin(animTime * 8 + v) * 4;
      ctx.beginPath();
      ctx.arc(vx, vy, 2.5 + v, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Articulated Alchemical Tension Arms
  const cradleOffsetY = spawnY - groundY;
  const pullBackX = -launcherStrain * (isHeavy ? 18 : 11);
  const pullDownY = launcherStrain * (isHeavy ? 9 : 4);

  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-26, -34);
  ctx.quadraticCurveTo(
    -18 - strainBend,
    cradleOffsetY * 0.55 + strainBend,
    pullBackX,
    cradleOffsetY + pullDownY,
  );
  ctx.moveTo(24, -34);
  ctx.quadraticCurveTo(
    14 - strainBend * 0.5,
    cradleOffsetY * 0.55 + strainBend,
    pullBackX,
    cradleOffsetY + pullDownY,
  );
  ctx.stroke();

  // Glowing Arcane Torsion Coils at Arm Joints
  const coilGlow = 0.65 + 0.35 * Math.sin(animTime * 5);
  ctx.beginPath();
  ctx.arc(0, cradleOffsetY + pullDownY, 15, 0, Math.PI * 2);
  ctx.fillStyle = isHeavy
    ? `rgba(239, 68, 68, ${0.42 * coilGlow})`
    : `rgba(245, 158, 11, ${0.42 * coilGlow})`;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isHeavy ? '#ef4444' : '#f59e0b';
  ctx.stroke();

  // Mechanical / Arcane Helper Clamps (assist loading Grom the Slag-Brute)
  if (isHeavy && (isIntro || showTrajectory)) {
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    const clampLift = heavyState === 'ASSISTED_MOUNT' ? Math.sin(animTime * 8) * 4 : 0;
    ctx.beginPath();
    ctx.moveTo(-36, -36);
    ctx.lineTo(-22 + pullBackX, cradleOffsetY + pullDownY + clampLift);
    ctx.moveTo(36, -36);
    ctx.lineTo(22 + pullBackX, cradleOffsetY + pullDownY + clampLift);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Render Staged Attacker Character in/beside Cradle during Intro & Aiming Preview
  if ((isIntro || showTrajectory) && currentAttack) {
    ctx.save();

    let stageX = pullBackX;
    let stageY = cradleOffsetY + pullDownY;

    if (!isHeavy) {
      if (standardState === 'INTRO_HOP_IN') {
        stageX = -32 + Math.abs(Math.sin(animTime * 10)) * 12;
        stageY = cradleOffsetY + 18 - Math.abs(Math.sin(animTime * 12)) * 16;
      } else if (standardState === 'PROUD_CHEST_PUFF') {
        stageX = -12;
        stageY = cradleOffsetY - 4;
      } else if (standardState === 'WARMUP_HOP' || standardState === 'BULLSEYE_ACK_OFFENDED') {
        stageY = cradleOffsetY - Math.abs(Math.sin(animTime * 14)) * 14;
      }
    } else {
      if (heavyState === 'HEAVY_STEP_IN') {
        stageX = -36;
        stageY = cradleOffsetY + 22;
      } else if (heavyState === 'GROUND_THUMP' || heavyState === 'BULLSEYE_ACK_DELIGHTED') {
        stageX = -18;
        stageY = cradleOffsetY + 16;
        // Cosmetic ground-thump dust shockwave ring
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(-18, -4, 34, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.translate(stageX, stageY);
    if (isHeavy) {
      renderGromSlagBruteBody(ctx, currentAttack.radius, animTime, heavyState);
    } else {
      renderPyriteSparkBody(ctx, currentAttack.radius, animTime, standardState);
    }
    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}
