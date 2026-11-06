/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Matter from 'matter-js';
import { MATERIAL_CONFIGS, TIMBER_JOINT_PROFILES, WORLD_CONFIG } from '../config';
import { Vec2 } from '../math/geometry';
import { shortestSignedAngleDelta } from '../math/snapSolver';
import { DAMAGE_THRESHOLDS } from '../siege/siegeConfig';
import {
  FLAT_SANCTUARY_TERRAIN,
  TerrainBodyDefinition,
  TerrainProfileDefinition,
} from '../siege/terrainDefinitions';
import {
  AuthoredAttack,
  LevelState,
  MaterialType,
  PieceCondition,
  PlacedPiece,
  StabilityReport,
  TimberJoint,
  Vector2,
  WispContactCategory,
  WispContactEvent,
  WispEntity,
} from '../types';

const { Engine, Bodies, Body, Constraint, Composite, Detector, Events, Sleeping } = Matter;

export interface SimulatedPieceTransform {
  pieceId: string;
  type: MaterialType;
  position: Vector2;
  rotation: number;
  velocity: Vector2;
  isFallen: boolean;
  isPrebuilt: boolean;
  condition: PieceCondition;
  impactSeverity: number;
  bullseyeActive?: boolean;
  bullseyeTriggered?: boolean;
  bullseyeExpired?: boolean;
}

interface FoundationAssistRecord {
  pieceId: string;
  restX: number;
  restAngle: number;
  breakDisplacementPx: number;
  breakAngleRad: number;
  breakImpulseThreshold: number;
  state: 'INTACT' | 'BROKEN';
  failureReason: string | null;
}

export interface DetailedPhysicsDiagnostics {
  logicalPieceCount: number;
  physicsBodyCount: number;
  constraintCount: number;
  activeTimberJointCount: number;
  strainedTimberJointCount: number;
  brokenTimberJointCount: number;
  activeFoundationAssistCount: number;
  brokenFoundationAssistCount: number;
  initialOverlapCount: number;
  maxInitialPenetration: number;
  initialKineticEnergy: number;
  kineticEnergy1s: number | null;
  kineticEnergy3s: number | null;
  awakeBodyCount: number;
  sleepingBodyCount: number;
  activeSimulationLoops: number;
  physicsTimestep: string;
  initialPenetrations: Array<{ pair: string; depth: number }>;
  activeAttackId?: string;
  attacksRemaining?: number;
  activeProjectileCount: number;
  wispsStableCount: number;
  wispsDispersedCount: number;
  piecesIntactCount: number;
  piecesCrackedCount: number;
  piecesBrokenCount: number;
  piecesLostCount: number;
  firstImpactCoordinates: Vector2 | null;
  firstImpactFlightDurationSec: number | null;
  firstImpactTargetLabel: string | null;
  wispContactEvents?: WispContactEvent[];
  lastWispContactEvent?: WispContactEvent | null;
  wispHarmlessContactCount?: number;
  wispDebrisHitCount?: number;
  wispCosmeticOverlapCount?: number;
  terrainProfileId: TerrainProfileDefinition['terrainProfileId'];
  terrainBodyCount: number;
  canonicalBedrockBodyId: string;
}

export interface TerrainPhysicsBodyDiagnostics {
  terrainBodyId: string;
  label: string;
  shapeKind: TerrainBodyDefinition['shape']['kind'];
  position: Vector2;
  widthPx?: number;
  heightPx?: number;
  rotationRad: number;
  isStatic: boolean;
  isSensor: boolean;
  friction: number;
  restitution: number;
  blocksProjectiles: boolean;
  blocksConstruction: boolean;
}

export class PhysicsBridge {
  private engine: Matter.Engine;
  private readonly terrainProfile: TerrainProfileDefinition;
  private readonly terrainPhysicsDiagnostics: TerrainPhysicsBodyDiagnostics[] = [];
  private pieceBodyMap: Map<string, Matter.Body> = new Map();
  private pieceTypeMap: Map<string, MaterialType> = new Map();
  private anchorConstraintMap: Map<string, Matter.Constraint> = new Map();
  private timberJoints: Map<string, TimberJoint> = new Map();
  private timberJointConstraintMap: Map<string, Matter.Constraint> = new Map();
  private foundationAssists: Map<string, FoundationAssistRecord> = new Map();
  private brokenDuringGravityTestCount = 0;
  public lastBrokenTimberJointReason: string | null = null;
  private isRunning = false;
  private settledTimer = 0;
  private simTimeAccumulator = 0;
  private readonly SETTLE_DURATION = 0.8;
  private readonly KINETIC_SETTLE_THRESHOLD = 0.05;
  private readonly QUIET_LINEAR_SPEED_THRESHOLD = 0.35;
  private readonly QUIET_ANGULAR_SPEED_THRESHOLD = 0.025;

  // Phase 2 Attack & Damage Tracking
  private activeProjectileBody: Matter.Body | null = null;
  private activeAttack: AuthoredAttack | null = null;
  private projectileFlightTime = 0;
  private pieceConditions: Map<string, { condition: PieceCondition; impactSeverity: number }> = new Map();
  private initialPieceTransforms: Map<string, { x: number; y: number; rotation: number }> = new Map();
  private dispersedWispIds: Set<string> = new Set();
  private processedContacts: Set<string> = new Set();
  private wispsMap: Map<string, WispEntity> = new Map();
  public wispContactEvents: WispContactEvent[] = [];
  private wispSustainedContactDurations: Map<string, number> = new Map();
  private wispLastRecordedSpeed: Map<string, number> = new Map();
  private cosmeticCheckCounter = 0;

  public diagnostics: DetailedPhysicsDiagnostics;

  constructor(
    levelState: LevelState,
    terrainProfile: TerrainProfileDefinition = FLAT_SANCTUARY_TERRAIN,
  ) {
    this.terrainProfile = terrainProfile;
    this.engine = Engine.create({
      enableSleeping: true,
      positionIterations: 12,
      velocityIterations: 10,
      constraintIterations: 6,
    });

    this.engine.gravity.y = WORLD_CONFIG.gravity;
    this.engine.gravity.scale = 0.001;

    // Initialize piece conditions from level state
    for (const piece of levelState.pieces) {
      this.pieceTypeMap.set(piece.id, piece.type);
      this.initialPieceTransforms.set(piece.id, {
        x: piece.position.x,
        y: piece.position.y,
        rotation: piece.rotation,
      });
      this.pieceConditions.set(piece.id, {
        condition: piece.condition || 'INTACT',
        impactSeverity: piece.impactSeverity || 0,
      });
    }

    // Initialize dispersed wisps from level state
    for (const wisp of levelState.wisps) {
      this.wispsMap.set(wisp.id, wisp);
      if (wisp.isDispersed) {
        this.dispersedWispIds.add(wisp.id);
      }
    }

    this.diagnostics = {
      logicalPieceCount: levelState.pieces.length,
      physicsBodyCount: 0,
      constraintCount: 0,
      activeTimberJointCount: 0,
      strainedTimberJointCount: 0,
      brokenTimberJointCount: 0,
      activeFoundationAssistCount: 0,
      brokenFoundationAssistCount: 0,
      initialOverlapCount: 0,
      maxInitialPenetration: 0,
      initialKineticEnergy: 0,
      kineticEnergy1s: null,
      kineticEnergy3s: null,
      awakeBodyCount: 0,
      sleepingBodyCount: 0,
      activeSimulationLoops: 1,
      physicsTimestep: '16.67ms (60Hz fixed)',
      initialPenetrations: [],
      activeProjectileCount: 0,
      wispsStableCount: levelState.wisps.filter((w) => !w.isDispersed).length,
      wispsDispersedCount: levelState.wisps.filter((w) => w.isDispersed).length,
      piecesIntactCount: levelState.pieces.length,
      piecesCrackedCount: 0,
      piecesBrokenCount: 0,
      piecesLostCount: 0,
      firstImpactCoordinates: null,
      firstImpactFlightDurationSec: null,
      firstImpactTargetLabel: null,
      wispContactEvents: this.wispContactEvents,
      lastWispContactEvent: null,
      wispHarmlessContactCount: 0,
      wispDebrisHitCount: 0,
      wispCosmeticOverlapCount: 0,
      terrainProfileId: this.terrainProfile.terrainProfileId,
      terrainBodyCount: this.terrainProfile.bodies.length,
      canonicalBedrockBodyId:
        this.terrainProfile.bodies.find((body) => body.collisionRole === 'BEDROCK')?.id ?? '',
    };

    this.buildSimulationWorld(levelState);
    this.setupCollisionHandlers();
  }

  private buildSimulationWorld(levelState: LevelState): void {
    const world = this.engine.world;

    // 1. Canonical static terrain. Level 1 currently resolves to the exact legacy bedrock.
    for (const terrainBody of this.terrainProfile.bodies) {
      if (terrainBody.shape.kind !== 'RECTANGLE') {
        throw new Error(
          `Terrain body ${terrainBody.id} uses unsupported runtime shape ${terrainBody.shape.kind}`,
        );
      }
      const label =
        terrainBody.collisionRole === 'BEDROCK'
          ? 'ground_bedrock'
          : `terrain_${terrainBody.id}`;
      const body = Bodies.rectangle(
        terrainBody.position.x,
        terrainBody.position.y,
        terrainBody.shape.widthPx,
        terrainBody.shape.heightPx,
        {
          angle: terrainBody.rotationRad,
          isStatic: true,
          isSensor: false,
          friction: terrainBody.friction,
          restitution: terrainBody.restitution,
          label,
        },
      );
      Composite.add(world, body);
      this.terrainPhysicsDiagnostics.push({
        terrainBodyId: terrainBody.id,
        label,
        shapeKind: terrainBody.shape.kind,
        position: { ...terrainBody.position },
        widthPx: terrainBody.shape.widthPx,
        heightPx: terrainBody.shape.heightPx,
        rotationRad: terrainBody.rotationRad,
        isStatic: true,
        isSensor: false,
        friction: terrainBody.friction,
        restitution: terrainBody.restitution,
        blocksProjectiles: terrainBody.blocksProjectiles,
        blocksConstruction: terrainBody.blocksConstruction,
      });
    }

    // 2. Non-colliding anchor sensor markers
    for (const anchor of levelState.anchors) {
      const anchorBody = Bodies.circle(anchor.position.x, anchor.position.y, anchor.radius, {
        isStatic: true,
        isSensor: true,
        collisionFilter: { group: -1, mask: 0 },
        label: `anchor_${anchor.id}`,
      });
      Composite.add(world, anchorBody);
    }

    // 3. Wisp sensor bodies (only created for committed placed wisps during siege; never during BUILD stability test)
    for (const wisp of levelState.wisps) {
      if (wisp.isDispersed || wisp.placed !== true) continue;
      const wispSensor = Bodies.circle(wisp.position.x, wisp.position.y, wisp.radius, {
        isStatic: true,
        isSensor: true,
        collisionFilter: { group: -2, mask: 0xffffffff },
        label: `wisp_${wisp.id}`,
      });
      Composite.add(world, wispSensor);
    }

    // 4. Create bodies for each placed piece (skip pieces already lost out of world)
    for (const piece of levelState.pieces) {
      if (piece.condition === 'LOST') continue;
      const config = MATERIAL_CONFIGS[piece.type];
      const body = Bodies.rectangle(
        piece.position.x,
        piece.position.y,
        config.width,
        config.height,
        {
          angle: piece.rotation,
          density: config.density,
          friction: config.friction,
          frictionStatic: config.friction * 1.3,
          frictionAir:
            piece.type === 'stone_block' || piece.type === 'bullseye_block' ? 0.015 : 0.02,
          restitution: config.restitution,
          sleepThreshold: 25,
          label: `piece_${piece.id}`,
        },
      );

      // Static-to-dynamic transition: zero initial forces and velocities
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      body.force = { x: 0, y: 0 };
      body.torque = 0;

      this.pieceBodyMap.set(piece.id, body);
      Composite.add(world, body);

      // 5. Anchor attachment constraints (welded to bedrock socket)
      if (piece.attachedAnchorId) {
        const anchor = levelState.anchors.find((a) => a.id === piece.attachedAnchorId);
        if (anchor) {
          const weldConstraint = Constraint.create({
            bodyA: body,
            pointA: { x: 0, y: config.height / 2 },
            pointB: { x: anchor.position.x, y: anchor.position.y },
            stiffness: 1.0,
            damping: 0.1,
            length: 0,
            render: { visible: false },
          });
          this.anchorConstraintMap.set(piece.id, weldConstraint);
          Composite.add(world, weldConstraint);
        }
      }


      this.createFoundationAssistIfEligible(piece, body);
    }

    // 5B. Compliant, Breakable Timber Joint Constraints (1 constraint per active joint)
    const connectedTimberPairs = new Set<string>();
    for (const joint of levelState.joints ?? []) {
      const simJoint: TimberJoint = {
        ...joint,
        localAnchorA: { ...joint.localAnchorA },
        localAnchorB: { ...joint.localAnchorB },
        worldPosition: { ...joint.worldPosition },
        breakPosition: joint.breakPosition ? { ...joint.breakPosition } : undefined,
      };
      this.timberJoints.set(simJoint.jointId, simJoint);

      if (simJoint.state === 'BROKEN') continue;

      const bodyA = this.pieceBodyMap.get(simJoint.pieceAId);
      const bodyB = this.pieceBodyMap.get(simJoint.pieceBId);
      const condA = this.pieceConditions.get(simJoint.pieceAId)?.condition ?? 'INTACT';
      const condB = this.pieceConditions.get(simJoint.pieceBId)?.condition ?? 'INTACT';

      if (
        !bodyA ||
        !bodyB ||
        condA === 'BROKEN' ||
        condA === 'LOST' ||
        condB === 'BROKEN' ||
        condB === 'LOST'
      ) {
        simJoint.state = 'BROKEN';
        simJoint.failureReason = simJoint.failureReason ?? 'CONNECTED_PIECE_BROKEN';
        continue;
      }

      const profile =
        TIMBER_JOINT_PROFILES[simJoint.strengthProfile] ??
        TIMBER_JOINT_PROFILES.standard_timber_joint;
      const worldOffsetA = Vec2.rotate(simJoint.localAnchorA, bodyA.angle);
      const worldOffsetB = Vec2.rotate(simJoint.localAnchorB, bodyB.angle);
      const worldSocketA = Vec2.add(bodyA.position, worldOffsetA);
      const worldSocketB = Vec2.add(bodyB.position, worldOffsetB);
      const actualDist = Vec2.distance(worldSocketA, worldSocketB);
      const posErr = Math.max(0, Math.abs(actualDist - simJoint.restSeparation));
      const actualAngleDiff = bodyB.angle - bodyA.angle;
      const angErr = Math.abs(
        Math.atan2(
          Math.sin(actualAngleDiff - simJoint.restAngle),
          Math.cos(actualAngleDiff - simJoint.restAngle),
        ),
      );
      simJoint.initialPositionalErrorPx = posErr < 1e-4 ? 0 : posErr;
      simJoint.initialAngularErrorRad = angErr < 1e-4 ? 0 : angErr;
      simJoint.initialConstraintEnergy =
        simJoint.initialPositionalErrorPx * profile.linearCompliance +
        simJoint.initialAngularErrorRad * profile.angularCompliance;

      const jointConstraint = Constraint.create({
        bodyA,
        pointA: worldOffsetA,
        bodyB,
        pointB: worldOffsetB,
        length: simJoint.restSeparation,
        stiffness: profile.linearCompliance,
        damping: profile.damping,
        render: { visible: false },
      });

      this.timberJointConstraintMap.set(simJoint.jointId, jointConstraint);
      Composite.add(world, jointConstraint);

      const pairKey =
        bodyA.label < bodyB.label
          ? `${bodyA.label}|${bodyB.label}`
          : `${bodyB.label}|${bodyA.label}`;
      connectedTimberPairs.add(pairKey);
    }

    // 6. Initial Collision Overlap & Penetration Inspection
    const detector = Detector.create({ bodies: Composite.allBodies(world) });
    const collisions = Detector.collisions(detector);

    let maxPen = 0;
    const penetrations: Array<{ pair: string; depth: number }> = [];

    for (const col of collisions) {
      if (col.bodyA.isSensor || col.bodyB.isSensor) continue;
      const pairKey =
        col.bodyA.label < col.bodyB.label
          ? `${col.bodyA.label}|${col.bodyB.label}`
          : `${col.bodyB.label}|${col.bodyA.label}`;
      if (connectedTimberPairs.has(pairKey) && col.depth <= 1.2) continue;

      if (col.depth > 0.5) {
        if (col.depth > maxPen) maxPen = col.depth;
        penetrations.push({
          pair: `${col.bodyA.label} <-> ${col.bodyB.label}`,
          depth: col.depth,
        });
      }
    }

    this.syncTimberJointDiagnosticsCounts();
    this.diagnostics.physicsBodyCount = Composite.allBodies(world).length;
    this.diagnostics.constraintCount = Composite.allConstraints(world).length;
    this.diagnostics.initialOverlapCount = penetrations.length;
    this.diagnostics.maxInitialPenetration = maxPen;
    this.diagnostics.initialPenetrations = penetrations;

    this.isRunning = true;
  }

  private syncTimberJointDiagnosticsCounts(): void {
    let activeCount = 0;
    let strainedCount = 0;
    let brokenCount = 0;
    for (const j of this.timberJoints.values()) {
      if (j.state === 'BROKEN') {
        brokenCount++;
      } else {
        activeCount++;
        if (j.state === 'STRAINED') strainedCount++;
      }
    }
    this.diagnostics.activeTimberJointCount = activeCount;
    this.diagnostics.strainedTimberJointCount = strainedCount;
    this.diagnostics.brokenTimberJointCount = brokenCount;
    this.diagnostics.constraintCount = Composite.allConstraints(this.engine.world).length;
  }

  private hasLowerSupportForRoofRafter(rafterPieceId: string, peakJointId: string): boolean {
    if (this.anchorConstraintMap.has(rafterPieceId)) return true;

    for (const j of this.timberJoints.values()) {
      if (j.jointId === peakJointId || j.state === 'BROKEN') continue;
      if (j.pieceAId === rafterPieceId || j.pieceBId === rafterPieceId) {
        return true;
      }
    }

    const body = this.pieceBodyMap.get(rafterPieceId);
    if (!body) return false;

    const endA = Vec2.add(body.position, Vec2.rotate({ x: -72, y: 0 }, body.angle));
    const endB = Vec2.add(body.position, Vec2.rotate({ x: 72, y: 0 }, body.angle));
    const lowerEnd = endA.y >= endB.y ? endA : endB;

    if (lowerEnd.y >= WORLD_CONFIG.groundY - 22) {
      return true;
    }

    for (const [otherId, otherBody] of this.pieceBodyMap.entries()) {
      if (otherId === rafterPieceId) continue;
      const cond = this.pieceConditions.get(otherId)?.condition ?? 'INTACT';
      if (cond === 'BROKEN' || cond === 'LOST') continue;
      if (otherBody.position.y < lowerEnd.y - 14) continue;
      const dx = Math.abs(otherBody.position.x - lowerEnd.x);
      const dy = Math.abs(otherBody.position.y - lowerEnd.y);
      if (dx <= 60 && dy <= 55 && Math.hypot(otherBody.velocity.x, otherBody.velocity.y) < 3.0) {
        return true;
      }
    }

    return false;
  }

  private createFoundationAssistIfEligible(
    piece: PlacedPiece,
    body: Matter.Body,
  ): void {
    if (
      piece.isPrebuilt ||
      piece.attachedAnchorId ||
      piece.condition === 'BROKEN' ||
      piece.condition === 'LOST' ||
      (piece.type !== 'wood_block' &&
        piece.type !== 'stone_block' &&
        piece.type !== 'bullseye_block')
    ) {
      return;
    }

    const normalizedAngle = Math.atan2(Math.sin(piece.rotation), Math.cos(piece.rotation));
    const cardinalAngleError = Math.min(
      Math.abs(normalizedAngle),
      Math.abs(Math.abs(normalizedAngle) - Math.PI),
    );
    const bottomGap = Math.abs(body.bounds.max.y - WORLD_CONFIG.groundY);
    if (cardinalAngleError > (3 * Math.PI) / 180 || bottomGap > 2.5) {
      return;
    }

    const isStone = piece.type === 'stone_block' || piece.type === 'bullseye_block';
    const thresholds = DAMAGE_THRESHOLDS[piece.type];
    this.foundationAssists.set(piece.id, {
      pieceId: piece.id,
      restX: piece.position.x,
      restAngle: piece.rotation,
      breakDisplacementPx: isStone ? 11 : 8,
      breakAngleRad: isStone ? 0.24 : 0.18,
      breakImpulseThreshold: thresholds.crackImpulse * (isStone ? 0.95 : 0.80),
      state: 'INTACT',
      failureReason: null,
    });
    this.syncFoundationAssistDiagnosticsCounts();
  }

  private breakFoundationAssist(pieceId: string, reason: string): void {
    const assist = this.foundationAssists.get(pieceId);
    if (!assist || assist.state === 'BROKEN') return;
    assist.state = 'BROKEN';
    assist.failureReason = reason;
    const body = this.pieceBodyMap.get(pieceId);
    if (body) Sleeping.set(body, false);
    this.syncFoundationAssistDiagnosticsCounts();
  }

  private syncFoundationAssistDiagnosticsCounts(): void {
    let active = 0;
    let broken = 0;
    for (const assist of this.foundationAssists.values()) {
      if (assist.state === 'BROKEN') broken++;
      else active++;
    }
    this.diagnostics.activeFoundationAssistCount = active;
    this.diagnostics.brokenFoundationAssistCount = broken;
  }

  public getTerrainProfile(): TerrainProfileDefinition {
    return {
      ...this.terrainProfile,
      bodies: this.getResolvedTerrainBodies(),
    };
  }

  public getResolvedTerrainBodies(): TerrainBodyDefinition[] {
    return this.terrainProfile.bodies.map((body) => ({
      ...body,
      position: { ...body.position },
      shape:
        body.shape.kind === 'RECTANGLE'
          ? { ...body.shape }
          : {
              ...body.shape,
              vertices: body.shape.vertices.map((vertex) => ({ ...vertex })),
            },
    }));
  }

  public getTerrainPhysicsDiagnostics(): TerrainPhysicsBodyDiagnostics[] {
    return this.terrainPhysicsDiagnostics.map((entry) => ({
      ...entry,
      position: { ...entry.position },
    }));
  }

  public getFoundationAssistDiagnostics(): Array<{
    pieceId: string;
    state: 'INTACT' | 'BROKEN';
    failureReason: string | null;
  }> {
    return Array.from(this.foundationAssists.values()).map((assist) => ({
      pieceId: assist.pieceId,
      state: assist.state,
      failureReason: assist.failureReason,
    }));
  }

  private breakTimberJoint(jointId: string, reason: string): void {
    const joint = this.timberJoints.get(jointId);
    if (!joint || joint.state === 'BROKEN') return;

    const bodyA = this.pieceBodyMap.get(joint.pieceAId);
    const bodyB = this.pieceBodyMap.get(joint.pieceBId);
    if (bodyA && bodyB) {
      const worldSocketA = Vec2.add(bodyA.position, Vec2.rotate(joint.localAnchorA, bodyA.angle));
      const worldSocketB = Vec2.add(bodyB.position, Vec2.rotate(joint.localAnchorB, bodyB.angle));
      joint.worldPosition = {
        x: (worldSocketA.x + worldSocketB.x) * 0.5,
        y: (worldSocketA.y + worldSocketB.y) * 0.5,
      };
      Sleeping.set(bodyA, false);
      Sleeping.set(bodyB, false);
    }

    joint.state = 'BROKEN';
    joint.failureReason = reason;
    joint.brokenByAttackId = this.activeAttack?.attackId ?? null;
    joint.brokenInPhase = this.activeAttack ? this.activeAttack.attackId : 'STABILITY_TEST';
    joint.breakPosition = { ...joint.worldPosition };
    joint.breakTimestamp = Date.now();
    this.lastBrokenTimberJointReason = reason;

    if (!this.activeAttack && this.diagnostics.firstImpactCoordinates === null) {
      this.brokenDuringGravityTestCount++;
    }

    // Remove the physical constraint from Matter.js exactly once
    const constraint = this.timberJointConstraintMap.get(jointId);
    if (constraint) {
      Composite.remove(this.engine.world, constraint);
      this.timberJointConstraintMap.delete(jointId);
    }

    this.syncTimberJointDiagnosticsCounts();
  }

  private setupCollisionHandlers(): void {
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        this.handleCollisionPair(pair, 'FIRST_CONTACT');
      }
    });

    Events.on(this.engine, 'collisionActive', (event) => {
      for (const pair of event.pairs) {
        this.handleCollisionPair(pair, 'SUSTAINED_CONTACT');
      }
    });

    Events.on(this.engine, 'collisionEnd', (event) => {
      for (const pair of event.pairs) {
        this.handleCollisionEnd(pair);
      }
    });
  }

  private handleCollisionPair(
    pair: Matter.Pair,
    phase: 'FIRST_CONTACT' | 'SUSTAINED_CONTACT',
  ): void {
    const { bodyA, bodyB } = pair;

    // 0. Track first projectile impact
    const isProjA = bodyA.label.startsWith('projectile');
    const isProjB = bodyB.label.startsWith('projectile');
    if (phase === 'FIRST_CONTACT' && (isProjA || isProjB) && this.diagnostics.firstImpactCoordinates === null) {
      const projBody = isProjA ? bodyA : bodyB;
      const otherBody = isProjA ? bodyB : bodyA;
      if (!otherBody.label.startsWith('anchor_')) {
        this.diagnostics.firstImpactCoordinates = {
          x: projBody.position.x,
          y: projBody.position.y,
        };
        this.diagnostics.firstImpactFlightDurationSec = this.projectileFlightTime;
        this.diagnostics.firstImpactTargetLabel = otherBody.label;
      }
    }

    // 1. Authoritative Wisp Contact Evaluation (evaluates both FIRST_CONTACT and SUSTAINED_CONTACT)
    const isWispA = bodyA.label.startsWith('wisp_');
    const isWispB = bodyB.label.startsWith('wisp_');

    if (isWispA || isWispB) {
      this.handleWispContact(pair, phase);
      return;
    }

    // Only run piece-to-piece damage on FIRST_CONTACT to prevent damage accumulation regressions
    if (phase !== 'FIRST_CONTACT') return;

    // Ignore sensor bodies
    if (bodyA.isSensor || bodyB.isSensor) return;

    // Deduplication key per collision pair
    const pairKey = bodyA.id < bodyB.id ? `${bodyA.id}_${bodyB.id}` : `${bodyB.id}_${bodyA.id}`;
    if (this.processedContacts.has(pairKey)) return;
    this.processedContacts.add(pairKey);

    // 2. Piece damage evaluation
    const isPieceA = bodyA.label.startsWith('piece_');
    const isPieceB = bodyB.label.startsWith('piece_');

    if (!isPieceA && !isPieceB) return;

    const relVx = bodyA.velocity.x - bodyB.velocity.x;
    const relVy = bodyA.velocity.y - bodyB.velocity.y;
    const vRel = Math.hypot(relVx, relVy);

    // Preserve authoritative collision location for localized seam shock. Matter may
    // report more than one support point, so use their deterministic centroid.
    let impactPoint: Vector2 | undefined;
    const supports = pair.collision.supports ?? [];
    if (supports.length > 0) {
      let x = 0;
      let y = 0;
      let count = 0;
      for (const support of supports) {
        if (Number.isFinite(support?.x) && Number.isFinite(support?.y)) {
          x += support.x;
          y += support.y;
          count++;
        }
      }
      if (count > 0) impactPoint = { x: x / count, y: y / count };
    }

    if (isPieceA) {
      const pieceIdA = bodyA.label.replace('piece_', '');
      const massB = bodyB.isStatic ? Infinity : bodyB.mass;
      const reducedMass = (bodyA.mass * massB) / (bodyA.mass + massB);
      const restitution = Math.max(bodyA.restitution, bodyB.restitution);
      const impulse = reducedMass * vRel * (1 + restitution);
      this.applyPieceDamage(pieceIdA, impulse, impactPoint);
    }

    if (isPieceB) {
      const pieceIdB = bodyB.label.replace('piece_', '');
      const massA = bodyA.isStatic ? Infinity : bodyA.mass;
      const reducedMass = (bodyB.mass * massA) / (bodyB.mass + massA);
      const restitution = Math.max(bodyA.restitution, bodyB.restitution);
      const impulse = reducedMass * vRel * (1 + restitution);
      this.applyPieceDamage(pieceIdB, impulse, impactPoint);
    }
  }

  private handleWispContact(
    pair: Matter.Pair,
    phase: 'FIRST_CONTACT' | 'SUSTAINED_CONTACT',
  ): void {
    const { bodyA, bodyB } = pair;
    const isWispA = bodyA.label.startsWith('wisp_');
    const isWispB = bodyB.label.startsWith('wisp_');
    if (!isWispA && !isWispB) return;

    const wispBody = isWispA ? bodyA : bodyB;
    const colliderBody = isWispA ? bodyB : bodyA;
    const wispId = wispBody.label.replace('wisp_', '');
    const wispMeta = this.wispsMap.get(wispId);
    const wispRadius = wispMeta?.radius ?? 18;

    const isProjectile = colliderBody.label.startsWith('projectile');
    const isPiece = colliderBody.label.startsWith('piece_');

    const contactingObjectId = isPiece
      ? colliderBody.label.replace('piece_', '')
      : colliderBody.label;
    const contactingObjectType: 'piece' | 'projectile' | 'terrain' = isPiece
      ? 'piece'
      : isProjectile
        ? 'projectile'
        : 'terrain';

    const material: MaterialType | 'projectile' | 'bedrock' = isPiece
      ? this.pieceTypeMap.get(contactingObjectId) || 'wood_block'
      : isProjectile
        ? 'projectile'
        : 'bedrock';

    const conditionData = isPiece ? this.pieceConditions.get(contactingObjectId) : null;
    const condition: PieceCondition | 'N/A' = conditionData ? conditionData.condition : 'N/A';
    const severity = conditionData ? conditionData.impactSeverity : 0;
    const mass = colliderBody.mass || 1.0;

    // Contact geometry
    let contactPoint: Vector2 = { x: wispBody.position.x, y: wispBody.position.y };
    let hasValidSupport = false;
    if (pair.collision.supports && pair.collision.supports.length > 0) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const s of pair.collision.supports) {
        if (s && typeof s.x === 'number' && typeof s.y === 'number') {
          sumX += s.x;
          sumY += s.y;
          count++;
        }
      }
      if (count > 0) {
        contactPoint = {
          x: sumX / count,
          y: sumY / count,
        };
        hasValidSupport = true;
      }
    }
    if (!hasValidSupport) {
      const dx = wispBody.position.x - colliderBody.position.x;
      const dy = wispBody.position.y - colliderBody.position.y;
      const d = Math.hypot(dx, dy) || 1;
      contactPoint = {
        x: wispBody.position.x - (dx / d) * wispRadius,
        y: wispBody.position.y - (dy / d) * wispRadius,
      };
    }

    let contactNormal: Vector2 = { x: 0, y: -1 };
    if (pair.collision.normal && (pair.collision.normal.x !== 0 || pair.collision.normal.y !== 0)) {
      const mult = isWispA ? -1 : 1;
      contactNormal = {
        x: pair.collision.normal.x * mult,
        y: pair.collision.normal.y * mult,
      };
    } else {
      const dx = wispBody.position.x - colliderBody.position.x;
      const dy = wispBody.position.y - colliderBody.position.y;
      const d = Math.hypot(dx, dy) || 1;
      contactNormal = { x: dx / d, y: dy / d };
    }

    // Kinematics: Linear + Angular velocity at contact point
    const vLinX = colliderBody.velocity.x - (wispBody.velocity ? wispBody.velocity.x : 0);
    const vLinY = colliderBody.velocity.y - (wispBody.velocity ? wispBody.velocity.y : 0);
    const relativeLinearSpeed = Math.hypot(vLinX, vLinY);

    const rX = contactPoint.x - colliderBody.position.x;
    const rY = contactPoint.y - colliderBody.position.y;
    const omega = colliderBody.angularVelocity || 0;
    const vAngX = -omega * rY;
    const vAngY = omega * rX;
    const relativeAngularSpeedAtContact = Math.hypot(vAngX, vAngY);

    const vTotalX = vLinX + vAngX;
    const vTotalY = vLinY + vAngY;
    const totalContactSpeed = Math.hypot(vTotalX, vTotalY);

    const vNormal = vTotalX * contactNormal.x + vTotalY * contactNormal.y;
    const normalImpulse = mass * Math.abs(vNormal);
    const vTangentX = vTotalX - vNormal * contactNormal.x;
    const vTangentY = vTotalY - vNormal * contactNormal.y;
    const tangentialImpulse = mass * Math.hypot(vTangentX, vTangentY);
    const impulse = mass * totalContactSpeed;

    const directThreshold = 1.0;
    const debrisImpulseThreshold = DAMAGE_THRESHOLDS.wisp.minImpactImpulse; // 3.5
    const minVelocityThreshold = DAMAGE_THRESHOLDS.wisp.minVelocity; // 1.5

    // Track sustained contact duration for pinned / crushing detection
    const contactKey = `${contactingObjectId}_${wispId}`;
    const dtSec = 0.01667;
    const prevDuration = this.wispSustainedContactDurations.get(contactKey) ?? 0;
    const newDuration = phase === 'SUSTAINED_CONTACT' ? prevDuration + dtSec : 0;
    this.wispSustainedContactDurations.set(contactKey, newDuration);

    const alreadyDispersed = this.dispersedWispIds.has(wispId);

    let dispersalRequested = false;
    let dispersalCommitted = false;
    let category: WispContactCategory = 'HARMLESS_TOUCH';
    let notDispersedReason: string | null = null;
    let isDeduplicated = false;
    let deduplicationReason: string | null = null;

    if (alreadyDispersed) {
      isDeduplicated = true;
      deduplicationReason = 'Wisp already dispersed by earlier contact';
      dispersalRequested = false;
      dispersalCommitted = false;
      notDispersedReason = 'Wisp already dispersed';
      category = 'DUPLICATE_EVENT';
    } else if (isProjectile) {
      dispersalRequested = true;
      dispersalCommitted = true;
      this.dispersedWispIds.add(wispId);
      category = 'MEANINGFUL_DEBRIS_HIT';
    } else if (isPiece) {
      const isSevereHit = totalContactSpeed > minVelocityThreshold && impulse > debrisImpulseThreshold;
      const isOverhead = colliderBody.position.y < wispBody.position.y;
      const isPinned = isOverhead && mass >= 10.0 && newDuration >= 1.0;

      if (isSevereHit) {
        dispersalRequested = true;
        dispersalCommitted = true;
        this.dispersedWispIds.add(wispId);
        category = mass >= 8.0 ? 'HEAVY_DEBRIS_HIT' : 'MEANINGFUL_DEBRIS_HIT';
      } else if (isPinned) {
        dispersalRequested = true;
        dispersalCommitted = true;
        this.dispersedWispIds.add(wispId);
        category = 'PINNED_OR_CRUSHED';
      } else {
        dispersalRequested = false;
        dispersalCommitted = false;
        category = 'HARMLESS_TOUCH';
        if (totalContactSpeed <= minVelocityThreshold) {
          notDispersedReason = `Contact speed (${totalContactSpeed.toFixed(2)} px/tick) <= threshold (${minVelocityThreshold.toFixed(2)})`;
        } else {
          notDispersedReason = `Impulse (${impulse.toFixed(2)}) <= threshold (${debrisImpulseThreshold.toFixed(2)})`;
        }
      }
    } else {
      category = 'HARMLESS_TOUCH';
      notDispersedReason = 'Static terrain contact';
    }

    // Deduplication of sustained harmless spamming:
    // If it's a SUSTAINED_CONTACT of HARMLESS_TOUCH and speed hasn't changed by >= 0.4 px/tick,
    // skip flooding the array, but if it commits dispersal or speed jumped, ALWAYS record it!
    const lastLoggedSpeed = this.wispLastRecordedSpeed.get(contactKey) ?? -1;
    const speedDelta = Math.abs(totalContactSpeed - lastLoggedSpeed);
    const isFirstDuplicate = alreadyDispersed && !this.wispLastRecordedSpeed.has(`dup_${contactKey}`);

    const shouldRecordEvent =
      phase === 'FIRST_CONTACT' ||
      dispersalCommitted ||
      category === 'PINNED_OR_CRUSHED' ||
      speedDelta >= 0.4 ||
      isFirstDuplicate ||
      this.wispContactEvents.length < 5;

    if (shouldRecordEvent) {
      this.wispLastRecordedSpeed.set(contactKey, totalContactSpeed);
      if (isFirstDuplicate) {
        this.wispLastRecordedSpeed.set(`dup_${contactKey}`, 1);
      }

      const event: WispContactEvent = {
        id: `contact_${this.activeAttack?.attackId ?? 'att'}_${wispId}_${contactingObjectId}_${Math.round(this.simTimeAccumulator * 1000)}_${this.wispContactEvents.length}`,
        attackId: this.activeAttack?.attackId ?? 'attack_1',
        simTimestamp: Number(this.simTimeAccumulator.toFixed(3)),
        wispId,
        contactingObjectId,
        contactingObjectType,
        contactingObjectMaterial: material,
        contactingObjectCondition: condition,
        contactingObjectMass: Number(mass.toFixed(2)),
        wispColliderBounds: {
          centerX: Number(wispBody.position.x.toFixed(1)),
          centerY: Number(wispBody.position.y.toFixed(1)),
          radius: wispRadius,
        },
        objectColliderBounds: {
          minX: Number(colliderBody.bounds.min.x.toFixed(1)),
          maxX: Number(colliderBody.bounds.max.x.toFixed(1)),
          minY: Number(colliderBody.bounds.min.y.toFixed(1)),
          maxY: Number(colliderBody.bounds.max.y.toFixed(1)),
          angle: Number(colliderBody.angle.toFixed(3)),
        },
        contactPoint: {
          x: Number(contactPoint.x.toFixed(1)),
          y: Number(contactPoint.y.toFixed(1)),
        },
        contactNormal: {
          x: Number(contactNormal.x.toFixed(3)),
          y: Number(contactNormal.y.toFixed(3)),
        },
        relativeLinearSpeed: Number(relativeLinearSpeed.toFixed(2)),
        relativeAngularSpeedAtContact: Number(relativeAngularSpeedAtContact.toFixed(2)),
        totalContactSpeed: Number(totalContactSpeed.toFixed(2)),
        normalImpulse: Number(normalImpulse.toFixed(2)),
        tangentialImpulse: Number(tangentialImpulse.toFixed(2)),
        existingImpactSeverity: severity,
        wispDirectImpactThreshold: directThreshold,
        wispDebrisImpactThreshold: debrisImpulseThreshold,
        isAwake: !colliderBody.isSleeping,
        contactPhase: phase,
        isDeduplicated,
        deduplicationReason,
        dispersalRequested,
        dispersalCommitted,
        notDispersedReason,
        category,
        pinnedDurationSec: Number(newDuration.toFixed(2)),
      };

      this.wispContactEvents.push(event);
      this.diagnostics.lastWispContactEvent = event;
    }
  }

  private handleCollisionEnd(pair: Matter.Pair): void {
    const { bodyA, bodyB } = pair;
    const isWispA = bodyA.label.startsWith('wisp_');
    const isWispB = bodyB.label.startsWith('wisp_');
    if (!isWispA && !isWispB) return;

    const colliderBody = isWispA ? bodyB : bodyA;
    const wispBody = isWispA ? bodyA : bodyB;
    const wispId = wispBody.label.replace('wisp_', '');
    const contactingObjectId = colliderBody.label.startsWith('piece_')
      ? colliderBody.label.replace('piece_', '')
      : colliderBody.label;
    const contactKey = `${contactingObjectId}_${wispId}`;
    this.wispSustainedContactDurations.delete(contactKey);
    this.wispLastRecordedSpeed.delete(contactKey);
  }

  public recordCosmeticVisualOverlaps(): void {
    for (const [wispId, wisp] of this.wispsMap.entries()) {
      if (this.dispersedWispIds.has(wispId)) continue;
      const cosmeticRadius = wisp.radius * 2.65; // ~47.7px visual glow aura
      const colliderRadius = wisp.radius; // 18px

      for (const [pieceId, body] of this.pieceBodyMap.entries()) {
        const dx = body.position.x - wisp.position.x;
        const dy = body.position.y - wisp.position.y;
        const distToCenter = Math.hypot(dx, dy);

        const cfg = MATERIAL_CONFIGS[this.pieceTypeMap.get(pieceId) || 'wood_block'];
        const halfDiag = Math.hypot(cfg.width, cfg.height) / 2;
        const minDist = distToCenter - halfDiag;

        const contactKey = `${pieceId}_${wispId}`;
        const isPhysicallyTouching = (this.wispSustainedContactDurations.get(contactKey) ?? 0) > 0;

        if (!isPhysicallyTouching && minDist < cosmeticRadius && minDist > colliderRadius) {
          const cosmeticKey = `cosmetic_${pieceId}_${wispId}`;
          if (!this.wispLastRecordedSpeed.has(cosmeticKey)) {
            this.wispLastRecordedSpeed.set(cosmeticKey, 1);
            const event: WispContactEvent = {
              id: `cosmetic_${wispId}_${pieceId}_${Math.round(this.simTimeAccumulator * 1000)}`,
              attackId: this.activeAttack?.attackId ?? 'attack_1',
              simTimestamp: Number(this.simTimeAccumulator.toFixed(3)),
              wispId,
              contactingObjectId: pieceId,
              contactingObjectType: 'piece',
              contactingObjectMaterial: this.pieceTypeMap.get(pieceId) || 'wood_block',
              contactingObjectCondition: this.pieceConditions.get(pieceId)?.condition || 'INTACT',
              contactingObjectMass: Number(body.mass.toFixed(2)),
              wispColliderBounds: {
                centerX: Number(wisp.position.x.toFixed(1)),
                centerY: Number(wisp.position.y.toFixed(1)),
                radius: colliderRadius,
              },
              objectColliderBounds: {
                minX: Number(body.bounds.min.x.toFixed(1)),
                maxX: Number(body.bounds.max.x.toFixed(1)),
                minY: Number(body.bounds.min.y.toFixed(1)),
                maxY: Number(body.bounds.max.y.toFixed(1)),
                angle: Number(body.angle.toFixed(3)),
              },
              contactPoint: { x: Number(body.position.x.toFixed(1)), y: Number(body.position.y.toFixed(1)) },
              contactNormal: { x: Number((dx / (distToCenter || 1)).toFixed(3)), y: Number((dy / (distToCenter || 1)).toFixed(3)) },
              relativeLinearSpeed: Number(Math.hypot(body.velocity.x, body.velocity.y).toFixed(2)),
              relativeAngularSpeedAtContact: 0,
              totalContactSpeed: Number(Math.hypot(body.velocity.x, body.velocity.y).toFixed(2)),
              normalImpulse: 0,
              tangentialImpulse: 0,
              existingImpactSeverity: this.pieceConditions.get(pieceId)?.impactSeverity || 0,
              wispDirectImpactThreshold: 1.0,
              wispDebrisImpactThreshold: DAMAGE_THRESHOLDS.wisp.minImpactImpulse,
              isAwake: !body.isSleeping,
              contactPhase: 'FIRST_CONTACT',
              isDeduplicated: false,
              deduplicationReason: null,
              dispersalRequested: false,
              dispersalCommitted: false,
              notDispersedReason: 'Cosmetic visual aura overlap only; does not intersect authoritative 18px physical collider',
              category: 'COSMETIC_ONLY',
            };
            this.wispContactEvents.push(event);
            this.diagnostics.lastWispContactEvent = event;
          }
        }
      }
    }
  }

  public getWispContactEvents(): WispContactEvent[] {
    return [...this.wispContactEvents];
  }

  private applyPieceDamage(pieceId: string, impulse: number, impactPoint?: Vector2): void {
    const current = this.pieceConditions.get(pieceId) || { condition: 'INTACT', impactSeverity: 0 };
    if (current.condition === 'LOST') return;

    const type = this.pieceTypeMap.get(pieceId) || 'wood_block';
    const thresholds = DAMAGE_THRESHOLDS[type];

    let newCondition = current.condition;
    if (impulse >= thresholds.breakImpulse) {
      newCondition = 'BROKEN';
    } else if (impulse >= thresholds.crackImpulse) {
      newCondition = current.condition === 'CRACKED' ? 'BROKEN' : 'CRACKED';
    }

    const severity = Math.max(current.impactSeverity, Math.min(1.0, impulse / thresholds.breakImpulse));
    this.pieceConditions.set(pieceId, { condition: newCondition, impactSeverity: severity });

    const foundationAssist = this.foundationAssists.get(pieceId);
    if (foundationAssist?.state === 'INTACT') {
      if (newCondition === 'BROKEN') {
        this.breakFoundationAssist(pieceId, 'CONNECTED_PIECE_BROKEN');
      } else if (impulse >= foundationAssist.breakImpulseThreshold) {
        this.breakFoundationAssist(pieceId, 'DIRECT_IMPACT_IMPULSE');
      }
    }

    // Propagate impact shock to any active TimberJoint connected to this piece.
    // When collision location is available, preserve full shock at the nearest seam and
    // attenuate only the additional distance to farther seams. A single seam, centered
    // impact, or missing location therefore retains legacy full-strength behavior.
    const connectedJoints = [...this.timberJoints.entries()].filter(
      ([, joint]) =>
        joint.state !== 'BROKEN' &&
        (joint.pieceAId === pieceId || joint.pieceBId === pieceId),
    );
    const distanceByJointId = new Map<string, number>();
    let nearestDistance = Number.POSITIVE_INFINITY;
    if (impactPoint) {
      for (const [jointId, joint] of connectedJoints) {
        const distance = Vec2.distance(impactPoint, joint.worldPosition);
        distanceByJointId.set(jointId, distance);
        nearestDistance = Math.min(nearestDistance, distance);
      }
    }

    // Two construction units keep nearby seams strongly coupled while allowing a
    // meaningfully distant support to remain independent. This changes propagation only,
    // not the existing material or joint strength profiles.
    const IMPACT_SHOCK_FALLOFF_PX = 96;
    for (const [jointId, joint] of connectedJoints) {
      const distance = distanceByJointId.get(jointId);
      const extraDistance =
        distance !== undefined && Number.isFinite(nearestDistance)
          ? Math.max(0, distance - nearestDistance)
          : 0;
      const shockWeight = 1 / (1 + extraDistance / IMPACT_SHOCK_FALLOFF_PX);
      const jointImpulse = impulse * shockWeight;

      const profile =
        TIMBER_JOINT_PROFILES[joint.strengthProfile] ??
        TIMBER_JOINT_PROFILES.standard_timber_joint;
      if (newCondition === 'BROKEN') {
        this.breakTimberJoint(jointId, 'CONNECTED_PIECE_BROKEN');
      } else if (jointImpulse >= profile.breakImpulseThreshold) {
        this.breakTimberJoint(jointId, 'DIRECT_IMPACT_IMPULSE');
      } else if (jointImpulse >= profile.breakImpulseThreshold * 0.42) {
        const shockStress = (jointImpulse / profile.breakImpulseThreshold) * 11.5;
        joint.currentStress += shockStress;
        joint.maxStressObserved = Math.max(joint.maxStressObserved, joint.currentStress);
        if (joint.currentStress >= profile.accumulatedStressThreshold) {
          this.breakTimberJoint(jointId, 'IMPACT_SHOCK_OVERLOAD');
        } else if (
          joint.currentStress >=
          profile.accumulatedStressThreshold * profile.strainedStressRatio
        ) {
          joint.state = 'STRAINED';
          this.syncTimberJointDiagnosticsCounts();
        }
      }
    }
  }

  /**
   * Spawns an authored enemy projectile into the simulation
   */
  public spawnProjectile(attack: AuthoredAttack): Matter.Body {
    this.removeProjectile();

    this.activeAttack = attack;
    this.projectileFlightTime = 0;
    this.processedContacts.clear(); // Clear deduplication cache for new attack
    this.diagnostics.firstImpactCoordinates = null;
    this.diagnostics.firstImpactFlightDurationSec = null;
    this.diagnostics.firstImpactTargetLabel = null;

    const density = attack.mass / (Math.PI * attack.radius * attack.radius);
    const proj = Bodies.circle(attack.spawnPosition.x, attack.spawnPosition.y, attack.radius, {
      density,
      restitution: attack.restitution,
      friction: attack.friction,
      frictionAir: 0.001,
      label: `projectile_${attack.attackId}`,
    });

    Body.setVelocity(proj, { x: attack.launchVelocity.x, y: attack.launchVelocity.y });
    this.activeProjectileBody = proj;
    Composite.add(this.engine.world, proj);

    return proj;
  }

  /**
   * Safely removes the active projectile body from the physics world
   */
  public removeProjectile(): void {
    if (this.activeProjectileBody) {
      Composite.remove(this.engine.world, this.activeProjectileBody);
      this.activeProjectileBody = null;
    }
  }

  /**
   * Returns current state of the active projectile, if any
   */
  public getActiveProjectile(): {
    position: Vector2;
    velocity: Vector2;
    rotation: number;
    radius: number;
    flightTime: number;
    attack: AuthoredAttack;
  } | null {
    if (!this.activeProjectileBody || !this.activeAttack) return null;
    return {
      position: { x: this.activeProjectileBody.position.x, y: this.activeProjectileBody.position.y },
      velocity: { x: this.activeProjectileBody.velocity.x, y: this.activeProjectileBody.velocity.y },
      rotation: this.activeProjectileBody.angle,
      radius: this.activeAttack.radius,
      flightTime: this.projectileFlightTime,
      attack: this.activeAttack,
    };
  }

  public getProjectileFlightTime(): number {
    return this.projectileFlightTime;
  }

  public getPieceCondition(pieceId: string): PieceCondition {
    return this.pieceConditions.get(pieceId)?.condition ?? 'INTACT';
  }

  public getDispersedWisps(): Set<string> {
    return new Set(this.dispersedWispIds);
  }

  public getSimulatedJoints(): TimberJoint[] {
    return Array.from(this.timberJoints.values()).map((j) => ({
      ...j,
      localAnchorA: { ...j.localAnchorA },
      localAnchorB: { ...j.localAnchorB },
      worldPosition: { ...j.worldPosition },
      breakPosition: j.breakPosition ? { ...j.breakPosition } : undefined,
    }));
  }

  /**
   * Advances the physical simulation with a fixed, deterministic 60Hz step (16.666ms)
   */
  public step(dtMs: number): void {
    if (!this.isRunning) return;

    const fixedStep = 1000 / 60;

    // Foundation assistance preserves ordinary grounded construction without adding
    // constraints that compete with the bedrock collision. Vertical motion remains fully
    // physical; only small horizontal and angular drift are filtered while the assist is intact.
    for (const assist of this.foundationAssists.values()) {
      if (assist.state === 'BROKEN') continue;
      const body = this.pieceBodyMap.get(assist.pieceId);
      if (!body) {
        this.breakFoundationAssist(assist.pieceId, 'CONNECTED_PIECE_MISSING');
        continue;
      }

      const horizontalError = body.position.x - assist.restX;
      const angleError = shortestSignedAngleDelta(assist.restAngle, body.angle);
      if (Math.abs(horizontalError) > assist.breakDisplacementPx) {
        this.breakFoundationAssist(assist.pieceId, 'FOUNDATION_DISPLACEMENT_EXCEEDED');
        continue;
      }
      if (Math.abs(angleError) > assist.breakAngleRad) {
        this.breakFoundationAssist(assist.pieceId, 'FOUNDATION_ROTATION_EXCEEDED');
        continue;
      }

      Body.setPosition(body, { x: assist.restX, y: body.position.y });
      Body.setAngle(body, assist.restAngle);
      Body.setVelocity(body, { x: 0, y: body.velocity.y });
      Body.setAngularVelocity(body, 0);
    }

    // 1. Pre-step: update rotated local anchor offsets & apply compliant angular spring-damper on active timber joints
    for (const [jointId, joint] of this.timberJoints.entries()) {
      if (joint.state === 'BROKEN') continue;
      const constraint = this.timberJointConstraintMap.get(jointId);
      const bodyA = this.pieceBodyMap.get(joint.pieceAId);
      const bodyB = this.pieceBodyMap.get(joint.pieceBId);
      if (!constraint || !bodyA || !bodyB) {
        this.breakTimberJoint(jointId, 'CONNECTED_PIECE_MISSING');
        continue;
      }

      constraint.pointA = Vec2.rotate(joint.localAnchorA, bodyA.angle);
      constraint.pointB = Vec2.rotate(joint.localAnchorB, bodyB.angle);

      const profile =
        TIMBER_JOINT_PROFILES[joint.strengthProfile] ??
        TIMBER_JOINT_PROFILES.standard_timber_joint;
      const isRoofPeak =
        joint.jointType === 'ROOF_PEAK' || joint.strengthProfile === 'ROOF_PEAK';
      const hasBothLowerSupports = isRoofPeak
        ? this.hasLowerSupportForRoofRafter(joint.pieceAId, jointId) &&
          this.hasLowerSupportForRoofRafter(joint.pieceBId, jointId)
        : true;
      if (isRoofPeak) {
        joint.lowerSupportsDetected = hasBothLowerSupports;
      }

      const effectiveAngularCompliance =
        isRoofPeak && !hasBothLowerSupports
          ? profile.angularCompliance * 0.18
          : profile.angularCompliance;
      const effectiveTorqueLimit =
        isRoofPeak && !hasBothLowerSupports
          ? profile.torqueLimit * 0.22
          : profile.torqueLimit;

      const angleDiff = shortestSignedAngleDelta(bodyA.angle, bodyB.angle);
      const angErr = shortestSignedAngleDelta(joint.restAngle, angleDiff);
      const relAngVel = bodyB.angularVelocity - bodyA.angularVelocity;
      const rawDeltaOmega = angErr * effectiveAngularCompliance - relAngVel * profile.damping;
      const clampedDeltaOmega = Math.max(
        -effectiveTorqueLimit,
        Math.min(effectiveTorqueLimit, rawDeltaOmega),
      );
      const invIA = Number.isFinite(bodyA.inertia) && bodyA.inertia > 0 ? 1 / bodyA.inertia : 0;
      const invIB = Number.isFinite(bodyB.inertia) && bodyB.inertia > 0 ? 1 / bodyB.inertia : 0;

      if (
        invIA + invIB > 0 &&
        (Math.abs(clampedDeltaOmega) > 0.00015 || !bodyA.isSleeping || !bodyB.isSleeping)
      ) {
        if (Math.abs(angErr) > 0.015) {
          Sleeping.set(bodyA, false);
          Sleeping.set(bodyB, false);
        }
        const iEff = 1 / (invIA + invIB);
        const angImpulse = clampedDeltaOmega * iEff;
        Body.setAngularVelocity(bodyA, bodyA.angularVelocity + angImpulse * invIA);
        Body.setAngularVelocity(bodyB, bodyB.angularVelocity - angImpulse * invIB);
      }
    }

    // 2. Step Matter.js physics engine
    Engine.update(this.engine, fixedStep);

    this.simTimeAccumulator += fixedStep / 1000;

    // 3. Post-step: evaluate timber joint stretch, bending angle, strain, and fracture
    for (const [jointId, joint] of this.timberJoints.entries()) {
      if (joint.state === 'BROKEN') continue;
      const bodyA = this.pieceBodyMap.get(joint.pieceAId);
      const bodyB = this.pieceBodyMap.get(joint.pieceBId);
      const condA = this.pieceConditions.get(joint.pieceAId)?.condition ?? 'INTACT';
      const condB = this.pieceConditions.get(joint.pieceBId)?.condition ?? 'INTACT';

      if (
        !bodyA ||
        !bodyB ||
        condA === 'BROKEN' ||
        condA === 'LOST' ||
        condB === 'BROKEN' ||
        condB === 'LOST'
      ) {
        this.breakTimberJoint(jointId, 'CONNECTED_PIECE_BROKEN');
        continue;
      }

      const profile =
        TIMBER_JOINT_PROFILES[joint.strengthProfile] ??
        TIMBER_JOINT_PROFILES.standard_timber_joint;
      const worldSocketA = Vec2.add(bodyA.position, Vec2.rotate(joint.localAnchorA, bodyA.angle));
      const worldSocketB = Vec2.add(bodyB.position, Vec2.rotate(joint.localAnchorB, bodyB.angle));
      joint.worldPosition = {
        x: (worldSocketA.x + worldSocketB.x) * 0.5,
        y: (worldSocketA.y + worldSocketB.y) * 0.5,
      };

      const currentDist = Vec2.distance(worldSocketA, worldSocketB);
      const stretch = Math.max(0, currentDist - joint.restSeparation);
      const angleDiff = shortestSignedAngleDelta(bodyA.angle, bodyB.angle);
      const absAngErr = Math.abs(shortestSignedAngleDelta(joint.restAngle, angleDiff));

      if (stretch > profile.tensileStrength) {
        this.breakTimberJoint(jointId, 'TENSILE_STRETCH_EXCEEDED');
        continue;
      }
      if (absAngErr > profile.bendingStrength) {
        this.breakTimberJoint(jointId, 'BENDING_ANGLE_EXCEEDED');
        continue;
      }

      const isRoofPeak =
        joint.jointType === 'ROOF_PEAK' || joint.strengthProfile === 'ROOF_PEAK';
      const hasBothLowerSupports = isRoofPeak
        ? Boolean(joint.lowerSupportsDetected)
        : true;

      // Continuous overload stress accumulation (cantilever / heavy stone load / sag / roof spreading)
      const loadRatio = Math.max(stretch / 3.0, absAngErr / 0.13);
      if (isRoofPeak && !hasBothLowerSupports && (absAngErr > 0.035 || stretch > 0.35)) {
        joint.currentStress += absAngErr * 4.5 + stretch * 0.65;
      } else if (loadRatio > 0.35) {
        const rateMult = isRoofPeak && hasBothLowerSupports ? 0.55 : 1.0;
        joint.currentStress += (loadRatio - 0.30) * 0.45 * rateMult;
      } else {
        joint.currentStress = Math.max(0, joint.currentStress - 0.12);
      }
      joint.maxStressObserved = Math.max(joint.maxStressObserved, joint.currentStress);

      if (joint.currentStress >= profile.accumulatedStressThreshold) {
        this.breakTimberJoint(
          jointId,
          isRoofPeak && !hasBothLowerSupports
            ? 'ROOF_PEAK_UNSUPPORTED_SPREAD'
            : 'OVERLOAD_BENDING_SHEAR',
        );
        continue;
      }

      if (
        joint.currentStress >= profile.accumulatedStressThreshold * profile.strainedStressRatio ||
        absAngErr >= profile.bendingStrength * 0.35 ||
        stretch >= 1.5
      ) {
        joint.state = 'STRAINED';
      } else if (
        joint.currentStress < profile.accumulatedStressThreshold * profile.strainedStressRatio * 0.75 &&
        absAngErr < profile.bendingStrength * 0.25 &&
        stretch < 1.0
      ) {
        joint.state = 'INTACT';
      }
    }
    this.syncTimberJointDiagnosticsCounts();

    // Projectile flight duration & loss boundary check
    if (this.activeProjectileBody) {
      this.projectileFlightTime += fixedStep / 1000;
      if (
        this.activeProjectileBody.position.y > WORLD_CONFIG.lossBoundaryY ||
        (this.activeAttack && this.projectileFlightTime > this.activeAttack.maxFlightDurationSec)
      ) {
        this.removeProjectile();
      }
    }

    // Pieces loss boundary check
    for (const [pieceId, body] of this.pieceBodyMap.entries()) {
      if (body.position.y > WORLD_CONFIG.lossBoundaryY) {
        const curr = this.pieceConditions.get(pieceId) || { condition: 'INTACT', impactSeverity: 0 };
        this.pieceConditions.set(pieceId, { condition: 'LOST', impactSeverity: curr.impactSeverity });
      }
    }

    // Record kinetic energy milestones
    const currentKE = this.calculateTotalKineticEnergy();
    if (this.simTimeAccumulator >= 1.0 && this.diagnostics.kineticEnergy1s === null) {
      this.diagnostics.kineticEnergy1s = currentKE;
    }
    if (this.simTimeAccumulator >= 3.0 && this.diagnostics.kineticEnergy3s === null) {
      this.diagnostics.kineticEnergy3s = currentKE;
    }

    // Periodic cosmetic visual overlap detection (distinguishes aura overlap from collider contact)
    this.cosmeticCheckCounter++;
    if (this.cosmeticCheckCounter % 6 === 0) {
      this.recordCosmeticVisualOverlaps();
    }
  }

  private calculateTotalKineticEnergy(): number {
    let ke = 0;
    for (const body of this.pieceBodyMap.values()) {
      const speedSq = body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y;
      const rotSpeed = Math.abs(body.angularVelocity);
      ke += 0.5 * body.mass * speedSq + 0.5 * body.inertia * (rotSpeed * rotSpeed);
    }
    if (this.activeProjectileBody) {
      const p = this.activeProjectileBody;
      const pSpeedSq = p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y;
      ke += 0.5 * p.mass * pSpeedSq;
    }
    return ke;
  }

  /**
   * Retrieves the live physical transforms of all pieces
   */
  public getSimulatedTransforms(pieces: PlacedPiece[]): SimulatedPieceTransform[] {
    return pieces.map((piece) => {
      const body = this.pieceBodyMap.get(piece.id);
      const conditionData = this.pieceConditions.get(piece.id) || { condition: 'INTACT', impactSeverity: 0 };

      if (!body) {
        return {
          pieceId: piece.id,
          type: piece.type,
          position: piece.position,
          rotation: piece.rotation,
          velocity: { x: 0, y: 0 },
          isFallen: conditionData.condition === 'LOST',
          isPrebuilt: piece.isPrebuilt,
          condition: conditionData.condition,
          impactSeverity: conditionData.impactSeverity,
          bullseyeActive: piece.bullseyeActive,
          bullseyeTriggered: piece.bullseyeTriggered,
          bullseyeExpired: piece.bullseyeExpired,
        };
      }

      const isFallen = body.position.y > WORLD_CONFIG.lossBoundaryY || conditionData.condition === 'LOST';

      return {
        pieceId: piece.id,
        type: piece.type,
        position: { x: body.position.x, y: body.position.y },
        rotation: body.angle,
        velocity: { x: body.velocity.x, y: body.velocity.y },
        isFallen,
        isPrebuilt: piece.isPrebuilt,
        condition: isFallen ? 'LOST' : conditionData.condition,
        impactSeverity: conditionData.impactSeverity,
        bullseyeActive: piece.bullseyeActive,
        bullseyeTriggered: piece.bullseyeTriggered,
        bullseyeExpired: piece.bullseyeExpired,
      };
    });
  }

  /**
   * Evaluates overall fortress stability and updates diagnostics
   */
  public getStabilityReport(dtSec: number): StabilityReport {
    let totalKineticEnergy = 0;
    let maxVelocity = 0;
    let maxAngularVelocity = 0;
    let fallenCount = 0;
    let awakeCount = 0;
    let sleepingCount = 0;

    let intactCount = 0;
    let crackedCount = 0;
    let brokenCount = 0;
    let lostCount = 0;

    for (const [pieceId, condEntry] of this.pieceConditions.entries()) {
      if (!this.pieceBodyMap.has(pieceId) && condEntry.condition === 'LOST') {
        fallenCount++;
        lostCount++;
      }
    }

    const isPureGravityTest =
      this.activeAttack === null && this.diagnostics.firstImpactCoordinates === null;

    if (isPureGravityTest && this.brokenDuringGravityTestCount > 0) {
      fallenCount += this.brokenDuringGravityTestCount;
    }

    for (const [pieceId, body] of this.pieceBodyMap.entries()) {
      const cond = this.pieceConditions.get(pieceId)?.condition || 'INTACT';
      const initTf = this.initialPieceTransforms.get(pieceId);
      const verticalDrop = initTf ? body.position.y - initTf.y : 0;
      const rotDiff = initTf ? Math.abs(shortestSignedAngleDelta(initTf.rotation, body.angle)) : 0;
      const collapsedInGravityTest =
        isPureGravityTest && (verticalDrop > 45 || rotDiff > 0.6 || cond === 'BROKEN');

      if (body.position.y > WORLD_CONFIG.lossBoundaryY || cond === 'LOST') {
        fallenCount++;
        lostCount++;
      } else if (cond === 'BROKEN') {
        brokenCount++;
        if (collapsedInGravityTest) fallenCount++;
      } else if (cond === 'CRACKED') {
        crackedCount++;
        if (collapsedInGravityTest) fallenCount++;
      } else {
        intactCount++;
        if (collapsedInGravityTest) fallenCount++;
      }

      if (body.isSleeping) {
        sleepingCount++;
      } else {
        awakeCount++;
      }

      const speedSq = body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y;
      const speed = Math.sqrt(speedSq);
      if (speed > maxVelocity) maxVelocity = speed;

      const rotSpeed = Math.abs(body.angularVelocity);
      if (rotSpeed > maxAngularVelocity) maxAngularVelocity = rotSpeed;
      const ke = 0.5 * body.mass * speedSq + 0.5 * body.inertia * (rotSpeed * rotSpeed);
      totalKineticEnergy += ke;
    }

    if (this.activeProjectileBody) {
      const p = this.activeProjectileBody;
      const pSpeedSq = p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y;
      const pSpeed = Math.sqrt(pSpeedSq);
      if (pSpeed > maxVelocity) maxVelocity = pSpeed;
      totalKineticEnergy += 0.5 * p.mass * pSpeedSq;
    }

    this.diagnostics.awakeBodyCount = awakeCount;
    this.diagnostics.sleepingBodyCount = sleepingCount;
    this.diagnostics.activeProjectileCount = this.activeProjectileBody ? 1 : 0;
    this.diagnostics.piecesIntactCount = intactCount;
    this.diagnostics.piecesCrackedCount = crackedCount;
    this.diagnostics.piecesBrokenCount = brokenCount;
    this.diagnostics.wispsDispersedCount = this.dispersedWispIds.size;
    this.diagnostics.wispsStableCount = Math.max(0, this.wispsMap.size - this.dispersedWispIds.size);

    let harmless = 0;
    let debrisHits = 0;
    let cosmetic = 0;
    for (const ev of this.wispContactEvents) {
      if (ev.category === 'HARMLESS_TOUCH') harmless++;
      else if (
        ev.category === 'MEANINGFUL_DEBRIS_HIT' ||
        ev.category === 'HEAVY_DEBRIS_HIT' ||
        ev.category === 'PINNED_OR_CRUSHED'
      )
        debrisHits++;
      else if (ev.category === 'COSMETIC_ONLY') cosmetic++;
    }
    this.diagnostics.wispHarmlessContactCount = harmless;
    this.diagnostics.wispDebrisHitCount = debrisHits;
    this.diagnostics.wispCosmeticOverlapCount = cosmetic;
    this.diagnostics.wispContactEvents = this.wispContactEvents;

    const hasMeaningfulMotion =
      maxVelocity > this.QUIET_LINEAR_SPEED_THRESHOLD ||
      maxAngularVelocity > this.QUIET_ANGULAR_SPEED_THRESHOLD;
    const structurallyInvalid = fallenCount > 0 || this.brokenDuringGravityTestCount > 0;
    const isQuiet =
      totalKineticEnergy < this.KINETIC_SETTLE_THRESHOLD ||
      (!hasMeaningfulMotion && !structurallyInvalid);

    if (isQuiet) {
      this.settledTimer += dtSec;
    } else {
      this.settledTimer = Math.max(0, this.settledTimer - dtSec * 1.5);
    }

    const settledRatio = Math.min(1.0, this.settledTimer / this.SETTLE_DURATION);
    const isSettled = settledRatio >= 1.0;

    return {
      isSimulating: this.isRunning,
      totalKineticEnergy,
      maxVelocity,
      settledRatio,
      isSettled,
      fallenCount,
    };
  }

  /**
   * Persists the live simulation transforms, damage states, and timber joint states into the
   * authoritative LevelState so Attack 2 seamlessly begins from the resolved battlefield state of Attack 1.
   */
  public updateLevelStateFromSimulation(levelState: LevelState): void {
    for (const piece of levelState.pieces) {
      const body = this.pieceBodyMap.get(piece.id);
      const cond = this.pieceConditions.get(piece.id);
      if (body) {
        piece.position = { x: body.position.x, y: body.position.y };
        piece.rotation = body.angle;
      }
      if (cond) {
        const severityRank: Record<string, number> = {
          INTACT: 0,
          CRACKED: 1,
          BROKEN: 2,
          LOST: 3,
        };
        const currentRank = severityRank[piece.condition || 'INTACT'] ?? 0;
        const simRank = severityRank[cond.condition] ?? 0;
        if (simRank >= currentRank) {
          piece.condition = cond.condition;
          piece.impactSeverity = cond.impactSeverity;
        }
      }
    }

    if (levelState.joints) {
      for (let i = 0; i < levelState.joints.length; i++) {
        const current = levelState.joints[i];
        const simJoint = this.timberJoints.get(current.jointId);
        if (simJoint) {
          levelState.joints[i] = {
            ...simJoint,
            localAnchorA: { ...simJoint.localAnchorA },
            localAnchorB: { ...simJoint.localAnchorB },
            worldPosition: { ...simJoint.worldPosition },
            breakPosition: simJoint.breakPosition ? { ...simJoint.breakPosition } : undefined,
          };
        }
      }
    }

    for (const wisp of levelState.wisps) {
      if (this.dispersedWispIds.has(wisp.id)) {
        wisp.isDispersed = true;
        wisp.dispersalTime = wisp.dispersalTime ?? Date.now();
      }
    }
  }

  /**
   * Completely tears down the simulation world and clears memory
   */
  public teardown(): void {
    this.isRunning = false;
    this.removeProjectile();
    Composite.clear(this.engine.world, false, true);
    this.pieceBodyMap.clear();
    this.pieceTypeMap.clear();
    this.anchorConstraintMap.clear();
    this.timberJoints.clear();
    this.timberJointConstraintMap.clear();
    this.foundationAssists.clear();
    this.terrainPhysicsDiagnostics.length = 0;
    this.pieceConditions.clear();
    this.dispersedWispIds.clear();
    this.processedContacts.clear();
    this.wispContactEvents = [];
    this.wispSustainedContactDurations.clear();
    this.wispLastRecordedSpeed.clear();
  }
}
