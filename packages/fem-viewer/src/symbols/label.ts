/**
 * Die Beschriftung — gemeinsam fuer Kraft und Moment, und gemeinsam fuer Last
 * und Auflagerreaktion.
 *
 * Beide Symbole sind ein SCHEMA: Pfeillaenge und Bogenradius sagen nichts ueber
 * den Betrag, sie sind fuer jede Groesse dieselben. Den Betrag traegt allein das
 * Label, und deshalb gibt es hier genau eine Stelle, die es baut.
 */

import type { Point, Vector } from '@baustatik/fem-geometry';
import type { LabelSpec } from '@baustatik/render-core';
import { roundSmart } from '@baustatik/round';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { FEMLayer } from '../layers';
import type { LabelStyle } from './style';

/**
 * Der Labeltext.
 *
 * Blanke `String`-Umwandlung ohne Locale und ohne feste Nachkommastellen: die
 * Ganzzahl faellt unveraendert durch (`10 kN`), und `roundSmart` haelt die
 * Stellenzahl klein (`0.85 kN`). Ohne diese Festlegung haengt der Text an der
 * Fließkommadarstellung des Eingabewerts.
 *
 * OB EIN VORZEICHEN DASTEHT, ENTSCHEIDET DER AUFRUFER. Diese Stelle formatiert,
 * was sie bekommt. Die Lastsymbole in `loads/` reichen den BETRAG herein — dort
 * ist das Vorzeichen im Bild bereits aufgebraucht, es dreht den Pfeil. Der
 * Schnittgroessenverlauf reicht den Wert MIT Vorzeichen herein: dort ist es Teil
 * der Zahl, und an einer Stuetze ist die Auftragsseite nicht selbsterklaerend.
 */
export function forceLabelText(value: number, unit = 'kN'): string {
  return `${roundSmart(value)} ${unit}`;
}

/** Wie `forceLabelText`, nur die Einheit des Moments: kNm statt kN. */
export function momentLabelText(value: number, unit = 'kNm'): string {
  return `${roundSmart(value)} ${unit}`;
}

interface SymbolLabelOptions {
  readonly id: string;
  /** Dasselbe Band wie das Symbol, an dem das Label haengt. */
  readonly layer: FEMLayer;
  readonly text: string;
  /** Anker: der Punkt, von dem aus der Adapter `gap` abtraegt. */
  readonly anchor: Point;
  /** Seite, auf der das Label liegt. Nur die Richtung zaehlt, nicht die Laenge. */
  readonly direction: Vector;
  readonly viewport: Viewport;
  /**
   * Nur die Labelscheibe: ein Verlauf hat keinen Pfeil, und der Kasten liest
   * ohnehin nichts anderes.
   */
  readonly style: LabelStyle;
}

export function symbolLabelSpec(options: SymbolLabelOptions): LabelSpec {
  const { id, layer, text, anchor, direction, viewport: vp, style } = options;

  return {
    kind: 'label',
    id,
    layer,
    text,
    anchor: worldPoint(anchor.x, anchor.z),
    direction: worldPoint(direction.dx, direction.dz),
    gap: style.labelGapPx / vp.scale,
    fontSize: style.labelFontSizePx / vp.scale,
    fontFamily: style.labelFontFamily,
    textColor: style.labelTextColor,
    padding: style.labelPaddingPx / vp.scale,
    backgroundColor: style.labelBackgroundColor,
    borderColor: style.labelBorderColor,
    // Wie strokeWidth am Symbol: Screen-Pixel, deshalb ungeteilt.
    borderWidth: style.labelBorderWidthPx,
    cornerRadius: style.labelCornerRadiusPx / vp.scale,
  };
}
