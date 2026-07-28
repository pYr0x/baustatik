/**
 * Der Viewer-Stil als Zusammensetzung seiner beiden Scheiben: `ModelStyle` fuer
 * Staebe, Knoten, Gelenke und Auflager, `LoadStyle` fuer Kraefte und Momente.
 *
 * Die Scheiben liegen bei den Abbildungen, die sie brauchen (`model/style.ts`,
 * `loads/style.ts`); zusammengesetzt werden sie hier und nur hier. `scene.ts`
 * bleibt dadurch frei fuer die Komposition der Szene.
 *
 * Der FEM-Viewer zeichnet ein SCHEMA, kein massstaebliches Abbild: Knoten und
 * Staebe sind Symbole ohne physische Ausdehnung. Ihre Groessen sind deshalb
 * Screen-Pixel und zoomen NICHT mit. (Gegenfall ist der Querschnitt, wo die
 * Blechdicke eine echte Weltgroesse ist.)
 */

// Direkt auf die Scheiben, nicht ueber die beiden `index.ts`: hier werden nur
// Typ und Vorgaben gebraucht, nicht der ganze Abbildungsgraph dahinter.
import { DEFAULT_LOAD_STYLE, type LoadStyle } from './loads/style';
import { DEFAULT_MODEL_STYLE, type ModelStyle } from './model/style';

export interface FEMStyle extends ModelStyle, LoadStyle {}

export const DEFAULT_STYLE: Required<FEMStyle> = {
  ...DEFAULT_MODEL_STYLE,
  ...DEFAULT_LOAD_STYLE,
};
