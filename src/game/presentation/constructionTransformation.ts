/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaterialType, PieceCondition, TimberJoint, TimberJointState } from '../types';

export const C1_VISUAL_SCHEMA_VERSION = 1;
export const C1_TRANSFORMATION_DURATION_SEC = 0.85;

export type ConstructionVisualMode = 'PROTOTYPE' | 'TRANSFORMING' | 'TRANSFORMED';
export type ConstructionDepthFamily =
  | 'NONE'
  | 'WOOD_BEAM_DEPTH'
  | 'WOOD_BLOCK_DEPTH'
  | 'STONE_DEPTH';

export interface ConstructionDepthProfile {
  family: ConstructionDepthFamily;
  alpha: number;
  depthVector: { x: number; y: number };
  topFaceAlpha: number;
  sideFaceAlpha: number;
  contactShadowAlpha: number;
  hardwareLiftPx: number;
  runeRecessPx: number;
}

const C1_DEPTH_VECTOR = { x: 6, y: -6 } as const;

export function deriveConstructionDepthProfile(input: {
  materialType: MaterialType;
  isPrebuilt: boolean;
  transformationProgress: number;
}): ConstructionDepthProfile {
  const alpha = Math.max(0, Math.min(1, input.transformationProgress));
  if (alpha <= 0) {
    return {
      family: 'NONE',
      alpha: 0,
      depthVector: { x: 0, y: 0 },
      topFaceAlpha: 0,
      sideFaceAlpha: 0,
      contactShadowAlpha: 0,
      hardwareLiftPx: 0,
      runeRecessPx: 0,
    };
  }
  const multiplier =
    input.materialType === 'wood_beam'
      ? 1
      : input.materialType === 'wood_block'
        ? 1.15
        : 1.4;
  const family: ConstructionDepthFamily =
    input.materialType === 'wood_beam'
      ? 'WOOD_BEAM_DEPTH'
      : input.materialType === 'wood_block'
        ? 'WOOD_BLOCK_DEPTH'
        : 'STONE_DEPTH';
  return {
    family,
    alpha,
    depthVector: {
      x: Number((C1_DEPTH_VECTOR.x * multiplier).toFixed(2)),
      y: Number((C1_DEPTH_VECTOR.y * multiplier).toFixed(2)),
    },
    topFaceAlpha: 0.24 * alpha,
    sideFaceAlpha: 0.34 * alpha,
    contactShadowAlpha: (input.materialType === 'stone_block' ? 0.38 : 0.28) * alpha,
    hardwareLiftPx: (input.materialType === 'stone_block' ? 3.2 : 2.4) * alpha,
    runeRecessPx: input.isPrebuilt && input.materialType === 'stone_block' ? 2.2 * alpha : 0,
  };
}

export interface ConstructionSeamDepthProfile {
  family: ConstructionSeamVisualFamily;
  alpha: number;
  depthVector: { x: number; y: number };
  hardwareLiftPx: number;
  damagedHardware: boolean;
}

export function deriveConstructionSeamDepthProfile(
  joint: Pick<
    TimberJoint,
    'jointType' | 'socketAId' | 'socketBId' | 'state'
  >,
  transformationProgress: number,
): ConstructionSeamDepthProfile {
  const alpha = Math.max(0, Math.min(1, transformationProgress));
  const family = classifyConstructionSeamVisualFamily(joint);
  const multiplier = family === 'BROAD_FACE_CLAMP' ? 0.55 : 0.45;
  return {
    family,
    alpha,
    depthVector: {
      x: Number((C1_DEPTH_VECTOR.x * multiplier * alpha).toFixed(2)),
      y: Number((C1_DEPTH_VECTOR.y * multiplier * alpha).toFixed(2)),
    },
    hardwareLiftPx: (family === 'BROAD_FACE_CLAMP' ? 3.6 : 2.8) * alpha,
    damagedHardware: joint.state === 'BROKEN',
  };
}

export type ConstructionSeamVisualFamily =
  | 'BROAD_FACE_CLAMP'
  | 'ENDPOINT_SHOE'
  | 'ROOF_PEAK_CAP'
  | 'CORNER_BRACKET'
  | 'SPLICE_COLLAR'
  | 'T_JOINT_BRACE'
  | 'DIAGONAL_GUSSET'
  | 'GENERIC_BINDING';

export interface ConstructionTransformationInput {
  phase: string;
  acceptedRevisionId: number | null;
  currentConstructionRevision: number;
  previousMode?: ConstructionVisualMode;
  reducedMotion?: boolean;
}

export interface ConstructionTransformationPresentationState {
  mode: ConstructionVisualMode;
  transformationProgress: number;
  isAcceptedRevision: boolean;
}

export interface PieceVisualDescriptor {
  pieceId: string;
  materialType: MaterialType;
  seed: number;
  variantStyle: number;
  wearState: PieceCondition;
  severity: number;
  transformationProgress: number;
}

export interface SeamVisualDescriptor {
  jointId: string;
  seed: number;
  capVariant: number;
  family: ConstructionSeamVisualFamily;
  state: TimberJointState;
  stressAlpha: number;
  persistentBrokenScar: boolean;
  transformationProgress: number;
}

const PROTOTYPE_PHASES = new Set([
  'CONSTRUCTION',
  'INITIAL_CONSTRUCTION',
  'CONSTRUCTION_READY',
  'LEVEL_LOADING',
  'LEVEL_INTRO',
  'WISP_INTRO',
  'THREAT_PREVIEW',
  'TESTING_SIMULATION',
  'SETTLED',
]);

/** Stable 32-bit FNV-1a hash for deterministic presentation variants. */
export function hashConstructionVisualIdentity(identity: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getPieceVisualSeed(pieceId: string, materialType: MaterialType): number {
  return hashConstructionVisualIdentity(
    `c1:${C1_VISUAL_SCHEMA_VERSION}:piece:${pieceId}:${materialType}`,
  );
}

export function getSeamVisualSeed(joint: Pick<TimberJoint, 'jointId' | 'jointType'>): number {
  return hashConstructionVisualIdentity(
    `c1:${C1_VISUAL_SCHEMA_VERSION}:seam:${joint.jointId}:${joint.jointType}`,
  );
}

export function deriveConstructionTransformationState(
  input: ConstructionTransformationInput,
): ConstructionTransformationPresentationState {
  const isAcceptedRevision =
    input.acceptedRevisionId !== null &&
    input.acceptedRevisionId === input.currentConstructionRevision;

  if (!isAcceptedRevision || PROTOTYPE_PHASES.has(input.phase)) {
    return { mode: 'PROTOTYPE', transformationProgress: 0, isAcceptedRevision };
  }

  if (input.reducedMotion) {
    return { mode: 'TRANSFORMED', transformationProgress: 1, isAcceptedRevision };
  }

  if (input.previousMode === 'PROTOTYPE') {
    return { mode: 'TRANSFORMING', transformationProgress: 0, isAcceptedRevision };
  }

  return { mode: 'TRANSFORMED', transformationProgress: 1, isAcceptedRevision };
}


export interface AdvanceConstructionTransformationInput
  extends ConstructionTransformationInput {
  currentState: ConstructionTransformationPresentationState;
  deltaSec: number;
}

/**
 * Advances the presentation-only reveal without mutating authoritative game state.
 * Prototype transitions are immediate for editing clarity. Accepted presentation
 * phases animate once, while hydration may reconstruct the completed state directly.
 */
export function advanceConstructionTransformationState(
  input: AdvanceConstructionTransformationInput,
): ConstructionTransformationPresentationState {
  const target = deriveConstructionTransformationState({
    phase: input.phase,
    acceptedRevisionId: input.acceptedRevisionId,
    currentConstructionRevision: input.currentConstructionRevision,
    previousMode: input.currentState.mode,
    reducedMotion: input.reducedMotion,
  });

  if (target.mode === 'PROTOTYPE') {
    return target;
  }

  if (
    target.mode === 'TRANSFORMED' &&
    input.currentState.mode !== 'TRANSFORMING'
  ) {
    return target;
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      input.currentState.transformationProgress +
        Math.max(0, input.deltaSec) / C1_TRANSFORMATION_DURATION_SEC,
    ),
  );
  return {
    mode: progress >= 1 ? 'TRANSFORMED' : 'TRANSFORMING',
    transformationProgress: progress,
    isAcceptedRevision: target.isAcceptedRevision,
  };
}

export function derivePieceVisualDescriptor(input: {
  pieceId: string;
  materialType: MaterialType;
  condition?: PieceCondition;
  impactSeverity?: number;
  transformationProgress: number;
}): PieceVisualDescriptor {
  const seed = getPieceVisualSeed(input.pieceId, input.materialType);
  return {
    pieceId: input.pieceId,
    materialType: input.materialType,
    seed,
    variantStyle: seed % 4,
    wearState: input.condition ?? 'INTACT',
    severity: Math.max(0, Math.min(1, input.impactSeverity ?? 0)),
    transformationProgress: Math.max(0, Math.min(1, input.transformationProgress)),
  };
}

function socketNames(joint: Pick<TimberJoint, 'socketAId' | 'socketBId'>): [string, string] {
  return [joint.socketAId, joint.socketBId];
}

export function classifyConstructionSeamVisualFamily(
  joint: Pick<
    TimberJoint,
    'jointType' | 'socketAId' | 'socketBId'
  >,
): ConstructionSeamVisualFamily {
  if (joint.jointType === 'ROOF_PEAK') return 'ROOF_PEAK_CAP';
  if (joint.jointType === 'RAFTER_CORNER_SEAT' || joint.jointType === 'TIMBER_CORNER') {
    return 'CORNER_BRACKET';
  }
  if (joint.jointType === 'TIMBER_SPLICE') return 'SPLICE_COLLAR';
  if (joint.jointType === 'TIMBER_T_JOINT') return 'T_JOINT_BRACE';
  if (joint.jointType === 'DIAGONAL_BRACE') return 'DIAGONAL_GUSSET';

  const [a, b] = socketNames(joint);
  const beamSide = (value: string) => value.includes('SIDE_TOP') || value.includes('SIDE_BOTTOM');
  const blockEdge = (value: string) =>
    value.endsWith('TOP_EDGE') ||
    value.endsWith('BOTTOM_EDGE') ||
    value.endsWith('LEFT_EDGE') ||
    value.endsWith('RIGHT_EDGE');
  if ((beamSide(a) && blockEdge(b)) || (beamSide(b) && blockEdge(a))) {
    return 'BROAD_FACE_CLAMP';
  }
  if (a.includes('END_A') || a.includes('END_B') || b.includes('END_A') || b.includes('END_B')) {
    return 'ENDPOINT_SHOE';
  }
  return 'GENERIC_BINDING';
}

export function deriveSeamVisualDescriptor(
  joint: Pick<
    TimberJoint,
    'jointId' | 'jointType' | 'socketAId' | 'socketBId' | 'state' | 'currentStress'
  >,
  transformationProgress: number,
): SeamVisualDescriptor {
  const seed = getSeamVisualSeed(joint);
  return {
    jointId: joint.jointId,
    seed,
    capVariant: seed % 3,
    family: classifyConstructionSeamVisualFamily(joint),
    state: joint.state,
    stressAlpha:
      joint.state === 'STRAINED'
        ? Math.max(0.25, Math.min(1, joint.currentStress / 10))
        : 0,
    persistentBrokenScar: joint.state === 'BROKEN',
    transformationProgress: Math.max(0, Math.min(1, transformationProgress)),
  };
}
