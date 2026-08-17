export {
  InvalidDiagramExaggerationError,
  UnknownNodeReferenceError,
  UnsupportedSupportError,
} from './errors';
export { FEM_LAYERS, type FEMLayer } from './layers';
export { type LoadStyle } from './loads';
export { type DiagramOptions, type ResultStyle } from './results';
export { type FEMSceneOptions, type FEMStyle, femSpecs } from './scene';
export {
  DEFAULT_MOMENT_RADIUS_PX,
  DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
} from './symbols';
export * from './viewer';

// Weitergereicht, damit ein Aufrufer den Ergebnistyp benennen kann, ohne
// zusaetzlich `@baustatik/fem-solver` zu importieren — er zeichnet, er rechnet
// nicht.
export type { SolveResult, SupportReaction } from '@baustatik/fem-solver';
