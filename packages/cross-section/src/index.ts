// DER WANDWEG BLEIBT INNEN. `cellCount`/`componentCount` (`branch.ts`),
// `Segment`/`segments`/`wallMoments` (`segment.ts`) und `wallPath`
// (`wall-path.ts`) sind der Rechenweg von P5 und keine Tür: nach aussen tragen
// ihn `SectionProperties` (κ, `yM`/`zM`, `It`) und die Befunde des Gates. Das
// Wandmodell ist ausdrücklich intern (CONTEXT.md, ADR 0041) — es zu
// veröffentlichen stellte ein zweites Bezugssystem neben `ys`/`zs`.
export { type Branch, branches } from './branch';
export {
  createSectionGeometry,
  type SectionGeometryInput,
} from './create-section-geometry';
export {
  deriveOutline,
  deriveOutlineFromRings,
  deriveOutlineFromWalls,
} from './derive-outline';
export {
  type BulgeSite,
  DegenerateOutlineRingError,
  DisconnectedWallGraphWarning,
  DuplicateSectionIdError,
  EmptyOutlineError,
  InvalidSectionPolicyError,
  MiterLimitExceededWarning,
  MultipleCellsWarning,
  NegativeOutlineAreaError,
  NonFiniteBulgeError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  OutlineDriftWarning,
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
} from './errors';
export {
  type FESectionState,
  type FESectionValues,
  kappaFromCoefficients,
} from './fe-values';
export {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  parseSectionPolicy,
  type SectionPolicy,
  type SectionPolicyOverrides,
} from './policy';
export type { SectionProperties } from './properties';
export {
  type CrossSection,
  type Idealisation,
  profileProperties,
  type ShapeSpec,
  sectionProperties,
} from './section';
export { type StressPoint, stressPoints } from './stress-points/index';
export type {
  Polygon,
  Ring,
  SectionGeometry,
  SectionNode,
  Vertex,
  Wall,
} from './types';
export {
  type SectionValidationResult,
  validateSectionGeometry,
  validateSectionProperties,
} from './validate';
