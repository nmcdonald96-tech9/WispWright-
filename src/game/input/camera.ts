/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WORLD_CONFIG } from '../config';
import { Vector2 } from '../types';

import { CameraDirectorMode } from '../presentation/presentationTypes';

export type CameraFramingMode =
  | CameraDirectorMode
  // Compatibility aliases
  | 'ENEMY_INTRO_CAMERA'
  | 'PROJECTILE_FOLLOW_CAMERA'
  | 'CONSTRUCTION'
  | 'ENEMY_INTRO'
  | 'AIMING_PREVIEW'
  | 'TRACKING_PROJECTILE'
  | 'FORTRESS_FOCUS';

export class Camera {
  public worldWidth = WORLD_CONFIG.width;
  public worldHeight = WORLD_CONFIG.height;

  // Viewport dimensions
  public viewWidth = 800;
  public viewHeight = 600;

  // Current smoothed world center and scale
  public currentCenter: Vector2 = { x: 400, y: 540 };
  public targetCenter: Vector2 = { x: 400, y: 540 };
  public currentScale = 1.0;
  public targetScale = 1.0;

  // Last requested framing span
  private lastSpanW = 680;
  private lastSpanH = 660;

  // User manual offset & zoom on top of framing
  public pan: Vector2 = { x: 0, y: 0 };
  public userZoom = 1.0;
  public minZoom = 0.55;
  public maxZoom = 2.5;

  public framingMode: CameraFramingMode = 'CONSTRUCTION_CAMERA';

  public resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;

    const scaleX = (width * 0.94) / this.lastSpanW;
    const scaleY = (height * 0.84) / this.lastSpanH;
    this.targetScale = Math.min(scaleX, scaleY);
    this.currentScale = this.targetScale;
  }

  public setFraming(
    center: Vector2,
    spanWidth: number,
    spanHeight: number,
    mode: CameraFramingMode,
    immediate = false,
  ): void {
    this.framingMode = mode;
    this.lastSpanW = Math.max(300, spanWidth);
    this.lastSpanH = Math.max(300, spanHeight);

    const scaleX = (this.viewWidth * 0.94) / this.lastSpanW;
    const scaleY = (this.viewHeight * 0.84) / this.lastSpanH;
    this.targetScale = Math.min(scaleX, scaleY);
    this.targetCenter = { ...center };

    if (immediate) {
      this.currentCenter = { ...center };
      this.currentScale = this.targetScale;
    }
  }

  public update(dt: number): void {
    const factor = 1 - Math.exp(-dt * 6.5);
    this.currentCenter.x += (this.targetCenter.x - this.currentCenter.x) * factor;
    this.currentCenter.y += (this.targetCenter.y - this.currentCenter.y) * factor;
    this.currentScale += (this.targetScale - this.currentScale) * factor;
  }

  public get effectiveScale(): number {
    return this.currentScale * this.userZoom;
  }

  public get effectiveOffset(): Vector2 {
    const scale = this.effectiveScale;
    const centerX = this.viewWidth / 2 - this.currentCenter.x * scale + this.pan.x;
    const centerY = this.viewHeight / 2 - this.currentCenter.y * scale + this.pan.y;
    return { x: centerX, y: centerY };
  }

  public screenToWorld(clientX: number, clientY: number, canvasRect: DOMRect): Vector2 {
    const screenX = clientX - canvasRect.left;
    const screenY = clientY - canvasRect.top;
    const offset = this.effectiveOffset;
    const scale = this.effectiveScale;

    return {
      x: (screenX - offset.x) / scale,
      y: (screenY - offset.y) / scale,
    };
  }

  public worldToScreen(worldPos: Vector2, canvasRect?: DOMRect): Vector2 {
    const offset = this.effectiveOffset;
    const scale = this.effectiveScale;
    const x = worldPos.x * scale + offset.x;
    const y = worldPos.y * scale + offset.y;

    if (canvasRect) {
      return { x: x + canvasRect.left, y: y + canvasRect.top };
    }
    return { x, y };
  }

  public panBy(dx: number, dy: number): void {
    this.pan.x += dx;
    this.pan.y += dy;
    const maxPanX = this.viewWidth * 0.8;
    const maxPanY = this.viewHeight * 0.8;
    this.pan.x = Math.max(-maxPanX, Math.min(maxPanX, this.pan.x));
    this.pan.y = Math.max(-maxPanY, Math.min(maxPanY, this.pan.y));
  }

  public zoomBy(factor: number): void {
    this.setZoom(this.userZoom * factor);
  }

  public setZoom(zoom: number): void {
    this.userZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  public resetView(): void {
    this.pan = { x: 0, y: 0 };
    this.userZoom = 1.0;
  }

  public recenterFortress(): void {
    this.pan = { x: 0, y: 0 };
    this.userZoom = 1.0;
    this.setFraming({ x: 400, y: 540 }, 680, 660, 'CONSTRUCTION_CAMERA', false);
  }
}
