import { describe, expect, it } from 'vitest';
import { sectionStresses } from '../src/index';
import { byNr, iSection } from './sections';

/**
 * `σv = sqrt(σ² + 3τ²)` hat zwei reine Fälle, und beide sind ohne Werkzeug
 * nachprüfbar. Der Faktor 3 kommt aus der Gestaltänderungsenergie und nicht aus
 * EN 1993 — deshalb steht σv in diesem werkstofffreien Package (ADR 0054/0056).
 */

const stresses = (forces: Parameters<typeof sectionStresses>[1]) => {
  const rows = sectionStresses(iSection(), forces);
  if (rows === undefined) throw new Error('das I hat Spannungspunkte');

  return rows;
};

describe('σv in den beiden reinen Fällen', () => {
  it('fällt bei τ = 0 auf |σ| zurück', () => {
    // Reine Biegung: der Schubfluss ist überall null, also bleibt der Betrag
    // der Normalspannung stehen — auch dort, wo σ negativ ist.
    const rows = stresses({ My: 100 });

    for (const row of rows) {
      expect(row.tau, `P${row.nr}`).toBe(0);
      expect(row.sigmaV, `P${row.nr}`).toBeCloseTo(Math.abs(row.sigma), 12);
    }
    expect(byNr(rows, 1).sigma).toBeLessThan(0);
  });

  it('liefert bei σ = 0 genau √3·|τ|', () => {
    // Reine Querkraft: σ ist überall null. Der Stegpunkt im Schwerpunkt (P15)
    // trägt das grösste τ, also auch das grösste σv.
    const rows = stresses({ Vz: 50 });
    const mitte = byNr(rows, 15);

    for (const row of rows) {
      expect(row.sigma, `P${row.nr}`).toBe(0);
      expect(row.sigmaV, `P${row.nr}`).toBeCloseTo(
        Math.sqrt(3) * Math.abs(row.tau),
        12,
      );
    }
    expect(mitte.sigmaV).toBeCloseTo(Math.sqrt(3) * Math.abs(mitte.tau), 12);
  });

  it('ist nie negativ und nie kleiner als jeder der beiden Anteile', () => {
    const rows = stresses({ N: 250, My: 100, Vz: 50 });

    for (const row of rows) {
      expect(row.sigmaV, `P${row.nr}`).toBeGreaterThanOrEqual(
        Math.abs(row.sigma),
      );
      expect(row.sigmaV, `P${row.nr}`).toBeGreaterThanOrEqual(
        Math.sqrt(3) * Math.abs(row.tau) - 1e-9,
      );
    }
  });
});
