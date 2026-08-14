import { describe, expect, it } from 'vitest';
import { kappaFromCoefficients } from '../src/index';

/**
 * Die Koeffizientenform ist die Stelle, an der ν wieder hereinkommt — die
 * einzige, und sie ist drei Zeilen lang (ADR 0045). Genau deshalb hängt hier
 * ein Test: eine falsche Substitution `m = ν/(1+ν)` fiele sonst erst an einer
 * Durchbiegung auf.
 */
describe('kappaFromCoefficients', () => {
  it('liefert bei ν = 0 den Kehrwert von d0', () => {
    // Das Rechteck: `1/κ(0) = 6/5`.
    expect(kappaFromCoefficients([1.2, 0], 0)).toBeCloseTo(5 / 6, 12);
  });

  it('setzt m = ν/(1+ν) ein und quadriert', () => {
    const nu = 0.3;
    const m = nu / (1 + nu);
    expect(kappaFromCoefficients([1.2, 0.5], nu)).toBeCloseTo(
      1 / (1.2 + 0.5 * m * m),
      12,
    );
    // ν = 0,3 heißt m = 0,23077 — die Zahl aus ADR 0045.
    expect(m).toBeCloseTo(0.23077, 5);
  });

  it('antwortet ohne ν mit undefined, nicht mit einer erfundenen Zahl', () => {
    // Beim Holz ist das der ehrliche Fall: orthotrop gibt es kein isotropes ν,
    // und `undefined` heißt SCHUBSTARR — nicht „null Schubfläche".
    expect(kappaFromCoefficients([1.2, 0.5], undefined)).toBeUndefined();
  });

  it('antwortet ohne Koeffizienten mit undefined', () => {
    expect(kappaFromCoefficients(undefined, 0.3)).toBeUndefined();
  });

  it('verweigert eine nicht positive Schubfläche', () => {
    expect(kappaFromCoefficients([0, 0], 0.3)).toBeUndefined();
    expect(kappaFromCoefficients([Number.NaN, 0], 0.3)).toBeUndefined();
  });
});
