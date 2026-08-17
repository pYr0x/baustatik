/**
 * Die Ergebnisscheibe des Viewer-Stils — Auflagerreaktionen und die Verlaeufe
 * von N, V und M.
 *
 * Formgleich zu `loads/style.ts`, aber mit EIGENEN Schluesseln: `FEMStyle` ist
 * flach, und `pointForceColor` kann nicht gleichzeitig Last und Reaktion
 * einstellen. Die Uebersetzung auf die neutralen Namen der Symbole macht
 * `reactionSymbolStyle` beziehungsweise `diagramLook`.
 *
 * ALLE Groessen in Screen-Pixeln, wie beim Lastsymbol und aus demselben Grund —
 * mit EINER Ausnahme, und die traegt ihren Namen: `diagramOrdinateM` ist ein
 * WELTMASS in Metern (ADR 0050). Die `…M`-Endung sagt das, so wie die
 * `…Px`-Endung ueberall sonst „screen-konstant" sagt.
 */

import {
  DEFAULT_FORCE_GAP_PX,
  DEFAULT_MOMENT_RADIUS_PX,
  DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  type LabelStyle,
  type SymbolStyle,
} from '../symbols';
import type { DiagramLook } from './diagram-figure';

/** Die drei Schnittgroessen, in Zeichenreihenfolge — M zuletzt und damit obenauf. */
export const DIAGRAM_COMPONENTS = ['N', 'V', 'M'] as const;

export type DiagramComponent = (typeof DIAGRAM_COMPONENTS)[number];

export interface ResultStyle {
  readonly reactionForceColor?: string;
  readonly reactionForceGapPx?: number;
  readonly reactionForceArrowLengthPx?: number;
  readonly reactionForceArrowWidthPx?: number;
  readonly reactionForcePointerLengthPx?: number;
  readonly reactionForcePointerWidthPx?: number;
  readonly reactionMomentColor?: string;
  readonly reactionMomentRadiusPx?: number;
  readonly reactionMomentArcWidthPx?: number;
  readonly reactionMomentPointerLengthPx?: number;
  readonly reactionMomentPointerWidthPx?: number;
  readonly reactionLabelGapPx?: number;
  readonly reactionLabelFontSizePx?: number;
  readonly reactionLabelFontFamily?: string;
  readonly reactionLabelPaddingPx?: number;
  readonly reactionLabelCornerRadiusPx?: number;
  readonly reactionLabelTextColor?: string;
  readonly reactionLabelBackgroundColor?: string;
  readonly reactionLabelBorderColor?: string;
  readonly reactionLabelBorderWidthPx?: number;

  /**
   * Die Hoehe, die der BETRAGSGROESSTE Wert einer Schnittgroesse bekommt — in
   * METERN, entlang `ez`, und deshalb nicht durch `vp.scale` geteilt (ADR 0050).
   * Die Flaeche zoomt mit; Strich und Label bleiben screen-konstant.
   */
  readonly diagramOrdinateM?: number;
  /** Untere Schranke der Abtastung je Stab, unabhaengig von seiner Laenge. */
  readonly diagramSubdivisions?: number;
  /**
   * Groesster Abstand zweier Abtastpunkte [m]. Sichert den KURZEN Lastabschnitt
   * auf einem LANGEN Stab, in den ein Raster von `L/subdivisions` keinen Punkt
   * legen wuerde.
   */
  readonly diagramMaxStepM?: number;
  readonly diagramOutlineWidthPx?: number;

  readonly diagramNColor?: string;
  readonly diagramNPositiveFillColor?: string;
  readonly diagramNNegativeFillColor?: string;
  readonly diagramNLabelBackgroundColor?: string;
  readonly diagramVColor?: string;
  readonly diagramVPositiveFillColor?: string;
  readonly diagramVNegativeFillColor?: string;
  readonly diagramVLabelBackgroundColor?: string;
  readonly diagramMColor?: string;
  readonly diagramMPositiveFillColor?: string;
  readonly diagramMNegativeFillColor?: string;
  readonly diagramMLabelBackgroundColor?: string;

  readonly diagramLabelGapPx?: number;
  readonly diagramLabelFontSizePx?: number;
  readonly diagramLabelFontFamily?: string;
  readonly diagramLabelPaddingPx?: number;
  readonly diagramLabelCornerRadiusPx?: number;
  readonly diagramLabelBorderWidthPx?: number;
}

/**
 * GRUEN, und ausdruecklich nicht das Lastblau `#1d4ed8`.
 *
 * Reaktion und Last stehen am selben Knoten, zeigen dieselbe Sorte Symbol und
 * sind einander entgegengerichtet. In derselben Farbe saehe ein Auflager unter
 * einer Last aus, als truege es eine zweite Last — und die Gleichgewichtsprobe,
 * fuer die man hinsieht, waere aus dem Bild nicht mehr abzulesen. Die Farbe ist
 * hier das einzige Merkmal, das die beiden trennt: Laenge, Kopf und Label sind
 * bewusst dieselben.
 */
const REACTION_COLOR = '#15803d';

/**
 * FARBTON = SCHNITTGROESSE, HELLIGKEIT = VORZEICHEN.
 *
 * Belegt sind Blau `#1d4ed8` (Lasten), Gruen `#15803d` (Reaktionen), Rot
 * (Knoten) und Schwarz (Staebe) — die drei Verlaeufe brauchen deshalb drei
 * eigene Farbtoene. Weil alle drei GLEICHZEITIG sichtbar sein duerfen, muss die
 * Zugehoerigkeit zur Schnittgroesse die primaere Unterscheidung sein und das
 * Vorzeichen die sekundaere.
 *
 * Die Fuellung traegt ihren ALPHAKANAL SELBST (8-stelliges Hex): `PolygonSpec`
 * hat `strokeColor`, `strokeWidth`, `strokeStyle` und `fillColor` — aber kein
 * `opacity`, und ein durchsichtiger Umriss waere gerade nicht gemeint.
 */
const DIAGRAM_COLORS = {
  N: { deep: '#0891b2', light: '#22d3ee', pale: '#cffafe' },
  V: { deep: '#ea580c', light: '#fb923c', pale: '#ffedd5' },
  M: { deep: '#7c3aed', light: '#a78bfa', pale: '#ede9fe' },
} as const satisfies Record<
  DiagramComponent,
  { deep: string; light: string; pale: string }
>;

/**
 * ZWEI Deckungen, nicht eine — und der Unterschied ist der Zweck.
 *
 * Die positive Flaeche traegt die TIEFE Farbe, die negative die helle. Bei
 * gleicher Deckung liegen die beiden zu dicht beieinander: der Farbton allein
 * traegt die Unterscheidung dann nicht mehr, und ein Momentenverlauf mit
 * Stuetzmoment sieht aus wie eine einzige Flaeche. Die tiefe Variante bekommt
 * deshalb mehr Deckung (55 %), die helle bleibt zurueckhaltend (25 %).
 */
const STRONG_FILL_ALPHA = '8c';
const LIGHT_FILL_ALPHA = '40';

export const DEFAULT_RESULT_STYLE: Required<ResultStyle> = {
  reactionForceColor: REACTION_COLOR,
  // LAENGE, GAP und KOPF wie bei der Last: der Pfeil ist auch hier ein Schema,
  // und zwei verschiedene Laengen im selben Bild liessen einen Groessenvergleich
  // vermuten, den es nicht gibt. Beim Gap kommt ein zweiter Grund dazu — er ist
  // der Abstand zum Knoten, und stuende die Reaktion naeher daran als die Last,
  // saehe es aus, als griffen die beiden an verschiedenen Stellen an.
  reactionForceGapPx: DEFAULT_FORCE_GAP_PX,
  reactionForceArrowLengthPx: DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  reactionForceArrowWidthPx: 3,
  reactionForcePointerLengthPx: 10,
  reactionForcePointerWidthPx: 8,
  reactionMomentColor: REACTION_COLOR,
  reactionMomentRadiusPx: DEFAULT_MOMENT_RADIUS_PX,
  reactionMomentArcWidthPx: 2,
  reactionMomentPointerLengthPx: 10,
  reactionMomentPointerWidthPx: 8,
  reactionLabelGapPx: 6,
  reactionLabelFontSizePx: 12,
  reactionLabelFontFamily: 'sans-serif',
  reactionLabelPaddingPx: 3,
  reactionLabelCornerRadiusPx: 3,
  reactionLabelTextColor: REACTION_COLOR,
  reactionLabelBackgroundColor: '#dcfce7',
  reactionLabelBorderColor: REACTION_COLOR,
  reactionLabelBorderWidthPx: 1,

  // Ein halber Meter fuer den groessten Wert: gross genug, um an einem Stab von
  // wenigen Metern etwas zu sehen, klein genug, um den Nachbarstab nicht zu
  // uebermalen. Wem das Bild zu klein ist, dreht die Ueberhoehung auf — das ist
  // der Regler, den es dafuer gibt (ADR 0050).
  diagramOrdinateM: 0.5,
  diagramSubdivisions: 20,
  diagramMaxStepM: 0.2,
  diagramOutlineWidthPx: 2,

  diagramNColor: DIAGRAM_COLORS.N.deep,
  diagramNPositiveFillColor: `${DIAGRAM_COLORS.N.deep}${STRONG_FILL_ALPHA}`,
  diagramNNegativeFillColor: `${DIAGRAM_COLORS.N.light}${LIGHT_FILL_ALPHA}`,
  diagramNLabelBackgroundColor: DIAGRAM_COLORS.N.pale,
  diagramVColor: DIAGRAM_COLORS.V.deep,
  diagramVPositiveFillColor: `${DIAGRAM_COLORS.V.deep}${STRONG_FILL_ALPHA}`,
  diagramVNegativeFillColor: `${DIAGRAM_COLORS.V.light}${LIGHT_FILL_ALPHA}`,
  diagramVLabelBackgroundColor: DIAGRAM_COLORS.V.pale,
  diagramMColor: DIAGRAM_COLORS.M.deep,
  diagramMPositiveFillColor: `${DIAGRAM_COLORS.M.deep}${STRONG_FILL_ALPHA}`,
  diagramMNegativeFillColor: `${DIAGRAM_COLORS.M.light}${LIGHT_FILL_ALPHA}`,
  diagramMLabelBackgroundColor: DIAGRAM_COLORS.M.pale,

  diagramLabelGapPx: 6,
  diagramLabelFontSizePx: 12,
  diagramLabelFontFamily: 'sans-serif',
  diagramLabelPaddingPx: 3,
  diagramLabelCornerRadiusPx: 3,
  diagramLabelBorderWidthPx: 1,
};

/** Die Ergebnisscheibe auf die neutralen Namen der Symbole abgebildet. */
export function reactionSymbolStyle(style: Required<ResultStyle>): SymbolStyle {
  return {
    forceColor: style.reactionForceColor,
    forceGapPx: style.reactionForceGapPx,
    forceArrowLengthPx: style.reactionForceArrowLengthPx,
    forceArrowWidthPx: style.reactionForceArrowWidthPx,
    forcePointerLengthPx: style.reactionForcePointerLengthPx,
    forcePointerWidthPx: style.reactionForcePointerWidthPx,
    momentColor: style.reactionMomentColor,
    momentRadiusPx: style.reactionMomentRadiusPx,
    momentArcWidthPx: style.reactionMomentArcWidthPx,
    momentPointerLengthPx: style.reactionMomentPointerLengthPx,
    momentPointerWidthPx: style.reactionMomentPointerWidthPx,
    labelGapPx: style.reactionLabelGapPx,
    labelFontSizePx: style.reactionLabelFontSizePx,
    labelFontFamily: style.reactionLabelFontFamily,
    labelPaddingPx: style.reactionLabelPaddingPx,
    labelCornerRadiusPx: style.reactionLabelCornerRadiusPx,
    labelTextColor: style.reactionLabelTextColor,
    labelBackgroundColor: style.reactionLabelBackgroundColor,
    labelBorderColor: style.reactionLabelBorderColor,
    labelBorderWidthPx: style.reactionLabelBorderWidthPx,
  };
}

/**
 * Die Verlaufsscheibe EINER Schnittgroesse auf die neutralen Namen der Figur
 * abgebildet — dieselbe Uebersetzung, die `reactionSymbolStyle` fuer die Pfeile
 * leistet. `diagram-figure.ts` weiss dadurch nicht, WESSEN Flaeche es zeichnet.
 *
 * LABEL: tiefe Farbe fuer Text UND Rahmen, sehr blasser Grund — fuer BEIDE
 * Vorzeichen gleich. Ein vorzeichenabhaengiger Text in der hellen Variante waere
 * auf hellem Grund kontrastarm, und das Vorzeichen steht ohnehin in der Zahl und
 * in der Seite, auf der das Label liegt.
 */
export function diagramLook(
  style: Required<ResultStyle>,
  component: DiagramComponent,
): DiagramLook {
  const colors: Record<
    DiagramComponent,
    { stroke: string; positive: string; negative: string; background: string }
  > = {
    N: {
      stroke: style.diagramNColor,
      positive: style.diagramNPositiveFillColor,
      negative: style.diagramNNegativeFillColor,
      background: style.diagramNLabelBackgroundColor,
    },
    V: {
      stroke: style.diagramVColor,
      positive: style.diagramVPositiveFillColor,
      negative: style.diagramVNegativeFillColor,
      background: style.diagramVLabelBackgroundColor,
    },
    M: {
      stroke: style.diagramMColor,
      positive: style.diagramMPositiveFillColor,
      negative: style.diagramMNegativeFillColor,
      background: style.diagramMLabelBackgroundColor,
    },
  };
  const picked = colors[component];

  return {
    strokeColor: picked.stroke,
    strokeWidthPx: style.diagramOutlineWidthPx,
    positiveFillColor: picked.positive,
    negativeFillColor: picked.negative,
    label: diagramLabelStyle(style, picked.stroke, picked.background),
  };
}

function diagramLabelStyle(
  style: Required<ResultStyle>,
  color: string,
  background: string,
): LabelStyle {
  return {
    labelGapPx: style.diagramLabelGapPx,
    labelFontSizePx: style.diagramLabelFontSizePx,
    labelFontFamily: style.diagramLabelFontFamily,
    labelPaddingPx: style.diagramLabelPaddingPx,
    labelCornerRadiusPx: style.diagramLabelCornerRadiusPx,
    labelTextColor: color,
    labelBackgroundColor: background,
    labelBorderColor: color,
    labelBorderWidthPx: style.diagramLabelBorderWidthPx,
  };
}
