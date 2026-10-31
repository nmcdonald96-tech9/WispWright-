/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundSynth } from '../audio/synth';
import { MATERIAL_CONFIGS } from '../config';
import { createOBB, isPointInOBB } from '../math/geometry';
import { solveSnapAndValidation } from '../math/snapSolver';
import { CanvasRenderer } from '../render/canvasRenderer';
import { LevelStore } from '../state/levelStore';
import { GameMode, MaterialType, PlacedPiece, Vector2 } from '../types';

export function isEditableMode(mode: GameMode): boolean {
  return (
    mode === 'CONSTRUCTION' ||
    mode === 'INITIAL_CONSTRUCTION' ||
    mode === 'CONSTRUCTION_READY' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY'
  );
}

export class GestureController {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private store: LevelStore;

  // Active pointers map for multi-touch (pinch-zoom & panning)
  private activePointers: Map<number, { clientX: number; clientY: number }> = new Map();
  private pinchStartDistance: number | null = null;
  private pinchStartZoom = 1.0;

  // Pan tracking
  private isPanning = false;
  private lastPanPoint: { x: number; y: number } | null = null;

  // Dragging existing piece
  private draggingPlacedPiece: PlacedPiece | null = null;
  private pendingDragPiece: PlacedPiece | null = null;
  private pointerDownPos: { x: number; y: number } | null = null;
  private readonly DRAG_THRESHOLD = 8; // Pixels
  private originalPieceTransform: { pos: Vector2; rot: number; anchor?: string } | null = null;

  // Snapping toggle
  public snappingEnabled = true;

  // Temporary feedback banner when tapping non-movable piece (e.g. broken debris or cracked piece)
  public statusFeedback: string | null = null;
  private feedbackTimeout: number | null = null;

  constructor(canvas: HTMLCanvasElement, renderer: CanvasRenderer, store: LevelStore) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.store = store;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    // Desktop mouse wheel zoom
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public unbind(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (this.feedbackTimeout !== null) {
      window.clearTimeout(this.feedbackTimeout);
    }
  }

  private setTemporaryFeedback(msg: string | null): void {
    this.statusFeedback = msg;
    if (this.feedbackTimeout !== null) {
      window.clearTimeout(this.feedbackTimeout);
      this.feedbackTimeout = null;
    }
    if (msg && typeof window !== 'undefined') {
      this.feedbackTimeout = window.setTimeout(() => {
        this.statusFeedback = null;
      }, 2800);
    }
  }

  /**
   * Safely completes or cancels any active drag/rotation when reinforcement timer expires
   * or transition occurs, guaranteeing zero inventory loss or floating drag ghosts.
   */
  public completeOrCancelActiveDragSafely(): void {
    if (this.renderer.dragState) {
      const drag = this.renderer.dragState;
      if (drag.isValidPlacement) {
        if (drag.source === 'inventory') {
          const newPiece: PlacedPiece = {
            id: `player_piece_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: drag.pieceType,
            position: { ...drag.currentWorldPos },
            rotation: drag.rotation,
            isPrebuilt: false,
            attachedAnchorId: drag.activeSnap?.socket.anchorId,
          };
          this.store.placePiece(newPiece);
        } else if (drag.source === 'world' && drag.pieceId) {
          this.store.movePiece(
            drag.pieceId,
            drag.currentWorldPos,
            drag.rotation,
            drag.activeSnap?.socket.anchorId,
          );
        }
      } else if (drag.source === 'world' && this.draggingPlacedPiece && this.originalPieceTransform) {
        this.draggingPlacedPiece.position = { ...this.originalPieceTransform.pos };
        this.draggingPlacedPiece.rotation = this.originalPieceTransform.rot;
        this.draggingPlacedPiece.attachedAnchorId = this.originalPieceTransform.anchor;
      }
    }

    this.renderer.dragState = null;
    this.renderer.touchContactWorldPos = undefined;
    this.renderer.selectedPieceId = null;
    this.renderer.camera.isUserInteracting = false;
    this.store.setActiveDragTutorialContext(null, this.snappingEnabled);
    this.draggingPlacedPiece = null;
    this.pendingDragPiece = null;
    this.originalPieceTransform = null;
    this.isPanning = false;
    this.lastPanPoint = null;
    this.activePointers.clear();
  }

  /**
   * Begins dragging a new piece from the inventory tray
   */
  public startInventoryDrag(type: MaterialType, clientX: number, clientY: number): void {
    if (!isEditableMode(this.renderer.getEffectiveMode())) return;

    const available = this.store.getState().inventory[type] || 0;
    if (available <= 0) return;

    this.renderer.camera.isUserInteracting = true;
    this.store.setActiveDragTutorialContext(type, this.snappingEnabled);

    const rect = this.canvas.getBoundingClientRect();
    const touchWorld = this.renderer.camera.screenToWorld(clientX, clientY, rect);
    const liftedPos = this.applyTouchLift(clientX, clientY, rect);

    const snapResult = solveSnapAndValidation(
      type,
      liftedPos,
      0,
      this.store.getState().pieces,
      this.store.getState().anchors,
      this.snappingEnabled,
    );

    this.renderer.dragState = {
      source: 'inventory',
      pieceType: type,
      currentWorldPos: snapResult.position,
      rotation: snapResult.rotation,
      isValidPlacement: snapResult.isValid,
      activeSnap:
        snapResult.snapped && snapResult.socket
          ? {
              socket: snapResult.socket,
              targetPos: snapResult.position,
              targetAngle: snapResult.rotation,
            }
          : undefined,
    };
    this.renderer.touchContactWorldPos = touchWorld;
  }

  private onPointerDown = (e: PointerEvent): void => {
    const effectiveMode = this.renderer.getEffectiveMode();
    if (!isEditableMode(effectiveMode)) return;

    this.renderer.camera.isUserInteracting = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    this.pointerDownPos = { x: e.clientX, y: e.clientY };

    // Multi-touch pinch start
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      this.pinchStartDistance = Math.hypot(
        pts[0].clientX - pts[1].clientX,
        pts[0].clientY - pts[1].clientY,
      );
      this.pinchStartZoom = this.renderer.camera.userZoom;
      this.isPanning = false;
      this.pendingDragPiece = null;
      this.draggingPlacedPiece = null;
      this.renderer.dragState = null;
      return;
    }

    if (this.activePointers.size > 2) return;

    const rect = this.canvas.getBoundingClientRect();
    const worldPoint = this.renderer.camera.screenToWorld(e.clientX, e.clientY, rect);

    // Hit-test pieces in reverse order (topmost first), skipping LOST pieces
    const pieces = [...this.store.getState().pieces]
      .filter((p) => p.condition !== 'LOST')
      .reverse();
    let hitPiece: PlacedPiece | null = null;

    for (const piece of pieces) {
      const config = MATERIAL_CONFIGS[piece.type];
      const obb = createOBB(piece.position, config.width, config.height, piece.rotation);
      if (isPointInOBB(worldPoint, obb)) {
        hitPiece = piece;
        break;
      }
    }

    if (hitPiece) {
      this.renderer.selectedPieceId = hitPiece.id;
      const eligibility = this.store.canManipulatePiece(hitPiece);

      if (eligibility.canMove) {
        soundSynth.playSnap();
        this.setTemporaryFeedback(null);
        this.pendingDragPiece = hitPiece;
      } else {
        this.pendingDragPiece = null;
        if (eligibility.reason) {
          this.setTemporaryFeedback(eligibility.reason);
        }
      }
    } else {
      // Tapped empty space: start camera pan & deselect
      this.renderer.selectedPieceId = null;
      this.pendingDragPiece = null;
      this.setTemporaryFeedback(null);
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Handle 2-finger pinch zoom
    if (this.activePointers.size === 2 && this.pinchStartDistance !== null) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(
        pts[0].clientX - pts[1].clientX,
        pts[0].clientY - pts[1].clientY,
      );
      if (this.pinchStartDistance > 10) {
        const factor = currentDist / this.pinchStartDistance;
        this.renderer.camera.setZoom(this.pinchStartZoom * factor);
      }
      return;
    }

    const rect = this.canvas.getBoundingClientRect();

    // Check if pending piece drag has passed drag threshold
    if (this.pendingDragPiece && !this.draggingPlacedPiece && this.pointerDownPos) {
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      if (dist >= this.DRAG_THRESHOLD) {
        const piece = this.pendingDragPiece;
        this.draggingPlacedPiece = piece;
        this.originalPieceTransform = {
          pos: { ...piece.position },
          rot: piece.rotation,
          anchor: piece.attachedAnchorId,
        };
      }
    }

    // Handle Active Dragging (either from inventory or world)
    if (this.renderer.dragState || this.draggingPlacedPiece) {
      const isTouch = e.pointerType === 'touch';
      const touchWorld = this.renderer.camera.screenToWorld(e.clientX, e.clientY, rect);
      const liftedPos = this.applyTouchLift(e.clientX, e.clientY, rect, isTouch);

      const pieceType = this.renderer.dragState?.pieceType || this.draggingPlacedPiece!.type;
      const pieceId = this.renderer.dragState?.pieceId || this.draggingPlacedPiece?.id;
      const currentRot =
        this.renderer.dragState?.rotation ?? this.draggingPlacedPiece!.rotation;

      const snap = solveSnapAndValidation(
        pieceType,
        liftedPos,
        currentRot,
        this.store.getState().pieces,
        this.store.getState().anchors,
        this.snappingEnabled,
        pieceId,
      );

      this.renderer.dragState = {
        source: this.renderer.dragState?.source || 'world',
        pieceType,
        pieceId,
        currentWorldPos: snap.position,
        rotation: snap.rotation,
        isValidPlacement: snap.isValid,
        activeSnap:
          snap.snapped && snap.socket
            ? {
                socket: snap.socket,
                targetPos: snap.position,
                targetAngle: snap.rotation,
              }
            : undefined,
      };

      this.renderer.touchContactWorldPos = touchWorld;
      return;
    }

    // Handle Camera Pan
    if (this.isPanning && this.lastPanPoint) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.renderer.camera.panBy(dx, dy);
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size < 2) {
      this.pinchStartDistance = null;
    }

    if (this.renderer.dragState) {
      const drag = this.renderer.dragState;

      if (drag.isValidPlacement) {
        if (drag.source === 'inventory') {
          const newPiece: PlacedPiece = {
            id: `player_piece_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: drag.pieceType,
            position: { ...drag.currentWorldPos },
            rotation: drag.rotation,
            isPrebuilt: false,
            attachedAnchorId: drag.activeSnap?.socket.anchorId,
          };
          this.store.placePiece(newPiece);
          this.renderer.selectedPieceId = newPiece.id;
          soundSynth.playPlace(drag.pieceType);
        } else if (drag.source === 'world' && drag.pieceId) {
          this.store.movePiece(
            drag.pieceId,
            drag.currentWorldPos,
            drag.rotation,
            drag.activeSnap?.socket.anchorId,
          );
          soundSynth.playPlace(drag.pieceType);
        }
      } else {
        if (drag.source === 'world' && this.draggingPlacedPiece && this.originalPieceTransform) {
          this.draggingPlacedPiece.position = { ...this.originalPieceTransform.pos };
          this.draggingPlacedPiece.rotation = this.originalPieceTransform.rot;
          this.draggingPlacedPiece.attachedAnchorId = this.originalPieceTransform.anchor;
        }
      }

      this.renderer.dragState = null;
      this.renderer.touchContactWorldPos = undefined;
      this.draggingPlacedPiece = null;
      this.originalPieceTransform = null;
    }

    if (this.activePointers.size === 0) {
      this.renderer.camera.isUserInteracting = false;
      this.store.setActiveDragTutorialContext(null, this.snappingEnabled);
    }

    this.pendingDragPiece = null;
    this.pointerDownPos = null;
    this.isPanning = false;
    this.lastPanPoint = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    this.renderer.camera.zoomBy(factor);
  };

  /**
   * Applies ergonomic upward lift offset for touch dragging so fingers don't block the piece
   */
  private applyTouchLift(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    isTouch = true,
  ): Vector2 {
    const screenY = isTouch ? clientY - 48 : clientY;
    return this.renderer.camera.screenToWorld(clientX, screenY, canvasRect);
  }
}
