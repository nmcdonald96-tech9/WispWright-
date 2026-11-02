/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundSynth } from '../audio/synth';
import { MATERIAL_CONFIGS } from '../config';
import { createOBB, isPointInOBB } from '../math/geometry';
import {
  CANDIDATE_LOCK_RELEASE_RADIUS,
  LockedSnapCandidate,
  normalizeAngle,
  solveSnapAndValidation,
} from '../math/snapSolver';
import {
  evaluateWispProtectionAndRisks,
  validateWispPlacementPosition,
} from '../math/wispPlacement';
import { CanvasRenderer } from '../render/canvasRenderer';
import { LevelStore } from '../state/levelStore';
import {
  ConstructionDiagnostics,
  GameMode,
  InventoryLiftState,
  MaterialType,
  PlacedPiece,
  PointerInteractionType,
  RotationSource,
  SourceCardBounds,
  Vector2,
} from '../types';

export function isEditableMode(mode: GameMode): boolean {
  return (
    mode === 'CONSTRUCTION' ||
    mode === 'INITIAL_CONSTRUCTION' ||
    mode === 'CONSTRUCTION_READY' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY'
  );
}

interface PendingInventoryDrag {
  type: MaterialType;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startTime: number;
  isDragging: boolean;
  targetElement?: HTMLElement;
  cardBounds: SourceCardBounds;
  trayTopY: number;
  hasEnteredWorld: boolean;
}

interface PendingWorldPieceDrag {
  piece: PlacedPiece;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startTime: number;
  isDragging: boolean;
}

export interface TapPlacementState {
  active: boolean;
  pieceType: MaterialType;
  preferredRotation: number;
  currentWorldPos: Vector2;
  isValid: boolean;
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

  // Drag thresholds
  private readonly DRAG_THRESHOLD = 8; // Pixels to distinguish tap vs world drag
  private readonly LIFT_START_THRESHOLD = 3; // Immediate visual card lift threshold

  // Pending interactions for gesture disambiguation
  private pendingInventoryDrag: PendingInventoryDrag | null = null;
  private pendingWorldPieceDrag: PendingWorldPieceDrag | null = null;
  private pendingWispDrag: {
    wispId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    source: 'tray' | 'world';
    isDragging: boolean;
    targetElement?: HTMLElement;
  } | null = null;
  private pendingWispCanvasTap: {
    wispId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    worldPoint: Vector2;
  } | null = null;
  private draggingPlacedPiece: PlacedPiece | null = null;
  private originalPieceTransform: {
    pos: Vector2;
    rot: number;
    anchor?: string;
    preferredRot?: number;
    rotSource?: RotationSource;
    rev?: number;
  } | null = null;

  // Tap Accessibility Mode (Method B)
  public tapPlacementMode: TapPlacementState | null = null;

  // Authoritative Rotation Ownership State
  public preferredRotation = 0; // Authoritative player preferred rotation
  public currentRotation = 0;
  public rotationSource: RotationSource = 'DEFAULT';
  public manualRotationRevision = 0;
  public snapRotationAccepted = false;
  public proposedSnapAngle: number | null = null;
  public activePositionalSnapCandidate: string | null = null;
  public activeRotationalSnapCandidate: string | null = null;

  // Candidate lock hysteresis state
  public lockedCandidate: LockedSnapCandidate | null = null;

  // Inventory-Lift & Endpoint Snap Diagnostics State
  public inventoryLiftState: InventoryLiftState = 'IDLE';
  public sourceCardBounds: SourceCardBounds | null = null;
  public pointerUiCoords: Vector2 | null = null;
  public pointerWorldCoords: Vector2 | null = null;
  public ghostPresentationScale = 1.0;
  public transitionProgress = 1.0;

  // Diagnostics & Tracking
  public activePointerInteractionType: PointerInteractionType = 'NONE';
  public pointerCaptureActive = false;
  public inventoryDecrementCount = 0;
  public placementCommitCount = 0;
  public cancellationReason: string | null = null;
  public cameraMovementSuppressedDuringDrag = false;
  public lastSnapRejectionReason: string | null = null;

  // Snapping toggle
  public snappingEnabled = true;

  // Temporary feedback banner when tapping non-movable piece
  public statusFeedback: string | null = null;
  private feedbackTimeout: number | null = null;

  constructor(canvas: HTMLCanvasElement, renderer: CanvasRenderer, store: LevelStore) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.store = store;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);

    // Desktop mouse wheel zoom
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public unbind(): void {
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
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
   * Safely completes or cancels any active drag/rotation when reinforcement timer expires,
   * unmounting occurs, or transition triggers, guaranteeing zero inventory loss or stuck ghosts.
   */
  public completeOrCancelActiveDragSafely(): void {
    if (this.renderer.dragState) {
      const drag = this.renderer.dragState;
      const inLiftOrReturn =
        drag.inventoryLiftState === 'UI_LIFT' ||
        drag.inventoryLiftState === 'RETURNING_TO_INVENTORY';
      if (drag.isValidPlacement && drag.source !== 'tap_staging' && !inLiftOrReturn) {
        if (drag.source === 'inventory') {
          const newPiece: PlacedPiece = {
            id: `player_piece_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: drag.pieceType,
            position: { ...drag.currentWorldPos },
            rotation: drag.rotation,
            isPrebuilt: false,
            attachedAnchorId: drag.activeSnap?.socket.anchorId,
            preferredRotation: this.preferredRotation,
            rotationSource: this.rotationSource,
            manualRotationRevision: this.manualRotationRevision,
          };
          this.store.placePiece(
            newPiece,
            true,
            this.snappingEnabled ? drag.proposedTimberJoint : null,
          );
        } else if (drag.source === 'world' && drag.pieceId) {
          this.store.movePiece(
            drag.pieceId,
            drag.currentWorldPos,
            drag.rotation,
            drag.activeSnap?.socket.anchorId,
            true,
            this.snappingEnabled ? drag.proposedTimberJoint : null,
          );
        }
      } else if (drag.source === 'world' && this.draggingPlacedPiece && this.originalPieceTransform) {
        this.draggingPlacedPiece.position = { ...this.originalPieceTransform.pos };
        this.draggingPlacedPiece.rotation = this.originalPieceTransform.rot;
        this.draggingPlacedPiece.attachedAnchorId = this.originalPieceTransform.anchor;
        this.draggingPlacedPiece.preferredRotation = this.originalPieceTransform.preferredRot;
        this.draggingPlacedPiece.rotationSource = this.originalPieceTransform.rotSource;
        this.draggingPlacedPiece.manualRotationRevision = this.originalPieceTransform.rev;
      }
    }

    this.cancelActiveDrag('SAFETY_COMPLETE_TRANSITION');
  }

  /**
   * Cleans up active drag without modifying inventory or undo history.
   */
  public cancelActiveDrag(reason = 'CANCELLED'): void {
    this.cancellationReason = reason;

    if (this.renderer.dragState?.source === 'world' && this.draggingPlacedPiece && this.originalPieceTransform) {
      this.draggingPlacedPiece.position = { ...this.originalPieceTransform.pos };
      this.draggingPlacedPiece.rotation = this.originalPieceTransform.rot;
      this.draggingPlacedPiece.attachedAnchorId = this.originalPieceTransform.anchor;
      this.draggingPlacedPiece.preferredRotation = this.originalPieceTransform.preferredRot;
      this.draggingPlacedPiece.rotationSource = this.originalPieceTransform.rotSource;
      this.draggingPlacedPiece.manualRotationRevision = this.originalPieceTransform.rev;
    }

    this.renderer.dragState = null;
    this.renderer.wispDragState = null;
    this.renderer.touchContactWorldPos = undefined;
    this.renderer.camera.isUserInteracting = false;
    this.cameraMovementSuppressedDuringDrag = false;
    this.activePointerInteractionType = 'NONE';
    this.inventoryLiftState = 'IDLE';
    this.lockedCandidate = null;
    this.ghostPresentationScale = 1.0;
    this.transitionProgress = 1.0;
    this.store.setActiveDragTutorialContext(null, this.snappingEnabled);

    this.pendingInventoryDrag = null;
    this.pendingWorldPieceDrag = null;
    this.pendingWispDrag = null;
    this.pendingWispCanvasTap = null;
    this.draggingPlacedPiece = null;
    this.originalPieceTransform = null;
    this.tapPlacementMode = null;
    this.pointerCaptureActive = false;
    this.isPanning = false;
    this.lastPanPoint = null;
  }

  // =========================================================================
  // POST-STABILITY WISP PLACEMENT INTERACTION (DRAG & TAP)
  // =========================================================================

  public selectWispForPlacement(wispId: string | null): void {
    this.renderer.selectedWispId = wispId;
    soundSynth.playSnap();
  }

  public handleWispTrayPointerDown(
    wispId: string,
    e: React.PointerEvent<HTMLElement> | PointerEvent,
  ): void {
    if (this.renderer.getEffectiveMode() !== 'PLACE_WISPS') return;
    if (this.activePointers.size >= 2) return;

    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    this.renderer.selectedWispId = wispId;

    const targetElem = (e.currentTarget as HTMLElement) || (e.target as HTMLElement) || undefined;
    try {
      targetElem?.setPointerCapture?.(e.pointerId);
    } catch {
      // Safe ignore
    }

    this.pendingWispDrag = {
      wispId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      source: 'tray',
      isDragging: false,
      targetElement: targetElem,
    };
  }

  public startWispDrag(
    wispId: string,
    clientX: number,
    clientY: number,
    source: 'tray' | 'world' = 'tray',
    isTouch = true,
  ): void {
    if (this.renderer.getEffectiveMode() !== 'PLACE_WISPS') return;
    const state = this.store.getState();
    const wisp = state.wisps.find((w) => w.id === wispId);
    if (!wisp) return;

    this.renderer.selectedWispId = wispId;
    this.cameraMovementSuppressedDuringDrag = true;
    this.renderer.camera.isUserInteracting = true;

    const rect = this.canvas.getBoundingClientRect();
    const liftedY = isTouch ? clientY - 38 : clientY;
    const worldPos = this.renderer.camera.screenToWorld(clientX, liftedY, rect);

    const validation = validateWispPlacementPosition(
      wispId,
      worldPos,
      state.wisps,
      state.pieces,
      state.anchors,
    );
    const evaluation = evaluateWispProtectionAndRisks(
      worldPos,
      wispId,
      state.wisps,
      state.pieces,
    );
    this.store.lastWispPlacementDiagnostics = validation.diagnostics ?? null;

    this.renderer.wispDragState = {
      wispId: wisp.id,
      name: wisp.name,
      color: wisp.color,
      glowColor: wisp.glowColor,
      radius: wisp.radius,
      source,
      currentWorldPos: worldPos,
      isValidPlacement: validation.isValid,
      rejectionCode: validation.rejectionCode,
      playerFriendlyMessage: validation.playerFriendlyMessage,
      shelterStatus: evaluation.shelterStatus,
      sharedCollapseRisk: evaluation.sharedCollapseRisk,
      heavyOverheadHazard: evaluation.heavyOverheadHazard,
      limitedClearance: evaluation.limitedClearance,
      elevatedChamber: evaluation.elevatedChamber,
      protectionTags: evaluation.protectionTags,
      hazardWarning: evaluation.hazardWarning,
    };
  }

  private advanceToNextUnplacedWisp(): void {
    const wisps = this.store.getState().wisps;
    const nextUnplaced = wisps.find((w) => w.placed === false);
    if (nextUnplaced) {
      this.renderer.selectedWispId = nextUnplaced.id;
    }
  }

  // =========================================================================
  // METHOD A: DIRECT DRAG FROM INVENTORY TRAY WITH VISUAL CARD LIFT
  // =========================================================================

  private computeDefaultTrayTopY(): number {
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    return winH - 92;
  }

  private resolveCardBounds(
    clientX: number,
    clientY: number,
    targetElem?: HTMLElement,
    explicitBounds?: SourceCardBounds,
  ): SourceCardBounds {
    if (explicitBounds) return explicitBounds;
    const cardEl = targetElem?.closest?.('[data-inventory-card="true"]') || targetElem;
    const rect = cardEl?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }
    return {
      x: clientX - 38,
      y: clientY - 31,
      width: 76,
      height: 62,
    };
  }

  /**
   * Computes smooth card-to-world lift transition metrics (scale, lift offset, state).
   */
  private computeLiftTransition(
    clientX: number,
    clientY: number,
    cardBounds: SourceCardBounds,
    trayTopY: number,
    hasEnteredWorld: boolean,
  ): {
    liftState: InventoryLiftState;
    inInventoryTray: boolean;
    transitionProgress: number;
    presentationScale: number;
    liftOffsetY: number;
    updatedHasEnteredWorld: boolean;
  } {
    const inTray = clientY >= trayTopY;
    const cardCenterY = cardBounds.y + cardBounds.height / 2;
    const worldEntryY = trayTopY - 28;
    const span = Math.max(24, cardCenterY - worldEntryY);
    const rawProgress = (cardCenterY - clientY) / span;
    const progress = Math.max(0, Math.min(1, rawProgress));

    let updatedHasEnteredWorld = hasEnteredWorld;
    if (!inTray && progress >= 0.65) {
      updatedHasEnteredWorld = true;
    }

    let liftState: InventoryLiftState;
    if (inTray) {
      if (updatedHasEnteredWorld) {
        liftState = 'RETURNING_TO_INVENTORY';
      } else {
        liftState = 'UI_LIFT';
      }
    } else if (progress < 0.95) {
      liftState = 'TRANSITIONING_TO_WORLD';
    } else {
      liftState = 'WORLD_ACTIVE';
      updatedHasEnteredWorld = true;
    }

    // Scale interpolates smoothly from 0.55 (miniature card lift) to 1.0 (full world scale)
    const presentationScale = 0.55 + 0.45 * progress;
    // Ergonomic upward finger-clearance offset interpolates from 8px on card to 48px in world
    const liftOffsetY = 8 + 40 * progress;

    return {
      liftState,
      inInventoryTray: inTray,
      transitionProgress: progress,
      presentationScale,
      liftOffsetY,
      updatedHasEnteredWorld,
    };
  }

  /**
   * Initiates tracking from an inventory card pointerdown event.
   * Does NOT commit a live piece or decrement inventory!
   */
  public handleInventoryPointerDown(
    type: MaterialType,
    e: React.PointerEvent<HTMLElement> | PointerEvent,
    explicitCardBounds?: SourceCardBounds,
    explicitTrayTopY?: number,
  ): void {
    if (!isEditableMode(this.renderer.getEffectiveMode())) return;

    const available = this.store.getState().inventory[type] || 0;
    if (available <= 0) return;

    // Multi-touch safety: ignore if already interacting
    if (this.activePointers.size >= 2) return;

    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Initialize rotation ownership for new piece
    this.preferredRotation = 0;
    this.currentRotation = 0;
    this.rotationSource = 'DEFAULT';
    this.manualRotationRevision = 0;
    this.snapRotationAccepted = false;
    this.proposedSnapAngle = null;
    this.activePositionalSnapCandidate = null;
    this.activeRotationalSnapCandidate = null;
    this.lockedCandidate = null;
    this.cancellationReason = null;
    this.inventoryDecrementCount = 0;

    const targetElem = (e.currentTarget as HTMLElement) || (e.target as HTMLElement) || undefined;
    try {
      targetElem?.setPointerCapture?.(e.pointerId);
      this.pointerCaptureActive = true;
    } catch {
      this.pointerCaptureActive = false;
    }

    const cardBounds = this.resolveCardBounds(e.clientX, e.clientY, targetElem, explicitCardBounds);
    const trayEl = targetElem?.closest?.('[data-inventory-tray="true"]');
    const trayRect = trayEl?.getBoundingClientRect?.();
    const trayTopY =
      explicitTrayTopY ??
      (trayRect && trayRect.height > 0 ? trayRect.top : this.computeDefaultTrayTopY());

    this.sourceCardBounds = cardBounds;
    this.pointerUiCoords = { x: e.clientX, y: e.clientY };

    this.pendingInventoryDrag = {
      type,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTime: performance.now(),
      isDragging: false,
      targetElement: targetElem,
      cardBounds,
      trayTopY,
      hasEnteredWorld: e.clientY < trayTopY,
    };
  }

  /**
   * Begins dragging a new piece from the inventory tray directly (Method A programmatic/touch entry).
   */
  public startInventoryDrag(
    type: MaterialType,
    clientX: number,
    clientY: number,
    explicitCardBounds?: SourceCardBounds,
    explicitTrayTopY?: number,
  ): void {
    if (!isEditableMode(this.renderer.getEffectiveMode())) return;

    const available = this.store.getState().inventory[type] || 0;
    if (available <= 0) return;

    const trayTopY = explicitTrayTopY ?? this.computeDefaultTrayTopY();
    const cardBounds =
      explicitCardBounds ??
      this.resolveCardBounds(
        clientX,
        Math.max(clientY, trayTopY + 24),
        undefined,
        explicitCardBounds,
      );

    this.sourceCardBounds = cardBounds;
    this.pointerUiCoords = { x: clientX, y: clientY };
    this.lockedCandidate = null;

    this.pendingInventoryDrag = {
      type,
      pointerId: -1,
      startClientX: clientX,
      startClientY: clientY,
      startTime: performance.now(),
      isDragging: false,
      cardBounds,
      trayTopY,
      hasEnteredWorld: clientY < trayTopY,
    };
    this.preferredRotation = 0;
    this.currentRotation = 0;
    this.rotationSource = 'DEFAULT';
    this.manualRotationRevision = 0;
    this.snapRotationAccepted = false;
    this.proposedSnapAngle = null;
    this.activePositionalSnapCandidate = null;
    this.activeRotationalSnapCandidate = null;
    this.cancellationReason = null;
    this.inventoryDecrementCount = 0;

    this.activateDirectInventoryDrag(clientX, clientY, true);
  }

  /**
   * Activates or updates live direct-drag placement ghost with UI-to-world transition.
   */
  private activateDirectInventoryDrag(clientX: number, clientY: number, isTouch = true): void {
    if (!this.pendingInventoryDrag) return;

    const pending = this.pendingInventoryDrag;
    const type = pending.type;
    pending.isDragging = true;
    this.activePointerInteractionType = 'INVENTORY_DRAG';
    this.cameraMovementSuppressedDuringDrag = true;
    this.renderer.camera.isUserInteracting = true;
    this.store.setActiveDragTutorialContext(type, this.snappingEnabled);

    // Cancel tap placement mode if currently open
    this.tapPlacementMode = null;

    const transition = this.computeLiftTransition(
      clientX,
      clientY,
      pending.cardBounds,
      pending.trayTopY,
      pending.hasEnteredWorld,
    );
    pending.hasEnteredWorld = transition.updatedHasEnteredWorld;
    this.inventoryLiftState = transition.liftState;
    this.ghostPresentationScale = transition.presentationScale;
    this.transitionProgress = transition.transitionProgress;
    this.pointerUiCoords = { x: clientX, y: clientY };

    const rect = this.canvas.getBoundingClientRect();
    const touchWorld = this.renderer.camera.screenToWorld(clientX, clientY, rect);
    const screenY = isTouch ? clientY - transition.liftOffsetY : clientY;
    const liftedPos = this.renderer.camera.screenToWorld(clientX, screenY, rect);
    this.pointerWorldCoords = liftedPos;

    const snap = solveSnapAndValidation(
      type,
      liftedPos,
      this.preferredRotation,
      this.store.getState().pieces,
      this.store.getState().anchors,
      this.snappingEnabled,
      undefined,
      {
        preferredRotation: this.preferredRotation,
        rotationSource: this.rotationSource,
        acceptSnapRotation: this.snapRotationAccepted,
        lockedCandidate: this.lockedCandidate,
        inInventoryTray: transition.inInventoryTray,
        wisps: this.store.getState().wisps,
        existingJoints: this.store.getJoints(),
      },
    );

    if (snap.snapped && snap.socket && snap.pieceSocket) {
      this.lockedCandidate = {
        targetSocketId: snap.socket.id,
        pieceSocketId: snap.pieceSocket.id,
      };
    } else {
      this.lockedCandidate = null;
    }

    this.currentRotation = snap.rotation;
    this.proposedSnapAngle = snap.requiresRotationChange ? snap.proposedRotation : null;
    this.activePositionalSnapCandidate = snap.socket?.id ?? null;
    this.activeRotationalSnapCandidate = snap.requiresRotationChange ? snap.socket?.id ?? null : null;
    this.lastSnapRejectionReason = snap.lastSnapRejectionReason ?? null;

    this.renderer.dragState = {
      source: 'inventory',
      pieceType: type,
      currentWorldPos: snap.position,
      rotation: snap.rotation,
      preferredRotation: this.preferredRotation,
      rotationSource: this.rotationSource,
      manualRotationRevision: this.manualRotationRevision,
      isValidPlacement: snap.isValid,
      activeSnap:
        snap.snapped && snap.socket
          ? {
              socket: snap.socket,
              pieceSocket: snap.pieceSocket,
              targetPos: snap.position,
              targetAngle: snap.rotation,
              proposedAngle: snap.proposedRotation,
              requiresRotationChange: snap.requiresRotationChange,
              isAnchorRequired: snap.isAnchorRequired,
              compatibilityLabel: snap.socketCompatibility,
              candidateDistance: snap.candidateDistance,
              candidateLockActive: snap.candidateLockActive,
            }
          : undefined,
      snapRotationAccepted: this.snapRotationAccepted,
      inventoryLiftState: transition.liftState,
      sourceCardBounds: pending.cardBounds,
      pointerUiCoords: { x: clientX, y: clientY },
      ghostPresentationScale: transition.presentationScale,
      transitionProgress: transition.transitionProgress,
      supportedContactPredicted: snap.supportedContactPredicted,
      explicitJointProposed: snap.explicitJointProposed,
      proposedTimberJoint: snap.proposedTimberJoint,
      connectionCategory: snap.connectionCategory,
      overlapClassification: snap.overlapClassification,
      placementRejectionReason: snap.placementRejectionReason,
      playerFriendlyRejectionMessage: snap.playerFriendlyRejectionMessage,
      overlapColliderId: snap.overlapColliderId,
      penetrationDepth: snap.penetrationDepth,
    };
    this.renderer.touchContactWorldPos = touchWorld;
  }

  // =========================================================================
  // METHOD B: TAP TO SELECT — ACCESSIBILITY ALTERNATIVE
  // =========================================================================

  /**
   * Enters explicit Tap Placement Mode with a staged ghost.
   * Does NOT commit or decrement inventory until intentional confirmation!
   */
  public startTapPlacementMode(type: MaterialType): void {
    if (!isEditableMode(this.renderer.getEffectiveMode())) return;

    const available = this.store.getState().inventory[type] || 0;
    if (available <= 0) return;

    // Clean up any other drags
    this.cancelActiveDrag('ENTER_TAP_PLACEMENT');

    this.activePointerInteractionType = 'TAP_PLACEMENT';
    this.inventoryLiftState = 'WORLD_ACTIVE';
    this.ghostPresentationScale = 1.0;
    this.transitionProgress = 1.0;
    this.preferredRotation = 0;
    this.currentRotation = 0;
    this.rotationSource = 'DEFAULT';
    this.manualRotationRevision = 0;
    this.snapRotationAccepted = false;
    this.lockedCandidate = null;
    this.cancellationReason = null;
    this.inventoryDecrementCount = 0;

    // Sensible staging position: suggested tutorial region or center sanctuary
    const auth = this.store.getAuthoritativeTutorialState();
    const stagingPos: Vector2 =
      auth.currentSuggestedPlacementRegion?.pieceType === type
        ? { ...auth.currentSuggestedPlacementRegion.center }
        : { x: 300, y: 680 };

    this.pointerWorldCoords = stagingPos;

    const snap = solveSnapAndValidation(
      type,
      stagingPos,
      this.preferredRotation,
      this.store.getState().pieces,
      this.store.getState().anchors,
      this.snappingEnabled,
      undefined,
      {
        preferredRotation: this.preferredRotation,
        rotationSource: this.rotationSource,
        acceptSnapRotation: this.snapRotationAccepted,
        lockedCandidate: this.lockedCandidate,
        wisps: this.store.getState().wisps,
        existingJoints: this.store.getJoints(),
      },
    );

    if (snap.snapped && snap.socket && snap.pieceSocket) {
      this.lockedCandidate = {
        targetSocketId: snap.socket.id,
        pieceSocketId: snap.pieceSocket.id,
      };
    }

    this.currentRotation = snap.rotation;
    this.proposedSnapAngle = snap.requiresRotationChange ? snap.proposedRotation : null;
    this.activePositionalSnapCandidate = snap.socket?.id ?? null;

    this.renderer.dragState = {
      source: 'tap_staging',
      pieceType: type,
      currentWorldPos: snap.position,
      rotation: snap.rotation,
      preferredRotation: this.preferredRotation,
      rotationSource: this.rotationSource,
      manualRotationRevision: this.manualRotationRevision,
      isValidPlacement: snap.isValid,
      activeSnap:
        snap.snapped && snap.socket
          ? {
              socket: snap.socket,
              pieceSocket: snap.pieceSocket,
              targetPos: snap.position,
              targetAngle: snap.rotation,
              proposedAngle: snap.proposedRotation,
              requiresRotationChange: snap.requiresRotationChange,
              isAnchorRequired: snap.isAnchorRequired,
              compatibilityLabel: snap.socketCompatibility,
              candidateDistance: snap.candidateDistance,
              candidateLockActive: snap.candidateLockActive,
            }
          : undefined,
      snapRotationAccepted: this.snapRotationAccepted,
      inventoryLiftState: 'WORLD_ACTIVE',
      ghostPresentationScale: 1.0,
      transitionProgress: 1.0,
      supportedContactPredicted: snap.supportedContactPredicted,
      explicitJointProposed: snap.explicitJointProposed,
      proposedTimberJoint: snap.proposedTimberJoint,
      connectionCategory: snap.connectionCategory,
      overlapClassification: snap.overlapClassification,
      placementRejectionReason: snap.placementRejectionReason,
      playerFriendlyRejectionMessage: snap.playerFriendlyRejectionMessage,
      overlapColliderId: snap.overlapColliderId,
      penetrationDepth: snap.penetrationDepth,
    };

    this.tapPlacementMode = {
      active: true,
      pieceType: type,
      preferredRotation: this.preferredRotation,
      currentWorldPos: snap.position,
      isValid: snap.isValid,
    };

    soundSynth.playSnap();
  }

  /**
   * Confirms placement of the Tap Placement ghost piece.
   * Decrements inventory exactly once and records one undoable action.
   */
  public confirmTapPlacement(): boolean {
    if (!this.tapPlacementMode || !this.renderer.dragState) return false;

    const drag = this.renderer.dragState;
    if (!drag.isValidPlacement) return false;

    const newPiece: PlacedPiece = {
      id: `player_piece_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: drag.pieceType,
      position: { ...drag.currentWorldPos },
      rotation: drag.rotation,
      isPrebuilt: false,
      attachedAnchorId: drag.activeSnap?.socket.anchorId,
      preferredRotation: this.preferredRotation,
      rotationSource: this.rotationSource,
      manualRotationRevision: this.manualRotationRevision,
    };

    const success = this.store.placePiece(
      newPiece,
      true,
      this.snappingEnabled ? drag.proposedTimberJoint : null,
    );
    if (success) {
      this.placementCommitCount++;
      this.inventoryDecrementCount = 1;
      this.renderer.selectedPieceId = newPiece.id;
      soundSynth.playPlace(drag.pieceType);
    }

    this.cancelActiveDrag('TAP_PLACEMENT_CONFIRMED');
    return success;
  }

  /**
   * Cancels Tap Placement mode without consuming inventory.
   */
  public cancelTapPlacement(): void {
    this.cancelActiveDrag('USER_CANCELLED_TAP_MODE');
    soundSynth.playSnap();
  }

  // =========================================================================
  // ROTATION OWNERSHIP CONTROLS
  // =========================================================================

  /**
   * Rotates the currently dragged or staged ghost piece.
   * Sets preferredRotation, marks rotationSource as USER, and increments revision.
   */
  public rotateActiveGhost(deltaRad: number): void {
    if (!this.renderer.dragState) return;

    this.preferredRotation = normalizeAngle(this.preferredRotation + deltaRad);
    this.currentRotation = this.preferredRotation;
    this.rotationSource = 'USER';
    this.manualRotationRevision++;
    this.snapRotationAccepted = false; // Suppress auto snap rotation after manual adjustment
    this.lockedCandidate = null; // Re-evaluate best socket for new orientation

    const drag = this.renderer.dragState;
    const snap = solveSnapAndValidation(
      drag.pieceType,
      drag.currentWorldPos,
      this.preferredRotation,
      this.store.getState().pieces,
      this.store.getState().anchors,
      this.snappingEnabled,
      drag.pieceId,
      {
        preferredRotation: this.preferredRotation,
        rotationSource: this.rotationSource,
        acceptSnapRotation: false,
        lockedCandidate: null,
        wisps: this.store.getState().wisps,
        existingJoints: this.store.getJoints(),
      },
    );

    if (snap.snapped && snap.socket && snap.pieceSocket) {
      this.lockedCandidate = {
        targetSocketId: snap.socket.id,
        pieceSocketId: snap.pieceSocket.id,
      };
    }

    this.currentRotation = snap.rotation;
    this.proposedSnapAngle = snap.requiresRotationChange ? snap.proposedRotation : null;
    this.activePositionalSnapCandidate = snap.socket?.id ?? null;
    this.activeRotationalSnapCandidate = snap.requiresRotationChange ? snap.socket?.id ?? null : null;
    this.lastSnapRejectionReason = snap.lastSnapRejectionReason ?? null;

    this.renderer.dragState = {
      ...drag,
      currentWorldPos: snap.position,
      rotation: snap.rotation,
      preferredRotation: this.preferredRotation,
      rotationSource: this.rotationSource,
      manualRotationRevision: this.manualRotationRevision,
      isValidPlacement: snap.isValid,
      activeSnap:
        snap.snapped && snap.socket
          ? {
              socket: snap.socket,
              pieceSocket: snap.pieceSocket,
              targetPos: snap.position,
              targetAngle: snap.rotation,
              proposedAngle: snap.proposedRotation,
              requiresRotationChange: snap.requiresRotationChange,
              isAnchorRequired: snap.isAnchorRequired,
              compatibilityLabel: snap.socketCompatibility,
              candidateDistance: snap.candidateDistance,
              candidateLockActive: snap.candidateLockActive,
            }
          : undefined,
      supportedContactPredicted: snap.supportedContactPredicted,
      explicitJointProposed: snap.explicitJointProposed,
      proposedTimberJoint: snap.proposedTimberJoint,
      connectionCategory: snap.connectionCategory,
      overlapClassification: snap.overlapClassification,
      placementRejectionReason: snap.placementRejectionReason,
      playerFriendlyRejectionMessage: snap.playerFriendlyRejectionMessage,
      overlapColliderId: snap.overlapColliderId,
      penetrationDepth: snap.penetrationDepth,
    };

    if (this.tapPlacementMode) {
      this.tapPlacementMode.preferredRotation = this.preferredRotation;
      this.tapPlacementMode.currentWorldPos = snap.position;
      this.tapPlacementMode.isValid = snap.isValid;
    }

    soundSynth.playRotate();
  }

  /**
   * Explicitly accepts a proposed candidate snap angle.
   */
  public acceptProposedSnapRotation(): void {
    const drag = this.renderer.dragState;
    if (!drag || !drag.activeSnap || drag.activeSnap.proposedAngle === undefined) return;
    const proposed = drag.activeSnap.proposedAngle;

    this.preferredRotation = proposed;
    this.currentRotation = proposed;
    this.rotationSource = 'SNAP_PREVIEW';
    this.manualRotationRevision++;
    this.snapRotationAccepted = true;

    const snap = solveSnapAndValidation(
      drag.pieceType,
      drag.currentWorldPos,
      this.preferredRotation,
      this.store.getState().pieces,
      this.store.getState().anchors,
      this.snappingEnabled,
      drag.pieceId,
      {
        preferredRotation: this.preferredRotation,
        rotationSource: this.rotationSource,
        acceptSnapRotation: true,
        lockedCandidate: this.lockedCandidate,
        wisps: this.store.getState().wisps,
        existingJoints: this.store.getJoints(),
      },
    );

    this.renderer.dragState = {
      ...drag,
      currentWorldPos: snap.position,
      rotation: snap.rotation,
      preferredRotation: this.preferredRotation,
      rotationSource: this.rotationSource,
      manualRotationRevision: this.manualRotationRevision,
      isValidPlacement: snap.isValid,
      activeSnap:
        snap.snapped && snap.socket
          ? {
              socket: snap.socket,
              pieceSocket: snap.pieceSocket,
              targetPos: snap.position,
              targetAngle: snap.rotation,
              proposedAngle: snap.proposedRotation,
              requiresRotationChange: snap.requiresRotationChange,
              isAnchorRequired: snap.isAnchorRequired,
              compatibilityLabel: snap.socketCompatibility,
              candidateDistance: snap.candidateDistance,
              candidateLockActive: snap.candidateLockActive,
            }
          : undefined,
      snapRotationAccepted: true,
      supportedContactPredicted: snap.supportedContactPredicted,
      explicitJointProposed: snap.explicitJointProposed,
      proposedTimberJoint: snap.proposedTimberJoint,
      connectionCategory: snap.connectionCategory,
      overlapClassification: snap.overlapClassification,
      placementRejectionReason: snap.placementRejectionReason,
      playerFriendlyRejectionMessage: snap.playerFriendlyRejectionMessage,
      overlapColliderId: snap.overlapColliderId,
      penetrationDepth: snap.penetrationDepth,
    };

    soundSynth.playRotate();
  }

  /**
   * Rotates a selected placed piece using atomic rotation collision validation.
   */
  public rotateSelectedPiece(deltaRad: number): boolean {
    const selected = this.renderer.getSelectedPiece();
    if (!selected) return false;

    const eligibility = this.store.canManipulatePiece(selected);
    if (!eligibility.canRotate) {
      if (eligibility.reason) {
        this.setTemporaryFeedback(eligibility.reason);
      }
      return false;
    }

    const ok = this.store.rotatePiece(selected.id, deltaRad);
    if (!ok) {
      const msg =
        this.store.lastRotationDiagnostics?.playerFriendlyMessage ??
        'Rotation blocked.';
      this.setTemporaryFeedback(msg);
      return false;
    }

    this.preferredRotation = selected.rotation;
    this.currentRotation = selected.rotation;
    this.rotationSource = 'USER';
    this.manualRotationRevision = selected.manualRotationRevision ?? this.manualRotationRevision + 1;
    soundSynth.playRotate();
    return true;
  }

  public detachSelectedPieceConnection(): boolean {
    const selected = this.renderer.getSelectedPiece();
    if (!selected) return false;
    if (selected.attachedAnchorId) {
      const ok = this.store.detachPieceConnection(selected.id);
      if (ok) {
        this.setTemporaryFeedback('Connection detached — piece can now rotate freely.');
        soundSynth.playSnap();
      }
      return ok;
    }
    return this.detachSelectedTimberJoint();
  }

  public detachSelectedTimberJoint(): boolean {
    const selected = this.renderer.getSelectedPiece();
    if (!selected) return false;
    const ok = this.store.detachTimberJoints(selected.id);
    if (ok) {
      this.setTemporaryFeedback('Timber Joint detached — beam can now move or rotate freely.');
      soundSynth.playSnap();
    }
    return ok;
  }

  // =========================================================================
  // POINTER EVENT HANDLERS
  // =========================================================================

  private onCanvasPointerDown = (e: PointerEvent): void => {
    const effectiveMode = this.renderer.getEffectiveMode();
    const isWispMode =
      effectiveMode === 'PLACE_WISPS' || effectiveMode === 'PRE_SIEGE_REVIEW';
    if (!isEditableMode(effectiveMode) && !isWispMode) return;

    // If tap placement mode is active, handle tap on canvas to position or place ghost
    if (this.tapPlacementMode && this.renderer.dragState) {
      const rect = this.canvas.getBoundingClientRect();
      const worldPoint = this.renderer.camera.screenToWorld(e.clientX, e.clientY, rect);
      this.pointerUiCoords = { x: e.clientX, y: e.clientY };
      this.pointerWorldCoords = worldPoint;

      // Check if tap was on the ghost piece
      const ghostConfig = MATERIAL_CONFIGS[this.tapPlacementMode.pieceType];
      const ghostOBB = createOBB(
        this.renderer.dragState.currentWorldPos,
        ghostConfig.width,
        ghostConfig.height,
        this.renderer.dragState.rotation,
      );

      if (isPointInOBB(worldPoint, ghostOBB) && this.renderer.dragState.isValidPlacement) {
        // Double-tap / tap on valid ghost confirms placement!
        this.confirmTapPlacement();
        return;
      }

      // Otherwise reposition ghost to tapped battlefield location
      const snap = solveSnapAndValidation(
        this.tapPlacementMode.pieceType,
        worldPoint,
        this.preferredRotation,
        this.store.getState().pieces,
        this.store.getState().anchors,
        this.snappingEnabled,
        undefined,
        {
          preferredRotation: this.preferredRotation,
          rotationSource: this.rotationSource,
          acceptSnapRotation: this.snapRotationAccepted,
          lockedCandidate: this.lockedCandidate,
          wisps: this.store.getState().wisps,
          existingJoints: this.store.getJoints(),
        },
      );

      if (snap.snapped && snap.socket && snap.pieceSocket) {
        this.lockedCandidate = {
          targetSocketId: snap.socket.id,
          pieceSocketId: snap.pieceSocket.id,
        };
      } else {
        this.lockedCandidate = null;
      }

      this.currentRotation = snap.rotation;
      this.proposedSnapAngle = snap.requiresRotationChange ? snap.proposedRotation : null;
      this.activePositionalSnapCandidate = snap.socket?.id ?? null;
      this.activeRotationalSnapCandidate = snap.requiresRotationChange ? snap.socket?.id ?? null : null;
      this.lastSnapRejectionReason = snap.lastSnapRejectionReason ?? null;

      this.renderer.dragState.currentWorldPos = snap.position;
      this.renderer.dragState.rotation = snap.rotation;
      this.renderer.dragState.isValidPlacement = snap.isValid;
      this.renderer.dragState.activeSnap =
        snap.snapped && snap.socket
          ? {
              socket: snap.socket,
              pieceSocket: snap.pieceSocket,
              targetPos: snap.position,
              targetAngle: snap.rotation,
              proposedAngle: snap.proposedRotation,
              requiresRotationChange: snap.requiresRotationChange,
              isAnchorRequired: snap.isAnchorRequired,
              compatibilityLabel: snap.socketCompatibility,
              candidateDistance: snap.candidateDistance,
              candidateLockActive: snap.candidateLockActive,
            }
          : undefined;
      this.renderer.dragState.supportedContactPredicted = snap.supportedContactPredicted;
      this.renderer.dragState.explicitJointProposed = snap.explicitJointProposed;
      this.renderer.dragState.proposedTimberJoint = snap.proposedTimberJoint;
      this.renderer.dragState.connectionCategory = snap.connectionCategory;
      this.renderer.dragState.overlapClassification = snap.overlapClassification;
      this.renderer.dragState.placementRejectionReason = snap.placementRejectionReason;
      this.renderer.dragState.playerFriendlyRejectionMessage = snap.playerFriendlyRejectionMessage;
      this.renderer.dragState.overlapColliderId = snap.overlapColliderId;
      this.renderer.dragState.penetrationDepth = snap.penetrationDepth;

      this.tapPlacementMode.currentWorldPos = snap.position;
      this.tapPlacementMode.isValid = snap.isValid;
      soundSynth.playSnap();
      return;
    }

    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Multi-touch pinch start
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      this.pinchStartDistance = Math.hypot(
        pts[0].clientX - pts[1].clientX,
        pts[0].clientY - pts[1].clientY,
      );
      this.pinchStartZoom = this.renderer.camera.userZoom;
      this.isPanning = false;
      this.pendingWorldPieceDrag = null;
      this.pendingWispDrag = null;
      this.pendingWispCanvasTap = null;
      this.draggingPlacedPiece = null;
      this.renderer.dragState = null;
      this.renderer.wispDragState = null;
      this.activePointerInteractionType = 'PINCH_ZOOM';
      return;
    }

    if (this.activePointers.size > 2) return;

    const rect = this.canvas.getBoundingClientRect();
    const worldPoint = this.renderer.camera.screenToWorld(e.clientX, e.clientY, rect);

    // Handle PLACE_WISPS canvas interaction: hit-test placed wisps or tap-place selected wisp
    if (effectiveMode === 'PLACE_WISPS') {
      const wisps = this.store.getState().wisps;
      const hitWisp = wisps.find(
        (w) =>
          w.placed !== false &&
          Math.hypot(worldPoint.x - w.position.x, worldPoint.y - w.position.y) <=
            w.radius + 16,
      );

      if (hitWisp) {
        this.renderer.selectedWispId = hitWisp.id;
        soundSynth.playSnap();
        this.setTemporaryFeedback(null);
        this.pendingWispDrag = {
          wispId: hitWisp.id,
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          source: 'world',
          isDragging: false,
        };
        return;
      }

      // Check if player tapped a locked construction piece
      const pieces = [...this.store.getState().pieces]
        .filter((p) => p.condition !== 'LOST')
        .reverse();
      for (const piece of pieces) {
        const config = MATERIAL_CONFIGS[piece.type];
        const obb = createOBB(piece.position, config.width, config.height, piece.rotation);
        if (isPointInOBB(worldPoint, obb)) {
          this.setTemporaryFeedback(
            'Construction pieces are locked during wisp placement. Tap Return to Build to edit your fortress.',
          );
          break;
        }
      }

      // Record potential tap-placement for the currently selected wisp while also allowing camera pan on drag
      const targetWispId =
        this.renderer.selectedWispId ??
        wisps.find((w) => w.placed === false)?.id ??
        null;
      if (targetWispId) {
        this.pendingWispCanvasTap = {
          wispId: targetWispId,
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          worldPoint,
        };
      }
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.activePointerInteractionType = 'CAMERA_PAN';
      return;
    }

    if (effectiveMode === 'PRE_SIEGE_REVIEW') {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.activePointerInteractionType = 'CAMERA_PAN';
      return;
    }

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
        this.pendingWorldPieceDrag = {
          piece: hitPiece,
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startTime: performance.now(),
          isDragging: false,
        };
      } else {
        this.pendingWorldPieceDrag = null;
        if (eligibility.reason) {
          this.setTemporaryFeedback(eligibility.reason);
        }
      }
    } else {
      // Tapped empty space: start camera pan & deselect
      this.renderer.selectedPieceId = null;
      this.pendingWorldPieceDrag = null;
      this.setTemporaryFeedback(null);
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.activePointerInteractionType = 'CAMERA_PAN';
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
    const isTouch = e.pointerType === 'touch';

    // 0. Pending Wisp Drag (from Wisp Staging Tray or World Sanctuary)
    if (this.pendingWispDrag && this.pendingWispDrag.pointerId === e.pointerId) {
      const dist = Math.hypot(
        e.clientX - this.pendingWispDrag.startClientX,
        e.clientY - this.pendingWispDrag.startClientY,
      );
      if (!this.pendingWispDrag.isDragging && dist >= this.LIFT_START_THRESHOLD) {
        this.pendingWispDrag.isDragging = true;
      }
      if (this.pendingWispDrag.isDragging) {
        if (e.cancelable) e.preventDefault();
        this.startWispDrag(
          this.pendingWispDrag.wispId,
          e.clientX,
          e.clientY,
          this.pendingWispDrag.source,
          isTouch,
        );
        return;
      }
    }

    // 1. Pending Inventory Drag threshold & continuous UI-lift-to-world update
    if (this.pendingInventoryDrag && this.pendingInventoryDrag.pointerId === e.pointerId) {
      const dist = Math.hypot(
        e.clientX - this.pendingInventoryDrag.startClientX,
        e.clientY - this.pendingInventoryDrag.startClientY,
      );

      if (!this.pendingInventoryDrag.isDragging && dist >= this.LIFT_START_THRESHOLD) {
        this.activateDirectInventoryDrag(e.clientX, e.clientY, isTouch);
        return;
      }

      if (this.pendingInventoryDrag.isDragging) {
        if (e.cancelable) e.preventDefault();
        this.activateDirectInventoryDrag(e.clientX, e.clientY, isTouch);
        return;
      }
    }

    // 2. Pending World Piece Drag threshold check
    if (this.pendingWorldPieceDrag && this.pendingWorldPieceDrag.pointerId === e.pointerId) {
      const dist = Math.hypot(
        e.clientX - this.pendingWorldPieceDrag.startClientX,
        e.clientY - this.pendingWorldPieceDrag.startClientY,
      );

      if (!this.pendingWorldPieceDrag.isDragging && dist >= this.DRAG_THRESHOLD) {
        const piece = this.pendingWorldPieceDrag.piece;
        this.pendingWorldPieceDrag.isDragging = true;
        this.draggingPlacedPiece = piece;
        this.activePointerInteractionType = 'WORLD_DRAG';
        this.inventoryLiftState = 'WORLD_ACTIVE';
        this.ghostPresentationScale = 1.0;
        this.transitionProgress = 1.0;
        this.lockedCandidate = null;
        this.cameraMovementSuppressedDuringDrag = true;
        this.renderer.camera.isUserInteracting = true;

        this.preferredRotation = piece.preferredRotation ?? piece.rotation;
        this.currentRotation = piece.rotation;
        this.rotationSource = piece.rotationSource ?? 'USER';
        this.manualRotationRevision = piece.manualRotationRevision ?? 0;
        this.snapRotationAccepted = false;

        this.originalPieceTransform = {
          pos: { ...piece.position },
          rot: piece.rotation,
          anchor: piece.attachedAnchorId,
          preferredRot: piece.preferredRotation,
          rotSource: piece.rotationSource,
          rev: piece.manualRotationRevision,
        };
      }
    }

    // 3. Active World Piece Dragging
    if (this.draggingPlacedPiece && this.pendingWorldPieceDrag?.isDragging) {
      if (e.cancelable) e.preventDefault();

      this.pointerUiCoords = { x: e.clientX, y: e.clientY };
      const touchWorld = this.renderer.camera.screenToWorld(e.clientX, e.clientY, rect);
      const liftedPos = this.applyTouchLift(e.clientX, e.clientY, rect, isTouch);
      this.pointerWorldCoords = liftedPos;

      const piece = this.draggingPlacedPiece;
      const snap = solveSnapAndValidation(
        piece.type,
        liftedPos,
        this.preferredRotation,
        this.store.getState().pieces,
        this.store.getState().anchors,
        this.snappingEnabled,
        piece.id,
        {
          preferredRotation: this.preferredRotation,
          rotationSource: this.rotationSource,
          acceptSnapRotation: this.snapRotationAccepted,
          lockedCandidate: this.lockedCandidate,
          wisps: this.store.getState().wisps,
          existingJoints: this.store.getJoints(),
        },
      );

      if (snap.snapped && snap.socket && snap.pieceSocket) {
        this.lockedCandidate = {
          targetSocketId: snap.socket.id,
          pieceSocketId: snap.pieceSocket.id,
        };
      } else {
        this.lockedCandidate = null;
      }

      this.currentRotation = snap.rotation;
      this.proposedSnapAngle = snap.requiresRotationChange ? snap.proposedRotation : null;
      this.activePositionalSnapCandidate = snap.socket?.id ?? null;
      this.activeRotationalSnapCandidate = snap.requiresRotationChange ? snap.socket?.id ?? null : null;
      this.lastSnapRejectionReason = snap.lastSnapRejectionReason ?? null;

      this.renderer.dragState = {
        source: 'world',
        pieceType: piece.type,
        pieceId: piece.id,
        currentWorldPos: snap.position,
        rotation: snap.rotation,
        preferredRotation: this.preferredRotation,
        rotationSource: this.rotationSource,
        manualRotationRevision: this.manualRotationRevision,
        isValidPlacement: snap.isValid,
        activeSnap:
          snap.snapped && snap.socket
            ? {
                socket: snap.socket,
                pieceSocket: snap.pieceSocket,
                targetPos: snap.position,
                targetAngle: snap.rotation,
                proposedAngle: snap.proposedRotation,
                requiresRotationChange: snap.requiresRotationChange,
                isAnchorRequired: snap.isAnchorRequired,
                compatibilityLabel: snap.socketCompatibility,
                candidateDistance: snap.candidateDistance,
                candidateLockActive: snap.candidateLockActive,
              }
            : undefined,
        snapRotationAccepted: this.snapRotationAccepted,
        inventoryLiftState: 'WORLD_ACTIVE',
        pointerUiCoords: { x: e.clientX, y: e.clientY },
        ghostPresentationScale: 1.0,
        transitionProgress: 1.0,
        supportedContactPredicted: snap.supportedContactPredicted,
        explicitJointProposed: snap.explicitJointProposed,
        proposedTimberJoint: snap.proposedTimberJoint,
        connectionCategory: snap.connectionCategory,
        overlapClassification: snap.overlapClassification,
        placementRejectionReason: snap.placementRejectionReason,
        playerFriendlyRejectionMessage: snap.playerFriendlyRejectionMessage,
        overlapColliderId: snap.overlapColliderId,
        penetrationDepth: snap.penetrationDepth,
      };
      this.renderer.touchContactWorldPos = touchWorld;
      return;
    }

    // 4. Handle Camera Pan
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

    // 0. Release Wisp Drag or Wisp Canvas Tap
    if (this.pendingWispDrag && this.pendingWispDrag.pointerId === e.pointerId) {
      const wispDragInfo = this.pendingWispDrag;
      try {
        wispDragInfo.targetElement?.releasePointerCapture?.(e.pointerId);
      } catch {
        // Safe ignore
      }
      if (wispDragInfo.isDragging && this.renderer.wispDragState) {
        const wd = this.renderer.wispDragState;
        if (wd.isValidPlacement) {
          const res = this.store.placeWisp(wd.wispId, wd.currentWorldPos);
          if (res.success) {
            soundSynth.playSnap();
            this.advanceToNextUnplacedWisp();
          }
        } else if (wd.playerFriendlyMessage) {
          this.setTemporaryFeedback(wd.playerFriendlyMessage);
        }
      } else {
        // Simple tap on tray card or placed wisp selects it
        this.renderer.selectedWispId = wispDragInfo.wispId;
        soundSynth.playSnap();
      }
      this.renderer.wispDragState = null;
      this.pendingWispDrag = null;
      this.cameraMovementSuppressedDuringDrag = false;
      this.renderer.camera.isUserInteracting = false;
      return;
    }

    if (this.pendingWispCanvasTap && this.pendingWispCanvasTap.pointerId === e.pointerId) {
      const tapInfo = this.pendingWispCanvasTap;
      this.pendingWispCanvasTap = null;
      const dist = Math.hypot(
        e.clientX - tapInfo.startClientX,
        e.clientY - tapInfo.startClientY,
      );
      if (dist < this.DRAG_THRESHOLD && this.renderer.getEffectiveMode() === 'PLACE_WISPS') {
        const res = this.store.placeWisp(tapInfo.wispId, tapInfo.worldPoint);
        if (res.success) {
          soundSynth.playSnap();
          this.setTemporaryFeedback(null);
          this.advanceToNextUnplacedWisp();
        } else if (res.validation.playerFriendlyMessage) {
          this.setTemporaryFeedback(res.validation.playerFriendlyMessage);
        }
        this.isPanning = false;
        this.lastPanPoint = null;
        return;
      }
    }

    // 1. Release Inventory Pointer Drag
    if (this.pendingInventoryDrag && this.pendingInventoryDrag.pointerId === e.pointerId) {
      const dragInfo = this.pendingInventoryDrag;
      try {
        dragInfo.targetElement?.releasePointerCapture?.(e.pointerId);
      } catch {
        // Safe ignore
      }
      this.pointerCaptureActive = false;

      const totalDist = Math.hypot(
        e.clientX - dragInfo.startClientX,
        e.clientY - dragInfo.startClientY,
      );

      if (!dragInfo.isDragging || (!dragInfo.hasEnteredWorld && totalDist < this.DRAG_THRESHOLD)) {
        // Tap detected! Enter Tap Accessibility Placement Mode (Method B)
        this.pendingInventoryDrag = null;
        this.startTapPlacementMode(dragInfo.type);
        return;
      }

      // Method A: Direct Drag release evaluation
      const drag = this.renderer.dragState;
      const isOverTray =
        e.clientY >= dragInfo.trayTopY ||
        drag?.inventoryLiftState === 'RETURNING_TO_INVENTORY' ||
        drag?.inventoryLiftState === 'UI_LIFT';

      if (isOverTray) {
        this.cancelActiveDrag('RETURNED_TO_INVENTORY');
      } else if (drag && drag.isValidPlacement) {
        const newPiece: PlacedPiece = {
          id: `player_piece_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: drag.pieceType,
          position: { ...drag.currentWorldPos },
          rotation: drag.rotation,
          isPrebuilt: false,
          attachedAnchorId: drag.activeSnap?.socket.anchorId,
          preferredRotation: this.preferredRotation,
          rotationSource: this.rotationSource,
          manualRotationRevision: this.manualRotationRevision,
        };
        const success = this.store.placePiece(
          newPiece,
          true,
          this.snappingEnabled ? drag.proposedTimberJoint : null,
        );
        if (success) {
          this.placementCommitCount++;
          this.inventoryDecrementCount = 1;
          this.renderer.selectedPieceId = newPiece.id;
          soundSynth.playPlace(drag.pieceType);
        }
        this.renderer.dragState = null;
        this.renderer.touchContactWorldPos = undefined;
        this.activePointerInteractionType = 'NONE';
        this.inventoryLiftState = 'IDLE';
        this.lockedCandidate = null;
      } else {
        if (drag?.playerFriendlyRejectionMessage) {
          this.setTemporaryFeedback(drag.playerFriendlyRejectionMessage);
        }
        this.cancelActiveDrag('INVALID_RELEASE_LOCATION');
      }

      this.pendingInventoryDrag = null;
      this.cameraMovementSuppressedDuringDrag = false;
      this.renderer.camera.isUserInteracting = false;
      this.store.setActiveDragTutorialContext(null, this.snappingEnabled);
      return;
    }

    // 2. Release World Piece Drag
    if (this.pendingWorldPieceDrag && this.pendingWorldPieceDrag.pointerId === e.pointerId) {
      if (this.pendingWorldPieceDrag.isDragging && this.renderer.dragState) {
        const drag = this.renderer.dragState;
        if (drag.isValidPlacement && drag.pieceId) {
          const piece = this.store.getState().pieces.find((p) => p.id === drag.pieceId);
          if (piece) {
            piece.preferredRotation = this.preferredRotation;
            piece.rotationSource = this.rotationSource;
            piece.manualRotationRevision = this.manualRotationRevision;
          }
          const moved = this.store.movePiece(
            drag.pieceId,
            drag.currentWorldPos,
            drag.rotation,
            drag.activeSnap?.socket.anchorId,
            true,
            this.snappingEnabled ? drag.proposedTimberJoint : null,
          );
          if (moved) {
            soundSynth.playPlace(drag.pieceType);
          } else if (this.draggingPlacedPiece && this.originalPieceTransform) {
            this.draggingPlacedPiece.position = { ...this.originalPieceTransform.pos };
            this.draggingPlacedPiece.rotation = this.originalPieceTransform.rot;
            this.draggingPlacedPiece.attachedAnchorId = this.originalPieceTransform.anchor;
          }
        } else {
          if (drag.playerFriendlyRejectionMessage) {
            this.setTemporaryFeedback(drag.playerFriendlyRejectionMessage);
          }
          if (this.draggingPlacedPiece && this.originalPieceTransform) {
            this.draggingPlacedPiece.position = { ...this.originalPieceTransform.pos };
            this.draggingPlacedPiece.rotation = this.originalPieceTransform.rot;
            this.draggingPlacedPiece.attachedAnchorId = this.originalPieceTransform.anchor;
          }
        }
        this.renderer.dragState = null;
        this.renderer.touchContactWorldPos = undefined;
      }

      this.pendingWorldPieceDrag = null;
      this.draggingPlacedPiece = null;
      this.originalPieceTransform = null;
      this.lockedCandidate = null;
      this.inventoryLiftState = 'IDLE';
      this.cameraMovementSuppressedDuringDrag = false;
      this.activePointerInteractionType = 'NONE';
      return;
    }

    if (this.activePointers.size === 0) {
      this.renderer.camera.isUserInteracting = false;
      this.activePointerInteractionType = 'NONE';
    }

    this.isPanning = false;
    this.lastPanPoint = null;
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    this.cancelActiveDrag('POINTER_CANCELLED');
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    this.renderer.camera.zoomBy(factor);
  };

  /**
   * Applies ergonomic upward lift offset for touch dragging so fingers don't block the piece
   */
  public applyTouchLift(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    isTouch = true,
  ): Vector2 {
    const screenY = isTouch ? clientY - 48 : clientY;
    return this.renderer.camera.screenToWorld(clientX, screenY, canvasRect);
  }

  /**
   * Diagnostic getter for Developer Telemetry (All required fields)
   */
  public getConstructionDiagnostics(): ConstructionDiagnostics {
    const drag = this.renderer.dragState;
    const activeSnap = drag?.activeSnap;
    const rawPos = this.pointerWorldCoords;
    const snappedPos = drag?.currentWorldPos;
    const corrVec =
      rawPos && snappedPos && activeSnap
        ? { x: snappedPos.x - rawPos.x, y: snappedPos.y - rawPos.y }
        : null;

    const allJoints = this.store.getJoints();
    const intactJointCount = allJoints.filter((j) => j.state === 'INTACT').length;
    const strainedJointCount = allJoints.filter((j) => j.state === 'STRAINED').length;
    const brokenJointCount = allJoints.filter((j) => j.state === 'BROKEN').length;
    const activeTimberJointCount = intactJointCount + strainedJointCount;
    const selectedPiece = this.renderer.getSelectedPiece();

    return {
      activePointerInteractionType: this.activePointerInteractionType,
      activeInventoryItemId:
        this.pendingInventoryDrag?.type ||
        this.tapPlacementMode?.pieceType ||
        (drag?.source === 'inventory' ? drag.pieceType : null),
      placementGhostActive: Boolean(drag),
      ghostWorldCoordinates: drag ? { ...drag.currentWorldPos } : null,
      ghostRotation: drag ? drag.rotation : 0,
      preferredPlayerRotation: this.preferredRotation,
      rotationSource: this.rotationSource,
      manualRotationRevision: this.manualRotationRevision,
      activePositionalSnapCandidate: this.activePositionalSnapCandidate,
      activeRotationalSnapCandidate: this.activeRotationalSnapCandidate,
      proposedSnapAngle: this.proposedSnapAngle,
      snapRotationAccepted: this.snapRotationAccepted,
      pointerCaptureActive: this.pointerCaptureActive,
      inventoryDecrementCountForCurrentInteraction: this.inventoryDecrementCount,
      placementCommitCount: this.placementCommitCount,
      cancellationReason: this.cancellationReason,
      cameraMovementSuppressedDuringDrag: this.cameraMovementSuppressedDuringDrag,
      lastSnapRejectionReason: this.lastSnapRejectionReason,

      // 20 Inventory-Lift & Beam-Endpoint Snap Diagnostics
      inventoryLiftState: drag?.inventoryLiftState ?? this.inventoryLiftState,
      inventorySourceCardBounds: drag?.sourceCardBounds ?? this.sourceCardBounds,
      pointerUiCoordinates: drag?.pointerUiCoords ?? this.pointerUiCoords,
      pointerWorldCoordinates: this.pointerWorldCoords,
      ghostPresentationScale: drag?.ghostPresentationScale ?? this.ghostPresentationScale,
      ghostWorldScale: 1.0,
      activePieceSocketId: activeSnap?.pieceSocket?.id ?? null,
      activeTargetSocketId: activeSnap?.socket?.id ?? null,
      socketCompatibility: activeSnap?.compatibilityLabel ?? null,
      candidateWorldDistance: activeSnap?.candidateDistance ?? null,
      candidateLockActive: Boolean(activeSnap?.candidateLockActive),
      candidateLockReleaseRadius: CANDIDATE_LOCK_RELEASE_RADIUS,
      positionCorrectionVector: corrVec,
      proposedRotation: this.proposedSnapAngle,
      explicitJointProposed: Boolean(drag?.explicitJointProposed),
      supportedContactPredicted: Boolean(drag?.supportedContactPredicted),
      placementRejectionReason: drag?.placementRejectionReason ?? null,
      overlapColliderId: drag?.overlapColliderId ?? null,
      penetrationDepth: drag?.penetrationDepth ?? 0,
      rotationDiagnostics: this.store.lastRotationDiagnostics ?? null,
      wispPresenceDiagnostics: this.store.getWispPresenceDiagnostics(
        this.renderer.getEffectiveMode(),
      ),
      wispPlacementDiagnostics: this.store.lastWispPlacementDiagnostics ?? null,
      timberJointDiagnostics: {
        snapEnabled: this.snappingEnabled,
        activeDraggingPieceId: drag?.pieceId ?? (drag ? 'ghost_piece' : selectedPiece?.id ?? null),
        activeSourceSocketId: activeSnap?.pieceSocket?.id ?? null,
        activeTargetPieceId:
          drag?.proposedTimberJoint?.targetPieceId ??
          activeSnap?.socket?.pieceId ??
          null,
        activeTargetSocketId: activeSnap?.socket?.id ?? null,
        socketWorldDistance: activeSnap?.candidateDistance ?? null,
        proposedConnectionCategory: drag?.connectionCategory ?? 'NONE',
        jointEligibility: Boolean(drag?.proposedTimberJoint),
        overlapClassification: drag?.overlapClassification ?? 'NONE',
        conflictingPieceId: drag?.overlapColliderId ?? null,
        penetrationDepth: drag?.penetrationDepth ?? 0,
        manualPreferredRotation: this.preferredRotation,
        committedRotation: drag ? drag.rotation : (selectedPiece?.rotation ?? 0),
        createdTimberJointId: this.store.lastCreatedTimberJointId,
        activeTimberJointCount,
        intactJointCount,
        strainedJointCount,
        brokenJointCount,
        lastJointBreakReason: this.store.lastBrokenTimberJointReason,
        lastJointBreakAttackOrPhase: this.store.lastBrokenTimberJointPhaseOrAttack,
        playerFriendlyJointMessage:
          drag?.playerFriendlyRejectionMessage ??
          this.statusFeedback ??
          null,
      },
    };
  }
}
