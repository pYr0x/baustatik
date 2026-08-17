/**
 * Die SYMBOLE — Pfeil, gebogener Pfeil, Label.
 *
 * Die zweite der beiden Ebenen, in die dieser Viewer geschnitten ist: WIE ein
 * Symbol aussieht. Die erste — WAS wo haengt — steht in `loads/` und `results/`,
 * und beide bespielen dieselben Symbole. Genau deshalb liegen sie hier und nicht
 * mehr in `loads/`: eine Auflagerreaktion ist derselbe Pfeil mit einer anderen
 * Farbe in einem anderen Band, und zwei Kopien liefen frueher oder spaeter
 * auseinander.
 *
 * Was dieser Ordner NICHT weiss: wessen Pfeil er zeichnet. `layer` und `id`
 * kommen mit dem Symbol herein, die Farben ueber `SymbolStyle`.
 */

export {
  type DistributedForce,
  distributedForce,
  distributedForceSpecs,
} from './distributed-force';
export { forceLabelText, momentLabelText, symbolLabelSpec } from './label';
export { markerSpec } from './marker';
export { type Moment, moment, momentSpecs } from './moment';
export { type PointForce, pointForce, pointForceSpecs } from './point-force';
export {
  DEFAULT_FORCE_GAP_PX,
  DEFAULT_MOMENT_RADIUS_PX,
  DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  type DistributedStyle,
  type LabelStyle,
  type MarkerStyle,
  type SymbolStyle,
} from './style';
