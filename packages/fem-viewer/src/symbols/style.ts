/**
 * Der AUFGELOESTE Stil eines Symbols — Pfeil, Bogen, Label.
 *
 * Bewusst NICHT der oeffentliche Stil: `FEMStyle` ist eine flache Scheibe mit
 * sprechenden Namen (`pointForceColor`, `reactionForceColor`), und flach koennen
 * zwei Quellen nicht dieselben Schluessel tragen. Hier stehen deshalb NEUTRALE
 * Namen, und jede Quelle bildet ihre Scheibe darauf ab (`loads/style.ts`,
 * `results/style.ts`). Das Symbol weiss dadurch nicht, WESSEN Pfeil es zeichnet
 * — und genau das ist der Punkt der Trennung.
 *
 * Alle Felder sind Pflicht: der Typ beschreibt den aufgeloesten Zustand, das
 * Auffuellen der Vorgaben ist vorher passiert.
 *
 * ALLE GROESSEN in Screen-Pixeln: das Symbol ist ein Schema und bleibt beim
 * Zoomen gleich gross. Wer sie zeichnet, teilt durch `vp.scale` — ausser
 * `strokeWidth` und `borderWidth`, die der Adapter ohnehin in Screen-Pixeln
 * zeichnet (`strokeScaleEnabled: false`).
 */
export interface SymbolStyle {
  readonly forceColor: string;
  readonly forceArrowLengthPx: number;
  readonly forceArrowWidthPx: number;
  readonly forcePointerLengthPx: number;
  readonly forcePointerWidthPx: number;
  readonly momentColor: string;
  readonly momentRadiusPx: number;
  readonly momentArcWidthPx: number;
  readonly momentPointerLengthPx: number;
  readonly momentPointerWidthPx: number;
  readonly labelGapPx: number;
  readonly labelFontSizePx: number;
  readonly labelFontFamily: string;
  readonly labelPaddingPx: number;
  readonly labelCornerRadiusPx: number;
  readonly labelTextColor: string;
  readonly labelBackgroundColor: string;
  readonly labelBorderColor: string;
  readonly labelBorderWidthPx: number;
}

/** Schematische Pfeillaenge. Fuer JEDE Kraft dieselbe, siehe `point-force.ts`. */
export const DEFAULT_POINT_FORCE_ARROW_LENGTH_PX = 48;

/**
 * Radius des Momentbogens — das Gegenstueck zur Pfeillaenge und aus demselben
 * Grund fest: er sagt nichts ueber den Betrag, das tut das Label.
 *
 * Er ist zugleich der Abstand des Labelankers vom Knoten: das Label haengt am
 * Bogen, nicht am Mittelpunkt.
 */
export const DEFAULT_MOMENT_RADIUS_PX = 22;
