import { Line, Point } from '@baustatik/fem-geometry';
import { describe, expect, it } from 'vitest';
import { referenceFactor } from '../src/reference-length';

// 3-4-5-Dreieck: die Faktoren werden dadurch glatt (0.6 / 0.8) und lassen sich
// mit `toBe` statt `toBeCloseTo` pruefen — ein ungenauer Test wuerde genau die
// Verwechslung von dx und dz durchgehen lassen, um die es hier geht.
const HORIZONTAL = Line.make(Point.make(0, 0), Point.make(100, 0));
const VERTICAL = Line.make(Point.make(0, 0), Point.make(0, 50));
const SLOPED = Line.make(Point.make(0, 0), Point.make(3, 4));
const SLOPED_BACKWARDS = Line.make(Point.make(3, 4), Point.make(0, 0));

describe('referenceFactor', () => {
  it("'trueLength' ist exakt 1, unabhaengig von der Stablage", () => {
    // Nicht L/L: der haeufigste Fall soll kein Rundungsrauschen einschleppen.
    expect(referenceFactor('trueLength', HORIZONTAL)).toBe(1);
    expect(referenceFactor('trueLength', SLOPED)).toBe(1);
    expect(referenceFactor('trueLength', VERTICAL)).toBe(1);
  });

  // Der eigentliche Test: die Namen folgen der GEMESSENEN Achse, nicht dem
  // RFEM-Dialogtext. 'horizontalProjection' misst x — RFEM nennt dieselbe
  // Option "Projektion in Z". Wer die Zuordnung dreht, faellt hier durch.
  it("'horizontalProjection' misst die x-Ausdehnung", () => {
    expect(referenceFactor('horizontalProjection', SLOPED)).toBe(3 / 5);
    expect(referenceFactor('horizontalProjection', HORIZONTAL)).toBe(1);
    expect(referenceFactor('horizontalProjection', VERTICAL)).toBe(0);
  });

  it("'verticalProjection' misst die z-Ausdehnung", () => {
    expect(referenceFactor('verticalProjection', SLOPED)).toBe(4 / 5);
    expect(referenceFactor('verticalProjection', VERTICAL)).toBe(1);
    expect(referenceFactor('verticalProjection', HORIZONTAL)).toBe(0);
  });

  it('haengt nicht an der Knotenreihenfolge — die Ausdehnung ist ein Betrag', () => {
    expect(referenceFactor('horizontalProjection', SLOPED_BACKWARDS)).toBe(
      referenceFactor('horizontalProjection', SLOPED),
    );
    expect(referenceFactor('verticalProjection', SLOPED_BACKWARDS)).toBe(
      referenceFactor('verticalProjection', SLOPED),
    );
  });

  // Der Schneefall: der Anwender gibt q je GRUNDRISSlaenge ein, die
  // Gesamtresultierende muss q * |dx| sein. Das ist die Rechnung, wegen der es
  // den Faktor ueberhaupt gibt.
  it('die Gesamtlast auf dem schraegen Stab ist q mal die Grundrisslaenge', () => {
    const q = 0.85;
    const L = Line.length(SLOPED);
    const total = q * referenceFactor('horizontalProjection', SLOPED) * L;

    expect(total).toBeCloseTo(q * 3, 12);
  });
});
