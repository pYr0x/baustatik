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
  /**
   * Abstand zwischen dem Angriffspunkt und der Pfeilspitze — die Figur beruehrt
   * das, woran sie haengt, nicht.
   *
   * EIN Wert fuer BEIDE Kraftsymbole: bei der Streckenlast ist es der Abstand
   * zwischen Stab und Grundlinie, beim Kraftpfeil der zwischen Angriffspunkt und
   * Spitze. Das ist dieselbe Groesse — wieviel Luft die Figur ueber der Stelle
   * laesst, auf die sie sich bezieht —, und eine zweite Zahl gaebe es nur, damit
   * sie von der ersten abweichen kann.
   */
  readonly forceGapPx: number;
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

/**
 * Was die MARKE auf der Stabachse braucht (`marker.ts`).
 *
 * Bewusst NICHT in `SymbolStyle`: den teilen sich Last und Auflagerreaktion, und
 * eine Reaktion sitzt auf einem KNOTEN, nie auf einer Stelle im Stab. Als
 * Pflichtfelder dort muesste `reactionSymbolStyle` zwei Werte erfinden, die nie
 * jemand liest — genau der Zustand, den `fem-loads/src/types.ts` an der
 * Momentenlast ablehnt.
 *
 * Eine eigene Scheibe und nicht ein Teil von `DistributedStyle`, seit auch die
 * Stab-Einzellast eine Marke traegt: die beiden Lastarten teilen die Marke, aber
 * nur die Streckenlast hat eine Flaeche.
 */
export interface MarkerStyle {
  readonly markerColor: string;
  readonly markerSizePx: number;
}

/**
 * Was die Streckenlast ZUSAETZLICH braucht — und was nur sie braucht.
 *
 * Nach demselben Schnitt wie `MarkerStyle`, und inzwischen ist genau ein Feld
 * uebrig: der Gap gilt fuer jeden Kraftpfeil und steht deshalb in `SymbolStyle`,
 * die Marke teilt sie sich mit der Einzellast. Eine HOEHE stand hier nie: die
 * Aussenkante des Polygons IST die Verbindung der beiden Pfeilenden, ihre Laenge
 * also `forceArrowLengthPx`.
 */
export interface DistributedStyle {
  readonly distributedFillColor: string;
}

/** Schematische Pfeillaenge. Fuer JEDE Kraft dieselbe, siehe `point-force.ts`. */
export const DEFAULT_POINT_FORCE_ARROW_LENGTH_PX = 48;

/**
 * Der Abstand zur Stelle, auf die sich die Figur bezieht. Fuer JEDES
 * Kraftsymbol derselbe — Last wie Reaktion, Pfeil wie Flaeche.
 */
export const DEFAULT_FORCE_GAP_PX = 10;

/**
 * Radius des Momentbogens — das Gegenstueck zur Pfeillaenge und aus demselben
 * Grund fest: er sagt nichts ueber den Betrag, das tut das Label.
 *
 * Er ist zugleich der Abstand des Labelankers vom Knoten: das Label haengt am
 * Bogen, nicht am Mittelpunkt.
 */
export const DEFAULT_MOMENT_RADIUS_PX = 22;
