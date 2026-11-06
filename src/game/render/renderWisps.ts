/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WispPresentationData, WispReactionState } from '../presentation/presentationTypes';
import { deriveWispCelebrationPose } from '../presentation/wispCelebrationChoreography';
import { Vector2, WispEntity } from '../types';

export function renderWisps(
  ctx: CanvasRenderingContext2D,
  wisps: WispEntity[],
  timeSec: number,
  lookTarget?: Vector2,
  wispPresentationMap?: Map<string, WispPresentationData>,
  reducedMotion = false,
): void {
  const animTime = reducedMotion ? 0 : timeSec;

  wisps.forEach((wisp, index) => {
    if (wisp.placed !== true) {
      return;
    }
    const pres = wispPresentationMap?.get(wisp.id);
    const reaction: WispReactionState =
      pres?.reactionState ?? (wisp.isDispersed ? 'DISPERSED_FADING' : 'CALM_IDLE');
    const isHero = pres?.isHero ?? wisp.id === 'wisp_ignis';
    const dispersalProgress = pres?.dispersalProgress ?? (wisp.isDispersed ? 1 : 0);

    // 1. Handle Multi-Stage Harmless Dispersal Presentation (Gather -> Swirl -> Ascend -> Fade)
    if (wisp.isDispersed) {
      renderDispersedWispStage(ctx, wisp, animTime, reaction, dispersalProgress);
      return;
    }

    // 2. Compute Idle Cadence & Reaction Motion Offset (Visual-only; never alters wisp.position)
    const phaseOffset = index * 1.45;
    const cadenceSpeed =
      wisp.id === 'wisp_zephyr'
        ? 3.1
        : wisp.id === 'wisp_terran'
          ? 1.7
          : wisp.id === 'wisp_marinus'
            ? 2.6
            : 2.3;

    let bobY = Math.sin(animTime * cadenceSpeed + phaseOffset) * (isHero ? 5.5 : 4.2);
    let swayX = Math.cos(animTime * (cadenceSpeed * 0.7) + phaseOffset) * (isHero ? 2.5 : 1.8);
    let bodyTilt = 0;
    let bodyScale = 1;
    let celebrationGlowMultiplier = 1;

    const celebrationPose =
      reaction === 'CELEBRATION_CHORUS' &&
      pres?.celebrationElapsedSec !== undefined &&
      pres.celebrationSurvivorIndex !== undefined &&
      pres.celebrationSurvivorCount !== undefined &&
      pres.celebrationTotalWispCount !== undefined
        ? deriveWispCelebrationPose({
            wispId: wisp.id,
            elapsedSec: pres.celebrationElapsedSec,
            survivorIndex: pres.celebrationSurvivorIndex,
            survivorCount: pres.celebrationSurvivorCount,
            totalWispCount: pres.celebrationTotalWispCount,
            reducedMotion,
          })
        : null;

    if (celebrationPose?.hasStarted) {
      swayX += celebrationPose.offsetX;
      bobY += celebrationPose.offsetY;
      bodyTilt += celebrationPose.rotationRad;
      bodyScale = celebrationPose.scale;
      celebrationGlowMultiplier = celebrationPose.glowMultiplier;
    } else if (!reducedMotion) {
      const reactionEaseRaw = Math.max(0, Math.min(1, pres?.transitionProgress ?? 1));
      const reactionEase = reactionEaseRaw * reactionEaseRaw * (3 - 2 * reactionEaseRaw);
      if (reaction === 'STARTLED_JUMP') {
        bobY -= Math.abs(Math.sin(animTime * 11 + index)) * 9 * reactionEase;
      } else if (reaction === 'COWER' || reaction === 'BRACE_FOR_IMPACT') {
        bobY += 4 * reactionEase;
        swayX += Math.sin(animTime * 28) * 1.4 * reactionEase;
      } else if (reaction === 'DODGE_LEAN') {
        swayX += 6 * reactionEase;
        bodyTilt = 0.22 * reactionEase;
      }
    }

    const x = wisp.position.x + swayX;
    const y = wisp.position.y + bobY;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bodyTilt);
    ctx.scale(bodyScale, bodyScale);

    // 3. Outer Elemental Luminescence Aura (Hero Wisp has a richer double halo)
    const glowRadius =
      wisp.radius * (isHero ? 2.65 : 2.15) * celebrationGlowMultiplier;
    const grad = ctx.createRadialGradient(0, 0, wisp.radius * 0.15, 0, 0, glowRadius);
    grad.addColorStop(0, wisp.glowColor);
    grad.addColorStop(0.48, wisp.color + '88');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 4. Distinct Elemental Vapor Tail (Differs per wisp)
    renderWispVaporTail(ctx, wisp, animTime, isHero);

    // 5. Orbiting Rune-Bound Armor Fragments (Hero has 3 detailed plates; Companions have distinct shapes)
    renderWispArmorFragments(ctx, wisp, animTime, isHero, reaction);

    // 6. Elemental Core Orb Silhouette (Differs subtly per wisp)
    ctx.beginPath();
    if (wisp.id === 'wisp_terran') {
      // Slightly faceted crystal-orb core
      ctx.ellipse(0, 0, wisp.radius * 1.05, wisp.radius * 0.95, 0, 0, Math.PI * 2);
    } else if (wisp.id === 'wisp_marinus') {
      // Teardrop-softened aqua core
      ctx.ellipse(0, 1, wisp.radius * 0.96, wisp.radius * 1.04, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, wisp.radius * (isHero ? 1.08 : 1.0), 0, Math.PI * 2);
    }
    ctx.fillStyle = wisp.color;
    ctx.fill();
    ctx.lineWidth = isHero ? 2.2 : 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Inner bright core highlight
    ctx.beginPath();
    ctx.arc(-wisp.radius * 0.28, -wisp.radius * 0.28, wisp.radius * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fill();

    // 7. Distinct Head Crest / Horn Detail per Wisp
    renderWispCrest(ctx, wisp, animTime, isHero);

    // 8. Expressive Eyes, Brows, and Mouth driven by Reaction Priority System
    const effectiveLook = pres?.lookTarget ?? lookTarget;
    renderWispFace(
      ctx,
      wisp,
      x,
      y,
      effectiveLook,
      reaction,
      isHero,
      pres?.blinkPhase ?? 0,
      animTime,
    );

    // 9. Non-Text Tactical Emotion Emote (Clear in wide/tactical view without text clutter)
    renderWispReactionEmote(ctx, wisp, reaction, animTime, isHero);

    // 10. Hero Wisp Ambient Sparkles
    if (isHero && !reducedMotion) {
      for (let s = 0; s < 3; s++) {
        const sa = animTime * 2.2 + (s * Math.PI * 2) / 3;
        const sr = wisp.radius * 1.55 + Math.sin(animTime * 4 + s) * 3;
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  });
}

function renderWispReactionEmote(
  ctx: CanvasRenderingContext2D,
  wisp: WispEntity,
  reaction: WispReactionState,
  animTime: number,
  isHero: boolean,
): void {
  const r = wisp.radius;
  ctx.save();
  if (
    reaction === 'ALARMED_ALERT' ||
    reaction === 'SPOT_ATTACKER' ||
    reaction === 'STARTLED_JUMP'
  ) {
    // High-contrast non-text alert spikes above crest
    ctx.strokeStyle = isHero ? '#fef08a' : '#ffffff';
    ctx.lineWidth = 2.0;
    const pulse = Math.sin(animTime * 16) * 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5, -r * 1.65 - pulse);
      ctx.lineTo(i * 7, -r * 2.05 - pulse);
      ctx.stroke();
    }
  } else if (reaction === 'BRACE_FOR_IMPACT' || reaction === 'COWER') {
    // Protective rune ward arc above head
    ctx.strokeStyle = wisp.glowColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -2, r * 1.38, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (
    reaction === 'CELEBRATION_CHORUS' ||
    reaction === 'REINFORCEMENT_HOPE' ||
    reaction === 'MENTOR_GRATITUDE'
  ) {
    // Rising celebratory starlight diamond above crest
    const lift = Math.abs(Math.sin(animTime * 7)) * 4;
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.95 - lift);
    ctx.lineTo(3, -r * 1.75 - lift);
    ctx.lineTo(0, -r * 1.55 - lift);
    ctx.lineTo(-3, -r * 1.75 - lift);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderWispVaporTail(
  ctx: CanvasRenderingContext2D,
  wisp: WispEntity,
  animTime: number,
  isHero: boolean,
): void {
  const r = wisp.radius;
  const wave = Math.sin(animTime * 6 + r) * (isHero ? 5.5 : 3.8);

  ctx.save();
  ctx.fillStyle = wisp.glowColor;
  ctx.globalAlpha = isHero ? 0.88 : 0.76;

  ctx.beginPath();
  if (isHero) {
    // Hero Ignis: Dual-tongued ascending flame-vapor tail
    ctx.moveTo(-r * 0.8, r * 0.25);
    ctx.quadraticCurveTo(-r * 0.6, r * 1.5, wave - 3, r * 2.25);
    ctx.lineTo(0, r * 1.55);
    ctx.lineTo(wave + 4, r * 2.15);
    ctx.quadraticCurveTo(r * 0.6, r * 1.45, r * 0.8, r * 0.25);
  } else if (wisp.id === 'wisp_zephyr') {
    // Zephyr: Sweeping twin wind-ribbon tail
    ctx.moveTo(-r * 0.65, r * 0.2);
    ctx.bezierCurveTo(-r * 1.0, r * 1.15, wave + 9, r * 1.45, wave - 6, r * 2.1);
    ctx.lineTo(wave + 3, r * 1.55);
    ctx.lineTo(r * 0.65, r * 0.2);
  } else if (wisp.id === 'wisp_terran') {
    // Terran: Grounded geometric stepped crystal tail
    ctx.moveTo(-r * 0.72, r * 0.25);
    ctx.lineTo(-r * 0.48, r * 1.25);
    ctx.lineTo(wave * 0.25, r * 1.75);
    ctx.lineTo(r * 0.48, r * 1.25);
    ctx.lineTo(r * 0.72, r * 0.25);
  } else if (wisp.id === 'wisp_marinus') {
    // Marinus: Rounded twin-fin droplet tail
    ctx.moveTo(-r * 0.62, r * 0.3);
    ctx.quadraticCurveTo(-r * 0.75, r * 1.5, -3 + wave * 0.5, r * 1.9);
    ctx.quadraticCurveTo(0, r * 1.45, 3 + wave * 0.5, r * 1.9);
    ctx.quadraticCurveTo(r * 0.75, r * 1.5, r * 0.62, r * 0.3);
  } else {
    // Aetheris: Twin starlight tail prongs
    ctx.moveTo(-r * 0.68, r * 0.25);
    ctx.lineTo(-5 + wave * 0.5, r * 1.9);
    ctx.lineTo(0, r * 1.2);
    ctx.lineTo(5 + wave * 0.5, r * 1.9);
    ctx.lineTo(r * 0.68, r * 0.25);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function renderWispArmorFragments(
  ctx: CanvasRenderingContext2D,
  wisp: WispEntity,
  animTime: number,
  isHero: boolean,
  reaction: WispReactionState,
): void {
  const count = isHero ? 3 : 2;
  const orbitSpeed =
    reaction === 'ALARMED_ALERT' || reaction === 'BRACE_FOR_IMPACT' ? 4.2 : 1.8;
  const orbitR = wisp.radius * (isHero ? 1.42 : 1.32);

  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = animTime * orbitSpeed + (i * Math.PI * 2) / count;
    const fx = Math.cos(angle) * orbitR;
    const fy = Math.sin(angle) * (orbitR * 0.55) + 2;

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(angle * 0.3);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;

    if (isHero) {
      // Ignis: Runic diamond shield plates
      ctx.beginPath();
      ctx.moveTo(0, -4.8);
      ctx.lineTo(4.2, 0);
      ctx.lineTo(0, 4.8);
      ctx.lineTo(-4.2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (wisp.id === 'wisp_terran') {
      // Terran: Heavy square stone monolith plates
      ctx.fillRect(-3.8, -3.8, 7.6, 7.6);
      ctx.strokeRect(-3.8, -3.8, 7.6, 7.6);
    } else if (wisp.id === 'wisp_zephyr') {
      // Zephyr: Swept wing-chevron charms
      ctx.beginPath();
      ctx.moveTo(-4, 2);
      ctx.lineTo(0, -4);
      ctx.lineTo(4, 2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (wisp.id === 'wisp_marinus') {
      // Marinus: Teardrop shell charms
      ctx.beginPath();
      ctx.arc(0, 1, 3.2, 0, Math.PI);
      ctx.lineTo(0, -4.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Aetheris: 4-point star charms
      ctx.beginPath();
      ctx.moveTo(0, -4.2);
      ctx.lineTo(1.5, -1.5);
      ctx.lineTo(4.2, 0);
      ctx.lineTo(1.5, 1.5);
      ctx.lineTo(0, 4.2);
      ctx.lineTo(-1.5, 1.5);
      ctx.lineTo(-4.2, 0);
      ctx.lineTo(-1.5, -1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function renderWispCrest(
  ctx: CanvasRenderingContext2D,
  wisp: WispEntity,
  animTime: number,
  isHero: boolean,
): void {
  const r = wisp.radius;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = wisp.color;
  ctx.lineWidth = 1.5;

  if (isHero) {
    // Hero Ignis: Three-point solar crown crest
    ctx.beginPath();
    ctx.moveTo(-7.5, -r * 0.88);
    ctx.lineTo(-4.5, -r * 1.48);
    ctx.lineTo(0, -r * 1.1);
    ctx.lineTo(0, -r * 1.68 + Math.sin(animTime * 8) * 1.5);
    ctx.lineTo(4.5, -r * 1.1);
    ctx.lineTo(7.5, -r * 1.48);
    ctx.lineTo(8, -r * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (wisp.id === 'wisp_zephyr') {
    // Zephyr: Twin swept wind-feather antennae
    ctx.beginPath();
    ctx.moveTo(-2, -r * 0.9);
    ctx.quadraticCurveTo(-8, -r * 1.55, -11, -r * 1.25);
    ctx.moveTo(2, -r * 0.9);
    ctx.quadraticCurveTo(8, -r * 1.55, 11, -r * 1.25);
    ctx.stroke();
  } else if (wisp.id === 'wisp_terran') {
    // Terran: Stoic stepped stone battlement crest
    ctx.fillRect(-6, -r * 1.28, 12, 4.2);
    ctx.strokeRect(-6, -r * 1.28, 12, 4.2);
  } else if (wisp.id === 'wisp_marinus') {
    // Marinus: Fin crest with glowing pearl tip
    ctx.beginPath();
    ctx.moveTo(-3, -r * 0.9);
    ctx.lineTo(0, -r * 1.35);
    ctx.lineTo(3, -r * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -r * 1.4, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Aetheris: Floating crescent halo
    ctx.beginPath();
    ctx.arc(0, -r * 1.28, 5.5, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
  }
  ctx.restore();
}

function renderWispFace(
  ctx: CanvasRenderingContext2D,
  wisp: WispEntity,
  worldX: number,
  worldY: number,
  lookTarget: Vector2 | undefined | null,
  reaction: WispReactionState,
  isHero: boolean,
  blinkPhase: number,
  animTime: number,
): void {
  let lookOffsetX = 0;
  let lookOffsetY = 0;

  if (reaction === 'LOOK_AROUND') {
    lookOffsetX = Math.sin(animTime * 3.5) * 3.2;
  } else if (lookTarget) {
    const dx = lookTarget.x - worldX;
    const dy = lookTarget.y - worldY;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      lookOffsetX = (dx / dist) * 2.8;
      lookOffsetY = (dy / dist) * 2.4;
    }
  }

  // Distinct facial proportions per wisp
  const eyeSpacing =
    wisp.id === 'wisp_terran'
      ? 4.6
      : wisp.id === 'wisp_marinus'
        ? 3.4
        : isHero
          ? 4.4
          : 4.0;
  const baseEyeRadius = isHero ? 2.7 : wisp.id === 'wisp_aetheris' ? 2.6 : 2.3;

  const isBlinking = reaction === 'BLINK' || blinkPhase > 0;
  const isWideEyed =
    reaction === 'ALARMED_ALERT' ||
    reaction === 'GASP' ||
    reaction === 'STARTLED_JUMP' ||
    reaction === 'SPOT_ATTACKER';
  const isSquinting =
    reaction === 'BRACE_FOR_IMPACT' ||
    reaction === 'COWER' ||
    reaction === 'RELIEVED_EXHALE';

  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;

  // 1. Render Eyes
  if (isBlinking || isSquinting) {
    // Closed / squinting eye arcs
    ctx.beginPath();
    ctx.moveTo(-eyeSpacing - 2.5 + lookOffsetX, -1 + lookOffsetY);
    ctx.lineTo(-eyeSpacing + 2.5 + lookOffsetX, -1 + lookOffsetY);
    ctx.moveTo(eyeSpacing - 2.5 + lookOffsetX, -1 + lookOffsetY);
    ctx.lineTo(eyeSpacing + 2.5 + lookOffsetX, -1 + lookOffsetY);
    ctx.stroke();
  } else {
    const er = isWideEyed ? baseEyeRadius * 1.28 : baseEyeRadius;
    ctx.beginPath();
    ctx.arc(-eyeSpacing + lookOffsetX, -1 + lookOffsetY, er, 0, Math.PI * 2);
    ctx.arc(eyeSpacing + lookOffsetX, -1 + lookOffsetY, er, 0, Math.PI * 2);
    ctx.fill();

    // Eye catchlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeSpacing + lookOffsetX - 0.7, -2 + lookOffsetY, er * 0.42, 0, Math.PI * 2);
    ctx.arc(eyeSpacing + lookOffsetX - 0.7, -2 + lookOffsetY, er * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Render Brows
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = isHero ? 2.0 : 1.5;
  ctx.beginPath();
  if (reaction === 'ALARMED_ALERT' || reaction === 'BRACE_FOR_IMPACT') {
    // Determined / protective furrowed brows (especially strong on Hero Ignis)
    ctx.moveTo(-eyeSpacing - 3 + lookOffsetX, -6 + lookOffsetY);
    ctx.lineTo(-eyeSpacing + 2 + lookOffsetX, -4 + lookOffsetY);
    ctx.moveTo(eyeSpacing - 2 + lookOffsetX, -4 + lookOffsetY);
    ctx.lineTo(eyeSpacing + 3 + lookOffsetX, -6 + lookOffsetY);
  } else if (reaction === 'COWER' || reaction === 'GASP' || reaction === 'DEFEAT_MOURN') {
    // Worried upward-slanted brows
    ctx.moveTo(-eyeSpacing - 3 + lookOffsetX, -4 + lookOffsetY);
    ctx.lineTo(-eyeSpacing + 2 + lookOffsetX, -6.5 + lookOffsetY);
    ctx.moveTo(eyeSpacing - 2 + lookOffsetX, -6.5 + lookOffsetY);
    ctx.lineTo(eyeSpacing + 3 + lookOffsetX, -4 + lookOffsetY);
  } else if (wisp.id === 'wisp_terran') {
    // Serious straight brows
    ctx.moveTo(-eyeSpacing - 3 + lookOffsetX, -5 + lookOffsetY);
    ctx.lineTo(-eyeSpacing + 2 + lookOffsetX, -5 + lookOffsetY);
    ctx.moveTo(eyeSpacing - 2 + lookOffsetX, -5 + lookOffsetY);
    ctx.lineTo(eyeSpacing + 3 + lookOffsetX, -5 + lookOffsetY);
  }
  ctx.stroke();

  // 3. Render Mouth
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  if (reaction === 'GASP' || reaction === 'STARTLED_JUMP' || reaction === 'ALARMED_ALERT') {
    ctx.arc(lookOffsetX, 4.2 + lookOffsetY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (
    reaction === 'CELEBRATION_CHORUS' ||
    reaction === 'MENTOR_GRATITUDE' ||
    reaction === 'REINFORCEMENT_HOPE'
  ) {
    ctx.arc(lookOffsetX, 2.8 + lookOffsetY, 3.6, 0, Math.PI);
    ctx.stroke();
  } else if (reaction === 'COWER' || reaction === 'DEFEAT_MOURN') {
    ctx.arc(lookOffsetX, 6.2 + lookOffsetY, 3.0, Math.PI, 0);
    ctx.stroke();
  } else {
    ctx.arc(lookOffsetX, 3.2 + lookOffsetY, 2.6, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  ctx.restore();
}

function renderDispersedWispStage(
  ctx: CanvasRenderingContext2D,
  wisp: WispEntity,
  animTime: number,
  reaction: WispReactionState,
  progress: number,
): void {
  ctx.save();
  const ascendY =
    reaction === 'DISPERSING_ASCEND' || reaction === 'DISPERSED_FADING'
      ? -progress * 48
      : 0;
  ctx.translate(wisp.position.x, wisp.position.y + ascendY);

  if (reaction === 'DISPERSING_GATHER') {
    // Stage 1: Brief luminescent gather pulse
    const scale = 1.0 + progress * 1.2;
    ctx.fillStyle = wisp.glowColor;
    ctx.beginPath();
    ctx.arc(0, 0, wisp.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  } else if (reaction === 'DISPERSING_SWIRL' || reaction === 'DISPERSING_ASCEND') {
    // Stage 2 & 3: Swirling elemental ribbons ascending harmlessly
    const alpha = Math.max(0.15, 1 - progress * 0.85);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 6; i++) {
      const angle = animTime * 8 + (i * Math.PI) / 3;
      const r = wisp.radius * (0.5 + progress * 1.4);
      ctx.fillStyle = i % 2 === 0 ? wisp.color : '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * r, Math.sin(angle) * (r * 0.6), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Stage 4: Subtle sanctuary memory ring showing where the wisp dissolved
    ctx.translate(0, -ascendY); // Keep subtle ring at original sanctuary pedestal spot
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = wisp.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, wisp.radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
