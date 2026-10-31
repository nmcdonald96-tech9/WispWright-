/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS } from '../config';
import {
  GromRigPose,
  HeavyAttackerAnimState,
  PovCameraPose,
  PresentationSettings,
  StandardAttackerAnimState,
} from '../presentation/presentationTypes';
import {
  AuthoredAttack,
  MaterialType,
  PieceCondition,
  Vector2,
  WispEntity,
} from '../types';

export function computeGromRigPose(
  state: HeavyAttackerAnimState,
  animTime: number,
  velocity: Vector2 = { x: 0, y: 0 },
  reducedMotion = false,
): GromRigPose {
  const t = reducedMotion ? 0 : animTime;
  const speed = Math.hypot(velocity.x, velocity.y);

  // 1. Facing pose (FRONT, THREE_QUARTER, SIDE)
  let facing: GromRigPose['facing'] = 'THREE_QUARTER';
  if (
    state === 'GROUND_THUMP' ||
    state === 'POST_IMPACT_TRIUMPH' ||
    state === 'WEAK_HIT_GRUMBLE' ||
    state === 'POST_IMPACT_STUNNED'
  ) {
    facing = 'FRONT';
  } else if (
    state === 'DEEP_COMPRESSION' ||
    state === 'LAUNCHER_FULL_STRAIN' ||
    state === 'RELEASE_SURPRISE' ||
    state === 'HEAVY_FLIGHT_MOMENTUM' ||
    state === 'AIRBORNE_DELIGHT' ||
    state === 'HEAVY_IMPACT_BRACE'
  ) {
    facing = 'SIDE';
  }

  // 2. Squash and stretch
  let squashX = 1.0;
  let squashY = 1.0;
  if (!reducedMotion) {
    if (state === 'GROUND_THUMP') {
      squashX = 1.12;
      squashY = 0.89;
    } else if (state === 'DEEP_COMPRESSION' || state === 'LAUNCHER_FULL_STRAIN') {
      squashX = 0.91;
      squashY = 1.09;
    } else if (state === 'RELEASE_SURPRISE') {
      squashX = 1.14;
      squashY = 0.88;
    } else if (state === 'HEAVY_IMPACT_BRACE') {
      squashX = 0.9;
      squashY = 1.1;
    } else if (speed > 2) {
      squashX = 1.06;
      squashY = 0.95;
    }
  }

  // 3. Independent Brows, Eyes, and Mouth
  let browTiltLeft = 0.18;
  let browTiltRight = -0.18;
  let browLiftY = 0;
  let eyeOpenLeft = 1.0;
  let eyeOpenRight = 1.0;
  let mouthState: GromRigPose['mouthState'] = 'STOIC';

  if (state === 'RELEASE_SURPRISE') {
    browTiltLeft = -0.1;
    browTiltRight = 0.1;
    browLiftY = -3.0;
    eyeOpenLeft = 1.35;
    eyeOpenRight = 1.35;
    mouthState = 'SURPRISE_O';
  } else if (
    state === 'AIRBORNE_DELIGHT' ||
    state === 'POST_IMPACT_TRIUMPH' ||
    state === 'BULLSEYE_ACK_DELIGHTED'
  ) {
    browTiltLeft = 0.22;
    browTiltRight = -0.22;
    browLiftY = -1.5;
    eyeOpenLeft = state === 'BULLSEYE_ACK_DELIGHTED' ? 0.82 : 1.1;
    eyeOpenRight = state === 'BULLSEYE_ACK_DELIGHTED' ? 0.82 : 1.1;
    mouthState = 'GRIN';
  } else if (state === 'HEAVY_IMPACT_BRACE' || state === 'LAUNCHER_FULL_STRAIN') {
    browTiltLeft = 0.32;
    browTiltRight = -0.32;
    browLiftY = 2.0;
    eyeOpenLeft = 0.55;
    eyeOpenRight = 0.55;
    mouthState = 'GRIT_BRACE';
  } else if (state === 'WEAK_HIT_GRUMBLE') {
    browTiltLeft = 0.28;
    browTiltRight = 0.05; // Asymmetric skeptical brow
    eyeOpenLeft = 0.75;
    eyeOpenRight = 1.05;
    mouthState = 'GRUMBLE';
  } else if (state === 'POST_IMPACT_STUNNED') {
    browTiltLeft = -0.2;
    browTiltRight = 0.2;
    eyeOpenLeft = 1.2;
    eyeOpenRight = 0.7;
    mouthState = 'SURPRISE_O';
  }

  // 4. Appendages & Secondary Armor Lag
  const armWave = Math.sin(t * 9) * 0.25;
  const leftArmAngle =
    state === 'GROUND_THUMP'
      ? 0.65
      : state === 'AIRBORNE_DELIGHT' || state === 'BULLSEYE_ACK_DELIGHTED'
        ? -0.7 + armWave
        : -0.2 + armWave;
  const rightArmAngle =
    state === 'GROUND_THUMP'
      ? -0.65
      : state === 'BULLSEYE_ACK_DELIGHTED'
        ? -0.45
        : state === 'AIRBORNE_DELIGHT'
          ? 0.7 - armWave
          : 0.2 - armWave;

  const lagScale = reducedMotion ? 0 : 0.35;
  const armorSecondaryLag = {
    x: Math.max(-6, Math.min(6, -velocity.x * lagScale)),
    y: Math.max(-6, Math.min(6, -velocity.y * lagScale + Math.sin(t * 5) * 1.5)),
  };

  return {
    facing,
    squashX,
    squashY,
    browTiltLeft,
    browTiltRight,
    browLiftY,
    eyeOpenLeft,
    eyeOpenRight,
    pupilOffset: {
      x: facing === 'SIDE' ? 2.2 : facing === 'THREE_QUARTER' ? 1.4 : 0,
      y: velocity.y > 2 ? 1.2 : velocity.y < -2 ? -1.2 : 0,
    },
    mouthState,
    leftArmAngle,
    rightArmAngle,
    armorSecondaryLag,
  };
}

export function renderProjectile(
  ctx: CanvasRenderingContext2D,
  position: Vector2,
  velocity: Vector2,
  radius: number,
  attack: AuthoredAttack,
  timeSec: number,
  standardState: StandardAttackerAnimState = 'FLIGHT_CONFIDENT',
  heavyState: HeavyAttackerAnimState = 'HEAVY_FLIGHT_MOMENTUM',
  reducedMotion = false,
): void {
  const isHeavy = attack.attackerType === 'heavy';
  const speed = Math.hypot(velocity.x, velocity.y);
  const angle = speed > 1.2 ? Math.atan2(velocity.y, velocity.x) : 0;
  const animTime = reducedMotion ? 0 : timeSec;

  ctx.save();
  ctx.translate(position.x, position.y);

  // 1. Trailing Elemental Wake / Slag & Ember Plume
  const effectiveSpeed = speed < 40 ? speed * 25 : speed;
  if (effectiveSpeed > 35 && !reducedMotion) {
    ctx.save();
    ctx.rotate(angle);
    const tailLen = Math.min(105, effectiveSpeed * 0.24);

    const trailGrad = ctx.createLinearGradient(0, 0, -tailLen, 0);
    if (isHeavy) {
      trailGrad.addColorStop(0, 'rgba(239, 68, 68, 0.78)');
      trailGrad.addColorStop(0.5, 'rgba(185, 28, 28, 0.42)');
      trailGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    } else {
      trailGrad.addColorStop(0, 'rgba(251, 191, 36, 0.85)');
      trailGrad.addColorStop(0.5, 'rgba(249, 115, 22, 0.45)');
      trailGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    }

    ctx.fillStyle = trailGrad;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.78);
    ctx.lineTo(-tailLen, 0);
    ctx.lineTo(0, radius * 0.78);
    ctx.closePath();
    ctx.fill();

    // Orbiting / trailing slag flakes or combustion sparks
    for (let i = 0; i < (isHeavy ? 6 : 5); i++) {
      const dist = ((animTime * 110 + i * 23) % tailLen) + 8;
      const spread = Math.sin(animTime * 14 + i * 2.3) * (radius * 0.55);
      ctx.fillStyle = isHeavy
        ? i % 2 === 0
          ? '#7f1d1d'
          : '#f87171'
        : i % 2 === 0
          ? '#fef08a'
          : '#fb923c';
      ctx.beginPath();
      if (isHeavy) {
        ctx.rect(-dist - 3, spread - 3, 6, 5);
      } else {
        ctx.arc(-dist, spread, 2.8, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Render Character Rig (Visual-only squash & stretch; never changes physics radius)
  ctx.save();
  ctx.rotate(angle * 0.22);

  if (isHeavy) {
    renderGromSlagBruteBody(ctx, radius, animTime, heavyState, velocity, reducedMotion);
  } else {
    let scaleX = 1.0;
    let scaleY = 1.0;
    if (!reducedMotion && effectiveSpeed > 45) {
      if (standardState === 'APEX_SURPRISE') {
        scaleX = 0.96;
        scaleY = 1.05;
      } else if (standardState === 'IMPACT_BRACE') {
        scaleX = 0.88;
        scaleY = 1.12;
      } else {
        scaleX = 1.1;
        scaleY = 0.92;
      }
    }
    ctx.scale(scaleX, scaleY);
    renderPyriteSparkBody(ctx, radius, animTime, standardState);
  }

  ctx.restore();
  ctx.restore();
}

export function renderPyriteSparkBody(
  ctx: CanvasRenderingContext2D,
  radius: number,
  animTime: number,
  state: StandardAttackerAnimState,
): void {
  // Outer alchemical combustion aura
  const glowGrad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.45);
  glowGrad.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
  glowGrad.addColorStop(0.65, 'rgba(245, 158, 11, 0.45)');
  glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // Small energetic appendages (arms/hands)
  const armWave = Math.sin(animTime * 16) * 4;
  ctx.fillStyle = '#b45309';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  const leftArmY =
    state === 'PROUD_CHEST_PUFF'
      ? 2
      : state === 'WEAK_HIT_SHRUG'
        ? -radius * 0.65
        : state === 'APEX_SURPRISE' || state === 'DESCENT_PANIC'
          ? -radius * 0.55 + armWave
          : armWave * 0.5;
  ctx.beginPath();
  ctx.arc(-radius * 0.95, leftArmY, radius * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(radius * 0.95, -leftArmY, radius * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Compact rounded mineral-combustion core
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(-radius * 0.25, -radius * 0.25, 2, 0, 0, radius);
  coreGrad.addColorStop(0, '#fef08a');
  coreGrad.addColorStop(0.55, '#f59e0b');
  coreGrad.addColorStop(1, '#9a3412');
  ctx.fillStyle = coreGrad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#fde047';
  ctx.stroke();

  // Glowing internal fissure lines
  ctx.strokeStyle = 'rgba(254, 249, 195, 0.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.6, -radius * 0.3);
  ctx.lineTo(-radius * 0.2, -radius * 0.55);
  ctx.lineTo(radius * 0.3, -radius * 0.35);
  ctx.stroke();

  // Asymmetric bronze rune containment band
  ctx.save();
  ctx.rotate(-0.22);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.96, Math.PI * 0.82, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();

  // Top Flame Crest
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-5, -radius * 0.92);
  ctx.lineTo(0, -radius * 1.38 + Math.sin(animTime * 18) * 2.5);
  ctx.lineTo(6, -radius * 0.92);
  ctx.closePath();
  ctx.fill();

  // Expressive Oversized Eyes & Brows
  const isSurprised = state === 'APEX_SURPRISE' || state === 'BULLSEYE_ACK_OFFENDED';
  const isPanic = state === 'DESCENT_PANIC';
  const isBrace = state === 'IMPACT_BRACE' || state === 'EMBARRASSED_MISS';
  const isShrug = state === 'WEAK_HIT_SHRUG';

  ctx.fillStyle = '#1c1917';
  const eyeRadius = isSurprised || isPanic ? 4.4 : 3.6;
  ctx.beginPath();
  ctx.arc(1, -2, eyeRadius, 0, Math.PI * 2);
  ctx.arc(9, -2, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  const pupilSize = isSurprised ? 1.3 : 1.8;
  ctx.beginPath();
  ctx.arc(2, -2.5, pupilSize, 0, Math.PI * 2);
  ctx.arc(10, -2.5, pupilSize, 0, Math.PI * 2);
  ctx.fill();

  // Strong Brow Shapes
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (isSurprised || isPanic) {
    ctx.moveTo(-3, -8);
    ctx.lineTo(3, -10);
    ctx.moveTo(6, -10);
    ctx.lineTo(13, -8);
  } else if (isBrace) {
    ctx.moveTo(-3, -5);
    ctx.lineTo(4, -2);
    ctx.moveTo(6, -2);
    ctx.lineTo(13, -5);
  } else if (isShrug) {
    ctx.moveTo(-3, -8);
    ctx.lineTo(4, -7);
    ctx.moveTo(6, -4);
    ctx.lineTo(13, -6);
  } else {
    ctx.moveTo(-3, -7);
    ctx.lineTo(4, -4);
    ctx.moveTo(6, -4);
    ctx.lineTo(13, -7);
  }
  ctx.stroke();

  // Readable Mouth Silhouette
  ctx.strokeStyle = '#451a03';
  ctx.fillStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (isSurprised) {
    ctx.arc(5, 5.5, 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (isPanic) {
    ctx.ellipse(5, 6, 4.8, 3.0, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (isBrace || isShrug) {
    ctx.moveTo(0, 6);
    ctx.lineTo(10, 5);
    ctx.stroke();
  } else {
    ctx.arc(5, 3.5, 5, 0.15, Math.PI - 0.25);
    ctx.stroke();
  }
}

export function renderGromSlagBruteBody(
  ctx: CanvasRenderingContext2D,
  radius: number,
  animTime: number,
  state: HeavyAttackerAnimState,
  velocity: Vector2 = { x: 0, y: 0 },
  reducedMotion = false,
): void {
  const rig = computeGromRigPose(state, animTime, velocity, reducedMotion);

  ctx.save();
  ctx.scale(rig.squashX, rig.squashY);

  // Horizontal offset for FRONT vs THREE_QUARTER vs SIDE facial & core staging
  const faceShiftX =
    rig.facing === 'SIDE' ? 5.5 : rig.facing === 'THREE_QUARTER' ? 3.0 : 0;

  // 1. Molten Slag Heat Aura
  const glowGrad = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 1.4);
  glowGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
  glowGrad.addColorStop(0.7, 'rgba(153, 27, 27, 0.45)');
  glowGrad.addColorStop(1, 'rgba(153, 27, 27, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
  ctx.fill();

  // 2. Floating Rune-Bound Armor Plates with Secondary Lag Motion
  for (let i = 0; i < 4; i++) {
    const plateAngle = (i * Math.PI) / 2 + Math.sin(animTime * 2 + i) * 0.08;
    const px =
      Math.cos(plateAngle) * (radius * 0.98) + rig.armorSecondaryLag.x * (i % 2 === 0 ? 1 : 0.7);
    const py =
      Math.sin(plateAngle) * (radius * 0.98) + rig.armorSecondaryLag.y * (i % 2 === 0 ? 0.7 : 1);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(plateAngle);
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.6;
    ctx.fillRect(-4.5, -7.5, 9, 15);
    ctx.strokeRect(-4.5, -7.5, 9, 15);
    ctx.restore();
  }

  // 3. Independent Left & Right Small Appendages (Stubby Iron Gauntlets)
  ctx.fillStyle = '#374151';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.8;

  // Left Appendage
  ctx.save();
  ctx.rotate(rig.leftArmAngle);
  ctx.beginPath();
  ctx.arc(-radius * 0.94, 4, radius * 0.23, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Right Appendage
  ctx.save();
  ctx.rotate(rig.rightArmAngle);
  ctx.beginPath();
  ctx.arc(radius * 0.94, 4, radius * 0.23, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 4. Broad Polygonal Volcanic Slag Core Silhouette
  ctx.beginPath();
  const sides = 8;
  for (let i = 0; i < sides; i++) {
    const a = (i * Math.PI * 2) / sides + Math.PI / 8;
    const r = i % 2 === 0 ? radius * 1.02 : radius * 0.94;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const slagGrad = ctx.createRadialGradient(-6 + faceShiftX, -6, 3, 0, 0, radius);
  slagGrad.addColorStop(0, '#4b5563');
  slagGrad.addColorStop(0.65, '#1f2937');
  slagGrad.addColorStop(1, '#111827');
  ctx.fillStyle = slagGrad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ef4444';
  ctx.stroke();

  // Glowing molten core cracks across chest
  ctx.strokeStyle = '#f87171';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.5 + faceShiftX * 0.4, 5);
  ctx.lineTo(faceShiftX * 0.5, 10);
  ctx.lineTo(radius * 0.45 + faceShiftX * 0.4, 6);
  ctx.stroke();

  // 5. Independent Left & Right Eyes (shifted by facing pose)
  const leftEyeX = -5.5 + faceShiftX;
  const rightEyeX = 5.5 + faceShiftX;
  const eyeY = -3;

  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.ellipse(leftEyeX, eyeY, 3.6, 3.4 * rig.eyeOpenLeft, 0, 0, Math.PI * 2);
  ctx.ellipse(rightEyeX, eyeY, 3.6, 3.4 * rig.eyeOpenRight, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glowing white-hot pupils
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(leftEyeX + rig.pupilOffset.x, eyeY + rig.pupilOffset.y, 1.4, 0, Math.PI * 2);
  ctx.arc(rightEyeX + rig.pupilOffset.x, eyeY + rig.pupilOffset.y, 1.4, 0, Math.PI * 2);
  ctx.fill();

  // 6. Independent Left & Right Heavy Iron Brow Plates
  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.6;

  // Left Brow
  ctx.save();
  ctx.translate(leftEyeX, -9 + rig.browLiftY);
  ctx.rotate(rig.browTiltLeft);
  ctx.fillRect(-5.5, -2.5, 11, 4.5);
  ctx.strokeRect(-5.5, -2.5, 11, 4.5);
  ctx.restore();

  // Right Brow
  ctx.save();
  ctx.translate(rightEyeX, -9 + rig.browLiftY);
  ctx.rotate(rig.browTiltRight);
  ctx.fillRect(-5.5, -2.5, 11, 4.5);
  ctx.strokeRect(-5.5, -2.5, 11, 4.5);
  ctx.restore();

  // 7. Independent Mouth Silhouette
  ctx.strokeStyle = '#fca5a5';
  ctx.fillStyle = '#7f1d1d';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (rig.mouthState === 'GRIN') {
    ctx.arc(faceShiftX, 2.5, 6.5, 0.1, Math.PI - 0.1);
    ctx.fill();
    ctx.stroke();
  } else if (rig.mouthState === 'SURPRISE_O') {
    ctx.arc(faceShiftX, 4.8, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (rig.mouthState === 'GRIT_BRACE') {
    ctx.rect(-6 + faceShiftX, 3, 12, 4);
    ctx.fill();
    ctx.stroke();
  } else if (rig.mouthState === 'GRUMBLE') {
    ctx.moveTo(-6 + faceShiftX, 6);
    ctx.lineTo(-1 + faceShiftX, 4);
    ctx.lineTo(5 + faceShiftX, 7);
    ctx.stroke();
  } else {
    ctx.moveTo(-6 + faceShiftX, 5.5);
    ctx.lineTo(faceShiftX, 3.8);
    ctx.lineTo(6 + faceShiftX, 5.5);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderTrueFirstPersonPOV(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number,
  povPose: PovCameraPose,
  attack: AuthoredAttack | null,
  pieces: Array<{
    id?: string;
    pieceId?: string;
    type: MaterialType;
    position: Vector2;
    rotation: number;
    condition?: PieceCondition;
  }>,
  wisps: WispEntity[],
  targetPos: Vector2 | null,
  timeSec: number,
  launcherStrain: number,
  settings: PresentationSettings,
): void {
  const isHeavy = attack?.attackerType === 'heavy';
  const isReducedMotion = settings.reducedMotion || settings.povMotion === 'REDUCED';
  const isDeveloperMode = settings.presentationMode === 'DEVELOPER';
  const animTime = isReducedMotion ? 0 : timeSec;

  const cx = viewWidth / 2 + povPose.recoilJoltOffset.x;
  const cy = viewHeight / 2 + povPose.recoilJoltOffset.y;
  const focal = Math.min(viewWidth, viewHeight) * 0.86 * povPose.fovScale;

  const camX = povPose.cameraOrigin.x;
  const camY = povPose.cameraOrigin.y;
  const fx = povPose.forwardVector.x;
  const fy = povPose.forwardVector.y;

  const project3D = (wx: number, wy: number, wz: number) => {
    const dx = wx - camX;
    const dy = wy - camY;
    const depth = dx * fx + dy * fy;
    const vert = -dx * fy + dy * fx;
    const safeDepth = Math.max(6, depth);
    const scale = focal / safeDepth;
    return {
      depth,
      sx: cx + wz * scale,
      sy: cy + vert * scale,
      scale,
    };
  };

  ctx.save();
  // Apply restrained, clamped first-person camera roll around viewport center
  ctx.translate(viewWidth / 2, viewHeight / 2);
  ctx.rotate(povPose.rollRad);
  ctx.translate(-viewWidth / 2, -viewHeight / 2);

  // 1. Dynamic Pitching Sky & Horizon
  // During ascent (pitchRad < 0), horizon drops so sky fills upper/middle view;
  // around apex (pitchRad ~ 0), horizon sweeps across center;
  // during descent (pitchRad > 0), horizon rises so approaching ground & fortress fill view!
  const rawHorizonY = cy + Math.tan(-povPose.pitchRad) * focal * 0.72;
  const horizonY = Math.max(-viewHeight * 0.25, Math.min(viewHeight * 1.25, rawHorizonY));

  const skyGrad = ctx.createLinearGradient(0, -60, 0, Math.max(40, horizonY));
  skyGrad.addColorStop(0, '#070b14');
  skyGrad.addColorStop(0.55, '#131c31');
  skyGrad.addColorStop(1, '#261f38');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-60, -60, viewWidth + 120, Math.max(0, horizonY + 60));

  // Distant alchemical moon & stars in forward sky
  const moonY = horizonY - focal * 0.34;
  const moonX = cx + focal * 0.28;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 54);
  moonGlow.addColorStop(0, 'rgba(253, 230, 138, 0.45)');
  moonGlow.addColorStop(1, 'rgba(253, 230, 138, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 54, 0, Math.PI * 2);
  ctx.fill();

  // Distant mountain silhouette along the pitching horizon
  ctx.fillStyle = '#141b2d';
  ctx.beginPath();
  ctx.moveTo(-60, horizonY);
  ctx.lineTo(cx - focal * 0.55, horizonY - 38);
  ctx.lineTo(cx - focal * 0.18, horizonY - 16);
  ctx.lineTo(cx + focal * 0.22, horizonY - 46);
  ctx.lineTo(cx + focal * 0.65, horizonY - 20);
  ctx.lineTo(viewWidth + 60, horizonY);
  ctx.closePath();
  ctx.fill();

  // 2. Approaching 3D Flight Corridor Ground Plane & Distance Plinths
  const groundGrad = ctx.createLinearGradient(0, horizonY, 0, viewHeight + 60);
  groundGrad.addColorStop(0, '#182032');
  groundGrad.addColorStop(0.45, '#111827');
  groundGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-60, horizonY, viewWidth + 120, viewHeight - horizonY + 120);

  // 3D perspective corridor rails converging toward the fortress
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
  ctx.lineWidth = 1.6;
  for (const laneZ of [-150, -55, 55, 150]) {
    const nearPt = project3D(Math.max(camX + 25, -440), 780, laneZ);
    const farPt = project3D(680, 780, laneZ);
    if (nearPt.depth > 8 && farPt.depth > 8) {
      ctx.beginPath();
      ctx.moveTo(nearPt.sx, Math.max(horizonY, nearPt.sy));
      ctx.lineTo(farPt.sx, Math.max(horizonY, farPt.sy));
      ctx.stroke();
    }
  }

  // Transverse ground stone markers rushing past under the projectile
  for (let gx = -400; gx <= 620; gx += 85) {
    const pLeft = project3D(gx, 780, -155);
    const pRight = project3D(gx, 780, 155);
    if (pLeft.depth > 14 && pLeft.sy >= horizonY && pLeft.sy <= viewHeight + 40) {
      ctx.strokeStyle =
        gx >= 180 ? 'rgba(56, 189, 248, 0.28)' : 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = Math.max(1, Math.min(4, pLeft.scale * 3.5));
      ctx.beginPath();
      ctx.moveTo(pLeft.sx, pLeft.sy);
      ctx.lineTo(pRight.sx, pRight.sy);
      ctx.stroke();
    }
  }

  // Elevated airspace rune rings along the ballistic path (communicates ascent, apex & descent)
  if (attack && targetPos) {
    const startX = attack.spawnPosition.x;
    const startY = attack.spawnPosition.y;
    const vx = attack.launchVelocity.x;
    const vy = attack.launchVelocity.y;
    const gPerStep = 0.001 * 0.98 * (1000 / 60) * (1000 / 60);
    for (let step = 8; step <= 44; step += 9) {
      const ringX = startX + vx * step;
      const ringY = startY + vy * step + 0.5 * gPerStep * step * step;
      if (ringX >= targetPos.x - 20) continue;
      const ringProj = project3D(ringX, ringY, 0);
      if (ringProj.depth > 22 && ringProj.depth < 720) {
        const ringR = Math.max(6, 36 * ringProj.scale);
        ctx.save();
        ctx.strokeStyle = isHeavy
          ? 'rgba(248, 113, 113, 0.22)'
          : 'rgba(251, 191, 36, 0.24)';
        ctx.lineWidth = Math.max(1, 2.2 * ringProj.scale);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(ringProj.sx, ringProj.sy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 3. Approaching 3D Sanctuary Fortress & Protected Wisps (Sorted Back-to-Front by 3D Depth)
  type Drawable3D =
    | {
        kind: 'piece';
        depth: number;
        piece: {
          id?: string;
          pieceId?: string;
          type: MaterialType;
          position: Vector2;
          rotation: number;
          condition?: PieceCondition;
        };
      }
    | {
        kind: 'wisp';
        depth: number;
        wisp: WispEntity;
      };

  const drawables: Drawable3D[] = [];
  for (const p of pieces) {
    if (p.condition === 'LOST') continue;
    const proj = project3D(p.position.x, p.position.y, (p.position.x - 350) * 0.52);
    if (proj.depth > 15) {
      drawables.push({ kind: 'piece', depth: proj.depth, piece: p });
    }
  }
  for (const w of wisps) {
    if (w.isDispersed) continue;
    const proj = project3D(w.position.x, w.position.y, (w.position.x - 350) * 0.5);
    if (proj.depth > 15) {
      drawables.push({ kind: 'wisp', depth: proj.depth, wisp: w });
    }
  }

  // Sort back-to-front so closer front walls naturally occlude rear pieces
  drawables.sort((a, b) => b.depth - a.depth);

  for (const item of drawables) {
    if (item.kind === 'piece') {
      const p = item.piece;
      const cfg = MATERIAL_CONFIGS[p.type];
      const lateralZ = (p.position.x - 350) * 0.52;
      const centerProj = project3D(p.position.x, p.position.y, lateralZ);
      if (centerProj.depth <= 15) continue;

      const isVertical = Math.abs(Math.sin(p.rotation)) > 0.5;
      const worldW = isVertical ? cfg.height : cfg.width;
      const worldH = isVertical ? cfg.width : cfg.height;
      // Horizontal beams span wider across the 3D sanctuary corridor
      const lateralSpan =
        p.type === 'wood_beam' && !isVertical ? worldW * 1.15 : worldW * 0.85;

      const sw = Math.max(4, lateralSpan * centerProj.scale);
      const sh = Math.max(4, worldH * centerProj.scale);
      const extrudeDepthPx = Math.max(3, 18 * centerProj.scale);

      const x0 = centerProj.sx - sw / 2;
      const y0 = centerProj.sy - sh / 2;

      ctx.save();
      // 3D Top/Side Extrusion Face for volumetric depth
      ctx.fillStyle =
        p.type === 'stone_block'
          ? '#334155'
          : p.type === 'wood_beam'
            ? '#78350f'
            : '#92400e';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + extrudeDepthPx * 0.55, y0 - extrudeDepthPx * 0.45);
      ctx.lineTo(x0 + sw + extrudeDepthPx * 0.55, y0 - extrudeDepthPx * 0.45);
      ctx.lineTo(x0 + sw, y0);
      ctx.closePath();
      ctx.fill();

      // Primary Front Face Facing Approaching Projectile
      ctx.fillStyle =
        p.type === 'bullseye_block'
          ? '#4c1d3d'
          : p.type === 'stone_block'
            ? '#64748b'
            : p.type === 'wood_beam'
              ? '#b45309'
              : '#d97706';
      ctx.strokeStyle =
        p.condition === 'CRACKED'
          ? '#f59e0b'
          : p.type === 'bullseye_block'
            ? '#f43f5e'
            : p.type === 'stone_block'
              ? '#94a3b8'
              : '#fde68a';
      ctx.lineWidth = Math.max(1, 1.8 * centerProj.scale);
      ctx.fillRect(x0, y0, sw, sh);
      ctx.strokeRect(x0, y0, sw, sh);

      if (p.type === 'bullseye_block') {
        const rOuter = Math.max(2, Math.min(sw, sh) * 0.36);
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.arc(centerProj.sx, centerProj.sy, rOuter, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(centerProj.sx, centerProj.sy, rOuter * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#be123c';
        ctx.beginPath();
        ctx.arc(centerProj.sx, centerProj.sy, rOuter * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }

      // Visual cracks on damaged pieces (no developer text tags in Player mode)
      if (p.condition === 'CRACKED' || p.condition === 'BROKEN') {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = Math.max(1.2, 2.2 * centerProj.scale);
        ctx.beginPath();
        ctx.moveTo(x0 + sw * 0.25, y0);
        ctx.lineTo(x0 + sw * 0.52, y0 + sh * 0.5);
        ctx.lineTo(x0 + sw * 0.38, y0 + sh);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      const w = item.wisp;
      const lateralZ = (w.position.x - 350) * 0.5;
      const wProj = project3D(
        w.position.x,
        w.position.y + Math.sin(animTime * 3 + w.position.x) * 3,
        lateralZ,
      );
      if (wProj.depth <= 15) continue;
      const wr = Math.max(3.5, w.radius * 1.15 * wProj.scale);

      ctx.save();
      const glow = ctx.createRadialGradient(
        wProj.sx,
        wProj.sy,
        wr * 0.2,
        wProj.sx,
        wProj.sy,
        wr * 2.4,
      );
      glow.addColorStop(0, w.glowColor);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(wProj.sx, wProj.sy, wr * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = w.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, 1.5 * wProj.scale);
      ctx.beginPath();
      ctx.arc(wProj.sx, wProj.sy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Expressive eyes looking straight at the incoming projectile
      const eyeR = Math.max(1.2, wr * 0.22);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(wProj.sx - wr * 0.32, wProj.sy - wr * 0.08, eyeR, 0, Math.PI * 2);
      ctx.arc(wProj.sx + wr * 0.32, wProj.sy - wr * 0.08, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 4. Subtle World-Space Target Glyph on Approaching Selected Target
  if (targetPos) {
    const tLatZ = (targetPos.x - 350) * 0.52;
    const tProj = project3D(targetPos.x, targetPos.y, tLatZ);
    if (tProj.depth > 15) {
      const glyphR = Math.max(12, Math.min(48, 28 * tProj.scale));
      const pulse = 1 + Math.sin(animTime * 8) * 0.1;
      ctx.save();
      ctx.translate(tProj.sx, tProj.sy);
      ctx.strokeStyle = isHeavy ? '#f87171' : '#fbbf24';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, glyphR * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating inner alchemical diamond
      ctx.rotate(animTime * 1.8);
      const d = glyphR * 0.52;
      ctx.beginPath();
      ctx.moveTo(0, -d);
      ctx.lineTo(d, 0);
      ctx.lineTo(0, d);
      ctx.lineTo(-d, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  // 5. Launcher Seat & Receding Launcher Mechanism Around/Behind Viewpoint
  // Visible while seated in launcher (launcherRecedeProgress === 0) and receding rapidly during release (0 -> 1)
  if (povPose.launcherRecedeProgress < 0.98) {
    const recede = povPose.launcherRecedeProgress;
    // Spread outward and fade as launcher recedes behind the launched projectile
    const spreadX = recede * viewWidth * 0.62;
    const spreadY = recede * viewHeight * 0.38;
    const alpha = Math.max(0, 1 - recede * 1.05);

    ctx.save();
    ctx.globalAlpha = alpha;

    const strainShake =
      povPose.stage === 'SEATED_IN_LAUNCHER' && !isReducedMotion
        ? Math.sin(animTime * 55) * launcherStrain * 2.5
        : 0;

    const leftRailX = Math.max(24, viewWidth * 0.16) - spreadX + strainShake;
    const rightRailX = Math.min(viewWidth - 24, viewWidth * 0.84) + spreadX - strainShake;
    const railTopY = viewHeight * 0.14 - spreadY;
    const railBottomY = viewHeight * 0.92 + spreadY;

    // Taut Alchemical Torsion Bands / Bowstrings connected to cradle
    ctx.strokeStyle = isHeavy ? '#f87171' : '#fde047';
    ctx.lineWidth = isHeavy ? 5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(leftRailX, (railTopY + railBottomY) * 0.52);
    ctx.lineTo(cx - 75 - spreadX * 0.5, viewHeight * 0.88 + spreadY);
    ctx.moveTo(rightRailX, (railTopY + railBottomY) * 0.52);
    ctx.lineTo(cx + 75 + spreadX * 0.5, viewHeight * 0.88 + spreadY);
    ctx.stroke();

    // Left & Right Heavy Bronze/Obsidian Launcher Torsion Arms around the viewpoint
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.fillRect(leftRailX - 22, railTopY, 28, railBottomY - railTopY);
    ctx.strokeRect(leftRailX - 22, railTopY, 28, railBottomY - railTopY);
    ctx.fillRect(rightRailX - 6, railTopY, 28, railBottomY - railTopY);
    ctx.strokeRect(rightRailX - 6, railTopY, 28, railBottomY - railTopY);

    // Glowing Runic Tension Coils on the launcher arms
    ctx.fillStyle = isHeavy ? '#ef4444' : '#fbbf24';
    for (let r = 0; r < 4; r++) {
      const ry = railTopY + 35 + r * ((railBottomY - railTopY - 70) / 3);
      ctx.beginPath();
      ctx.arc(leftRailX - 8, ry, 5, 0, Math.PI * 2);
      ctx.arc(rightRailX + 8, ry, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lower Launcher Cradle Seat Rim beneath the projectile
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(leftRailX, railBottomY - 12);
    ctx.quadraticCurveTo(cx, railBottomY - 38, rightRailX, railBottomY - 12);
    ctx.lineTo(rightRailX, viewHeight + 20);
    ctx.lineTo(leftRailX, viewHeight + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // 6. Restrained Speed Lines & Elemental Particles Passing the Camera
  if (
    settings.povSpeedLines &&
    !isReducedMotion &&
    povPose.stage !== 'SEATED_IN_LAUNCHER'
  ) {
    ctx.save();
    ctx.strokeStyle = isHeavy
      ? 'rgba(248, 113, 113, 0.22)'
      : 'rgba(253, 224, 71, 0.22)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12 + Math.sin(animTime * 2.5 + i) * 0.04;
      const r1 = Math.min(viewWidth, viewHeight) * 0.36;
      const r2 = Math.max(viewWidth, viewHeight) * 0.58;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();

      // Elemental sparks / slag flakes streaming past the periphery
      const pDist = r1 + ((animTime * 260 + i * 37) % Math.max(20, r2 - r1));
      ctx.fillStyle = isHeavy ? '#f87171' : '#fde047';
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(angle + 0.08) * pDist,
        cy + Math.sin(angle + 0.08) * pDist,
        isHeavy ? 3.2 : 2.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // 7. Limited Peripheral Projectile Body-Edge Visuals (Brow Rim & Lower Hands/Armor < 10% of frame)
  ctx.save();
  const accelSquash =
    povPose.stage === 'RELEASE_JOLT' ? 6 : povPose.stage === 'APEX' ? -4 : 2;
  const browDepth = (isHeavy ? 28 : 20) + accelSquash;

  // Top edge brow / helmet rim
  ctx.fillStyle = isHeavy ? 'rgba(17, 24, 39, 0.88)' : 'rgba(120, 53, 15, 0.82)';
  ctx.strokeStyle = isHeavy ? '#ef4444' : '#fde047';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - 145, -10);
  ctx.quadraticCurveTo(cx, browDepth, cx + 145, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lower-left & lower-right peripheral hands / floating armor plates
  const handBob = isReducedMotion ? 0 : Math.sin(animTime * 14) * 4;
  if (isHeavy) {
    // Grom's floating obsidian-slag shoulder plates & stubby iron fists at lower corners
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(cx - 125, viewHeight - 10 + handBob, 24, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 125, viewHeight - 10 - handBob, 24, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
  } else {
    // Pyrite Spark's small brass wing-claws at lower corners
    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(cx - 135, viewHeight + 5);
    ctx.lineTo(cx - 110, viewHeight - 18 + handBob);
    ctx.lineTo(cx - 88, viewHeight + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 88, viewHeight + 5);
    ctx.lineTo(cx + 110, viewHeight - 18 - handBob);
    ctx.lineTo(cx + 135, viewHeight + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Developer Mode diagnostic overlay strip
  if (isDeveloperMode) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(cx - 140, 56, 280, 22);
    ctx.strokeRect(cx - 140, 56, 280, 22);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `POV [${povPose.stage}] • ${Math.round(povPose.distanceToTarget)}px • ${(povPose.predictedTimeToImpactSec * 1000).toFixed(0)}ms`,
      cx,
      71,
    );
  }

  ctx.restore();
  ctx.restore();
}

export function renderProjectilePOVOverlay(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number,
  attack: AuthoredAttack | null,
  projectilePos: Vector2,
  projectileVel: Vector2,
  targetPos: Vector2 | null,
  timeSec: number,
  reducedMotion = false,
  isDeveloperMode = false,
): void {
  const isHeavy = attack?.attackerType === 'heavy';
  const rollAngle = reducedMotion
    ? 0
    : Math.max(-0.07, Math.min(0.07, projectileVel.y * 0.0045));

  ctx.save();
  ctx.translate(viewWidth / 2, viewHeight / 2);
  ctx.rotate(rollAngle);
  ctx.translate(-viewWidth / 2, -viewHeight / 2);

  // 1. First-Person Peripheral Vignette & Restrained Speed Lines
  const vigGrad = ctx.createRadialGradient(
    viewWidth / 2,
    viewHeight / 2,
    Math.min(viewWidth, viewHeight) * 0.34,
    viewWidth / 2,
    viewHeight / 2,
    Math.max(viewWidth, viewHeight) * 0.65,
  );
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(
    1,
    isHeavy ? 'rgba(127, 29, 29, 0.32)' : 'rgba(180, 83, 9, 0.25)',
  );
  ctx.fillStyle = vigGrad;
  ctx.fillRect(-40, -40, viewWidth + 80, viewHeight + 80);

  if (!reducedMotion) {
    ctx.strokeStyle = isHeavy
      ? 'rgba(248, 113, 113, 0.18)'
      : 'rgba(253, 224, 71, 0.18)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI * 2) / 10 + Math.sin(timeSec * 3 + i) * 0.03;
      const r1 = Math.min(viewWidth, viewHeight) * 0.4;
      const r2 = Math.max(viewWidth, viewHeight) * 0.56;
      ctx.beginPath();
      ctx.moveTo(viewWidth / 2 + Math.cos(angle) * r1, viewHeight / 2 + Math.sin(angle) * r1);
      ctx.lineTo(viewWidth / 2 + Math.cos(angle) * r2, viewHeight / 2 + Math.sin(angle) * r2);
      ctx.stroke();
    }
  }

  // 2. Subtle Peripheral First-Person Brow Ridge & Armor Rim (Top & Bottom Viewport Edge Only)
  const cx = viewWidth / 2;
  ctx.fillStyle = isHeavy ? 'rgba(17, 24, 39, 0.85)' : 'rgba(120, 53, 15, 0.78)';
  ctx.strokeStyle = isHeavy ? '#ef4444' : '#fde047';
  ctx.lineWidth = 2;

  // Top peripheral brow/visor edge
  ctx.beginPath();
  ctx.moveTo(cx - 130, 0);
  ctx.quadraticCurveTo(cx, isHeavy ? 28 : 20, cx + 130, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bottom peripheral containment armor rim
  ctx.beginPath();
  ctx.moveTo(cx - 110, viewHeight);
  ctx.quadraticCurveTo(cx, viewHeight - 22, cx + 110, viewHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Clean First-Person Sight Reticle on Approaching Fortress (Developer Mode adds raw distance text)
  const reticleR = 26 + Math.sin(timeSec * 8) * 2;
  ctx.strokeStyle = isHeavy ? 'rgba(248, 113, 113, 0.7)' : 'rgba(253, 224, 71, 0.7)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, viewHeight / 2, reticleR, 0, Math.PI * 2);
  ctx.stroke();

  if (isDeveloperMode && targetPos) {
    const dist = Math.round(
      Math.hypot(projectilePos.x - targetPos.x, projectilePos.y - targetPos.y),
    );
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(cx - 105, 58, 210, 22);
    ctx.strokeRect(cx - 105, 58, 210, 22);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`POV EXPERIMENTAL • ${dist}px`, cx, 73);
  }

  ctx.restore();
}
