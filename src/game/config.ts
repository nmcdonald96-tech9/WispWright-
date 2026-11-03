/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConstructionBindingSubtype,
  LevelConfiguration,
  LevelState,
  MaterialConfig,
  MaterialPairProfileId,
  MaterialType,
  ResultBandDefinition,
  TimberJointStrengthProfile,
  TimberJointType,
  WispDefinition,
  WispEntity,
} from './types';

export const GEOMETRY_SCHEMA_VERSION = 3;
export const CONSTRUCTION_UNIT = 48; // 1.0 modular construction unit = 48 world px
export const BALANCED_PEAK_MAX_CORRECTION = 24; // 0.5 units (24px) max total correction for balanced peak adjustment
export const LEGACY_BEAM_WIDTH = 120; // Schema v1/v2 beam width before modular 3.0-unit (144px) geometry

/**
 * Centralized Architectural Closure Tolerance Configuration (defined in CONSTRUCTION_UNIT = 48 px).
 * Classifies candidate connections and multi-piece assemblies as EXACT, FORGIVING, AMBIGUOUS, or INVALID.
 */
export const ARCHITECTURAL_CLOSURE_CONFIG = {
  baseUnitPx: CONSTRUCTION_UNIT,
  // 1. Exact position mismatch tolerance (<= 0.08 units = 3.84 px)
  exactPositionToleranceUnits: 0.08,
  exactPositionTolerancePx: 0.08 * CONSTRUCTION_UNIT, // 3.84 px
  // 2. Forgiving position mismatch tolerance (<= 0.55 units = 26.4 px)
  forgivingPositionToleranceUnits: 0.55,
  forgivingPositionTolerancePx: 0.55 * CONSTRUCTION_UNIT, // 26.4 px
  // 3. Exact face/corner seam gap tolerance (<= 0.04 units = 1.92 px)
  exactSeamGapUnits: 0.04,
  exactSeamGapPx: 0.04 * CONSTRUCTION_UNIT, // 1.92 px
  // 4. Forgiving face/corner seam gap tolerance (<= 0.35 units = 16.8 px)
  forgivingSeamGapUnits: 0.35,
  forgivingSeamGapPx: 0.35 * CONSTRUCTION_UNIT, // 16.8 px
  // 5. Exact angle mismatch tolerance (deg)
  exactAngleToleranceDeg: 2.0,
  // 6. Forgiving angle mismatch tolerance (deg)
  forgivingAngleToleranceDeg: 10.0,
  // 7. Maximum balanced positional correction across a multi-piece assembly (0.50 units = 24.0 px)
  maxBalancedCorrectionUnits: 0.50,
  maxBalancedCorrectionPx: 0.50 * CONSTRUCTION_UNIT, // 24.0 px
  // 8. Maximum allowed adjustment of an already committed editable piece (0.35 units = 16.8 px)
  maxCommittedPieceAdjustmentUnits: 0.35,
  maxCommittedPieceAdjustmentPx: 0.35 * CONSTRUCTION_UNIT, // 16.8 px
  // 9. Fine adjustment offset range while locked to a candidate (0.18 units = 8.64 px)
  fineAdjustCandidateOffsetUnits: 0.18,
  fineAdjustCandidateOffsetPx: 0.18 * CONSTRUCTION_UNIT, // 8.64 px
  // 10. Candidate competition score margin below which two rival candidates are AMBIGUOUS
  ambiguousScoreMargin: 4.5,
};

export const TIMBER_JOINT_CONFIG = {
  endpointContactTolerance: 1.5, // Flush socket contact tolerance (px)
  maxAngledSocketClearance: 18.5, // Max outward socket clearance for angled/corner/peaked roof joints (px)
  minFoldedBodyCosine: 0.88, // Rejects beams folded back onto each other (dot > 0.88)
  sideJoinNormalDotLimit: -0.25, // T-joint normal alignment requirement
  roofPeakMinSlopeDeg: 20, // Minimum rafter incline angle from horizontal (deg) for Roof Peak (supports 25-65 deg plus tolerance)
  roofPeakMaxSlopeDeg: 70, // Maximum rafter incline angle from horizontal (deg) for Roof Peak
  lCornerMinAngleDeg: 68, // Minimum relative angle (deg) between two beams to recognize an L-corner
  lCornerMaxAngleDeg: 112, // Maximum relative angle (deg) between two beams to recognize an L-corner
  candidateLockHoldRadius: 34, // Hysteresis hold radius (px) before releasing locked snap candidate
  balancedPeakMaxCorrection: BALANCED_PEAK_MAX_CORRECTION,
};

export const TIMBER_JOINT_PROFILES: Record<string, TimberJointStrengthProfile> = {
  TIMBER_SPLICE: {
    profileId: 'TIMBER_SPLICE',
    tensileStrength: 10.5, // Max axial stretch (px) before immediate break
    shearStrength: 10.5, // Max shear displacement (px) before immediate break
    bendingStrength: 0.34, // ~19.5 degrees angular deflection limit before immediate break
    torqueLimit: 0.0038, // Moderate angular restoring impulse (sags under wide unsupported span)
    angularCompliance: 0.14, // Angular spring stiffness factor
    linearCompliance: 0.90, // Matter.js constraint stiffness
    damping: 0.22,
    breakImpulseThreshold: 14.5,
    accumulatedStressThreshold: 18.0,
    strainedStressRatio: 0.38,
    strainThreshold: 6.84,
    breakThreshold: 18.0,
  },
  TIMBER_FACE: {
    profileId: 'TIMBER_FACE',
    tensileStrength: 11.5,
    shearStrength: 11.5,
    bendingStrength: 0.42, // Supports angled rafters and framed bays against wooden block/beam faces
    torqueLimit: 0.0044,
    angularCompliance: 0.16,
    linearCompliance: 0.92,
    damping: 0.24,
    breakImpulseThreshold: 16.0,
    accumulatedStressThreshold: 21.0,
    strainedStressRatio: 0.38,
    strainThreshold: 7.98,
    breakThreshold: 21.0,
  },
  ROOF_PEAK: {
    profileId: 'ROOF_PEAK',
    tensileStrength: 12.5, // Before: 11.0; refined so supported roof apex resists ordinary gravity without breaking
    shearStrength: 13.0, // Before: 12.0; holds shared apex seam cleanly under normal self-weight
    bendingStrength: 0.50, // Before: 0.48; holds apex angle well when lower ends are supported, yields if unsupported
    torqueLimit: 0.0056, // Before: 0.0052; strong apex compression lock when supported, reduced dynamically if lower supports spread/absent
    angularCompliance: 0.20, // Before: 0.18
    linearCompliance: 0.95, // Before: 0.93
    damping: 0.26, // Before: 0.25
    breakImpulseThreshold: 16.5, // Preserved projectile/heavy debris breakability
    accumulatedStressThreshold: 25.0, // Before: 24.0
    strainedStressRatio: 0.38,
    strainThreshold: 9.50,
    breakThreshold: 25.0,
  },
  DIAGONAL_BRACE: {
    profileId: 'DIAGONAL_BRACE',
    tensileStrength: 13.5, // High axial/shear bracing resistance against frame racking
    shearStrength: 13.5,
    bendingStrength: 0.46,
    torqueLimit: 0.0050,
    angularCompliance: 0.18,
    linearCompliance: 0.94,
    damping: 0.26,
    breakImpulseThreshold: 17.5,
    accumulatedStressThreshold: 25.0,
    strainedStressRatio: 0.40,
    strainThreshold: 10.0,
    breakThreshold: 25.0,
  },
  TIMBER_CORNER: {
    profileId: 'TIMBER_CORNER',
    tensileStrength: 12.0, // Strong L-corner framing joint; still breakable under heavy impact or racking
    shearStrength: 12.0,
    bendingStrength: 0.44,
    torqueLimit: 0.0046,
    angularCompliance: 0.17,
    linearCompliance: 0.93,
    damping: 0.24,
    breakImpulseThreshold: 16.5,
    accumulatedStressThreshold: 22.0,
    strainedStressRatio: 0.38,
    strainThreshold: 8.36,
    breakThreshold: 22.0,
  },
  RAFTER_CORNER_SEAT: {
    profileId: 'RAFTER_CORNER_SEAT',
    tensileStrength: 13.5, // Breakable block-corner rafter seat; resists roof spreading and self-weight sag
    shearStrength: 14.0,
    bendingStrength: 0.52,
    torqueLimit: 0.012,
    angularCompliance: 0.26,
    linearCompliance: 0.96,
    damping: 0.28,
    breakImpulseThreshold: 16.5, // Preserved projectile/heavy debris breakability
    accumulatedStressThreshold: 24.5,
    strainedStressRatio: 0.38,
    strainThreshold: 9.31,
    breakThreshold: 24.5,
  },
  TIMBER_T_JOINT: {
    profileId: 'TIMBER_T_JOINT',
    tensileStrength: 11.0,
    shearStrength: 10.5,
    bendingStrength: 0.38,
    torqueLimit: 0.0042,
    angularCompliance: 0.15,
    linearCompliance: 0.91,
    damping: 0.23,
    breakImpulseThreshold: 15.0,
    accumulatedStressThreshold: 19.5,
    strainedStressRatio: 0.38,
    strainThreshold: 7.41,
    breakThreshold: 19.5,
  },
  FACE_BINDING: {
    profileId: 'FACE_BINDING',
    tensileStrength: 13.0,
    shearStrength: 13.5,
    bendingStrength: 0.48,
    torqueLimit: 0.011,
    angularCompliance: 0.24,
    linearCompliance: 0.95,
    damping: 0.26,
    breakImpulseThreshold: 16.5,
    accumulatedStressThreshold: 23.0,
    strainedStressRatio: 0.38,
    strainThreshold: 8.74,
    breakThreshold: 23.0,
  },
  CORNER_BINDING: {
    profileId: 'CORNER_BINDING',
    tensileStrength: 13.5,
    shearStrength: 14.0,
    bendingStrength: 0.52,
    torqueLimit: 0.012,
    angularCompliance: 0.26,
    linearCompliance: 0.96,
    damping: 0.28,
    breakImpulseThreshold: 16.5,
    accumulatedStressThreshold: 24.5,
    strainedStressRatio: 0.38,
    strainThreshold: 9.31,
    breakThreshold: 24.5,
  },
  BLOCK_BINDING: {
    profileId: 'BLOCK_BINDING',
    tensileStrength: 15.0,
    shearStrength: 15.5,
    bendingStrength: 0.42,
    torqueLimit: 0.015,
    angularCompliance: 0.30,
    linearCompliance: 0.97,
    damping: 0.30,
    breakImpulseThreshold: 19.5,
    accumulatedStressThreshold: 28.0,
    strainedStressRatio: 0.40,
    strainThreshold: 11.2,
    breakThreshold: 28.0,
  },
  WOOD_WOOD: {
    profileId: 'WOOD_WOOD',
    tensileStrength: 11.5,
    shearStrength: 11.5,
    bendingStrength: 0.42,
    torqueLimit: 0.0065,
    angularCompliance: 0.18,
    linearCompliance: 0.93,
    damping: 0.24,
    breakImpulseThreshold: 15.5,
    accumulatedStressThreshold: 20.5,
    strainedStressRatio: 0.38,
    strainThreshold: 7.79,
    breakThreshold: 20.5,
  },
  WOOD_STONE: {
    profileId: 'WOOD_STONE',
    tensileStrength: 13.5,
    shearStrength: 14.0,
    bendingStrength: 0.52,
    torqueLimit: 0.014,
    angularCompliance: 0.28,
    linearCompliance: 0.96,
    damping: 0.28,
    breakImpulseThreshold: 17.0,
    accumulatedStressThreshold: 25.0,
    strainedStressRatio: 0.38,
    strainThreshold: 9.5,
    breakThreshold: 25.0,
  },
  STONE_STONE: {
    profileId: 'STONE_STONE',
    tensileStrength: 15.0,
    shearStrength: 15.5,
    bendingStrength: 0.42,
    torqueLimit: 0.015,
    angularCompliance: 0.30,
    linearCompliance: 0.97,
    damping: 0.30,
    breakImpulseThreshold: 19.5,
    accumulatedStressThreshold: 28.0,
    strainedStressRatio: 0.40,
    strainThreshold: 11.2,
    breakThreshold: 28.0,
  },
  WOOD_ENVIRONMENT: {
    profileId: 'WOOD_ENVIRONMENT',
    tensileStrength: 15.0,
    shearStrength: 15.5,
    bendingStrength: 0.56,
    torqueLimit: 0.015,
    angularCompliance: 0.30,
    linearCompliance: 0.97,
    damping: 0.29,
    breakImpulseThreshold: 19.0,
    accumulatedStressThreshold: 28.0,
    strainedStressRatio: 0.40,
    strainThreshold: 11.2,
    breakThreshold: 28.0,
  },
  STONE_ENVIRONMENT: {
    profileId: 'STONE_ENVIRONMENT',
    tensileStrength: 18.0,
    shearStrength: 18.5,
    bendingStrength: 0.48,
    torqueLimit: 0.018,
    angularCompliance: 0.34,
    linearCompliance: 0.98,
    damping: 0.32,
    breakImpulseThreshold: 23.0,
    accumulatedStressThreshold: 34.0,
    strainedStressRatio: 0.42,
    strainThreshold: 14.28,
    breakThreshold: 34.0,
  },
  ROOF_PEAK_WOOD: {
    profileId: 'ROOF_PEAK_WOOD',
    tensileStrength: 12.5,
    shearStrength: 13.0,
    bendingStrength: 0.50,
    torqueLimit: 0.0056,
    angularCompliance: 0.20,
    linearCompliance: 0.95,
    damping: 0.26,
    breakImpulseThreshold: 16.5,
    accumulatedStressThreshold: 25.0,
    strainedStressRatio: 0.38,
    strainThreshold: 9.5,
    breakThreshold: 25.0,
  },
  ENVIRONMENTAL_ANCHOR: {
    profileId: 'ENVIRONMENTAL_ANCHOR',
    tensileStrength: 24.0,
    shearStrength: 24.0,
    bendingStrength: 0.75,
    torqueLimit: 0.012,
    angularCompliance: 0.35,
    linearCompliance: 0.98,
    damping: 0.30,
    breakImpulseThreshold: 32.0,
    accumulatedStressThreshold: 45.0,
    strainedStressRatio: 0.45,
    strainThreshold: 20.25,
    breakThreshold: 45.0,
  },
  standard_timber_joint: {
    profileId: 'standard_timber_joint',
    tensileStrength: 10.5, // Max axial stretch (px) before immediate break
    shearStrength: 10.5, // Max shear displacement (px) before immediate break
    bendingStrength: 0.34, // ~19.5 degrees angular deflection limit before immediate break
    torqueLimit: 0.0038, // Max angular restoring impulse per step (rad/step)
    angularCompliance: 0.14, // Angular spring stiffness factor
    linearCompliance: 0.90, // Matter.js constraint stiffness (high enough to hold span, compliant enough to flex)
    damping: 0.22, // Damping for constraint & angular spring-damper
    breakImpulseThreshold: 14.5, // Direct projectile/debris impact impulse threshold to snap joint
    accumulatedStressThreshold: 18.0, // Continuous overload stress budget before snapping
    strainedStressRatio: 0.38, // Transitions to STRAINED at 38% of break stress or 35% of bending limit
    strainThreshold: 6.84,
    breakThreshold: 18.0,
  },
};

export const MATERIAL_PAIR_PROFILES: Record<MaterialPairProfileId, TimberJointStrengthProfile> = {
  WOOD_WOOD: TIMBER_JOINT_PROFILES.WOOD_WOOD,
  WOOD_STONE: TIMBER_JOINT_PROFILES.WOOD_STONE,
  STONE_STONE: TIMBER_JOINT_PROFILES.STONE_STONE,
  WOOD_ENVIRONMENT: TIMBER_JOINT_PROFILES.WOOD_ENVIRONMENT,
  STONE_ENVIRONMENT: TIMBER_JOINT_PROFILES.STONE_ENVIRONMENT,
  ROOF_PEAK_WOOD: TIMBER_JOINT_PROFILES.ROOF_PEAK_WOOD,
  ENVIRONMENTAL_ANCHOR: TIMBER_JOINT_PROFILES.ENVIRONMENTAL_ANCHOR,
};

export function isStoneMaterial(type: MaterialType): boolean {
  return type === 'stone_block' || type === 'bullseye_block';
}

/**
 * Resolves the canonical order-independent MaterialPairProfileId for any two connected pieces.
 * Guarantees WOOD_STONE and STONE_WOOD resolve to the exact same canonical profile.
 * Supports both (matA, isPrebuiltA, matB, isPrebuiltB, jointType) and (matA, matB, isPrebuiltA, isPrebuiltB, jointType).
 */
export function resolveMaterialPairProfileId(
  matA: MaterialType,
  arg2: boolean | MaterialType,
  arg3: MaterialType | boolean,
  isPrebuiltB = false,
  jointType?: TimberJointType | string | null,
): MaterialPairProfileId {
  const matB: MaterialType = typeof arg2 === 'string' ? arg2 : (arg3 as MaterialType);
  const isPrebuiltA: boolean = typeof arg2 === 'boolean' ? arg2 : Boolean(arg3);

  if (jointType === 'ENVIRONMENTAL_ANCHOR') {
    return 'ENVIRONMENTAL_ANCHOR';
  }
  if (jointType === 'ROOF_PEAK' && !isStoneMaterial(matA) && !isStoneMaterial(matB)) {
    return 'ROOF_PEAK_WOOD';
  }

  const stoneA = isStoneMaterial(matA);
  const stoneB = isStoneMaterial(matB);
  const envInvolved = Boolean(isPrebuiltA || isPrebuiltB);

  if (envInvolved) {
    if (stoneA && stoneB) {
      return 'STONE_ENVIRONMENT';
    }
    return 'WOOD_ENVIRONMENT';
  }

  if (stoneA && stoneB) {
    return 'STONE_STONE';
  }
  if (stoneA || stoneB) {
    return 'WOOD_STONE';
  }
  return 'WOOD_WOOD';
}

function isMaterialType(val: unknown): val is MaterialType {
  return (
    val === 'wood_beam' ||
    val === 'wood_block' ||
    val === 'stone_block' ||
    val === 'bullseye_block'
  );
}

/**
 * Resolves the effective strength/compliance profile ID for a binding.
 * Supports:
 * - (matA, isPrebuiltA, matB, isPrebuiltB, jointType)
 * - (jointType, matA, matB, isPrebuiltA, isPrebuiltB)
 * - (jointType, materialPairKey)
 */
export function resolveBindingStrengthProfile(
  arg1: MaterialType | TimberJointType,
  arg2: boolean | MaterialType | MaterialPairProfileId,
  arg3?: MaterialType,
  arg4?: boolean,
  arg5?: TimberJointType | boolean,
): string {
  let pairId: MaterialPairProfileId;
  let jointType: TimberJointType;

  if (isMaterialType(arg1)) {
    jointType = (arg5 as TimberJointType) ?? 'TIMBER_FACE';
    pairId = resolveMaterialPairProfileId(
      arg1,
      arg2 as boolean | MaterialType,
      arg3 as MaterialType | boolean,
      Boolean(arg4),
      jointType,
    );
  } else if (isMaterialType(arg2) && isMaterialType(arg3)) {
    jointType = arg1;
    pairId = resolveMaterialPairProfileId(
      arg2,
      Boolean(arg4),
      arg3,
      Boolean(arg5),
      jointType,
    );
  } else {
    jointType = arg1;
    pairId = (arg2 as MaterialPairProfileId) ?? 'WOOD_WOOD';
  }

  if (
    pairId === 'WOOD_STONE' ||
    pairId === 'STONE_STONE' ||
    pairId === 'WOOD_ENVIRONMENT' ||
    pairId === 'STONE_ENVIRONMENT' ||
    pairId === 'ENVIRONMENTAL_ANCHOR'
  ) {
    return pairId;
  }
  if (jointType === 'BLOCK_BINDING') {
    return 'WOOD_WOOD';
  }
  return TIMBER_JOINT_PROFILES[jointType] ? jointType : 'WOOD_WOOD';
}

export function resolveConnectionSubtype(
  jointType: TimberJointType,
  matAOrKindA?: MaterialType | string,
  matBOrKindB?: MaterialType | string,
  _kindA?: string,
  _kindB?: string,
): ConstructionBindingSubtype {
  switch (jointType) {
    case 'ROOF_PEAK':
      return 'ROOF_PEAK';
    case 'DIAGONAL_BRACE':
      return 'DIAGONAL_BRACE';
    case 'RAFTER_CORNER_SEAT':
      return 'RAFTER_CORNER_SEAT';
    case 'TIMBER_CORNER':
    case 'CORNER_BINDING':
      return 'CORNER_BINDING';
    case 'BLOCK_BINDING':
      return 'BLOCK_BINDING';
    case 'TIMBER_T_JOINT':
    case 'T_JOINT':
    case 'BEAM_END_TO_BEAM_SIDE':
      return 'T_JOINT';
    case 'TIMBER_FACE':
    case 'FACE_BINDING':
      return isMaterialType(matAOrKindA) &&
        isMaterialType(matBOrKindB) &&
        matAOrKindA !== 'wood_beam' &&
        matBOrKindB !== 'wood_beam'
        ? 'BLOCK_BINDING'
        : 'FACE_BINDING';
    case 'ENVIRONMENTAL_ANCHOR':
      return 'ENVIRONMENTAL_ANCHOR';
    default:
      return 'TIMBER_SPLICE';
  }
}

/**
 * Centralized Piece Definition Authority.
 * Modular System (Option B — 3:1 Beam-to-Block Length Ratio):
 * - Base construction unit: CONSTRUCTION_UNIT = 48 px (1.0 unit)
 * - Standard blocks (wood_block, stone_block, bullseye_block): 1.0 × 1.0 units (48 × 48 px)
 * - Timber Beam (wood_beam): 3.0 × 0.5 units (144 × 24 px; half-thickness = 0.25 units = 12 px)
 *   3 blocks side by side = 1 Timber Beam length (144 px); 2 stacked beams = 1 block height (48 px).
 * Visual bounds, collider bounds, and snap/face/corner geometry all derive from this single definition.
 */
export const PIECE_DEFINITIONS: Record<MaterialType, MaterialConfig> = {
  wood_beam: {
    type: 'wood_beam',
    name: 'Timber Beam',
    widthUnits: 3.0,
    heightUnits: 0.5,
    width: 3.0 * CONSTRUCTION_UNIT, // 144 px
    height: 0.5 * CONSTRUCTION_UNIT, // 24 px (half-height = 0.25 units = 12 px)
    colliderWidth: 3.0 * CONSTRUCTION_UNIT,
    colliderHeight: 0.5 * CONSTRUCTION_UNIT,
    visualWidth: 3.0 * CONSTRUCTION_UNIT,
    visualHeight: 0.5 * CONSTRUCTION_UNIT,
    localOrigin: { x: 0, y: 0 },
    renderingScale: 1.0,
    jointCapable: true,
    density: 0.0012, // Lightweight wood
    friction: 0.85,
    restitution: 0.02, // Minimal bounce
    color: '#b4743c',
    borderColor: '#78461e',
    description: 'Long wooden beam (3.0 × 0.5 units). Lightweight and easy to reposition. Ideal for spans, rafters, and frames.',
  },
  wood_block: {
    type: 'wood_block',
    name: 'Wood Block',
    widthUnits: 1.0,
    heightUnits: 1.0,
    width: 1.0 * CONSTRUCTION_UNIT, // 48 px
    height: 1.0 * CONSTRUCTION_UNIT, // 48 px
    colliderWidth: 1.0 * CONSTRUCTION_UNIT,
    colliderHeight: 1.0 * CONSTRUCTION_UNIT,
    visualWidth: 1.0 * CONSTRUCTION_UNIT,
    visualHeight: 1.0 * CONSTRUCTION_UNIT,
    localOrigin: { x: 0, y: 0 },
    renderingScale: 1.0,
    jointCapable: true,
    density: 0.0012,
    friction: 0.88,
    restitution: 0.02,
    color: '#9c602c',
    borderColor: '#603512',
    description: 'Square wooden block (1.0 × 1.0 units). Versatile spacer, pillar base, or rafter corner seat.',
  },
  stone_block: {
    type: 'stone_block',
    name: 'Cut Stone Block',
    widthUnits: 1.0,
    heightUnits: 1.0,
    width: 1.0 * CONSTRUCTION_UNIT, // 48 px
    height: 1.0 * CONSTRUCTION_UNIT, // 48 px
    colliderWidth: 1.0 * CONSTRUCTION_UNIT,
    colliderHeight: 1.0 * CONSTRUCTION_UNIT,
    visualWidth: 1.0 * CONSTRUCTION_UNIT,
    visualHeight: 1.0 * CONSTRUCTION_UNIT,
    localOrigin: { x: 0, y: 0 },
    renderingScale: 1.0,
    jointCapable: true, // Universal breakable construction binding capable (faces & corners)
    density: 0.0068, // ~5.5x mass of wood
    friction: 0.98,
    restitution: 0.0, // Zero restitution for heavy stone
    color: '#64748b',
    borderColor: '#334155',
    description: 'Heavy quarried stone (1.0 × 1.0 units). Extremely stable under compression, but will crush fragile wood.',
  },
  bullseye_block: {
    type: 'bullseye_block',
    name: 'Bullseye Block',
    widthUnits: 1.0,
    heightUnits: 1.0,
    width: 1.0 * CONSTRUCTION_UNIT, // 48 px
    height: 1.0 * CONSTRUCTION_UNIT, // 48 px
    colliderWidth: 1.0 * CONSTRUCTION_UNIT,
    colliderHeight: 1.0 * CONSTRUCTION_UNIT,
    visualWidth: 1.0 * CONSTRUCTION_UNIT,
    visualHeight: 1.0 * CONSTRUCTION_UNIT,
    localOrigin: { x: 0, y: 0 },
    renderingScale: 1.0,
    jointCapable: true,
    density: 0.0068, // Exact stone_block density (~5.5x mass of wood)
    friction: 0.98, // Exact stone_block friction
    restitution: 0.0, // Exact stone_block zero restitution
    color: '#7c2d12',
    borderColor: '#f59e0b',
    description: 'Taunt Stone Block (1.0 × 1.0 units). The next eligible attacker will aim for it if a valid trajectory exists.',
  },
};

export const MATERIAL_CONFIGS: Record<MaterialType, MaterialConfig> = PIECE_DEFINITIONS;

export const WORLD_CONFIG = {
  width: 800,
  height: 1000,
  minX: -850,
  maxX: 850,
  groundY: 780,
  lossBoundaryY: 960,
  buildZone: {
    minX: 120,
    maxX: 680,
    minY: 260,
    maxY: 780,
  },
  snapDistance: 26, // Distance in world units to trigger magnetic snap
  anchorSnapDistance: 32, // Distance to snap to ground/ruin anchors
  gravity: 1.0, // Standard downward gravity in Matter.js
};

/**
 * Full 5-Wisp Character Roster Definitions.
 * All five wisps are preserved in the codebase so no character data or artwork is lost,
 * and future levels or developer overrides (1..5 wisps) can select any subset.
 */
export const WISP_ROSTER_DEFINITIONS: WispDefinition[] = [
  {
    id: 'wisp_ignis',
    name: 'Ignis',
    title: 'Emberling',
    element: 'ignis',
    personality: 'Brave & Confident',
    tendency: 'BRAVE',
    isHero: true,
    silhouetteType: 'FLAME_CROWN',
    crestShape: 'CROWN_CREST',
    armorShape: 'EMBER_MANTLE',
    idleSpeed: 1.15,
    idlePhaseOffset: 0.0,
    position: { x: 280, y: 740 },
    defaultPosition: { x: 280, y: 740 },
    radius: 18,
    color: '#f97316',
    glowColor: '#fdba74',
    expression: 'curious',
  } as WispDefinition & { position?: { x: number; y: number } },
  {
    id: 'wisp_zephyr',
    name: 'Zephyr',
    title: 'Breeze Sprite',
    element: 'aer',
    personality: 'Curious & Easily Distracted',
    tendency: 'EASILY_DISTRACTED',
    isHero: false,
    silhouetteType: 'BREEZE_SWIRL',
    crestShape: 'FEATHER_PLUME',
    armorShape: 'ZEPHYR_RIBBON',
    idleSpeed: 1.35,
    idlePhaseOffset: 1.25,
    defaultPosition: { x: 340, y: 730 },
    radius: 17,
    color: '#06b6d4',
    glowColor: '#67e8f9',
    expression: 'happy',
  },
  {
    id: 'wisp_marinus',
    name: 'Marinus',
    title: 'Dewdrop',
    element: 'aqua',
    personality: 'Nervous & Cautious',
    tendency: 'NERVOUS',
    isHero: false,
    silhouetteType: 'DROPLET_HALO',
    crestShape: 'TIDAL_FIN',
    armorShape: 'RIPPLE_CAPE',
    idleSpeed: 0.92,
    idlePhaseOffset: 2.5,
    defaultPosition: { x: 460, y: 730 },
    radius: 17,
    color: '#3b82f6',
    glowColor: '#93c5fd',
    expression: 'nervous',
  },
  {
    id: 'wisp_terran',
    name: 'Terran',
    title: 'Sproutling',
    element: 'terra',
    personality: 'Serious & Stoic',
    tendency: 'SERIOUS',
    isHero: false,
    silhouetteType: 'STONE_CORE',
    crestShape: 'BASALT_HORNS',
    armorShape: 'GRANITE_GUARD',
    idleSpeed: 0.78,
    idlePhaseOffset: 3.75,
    defaultPosition: { x: 400, y: 704 },
    radius: 20,
    color: '#10b981',
    glowColor: '#6ee7b7',
    expression: 'calm',
  },
  {
    id: 'wisp_aetheris',
    name: 'Aetheris',
    title: 'Star Vapor',
    element: 'aether',
    personality: 'Observant & Dreamy',
    tendency: 'CURIOUS',
    isHero: false,
    silhouetteType: 'STAR_PRISM',
    crestShape: 'STAR_DIADEM',
    armorShape: 'AETHER_RING',
    idleSpeed: 1.05,
    idlePhaseOffset: 5.0,
    defaultPosition: { x: 520, y: 740 },
    radius: 19,
    color: '#a855f7',
    glowColor: '#d8b4fe',
    expression: 'happy',
  },
];

/**
 * Deterministic selection order when building a wisp list of count N (1..5):
 * First 3 are the Level 1 trio:
 *   1. wisp_ignis (Brave / Confident)
 *   2. wisp_zephyr (Curious / Easily Distracted)
 *   3. wisp_marinus (Nervous / Cautious)
 * Followed by:
 *   4. wisp_terran (Serious / Stoic)
 *   5. wisp_aetheris (Observant / Dreamy)
 */
export const LEVEL_1_SELECTED_WISP_IDS: string[] = [
  'wisp_ignis',
  'wisp_zephyr',
  'wisp_marinus',
];

export const WISP_SELECTION_ORDER: string[] = [
  'wisp_ignis',
  'wisp_zephyr',
  'wisp_marinus',
  'wisp_terran',
  'wisp_aetheris',
];

export function getSelectedWispIdsForCount(count: number): string[] {
  const clamped = Math.max(1, Math.min(WISP_SELECTION_ORDER.length, Math.round(count)));
  return WISP_SELECTION_ORDER.slice(0, clamped);
}

export function getMinimumStableWispsForCompletion(requiredWispCount: number): number {
  const n = Math.max(1, Math.round(requiredWispCount));
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 2;
  return 3; // For 4 or 5 wisps, 3+ is Successful Defense
}

export function buildResultBandsForWispCount(requiredWispCount: number): ResultBandDefinition[] {
  const n = Math.max(1, Math.round(requiredWispCount));
  if (n === 1) {
    return [
      { minStableWisps: 1, maxStableWisps: 1, classification: 'Exceptional Defense', completionAwarded: true },
      { minStableWisps: 0, maxStableWisps: 0, classification: 'Defense Failed', completionAwarded: false },
    ];
  }
  if (n === 2) {
    return [
      { minStableWisps: 2, maxStableWisps: 2, classification: 'Exceptional Defense', completionAwarded: true },
      { minStableWisps: 1, maxStableWisps: 1, classification: 'Narrow Survival', completionAwarded: false },
      { minStableWisps: 0, maxStableWisps: 0, classification: 'Defense Failed', completionAwarded: false },
    ];
  }
  if (n === 3) {
    return [
      { minStableWisps: 3, maxStableWisps: 3, classification: 'Exceptional Defense', completionAwarded: true },
      { minStableWisps: 2, maxStableWisps: 2, classification: 'Successful Defense', completionAwarded: true },
      { minStableWisps: 1, maxStableWisps: 1, classification: 'Narrow Survival', completionAwarded: false },
      { minStableWisps: 0, maxStableWisps: 0, classification: 'Defense Failed', completionAwarded: false },
    ];
  }
  if (n === 4) {
    return [
      { minStableWisps: 4, maxStableWisps: 4, classification: 'Exceptional Defense', completionAwarded: true },
      { minStableWisps: 3, maxStableWisps: 3, classification: 'Successful Defense', completionAwarded: true },
      { minStableWisps: 1, maxStableWisps: 2, classification: 'Narrow Survival', completionAwarded: false },
      { minStableWisps: 0, maxStableWisps: 0, classification: 'Defense Failed', completionAwarded: false },
    ];
  }
  // n >= 5
  return [
    { minStableWisps: n, maxStableWisps: n, classification: 'Exceptional Defense', completionAwarded: true },
    { minStableWisps: n - 1, maxStableWisps: n - 1, classification: 'Strong Defense', completionAwarded: true },
    { minStableWisps: 3, maxStableWisps: Math.max(3, n - 2), classification: 'Successful Defense', completionAwarded: true },
    { minStableWisps: 1, maxStableWisps: 2, classification: 'Narrow Survival', completionAwarded: false },
    { minStableWisps: 0, maxStableWisps: 0, classification: 'Defense Failed', completionAwarded: false },
  ];
}

export function formatWispCountWord(count: number, capitalize = false): string {
  const words: Record<number, string> = {
    0: 'zero',
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
  };
  const base = words[count] ?? String(count);
  return capitalize ? base.charAt(0).toUpperCase() + base.slice(1) : base;
}

export function createWispEntityFromDefinition(def: WispDefinition): WispEntity {
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    element: def.element,
    personality: def.personality,
    tendency: def.tendency,
    isHero: def.isHero,
    silhouetteType: def.silhouetteType,
    crestShape: def.crestShape,
    armorShape: def.armorShape,
    idleSpeed: def.idleSpeed,
    idlePhaseOffset: def.idlePhaseOffset,
    position: { ...def.defaultPosition },
    defaultPosition: { ...def.defaultPosition },
    placed: false,
    isValid: true,
    isDispersed: false,
    radius: def.radius,
    color: def.color,
    glowColor: def.glowColor,
    expression: def.expression,
  };
}

export function createWispsForConfiguration(selectedIds: string[]): WispEntity[] {
  const uniqueIds = Array.from(new Set(selectedIds));
  const result: WispEntity[] = [];
  for (const id of uniqueIds) {
    const def = WISP_ROSTER_DEFINITIONS.find((d) => d.id === id);
    if (def) {
      result.push(createWispEntityFromDefinition(def));
    }
  }
  return result;
}

export const LEVEL_1_CONFIG: LevelConfiguration = {
  levelId: 'alchemical_sanctuary_01',
  requiredWispCount: 3,
  availableWispDefinitions: WISP_ROSTER_DEFINITIONS,
  selectedWispIds: LEVEL_1_SELECTED_WISP_IDS,
  minimumStableWispsForCompletion: 2,
  resultBands: buildResultBandsForWispCount(3),
  attackDefinitions: ['attack_1_standard', 'attack_2_heavy'],
  reinforcementSchedule: {
    afterAttackIndex: 0,
    timerSec: 25,
    guaranteedDelivery: {
      wood_beam: 1,
      stone_block: 1,
    },
  },
  startingInventory: {
    wood_beam: 4,
    wood_block: 4,
    stone_block: 3,
    bullseye_block: 1,
  },
  prebuiltStructureId: 'sanctuary_columns_and_altar_v1',
  tutorialConfiguration: {
    requiresBeam: true,
    requiresBlock: true,
    requiresSupportedConnection: true,
    requiresStabilityTest: true,
  },
};

export const INITIAL_LEVEL_STATE: LevelState = {
  schemaVersion: 2,
  geometrySchemaVersion: GEOMETRY_SCHEMA_VERSION,
  levelId: LEVEL_1_CONFIG.levelId,
  requiredWispCount: LEVEL_1_CONFIG.requiredWispCount,
  activeWispIds: [...LEVEL_1_CONFIG.selectedWispIds],
  minimumStableWispsForCompletion: LEVEL_1_CONFIG.minimumStableWispsForCompletion,
  resultBands: LEVEL_1_CONFIG.resultBands.map((b) => ({ ...b })),
  developerWispCountOverride: null,
  worldBounds: {
    minX: -850,
    maxX: 850,
    minY: 0,
    maxY: 1000,
  },
  lossBoundaryY: 960,
  anchors: [
    {
      id: 'anchor_left',
      name: 'Western Bedrock Pylon',
      position: { x: 200, y: 780 },
      radius: 24,
      type: 'bedrock',
    },
    {
      id: 'anchor_center',
      name: 'Sanctum Rune Socket',
      position: { x: 400, y: 780 },
      radius: 26,
      type: 'ruin',
    },
    {
      id: 'anchor_right',
      name: 'Eastern Bedrock Pylon',
      position: { x: 600, y: 780 },
      radius: 24,
      type: 'bedrock',
    },
  ],
  wisps: createWispsForConfiguration(LEVEL_1_CONFIG.selectedWispIds),
  // Starting prebuilt defensive framework
  pieces: [
    // Left anchor stone base (x = 200, y = 756 & 708 -> 1.0u × 2.0u column)
    {
      id: 'prebuilt_stone_left_1',
      type: 'stone_block',
      position: { x: 200, y: 756 },
      rotation: 0,
      isPrebuilt: true,
      attachedAnchorId: 'anchor_left',
    },
    {
      id: 'prebuilt_stone_left_2',
      type: 'stone_block',
      position: { x: 200, y: 708 },
      rotation: 0,
      isPrebuilt: true,
    },
    // Right anchor stone base (x = 600, y = 756 & 708 -> 1.0u × 2.0u column)
    {
      id: 'prebuilt_stone_right_1',
      type: 'stone_block',
      position: { x: 600, y: 756 },
      rotation: 0,
      isPrebuilt: true,
      attachedAnchorId: 'anchor_right',
    },
    {
      id: 'prebuilt_stone_right_2',
      type: 'stone_block',
      position: { x: 600, y: 708 },
      rotation: 0,
      isPrebuilt: true,
    },
    // Center bedrock stone riser (x = 400, y = 756 -> 1.0u × 1.0u altar)
    {
      id: 'prebuilt_stone_center',
      type: 'stone_block',
      position: { x: 400, y: 756 },
      rotation: 0,
      isPrebuilt: true,
      attachedAnchorId: 'anchor_center',
    },
  ],
  joints: [],
  inventory: {
    wood_beam: 4,
    wood_block: 4,
    stone_block: 3,
    bullseye_block: 1,
  },
};
