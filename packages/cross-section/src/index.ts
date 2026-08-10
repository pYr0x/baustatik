export {
  type Branch,
  branches,
  cellCount,
  componentCount,
} from './branch';
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
export {
  type Segment,
  type SegmentRun,
  segments,
  type WallMoments,
  wallMoments,
} from './segment';
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
export { type OutlineFigure, type WallPath, wallPath } from './wall-path';
