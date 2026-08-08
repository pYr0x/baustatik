export {
  DuplicateSectionIdError,
  EmptyOutlineError,
  InvalidSectionPolicyError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  type SectionElement,
  SectionValidationError,
  SectionValidationWarning,
  ShearCentreOffsetWarning,
  ShearCentreUnknownWarning,
  TangentKinkWarning,
  UnknownSectionNodeError,
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
