// DER WANDWEG BLEIBT INNEN. `geometry/wall-graph/` und
// `calculation/wall-path/` sind der Rechenweg von P5 und keine Tür: nach außen
// tragen ihn `SectionProperties` (κ, `yM`/`zM`, `It`) und die Befunde des Gates.
// Das Wandmodell ist ausdrücklich intern (CONTEXT.md, ADR 0041) — es zu
// veröffentlichen stellte ein zweites Bezugssystem neben `ys`/`zs`.
export { profileProperties } from './calculation/profile-properties';
export { sectionProperties } from './calculation/section-properties';
export {
  createSectionGeometry,
  type SectionGeometryInput,
} from './geometry/create-section-geometry';
export { deriveOutline } from './geometry/outline/derive-outline';
export { deriveOutlineFromRings } from './geometry/outline/derive-outline-from-rings';
export { deriveOutlineFromWalls } from './geometry/outline/derive-outline-from-walls';
export { shapeOutline } from './geometry/shape-outline';
export { type Branch, branches } from './geometry/wall-graph/branches';
export type { CrossSection } from './model/cross-section';
export {
  type FESectionState,
  type FESectionValues,
  kappaFromCoefficients,
} from './model/fe-section-values';
export type { Idealisation } from './model/idealisation';
export { isSolid, isSolidGeometry } from './model/is-solid';
export type {
  ReinforcementElement,
  ReinforcementLayer,
} from './model/reinforcement';
export type {
  Polygon,
  Ring,
  SectionGeometry,
  SectionNode,
  Vertex,
  Wall,
} from './model/section-geometry';
export type { SectionProperties } from './model/section-properties';
export type { ShapeSpec } from './model/shape-spec';
export {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  parseSectionPolicy,
  type SectionPolicy,
  type SectionPolicyOverrides,
} from './policy';
export { type StressPoint, stressPoints } from './stress-points/index';
export {
  type BulgeSite,
  DegenerateOutlineRingError,
  DisconnectedWallGraphWarning,
  DuplicateReinforcementElementError,
  DuplicateReinforcementLayerError,
  DuplicateSectionIdError,
  EmptyOutlineError,
  InvalidSectionPolicyError,
  MiterLimitExceededWarning,
  MultipleCellsWarning,
  NegativeOutlineAreaError,
  NonFiniteBulgeError,
  NonPositiveReinforcementAreaError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  OutlineDriftWarning,
  ReinforcementCeilingBelowAreaError,
  ReinforcementOnThinWalledSectionError,
  ReinforcementOutsideSectionWarning,
  type SectionElement,
  SectionValidationError,
  SectionValidationWarning,
  ShearCentreOffsetWarning,
  ShearCentreUnknownWarning,
  TangentKinkWarning,
  ThickWallWarning,
  UndiscretisableBulgeError,
  UnknownSectionNodeError,
  UnnestedHoleWarning,
  type WallEnd,
  ZeroLengthWallError,
} from './validation/errors';
export {
  type SectionValidationResult,
  validateReinforcement,
  validateSectionGeometry,
  validateSectionProperties,
} from './validation/validate';
