/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundSynth } from '../audio/synth';
import { Camera } from '../input/camera';
import { isEditableMode } from '../input/gestureController';
import { PhysicsBridge } from '../physics/physicsBridge';
import { PresentationDirector } from '../presentation/presentationDirector';
import { SiegeController } from '../siege/siegeController';
import { AUTHORED_ATTACKS } from '../siege/siegeConfig';
import { LevelStore } from '../state/levelStore';
import { DragState, GameMode, PlacedPiece, StabilityReport, Vector2 } from '../types';
import { renderEnvironment } from './renderEnvironment';
import { renderGizmos } from './renderGizmos';
import { renderLauncher } from './renderLauncher';
import { renderPiece } from './renderPieces';
import {
  renderProjectile,
  renderProjectilePOVOverlay,
  renderTrueFirstPersonPOV,
} from './renderProjectiles';
import { renderWisps } from './renderWisps';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private store: LevelStore;
  public camera: Camera;
  private physicsBridge: PhysicsBridge | null = null;
  public siegeController: SiegeController;
  public presentationDirector: PresentationDirector;

  private animFrameId: number | null = null;
  private lastTime = 0;
  private timeSec = 0;
  private povStepAccumulator = 0;
  private visibilityHandler: () => void;

  public mode: GameMode = 'CONSTRUCTION';
  public selectedPieceId: string | null = null;
  public dragState: DragState | null = null;
  public touchContactWorldPos?: Vector2;

  // Stability callback for UI
  private onStabilityUpdate?: (report: StabilityReport) => void;
  private lastReport: StabilityReport = {
    isSimulating: false,
    totalKineticEnergy: 0,
    maxVelocity: 0,
    settledRatio: 0,
    isSettled: false,
    fallenCount: 0,
  };

  constructor(
    canvas: HTMLCanvasElement,
    store: LevelStore,
    onStabilityUpdate?: (report: StabilityReport) => void,
    onSiegeUpdate?: () => void,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;
    this.store = store;
    this.camera = new Camera();
    this.onStabilityUpdate = onStabilityUpdate;

    this.siegeController = new SiegeController(this.store, onSiegeUpdate);
    this.presentationDirector = new PresentationDirector();

    // Tab visibility / background-return safety (Test N)
    this.visibilityHandler = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.lastTime = 0;
      } else {
        this.lastTime = performance.now();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    this.resize();
    this.startLoop();
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);

    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w <= 0 || h <= 0) return;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);

    this.camera.resize(w, h);
  }

  public setMode(mode: GameMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (mode === 'TESTING_SIMULATION') {
      this.store.captureSnapshot();
      this.selectedPieceId = null;
      this.dragState = null;

      if (this.physicsBridge) {
        this.physicsBridge.teardown();
      }
      this.physicsBridge = new PhysicsBridge(this.store.getState());
      soundSynth.playTestStart();
    } else if (mode === 'CONSTRUCTION') {
      if (this.physicsBridge) {
        this.physicsBridge.teardown();
        this.physicsBridge = null;
      }
      if (this.siegeController.physicsBridge) {
        this.siegeController.returnToConstruction();
      }
      this.store.restorePreTestSnapshot();
      soundSynth.playSnap();
    }
  }

  public startSiegeTest(enableReinforcement = true): boolean {
    this.selectedPieceId = null;
    this.dragState = null;
    this.povStepAccumulator = 0;
    this.presentationDirector.skipReplay();
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    const started = this.siegeController.startSiege(enableReinforcement);
    if (started) {
      this.mode = this.siegeController.mode;
    }
    return started;
  }

  public getEffectiveMode(): GameMode {
    if (this.siegeController.mode !== 'CONSTRUCTION') {
      return this.siegeController.mode;
    }
    return this.mode;
  }

  public getActivePhysicsBridge(): PhysicsBridge | null {
    if (this.siegeController.mode !== 'CONSTRUCTION') {
      return this.siegeController.physicsBridge;
    }
    return this.physicsBridge;
  }

  public emergencyStopAndRestore(): void {
    this.povStepAccumulator = 0;
    this.presentationDirector.skipReplay();
    if (this.siegeController.mode !== 'CONSTRUCTION') {
      this.siegeController.emergencyStop();
    } else {
      this.setMode('CONSTRUCTION');
    }
  }

  public getSelectedPiece(): PlacedPiece | null {
    if (!this.selectedPieceId) return null;
    return this.store.getState().pieces.find((p) => p.id === this.selectedPieceId) || null;
  }

  public getPhysicsDiagnostics() {
    const bridge = this.getActivePhysicsBridge();
    return bridge?.diagnostics || null;
  }

  public getPresentationDiagnostics() {
    return this.presentationDirector.getDiagnostics(
      this.getEffectiveMode(),
      this.siegeController,
      this.getActivePhysicsBridge(),
    );
  }

  private startLoop(): void {
    const tick = (now: number) => {
      if (!this.lastTime) this.lastTime = now;
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      // Clamp dt to 0.05s so background tab return never causes a giant physics jump
      const dt = Math.max(0, Math.min(rawDt, 0.05));
      this.timeSec += dt;

      this.update(dt);
      this.render();

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    const effectiveMode = this.getEffectiveMode();
    const activeBridge = this.getActivePhysicsBridge();

    // 1. Update PresentationDirector (Read-only observation of gameplay state)
    this.presentationDirector.update(
      dt,
      this.timeSec,
      this.store.getState(),
      this.siegeController,
      activeBridge,
      effectiveMode,
    );

    // 2. Apply Camera Director Framing
    this.updateCameraFraming();
    this.camera.update(dt);

    // 3. Siege & Level 1 Mode Tick (Paused while watching read-only visual replay)
    if (this.siegeController.mode !== 'CONSTRUCTION' && !this.presentationDirector.isReplaying) {
      const isSlowedPovFlight =
        this.siegeController.mode === 'PROJECTILE_IN_FLIGHT' &&
        this.presentationDirector.currentCameraMode === 'PROJECTILE_POV_CAMERA' &&
        this.presentationDirector.presentationTimeScale < 1.0;

      if (isSlowedPovFlight) {
        // Deterministic fixed-step accumulator:
        // PhysicsBridge.step() always steps Matter.js by a fixed 1000/60ms per call.
        // Accumulating presentationTimeScale (0.40 - 0.88) executes the exact same sequence
        // of fixed 60Hz Matter.js physics steps over more presentation frames without changing
        // launch velocity, gravity, colliders, damage, or wisp dispersal!
        this.povStepAccumulator += this.presentationDirector.presentationTimeScale;
        while (this.povStepAccumulator >= 1.0) {
          this.povStepAccumulator -= 1.0;
          this.siegeController.step(dt);
          if (this.siegeController.mode !== 'PROJECTILE_IN_FLIGHT') {
            this.povStepAccumulator = 0;
            break;
          }
        }
        this.presentationDirector.povInterpolationAlpha = this.povStepAccumulator;
      } else {
        this.povStepAccumulator = 0;
        this.presentationDirector.povInterpolationAlpha = 0;
        this.siegeController.step(dt);
      }

      this.mode = this.siegeController.mode;

      if (this.siegeController.physicsBridge && this.onStabilityUpdate) {
        const report = this.siegeController.physicsBridge.getStabilityReport(dt);
        this.lastReport = report;
        this.onStabilityUpdate(report);
      }
      return;
    }

    // 4. Phase 1 Stability Test Mode Tick
    if ((this.mode === 'TESTING_SIMULATION' || this.mode === 'SETTLED') && this.physicsBridge) {
      this.physicsBridge.step(dt * 1000);
      const report = this.physicsBridge.getStabilityReport(dt);
      this.lastReport = report;

      if (this.onStabilityUpdate) {
        this.onStabilityUpdate(report);
      }

      if (report.isSettled && this.mode === 'TESTING_SIMULATION') {
        this.mode = 'SETTLED';
        soundSynth.playSettledFanfare();
      }
    }
  }

  private updateCameraFraming(): void {
    const camMode = this.presentationDirector.currentCameraMode;
    const launcherX = this.siegeController.currentAttack?.spawnPosition.x ?? -460;
    const targetPos = this.siegeController.currentTarget?.position ?? { x: 350, y: 580 };
    const activeProj = this.getActivePhysicsBridge()?.getActiveProjectile();

    switch (camMode) {
      case 'CONSTRUCTION_CAMERA':
      case 'REINFORCEMENT_CAMERA':
      case 'RESULTS_CAMERA':
        // Focus tightly on the sanctuary fortress & protected wisps without excessive empty border
        this.camera.setFraming({ x: 360, y: 555 }, 560, 540, camMode);
        break;

      case 'THREAT_PREVIEW_CAMERA':
      case 'AIMING_CAMERA': {
        // Compute active-subject bounding box between launcher, ballistic arc, and target/fortress
        const minX = launcherX - 55;
        const maxX = Math.max(targetPos.x + 125, 475);
        const spanW = Math.max(620, maxX - minX);
        const centerX = (minX + maxX) / 2;
        // Exclude unnecessary empty vertical sky space while keeping ballistic apex & bedrock readable
        this.camera.setFraming({ x: centerX, y: 565 }, spanW, 480, camMode);
        break;
      }

      case 'ATTACKER_INTRO_CAMERA':
        // Tight character performance framing on the launcher & attacker
        this.camera.setFraming({ x: launcherX + 55, y: 615 }, 350, 310, camMode);
        break;

      case 'TARGET_REVEAL_CAMERA':
        // Close framing on the selected structural target and nearby wisps
        this.camera.setFraming(
          { x: (targetPos.x + 350) / 2, y: Math.min(615, targetPos.y + 10) },
          400,
          340,
          camMode,
        );
        break;

      case 'PROJECTILE_SIDE_FOLLOW_CAMERA':
        if (activeProj) {
          // Follow mode: External close character-follow framing showing face & in-flight expression,
          // expanding smoothly toward the target as impact approaches
          const distToTarget = Math.hypot(
            targetPos.x - activeProj.position.x,
            targetPos.y - activeProj.position.y,
          );
          const approachExpand = Math.max(0, Math.min(1, 1 - (distToTarget - 140) / 240));
          const leadX =
            activeProj.position.x * (1 - approachExpand * 0.42) +
            targetPos.x * (approachExpand * 0.42) +
            45 * (1 - approachExpand);
          const leadY = Math.max(
            310,
            Math.min(
              640,
              activeProj.position.y * (1 - approachExpand * 0.35) +
                targetPos.y * (approachExpand * 0.35),
            ),
          );
          const spanW = 410 + approachExpand * 85;
          const spanH = 340 + approachExpand * 70;
          this.camera.setFraming({ x: leadX, y: leadY }, spanW, spanH, camMode);
        } else {
          this.camera.setFraming({ x: 355, y: 555 }, 560, 520, camMode);
        }
        break;

      case 'PROJECTILE_POV_CAMERA':
        if (activeProj) {
          // POV Experimental: First-person view from the projectile looking directly at the approaching fortress!
          // As the projectile closes distance, the fortress rushes larger into the frame before cutting to IMPACT_CAMERA.
          const totalCorridorDist = Math.max(200, targetPos.x - launcherX);
          const remainingDist = Math.max(
            0,
            Math.hypot(targetPos.x - activeProj.position.x, targetPos.y - activeProj.position.y),
          );
          const progress = Math.max(0, Math.min(1, 1 - remainingDist / totalCorridorDist));

          // Look ahead along the line of sight to the target so the fortress is centered in the projectile's view
          const povCenterX =
            activeProj.position.x * (0.45 * (1 - progress)) +
            targetPos.x * (1 - 0.45 * (1 - progress));
          const povCenterY = Math.max(
            340,
            Math.min(
              635,
              activeProj.position.y * (0.4 * (1 - progress)) +
                targetPos.y * (1 - 0.4 * (1 - progress)),
            ),
          );
          const spanW = 430 - progress * 165;
          const spanH = 350 - progress * 130;
          this.camera.setFraming({ x: povCenterX, y: povCenterY }, spanW, spanH, camMode);
        } else {
          this.camera.setFraming({ x: targetPos.x, y: 555 }, 440, 380, camMode);
        }
        break;

      case 'IMPACT_CAMERA':
        // Target and nearby wisps are primary subjects while preserving surrounding structure
        this.camera.setFraming(
          { x: (targetPos.x + 355) / 2, y: Math.min(610, targetPos.y + 15) },
          450,
          390,
          camMode,
        );
        break;

      case 'COLLAPSE_CAMERA':
        this.camera.setFraming({ x: 360, y: 565 }, 490, 430, camMode);
        break;

      case 'SETTLEMENT_CAMERA':
        this.camera.setFraming({ x: 360, y: 555 }, 540, 500, camMode);
        break;

      case 'REPLAY_CAMERA': {
        const frame = this.presentationDirector.getCurrentReplayFrame();
        if (frame) {
          this.camera.setFraming(frame.cameraCenter, 540, 480, 'REPLAY_CAMERA');
        } else {
          this.camera.setFraming({ x: 360, y: 555 }, 560, 520, 'REPLAY_CAMERA');
        }
        break;
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const state = this.store.getState();
    const camera = this.camera;
    const effectiveMode = this.getEffectiveMode();
    const activeBridge = this.getActivePhysicsBridge();
    const pres = this.presentationDirector;
    const reducedMotion = pres.settings.reducedMotion;
    const isDeveloperMode = pres.settings.presentationMode === 'DEVELOPER';

    ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);

    // TRUE FIRST-PERSON PROJECTILE POV MODE:
    // When PROJECTILE_POV_CAMERA is active, render from inside the projectile's own forward-facing
    // 3D perspective (seated in launcher -> release jolt -> forward flight -> pre-impact cut).
    // Never draw the external 2D side-elevation battlefield or external projectile body in POV!
    if (
      !pres.isReplaying &&
      pres.currentCameraMode === 'PROJECTILE_POV_CAMERA' &&
      pres.povPose.isActive
    ) {
      const piecesForPov = activeBridge
        ? activeBridge.getSimulatedTransforms(state.pieces)
        : state.pieces;

      renderTrueFirstPersonPOV(
        ctx,
        camera.viewWidth,
        camera.viewHeight,
        pres.povPose,
        this.siegeController.currentAttack,
        piecesForPov,
        state.wisps,
        this.siegeController.currentTarget?.position ?? null,
        this.timeSec,
        pres.launcherStrain,
        pres.settings,
      );
      return;
    }

    ctx.save();
    const offset = camera.effectiveOffset;
    const scale = camera.effectiveScale;
    // Apply cosmetic screen-space shake ONLY here in render(), never in camera.screenToWorld()
    ctx.translate(offset.x + pres.shakeOffset.x, offset.y + pres.shakeOffset.y);
    ctx.scale(scale, scale);

    // 1. Render Environment (Sky, Parallax Depth, Bedrock, Anchors, Boundaries)
    renderEnvironment(
      ctx,
      state.anchors,
      this.timeSec,
      camera.currentCenter.x,
      reducedMotion,
      isDeveloperMode,
    );

    // 2. Check if Read-Only Visual Replay is active
    const replayFrame = pres.getCurrentReplayFrame();
    if (pres.isReplaying && replayFrame) {
      this.renderReplayScene(ctx, state, replayFrame, reducedMotion, isDeveloperMode);
      ctx.restore();
      return;
    }

    // 3. Render Alchemical Launcher & Trajectory Preview
    const showTrajectory =
      effectiveMode === 'AIMING_PREVIEW' ||
      effectiveMode === 'ENEMY_INTRODUCTION' ||
      effectiveMode === 'THREAT_PREVIEW' ||
      effectiveMode === 'REINFORCEMENT_INTRO' ||
      effectiveMode === 'REINFORCEMENT_ACTIVE' ||
      effectiveMode === 'FINAL_ATTACK_READY' ||
      pres.devPreviewType === 'STANDARD_INTRO' ||
      pres.devPreviewType === 'HEAVY_INTRO';

    const isIntro =
      effectiveMode === 'ENEMY_INTRODUCTION' ||
      pres.devPreviewType === 'STANDARD_INTRO' ||
      pres.devPreviewType === 'HEAVY_INTRO';

    const previewAttack =
      pres.devPreviewType === 'HEAVY_INTRO' || pres.devPreviewType === 'HEAVY_FLIGHT'
        ? AUTHORED_ATTACKS[1]
        : pres.devPreviewType === 'STANDARD_INTRO' || pres.devPreviewType === 'STANDARD_FLIGHT'
          ? AUTHORED_ATTACKS[0]
          : this.siegeController.currentAttack;

    renderLauncher(
      ctx,
      previewAttack,
      showTrajectory,
      isIntro,
      this.timeSec,
      this.siegeController.currentTarget,
      pres.standardAttackerState,
      pres.heavyAttackerState,
      pres.launcherStrain,
      reducedMotion,
      isDeveloperMode,
    );

    // 4. Render Pieces
    if (activeBridge) {
      const simulatedTransforms = activeBridge.getSimulatedTransforms(state.pieces);
      for (const sim of simulatedTransforms) {
        if (sim.condition === 'LOST') continue;
        renderPiece(
          ctx,
          sim.type,
          sim.position,
          sim.rotation,
          sim.isPrebuilt,
          false,
          sim.isFallen,
          1.0,
          sim.condition,
          sim.impactSeverity,
          isDeveloperMode,
        );
      }
    } else {
      for (const piece of state.pieces) {
        if (piece.condition === 'LOST') continue;
        if (this.dragState?.pieceId === piece.id) continue;
        const isSelected = this.selectedPieceId === piece.id;
        renderPiece(
          ctx,
          piece.type,
          piece.position,
          piece.rotation,
          piece.isPrebuilt,
          isSelected,
          false,
          1.0,
          piece.condition || 'INTACT',
          piece.impactSeverity || 0,
          isDeveloperMode,
        );
      }
    }

    // 5. Render Active Projectile (or Developer Flight Preview)
    const activeProj = activeBridge?.getActiveProjectile();
    const isFirstPersonPOV = pres.currentCameraMode === 'PROJECTILE_POV_CAMERA';
    if (activeProj && !isFirstPersonPOV) {
      renderProjectile(
        ctx,
        activeProj.position,
        activeProj.velocity,
        activeProj.radius,
        activeProj.attack,
        this.timeSec,
        pres.standardAttackerState,
        pres.heavyAttackerState,
        reducedMotion,
      );
    } else if (
      pres.devPreviewType === 'STANDARD_FLIGHT' ||
      pres.devPreviewType === 'HEAVY_FLIGHT'
    ) {
      const isHeavyPrev = pres.devPreviewType === 'HEAVY_FLIGHT';
      const atk = isHeavyPrev ? AUTHORED_ATTACKS[1] : AUTHORED_ATTACKS[0];
      const p = 1 - pres.devPreviewTimer / 2.4;
      const demoX = -260 + p * 540;
      const demoY = 580 - Math.sin(p * Math.PI) * (isHeavyPrev ? 140 : 220);
      const demoVy = Math.cos(p * Math.PI) * -220;
      renderProjectile(
        ctx,
        { x: demoX, y: demoY },
        { x: 240, y: demoVy },
        atk.radius,
        atk,
        this.timeSec,
        pres.standardAttackerState,
        pres.heavyAttackerState,
        reducedMotion,
      );
    }

    // 6. Render 5 Elemental Wisps (Hero Ignis + 4 Companion Wisps)
    let lookTarget: Vector2 | undefined = undefined;
    if (activeProj) {
      lookTarget = activeProj.position;
    } else if (showTrajectory && this.siegeController.currentTarget) {
      lookTarget = this.siegeController.currentTarget.position;
    } else if (isIntro || showTrajectory) {
      lookTarget = this.siegeController.currentAttack?.spawnPosition ?? { x: -460, y: 640 };
    } else if (isEditableMode(effectiveMode)) {
      lookTarget = this.dragState?.currentWorldPos || this.getSelectedPiece()?.position;
    }

    renderWisps(
      ctx,
      state.wisps,
      this.timeSec,
      lookTarget,
      pres.wispStates,
      reducedMotion,
    );

    // 7. Render Cosmetic Particles (Impact sparks, dispersal runes, dust)
    this.renderCosmeticParticles(ctx);

    // 8. Render Gizmos in Construction & Reinforcement Mode
    if (isEditableMode(effectiveMode)) {
      renderGizmos(
        ctx,
        this.dragState,
        this.getSelectedPiece(),
        this.touchContactWorldPos,
      );
    }

    ctx.restore();

    // 9. Screen-Space Experimental POV Overlay fallback (if forced via dev override without active povPose)
    if (isFirstPersonPOV && activeProj) {
      renderProjectilePOVOverlay(
        ctx,
        camera.viewWidth,
        camera.viewHeight,
        activeProj.attack,
        activeProj.position,
        activeProj.velocity,
        this.siegeController.currentTarget?.position ?? null,
        this.timeSec,
        reducedMotion,
        isDeveloperMode,
      );
    }
  }

  private renderReplayScene(
    ctx: CanvasRenderingContext2D,
    state: ReturnType<LevelStore['getState']>,
    frame: NonNullable<ReturnType<PresentationDirector['getCurrentReplayFrame']>>,
    reducedMotion: boolean,
    isDeveloperMode: boolean,
  ): void {
    // Render recorded pieces
    for (const p of frame.pieces) {
      if (p.condition === 'LOST') continue;
      renderPiece(
        ctx,
        p.type as PlacedPiece['type'],
        p.position,
        p.rotation,
        p.isPrebuilt,
        false,
        false,
        1.0,
        p.condition,
        p.impactSeverity,
        isDeveloperMode,
      );
    }

    // Render recorded projectile
    if (frame.projectile) {
      const atk =
        frame.projectile.attackerType === 'heavy' ? AUTHORED_ATTACKS[1] : AUTHORED_ATTACKS[0];
      renderProjectile(
        ctx,
        frame.projectile.position,
        frame.projectile.velocity,
        frame.projectile.radius,
        atk,
        this.timeSec,
        this.presentationDirector.standardAttackerState,
        this.presentationDirector.heavyAttackerState,
        reducedMotion,
      );
    }

    // Render wisps from recorded keyframe
    const replayWisps = state.wisps.map((w) => {
      const rw = frame.wisps.find((fw) => fw.id === w.id);
      return rw ? { ...w, isDispersed: rw.isDispersed } : w;
    });
    renderWisps(
      ctx,
      replayWisps,
      this.timeSec,
      frame.projectile?.position ?? undefined,
      this.presentationDirector.wispStates,
      reducedMotion,
    );
  }

  private renderCosmeticParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.presentationDirector.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.position.x, p.position.y);
      if (p.shape === 'shard') {
        ctx.fillRect(-p.radius, -p.radius * 0.6, p.radius * 2, p.radius * 1.2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  public destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.physicsBridge) {
      this.physicsBridge.teardown();
      this.physicsBridge = null;
    }
    this.siegeController.teardown();
  }
}
