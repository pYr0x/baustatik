export type { RenderDriver } from './driver';
export {
  DuplicateSpecIdError,
  InvalidSpecError,
  UnknownLayerError,
  UnreachableCaseError,
} from './errors';
export { assertNever } from './exhaustive';
export type { ViewIntent } from './intents/view';
export type {
  ArcPathSpec,
  ArrowSpec,
  CircleSpec,
  GroupSpec,
  IndexedLineListSpec,
  LabelSpec,
  LineSpec,
  PolygonSpec,
  PrimitiveSpec,
  RectangleSpec,
  ShapeSpec,
  Spec,
  TriangleSpec,
} from './specs';
export { validateSpec, validateSpecs } from './validation';
