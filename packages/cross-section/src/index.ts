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
  DuplicateSectionIdError,
  EmptyOutlineError,
  InvalidSectionPolicyError,
  MiterLimitExceededWarning,
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
  UndiscretisableBulgeError,
  UnknownSectionNodeError,
  UnnestedHoleWarning,
  type WallEnd,
  ZeroLengthWallError,
} from './errors';
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
