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
  CircleSpec,
  GroupSpec,
  LineSpec,
  PolygonSpec,
  PrimitiveSpec,
  RectangleSpec,
  Spec,
  TriangleSpec,
} from './specs';
export { validateSpec, validateSpecs } from './validation';
