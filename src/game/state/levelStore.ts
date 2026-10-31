/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_LEVEL_STATE } from '../config';
import {
  ConstructionAction,
  GameMode,
  InventoryCategory,
  Level1Results,
  LevelState,
  MaterialType,
  PlacedPiece,
  SnapshotType,
  UnlockState,
  Vector2,
} from '../types';

const STORAGE_KEY = 'alchemical_fortress_phase1_save_v1';
const META_STORAGE_KEY = 'alchemical_fortress_phase3_meta_v1';
const UNLOCK_STORAGE_KEY = 'alchemical_fortress_phase3_unlock_v1';

export interface SavedSessionMeta {
  savedPhase: GameMode;
  isReinforcementMode: boolean;
  deliveryGranted: boolean;
  deliveredInventory: Record<MaterialType, number>;
  deliveredPieceIds: string[];
  reinforcementMaterialsUsed: number;
  guaranteedDeliveryUsed: number;
  snapshots: Record<SnapshotType, LevelState | null>;
  lastResults: Level1Results | null;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class LevelStore {
  private state: LevelState;
  private preTestSnapshot: LevelState | null = null;
  private snapshots: Record<SnapshotType, LevelState | null> = {
    LEVEL_TEMPLATE: deepClone(INITIAL_LEVEL_STATE),
    INITIAL_DESIGN: null,
    POST_ATTACK_1: null,
    REINFORCEMENT_ENTRY: null,
    REINFORCEMENT_COMPLETE: null,
    FINAL_RESULT: null,
  };

  // Separate undo/redo stacks for initial construction vs reinforcement
  private undoStack: ConstructionAction[] = [];
  private redoStack: ConstructionAction[] = [];
  private reinforcementUndoStack: ConstructionAction[] = [];
  private reinforcementRedoStack: ConstructionAction[] = [];

  public isReinforcementMode = false;
  public savedPhase: GameMode = 'CONSTRUCTION';

  // Guaranteed Mentor Delivery tracking
  public deliveryGranted = false;
  public deliveredInventory: Record<MaterialType, number> = {
    wood_beam: 0,
    wood_block: 0,
    stone_block: 0,
  };
  public deliveredPieceIds: string[] = [];
  public reinforcementMaterialsUsed = 0;
  public guaranteedDeliveryUsed = 0;
  public lastResults: Level1Results | null = null;

  // Tutorial & Sample Unlock state
  public unlockState: UnlockState = {
    tutorialCompleted: false,
    reinforcementReserveUnlocked: false,
    unlockPresentedOnce: false,
  };

  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadFromStorage();
    this.loadUnlockState();
    this.loadSessionMeta();
  }

  public getState(): LevelState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.saveToStorage();
    this.saveSessionMeta();
    this.listeners.forEach((fn) => fn());
  }

  // --- Piece Eligibility & Inventory Categorization ---

  public getPieceCategory(piece: PlacedPiece): InventoryCategory {
    if (piece.condition === 'LOST' || piece.position.y >= this.state.lossBoundaryY) {
      return 'LOST';
    }
    if (piece.condition === 'BROKEN') {
      return 'BROKEN_DEBRIS';
    }
    if (piece.isPrebuilt) {
      return piece.ownership === 'PREBUILT_MOVABLE' ? 'PREBUILT_MOVABLE' : 'PREBUILT_FIXED';
    }
    if (piece.condition === 'CRACKED') {
      return 'PLACED_CRACKED';
    }
    if (piece.source === 'GUARANTEED_DELIVERY' || piece.ownership === 'GUARANTEED_DELIVERY') {
      return 'GUARANTEED_DELIVERY';
    }
    return 'PLACED_INTACT';
  }

  public getInventoryCategoryCounts(): Record<InventoryCategory, number> {
    const counts: Record<InventoryCategory, number> = {
      STARTING_RESERVE:
        (this.state.inventory.wood_beam || 0) +
        (this.state.inventory.wood_block || 0) +
        (this.state.inventory.stone_block || 0),
      PLACED_INTACT: 0,
      PLACED_CRACKED: 0,
      BROKEN_DEBRIS: 0,
      LOST: 0,
      GUARANTEED_DELIVERY:
        (this.deliveredInventory.wood_beam || 0) +
        (this.deliveredInventory.wood_block || 0) +
        (this.deliveredInventory.stone_block || 0),
      PREBUILT_FIXED: 0,
      PREBUILT_MOVABLE: 0,
    };

    for (const piece of this.state.pieces) {
      const cat = this.getPieceCategory(piece);
      if (cat === 'GUARANTEED_DELIVERY') {
        counts.PLACED_INTACT++;
        counts.GUARANTEED_DELIVERY++;
      } else {
        counts[cat]++;
      }
    }
    return counts;
  }

  public canManipulatePiece(piece: PlacedPiece): {
    canMove: boolean;
    canRotate: boolean;
    canRemoveToInventory: boolean;
    reason?: string;
  } {
    if (piece.isPrebuilt && piece.ownership !== 'PREBUILT_MOVABLE') {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Ancient prebuilt foundation stone cannot be moved',
      };
    }
    if (piece.condition === 'LOST' || piece.position.y >= this.state.lossBoundaryY) {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Lost piece is outside the recoverable battlefield',
      };
    }
    if (piece.condition === 'BROKEN') {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: '⚡ Broken Debris: Cannot be reused, snapped, or returned to inventory',
      };
    }
    if (this.isReinforcementMode && piece.condition === 'CRACKED') {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: '⚠️ Cracked Piece: Weakened structure is locked in place during reinforcement',
      };
    }

    // Check battlefield bounds for recovery
    if (
      piece.position.x < this.state.worldBounds.minX ||
      piece.position.x > this.state.worldBounds.maxX
    ) {
      return {
        canMove: false,
        canRotate: false,
        canRemoveToInventory: false,
        reason: 'Piece fell outside recoverable bounds',
      };
    }

    return {
      canMove: true,
      canRotate: true,
      canRemoveToInventory: true,
    };
  }

  // Total available reserve (starting reserve + delivered reserve)
  public getAvailableCount(type: MaterialType): number {
    return (this.state.inventory[type] || 0);
  }

  public getTotalReserveCount(): number {
    return (
      (this.state.inventory.wood_beam || 0) +
      (this.state.inventory.wood_block || 0) +
      (this.state.inventory.stone_block || 0)
    );
  }

  // --- Guaranteed Mentor Delivery ---

  public grantGuaranteedDelivery(): boolean {
    if (this.deliveryGranted) {
      return false; // Already granted — strictly idempotent, never duplicates
    }
    this.deliveryGranted = true;
    this.deliveredInventory.wood_beam += 1;
    this.deliveredInventory.stone_block += 1;

    // Also add directly to active usable inventory so InventoryTray displays and allows dragging seamlessly
    this.state.inventory.wood_beam = (this.state.inventory.wood_beam || 0) + 1;
    this.state.inventory.stone_block = (this.state.inventory.stone_block || 0) + 1;

    // Update REINFORCEMENT_ENTRY snapshot so reload during reinforcement preserves delivered items without re-triggering
    this.snapshots.REINFORCEMENT_ENTRY = deepClone(this.state);

    this.notify();
    return true;
  }

  // --- Authoritative Mutations ---

  public setReinforcementMode(active: boolean): void {
    this.isReinforcementMode = active;
    if (active) {
      this.reinforcementUndoStack = [];
      this.reinforcementRedoStack = [];
    }
    this.notify();
  }

  private getActiveUndoStack(): ConstructionAction[] {
    return this.isReinforcementMode ? this.reinforcementUndoStack : this.undoStack;
  }

  private getActiveRedoStack(): ConstructionAction[] {
    return this.isReinforcementMode ? this.reinforcementRedoStack : this.redoStack;
  }

  public placePiece(piece: PlacedPiece, recordUndo = true): boolean {
    const currentCount = this.state.inventory[piece.type] ?? 0;
    if (currentCount <= 0) return false;

    const fromDelivered =
      this.isReinforcementMode && (this.deliveredInventory[piece.type] || 0) > 0;

    this.state.inventory[piece.type] = currentCount - 1;
    if (fromDelivered) {
      this.deliveredInventory[piece.type] = Math.max(0, this.deliveredInventory[piece.type] - 1);
      this.guaranteedDeliveryUsed++;
      this.deliveredPieceIds.push(piece.id);
    }
    if (this.isReinforcementMode) {
      this.reinforcementMaterialsUsed++;
    }

    const enrichedPiece: PlacedPiece = {
      ...deepClone(piece),
      condition: piece.condition ?? 'INTACT',
      ownership: fromDelivered ? 'GUARANTEED_DELIVERY' : (piece.ownership ?? 'PLAYER_OWNED'),
      source: fromDelivered ? 'GUARANTEED_DELIVERY' : (piece.source ?? 'STARTING_RESERVE'),
    };

    // Preserve exact structure when in standard construction for byte-identical snapshot compatibility
    if (!this.isReinforcementMode && !piece.condition && !piece.ownership && !piece.source) {
      this.state.pieces.push(deepClone(piece));
    } else {
      this.state.pieces.push(enrichedPiece);
    }

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'PLACE_PIECE',
        piece: deepClone(this.state.pieces[this.state.pieces.length - 1]),
        fromDelivered,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.notify();
    return true;
  }

  public removePiece(pieceId: string, recordUndo = true): boolean {
    const index = this.state.pieces.findIndex((p) => p.id === pieceId);
    if (index === -1) return false;

    const piece = this.state.pieces[index];
    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canRemoveToInventory) return false;

    this.state.pieces.splice(index, 1);
    this.state.inventory[piece.type] = (this.state.inventory[piece.type] ?? 0) + 1;

    const wasDelivered =
      piece.source === 'GUARANTEED_DELIVERY' ||
      piece.ownership === 'GUARANTEED_DELIVERY' ||
      this.deliveredPieceIds.includes(piece.id);

    if (wasDelivered) {
      this.deliveredInventory[piece.type] = (this.deliveredInventory[piece.type] || 0) + 1;
      this.guaranteedDeliveryUsed = Math.max(0, this.guaranteedDeliveryUsed - 1);
      this.deliveredPieceIds = this.deliveredPieceIds.filter((id) => id !== piece.id);
    }
    if (this.isReinforcementMode && this.reinforcementMaterialsUsed > 0) {
      this.reinforcementMaterialsUsed = Math.max(0, this.reinforcementMaterialsUsed - 1);
    }

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'REMOVE_PIECE',
        piece: deepClone(piece),
        toDelivered: wasDelivered,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.notify();
    return true;
  }

  public movePiece(
    pieceId: string,
    newPos: Vector2,
    newRotationOrAnchor?: number | string,
    newAnchorId?: string,
    recordUndo = true,
  ): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canMove) return false;

    const beforePos = { ...piece.position };
    const beforeRot = piece.rotation;
    const beforeAnchorId = piece.attachedAnchorId;

    const afterRot =
      typeof newRotationOrAnchor === 'number' ? newRotationOrAnchor : piece.rotation;
    const afterAnchorId =
      typeof newRotationOrAnchor === 'string' ? newRotationOrAnchor : newAnchorId;

    piece.position = { ...newPos };
    piece.rotation = afterRot;
    piece.attachedAnchorId = afterAnchorId;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'MOVE_PIECE',
        pieceId,
        beforePos,
        beforeRot,
        beforeAnchorId,
        afterPos: { ...newPos },
        afterRot,
        afterAnchorId,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.notify();
    return true;
  }

  public rotatePiece(pieceId: string, deltaAngle: number, recordUndo = true): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canRotate) return false;

    const beforeRotation = piece.rotation;
    const beforeAnchorId = piece.attachedAnchorId;
    const afterRotation = this.normalizeAngle(beforeRotation + deltaAngle);

    piece.rotation = afterRotation;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'ROTATE_PIECE',
        pieceId,
        beforeRotation,
        afterRotation,
        beforeAnchorId,
        afterAnchorId: beforeAnchorId,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.notify();
    return true;
  }

  public setPieceRotation(pieceId: string, targetRotation: number, recordUndo = true): boolean {
    const piece = this.state.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const eligibility = this.canManipulatePiece(piece);
    if (!eligibility.canRotate) return false;

    const beforeRotation = piece.rotation;
    const afterRotation = this.normalizeAngle(targetRotation);
    if (Math.abs(beforeRotation - afterRotation) < 0.001) return false;

    piece.rotation = afterRotation;

    if (recordUndo) {
      this.getActiveUndoStack().push({
        type: 'ROTATE_PIECE',
        pieceId,
        beforeRotation,
        afterRotation,
        beforeAnchorId: piece.attachedAnchorId,
        afterAnchorId: piece.attachedAnchorId,
      });
      this.getActiveRedoStack().length = 0;
    }

    this.notify();
    return true;
  }

  // --- Undo / Redo ---

  public canUndo(): boolean {
    return this.getActiveUndoStack().length > 0;
  }

  public canRedo(): boolean {
    return this.getActiveRedoStack().length > 0;
  }

  public getUndoCount(): number {
    return this.getActiveUndoStack().length;
  }

  public getRedoCount(): number {
    return this.getActiveRedoStack().length;
  }

  public getConstructionHistoryCounts(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  public getReinforcementHistoryCounts(): { undo: number; redo: number } {
    return { undo: this.reinforcementUndoStack.length, redo: this.reinforcementRedoStack.length };
  }

  public undo(): boolean {
    const activeUndo = this.getActiveUndoStack();
    const activeRedo = this.getActiveRedoStack();
    const action = activeUndo.pop();
    if (!action) return false;

    switch (action.type) {
      case 'PLACE_PIECE': {
        const idx = this.state.pieces.findIndex((p) => p.id === action.piece.id);
        if (idx !== -1) {
          this.state.pieces.splice(idx, 1);
          this.state.inventory[action.piece.type] =
            (this.state.inventory[action.piece.type] ?? 0) + 1;
          if (action.fromDelivered) {
            this.deliveredInventory[action.piece.type] =
              (this.deliveredInventory[action.piece.type] || 0) + 1;
            this.guaranteedDeliveryUsed = Math.max(0, this.guaranteedDeliveryUsed - 1);
            this.deliveredPieceIds = this.deliveredPieceIds.filter((id) => id !== action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed = Math.max(0, this.reinforcementMaterialsUsed - 1);
          }
        }
        break;
      }
      case 'REMOVE_PIECE': {
        const currentInv = this.state.inventory[action.piece.type] ?? 0;
        if (currentInv > 0) {
          this.state.inventory[action.piece.type] = currentInv - 1;
          this.state.pieces.push(deepClone(action.piece));
          if (action.toDelivered) {
            this.deliveredInventory[action.piece.type] = Math.max(
              0,
              (this.deliveredInventory[action.piece.type] || 0) - 1,
            );
            this.guaranteedDeliveryUsed++;
            this.deliveredPieceIds.push(action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed++;
          }
        }
        break;
      }
      case 'MOVE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.position = { ...action.beforePos };
          p.rotation = action.beforeRot;
          p.attachedAnchorId = action.beforeAnchorId;
        }
        break;
      }
      case 'ROTATE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.rotation = action.beforeRotation;
          p.attachedAnchorId = action.beforeAnchorId;
        }
        break;
      }
    }

    activeRedo.push(action);
    this.notify();
    return true;
  }

  public redo(): boolean {
    const activeUndo = this.getActiveUndoStack();
    const activeRedo = this.getActiveRedoStack();
    const action = activeRedo.pop();
    if (!action) return false;

    switch (action.type) {
      case 'PLACE_PIECE': {
        const currentInv = this.state.inventory[action.piece.type] ?? 0;
        if (currentInv > 0) {
          this.state.inventory[action.piece.type] = currentInv - 1;
          this.state.pieces.push(deepClone(action.piece));
          if (action.fromDelivered) {
            this.deliveredInventory[action.piece.type] = Math.max(
              0,
              (this.deliveredInventory[action.piece.type] || 0) - 1,
            );
            this.guaranteedDeliveryUsed++;
            this.deliveredPieceIds.push(action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed++;
          }
        }
        break;
      }
      case 'REMOVE_PIECE': {
        const idx = this.state.pieces.findIndex((p) => p.id === action.piece.id);
        if (idx !== -1) {
          this.state.pieces.splice(idx, 1);
          this.state.inventory[action.piece.type] =
            (this.state.inventory[action.piece.type] ?? 0) + 1;
          if (action.toDelivered) {
            this.deliveredInventory[action.piece.type] =
              (this.deliveredInventory[action.piece.type] || 0) + 1;
            this.guaranteedDeliveryUsed = Math.max(0, this.guaranteedDeliveryUsed - 1);
            this.deliveredPieceIds = this.deliveredPieceIds.filter((id) => id !== action.piece.id);
          }
          if (this.isReinforcementMode) {
            this.reinforcementMaterialsUsed = Math.max(0, this.reinforcementMaterialsUsed - 1);
          }
        }
        break;
      }
      case 'MOVE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.position = { ...action.afterPos };
          p.rotation = action.afterRot;
          p.attachedAnchorId = action.afterAnchorId;
        }
        break;
      }
      case 'ROTATE_PIECE': {
        const p = this.state.pieces.find((item) => item.id === action.pieceId);
        if (p) {
          p.rotation = action.afterRotation;
          p.attachedAnchorId = action.afterAnchorId;
        }
        break;
      }
    }

    activeUndo.push(action);
    this.notify();
    return true;
  }

  // --- Named Snapshots & Restoration ---

  public saveNamedSnapshot(type: SnapshotType, customState?: LevelState): void {
    const snap = deepClone(customState ?? this.state);
    this.snapshots[type] = snap;
    if (type === 'INITIAL_DESIGN') {
      this.preTestSnapshot = deepClone(snap);
    }
    this.saveSessionMeta();
  }

  public getNamedSnapshot(type: SnapshotType): LevelState | null {
    return this.snapshots[type] ? deepClone(this.snapshots[type]!) : null;
  }

  public getActiveSnapshotList(): SnapshotType[] {
    return (Object.keys(this.snapshots) as SnapshotType[]).filter(
      (k) => this.snapshots[k] !== null,
    );
  }

  public captureSnapshot(): void {
    this.preTestSnapshot = deepClone(this.state);
    this.snapshots.INITIAL_DESIGN = deepClone(this.state);
    this.saveSessionMeta();
  }

  public restorePreTestSnapshot(): boolean {
    const snap = this.preTestSnapshot ?? this.snapshots.INITIAL_DESIGN;
    if (!snap) return false;
    this.state = deepClone(snap);
    this.isReinforcementMode = false;
    this.reinforcementUndoStack = [];
    this.reinforcementRedoStack = [];
    this.deliveryGranted = false;
    this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0 };
    this.deliveredPieceIds = [];
    this.reinforcementMaterialsUsed = 0;
    this.guaranteedDeliveryUsed = 0;
    this.savedPhase = 'CONSTRUCTION';
    this.notify();
    return true;
  }

  public restoreSnapshot(type: SnapshotType): boolean {
    const snap = this.snapshots[type];
    if (!snap) return false;
    this.state = deepClone(snap);

    if (type === 'INITIAL_DESIGN' || type === 'LEVEL_TEMPLATE') {
      this.isReinforcementMode = false;
      this.reinforcementUndoStack = [];
      this.reinforcementRedoStack = [];
      this.deliveryGranted = false;
      this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0 };
      this.deliveredPieceIds = [];
      this.reinforcementMaterialsUsed = 0;
      this.guaranteedDeliveryUsed = 0;
    }

    if (type === 'LEVEL_TEMPLATE') {
      this.undoStack = [];
      this.redoStack = [];
      this.preTestSnapshot = null;
      this.snapshots = {
        LEVEL_TEMPLATE: deepClone(INITIAL_LEVEL_STATE),
        INITIAL_DESIGN: null,
        POST_ATTACK_1: null,
        REINFORCEMENT_ENTRY: null,
        REINFORCEMENT_COMPLETE: null,
        FINAL_RESULT: null,
      };
    }

    this.notify();
    return true;
  }

  public hasSnapshot(): boolean {
    return this.preTestSnapshot !== null || this.snapshots.INITIAL_DESIGN !== null;
  }

  public resetToDefault(): void {
    this.state = deepClone(INITIAL_LEVEL_STATE);
    this.preTestSnapshot = null;
    this.snapshots = {
      LEVEL_TEMPLATE: deepClone(INITIAL_LEVEL_STATE),
      INITIAL_DESIGN: null,
      POST_ATTACK_1: null,
      REINFORCEMENT_ENTRY: null,
      REINFORCEMENT_COMPLETE: null,
      FINAL_RESULT: null,
    };
    this.undoStack = [];
    this.redoStack = [];
    this.reinforcementUndoStack = [];
    this.reinforcementRedoStack = [];
    this.isReinforcementMode = false;
    this.deliveryGranted = false;
    this.deliveredInventory = { wood_beam: 0, wood_block: 0, stone_block: 0 };
    this.deliveredPieceIds = [];
    this.reinforcementMaterialsUsed = 0;
    this.guaranteedDeliveryUsed = 0;
    this.lastResults = null;
    this.savedPhase = 'CONSTRUCTION';
    this.notify();
  }

  // --- Unlock & Tutorial State ---

  public markTutorialCompleted(): void {
    this.unlockState.tutorialCompleted = true;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
  }

  public grantSampleUnlock(): boolean {
    const newlyPresented = !this.unlockState.unlockPresentedOnce;
    this.unlockState.tutorialCompleted = true;
    this.unlockState.reinforcementReserveUnlocked = true;
    this.unlockState.unlockPresentedOnce = true;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
    return newlyPresented;
  }

  public clearTutorialState(): void {
    this.unlockState.tutorialCompleted = false;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
  }

  public clearSampleUnlock(): void {
    this.unlockState.reinforcementReserveUnlocked = false;
    this.unlockState.unlockPresentedOnce = false;
    this.saveUnlockState();
    this.listeners.forEach((fn) => fn());
  }

  // --- Reload Recovery ---

  public setSavedPhase(phase: GameMode): void {
    this.savedPhase = phase;
    this.saveSessionMeta();
  }

  public recoverFromReload(): { recoveredPhase: GameMode; message: string } {
    const phase = this.savedPhase;

    // 1. Reload during Attack 1 -> restore INITIAL_DESIGN and return to CONSTRUCTION_READY
    if (
      (phase === 'PRE_ATTACK_VALIDATION' ||
        phase === 'ENEMY_INTRODUCTION' ||
        phase === 'AIMING_PREVIEW' ||
        phase === 'PROJECTILE_IN_FLIGHT' ||
        phase === 'IMPACT_RESOLUTION' ||
        phase === 'SETTLING') &&
      !this.isReinforcementMode &&
      !this.snapshots.REINFORCEMENT_COMPLETE
    ) {
      if (this.snapshots.INITIAL_DESIGN) {
        this.state = deepClone(this.snapshots.INITIAL_DESIGN);
      }
      this.savedPhase = 'CONSTRUCTION_READY';
      this.notify();
      return {
        recoveredPhase: 'CONSTRUCTION_READY',
        message: 'Reloaded during Attack 1: Restored INITIAL_DESIGN snapshot safely.',
      };
    }

    // 2. Reload during Reinforcement -> restore REINFORCEMENT_ENTRY without duplicating delivery
    if (
      phase === 'ATTACK_RESOLVED' ||
      phase === 'REINFORCEMENT_INTRO' ||
      phase === 'REINFORCEMENT_ACTIVE' ||
      phase === 'EMERGENCY_DELIVERY'
    ) {
      if (this.snapshots.REINFORCEMENT_ENTRY) {
        this.state = deepClone(this.snapshots.REINFORCEMENT_ENTRY);
      } else if (this.snapshots.POST_ATTACK_1) {
        this.state = deepClone(this.snapshots.POST_ATTACK_1);
      }
      this.isReinforcementMode = true;
      this.reinforcementUndoStack = [];
      this.reinforcementRedoStack = [];
      this.savedPhase = 'REINFORCEMENT_ACTIVE';
      this.notify();
      return {
        recoveredPhase: 'REINFORCEMENT_ACTIVE',
        message: 'Reloaded during Reinforcement: Restored REINFORCEMENT_ENTRY without duplicating delivery.',
      };
    }

    // 3. Reload during Attack 2 -> restore REINFORCEMENT_COMPLETE and return to FINAL_ATTACK_READY
    if (
      phase === 'REINFORCEMENT_VALIDATION' ||
      phase === 'FINAL_ATTACK_READY' ||
      ((phase === 'ENEMY_INTRODUCTION' ||
        phase === 'AIMING_PREVIEW' ||
        phase === 'PROJECTILE_IN_FLIGHT' ||
        phase === 'IMPACT_RESOLUTION' ||
        phase === 'SETTLING') &&
        Boolean(this.snapshots.REINFORCEMENT_COMPLETE))
    ) {
      if (this.snapshots.REINFORCEMENT_COMPLETE) {
        this.state = deepClone(this.snapshots.REINFORCEMENT_COMPLETE);
      }
      this.isReinforcementMode = false;
      this.savedPhase = 'FINAL_ATTACK_READY';
      this.notify();
      return {
        recoveredPhase: 'FINAL_ATTACK_READY',
        message: 'Reloaded during Attack 2: Restored REINFORCEMENT_COMPLETE snapshot.',
      };
    }

    // 4. Reload during Results -> restore FINAL_RESULT
    if (
      phase === 'SEQUENCE_COMPLETE' ||
      phase === 'RESULTS' ||
      phase === 'UNLOCK_PRESENTATION'
    ) {
      if (this.snapshots.FINAL_RESULT) {
        this.state = deepClone(this.snapshots.FINAL_RESULT);
      }
      this.savedPhase = 'RESULTS';
      this.notify();
      return {
        recoveredPhase: 'RESULTS',
        message: 'Reloaded during Results: Restored FINAL_RESULT snapshot safely.',
      };
    }

    // Default: Initial construction
    this.savedPhase = 'INITIAL_CONSTRUCTION';
    this.notify();
    return {
      recoveredPhase: 'INITIAL_CONSTRUCTION',
      message: 'Restored editable construction state.',
    };
  }

  // --- Persistence & Validation ---

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const serialized = JSON.stringify(this.state);
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota or private browsing errors
    }
  }

  private saveSessionMeta(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const meta: SavedSessionMeta = {
        savedPhase: this.savedPhase,
        isReinforcementMode: this.isReinforcementMode,
        deliveryGranted: this.deliveryGranted,
        deliveredInventory: { ...this.deliveredInventory },
        deliveredPieceIds: [...this.deliveredPieceIds],
        reinforcementMaterialsUsed: this.reinforcementMaterialsUsed,
        guaranteedDeliveryUsed: this.guaranteedDeliveryUsed,
        snapshots: this.snapshots,
        lastResults: this.lastResults,
      };
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // Ignore
    }
  }

  private loadSessionMeta(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(META_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedSessionMeta>;
      if (parsed.savedPhase) this.savedPhase = parsed.savedPhase;
      if (typeof parsed.isReinforcementMode === 'boolean') {
        this.isReinforcementMode = parsed.isReinforcementMode;
      }
      if (typeof parsed.deliveryGranted === 'boolean') {
        this.deliveryGranted = parsed.deliveryGranted;
      }
      if (parsed.deliveredInventory) {
        this.deliveredInventory = { ...parsed.deliveredInventory };
      }
      if (Array.isArray(parsed.deliveredPieceIds)) {
        this.deliveredPieceIds = [...parsed.deliveredPieceIds];
      }
      if (typeof parsed.reinforcementMaterialsUsed === 'number') {
        this.reinforcementMaterialsUsed = parsed.reinforcementMaterialsUsed;
      }
      if (typeof parsed.guaranteedDeliveryUsed === 'number') {
        this.guaranteedDeliveryUsed = parsed.guaranteedDeliveryUsed;
      }
      if (parsed.snapshots) {
        this.snapshots = {
          LEVEL_TEMPLATE: parsed.snapshots.LEVEL_TEMPLATE ?? deepClone(INITIAL_LEVEL_STATE),
          INITIAL_DESIGN: parsed.snapshots.INITIAL_DESIGN ?? null,
          POST_ATTACK_1: parsed.snapshots.POST_ATTACK_1 ?? null,
          REINFORCEMENT_ENTRY: parsed.snapshots.REINFORCEMENT_ENTRY ?? null,
          REINFORCEMENT_COMPLETE: parsed.snapshots.REINFORCEMENT_COMPLETE ?? null,
          FINAL_RESULT: parsed.snapshots.FINAL_RESULT ?? null,
        };
        if (this.snapshots.INITIAL_DESIGN) {
          this.preTestSnapshot = deepClone(this.snapshots.INITIAL_DESIGN);
        }
      }
      if (parsed.lastResults) {
        this.lastResults = parsed.lastResults;
      }
    } catch {
      // Ignore corrupted session meta
    }
  }

  private saveUnlockState(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(this.unlockState));
    } catch {
      // Ignore
    }
  }

  private loadUnlockState(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(UNLOCK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.unlockState = {
          tutorialCompleted: Boolean(parsed.tutorialCompleted),
          reinforcementReserveUnlocked: Boolean(parsed.reinforcementReserveUnlocked),
          unlockPresentedOnce: Boolean(parsed.unlockPresentedOnce),
        };
      }
    } catch {
      // Ignore
    }
  }

  private loadFromStorage(): LevelState {
    try {
      if (typeof localStorage === 'undefined') {
        return deepClone(INITIAL_LEVEL_STATE);
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(INITIAL_LEVEL_STATE);

      const parsed = JSON.parse(raw);
      if (!this.isValidLevelState(parsed)) {
        return deepClone(INITIAL_LEVEL_STATE);
      }

      return parsed;
    } catch {
      return deepClone(INITIAL_LEVEL_STATE);
    }
  }

  private isValidLevelState(data: unknown): data is LevelState {
    if (!data || typeof data !== 'object') return false;
    const candidate = data as Partial<LevelState>;

    if (candidate.schemaVersion !== INITIAL_LEVEL_STATE.schemaVersion) return false;
    if (candidate.levelId !== INITIAL_LEVEL_STATE.levelId) return false;
    if (!Array.isArray(candidate.pieces)) return false;
    if (!candidate.inventory || typeof candidate.inventory !== 'object') return false;

    const validMaterials: MaterialType[] = ['wood_beam', 'wood_block', 'stone_block'];
    for (const mat of validMaterials) {
      const count = candidate.inventory[mat];
      if (typeof count !== 'number' || count < 0 || count > 25 || !Number.isInteger(count)) {
        return false;
      }
    }

    const seenIds = new Set<string>();
    for (const piece of candidate.pieces) {
      if (!piece || typeof piece.id !== 'string' || seenIds.has(piece.id)) return false;
      seenIds.add(piece.id);
      if (!validMaterials.includes(piece.type)) return false;
      if (
        !piece.position ||
        typeof piece.position.x !== 'number' ||
        typeof piece.position.y !== 'number' ||
        Number.isNaN(piece.position.x) ||
        Number.isNaN(piece.position.y)
      ) {
        return false;
      }
    }

    return true;
  }

  public clearStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(META_STORAGE_KEY);
        localStorage.removeItem(UNLOCK_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
    this.unlockState = {
      tutorialCompleted: false,
      reinforcementReserveUnlocked: false,
      unlockPresentedOnce: false,
    };
    this.resetToDefault();
  }

  private normalizeAngle(rad: number): number {
    const twoPi = Math.PI * 2;
    let normalized = rad % twoPi;
    if (normalized > Math.PI) normalized -= twoPi;
    if (normalized <= -Math.PI) normalized += twoPi;
    return normalized;
  }
}
