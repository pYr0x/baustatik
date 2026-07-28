/**
 * Was von dieser Datei uebrig ist, nachdem die Kondensation nach
 * `@baustatik/fem-element` gezogen ist (ADR 0018): die Transformation.
 *
 * Die frueheren `condense`-Tests — „Pivot 0 kehrt still zurueck" — haben sich
 * umgekehrt und wohnen jetzt in `fem-element/tests/condense.test.ts` als
 * „`prepare` wirft" sowie in `solve.test.ts` als Modellfehler. Der Fall, den
 * sie beschrieben, ist keine zulaessige Eingabe mehr.
 */

import { describe, expect, it } from 'vitest';
import { transformationMatrix } from '../src/element-matrix';

describe('transformationMatrix', () => {
  it('ist orthogonal, damit T^T K T gueltig bleibt', () => {
    // Der 3x3-Block hat wegen des -1 in der phiY-Zeile die Determinante -1. Das
    // ist zulaessig, SOLANGE er orthogonal ist: nur dann gilt T^-1 = T^T, und
    // nur dann ist T^T K T ueberhaupt die richtige Transformation (ADR 0005).
    const T = transformationMatrix(Math.cos(0.7), Math.sin(0.7));

    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        let sum = 0;
        for (let k = 0; k < 6; k += 1) {
          sum += T[k][r] * T[k][c];
        }
        expect(sum).toBeCloseTo(r === c ? 1 : 0, 14);
      }
    }
  });
});
