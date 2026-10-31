/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Matter from 'matter-js';
import { MATERIAL_CONFIGS, WORLD_CONFIG } from '../config';
import { DAMAGE_THRESHOLDS } from '../siege/siegeConfig';
import {
  AuthoredAttack,
  LevelState,
  MaterialType,
  PieceCondition,
  PlacedPiece,
  StabilityReport,
  Vector2,
} from '../types';

const { Engine, Bodies, Body, Constraint, Composite, Detector, Events } = Matter;

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
}

export interface DetailedPhysicsDiagnostics {
  logicalPieceCount: number;
  physicsBodyCount: number;
  constraintCount: number;
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
}

export class PhysicsBridge {
  private engine: Matter.Engine;
  private pieceBodyMap: Map<string, Matter.Body> = new Map();
  private pieceTypeMap: Map<string, MaterialType> = new Map();
  private anchorConstraintMap: Map<string, Matter.Constraint> = new Map();
  private isRunning = false;
  private settledTimer = 0;
  private simTimeAccumulator = 0;
  private readonly SETTLE_DURATION = 0.8;
  private readonly KINETIC_SETTLE_THRESHOLD = 0.05;

  // Phase 2 Attack & Damage Tracking
  private activeProjectileBody: Matter.Body | null = null;
  private activeAttack: AuthoredAttack | null = null;
  private projectileFlightTime = 0;
  private pieceConditions: Map<string, { condition: PieceCondition; impactSeverity: number }> = new Map();
  private dispersedWispIds: Set<string> = new Set();
  private processedContacts: Set<string> = new Set();

  public diagnostics: DetailedPhysicsDiagnostics;

  constructor(levelState: LevelState) {
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
      this.pieceConditions.set(piece.id, {
        condition: piece.condition || 'INTACT',
        impactSeverity: piece.impactSeverity || 0,
      });
    }

    // Initialize dispersed wisps from level state
    for (const wisp of levelState.wisps) {
      if (wisp.isDispersed) {
        this.dispersedWispIds.add(wisp.id);
      }
    }

    this.diagnostics = {
      logicalPieceCount: levelState.pieces.length,
      physicsBodyCount: 0,
      constraintCount: 0,
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
    };

    this.buildSimulationWorld(levelState);
    this.setupCollisionHandlers();
  }

  private buildSimulationWorld(levelState: LevelState): void {
    const world = this.engine.world;

    // 1. Static bedrock ground (top surface at y = WORLD_CONFIG.groundY = 780)
    // Extends across launcher zone, flight corridor, and fortress (x: -1200 to 1400)
    const ground = Bodies.rectangle(
      100,
      WORLD_CONFIG.groundY + 100,
      2600,
      200,
      {
        isStatic: true,
        friction: 0.95,
        restitution: 0.0,
        label: 'ground_bedrock',
      },
    );
    Composite.add(world, ground);

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

    // 3. Wisp sensor bodies (detect projectile direct hits and flying debris)
    for (const wisp of levelState.wisps) {
      if (wisp.isDispersed) continue;
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
          frictionAir: piece.type === 'stone_block' ? 0.015 : 0.02,
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
    }

    // 6. Initial Collision Overlap & Penetration Inspection
    const detector = Detector.create({ bodies: Composite.allBodies(world) });
    const collisions = Detector.collisions(detector);

    let maxPen = 0;
    const penetrations: Array<{ pair: string; depth: number }> = [];

    for (const col of collisions) {
      if (col.bodyA.isSensor || col.bodyB.isSensor) continue;
      if (col.depth > 0.5) {
        if (col.depth > maxPen) maxPen = col.depth;
        penetrations.push({
          pair: `${col.bodyA.label} <-> ${col.bodyB.label}`,
          depth: col.depth,
        });
      }
    }

    this.diagnostics.physicsBodyCount = Composite.allBodies(world).length;
    this.diagnostics.constraintCount = Composite.allConstraints(world).length;
    this.diagnostics.initialOverlapCount = penetrations.length;
    this.diagnostics.maxInitialPenetration = maxPen;
    this.diagnostics.initialPenetrations = penetrations;

    this.isRunning = true;
  }

  private setupCollisionHandlers(): void {
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        this.handleCollisionPair(pair);
      }
    });
  }

  private handleCollisionPair(pair: Matter.Pair): void {
    const { bodyA, bodyB } = pair;

    // 0. Track first projectile impact
    const isProjA = bodyA.label.startsWith('projectile');
    const isProjB = bodyB.label.startsWith('projectile');
    if ((isProjA || isProjB) && this.diagnostics.firstImpactCoordinates === null) {
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

    // 1. Wisp contact check
    const isWispA = bodyA.label.startsWith('wisp_');
    const isWispB = bodyB.label.startsWith('wisp_');

    if (isWispA || isWispB) {
      const wispBody = isWispA ? bodyA : bodyB;
      const colliderBody = isWispA ? bodyB : bodyA;
      const wispId = wispBody.label.replace('wisp_', '');

      if (!this.dispersedWispIds.has(wispId)) {
        if (colliderBody.label.startsWith('projectile')) {
          this.dispersedWispIds.add(wispId);
        } else if (colliderBody.label.startsWith('piece_')) {
          const speed = Math.hypot(colliderBody.velocity.x, colliderBody.velocity.y);
          const impulse = colliderBody.mass * speed;
          if (speed > DAMAGE_THRESHOLDS.wisp.minVelocity || impulse > DAMAGE_THRESHOLDS.wisp.minImpactImpulse) {
            this.dispersedWispIds.add(wispId);
          }
        }
      }
      return;
    }

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

    if (isPieceA) {
      const pieceIdA = bodyA.label.replace('piece_', '');
      const massB = bodyB.isStatic ? Infinity : bodyB.mass;
      const reducedMass = (bodyA.mass * massB) / (bodyA.mass + massB);
      const restitution = Math.max(bodyA.restitution, bodyB.restitution);
      const impulse = reducedMass * vRel * (1 + restitution);
      this.applyPieceDamage(pieceIdA, impulse);
    }

    if (isPieceB) {
      const pieceIdB = bodyB.label.replace('piece_', '');
      const massA = bodyA.isStatic ? Infinity : bodyA.mass;
      const reducedMass = (bodyB.mass * massA) / (bodyB.mass + massA);
      const restitution = Math.max(bodyA.restitution, bodyB.restitution);
      const impulse = reducedMass * vRel * (1 + restitution);
      this.applyPieceDamage(pieceIdB, impulse);
    }
  }

  private applyPieceDamage(pieceId: string, impulse: number): void {
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

  /**
   * Advances the physical simulation with a fixed, deterministic 60Hz step (16.666ms)
   */
  public step(dtMs: number): void {
    if (!this.isRunning) return;

    const fixedStep = 1000 / 60;
    Engine.update(this.engine, fixedStep);

    this.simTimeAccumulator += fixedStep / 1000;

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
      };
    });
  }

  /**
   * Evaluates overall fortress stability and updates diagnostics
   */
  public getStabilityReport(dtSec: number): StabilityReport {
    let totalKineticEnergy = 0;
    let maxVelocity = 0;
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

    for (const [pieceId, body] of this.pieceBodyMap.entries()) {
      const cond = this.pieceConditions.get(pieceId)?.condition || 'INTACT';
      if (body.position.y > WORLD_CONFIG.lossBoundaryY || cond === 'LOST') {
        fallenCount++;
        lostCount++;
      } else if (cond === 'BROKEN') {
        brokenCount++;
      } else if (cond === 'CRACKED') {
        crackedCount++;
      } else {
        intactCount++;
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
    this.diagnostics.piecesLostCount = lostCount;
    this.diagnostics.wispsDispersedCount = this.dispersedWispIds.size;
    this.diagnostics.wispsStableCount = Math.max(0, 5 - this.dispersedWispIds.size);

    if (totalKineticEnergy < this.KINETIC_SETTLE_THRESHOLD) {
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
   * Persists the live simulation transforms and damage states into the authoritative LevelState
   * so Attack 2 seamlessly begins from the resolved battlefield state of Attack 1.
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
        piece.condition = cond.condition;
        piece.impactSeverity = cond.impactSeverity;
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
    this.pieceConditions.clear();
    this.dispersedWispIds.clear();
    this.processedContacts.clear();
  }
}
