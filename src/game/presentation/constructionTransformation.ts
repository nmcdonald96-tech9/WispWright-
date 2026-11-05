/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaterialType, PieceCondition, TimberJoint, TimberJointState } from '../types';

export const C1_VISUAL_SCHEMA_VERSION = 1;

export type ConstructionVisualMode = 'PROTOTYPE' | 'TRANSFORMING' | 'TRANSFORMED';
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
