/**
 * Die Lastscheibe des Viewer-Stils. Eigenes Interface, damit die Vorgaben hier
 * bei der Abbildung stehen koennen, die sie braucht, ohne dass `loads/` und
 * `scene.ts` sich gegenseitig importieren.
 *
 * DIE SCHLUESSEL SIND EIGENE, obwohl `results/style.ts` dieselben Felder fuehrt:
 * `FEMStyle` ist flach, und zwei Quellen mit gleichen Namen liessen sich darin
 * nicht getrennt einstellen. Die Uebersetzung auf die neutralen Namen der
 * Symbole macht `loadSymbolStyle` — einmal, an einer Stelle.
 *
 * ALLE Groessen in Screen-Pixeln: das Lastsymbol ist ein Schema und bleibt beim
 * Zoomen gleich gross. Wer sie zeichnet, teilt durch `vp.scale` — ausser
 * `strokeWidth` und `borderWidth`, die der Adapter ohnehin in Screen-Pixeln
 * zeichnet (`strokeScaleEnabled: false`).
 */

import {
  DEFAULT_MOMENT_RADIUS_PX,
  DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  type SymbolStyle,
} from '../symbols';

export interface LoadStyle {
  readonly pointForceColor?: string;
  readonly pointForceArrowLengthPx?: number;
  readonly pointForceArrowWidthPx?: number;
  readonly pointForcePointerLengthPx?: number;
  readonly pointForcePointerWidthPx?: number;
  readonly momentColor?: string;
  readonly momentRadiusPx?: number;
  readonly momentArcWidthPx?: number;
  readonly momentPointerLengthPx?: number;
  readonly momentPointerWidthPx?: number;
  readonly loadLabelGapPx?: number;
  readonly loadLabelFontSizePx?: number;
  readonly loadLabelFontFamily?: string;
  readonly loadLabelPaddingPx?: number;
  readonly loadLabelCornerRadiusPx?: number;
  readonly loadLabelTextColor?: string;
  readonly loadLabelBackgroundColor?: string;
  readonly loadLabelBorderColor?: string;
  readonly loadLabelBorderWidthPx?: number;
}

export const DEFAULT_LOAD_STYLE: Required<LoadStyle> = {
  pointForceColor: '#1d4ed8',
  pointForceArrowLengthPx: DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  pointForceArrowWidthPx: 2,
  pointForcePointerLengthPx: 10,
  pointForcePointerWidthPx: 8,
  // Kraft und Moment sind dieselbe Last — sie tragen deshalb dieselbe Farbe und
  // dieselbe Kopfgroesse. Getrennte Felder gibt es trotzdem, weil sie sich
  // spaeter unterscheiden duerfen sollen, ohne dass ein Feld zwei Dinge meint.
  momentColor: '#1d4ed8',
  momentRadiusPx: DEFAULT_MOMENT_RADIUS_PX,
  momentArcWidthPx: 2,
  momentPointerLengthPx: 10,
  momentPointerWidthPx: 8,
  loadLabelGapPx: 6,
  loadLabelFontSizePx: 12,
  loadLabelFontFamily: 'sans-serif',
  loadLabelPaddingPx: 3,
  loadLabelCornerRadiusPx: 3,
  loadLabelTextColor: '#1d4ed8',
  loadLabelBackgroundColor: '#dbeafe',
  loadLabelBorderColor: '#1d4ed8',
  loadLabelBorderWidthPx: 1,
};

/** Die Lastscheibe auf die neutralen Namen der Symbole abgebildet. */
export function loadSymbolStyle(style: Required<LoadStyle>): SymbolStyle {
  return {
    forceColor: style.pointForceColor,
    forceArrowLengthPx: style.pointForceArrowLengthPx,
    forceArrowWidthPx: style.pointForceArrowWidthPx,
    forcePointerLengthPx: style.pointForcePointerLengthPx,
    forcePointerWidthPx: style.pointForcePointerWidthPx,
    momentColor: style.momentColor,
    momentRadiusPx: style.momentRadiusPx,
    momentArcWidthPx: style.momentArcWidthPx,
    momentPointerLengthPx: style.momentPointerLengthPx,
    momentPointerWidthPx: style.momentPointerWidthPx,
    labelGapPx: style.loadLabelGapPx,
    labelFontSizePx: style.loadLabelFontSizePx,
    labelFontFamily: style.loadLabelFontFamily,
    labelPaddingPx: style.loadLabelPaddingPx,
    labelCornerRadiusPx: style.loadLabelCornerRadiusPx,
    labelTextColor: style.loadLabelTextColor,
    labelBackgroundColor: style.loadLabelBackgroundColor,
    labelBorderColor: style.loadLabelBorderColor,
    labelBorderWidthPx: style.loadLabelBorderWidthPx,
  };
}
