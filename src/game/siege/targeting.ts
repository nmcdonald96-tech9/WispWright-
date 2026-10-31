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
  const activeWisps = levelState.wisps.filter((w) => !w.isDispersed);
  const launcherPos = launcherOrigin ?? {
    x: DISTANCE_PRESETS.STANDARD.launcherX,
    y: DISTANCE_PRESETS.STANDARD.launcherY,
  };

  // 1. Piece-based candidates
  for (const piece of activePieces) {
    const config = MATERIAL_CONFIGS[piece.type];

    // Count how many pieces this piece directly supports above it
    let supportingCount = 0;
    for (const other of activePieces) {
      if (other.id === piece.id) continue;
      if (
        other.position.y < piece.position.y - 10 &&
        other.position.y > piece.position.y - 120 &&
        Math.abs(other.position.x - piece.position.x) <
          (config.width + MATERIAL_CONFIGS[other.type].width) / 2
      ) {
        supportingCount++;
      }
    }

    // Wisp proximity: count active wisps sheltered or nearby
    let nearestWispDist = Infinity;
    let wispsNearCount = 0;
    for (const wisp of activeWisps) {
      const d = Math.hypot(piece.position.x - wisp.position.x, piece.position.y - wisp.position.y);
      if (d < nearestWispDist) nearestWispDist = d;
      if (d <= 180) wispsNearCount++;
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
    let isShielded = false;
    for (const piece of activePieces) {
      const halfW = MATERIAL_CONFIGS[piece.type].width / 2;
      // Covered from above by a roof or lintel
      const isAbove =
        Math.abs(piece.position.x - wisp.position.x) <= halfW + 4 &&
        piece.position.y < wisp.position.y &&
        piece.position.y > wisp.position.y - 120;

      // Shielded from the west by a defensive column or wall
      const isCoverInFront =
        piece.position.x < wisp.position.x &&
        piece.position.x >= 140 &&
        Math.abs(piece.position.y - wisp.position.y) < 85;

      if (isAbove || isCoverInFront) {
        isShielded = true;
        break;
      }
    }

    if (!isShielded) {
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
    wispsNearCount: 2,
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
      if (simX < 140) {
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
  const speedCandidates = [
    Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vMinTheoretical * 1.025)),
    Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vMinTheoretical * 1.06)),
    Math.max(minAllowedSpeed, Math.min(maxAllowedSpeed, vMinTheoretical * 1.12)),
  ];
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
    const solution = solveBallisticTrajectory(
      launcherOrigin,
      cand.position,
      speedRange,
      activePieces,
      preferredArc,
      projRadius,
    );

    if (!solution || !solution.isValid) {
      continue; // Filter out unreachable candidates
    }

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
        materialRoleScore += 95; // Top tactical priority when an exposed wisp is detected
      } else if (cand.material === 'wood_beam') {
        materialRoleScore += 35;
      } else if (cand.material === 'wood_block') {
        materialRoleScore += 26;
      } else if (cand.material === 'stone_block') {
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
      if (cand.position.y > 740 && cand.material === 'stone_block') {
        materialRoleScore -= 25;
      }
    } else {
      // Heavy attacker prioritizes lower supports, stone foundations, and structural columns
      if (cand.material === 'stone_block') {
        materialRoleScore += 40; // Delights in crushing heavy stone foundations
      } else if (cand.material === 'wood_block') {
        materialRoleScore += 20;
      } else if (cand.material === 'wood_beam') {
        materialRoleScore += 10;
      }

      // Lower load-bearing support preference
      if (cand.position.y >= 740) {
        materialRoleScore += 35;
      } else if (cand.position.y >= 700) {
        materialRoleScore += 20;
      }

      if (cand.attachedAnchorId) {
        materialRoleScore += 35; // Bedrock anchor
      }

      // Front and central foundation supports sheltering wisps
      if (cand.position.x <= 250) {
        materialRoleScore += 30; // Western bedrock pylon directly facing attack
      } else if (cand.position.x <= 450) {
        materialRoleScore += 20; // Central sanctum rune socket
      }

      // Penalize flimsy high lintels
      if (cand.position.y < 670) {
        materialRoleScore -= 25;
      }
    }

    // 3. Wisp Proximity & Protection Score
    let wispProximityScore = 0;
    if (cand.type === 'wisp_threat') {
      wispProximityScore += 70;
    } else {
      // Proximity score: closer to active wisps = higher tactical value
      if (cand.nearestWispDist < 320) {
        wispProximityScore += Math.max(0, 30 * (1 - cand.nearestWispDist / 320));
      }
      wispProximityScore += Math.min(36, cand.wispsNearCount * 10);
    }

    // 4. Structural Importance Score
    let structuralImportanceScore = 0;
    if (cand.supportingCount > 0) {
      structuralImportanceScore += Math.min(50, cand.supportingCount * 25);
    }
    if (cand.attachedAnchorId) {
      structuralImportanceScore += 25; // Directly welded to bedrock anchor
    }

    // Remote irrelevant piece penalty
    if (cand.nearestWispDist > 240 && cand.supportingCount === 0 && !cand.attachedAnchorId) {
      structuralImportanceScore -= 45;
    }

    // 5. Reachability & Approach Quality Score
    let reachabilityScore = 20;
    if (solution.closestApproachDist <= 30) {
      reachabilityScore += Math.max(0, 15 * (1 - solution.closestApproachDist / 30));
    }
    if (solution.trajectoryType === 'low') {
      reachabilityScore += 8; // Slight preference for cleaner direct arc
    }
    if (solution.expectedFirstObstruction === cand.pieceId || cand.type === 'fallback') {
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
  const scored = scoreCandidates(allCandidates, attack.attackerType, levelState, launcherOrigin);

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
  };

  return {
    target: selected.candidate,
    solution: selected.solution,
    diagnostics: diag,
  };
}
