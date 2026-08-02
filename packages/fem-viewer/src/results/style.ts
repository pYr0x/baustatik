/**
 * Die Ergebnisscheibe des Viewer-Stils — heute nur die Auflagerreaktionen.
 *
 * Formgleich zu `loads/style.ts`, aber mit EIGENEN Schluesseln: `FEMStyle` ist
 * flach, und `pointForceColor` kann nicht gleichzeitig Last und Reaktion
 * einstellen. Die Uebersetzung auf die neutralen Namen der Symbole macht
 * `reactionSymbolStyle`.
 *
 * ALLE Groessen in Screen-Pixeln, wie beim Lastsymbol und aus demselben Grund.
 */

import {
  DEFAULT_FORCE_GAP_PX,
  DEFAULT_MOMENT_RADIUS_PX,
  DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  type SymbolStyle,
} from '../symbols';

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
