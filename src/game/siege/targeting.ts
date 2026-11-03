/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATERIAL_CONFIGS, WORLD_CONFIG } from '../config';
import {
  AttackerType,
  AuthoredAttack,
  LevelState,
  MaterialType,
  PieceCondition,
  PlacedPiece,
  Vector2,
} from '../types';
import { DistancePreset, DISTANCE_PRESETS } from './siegeConfig';

export interface TargetCandidate {
  id: string;
  type:
    | 'piece_center'
    | 'piece_exposed_top'
    | 'piece_exposed_front'
    | 'support_midpoint'
    | 'wisp_threat'
    | 'cluster'
    | 'fallback';
  position: Vector2;
  pieceId?: string;
  material?: MaterialType;
  condition?: PieceCondition;
  isPrebuilt?: boolean;
  attachedAnchorId?: string;
  supportingCount: number;
  wispsNearCount: number;
  nearestWispDist: number;
  isExposed: boolean;
}

export interface TrajectorySolution {
  launchVelocity: Vector2;
  launchAngleDeg: number;
  launchSpeed: number;
  trajectoryType: 'low' | 'high';
  closestApproachDist: number;
  expectedFirstObstruction: string;
  overshootsFortress: boolean;
  predictedApex: Vector2;
  apexHeightAboveGround: number;
  predictedFlightDurationSec: number;
  isValid: boolean;
  rejectionReason?: string;
}

export interface DifficultyTuningConfig {
  aimingErrorTolerance: number;
  candidateScoringSophistication: 'basic' | 'tactical' | 'advanced';
  maxCandidatesConsidered: number;
  defenderInformationLevel: 'full' | 'partial' | 'minimal';
  reinforcementFrequency: 'every_attack' | 'milestone' | 'none';
  projectileSequenceComplexity: 'tutorial_pair' | 'multi_wave' | 'adaptive';
  environmentalDifficulty: 'calm' | 'windy' | 'hazardous';
}

export const DEFAULT_LEVEL_1_DIFFICULTY_CONFIG: DifficultyTuningConfig = {
  aimingErrorTolerance: 0,
  candidateScoringSophistication: 'tactical',
  maxCandidatesConsidered: 64,
  defenderInformationLevel: 'full',
  reinforcementFrequency: 'every_attack',
  projectileSequenceComplexity: 'tutorial_pair',
  environmentalDifficulty: 'calm',
};

export interface ScoredCandidate {
  candidate: TargetCandidate;
  totalScore: number;
  materialRoleScore: number;
  wispProximityScore: number;
  structuralImportanceScore: number;
  reachabilityScore: number;
  solution: TrajectorySolution;
}

export interface TargetingDiagnostics {
  currentAttacker: AttackerType;
  distancePreset: DistancePreset;
  distanceToFortressFront: number;
  candidateCount: number;
  reachableCandidateCount: number;
  selectedTargetId: string;
  selectedTargetType: string;
  selectedTargetMaterial: string;
  selectedTargetCondition: string;
  activeWispsNearTarget: number;
  structuralImportanceScore: number;
  materialPreferenceScore: number;
  wispProximityScore: number;
  reachabilityScore: number;
  totalTargetScore: number;
  targetWorldCoordinates: Vector2;
  launchOriginWorldCoordinates: Vector2;
  deltaToTarget: Vector2;
  launchVelocity: Vector2;
  launchAngle: number;
  launchSpeed: number;
  selectedTrajectoryType: 'low' | 'high';
  predictedApex: Vector2;
  apexHeightAboveGround: number;
  predictedFlightDurationSec: number;
  expectedFirstObstruction: string;
  predictedClosestApproach: number;
  fallbackUsed: boolean;
  rejectedTrajectoryCount: number;
  failureReason: string | null;
  // Phase 5 Bullseye Block Diagnostics
  bullseyePieceId: string;
  bullseyeInventoryStatus: string;
  bullseyeCondition: string;
  bullseyeActive: boolean;
  bullseyeTriggered: boolean;
  bullseyeExpired: boolean;
  bullseyeWorldCoordinates: Vector2 | null;
  bullseyeReachableByCurrentAttacker: boolean;
  validBullseyeTrajectoryCount: number;
  bullseyeOverrideSelected: boolean;
  attackIdConsumingBullseye: string | null;
  overrideCancellationReason: string | null;
  actualFirstImpactObject: string | null;
  distanceBetweenImpactAndBullseye: number | null;
  ordinaryTargetWithoutOverride: string | null;
}

// Matter.js discrete gravity acceleration per 60Hz tick
// engine.gravity.y = 1.0, scale = 0.001, fixedStep = 1000 / 60
// g_tick = 1.0 * 0.001 * (1000/60)^2 = 1000 / 3600 = 5 / 18 px/tick^2
export const GRAVITY_TICK = 5 / 18;

/**
 * Checks if a point is within or near a piece's oriented bounding box
 */
function isPointNearPiece(
  px: number,
  py: number,
  piece: PlacedPiece,
  margin = 12,
): boolean {
  const config = MATERIAL_CONFIGS[piece.type];
  const halfW = config.width / 2 + margin;
  const halfH = config.height / 2 + margin;

  const dx = px - piece.position.x;
  const dy = py - piece.position.y;

  // Un-rotate point into piece local space
  const cos = Math.cos(-piece.rotation);
  const sin = Math.sin(-piece.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
}

/**
 * Checks if a 2D line segment between (x0, y0) and (x1, y1) intersects a piece's bounding box
 */
function isLineBlockedByPiece(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  piece: PlacedPiece,
): boolean {
  const config = MATERIAL_CONFIGS[piece.type];
  const halfW = config.width / 2;
  const halfH = config.height / 2;

  // Approximate AABB in world coords
  const minX = piece.position.x - halfW;
  const maxX = piece.position.x + halfW;
  const minY = piece.position.y - halfH;
  const maxY = piece.position.y + halfH;

  const dx = x1 - x0;
  const dy = y1 - y0;

  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) > 1e-6) {
    let t1 = (minX - x0) / dx;
    let t2 = (maxX - x0) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dy) > 1e-6) {
    let t1 = (minY - y0) / dy;
    let t2 = (maxY - y0) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

export function getSpeedRangeForLauncher(attackerType: AttackerType, originX: number): [number, number] {
  if (originX <= -600) {
    return attackerType === 'standard'
      ? DISTANCE_PRESETS.FAR.standardSpeedRange
      : DISTANCE_PRESETS.FAR.heavySpeedRange;
  }
  if (originX <= -300) {
    return attackerType === 'standard'
      ? DISTANCE_PRESETS.STANDARD.standardSpeedRange
      : DISTANCE_PRESETS.STANDARD.heavySpeedRange;
  }
  return attackerType === 'standard'
    ? DISTANCE_PRESETS.NEAR.standardSpeedRange
    : DISTANCE_PRESETS.NEAR.heavySpeedRange;
}

export function getDistancePresetFromOrigin(originX: number): DistancePreset {
  if (originX <= -600) return 'FAR';
  if (originX <= -300) return 'STANDARD';
  return 'NEAR';
}

/**
 * Generates candidate targets based on the current logical fortress state and wisps
 */
export function generateTargetCandidates(
  levelState: LevelState,
  launcherOrigin?: Vector2,
): TargetCandidate[] {
  const candidates: TargetCandidate[] = [];
  const activePieces = levelState.pieces.filter(
    (p) => p.condition !== 'LOST' && p.position.y < WORLD_CONFIG.lossBoundaryY - 40,
  );
  const hasAnyPlacedWisp = levelState.wisps.some((w) => w.placed === true);
  const activeWisps = hasAnyPlacedWisp
    ? levelState.wisps.filter((w) => !w.isDispersed && w.placed === true)
    : levelState.wisps.filter((w) => !w.isDispersed);
  const launcherPos = launcherOrigin ?? {
    x: DISTANCE_PRESETS.STANDARD.launcherX,
    y: DISTANCE_PRESETS.STANDARD.launcherY,
  };

  // 1. Piece-based candidates
  const activeJoints = (levelState.joints ?? []).filter((j) => j.state !== 'BROKEN');
  for (const piece of activePieces) {
    const config = MATERIAL_CONFIGS[piece.type];

    // Count how many pieces this piece directly supports above it, plus active timber joint connections
    let supportingCount = 0;
    if (piece.type === 'wood_beam') {
      const jointCount = activeJoints.filter(
        (j) => j.pieceAId === piece.id || j.pieceBId === piece.id,
      ).length;
      supportingCount += jointCount;
    }
    for (const other of activePieces) {
      if (other.id === piece.id) continue;
      if (
        other.position.y < piece.position.y - 10 &&
        other.position.y > piece.position.y - 120 &&
        Math.abs(other.position.x - piece.position.x) <
          (config.width + MATERIAL_CONFIGS[other.type].width) / 2
      ) {
        supportingCount++;
        // If this column supports a joined roof beam, also credit the connected span
        if (other.type === 'wood_beam') {
          const supportedBeamJoints = activeJoints.filter(
            (j) => j.pieceAId === other.id || j.pieceBId === other.id,
          ).length;
          supportingCount += supportedBeamJoints;
        }
      }
    }

    // Wisp proximity: count active wisps sheltered or nearby
    let nearestWispDist = Infinity;
    let wispsNearCount = 0;
    for (const wisp of activeWisps) {
      const d = Math.hypot(piece.position.x - wisp.position.x, piece.position.y - wisp.position.y);
      if (d < nearestWispDist) nearestWispDist = d;
      if (d <= 220) wispsNearCount++;
    }

    // Check line of sight from launcher
    let blockedFromLauncher = false;
    for (const other of activePieces) {
      if (other.id === piece.id) continue;
      if (
        other.position.x < piece.position.x - 15 &&
        isLineBlockedByPiece(launcherPos.x, launcherPos.y, piece.position.x, piece.position.y, other)
      ) {
        blockedFromLauncher = true;
        break;
      }
    }
    const isExposed = !blockedFromLauncher;

    // Center candidate
    candidates.push({
      id: `center_${piece.id}`,
      type: piece.attachedAnchorId ? 'support_midpoint' : 'piece_center',
      position: { x: piece.position.x, y: piece.position.y },
      pieceId: piece.id,
      material: piece.type,
      condition: piece.condition || 'INTACT',
      isPrebuilt: piece.isPrebuilt,
      attachedAnchorId: piece.attachedAnchorId,
      supportingCount,
      wispsNearCount,
      nearestWispDist,
      isExposed,
    });

    // Upper exposed face candidate (vital for lintels and tops of pillars)
    candidates.push({
      id: `upper_${piece.id}`,
      type: 'piece_exposed_top',
      position: { x: piece.position.x, y: piece.position.y - config.height / 2 },
      pieceId: piece.id,
      material: piece.type,
      condition: piece.condition || 'INTACT',
      isPrebuilt: piece.isPrebuilt,
      attachedAnchorId: piece.attachedAnchorId,
      supportingCount,
      wispsNearCount,
      nearestWispDist,
      isExposed: true,
    });
  }

  // 2. Wisp threat candidates (only if a wisp is truly exposed without defensive cover in front or above)
  for (const wisp of activeWisps) {
    let hasRoofAbove = false;
    let hasDirectCover = false;
    for (const piece of activePieces) {
      const halfW = MATERIAL_CONFIGS[piece.type].width / 2;
      // Covered from above by a roof or lintel
      if (
        Math.abs(piece.position.x - wisp.position.x) <= halfW + 15 &&
        piece.position.y < wisp.position.y &&
        piece.position.y > wisp.position.y - 140
      ) {
        hasRoofAbove = true;
      }

      // Shielded from the west by a defensive piece within direct proximity or line-of-sight
      if (
        piece.position.x < wisp.position.x &&
        (isLineBlockedByPiece(launcherPos.x, launcherPos.y, wisp.position.x, wisp.position.y, piece) ||
          ((wisp.position.x - piece.position.x) <= 85 &&
            Math.abs(piece.position.y - wisp.position.y) < 80))
      ) {
        hasDirectCover = true;
      }
    }

    if (!hasRoofAbove && !hasDirectCover) {
      candidates.push({
        id: `wisp_${wisp.id}`,
        type: 'wisp_threat',
        position: { x: wisp.position.x, y: wisp.position.y },
        supportingCount: 0,
        wispsNearCount: 1,
        nearestWispDist: 0,
        isExposed: true,
      });
    }
  }

  // 3. Predefined fallback regions inside the construction zone
  candidates.push({
    id: 'fallback_west_pylon',
    type: 'fallback',
    position: { x: 200, y: 708 },
    supportingCount: 1,
    wispsNearCount: Math.min(2, Math.max(1, activeWisps.length)),
    nearestWispDist: 85,
    isExposed: true,
  });

  return candidates;
}

/**
 * Simulates a test trajectory step-by-step and validates against obstacles, ground, and overshooting
 */
function testTrajectoryArc(
  origin: Vector2,
  launchVx: number,
  launchVy: number,
  target: Vector2,
  activePieces: PlacedPiece[],
  projRadius = 16,
): {
  closestApproachDist: number;
  expectedFirstObstruction: string;
  overshootsFortress: boolean;
  isValid: boolean;
  rejectionReason?: string;
} {
  let simX = origin.x;
  let simY = origin.y;
  let vx = launchVx;
  let vy = launchVy;

  let minApproachDist = Infinity;
  let firstObstruction = 'none';
  const maxPieceX = activePieces.length > 0 ? Math.max(...activePieces.map((p) => p.position.x)) : 680;

  for (let step = 1; step <= 160; step++) {
    simX += vx;
    simY += vy;
    vy += GRAVITY_TICK;

    // 1. Terrain check: Check ground collision
    if (simY >= WORLD_CONFIG.groundY) {
      if (simX < 140 && firstObstruction === 'none') {
        // Ground strike immediately in front of launcher before reaching fortress
        return {
          closestApproachDist: minApproachDist,
          expectedFirstObstruction: 'ground_terrain',
          overshootsFortress: false,
          isValid: false,
          rejectionReason: 'Trajectory strikes ground terrain before reaching fortress',
        };
      }
      if (firstObstruction === 'none') {
        firstObstruction = 'ground_bedrock';
      }
      break;
    }

    // 2. Track closest approach to intended target point
    const distToTarget = Math.hypot(simX - target.x, simY - target.y);
    if (distToTarget < minApproachDist) {
      minApproachDist = distToTarget;
    }

    // 3. Piece collision check
    if (firstObstruction === 'none') {
      for (const piece of activePieces) {
        if (isPointNearPiece(simX, simY, piece, projRadius)) {
          // If the trajectory already reached within direct contact range of target before this piece, it is behind the target
          if (minApproachDist <= 16 && simX > target.x) {
            break;
          }
          firstObstruction = piece.id;
          break;
        }
      }
    }

    // 4. Out of bounds check
    if (simX > WORLD_CONFIG.maxX + 400 || simY > WORLD_CONFIG.lossBoundaryY) {
      break;
    }
  }

  // Overshoot check: passes entire fortress without approaching target or touching any piece
  const overshootsFortress =
    simX > maxPieceX + 30 &&
    firstObstruction === 'none' &&
    minApproachDist > 65;

  if (overshootsFortress) {
    return {
      closestApproachDist: minApproachDist,
      expectedFirstObstruction: 'none',
      overshootsFortress: true,
      isValid: false,
      rejectionReason: 'Trajectory overshoots entire fortress without structural impact',
    };
  }

  return {
    closestApproachDist: minApproachDist,
    expectedFirstObstruction: firstObstruction,
    overshootsFortress: false,
    isValid: true,
  };
}

/**
 * Solves the ballistic equations to find valid launch angles and velocities toward target
 */
export function solveBallisticTrajectory(
  origin: Vector2,
  target: Vector2,
  speedRange: [number, number],
  activePieces: PlacedPiece[],
  preferredArc: 'low' | 'high' = 'low',
  projRadius = 16,
): TrajectorySolution | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  if (dx <= 10) {
    return null; // Target must be meaningfully in front of launcher
  }

  const [minAllowedSpeed, maxAllowedSpeed] = speedRange;

  // Minimum physical launch speed to reach (dx, dy)
  const vMinTheoretical = Math.sqrt(GRAVITY_TICK * (dy + Math.hypot(dx, dy)));
  if (vMinTheoretical > maxAllowedSpeed) {
    return null; // Target beyond physical ballistic range
  }

  // Sample speeds starting right above theoretical minimum so flight times are realistic and arcing
  const vDiscriminant = Math.sqrt(GRAVITY_TICK * (Math.hypot(dx, dy) - dy));
  const speedCandidates = [
    Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vMinTheoretical * 1.025)),
    Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vMinTheoretical * 1.06)),
    Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vMinTheoretical * 1.12)),
  ];
  if (vDiscriminant > vMinTheoretical * 1.12 && vDiscriminant <= maxAllowedSpeed) {
    speedCandidates.push(
      Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vDiscriminant * 1.03)),
      Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vDiscriminant * 1.08)),
    );
  }
  const testSpeeds = Array.from(new Set(speedCandidates)).filter((s) => s >= vMinTheoretical);

  let bestSolution: TrajectorySolution | null = null;
  let lowestApproach = Infinity;

  for (const speed of testSpeeds) {
    if (speed < vMinTheoretical) continue;

    const a = (GRAVITY_TICK * dx * dx) / (2 * speed * speed);
    const b = dx;
    const c = a - dy;
    const D = b * b - 4 * a * c;

    if (D < 0) continue;

    const sqrtD = Math.sqrt(D);
    const tanLow = (-b + sqrtD) / (2 * a);
    const tanHigh = (-b - sqrtD) / (2 * a);

    const thetaLow = Math.atan(tanLow);
    const thetaHigh = Math.atan(tanHigh);

    // Primary and secondary arcs based on attacker preference
    const arcsToTest: Array<{ theta: number; type: 'low' | 'high' }> =
      preferredArc === 'low'
        ? [
            { theta: thetaLow, type: 'low' },
            { theta: thetaHigh, type: 'high' },
          ]
        : [
            { theta: thetaHigh, type: 'high' },
            { theta: thetaLow, type: 'low' },
          ];

    for (const arc of arcsToTest) {
      const vx = speed * Math.cos(arc.theta);
      const vy = speed * Math.sin(arc.theta);

      // Launcher mechanical angle constraints: -68° (high lob) to +50° (ground depression)
      const angleDeg = (arc.theta * 180) / Math.PI;
      if (angleDeg < -68 || angleDeg > 50) continue;

      const testResult = testTrajectoryArc(origin, vx, vy, target, activePieces, projRadius);
      if (!testResult.isValid) continue;

      if (testResult.closestApproachDist < lowestApproach) {
        lowestApproach = testResult.closestApproachDist;

        // Calculate Apex in world space
        const tApexTicks = vy < 0 ? -vy / GRAVITY_TICK : 0;
        const apexX = origin.x + vx * tApexTicks;
        const apexY = vy < 0 ? origin.y - (vy * vy) / (2 * GRAVITY_TICK) : origin.y;
        const apexHeight = WORLD_CONFIG.groundY - apexY;

        // Calculate predicted flight duration (seconds) to target distance
        const flightDurationSec = (dx / vx) / 60;

        bestSolution = {
          launchVelocity: { x: vx, y: vy },
          launchAngleDeg: angleDeg,
          launchSpeed: speed,
          trajectoryType: arc.type,
          closestApproachDist: testResult.closestApproachDist,
          expectedFirstObstruction: testResult.expectedFirstObstruction,
          overshootsFortress: testResult.overshootsFortress,
          predictedApex: { x: apexX, y: apexY },
          apexHeightAboveGround: apexHeight,
          predictedFlightDurationSec: flightDurationSec,
          isValid: true,
        };

        // If direct pinpoint hit, break early
        if (lowestApproach <= 14) break;
      }
    }

    if (bestSolution && lowestApproach <= 14) break;
  }

  return bestSolution;
}

/**
 * Scores each candidate deterministically based on attacker role and tactical suitability
 */
export function scoreCandidates(
  candidates: TargetCandidate[],
  attackerType: AttackerType,
  levelState: LevelState,
  launcherOrigin: Vector2,
): ScoredCandidate[] {
  const activePieces = levelState.pieces.filter((p) => p.condition !== 'LOST');
  const speedRange = getSpeedRangeForLauncher(attackerType, launcherOrigin.x);
  const preferredArc = 'low';
  const projRadius = attackerType === 'standard' ? 16 : 24;

  const scored: ScoredCandidate[] = [];

  for (const cand of candidates) {
    // 1. Solve trajectory
    let solution = solveBallisticTrajectory(
      launcherOrigin,
      cand.position,
      speedRange,
      activePieces,
      preferredArc,
      projRadius,
    );
    if (attackerType === 'standard' && cand.type === 'wisp_threat') {
      const highSol = solveBallisticTrajectory(
        launcherOrigin,
        cand.position,
        speedRange,
        activePieces,
        'high',
        projRadius,
      );
      if (highSol && highSol.isValid) {
        if (!solution || !solution.isValid) {
          solution = highSol;
        }
      }
    }

    if (!solution || !solution.isValid) {
      continue; // Filter out unreachable candidates
    }

    // Treat expired bullseye_block identically to stone_block during normal scoring
    const effectiveMaterial: MaterialType | undefined =
      cand.material === 'bullseye_block' ? 'stone_block' : cand.material;

    // 2. Material & Role Suitability
    let materialRoleScore = 0;
    const isOccluded =
      cand.type === 'wisp_threat'
        ? solution.expectedFirstObstruction !== 'none' &&
          solution.expectedFirstObstruction !== 'ground_bedrock'
        : solution.expectedFirstObstruction !== 'none' &&
          solution.expectedFirstObstruction !== cand.pieceId;

    if (attackerType === 'standard') {
      // Standard attacker prioritizes exposed wooden pieces, upper rims, and exposed wisps
      if (cand.type === 'wisp_threat') {
        materialRoleScore += 95; // High priority if a wisp is left unshielded
      } else if (effectiveMaterial === 'wood_beam') {
        materialRoleScore += 35;
      } else if (effectiveMaterial === 'wood_block') {
        materialRoleScore += 26;
      } else if (effectiveMaterial === 'stone_block') {
        materialRoleScore += 12; // Avoids thick stone foundation when wood is available
      }

      // Upper / outer defense preference
      if (cand.position.y <= 710) {
        materialRoleScore += 25;
      }
      if (cand.type === 'piece_exposed_top') {
        materialRoleScore += 15;
      }
      // Outer defensive piece facing the launcher (western perimeter)
      if (cand.position.x <= 300) {
        materialRoleScore += 30;
      }
      if (cand.isExposed) {
        materialRoleScore += 15;
      }
      // Standard attacker avoids occluded pieces or deep ground foundations
      if (isOccluded) {
        materialRoleScore -= 45;
      }
      if (cand.position.y > 740 && effectiveMaterial === 'stone_block') {
        materialRoleScore -= 25;
      }
    } else {
      // Heavy attacker prioritizes lower supports, stone foundations, and structural columns
      if (cand.type === 'wisp_threat') {
        materialRoleScore += 25; // Focuses on crushing structural components over sniping wisps
      } else if (effectiveMaterial === 'stone_block') {
        materialRoleScore += 40; // Delights in crushing heavy stone foundations
      } else if (effectiveMaterial === 'wood_block') {
        materialRoleScore += 24;
      } else if (effectiveMaterial === 'wood_beam') {
        materialRoleScore += 16;
      }

      // Exploit breach if piece is already damaged and near wisps
      if (cand.condition === 'CRACKED') {
        materialRoleScore += cand.wispsNearCount >= 2 ? 40 : 20;
      }

      // Lower load-bearing support preference
      if (cand.position.y >= 740) {
        materialRoleScore += 25;
      } else if (cand.position.y >= 700) {
        materialRoleScore += 20;
      }

      // Front and central foundation supports sheltering wisps
      if (cand.position.x >= 350 && cand.position.x <= 450) {
        materialRoleScore += 40; // Central sanctum rune socket / supports
      } else if (cand.position.x <= 250) {
        materialRoleScore += 25; // Western bedrock pylon / breach
      }

      // Penalize occluded pieces unless the obstruction is an already cracked breach directly adjacent to the target
      const obstructingPiece = activePieces.find(
        (p) => p.id === solution.expectedFirstObstruction,
      );
      const isBreachedObstruction =
        obstructingPiece?.condition === 'CRACKED' &&
        Math.hypot(
          cand.position.x - obstructingPiece.position.x,
          cand.position.y - obstructingPiece.position.y,
        ) < 130;
      if (isOccluded && !isBreachedObstruction) {
        materialRoleScore -= 45;
      }

      // Penalize bedrock floor anchor itself (immovable rock foundation absorbs impact)
      if (cand.attachedAnchorId && cand.attachedAnchorId !== 'anchor_center') {
        materialRoleScore -= 60;
      }

      // Penalize flimsy high lintels or upper faces (heavy attacker prefers low foundations)
      if (cand.position.y < 670) {
        materialRoleScore -= 20;
      }
      if (cand.type === 'piece_exposed_top') {
        materialRoleScore -= 15;
      }
    }

    // 3. Wisp Proximity & Protection Score (normalized to active wisp count)
    let wispProximityScore = 0;
    const activeWispCount = Math.max(
      1,
      levelState.wisps.filter((w) => !w.isDispersed).length || levelState.wisps.length || 3,
    );
    if (cand.type === 'wisp_threat') {
      wispProximityScore += 75;
    } else {
      // Proximity score: closer to active wisps = higher tactical value
      if (cand.nearestWispDist < 320) {
        wispProximityScore += Math.max(0, 30 * (1 - cand.nearestWispDist / 320));
      }
      if (cand.wispsNearCount > 0) {
        // Normalize nearby-wisp scoring relative to level wisp count:
        // - 1 nearby wisp is already important (16 pts for <=3 wisps)
        // - 2 nearby wisps is a major cluster target (32 pts)
        // - 3 nearby wisps is the entire protected population (48 pts)
        const totalLevelWisps = Math.max(1, levelState.wisps.length || 3);
        const perWispBonus = totalLevelWisps <= 3 ? 16 : 14;
        wispProximityScore += Math.min(56, cand.wispsNearCount * perWispBonus);
      }
    }

    // 4. Structural Importance Score
    let structuralImportanceScore = 0;
    if (cand.supportingCount > 0) {
      structuralImportanceScore += Math.min(50, cand.supportingCount * 25);
    }
    if (cand.attachedAnchorId && cand.supportingCount > 0) {
      structuralImportanceScore += 15; // Directly welded to bedrock anchor and supporting structure
    }

    // Remote irrelevant piece penalty or isolated non-load-bearing block outside western wall
    if (cand.nearestWispDist > 240 && cand.supportingCount === 0 && !cand.attachedAnchorId) {
      structuralImportanceScore -= 45;
    } else if (
      attackerType === 'heavy' &&
      cand.supportingCount === 0 &&
      !cand.attachedAnchorId &&
      cand.position.x < 185
    ) {
      structuralImportanceScore -= 35;
    }

    // 5. Reachability & Approach Quality Score
    let reachabilityScore = 20;
    if (solution.closestApproachDist <= 30) {
      reachabilityScore += Math.max(0, 15 * (1 - solution.closestApproachDist / 30));
    }
    if (solution.trajectoryType === 'low') {
      reachabilityScore += 8; // Slight preference for cleaner direct arc
    }
    if (
      solution.expectedFirstObstruction === cand.pieceId ||
      cand.type === 'fallback' ||
      (cand.type === 'wisp_threat' && !isOccluded)
    ) {
      reachabilityScore += 12; // Unobstructed direct strike
    }

    // Total Score
    const totalScore =
      materialRoleScore +
      wispProximityScore +
      structuralImportanceScore +
      reachabilityScore;

    scored.push({
      candidate: cand,
      totalScore,
      materialRoleScore,
      wispProximityScore,
      structuralImportanceScore,
      reachabilityScore,
      solution,
    });
  }

  // Deterministic sorting: highest score first; tie-break with candidate.id
  scored.sort((a, b) => {
    if (Math.abs(b.totalScore - a.totalScore) > 0.001) {
      return b.totalScore - a.totalScore;
    }
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  return scored;
}

/**
 * Evaluates reachability and valid trajectories for an active Bullseye Block.
 */
export function evaluateBullseyeOverride(
  bullseyePiece: PlacedPiece,
  attack: AuthoredAttack,
  levelState: LevelState,
  launcherOrigin: Vector2,
): {
  reachable: boolean;
  validTrajectoryCount: number;
  selectedCandidate: TargetCandidate | null;
  selectedSolution: TrajectorySolution | null;
} {
  const activePieces = levelState.pieces.filter((p) => p.condition !== 'LOST');
  const activeWisps = levelState.wisps.filter((w) => !w.isDispersed && w.placed !== false);
  const speedRange = getSpeedRangeForLauncher(attack.attackerType, launcherOrigin.x);
  const projRadius = attack.attackerType === 'standard' ? 16 : 24;
  const config = MATERIAL_CONFIGS[bullseyePiece.type];

  // Check if Bullseye is outside the launcher's effective siege range envelope
  if (
    bullseyePiece.position.x > WORLD_CONFIG.buildZone.maxX + 60 ||
    bullseyePiece.position.x < WORLD_CONFIG.buildZone.minX - 40 ||
    bullseyePiece.position.y < WORLD_CONFIG.buildZone.minY
  ) {
    return {
      reachable: false,
      validTrajectoryCount: 0,
      selectedCandidate: null,
      selectedSolution: null,
    };
  }

  let nearestWispDist = Infinity;
  let wispsNearCount = 0;
  for (const wisp of activeWisps) {
    const d = Math.hypot(
      bullseyePiece.position.x - wisp.position.x,
      bullseyePiece.position.y - wisp.position.y,
    );
    if (d < nearestWispDist) nearestWispDist = d;
    if (d <= 180) wispsNearCount++;
  }

  const targetPoints: TargetCandidate[] = [
    {
      id: `front_${bullseyePiece.id}`,
      type: 'piece_exposed_front',
      position: {
        x: bullseyePiece.position.x - config.width / 2,
        y: Math.min(WORLD_CONFIG.groundY - projRadius - 2, bullseyePiece.position.y + 8),
      },
      pieceId: bullseyePiece.id,
      material: bullseyePiece.type,
      condition: bullseyePiece.condition || 'INTACT',
      isPrebuilt: bullseyePiece.isPrebuilt,
      attachedAnchorId: bullseyePiece.attachedAnchorId,
      supportingCount: 0,
      wispsNearCount,
      nearestWispDist,
      isExposed: true,
    },
    {
      id: `center_${bullseyePiece.id}`,
      type: bullseyePiece.attachedAnchorId ? 'support_midpoint' : 'piece_center',
      position: { x: bullseyePiece.position.x, y: bullseyePiece.position.y },
      pieceId: bullseyePiece.id,
      material: bullseyePiece.type,
      condition: bullseyePiece.condition || 'INTACT',
      isPrebuilt: bullseyePiece.isPrebuilt,
      attachedAnchorId: bullseyePiece.attachedAnchorId,
      supportingCount: 0,
      wispsNearCount,
      nearestWispDist,
      isExposed: true,
    },
    {
      id: `upper_${bullseyePiece.id}`,
      type: 'piece_exposed_top',
      position: {
        x: bullseyePiece.position.x,
        y: bullseyePiece.position.y - config.height / 2,
      },
      pieceId: bullseyePiece.id,
      material: bullseyePiece.type,
      condition: bullseyePiece.condition || 'INTACT',
      isPrebuilt: bullseyePiece.isPrebuilt,
      attachedAnchorId: bullseyePiece.attachedAnchorId,
      supportingCount: 0,
      wispsNearCount,
      nearestWispDist,
      isExposed: true,
    },
  ];

  let validCount = 0;
  let bestCandidate: TargetCandidate | null = null;
  let bestSolution: TrajectorySolution | null = null;
  let bestIsDirect = false;

  const isDirectToBullseye = (sol: TrajectorySolution): boolean =>
    sol.expectedFirstObstruction === bullseyePiece.id ||
    sol.expectedFirstObstruction === 'none' ||
    sol.expectedFirstObstruction === 'ground_bedrock';

  const considerSolution = (pt: TargetCandidate, sol: TrajectorySolution | null) => {
    if (!sol || !sol.isValid || sol.closestApproachDist > 36) return;
    validCount++;
    const direct = isDirectToBullseye(sol);
    if (
      !bestSolution ||
      (direct && !bestIsDirect) ||
      (direct === bestIsDirect &&
        bestSolution.closestApproachDist > 18 &&
        sol.closestApproachDist < bestSolution.closestApproachDist - 2)
    ) {
      bestCandidate = pt;
      bestSolution = sol;
      bestIsDirect = direct;
    }
  };

  for (const pt of targetPoints) {
    const solLow = solveBallisticTrajectory(
      launcherOrigin,
      pt.position,
      speedRange,
      activePieces,
      'low',
      projRadius,
    );
    considerSolution(pt, solLow);

    const solHigh = solveBallisticTrajectory(
      launcherOrigin,
      pt.position,
      speedRange,
      activePieces,
      'high',
      projRadius,
    );
    if (
      solHigh &&
      (!solLow ||
        Math.abs(solHigh.launchAngleDeg - solLow.launchAngleDeg) > 1.0 ||
        isDirectToBullseye(solHigh) !== isDirectToBullseye(solLow))
    ) {
      considerSolution(pt, solHigh);
    }

    // Also evaluate explicit high-clearance arcs across the allowed speed envelope if low/high default speeds were obstructed
    if (!bestIsDirect) {
      const dx = pt.position.x - launcherOrigin.x;
      const dy = pt.position.y - launcherOrigin.y;
      const [minSpd, maxSpd] = speedRange;
      for (const frac of [0.35, 0.55, 0.75, 0.92]) {
        const spd = minSpd + (maxSpd - minSpd) * frac;
        const a = (GRAVITY_TICK * dx * dx) / (2 * spd * spd);
        const b = dx;
        const c = a - dy;
        const D = b * b - 4 * a * c;
        if (D < 0) continue;
        const sqrtD = Math.sqrt(D);
        for (const arc of [
          { theta: Math.atan((-b + sqrtD) / (2 * a)), type: 'low' as const },
          { theta: Math.atan((-b - sqrtD) / (2 * a)), type: 'high' as const },
        ]) {
          const angleDeg = (arc.theta * 180) / Math.PI;
          if (angleDeg < -68 || angleDeg > 50) continue;
          const vx = spd * Math.cos(arc.theta);
          const vy = spd * Math.sin(arc.theta);
          const tr = testTrajectoryArc(launcherOrigin, vx, vy, pt.position, activePieces, projRadius);
          if (!tr.isValid || tr.closestApproachDist > 36) continue;
          const tApexTicks = vy < 0 ? -vy / GRAVITY_TICK : 0;
          const apexX = launcherOrigin.x + vx * tApexTicks;
          const apexY = vy < 0 ? launcherOrigin.y - (vy * vy) / (2 * GRAVITY_TICK) : launcherOrigin.y;
          considerSolution(pt, {
            launchVelocity: { x: vx, y: vy },
            launchAngleDeg: angleDeg,
            launchSpeed: spd,
            trajectoryType: arc.type,
            closestApproachDist: tr.closestApproachDist,
            expectedFirstObstruction: tr.expectedFirstObstruction,
            overshootsFortress: tr.overshootsFortress,
            predictedApex: { x: apexX, y: apexY },
            apexHeightAboveGround: WORLD_CONFIG.groundY - apexY,
            predictedFlightDurationSec: dx / vx / 60,
            isValid: true,
          });
        }
      }
    }
  }

  return {
    reachable: validCount > 0 && bestCandidate !== null && bestSolution !== null,
    validTrajectoryCount: validCount,
    selectedCandidate: bestCandidate,
    selectedSolution: bestSolution,
  };
}

/**
 * Main targeting function: evaluates fortress, active wisps, and attacker to select target & calculate trajectory
 */
export function selectTargetAndTrajectory(
  levelState: LevelState,
  attack: AuthoredAttack,
  preset?: DistancePreset,
): {
  target: TargetCandidate;
  solution: TrajectorySolution;
  diagnostics: TargetingDiagnostics;
} | null {
  const launcherOrigin = attack.spawnPosition;
  const activePreset = preset ?? getDistancePresetFromOrigin(launcherOrigin.x);
  const allCandidates = generateTargetCandidates(levelState, launcherOrigin);

  // Locate Bullseye piece if placed on the battlefield
  const bullseyePiece = levelState.pieces.find((p) => p.type === 'bullseye_block') ?? null;
  const bullseyeExpired = Boolean(bullseyePiece?.bullseyeExpired);
  const bullseyeCondition = bullseyePiece ? bullseyePiece.condition || 'INTACT' : 'NONE';
  const bullseyeIsBrokenOrLost =
    bullseyeCondition === 'BROKEN' || bullseyeCondition === 'LOST';
  const bullseyeEligibleForOverride =
    bullseyePiece !== null &&
    !bullseyeExpired &&
    !bullseyeIsBrokenOrLost &&
    bullseyePiece.bullseyeActive !== false;

  // Compute ordinary candidate ranking (excluding an active un-expired Bullseye so ordinaryTargetWithoutOverride is exact)
  const ordinaryCandidates = bullseyeEligibleForOverride
    ? allCandidates.filter((c) => c.pieceId !== bullseyePiece.id)
    : allCandidates;
  const scored = scoreCandidates(
    ordinaryCandidates,
    attack.attackerType,
    levelState,
    launcherOrigin,
  );
  const ordinaryTopTargetId = scored.length > 0 ? scored[0].candidate.id : 'fallback_west_pylon';

  // Determine Bullseye inventory status and diagnostic fields
  let bullseyeInventoryStatus = 'IN_RESERVE';
  if (bullseyePiece) {
    if (bullseyeIsBrokenOrLost) {
      bullseyeInventoryStatus = 'DESTROYED';
    } else if (bullseyeExpired) {
      bullseyeInventoryStatus = 'PLACED_EXPIRED';
    } else {
      bullseyeInventoryStatus = 'PLACED_ACTIVE';
    }
  }

  let bullseyeReachable = false;
  let validBullseyeTrajectoryCount = 0;
  let bullseyeOverrideSelected = false;
  let overrideCancellationReason: string | null =
    bullseyePiece?.overrideCancellationReason ?? null;

  if (bullseyePiece) {
    if (bullseyeIsBrokenOrLost && !bullseyeExpired) {
      overrideCancellationReason = 'BULLSEYE_BROKEN_OR_LOST_BEFORE_LAUNCH';
    } else if (bullseyeExpired) {
      overrideCancellationReason =
        overrideCancellationReason ?? 'BULLSEYE_ALREADY_EXPIRED_AFTER_ONE_ATTACK';
    } else if (bullseyeEligibleForOverride) {
      const evalResult = evaluateBullseyeOverride(
        bullseyePiece,
        attack,
        levelState,
        launcherOrigin,
      );
      bullseyeReachable = evalResult.reachable;
      validBullseyeTrajectoryCount = evalResult.validTrajectoryCount;

      if (
        evalResult.reachable &&
        evalResult.selectedCandidate &&
        evalResult.selectedSolution
      ) {
        bullseyeOverrideSelected = true;
        overrideCancellationReason = null;
        const bCand = evalResult.selectedCandidate;
        const bSol = evalResult.selectedSolution;

        const diag: TargetingDiagnostics = {
          currentAttacker: attack.attackerType,
          distancePreset: activePreset,
          distanceToFortressFront: 200 - launcherOrigin.x,
          candidateCount: allCandidates.length,
          reachableCandidateCount: scored.length + 1,
          selectedTargetId: bCand.id,
          selectedTargetType: bCand.type,
          selectedTargetMaterial: bCand.material || 'bullseye_block',
          selectedTargetCondition: bCand.condition || 'INTACT',
          activeWispsNearTarget: bCand.wispsNearCount,
          structuralImportanceScore: 100,
          materialPreferenceScore: 100,
          wispProximityScore: 100,
          reachabilityScore: 100,
          totalTargetScore: 400,
          targetWorldCoordinates: bCand.position,
          launchOriginWorldCoordinates: launcherOrigin,
          deltaToTarget: {
            x: bCand.position.x - launcherOrigin.x,
            y: bCand.position.y - launcherOrigin.y,
          },
          launchVelocity: bSol.launchVelocity,
          launchAngle: bSol.launchAngleDeg,
          launchSpeed: bSol.launchSpeed,
          selectedTrajectoryType: bSol.trajectoryType,
          predictedApex: bSol.predictedApex,
          apexHeightAboveGround: bSol.apexHeightAboveGround,
          predictedFlightDurationSec: bSol.predictedFlightDurationSec,
          expectedFirstObstruction: bSol.expectedFirstObstruction,
          predictedClosestApproach: bSol.closestApproachDist,
          fallbackUsed: false,
          rejectedTrajectoryCount: allCandidates.length - scored.length,
          failureReason: null,
          bullseyePieceId: bullseyePiece.id,
          bullseyeInventoryStatus,
          bullseyeCondition,
          bullseyeActive: true,
          bullseyeTriggered: Boolean(bullseyePiece.bullseyeTriggered),
          bullseyeExpired: false,
          bullseyeWorldCoordinates: { ...bullseyePiece.position },
          bullseyeReachableByCurrentAttacker: true,
          validBullseyeTrajectoryCount,
          bullseyeOverrideSelected: true,
          attackIdConsumingBullseye: bullseyePiece.consumedByAttackId ?? null,
          overrideCancellationReason: null,
          actualFirstImpactObject: null,
          distanceBetweenImpactAndBullseye: null,
          ordinaryTargetWithoutOverride: ordinaryTopTargetId,
        };

        return {
          target: bCand,
          solution: bSol,
          diagnostics: diag,
        };
      } else {
        // Unreachable Bullseye: do not consume or expire, fall back to ordinary scoring
        bullseyeOverrideSelected = false;
        overrideCancellationReason = 'UNREACHABLE_BY_CURRENT_ATTACKER';
      }
    }
  }

  const bullseyeDiagFields = {
    bullseyePieceId: bullseyePiece?.id ?? 'bullseye_tutorial_1',
    bullseyeInventoryStatus,
    bullseyeCondition,
    bullseyeActive: Boolean(
      bullseyePiece && !bullseyeExpired && !bullseyeIsBrokenOrLost && bullseyePiece.bullseyeActive !== false,
    ),
    bullseyeTriggered: Boolean(bullseyePiece?.bullseyeTriggered),
    bullseyeExpired,
    bullseyeWorldCoordinates: bullseyePiece ? { ...bullseyePiece.position } : null,
    bullseyeReachableByCurrentAttacker: bullseyeReachable,
    validBullseyeTrajectoryCount,
    bullseyeOverrideSelected: false,
    attackIdConsumingBullseye: bullseyePiece?.consumedByAttackId ?? null,
    overrideCancellationReason,
    actualFirstImpactObject: null,
    distanceBetweenImpactAndBullseye: null,
    ordinaryTargetWithoutOverride: ordinaryTopTargetId,
  };

  if (scored.length === 0) {
    // If no candidate was solvable, construct fallback targeting
    const fallbackTarget: TargetCandidate = {
      id: 'fallback_west_pylon',
      type: 'fallback',
      position: { x: 200, y: 708 },
      supportingCount: 1,
      wispsNearCount: 2,
      nearestWispDist: 85,
      isExposed: true,
    };

    const speedRange = getSpeedRangeForLauncher(attack.attackerType, launcherOrigin.x);
    const fallbackSolution = solveBallisticTrajectory(
      launcherOrigin,
      fallbackTarget.position,
      speedRange,
      levelState.pieces.filter((p) => p.condition !== 'LOST'),
      'low',
      attack.radius,
    );

    if (fallbackSolution) {
      const diag: TargetingDiagnostics = {
        currentAttacker: attack.attackerType,
        distancePreset: activePreset,
        distanceToFortressFront: 200 - launcherOrigin.x,
        candidateCount: allCandidates.length,
        reachableCandidateCount: 0,
        selectedTargetId: fallbackTarget.id,
        selectedTargetType: fallbackTarget.type,
        selectedTargetMaterial: 'fallback',
        selectedTargetCondition: 'INTACT',
        activeWispsNearTarget: fallbackTarget.wispsNearCount,
        structuralImportanceScore: 0,
        materialPreferenceScore: 0,
        wispProximityScore: 0,
        reachabilityScore: 0,
        totalTargetScore: 0,
        targetWorldCoordinates: fallbackTarget.position,
        launchOriginWorldCoordinates: launcherOrigin,
        deltaToTarget: {
          x: fallbackTarget.position.x - launcherOrigin.x,
          y: fallbackTarget.position.y - launcherOrigin.y,
        },
        launchVelocity: fallbackSolution.launchVelocity,
        launchAngle: fallbackSolution.launchAngleDeg,
        launchSpeed: fallbackSolution.launchSpeed,
        selectedTrajectoryType: fallbackSolution.trajectoryType,
        predictedApex: fallbackSolution.predictedApex,
        apexHeightAboveGround: fallbackSolution.apexHeightAboveGround,
        predictedFlightDurationSec: fallbackSolution.predictedFlightDurationSec,
        expectedFirstObstruction: fallbackSolution.expectedFirstObstruction,
        predictedClosestApproach: fallbackSolution.closestApproachDist,
        fallbackUsed: true,
        rejectedTrajectoryCount: allCandidates.length,
        failureReason: 'No standard candidates reachable; fallback used',
        ...bullseyeDiagFields,
      };
      return { target: fallbackTarget, solution: fallbackSolution, diagnostics: diag };
    }

    return null;
  }

  const selected = scored[0];
  const diag: TargetingDiagnostics = {
    currentAttacker: attack.attackerType,
    distancePreset: activePreset,
    distanceToFortressFront: 200 - launcherOrigin.x,
    candidateCount: allCandidates.length,
    reachableCandidateCount: scored.length,
    selectedTargetId: selected.candidate.id,
    selectedTargetType: selected.candidate.type,
    selectedTargetMaterial: selected.candidate.material || 'none',
    selectedTargetCondition: selected.candidate.condition || 'INTACT',
    activeWispsNearTarget: selected.candidate.wispsNearCount,
    structuralImportanceScore: selected.structuralImportanceScore,
    materialPreferenceScore: selected.materialRoleScore,
    wispProximityScore: selected.wispProximityScore,
    reachabilityScore: selected.reachabilityScore,
    totalTargetScore: selected.totalScore,
    targetWorldCoordinates: selected.candidate.position,
    launchOriginWorldCoordinates: launcherOrigin,
    deltaToTarget: {
      x: selected.candidate.position.x - launcherOrigin.x,
      y: selected.candidate.position.y - launcherOrigin.y,
    },
    launchVelocity: selected.solution.launchVelocity,
    launchAngle: selected.solution.launchAngleDeg,
    launchSpeed: selected.solution.launchSpeed,
    selectedTrajectoryType: selected.solution.trajectoryType,
    predictedApex: selected.solution.predictedApex,
    apexHeightAboveGround: selected.solution.apexHeightAboveGround,
    predictedFlightDurationSec: selected.solution.predictedFlightDurationSec,
    expectedFirstObstruction: selected.solution.expectedFirstObstruction,
    predictedClosestApproach: selected.solution.closestApproachDist,
    fallbackUsed: selected.candidate.type === 'fallback',
    rejectedTrajectoryCount: allCandidates.length - scored.length,
    failureReason: null,
    ...bullseyeDiagFields,
  };

  return {
    target: selected.candidate,
    solution: selected.solution,
    diagnostics: diag,
  };
}
