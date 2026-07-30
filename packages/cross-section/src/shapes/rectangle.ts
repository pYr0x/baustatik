import { bandSegments } from '../shear';
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
 */
export function rectangle(b: number, h: number): ShapeResult | undefined {
  if (!allPositive(b, h)) return undefined;

  return {
    A: b * h,
    Iy: (b * h * h * h) / 12,
    Iz: (h * b * b * b) / 12,
    Iyz: 0,
    ys: 0,
    zs: h / 2,
    // Ein einziges Band ueber die volle Hoehe bzw. Breite.
    pathZ: bandSegments(-h / 2, [{ extent: h, width: b }]).segments,
    pathY: bandSegments(-b / 2, [{ extent: b, width: h }]).segments,
  };
}
