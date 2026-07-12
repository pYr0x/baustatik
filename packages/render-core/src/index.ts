export type { Spec, LineSpec, CircleSpec, PolygonSpec } from './specs';
export type { ViewIntent } from './intents/view';
export type { RenderDriver } from './driver';
export { assertNever } from './exhaustive';
export {
  InvalidSpecError,
  DuplicateSpecIdError,
  UnreachableCaseError,
} from './errors';
export { validateSpec, validateSpecs } from './validation';
