/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LevelStore } from './game/state/levelStore';
import { CanvasRenderer } from './game/render/canvasRenderer';
import { GestureController, isEditableMode } from './game/input/gestureController';
import { MATERIAL_CONFIGS } from './game/config';
import {
  ConstructionDiagnostics,
  DragState,
  GameMode,
  MaterialType,
  PlacedPiece,
  StabilityReport,
} from './game/types';
import { DistancePreset } from './game/siege/siegeConfig';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  FlightCameraPreference,
  PresentationDiagnostics,
  PresentationSettings,
} from './game/presentation/presentationTypes';
import { soundSynth } from './game/audio/synth';

import { TopHUD } from './components/TopHUD';
import { ThreatLineupBar } from './components/ThreatLineupBar';
import { InventoryTray } from './components/InventoryTray';
import { ActionControls } from './components/ActionControls';
import { PieceToolbar } from './components/PieceToolbar';
import { PlacementModeBar } from './components/PlacementModeBar';
import { StabilityGauge } from './components/StabilityGauge';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { ZoomControls } from './components/ZoomControls';
import { HelpModal } from './components/HelpModal';
import { SiegeHUD } from './components/SiegeHUD';
import { SiegeCompleteModal } from './components/SiegeCompleteModal';
import { PresentationSettingsModal } from './components/PresentationSettingsModal';
import { WispPlacementTray } from './components/WispPlacementTray';
import { PreSiegeReviewPanel } from './components/PreSiegeReviewPanel';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const storeRef = useRef<LevelStore>(new LevelStore());
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const gestureRef = useRef<GestureController | null>(null);

  // React states synced from store, siege controller & presentation director
  const [levelState, setLevelState] = useState(storeRef.current.getState());
  const [mode, setMode] = useState<GameMode>('CONSTRUCTION');
  const [selectedPiece, setSelectedPiece] = useState<PlacedPiece | null>(null);
  const [snapping, setSnapping] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [distancePreset, setDistancePreset] = useState<DistancePreset>('STANDARD');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [reinforcementTimerSec, setReinforcementTimerSec] = useState(75);
  const [reinforcementTimerDisabled, setReinforcementTimerDisabled] = useState(false);
  const [reinforcementTimerPaused, setReinforcementTimerPaused] = useState(false);

  // Phase 4 Presentation states
  const [presSettings, setPresSettings] = useState<PresentationSettings>(
    DEFAULT_PRESENTATION_SETTINGS,
  );
  const [presDiag, setPresDiag] = useState<PresentationDiagnostics | null>(null);
  const [activeCaption, setActiveCaption] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [constructionDiag, setConstructionDiag] = useState<ConstructionDiagnostics | null>(null);
  const [tapPlacementActive, setTapPlacementActive] = useState(false);
  const [activeDragState, setActiveDragState] = useState<DragState | null>(null);
  const [selectedWispId, setSelectedWispId] = useState<string | null>(null);

  // Modal / panel toggles
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDevOpen, setIsDevOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Stability report
  const [stabilityReport, setStabilityReport] = useState<StabilityReport>({
    isSimulating: false,
    totalKineticEnergy: 0,
    maxVelocity: 0,
    settledRatio: 0,
    isSettled: false,
    fallenCount: 0,
  });

  const syncStateFromStore = useCallback(() => {
    const store = storeRef.current;
    setLevelState({ ...store.getState() });
    setCanUndo(store.canUndo());
    setCanRedo(store.canRedo());
    setUndoCount(store.getUndoCount());
    setRedoCount(store.getRedoCount());

    if (gestureRef.current) {
      setConstructionDiag(gestureRef.current.getConstructionDiagnostics());
      setTapPlacementActive(Boolean(gestureRef.current.tapPlacementMode?.active));
    }

    if (rendererRef.current) {
      const selected = rendererRef.current.getSelectedPiece();
      setSelectedPiece(selected ? { ...selected } : null);
      setActiveDragState(rendererRef.current.dragState ? { ...rendererRef.current.dragState } : null);
      setSelectedWispId(rendererRef.current.selectedWispId);
      setZoom(rendererRef.current.camera.userZoom);
      const sc = rendererRef.current.siegeController;
      setReinforcementTimerSec(sc.reinforcementTimerSec);
      setReinforcementTimerDisabled(sc.reinforcementTimerDisabled);
      setReinforcementTimerPaused(sc.reinforcementTimerPaused);

      const pd = rendererRef.current.presentationDirector;
      setPresSettings({ ...pd.settings });
      setPresDiag(rendererRef.current.getPresentationDiagnostics());
      setActiveCaption(pd.activeCaption);
      setIsReplaying(pd.isReplaying);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const store = storeRef.current;

    // Instantiate Renderer & Gesture Controller
    const renderer = new CanvasRenderer(
      canvas,
      store,
      (report) => {
        setStabilityReport({ ...report });
        if (report.isSettled) {
          setMode((prev) => (prev === 'TESTING_SIMULATION' ? 'SETTLED' : prev));
          syncStateFromStore();
        }
      },
      () => {
        if (rendererRef.current) {
          setMode(rendererRef.current.getEffectiveMode());
          syncStateFromStore();
        }
      },
    );
    rendererRef.current = renderer;
    setPresSettings({ ...renderer.presentationDirector.settings });

    const gesture = new GestureController(canvas, renderer, store);
    gestureRef.current = gesture;

    // Wire safe drag completion before reinforcement ends
    renderer.siegeController.onBeforeReinforcementFinish = () => {
      gesture.completeOrCancelActiveDragSafely();
    };

    // Recover from reload if saved in an intermediate siege or reinforcement phase
    if (
      store.savedPhase !== 'CONSTRUCTION' &&
      store.savedPhase !== 'INITIAL_CONSTRUCTION' &&
      store.savedPhase !== 'CONSTRUCTION_READY'
    ) {
      renderer.siegeController.simulateSafeReload();
      setMode(renderer.getEffectiveMode());
    } else if (!store.unlockState.tutorialCompleted && store.getState().pieces.length === 5) {
      // Show skippable Level 1 opening sequence on fresh start
      renderer.siegeController.startOpeningSequence();
      setMode(renderer.getEffectiveMode());
    }

    // Subscribe to store mutations
    const unsubscribe = store.subscribe(() => {
      syncStateFromStore();
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      renderer.resize();
      setZoom(renderer.camera.userZoom);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Fast pointer sync for inventory UI-lift ghost bridge and PieceToolbar auto-hide
    const syncDragStateOnPointer = () => {
      if (rendererRef.current) {
        const ds = rendererRef.current.dragState;
        setActiveDragState(ds ? { ...ds } : null);
      }
      if (gestureRef.current && isDevOpen) {
        setConstructionDiag(gestureRef.current.getConstructionDiagnostics());
      }
    };
    window.addEventListener('pointermove', syncDragStateOnPointer, { passive: true });
    window.addEventListener('pointerup', syncDragStateOnPointer, { passive: true });
    window.addEventListener('pointercancel', syncDragStateOnPointer, { passive: true });

    // Interval to sync selection, camera zoom, captions, and diagnostics to React UI
    const intervalId = window.setInterval(() => {
      if (rendererRef.current) {
        const piece = rendererRef.current.getSelectedPiece();
        setSelectedPiece((prev) => {
          if (!prev && !piece) return null;
          if (
            prev &&
            piece &&
            prev.id === piece.id &&
            prev.rotation === piece.rotation &&
            prev.condition === piece.condition
          ) {
            return prev;
          }
          return piece ? { ...piece } : null;
        });
        const ds = rendererRef.current.dragState;
        setActiveDragState(ds ? { ...ds } : null);
        setZoom(rendererRef.current.camera.userZoom);
        setStatusFeedback(gestureRef.current?.statusFeedback || null);
        const sc = rendererRef.current.siegeController;
        setReinforcementTimerSec(sc.reinforcementTimerSec);

        const pd = rendererRef.current.presentationDirector;
        setActiveCaption(pd.activeCaption);
        setIsReplaying(pd.isReplaying);
        if (isDevOpen) {
          setPresDiag(rendererRef.current.getPresentationDiagnostics());
        }
        if (gestureRef.current) {
          setConstructionDiag(gestureRef.current.getConstructionDiagnostics());
          setTapPlacementActive(Boolean(gestureRef.current.tapPlacementMode?.active));
        }
      }
    }, 100);

    syncStateFromStore();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pointermove', syncDragStateOnPointer);
      window.removeEventListener('pointerup', syncDragStateOnPointer);
      window.removeEventListener('pointercancel', syncDragStateOnPointer);
      resizeObserver.disconnect();
      unsubscribe();
      gesture.unbind();
      renderer.destroy();
    };
  }, [syncStateFromStore, isDevOpen]);

  // Handlers
  const handleUndo = () => {
    if (!isEditableMode(mode)) return;
    storeRef.current.undo();
    soundSynth.playSnap();
  };

  const handleRedo = () => {
    if (!isEditableMode(mode)) return;
    storeRef.current.redo();
    soundSynth.playSnap();
  };

  const handleToggleSnap = () => {
    const next = !snapping;
    setSnapping(next);
    if (gestureRef.current) {
      gestureRef.current.snappingEnabled = next;
    }
    storeRef.current.setActiveDragTutorialContext(null, next);
    syncStateFromStore();
    soundSynth.playSnap();
  };

  const handleUpdatePresSettings = (partial: Partial<PresentationSettings>) => {
    if (!rendererRef.current) return;
    rendererRef.current.presentationDirector.updateSettings(partial);
    setPresSettings({ ...rendererRef.current.presentationDirector.settings });
    setPresDiag(rendererRef.current.getPresentationDiagnostics());
  };

  const handleResetPresSettings = () => {
    if (!rendererRef.current) return;
    rendererRef.current.presentationDirector.clearPresentationSettings();
    setPresSettings({ ...rendererRef.current.presentationDirector.settings });
    setPresDiag(rendererRef.current.getPresentationDiagnostics());
  };

  const handleCycleFlightCamera = () => {
    const order: FlightCameraPreference[] = [
      'SIDE_FOLLOW',
      'EXPERIMENTAL_POV',
      'TACTICAL_WIDE',
    ];
    const idx = order.indexOf(presSettings.preferredFlightCamera);
    const next = order[(idx + 1) % order.length];
    handleUpdatePresSettings({
      preferredFlightCamera: next,
      enableExperimentalPOV: next === 'EXPERIMENTAL_POV',
    });
  };

  const handleStartDrag = (type: MaterialType, clientX: number, clientY: number) => {
    if (gestureRef.current) {
      gestureRef.current.startInventoryDrag(type, clientX, clientY);
    }
  };

  const handleTestSiege = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    storeRef.current.clearBeginSiegeHighlight();
    const started = rendererRef.current.startSiegeTest(true);
    if (started) {
      setMode(rendererRef.current.getEffectiveMode());
      setSelectedPiece(null);
    }
  };

  const handleTestFortress = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.siegeController.skipOpeningSequence();
    setMode('TESTING_SIMULATION');
    rendererRef.current.setMode('TESTING_SIMULATION');
    setSelectedPiece(null);
    syncStateFromStore();
  };

  const handleAcceptStableDesign = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.acceptStableDesign(true);
    setMode(rendererRef.current.getEffectiveMode());
    setSelectedPiece(null);
    setStabilityReport((prev) => ({ ...prev, isSimulating: false }));
    soundSynth.playSnap();
    syncStateFromStore();
  };

  const handleReturnToBuild = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.returnToBuildFromTest();
    setMode('CONSTRUCTION');
    setSelectedPiece(null);
    setStabilityReport((prev) => ({ ...prev, isSimulating: false }));
    syncStateFromStore();
  };

  const handleReturnFromWispPhaseToBuild = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.returnFromWispPhaseToBuild();
    setMode('CONSTRUCTION');
    setSelectedPiece(null);
    syncStateFromStore();
  };

  const handleEnterPreSiegeReview = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    const ok = rendererRef.current.enterPreSiegeReview();
    if (ok) {
      setMode('PRE_SIEGE_REVIEW');
      setSelectedPiece(null);
    }
    syncStateFromStore();
  };

  const handleReturnToPlaceWispsFromReview = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.returnToPlaceWispsFromReview();
    setMode('PLACE_WISPS');
    syncStateFromStore();
  };

  const handlePlaceAllDefaultWisps = () => {
    storeRef.current.placeAllWispsInDefaultSanctuarySlots();
    soundSynth.playSnap();
    syncStateFromStore();
  };

  const handleToggleSkipGuidance = () => {
    const next = !storeRef.current.guidanceSkipped;
    storeRef.current.setGuidanceSkipped(next);
    syncStateFromStore();
  };

  const handleEnterReinforcement = () => {
    if (!rendererRef.current) return;
    rendererRef.current.presentationDirector.skipReplay();
    rendererRef.current.siegeController.enterReinforcementPhase();
    setMode(rendererRef.current.getEffectiveMode());
    syncStateFromStore();
  };

  const handleBeginActiveReinforcement = () => {
    if (!rendererRef.current) return;
    rendererRef.current.siegeController.beginActiveReinforcement();
    setMode(rendererRef.current.getEffectiveMode());
    syncStateFromStore();
  };

  const handleAcknowledgeDelivery = () => {
    if (!rendererRef.current) return;
    rendererRef.current.siegeController.acknowledgeEmergencyDelivery();
    setMode(rendererRef.current.getEffectiveMode());
    syncStateFromStore();
  };

  const handleFinishReinforcement = () => {
    if (!rendererRef.current) return;
    rendererRef.current.siegeController.finishReinforcement();
    setMode(rendererRef.current.getEffectiveMode());
    setSelectedPiece(null);
    syncStateFromStore();
  };

  const handleLaunchFinalAttack = () => {
    if (!rendererRef.current) return;
    rendererRef.current.siegeController.launchFinalAttack();
    setMode(rendererRef.current.getEffectiveMode());
    setSelectedPiece(null);
    syncStateFromStore();
  };

  const handleRetryDesign = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.presentationDirector.skipReplay();
    if (rendererRef.current.siegeController.mode !== 'CONSTRUCTION') {
      rendererRef.current.siegeController.retryDesign();
    } else {
      rendererRef.current.setMode('CONSTRUCTION');
    }
    setMode('CONSTRUCTION');
    setSelectedPiece(null);
    setStabilityReport((prev) => ({ ...prev, isSimulating: false }));
    syncStateFromStore();
  };

  const handleStartOver = () => {
    if (!rendererRef.current) return;
    gestureRef.current?.completeOrCancelActiveDragSafely();
    rendererRef.current.resetLevel();
    setMode('CONSTRUCTION');
    setSelectedPiece(null);
    setStabilityReport((prev) => ({ ...prev, isSimulating: false }));
    syncStateFromStore();
  };

  const handleEmergencyStop = () => {
    if (!rendererRef.current) return;
    rendererRef.current.presentationDirector.skipReplay();
    if (rendererRef.current.siegeController.mode !== 'CONSTRUCTION') {
      rendererRef.current.siegeController.emergencyStop();
      setMode(rendererRef.current.getEffectiveMode());
    } else {
      rendererRef.current.emergencyStopAndRestore();
      setMode('CONSTRUCTION');
    }
    setStabilityReport((prev) => ({ ...prev, isSimulating: false }));
    syncStateFromStore();
  };

  const [manualBindCandidateIndex, setManualBindCandidateIndex] = useState(0);

  const handleRotateSelected = (deltaAngle: number) => {
    if (!selectedPiece) return;
    if (gestureRef.current) {
      gestureRef.current.rotateSelectedPiece(deltaAngle);
    } else {
      storeRef.current.rotatePiece(selectedPiece.id, deltaAngle);
      soundSynth.playRotate();
    }
    syncStateFromStore();
  };

  const handleBindSelectedConnection = () => {
    if (!selectedPiece) return;
    const created = storeRef.current.bindPieceConnection(
      selectedPiece.id,
      manualBindCandidateIndex,
    );
    if (created) {
      soundSynth.playPlace(selectedPiece.type);
      setManualBindCandidateIndex(0);
      syncStateFromStore();
    }
  };

  const handleCycleBindCandidate = () => {
    setManualBindCandidateIndex((prev) => prev + 1);
  };

  const handleDetachSelectedConnection = (jointId?: string) => {
    if (!selectedPiece) return;
    if (jointId) {
      if (gestureRef.current) {
        gestureRef.current.detachSelectedTimberJoint(jointId);
      } else {
        storeRef.current.detachTimberJoints(selectedPiece.id, jointId);
      }
    } else if (gestureRef.current) {
      gestureRef.current.detachSelectedPieceConnection();
    } else {
      storeRef.current.detachPieceConnection(selectedPiece.id);
    }
    syncStateFromStore();
  };

  const handleRemoveSelected = () => {
    if (!selectedPiece) return;
    storeRef.current.removePiece(selectedPiece.id);
    setSelectedPiece(null);
    if (rendererRef.current) {
      rendererRef.current.selectedPieceId = null;
    }
    soundSynth.playRemove();
  };

  const handleDeselect = () => {
    setSelectedPiece(null);
    if (rendererRef.current) {
      rendererRef.current.selectedPieceId = null;
    }
  };

  const handleZoomIn = () => {
    rendererRef.current?.camera.zoomBy(1.2);
    if (rendererRef.current) setZoom(rendererRef.current.camera.userZoom);
  };

  const handleZoomOut = () => {
    rendererRef.current?.camera.zoomBy(0.83);
    if (rendererRef.current) setZoom(rendererRef.current.camera.userZoom);
  };

  const handleResetView = () => {
    rendererRef.current?.camera.recenterFortress();
    if (rendererRef.current) setZoom(rendererRef.current.camera.userZoom);
  };

  const handleClearStorage = () => {
    gestureRef.current?.completeOrCancelActiveDragSafely();
    storeRef.current.clearAllPrototypeData();
    rendererRef.current?.resetLevel();
    setSelectedPiece(null);
    setMode('CONSTRUCTION');
    soundSynth.playRemove();
    syncStateFromStore();
  };

  const isEditable = isEditableMode(mode);
  const isReinforcement =
    mode === 'REINFORCEMENT_INTRO' ||
    mode === 'REINFORCEMENT_ACTIVE' ||
    mode === 'EMERGENCY_DELIVERY';

  const sc = rendererRef.current?.siegeController;
  const pd = rendererRef.current?.presentationDirector;
  const authoritativeTutorial = storeRef.current.getAuthoritativeTutorialState(levelState);
  const tutorialChecklist = storeRef.current.getTutorialChecklist(levelState);
  const tutorialChecklistReady = Boolean(
    authoritativeTutorial.siegeEligible || sc?.devBypassTutorialRequirements,
  );
  const needsStabilityTest = Boolean(
    authoritativeTutorial.beamPlaced &&
      authoritativeTutorial.blockPlaced &&
      authoritativeTutorial.supportedConnectionCreated &&
      !authoritativeTutorial.stabilityTestPassed,
  );
  const highlightInventoryFocus = Boolean(
    sc?.checklistHighlightActive &&
      (!authoritativeTutorial.beamPlaced || !authoritativeTutorial.blockPlaced),
  );
  const highlightedMaterial: MaterialType | null =
    authoritativeTutorial.currentHighlightedItemId === 'wood_beam'
      ? 'wood_beam'
      : authoritativeTutorial.currentHighlightedItemId === 'wood_block'
        ? 'wood_block'
        : null;
  const guidanceActive = Boolean(
    !authoritativeTutorial.guidanceSkipped && !authoritativeTutorial.basicLessonComplete,
  );
  const liveConstructionTelemetry =
    mode === 'CONSTRUCTION' ||
    mode === 'INITIAL_CONSTRUCTION' ||
    mode === 'CONSTRUCTION_READY' ||
    mode === 'TESTING_SIMULATION' ||
    mode === 'SETTLED'
      ? sc?.buildLiveConstructionTelemetry(levelState)
      : sc?.constructionTelemetry;

  const isToolbarPositionedTop = Boolean(
    selectedPiece &&
      rendererRef.current &&
      canvasRef.current &&
      (() => {
        const rect = canvasRef.current.getBoundingClientRect();
        const selScreen = rendererRef.current.camera.worldToScreen(selectedPiece.position, rect);
        if (selScreen.y > window.innerHeight * 0.48) return true;
        const suggested = authoritativeTutorial.currentSuggestedPlacementRegion;
        if (suggested) {
          const sugScreen = rendererRef.current.camera.worldToScreen(suggested.center, rect);
          if (sugScreen.y > window.innerHeight * 0.48) return true;
        }
        return false;
      })(),
  );

  const showUiLiftBridge = Boolean(
    activeDragState &&
      activeDragState.source === 'inventory' &&
      activeDragState.pointerUiCoords &&
      (activeDragState.inventoryLiftState === 'UI_LIFT' ||
        activeDragState.inventoryLiftState === 'RETURNING_TO_INVENTORY' ||
        activeDragState.inventoryLiftState === 'TRANSITIONING_TO_WORLD' ||
        (activeDragState.transitionProgress ?? 1) < 0.92),
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d16] select-none touch-none">
      {/* 1. Fullscreen Game Canvas Host */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        <canvas
          ref={canvasRef}
          className="game-canvas block w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* 2. Top Header HUD */}
      <TopHUD
        mode={mode}
        canUndo={canUndo}
        canRedo={canRedo}
        undoCount={undoCount}
        redoCount={redoCount}
        snapping={snapping}
        highlightSnap={authoritativeTutorial.currentHighlightedItemId === 'snap_toggle'}
        sampleUnlockActive={storeRef.current.unlockState.reinforcementReserveUnlocked}
        isMuted={presSettings.isMuted}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleSnap={handleToggleSnap}
        onToggleMute={() => handleUpdatePresSettings({ isMuted: !presSettings.isMuted })}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onToggleDev={() => setIsDevOpen((prev) => !prev)}
        devOpen={isDevOpen}
      />

      {/* 3. Incoming Threat Lineup & Contextual Tutorial / Mentor Delivery Banner */}
      <ThreatLineupBar
        mode={mode}
        state={levelState}
        currentAttackIndex={sc?.currentAttackIndex ?? 0}
        attacksRemaining={sc?.getAttacksRemaining() ?? 2}
        deliveredInventory={storeRef.current.deliveredInventory}
        deliveryGranted={storeRef.current.deliveryGranted}
        statusFeedback={statusFeedback}
        reloadNotice={sc?.reloadNotice ?? null}
        bullseyeNotice={sc?.bullseyeNotice ?? null}
        tutorialChecklist={tutorialChecklist}
        authoritativeTutorial={authoritativeTutorial}
        checklistHighlightActive={Boolean(sc?.checklistHighlightActive)}
        tutorialGateWarning={sc?.tutorialGateWarning ?? null}
        presentationMode={presSettings.presentationMode}
        snapping={snapping}
        activeConnectionHint={storeRef.current.activeConnectionHint?.text ?? null}
        onDismissConnectionHint={() => {
          storeRef.current.dismissConnectionHint();
          syncStateFromStore();
        }}
        onAdvanceIntro={() => {
          pd?.recordSkip('OPENING_STEP');
          sc?.advanceOpeningSequence();
        }}
        onSkipIntro={() => {
          pd?.recordSkip('OPENING_SEQUENCE');
          sc?.skipOpeningSequence();
        }}
        onBeginReinforcement={handleBeginActiveReinforcement}
        onAcknowledgeDelivery={handleAcknowledgeDelivery}
        onLaunchFinalAttack={handleLaunchFinalAttack}
        onTriggerTutorialIntro={() => sc?.startOpeningSequence()}
        onToggleSkipGuidance={handleToggleSkipGuidance}
      />

      {/* 4. Floating Zoom, Recenter & Flight Camera Controls (Hidden during active First-Person POV) */}
      {pd?.currentCameraMode !== 'PROJECTILE_POV_CAMERA' && (
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          currentZoom={zoom}
          flightCamera={presSettings.preferredFlightCamera}
          onCycleFlightCamera={handleCycleFlightCamera}
        />
      )}

      {/* 5. Stability Monitor Gauge (Active during simulation) */}
      <StabilityGauge
        report={stabilityReport}
        mode={mode}
        presentationMode={presSettings.presentationMode}
      />

      {/* 6. Contextual Piece Toolbar (Auto-collapses during active drag & repositions away from snap targets) */}
      {isEditable && (
        <PieceToolbar
          selectedPiece={selectedPiece}
          activeJointCount={
            selectedPiece
              ? storeRef.current
                  .getJointsForPiece(selectedPiece.id)
                  .filter((j) => j.state !== 'BROKEN').length
              : 0
          }
          activeJoints={
            selectedPiece
              ? storeRef.current
                  .getJointsForPiece(selectedPiece.id)
                  .filter((j) => j.state !== 'BROKEN')
              : []
          }
          manualBindCandidates={
            selectedPiece ? storeRef.current.getManualBindCandidates(selectedPiece.id) : []
          }
          manualBindCandidateIndex={manualBindCandidateIndex}
          isDragging={Boolean(activeDragState)}
          isReinforcement={isReinforcement}
          isPositionedTop={isToolbarPositionedTop}
          onRotate={handleRotateSelected}
          onBindConnection={handleBindSelectedConnection}
          onCycleBindCandidate={handleCycleBindCandidate}
          onDetachConnection={handleDetachSelectedConnection}
          onRemove={handleRemoveSelected}
          onDeselect={handleDeselect}
        />
      )}

      {/* 6B. Tap Accessibility Placement Mode Bar */}
      {isEditable && tapPlacementActive && (
        <PlacementModeBar
          dragState={rendererRef.current?.dragState ?? null}
          onRotate={(delta) => {
            gestureRef.current?.rotateActiveGhost(delta);
            syncStateFromStore();
          }}
          onAcceptSnapAngle={() => {
            gestureRef.current?.acceptProposedSnapRotation();
            syncStateFromStore();
          }}
          onCycleCandidate={() => {
            gestureRef.current?.cycleSnapCandidate();
            syncStateFromStore();
          }}
          onConfirm={() => {
            gestureRef.current?.confirmTapPlacement();
            syncStateFromStore();
          }}
          onCancel={() => {
            gestureRef.current?.cancelTapPlacement();
            syncStateFromStore();
          }}
        />
      )}

      {/* 6C. Single Bottom Subtitle Region (Personality & Comedic Character Quips) */}
      {presSettings.enableSubtitles && activeCaption && (
        <div
          className={`fixed ${
            isEditable ||
            mode === 'LEVEL_INTRO' ||
            mode === 'WISP_INTRO' ||
            mode === 'THREAT_PREVIEW'
              ? 'bottom-32'
              : 'bottom-16'
          } left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-sm w-[90%] flex justify-center transition-all duration-150`}
        >
          <div className="bg-slate-950/92 border border-amber-500/45 text-amber-100 px-3 py-1.5 rounded-xl text-xs font-medium leading-snug text-center shadow-xl backdrop-blur-md">
            {activeCaption}
          </div>
        </div>
      )}

      {/* 7. Bottom Dock: Primary Actions + Inventory Tray */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex flex-col items-center safe-bottom">
        <div className="w-full max-w-md px-3 pb-1.5 pt-1 bg-slate-950/85 backdrop-blur-md border-t border-slate-800/60">
          <ActionControls
            mode={mode}
            reinforcementTimerSec={reinforcementTimerSec}
            reinforcementTimerDisabled={reinforcementTimerDisabled}
            reinforcementTimerPaused={reinforcementTimerPaused}
            tutorialChecklistReady={tutorialChecklistReady}
            needsStabilityTest={needsStabilityTest}
            authoritativeTutorial={authoritativeTutorial}
            isStabilityTestPassed={Boolean(
              stabilityReport.isSettled && stabilityReport.fallenCount === 0,
            )}
            onTestFortress={handleTestFortress}
            onTestSiege={handleTestSiege}
            onAcceptStableDesign={handleAcceptStableDesign}
            onReturnToBuild={handleReturnToBuild}
            onFinishReinforcement={handleFinishReinforcement}
            onLaunchFinalAttack={handleLaunchFinalAttack}
            onRestoreDesign={handleRetryDesign}
            onEmergencyStop={handleEmergencyStop}
            onResetLevel={handleStartOver}
          />
        </div>

        {/* Inventory Tray (visible during initial construction and reinforcement phase) */}
        {(isEditable ||
          mode === 'LEVEL_INTRO' ||
          mode === 'WISP_INTRO' ||
          mode === 'THREAT_PREVIEW') && (
          <InventoryTray
            inventory={levelState.inventory}
            deliveredInventory={storeRef.current.deliveredInventory}
            isReinforcement={isReinforcement}
            disabled={false}
            highlightFocus={highlightInventoryFocus}
            highlightedMaterial={highlightedMaterial}
            guidanceActive={guidanceActive}
            activeLiftItemType={
              activeDragState?.source === 'inventory' ? activeDragState.pieceType : null
            }
            onPointerDownItem={(type, e, cardBounds, trayTopY) => {
              gestureRef.current?.handleInventoryPointerDown(type, e, cardBounds, trayTopY);
              syncStateFromStore();
            }}
            onStartDrag={handleStartDrag}
          />
        )}
      </div>

      {/* 7A-1. Post-Stability Wisp Placement Staging Tray (PLACE_WISPS) */}
      {mode === 'PLACE_WISPS' && (
        <WispPlacementTray
          wisps={levelState.wisps}
          selectedWispId={selectedWispId}
          sharedCollapseWarning={storeRef.current.getSharedCollapseRiskWarning(levelState)}
          defaultSlotReportMessage={storeRef.current.lastDefaultSlotPlacementReport?.message ?? null}
          onSelectWisp={(wispId) => {
            gestureRef.current?.selectWispForPlacement(wispId);
            syncStateFromStore();
          }}
          onWispPointerDown={(wispId, e) => {
            gestureRef.current?.handleWispTrayPointerDown(wispId, e);
            syncStateFromStore();
          }}
          onPlaceAllDefaults={handlePlaceAllDefaultWisps}
          onReturnToBuild={handleReturnFromWispPhaseToBuild}
          onEnterPreSiegeReview={handleEnterPreSiegeReview}
          allWispsPlacedAndValid={storeRef.current.areAllWispsPlacedAndValid(levelState)}
        />
      )}

      {/* 7A-2. Pre-Siege Review Panel (PRE_SIEGE_REVIEW) */}
      {mode === 'PRE_SIEGE_REVIEW' && (
        <PreSiegeReviewPanel
          wisps={levelState.wisps}
          inventory={levelState.inventory}
          bullseyeState={storeRef.current.getBullseyeLogicalState(
            Boolean(sc?.targetingDiagnostics?.bullseyeReachableByCurrentAttacker ?? true),
            sc?.targetingDiagnostics?.validBullseyeTrajectoryCount ?? 0,
          )}
          sharedCollapseWarning={storeRef.current.getSharedCollapseRiskWarning(levelState)}
          onReturnToPlaceWisps={handleReturnToPlaceWispsFromReview}
          onReturnToBuild={handleReturnFromWispPhaseToBuild}
          onBeginSiege={handleTestSiege}
        />
      )}

      {/* 7B. UI-to-World Inventory Lift Ghost Bridge (Visibly lifts from touched card across tray boundary) */}
      {showUiLiftBridge && activeDragState && activeDragState.pointerUiCoords && (
        <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
          {(() => {
            const pUi = activeDragState.pointerUiCoords;
            const card = activeDragState.sourceCardBounds;
            const prog = activeDragState.transitionProgress ?? 0;
            const presScale = activeDragState.ghostPresentationScale ?? 0.55;
            const liftY = 8 + 40 * prog;
            const ghostScreenX = pUi.x;
            const ghostScreenY = pUi.y - liftY;
            const cfg = MATERIAL_CONFIGS[activeDragState.pieceType];
            const rotDeg = (activeDragState.rotation * 180) / Math.PI;
            const isReturning = activeDragState.inventoryLiftState === 'RETURNING_TO_INVENTORY';
            // Cross-fade into canvas ghost as transitionProgress approaches 1.0
            const bridgeOpacity = prog > 0.78 ? Math.max(0.15, 1 - (prog - 0.78) * 3.8) : 0.96;

            return (
              <>
                {card && (
                  <svg className="absolute inset-0 w-full h-full">
                    <line
                      x1={card.x + card.width / 2}
                      y1={card.y + card.height / 2}
                      x2={ghostScreenX}
                      y2={ghostScreenY}
                      stroke={isReturning ? 'rgba(251, 191, 36, 0.65)' : 'rgba(45, 212, 191, 0.7)'}
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx={card.x + card.width / 2}
                      cy={card.y + card.height / 2}
                      r="4"
                      fill={isReturning ? '#fbbf24' : '#2dd4bf'}
                    />
                  </svg>
                )}
                <div
                  style={{
                    position: 'absolute',
                    left: `${ghostScreenX}px`,
                    top: `${ghostScreenY}px`,
                    width: `${cfg.width * zoom}px`,
                    height: `${cfg.height * zoom}px`,
                    transform: `translate(-50%, -50%) scale(${presScale}) rotate(${rotDeg}deg)`,
                    opacity: bridgeOpacity,
                    background:
                      activeDragState.pieceType === 'wood_beam'
                        ? 'linear-gradient(to bottom, #c28148, #7e461b)'
                        : activeDragState.pieceType === 'wood_block'
                          ? 'linear-gradient(135deg, #b4743c, #854d22)'
                          : activeDragState.pieceType === 'stone_block'
                            ? 'linear-gradient(135deg, #64748b, #334155)'
                            : 'linear-gradient(135deg, #4c1d3d, #231020)',
                    borderColor:
                      activeDragState.pieceType === 'bullseye_block' ? '#f43f5e' : '#38bdf8',
                  }}
                  className="rounded-xs border-2 shadow-2xl shadow-cyan-500/40 flex items-center justify-center"
                >
                  {activeDragState.pieceType === 'bullseye_block' && (
                    <div className="w-5 h-5 rounded-full bg-rose-600 border border-amber-200 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-amber-200" />
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 8. Active Siege HUD & Post-Attack-1 Assessment Card */}
      {sc && (
        <SiegeHUD
          siegeController={sc}
          state={levelState}
          flightCamera={presSettings.preferredFlightCamera}
          onCycleFlightCamera={handleCycleFlightCamera}
          isReplaying={isReplaying}
          hasReplayFrames={(pd?.replayFrames.length ?? 0) > 0}
          onStartReplay={() => {
            pd?.startReplay();
            syncStateFromStore();
          }}
          onSkipReplay={() => {
            pd?.skipReplay();
            syncStateFromStore();
          }}
          onSkipIntro={() => {
            pd?.recordSkip('ATTACK_INTRO');
            sc.skipIntroduction();
          }}
          onEnterReinforcement={handleEnterReinforcement}
          onNextAttack={() => sc.nextAttackManually()}
          onEmergencyStop={handleEmergencyStop}
          onRestoreDesign={handleRetryDesign}
        />
      )}

      {/* 9. Level 1 Results, Mastery Evaluation & Sample Unlock Modal (hidden while watching visual replay) */}
      {!isReplaying &&
        (mode === 'SEQUENCE_COMPLETE' ||
          mode === 'RESULTS' ||
          mode === 'UNLOCK_PRESENTATION') &&
        sc && (
          <SiegeCompleteModal
            summary={sc.siegeSummary}
            results={sc.level1Results}
            unlockState={storeRef.current.unlockState}
            hasReplayFrames={(pd?.replayFrames.length ?? 0) > 0}
            onWatchCinematicReplay={() => {
              pd?.startReplay();
              syncStateFromStore();
            }}
            onReplaySameSiege={() => {
              pd?.skipReplay();
              sc.replaySameSiege();
              setMode(rendererRef.current?.getEffectiveMode() || 'CONSTRUCTION');
            }}
            onRetryDesign={handleRetryDesign}
            onStartOver={handleStartOver}
          />
        )}

      {/* 10. Developer Diagnostic Panel (25 Presentation Fields + 13 Presentation Controls + 9 Gameplay Controls) */}
      <DiagnosticPanel
        isOpen={isDevOpen}
        onClose={() => setIsDevOpen(false)}
        mode={mode}
        selectedPieceId={selectedPiece?.id || null}
        state={levelState}
        undoCount={undoCount}
        redoCount={redoCount}
        constructionHistory={storeRef.current.getConstructionHistoryCounts()}
        reinforcementHistory={storeRef.current.getReinforcementHistoryCounts()}
        zoom={zoom}
        hasSnapshot={storeRef.current.hasSnapshot()}
        activeSnapshots={storeRef.current.getActiveSnapshotList()}
        categoryCounts={storeRef.current.getInventoryCategoryCounts()}
        deliveryGranted={storeRef.current.deliveryGranted}
        deliveredInventory={storeRef.current.deliveredInventory}
        guaranteedDeliveryUsed={storeRef.current.guaranteedDeliveryUsed}
        currentAttackIndex={sc?.currentAttackIndex ?? 0}
        attacksRemaining={sc?.getAttacksRemaining() ?? 2}
        reinforcementTimerSec={reinforcementTimerSec}
        reinforcementTimerDisabled={reinforcementTimerDisabled}
        unlockState={storeRef.current.unlockState}
        physicsDiagnostics={rendererRef.current?.getPhysicsDiagnostics() || null}
        targetingDiagnostics={sc?.targetingDiagnostics || null}
        presentationDiagnostics={presDiag}
        constructionTelemetry={liveConstructionTelemetry}
        constructionDiagnostics={constructionDiag}
        devBypassTutorialRequirements={Boolean(sc?.devBypassTutorialRequirements)}
        onToggleDevBypassTutorialRequirements={() => {
          if (sc) {
            sc.setDevBypassTutorialRequirements(!sc.devBypassTutorialRequirements);
            syncStateFromStore();
          }
        }}
        distancePreset={distancePreset}
        onSelectDistancePreset={(preset) => {
          setDistancePreset(preset);
          sc?.setDistancePreset(preset);
        }}
        cameraFramingMode={rendererRef.current?.camera.framingMode || 'CONSTRUCTION_CAMERA'}
        actualFlightTime={rendererRef.current
          ?.getActivePhysicsBridge()
          ?.getProjectileFlightTime()}
        onToggleDisableTimer={() => {
          sc?.setReinforcementTimerDisabled(!sc.reinforcementTimerDisabled);
          syncStateFromStore();
        }}
        onExtendTimer30s={() => {
          sc?.extendReinforcementTimer(30);
          syncStateFromStore();
        }}
        onJumpToPostAttack1={() => {
          sc?.jumpToPostAttack1TestState();
          setMode(rendererRef.current?.getEffectiveMode() || 'REINFORCEMENT_ACTIVE');
          syncStateFromStore();
        }}
        onGrantReserveEmpty={() => {
          sc?.forceReserveEmptyTestState();
          setMode(rendererRef.current?.getEffectiveMode() || mode);
          syncStateFromStore();
        }}
        onForceGuaranteedDelivery={() => {
          sc?.forceGuaranteedDeliveryTest();
          setMode(rendererRef.current?.getEffectiveMode() || mode);
          syncStateFromStore();
        }}
        onSimulateSafeReload={() => {
          sc?.simulateSafeReload();
          setMode(rendererRef.current?.getEffectiveMode() || 'CONSTRUCTION');
          syncStateFromStore();
        }}
        onClearTutorialState={() => {
          storeRef.current.clearTutorialState();
          syncStateFromStore();
        }}
        onClearSampleUnlock={() => {
          storeRef.current.clearSampleUnlock();
          syncStateFromStore();
        }}
        onClearStorage={handleClearStorage}
        // Phase 4 Developer Presentation Controls
        onPreviewStandardIntro={() => {
          pd?.previewStandardIntro();
          syncStateFromStore();
        }}
        onPreviewHeavyIntro={() => {
          pd?.previewHeavyIntro();
          syncStateFromStore();
        }}
        onTriggerWispReaction={(st) => {
          pd?.triggerWispReactionPreview(st);
          syncStateFromStore();
        }}
        onPreviewStandardFlight={() => {
          pd?.previewStandardFlight();
          syncStateFromStore();
        }}
        onPreviewHeavyFlight={() => {
          pd?.previewHeavyFlight();
          syncStateFromStore();
        }}
        onPreviewWispDispersalCosmetic={() => {
          pd?.previewWispDispersalCosmetic(performance.now() / 1000);
          syncStateFromStore();
        }}
        onForceCameraOverride={(cm) => {
          pd?.forceCameraModeOverride(cm);
          syncStateFromStore();
        }}
        onToggleExperimentalPOV={() => {
          handleUpdatePresSettings({
            enableExperimentalPOV: !presSettings.enableExperimentalPOV,
          });
        }}
        onTestPovFallback={() => {
          if (pd) {
            pd.testPovFallback(!pd.devForcePovFallback);
            syncStateFromStore();
          }
        }}
        onTestImpactSeverity={(sev) => {
          pd?.testImpactSeverityCosmetic(sev);
          syncStateFromStore();
        }}
        onToggleReplay={() => {
          if (pd?.isReplaying) pd.skipReplay();
          else pd?.startReplay();
          syncStateFromStore();
        }}
        onClearPresentationSettings={handleResetPresSettings}
        onClearReplayData={() => {
          pd?.clearReplayData();
          syncStateFromStore();
        }}
        // Phase 5 Bullseye Taunt Diagnostics & Developer Controls
        bullseyeConflictDiagnostic={storeRef.current.bullseyeConflictDiagnostic}
        lastTargetComparison={sc?.lastTargetComparison ?? null}
        onDevGrantBullseye={() => {
          sc?.devGrantBullseyeBlock();
          syncStateFromStore();
        }}
        onDevPlaceBullseyeReinforced={() => {
          sc?.devPlaceBullseyeReinforced();
          syncStateFromStore();
        }}
        onDevPlaceBullseyeExposedDecoy={() => {
          sc?.devPlaceBullseyeExposedDecoy();
          syncStateFromStore();
        }}
        onDevPlaceBullseyeUnreachable={() => {
          sc?.devPlaceBullseyeUnreachable();
          syncStateFromStore();
        }}
        onDevResetBullseyeState={() => {
          sc?.devResetBullseyeState();
          syncStateFromStore();
        }}
        onDevForceAttack1BullseyeTest={() => {
          sc?.devForceAttack1BullseyeTest();
          setMode(rendererRef.current?.getEffectiveMode() || mode);
          syncStateFromStore();
        }}
        onDevForceAttack2ReinforcementRetargetTest={() => {
          sc?.devForceAttack2ReinforcementRetargetTest();
          setMode(rendererRef.current?.getEffectiveMode() || mode);
          syncStateFromStore();
        }}
        onDevCompareOrdinaryVsBullseyeTarget={() => {
          sc?.devCompareOrdinaryVsBullseyeTarget();
          syncStateFromStore();
        }}
        developerWispOverrideDiagnostics={storeRef.current.getDeveloperWispOverrideDiagnostics()}
        onSetDeveloperWispCountOverride={(count) => {
          storeRef.current.setDeveloperWispCountOverride(count);
          syncStateFromStore();
        }}
        balanceTelemetryHistory={sc?.getBalanceTelemetryHistory() ?? []}
        onClearBalanceTelemetryHistory={() => {
          sc?.clearBalanceTelemetryHistory();
          syncStateFromStore();
        }}
      />

      {/* 11. Presentation & Camera Settings Modal */}
      <PresentationSettingsModal
        isOpen={isSettingsOpen}
        settings={presSettings}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdatePresSettings}
        onResetSettings={handleResetPresSettings}
      />

      {/* 12. Help / Manual Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
