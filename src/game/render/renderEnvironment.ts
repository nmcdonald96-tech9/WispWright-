/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WORLD_CONFIG } from '../config';
import { TerrainVisualSceneDescriptor } from '../presentation/terrainPresentation';
import { EnvironmentalAnchor } from '../types';

export function renderEnvironment(
  ctx: CanvasRenderingContext2D,
  anchors: EnvironmentalAnchor[],
  timeSec: number,
  cameraCenterX = 400,
  reducedMotion = false,
  isDeveloperMode = false,
  terrainScene?: TerrainVisualSceneDescriptor,
): void {
  const { width, height, groundY, buildZone } = WORLD_CONFIG;
  const animTime = reducedMotion ? 0 : timeSec;

  // 1. Deep Alchemical Twilight Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, -400, 0, groundY);
  skyGrad.addColorStop(0, '#090714');
  skyGrad.addColorStop(0.45, '#161129');
  skyGrad.addColorStop(0.82, '#241b3d');
  skyGrad.addColorStop(1, '#31234a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-1000, -500, width + 2200, groundY + 500);

  // 2. Subtle Background Depth Layers (Distant Alchemical Observatory & Aqueduct Silhouette)
  const parallaxFar = (cameraCenterX - 400) * 0.08;
  const parallaxMid = (cameraCenterX - 400) * 0.16;

  ctx.save();
  ctx.translate(parallaxFar, 0);
  ctx.fillStyle = 'rgba(26, 19, 44, 0.72)';
  ctx.beginPath();
  ctx.moveTo(-900, groundY);
  ctx.lineTo(-900, 420);
  ctx.lineTo(-740, 390);
  ctx.lineTo(-620, 440);
  ctx.lineTo(-420, 360);
  ctx.lineTo(-260, 450);
  ctx.lineTo(40, 420);
  ctx.lineTo(180, 310);
  ctx.lineTo(240, 310);
  ctx.lineTo(310, 410);
  ctx.lineTo(580, 340);
  ctx.lineTo(760, 430);
  ctx.lineTo(1100, 380);
  ctx.lineTo(1100, groundY);
  ctx.closePath();
  ctx.fill();

  // Distant Astrolabe Rings in the sky behind sanctuary
  ctx.strokeStyle = 'rgba(212, 163, 89, 0.09)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(380, 250, 170, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(380, 250, 130, animTime * 0.08, animTime * 0.08 + Math.PI * 1.4);
  ctx.stroke();
  ctx.restore();

  // Midground Ruined Alchemical Aqueduct Arches
  ctx.save();
  ctx.translate(parallaxMid, 0);
  ctx.fillStyle = 'rgba(35, 26, 56, 0.65)';
  for (let x = -720; x <= 840; x += 160) {
    ctx.fillRect(x, 490, 26, groundY - 490);
    ctx.beginPath();
    ctx.arc(x + 93, 520, 67, Math.PI, 0, false);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(35, 26, 56, 0.65)';
    ctx.stroke();
  }
  ctx.restore();

  // 3. Gentle Ambient Elemental Motes
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const px = ((i * 157) % 1600) - 650 + Math.sin(animTime * 0.35 + i) * 18;
    const py = ((i * 89) % (groundY - 120)) + 70 + Math.cos(animTime * 0.25 + i) * 12;
    const alpha = 0.1 + 0.12 * Math.sin(animTime * 1.1 + i * 2);
    ctx.fillStyle = i % 3 === 0 ? `rgba(56, 189, 248, ${alpha})` : `rgba(244, 192, 95, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, (i % 2) + 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Territory Demarcation: Western Siege Bastion vs. Flight Corridor vs. Sanctuary Zone
  ctx.save();
  const bastionGrad = ctx.createLinearGradient(-680, groundY - 140, -80, groundY);
  bastionGrad.addColorStop(0, 'rgba(239, 68, 68, 0.07)');
  bastionGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
  ctx.fillStyle = bastionGrad;
  ctx.fillRect(-680, groundY - 140, 600, 140);

  // Small fluttering siege banner near the attacker staging grounds
  const bannerX = -210;
  const bannerY = groundY - 82;
  ctx.strokeStyle = '#5c4033';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bannerX, groundY);
  ctx.lineTo(bannerX, bannerY);
  ctx.stroke();

  const flutter = Math.sin(animTime * 4.2) * 5;
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.moveTo(bannerX, bannerY);
  ctx.lineTo(bannerX + 28, bannerY + 6 + flutter * 0.5);
  ctx.lineTo(bannerX + 22, bannerY + 18 + flutter);
  ctx.lineTo(bannerX, bannerY + 22);
  ctx.closePath();
  ctx.fill();

  // Subtle carved stone mileposts along corridor (Developer mode adds text label)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
  for (const markerX of [-150, -30, 80]) {
    ctx.fillRect(markerX - 2, groundY - 12, 4, 12);
  }
  if (isDeveloperMode) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SIEGE FLIGHT CORRIDOR', -35, groundY - 22);
  }
  ctx.restore();

  // 5. Sanctuary Build Zone Demarcation
  ctx.save();
  // Sanctuary Banner on the eastern side of the fortress zone
  const sanctBannerX = buildZone.maxX - 18;
  const sanctBannerY = groundY - 90;
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sanctBannerX, groundY);
  ctx.lineTo(sanctBannerX, sanctBannerY);
  ctx.stroke();

  const sanctFlutter = Math.cos(animTime * 3.4) * 4;
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(sanctBannerX, sanctBannerY);
  ctx.lineTo(sanctBannerX + 26, sanctBannerY + 7 + sanctFlutter * 0.5);
  ctx.lineTo(sanctBannerX + 20, sanctBannerY + 19 + sanctFlutter);
  ctx.lineTo(sanctBannerX, sanctBannerY + 23);
  ctx.closePath();
  ctx.fill();

  // Subtle stone boundary plinths at buildZone.minX and buildZone.maxX
  ctx.fillStyle = '#3b3347';
  ctx.fillRect(buildZone.minX - 4, groundY - 16, 8, 16);
  ctx.fillRect(buildZone.maxX - 4, groundY - 16, 8, 16);

  // Only show technical dashed boundary & text in Developer Presentation mode
  if (isDeveloperMode) {
    ctx.strokeStyle = 'rgba(212, 163, 89, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(
      buildZone.minX,
      buildZone.minY,
      buildZone.maxX - buildZone.minX,
      buildZone.maxY - buildZone.minY,
    );
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(212, 163, 89, 0.45)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SANCTUARY BUILD ZONE', buildZone.maxX - 8, buildZone.minY + 16);
  }
  ctx.restore();

  // 6. Ground / Ancient Alchemical Bedrock & Masonry Courses
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, height + 200);
  groundGrad.addColorStop(0, '#2e2738');
  groundGrad.addColorStop(0.18, '#1f1a26');
  groundGrad.addColorStop(1, '#0e0b12');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-1000, groundY, width + 2200, height - groundY + 400);

  // Top stone trim & carved masonry joints
  ctx.fillStyle = '#4c415c';
  ctx.fillRect(-1000, groundY, width + 2200, 7);

  ctx.strokeStyle = 'rgba(15, 11, 22, 0.55)';
  ctx.lineWidth = 1.5;
  for (let gx = -960; gx < width + 960; gx += 64) {
    ctx.beginPath();
    ctx.moveTo(gx, groundY + 7);
    ctx.lineTo(gx, groundY + 28);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-1000, groundY + 28);
  ctx.lineTo(width + 1200, groundY + 28);
  ctx.stroke();

  // Sanctuary Pedestal Floor Inlay (underneath where the 5 wisps rest)
  const sanctGlow = ctx.createRadialGradient(350, groundY, 10, 350, groundY, 160);
  sanctGlow.addColorStop(0, 'rgba(56, 189, 248, 0.24)');
  sanctGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = sanctGlow;
  ctx.fillRect(190, groundY - 18, 320, 36);

  ctx.strokeStyle = '#786891';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-1000, groundY);
  ctx.lineTo(width + 1200, groundY);
  ctx.stroke();


  // 7. Render canonical non-bedrock terrain from the same geometry used by physics.
  for (const body of terrainScene?.bodies ?? []) {
    if (body.collisionRole === 'BEDROCK') continue;

    ctx.save();
    ctx.beginPath();
    body.worldVertices.forEach((vertex, index) => {
      if (index === 0) ctx.moveTo(vertex.x, vertex.y);
      else ctx.lineTo(vertex.x, vertex.y);
    });
    ctx.closePath();

    if (body.collisionRole === 'BALLISTIC_OBSTRUCTION') {
      const ridgeGradient = ctx.createLinearGradient(
        body.worldBounds.min.x,
        body.worldBounds.min.y,
        body.worldBounds.max.x,
        body.worldBounds.max.y,
      );
      ridgeGradient.addColorStop(0, '#6b3f35');
      ridgeGradient.addColorStop(0.52, '#4a302f');
      ridgeGradient.addColorStop(1, '#281f29');
      ctx.fillStyle = ridgeGradient;
      ctx.strokeStyle = '#9a6755';
      ctx.lineWidth = 3;
    } else if (body.collisionRole === 'LEDGE') {
      ctx.fillStyle = '#5e5368';
      ctx.strokeStyle = '#9a8aa7';
      ctx.lineWidth = 2.5;
    } else {
      ctx.fillStyle = '#4c415c';
      ctx.strokeStyle = '#786891';
      ctx.lineWidth = 2;
    }

    ctx.fill();
    ctx.stroke();

    // Contact shadow remains inside the authoritative polygon bounds.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(14, 11, 18, 0.22)';
    ctx.fillRect(
      body.worldBounds.min.x,
      body.worldBounds.max.y - 18,
      body.worldBounds.max.x - body.worldBounds.min.x,
      18,
    );
    ctx.restore();

    if (isDeveloperMode) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(
        body.worldBounds.min.x,
        body.worldBounds.min.y,
        body.worldBounds.max.x - body.worldBounds.min.x,
        body.worldBounds.max.y - body.worldBounds.min.y,
      );
      ctx.setLineDash([]);
      ctx.fillStyle = '#67e8f9';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${body.id} · ${body.collisionRole}`,
        body.worldBounds.min.x + 4,
        body.worldBounds.min.y - 6,
      );
      for (const vertex of body.worldVertices) {
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  if (isDeveloperMode && terrainScene?.paddedCameraEnvelope) {
    const envelope = terrainScene.paddedCameraEnvelope;
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(
      envelope.min.x,
      envelope.min.y,
      envelope.max.x - envelope.min.x,
      envelope.max.y - envelope.min.y,
    );
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 8. Render Environmental Anchors (Bedrock Foundations & Ruin Pillars)
  for (const anchor of anchors) {
    ctx.save();
    ctx.translate(anchor.position.x, anchor.position.y);

    if (anchor.type === 'ruin') {
      ctx.fillStyle = '#3b3347';
      ctx.strokeStyle = '#5d5170';
      ctx.lineWidth = 2;
      ctx.fillRect(-20, -14, 40, groundY - anchor.position.y + 14);
      ctx.strokeRect(-20, -14, 40, groundY - anchor.position.y + 14);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.moveTo(-10, 12);
      ctx.lineTo(0, 22);
      ctx.lineTo(10, 12);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#473e57';
      ctx.beginPath();
      ctx.moveTo(-26, 10);
      ctx.lineTo(-18, -10);
      ctx.lineTo(18, -10);
      ctx.lineTo(26, 10);
      ctx.closePath();
      ctx.fill();
    }

    // Glowing anchor rune socket
    const pulse = 0.65 + 0.35 * Math.sin(animTime * 2.5);
    ctx.beginPath();
    ctx.arc(0, 0, anchor.radius * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 * pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    ctx.restore();
  }
}
