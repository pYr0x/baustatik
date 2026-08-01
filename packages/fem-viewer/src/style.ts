/**
 * Der Viewer-Stil als Zusammensetzung seiner drei Scheiben: `ModelStyle` fuer
 * Staebe, Knoten, Gelenke und Auflager, `LoadStyle` fuer Kraefte und Momente,
 * `ResultStyle` fuer die Auflagerreaktionen.
 *
 * Die Scheiben liegen bei den Abbildungen, die sie brauchen (`model/style.ts`,
 * `loads/style.ts`, `results/style.ts`); zusammengesetzt werden sie hier und nur
 * hier. `scene.ts` bleibt dadurch frei fuer die Komposition der Szene.
 *
 * DIE SCHLUESSEL DER DREI SCHEIBEN SIND DISJUNKT, und das ist Absicht: `FEMStyle`
 * ist flach, ein doppelter Name liesse sich nicht getrennt einstellen. Last und
 * Reaktion zeichnen dieselben Symbole, tragen aber je eigene Felder — die
 * Uebersetzung auf die neutralen Namen in `symbols/style.ts` macht jede Scheibe
 * selbst.
 *
 * Der FEM-Viewer zeichnet ein SCHEMA, kein massstaebliches Abbild: Knoten und
 * Staebe sind Symbole ohne physische Ausdehnung. Ihre Groessen sind deshalb
 * Screen-Pixel und zoomen NICHT mit. (Gegenfall ist der Querschnitt, wo die
 * Blechdicke eine echte Weltgroesse ist.)
 */

// Direkt auf die Scheiben, nicht ueber die `index.ts` der Ordner: hier werden
// nur Typ und Vorgaben gebraucht, nicht der ganze Abbildungsgraph dahinter.
import { DEFAULT_LOAD_STYLE, type LoadStyle } from './loads/style';
import { DEFAULT_MODEL_STYLE, type ModelStyle } from './model/style';
import { DEFAULT_RESULT_STYLE, type ResultStyle } from './results/style';

export interface FEMStyle extends ModelStyle, LoadStyle, ResultStyle {}

export const DEFAULT_STYLE: Required<FEMStyle> = {
  ...DEFAULT_MODEL_STYLE,
  ...DEFAULT_LOAD_STYLE,
  ...DEFAULT_RESULT_STYLE,
};
