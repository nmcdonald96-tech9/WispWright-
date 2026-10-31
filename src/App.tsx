/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LevelStore } from './game/state/levelStore';
import { CanvasRenderer } from './game/render/canvasRenderer';
import { GestureController, isEditableMode } from './game/input/gestureController';
import { GameMode, MaterialType, PlacedPiece, StabilityReport } from './game/types';
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
import { StabilityGauge } from './components/StabilityGauge';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { ZoomControls } from './components/ZoomControls';
import { HelpModal } from './components/HelpModal';
import { SiegeHUD } from './components/SiegeHUD';
import { SiegeCompleteModal } from './components/SiegeCompleteModal';
import { PresentationSettingsModal } from './components/PresentationSettingsModal';

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

    if (rendererRef.current) {
      const selected = rendererRef.current.getSelectedPiece();
      setSelectedPiece(selected ? { ...selected } : null);
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
      }
    }, 100);

    syncStateFromStore();

    return () => {
      window.clearInterval(intervalId);
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
    rendererRef.current.acceptStableDesign();
    setMode('CONSTRUCTION');
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
    rendererRef.current.presentationDirector.skipReplay();
    rendererRef.current.siegeController.startOver();
    rendererRef.current.setMode('CONSTRUCTION');
    rendererRef.current.camera.resetView();
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

  const handleRotateSelected = (deltaAngle: number) => {
    if (!selectedPiece) return;
    storeRef.current.rotatePiece(selectedPiece.id, deltaAngle);
    soundSynth.playRotate();
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
    storeRef.current.clearStorage();
    rendererRef.current?.siegeController.startOver();
    setSelectedPiece(null);
    if (rendererRef.current) {
      rendererRef.current.camera.resetView();
    }
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

      {/* 6. Contextual Piece Toolbar (When piece selected during Construction or Reinforcement) */}
      {isEditable && (
        <PieceToolbar
          selectedPiece={selectedPiece}
          isReinforcement={isReinforcement}
          onRotate={handleRotateSelected}
          onRemove={handleRemoveSelected}
          onDeselect={handleDeselect}
        />
      )}

      {/* 6B. Single Bottom Subtitle Region (Personality & Comedic Character Quips) */}
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
            onStartDrag={handleStartDrag}
          />
        )}
      </div>

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
