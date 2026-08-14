/**
 * Die async Tuer, von aussen.
 *
 * WAS HIER GEPRUEFT WIRD UND SONST NIRGENDS: die Einheitenkette. Der Umriss
 * fuehrt Millimeter, `FESectionValues` steht in SI — dazwischen liegt genau ein
 * Faktor, und ein vergessener macht aus `It` eine Zahl, die um 10¹² danebenliegt
 * und trotzdem plausibel aussieht.
 */

import {
  createSectionGeometry,
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  type Ring,
  sectionProperties,
  type Vertex,
} from '@baustatik/cross-section';
import { describe, expect, it } from 'vitest';
import { computeFESectionValues } from '../src/index';

/** Ein achsparalleles Rechteck als Eingabering, in Millimetern. */
function rectangle(b: number, h: number): Ring {
  const vertices: Vertex[] = [
    { y: 0, z: 0 },
    { y: b, z: 0 },
    { y: b, z: h },
    { y: 0, z: h },
  ];
  return { vertices };
}

/** Dasselbe Rechteck, umgekehrt gewickelt — ein Loch (ADR 0034). */
function hole(y0: number, z0: number, b: number, h: number): Ring {
  return {
    vertices: [
      { y: y0, z: z0 },
      { y: y0, z: z0 + h },
      { y: y0 + b, z: z0 + h },
      { y: y0 + b, z: z0 },
    ],
  };
}

describe('computeFESectionValues', () => {
  it('liefert die Werte des Rechtecks 200 x 300 in SI', async () => {
    const geometry = createSectionGeometry(
      { kind: 'outline', rings: [rectangle(200, 300)] },
      DEFAULT_SECTION_POLICY,
    );
    const { state, mesh } = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(state.status).toBe('computed');
    if (state.status !== 'computed') return;

    // `It` des Rechtecks nach der Fourierreihe, lange Seite `h = 0,3 m`.
    let series = 0;
    for (let n = 1; n <= 199; n += 2) {
      series += Math.tanh((n * Math.PI * 0.3) / (2 * 0.2)) / n ** 5;
    }
    const closed =
      (1 / 3) * 0.3 * 0.2 ** 3 * (1 - (192 / Math.PI ** 5) * (0.2 / 0.3) * series);
    expect(Math.abs(state.values.It / closed - 1)).toBeLessThan(2e-3);

    // Der Schubmittelpunkt steht im EINGABESYSTEM des Umrisses — also in der
    // Mitte der Figur, nicht im Ursprung.
    expect(state.values.yM).toBeCloseTo(0.1, 5);
    expect(state.values.zM).toBeCloseTo(0.15, 5);

    // `1/κ` bei m = 0 ist `d0`, und das ist 6/5.
    expect(state.values.inverseKappaZ[0]).toBeCloseTo(1.2, 9);
    expect(state.values.inverseKappaY[0]).toBeCloseTo(1.2, 9);

    expect(state.fingerprint.A).toBeCloseTo(0.06, 9);
    expect(mesh?.kind).toBe('tri6');
  });

  it('haengt die Werte an die Geometrie und traegt sie durch sectionProperties', async () => {
    const geometry = createSectionGeometry(
      { kind: 'outline', rings: [rectangle(200, 300)] },
      DEFAULT_SECTION_POLICY,
    );
    const { state } = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    const properties = sectionProperties(
      {
        kind: 'section-geometry',
        id: 'rechteck',
        geometry: { ...geometry, feValues: state },
      },
      DEFAULT_SECTION_POLICY,
    );
    expect(properties).toBeDefined();
    if (properties === undefined) return;

    // Die cm-Zwischenwelt darf hier nichts kaputtmachen: SI hinein, SI heraus.
    expect(properties.It).toBeCloseTo(
      state.status === 'computed' ? state.values.It : 0,
      12,
    );
    expect(properties.yM).toBeCloseTo(0.1, 6);
    // kappa steht NICHT da — es haengt an ν, und das kennt der Querschnitt
    // nicht (ADR 0045).
    expect(properties.kappaZ).toBeUndefined();
    expect(properties.inverseKappaZ?.[0]).toBeCloseTo(1.2, 9);
  });

  it('verweigert zwei getrennte Materialflaechen, ohne zu vernetzen', async () => {
    const geometry = createSectionGeometry(
      {
        kind: 'outline',
        rings: [rectangle(100, 100), { vertices: [
          { y: 300, z: 0 },
          { y: 400, z: 0 },
          { y: 400, z: 100 },
          { y: 300, z: 100 },
        ] }],
      },
      DEFAULT_SECTION_POLICY,
    );
    const { state, mesh } = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(state).toEqual({
      status: 'unsupported',
      reason: 'disconnected-areas',
    });
    // Vor dem Vernetzen verweigert — es gibt kein Netz zum Zeichnen.
    expect(mesh).toBeUndefined();
  });

  it('rechnet ein Loch NEBEN der Biegeachse durch', async () => {
    // DER BELEG FUER DEN GANZEN UMBAU. Dieselbe Figur — Kasten 200 × 400, Loch
    // 60 × 120 bei z = 210, also 10 mm aus der Achse — hat bis ADR 0048
    // `hole-off-bending-axis` geliefert: die Spannungsfunktion `Φ` war je
    // Randschleife nur bis auf eine Konstante bestimmt, und ihr Randdatum
    // schloss nicht. Ueber eine Verschiebung gerechnet gibt es die Bedingung
    // nicht mehr.
    const geometry = createSectionGeometry(
      {
        kind: 'outline',
        rings: [rectangle(200, 400), hole(70, 210, 60, 120)],
      },
      DEFAULT_SECTION_POLICY,
    );
    const { state, diagnostics } = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(state.status).toBe('computed');
    if (state.status !== 'computed') return;
    expect(state.values.It).toBeGreaterThan(0);
    expect(state.values.inverseKappaZ[0]).toBeGreaterThan(1);

    // Der Schubmittelpunkt liegt auf der Symmetrieachse `y = 100 mm`; das Loch
    // ist nur in `z` ausmittig, also verschiebt es allein `zM`.
    expect(state.values.yM).toBeCloseTo(0.1, 5);
    expect(diagnostics?.holeCount).toBe(1);
  });

  it('laesst FEElements die Netzdichte steuern, ohne die Zahl zu bewegen', async () => {
    const geometry = createSectionGeometry(
      { kind: 'outline', rings: [rectangle(200, 300)] },
      DEFAULT_SECTION_POLICY,
    );
    const coarse = await computeFESectionValues(
      geometry,
      createSectionPolicy({ FEElements: 600 }),
    );
    const fine = await computeFESectionValues(
      geometry,
      createSectionPolicy({ FEElements: 6000 }),
    );
    const coarseCount = (coarse.mesh?.elements.length ?? 0) / 6;
    const fineCount = (fine.mesh?.elements.length ?? 0) / 6;
    expect(fineCount).toBeGreaterThan(coarseCount * 5);

    // DAS IST DER BELEG STATT EINES KONVERGENZLAUFS: hochdrehen, und die Zahl
    // bleibt stehen.
    if (coarse.state.status !== 'computed') throw new Error('grob verweigert');
    if (fine.state.status !== 'computed') throw new Error('fein verweigert');
    expect(
      Math.abs(
        coarse.state.values.inverseKappaZ[0] /
          fine.state.values.inverseKappaZ[0] -
          1,
      ),
    ).toBeLessThan(1e-6);
  });
});
