/**
 * Die Beschriftung — gemeinsam fuer Kraft und Moment.
 *
 * Beide Symbole sind ein SCHEMA: Pfeillaenge und Bogenradius sagen nichts ueber
 * den Betrag, sie sind fuer jede Last dieselben. Den Betrag traegt allein das
 * Label, und deshalb gibt es hier genau eine Stelle, die es baut.
 */

import type { Point, Vector } from '@baustatik/fem-geometry';
import type { LabelSpec } from '@baustatik/render-core';
import { roundSmart } from '@baustatik/round';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { LoadStyle } from './style';

/**
 * Der Labeltext.
 *
 * Blanke `String`-Umwandlung ohne Locale und ohne feste Nachkommastellen: die
 * Ganzzahl faellt unveraendert durch (`10 kN`), und `roundSmart` haelt die
 * Stellenzahl klein (`0.85 kN`). Ohne diese Festlegung haengt der Text an der
 * Fließkommadarstellung des Eingabewerts.
 *
 * Der Betrag kommt bereits ohne Vorzeichen herein — die Richtung zeigt das
 * Symbol, nicht die Schrift.
 */
export function forceLabelText(magnitude: number, unit = 'kN'): string {
  return `${roundSmart(magnitude)} ${unit}`;
}

/** Wie `forceLabelText`, nur die Einheit des Moments: kNm statt kN. */
export function momentLabelText(magnitude: number, unit = 'kNm'): string {
  return `${roundSmart(magnitude)} ${unit}`;
}

interface LoadLabelOptions {
  readonly id: string;
  readonly text: string;
  /** Anker: der Punkt, von dem aus der Adapter `gap` abtraegt. */
  readonly anchor: Point;
  /** Seite, auf der das Label liegt. Nur die Richtung zaehlt, nicht die Laenge. */
  readonly direction: Vector;
  readonly viewport: Viewport;
  readonly style: Required<LoadStyle>;
}

export function loadLabelSpec(options: LoadLabelOptions): LabelSpec {
  const { id, text, anchor, direction, viewport: vp, style } = options;

  return {
    kind: 'label',
    id,
    layer: 'loads',
    text,
    anchor: worldPoint(anchor.x, anchor.z),
    direction: worldPoint(direction.dx, direction.dz),
    gap: style.loadLabelGapPx / vp.scale,
    fontSize: style.loadLabelFontSizePx / vp.scale,
    fontFamily: style.loadLabelFontFamily,
    textColor: style.loadLabelTextColor,
    padding: style.loadLabelPaddingPx / vp.scale,
    backgroundColor: style.loadLabelBackgroundColor,
    borderColor: style.loadLabelBorderColor,
    // Wie strokeWidth am Symbol: Screen-Pixel, deshalb ungeteilt.
    borderWidth: style.loadLabelBorderWidthPx,
    cornerRadius: style.loadLabelCornerRadiusPx / vp.scale,
  };
}
