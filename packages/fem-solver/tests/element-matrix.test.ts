import { describe, expect, it } from 'vitest';
import { condense, transformationMatrix } from '../src/element-matrix';

describe('condense', () => {
  it('laesst einen bereits entkoppelten Freiheitsgrad in Ruhe', () => {
    // Die Schutzklausel gegen Pivot 0. Ohne sie schleppte eine Division durch 0
    // ein NaN in die globale Steifigkeitsmatrix — weit weg von der Ursache und
    // erst am Ergebnis sichtbar.
    const K = [
      [2, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 4, 0, 0],
      [0, 0, 0, 0, 5, 0],
      [0, 0, 0, 0, 0, 6],
    ];
    const f = [1, 1, 1, 1, 1, 1];

    condense(K, f, 2);

    expect(K[0][0]).toBe(2);
    expect(f).toEqual([1, 1, 1, 1, 1, 1]);
    expect(K.flat().every((value) => Number.isFinite(value))).toBe(true);
  });

  it('nullt den Laengsanteil ganz und laesst den zweiten Schritt leerlaufen', () => {
    // Warum die Schutzklausel kein toter Zweig ist: das Laengsgelenk fuehrt
    // GERADEWEGS auf Pivot 0. Nur der axiale 2x2-Block, mit EA/L = 5.
    const k = 5;
    const K = [
      [k, 0, 0, -k, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [-k, 0, 0, k, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    const f = [0, 0, 0, 0, 0, 0];

    condense(K, f, 0);
    // k - (-k)(-k)/k = 0, exakt und nicht bloss klein: die Laengssteifigkeit
    // ist am anderen Ende genauso weg wie am freigesetzten.
    expect(K[3][3]).toBe(0);

    // Und deshalb trifft ein Gelenk am zweiten Ende einen Pivot von exakt 0.
    condense(K, f, 3);
    expect(K.flat().every((value) => value === 0)).toBe(true);
  });
});

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
