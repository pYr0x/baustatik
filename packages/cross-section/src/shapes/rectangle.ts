import type { cm } from '@baustatik/units';
import { partIntervals } from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Das Vollrechteck. IMMER kompakt — ein duennwandiges Rechteck gibt es nicht,
 * deshalb traegt `ShapeSpec` fuer diese Form auch kein `idealisation`.
 *
 * Aus der Schubenergie faellt hier exakt 5/6. Der Wert wird NICHT gesetzt: er
 * ist das Ergebnis derselben Rechnung wie bei jeder anderen Form, und genau
 * deshalb belegt er, dass die Definition stimmt.
 *
 * Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der Oberkante.
 * Abmessungen in ZENTIMETERN; `shapeResult` hat die mm der `ShapeSpec` bereits
 * umgerechnet.
 */
export function rectangle(b: cm, h: cm): ShapeResult | undefined {
  if (!allPositive(b, h)) return undefined;

  return {
    A: b * h,
    Iy: (b * h * h * h) / 12,
    Iz: (h * b * b * b) / 12,
    Iyz: 0,
    ys: 0,
    zs: h / 2,
    // Doppeltsymmetrisch: der Schubmittelpunkt faellt mit dem Schwerpunkt
    // zusammen. Beide Symmetrieachsen sind zugleich Hauptachsen, und auf jeder
    // von ihnen muss M liegen.
    yM: 0,
    zM: h / 2,
    // `It` BLEIBT UNERMITTELT. Das Vollrechteck ist die eine Form ohne
    // `idealisation`, also immer kompakt, und sein `It` ist keine Summe
    // ueber Wandmittellinien: es ist `k(b/h)·h·b³` mit einer Reihe, die aus
    // der Loesung eines Randwertproblems faellt. Sie hier hinzuschreiben
    // hiesse, eine Naeherung als Wert auszugeben.
    It: undefined,
    // Eine einzige Teilflaeche ueber die volle Hoehe bzw. Breite.
    pathZ: partIntervals(-h / 2, [{ extent: h, width: b }]).intervals,
    pathY: partIntervals(-b / 2, [{ extent: b, width: h }]).intervals,
  };
}
