import type { cm } from '@baustatik/units';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Das Vollrechteck. IMMER kompakt — ein duennwandiges Rechteck gibt es nicht,
 * deshalb traegt `ShapeSpec` fuer diese Form auch kein `idealisation`.
 *
 * KEIN SCHUBFLUSSWEG MEHR, und diese Form ist die einzige, die ihn KOMPLETT
 * verliert: sie ist solid-only, und seit
 * [ADR 0062](../../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
 * kommt κ des Vollquerschnitts aus der FE. Vorher fiel hier exakt 5/6 aus der
 * Schubenergie — der Beweis, dass die Definition in `calculation/shear.ts`
 * stimmt. ER GEHT NICHT VERLOREN, er wandert in `tests/kappa.test.ts` und
 * prueft `shearArea` unmittelbar, mit dem Rechteckweg aus `partIntervals`.
 *
 * Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der Oberkante.
 * Abmessungen in ZENTIMETERN; `shapeValues` hat die mm der `ShapeSpec` bereits
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
    // `It` steht hier NICHT: es ist `k(b/h)·h·b³` mit einer Reihe, die aus der
    // Loesung eines Randwertproblems faellt. Sie hinzuschreiben hiesse, eine
    // Naeherung als Wert auszugeben — geloest wird sie von der FE, ueber
    // `shapeOutline` (ADR 0062).
    It: undefined,
  };
}
