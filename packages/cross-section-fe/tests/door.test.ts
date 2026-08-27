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
  type CrossSection,
  DEFAULT_SECTION_POLICY,
  type Ring,
  sectionProperties,
  shapeOutline,
  type ShapeSpec,
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
    const computation = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(computation.kind).toBe('solved');
    if (computation.kind !== 'solved') return;
    const { state, mesh } = computation;
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
    expect(mesh.kind).toBe('tri6');
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
    const computation = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    // Vor dem Vernetzen verweigert — es gibt kein Netz zum Zeichnen und keine
    // Felder zum Rueckrechnen, und der `kind` sagt das jetzt im Typ.
    expect(computation.kind).toBe('refused');
    expect(computation.state).toEqual({
      status: 'unsupported',
      reason: 'disconnected-areas',
    });
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
    const computation = await computeFESectionValues(
      geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(computation.kind).toBe('solved');
    if (computation.kind !== 'solved') return;
    const { state, diagnostics } = computation;
    expect(state.status).toBe('computed');
    if (state.status !== 'computed') return;
    expect(state.values.It).toBeGreaterThan(0);
    expect(state.values.inverseKappaZ[0]).toBeGreaterThan(1);

    // Der Schubmittelpunkt liegt auf der Symmetrieachse `y = 100 mm`; das Loch
    // ist nur in `z` ausmittig, also verschiebt es allein `zM`.
    expect(state.values.yM).toBeCloseTo(0.1, 5);
    expect(diagnostics.holeCount).toBe(1);
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
    if (coarse.kind !== 'solved') throw new Error('grob verweigert');
    if (fine.kind !== 'solved') throw new Error('fein verweigert');
    const coarseCount = coarse.mesh.elements.length / 6;
    const fineCount = fine.mesh.elements.length / 6;
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

/**
 * DIE VIER PARAMETRISCHEN FORMEN DURCH DIESELBE TUER
 * ([ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)).
 *
 * WAS HIER GEPRUEFT WIRD UND SONST NIRGENDS: dass `shapeOutline` und die
 * Vernetzung zusammen dieselbe Figur ergeben wie die geschlossene Formel. Der
 * Vergleich Umriss/Formel liegt in `cross-section/tests/shape-outline.test.ts`
 * und laeuft ueber Green — er sieht das Netz nie. `state.fingerprint.A` dagegen
 * kommt AUS DEM NETZ. Er prueft damit Umriss UND Vernetzung auf einmal.
 *
 * UND ER LIEGT HIER UND NICHT IN `cross-section`, weil er ein Netz braucht —
 * dessen Suite ist ausdruecklich Emscripten-frei (ADR 0047).
 */
describe('Die parametrische Form laeuft durch dieselbe Tuer', () => {
  /** Der Plattenbalken 2000/200/250/500 — die unsymmetrische Probe. */
  const T_SOLID: ShapeSpec = {
    kind: 't-section',
    bf: 2000,
    hf: 200,
    bw: 250,
    h: 500,
    idealisation: 'solid',
  };

  /** Form ausschreiben, Umriss ableiten — genau der Weg der Anwendung. */
  function geometryOf(shape: ShapeSpec) {
    const rings = shapeOutline(shape);
    if (rings === undefined) throw new Error('shapeOutline lieferte undefined');
    return createSectionGeometry(
      { kind: 'outline', rings },
      DEFAULT_SECTION_POLICY,
    );
  }

  const shapes = [
    ['rectangle 200 x 300', { kind: 'rectangle', b: 200, h: 300 }],
    [
      'hollow-rectangle solid 300 x 500 x 20',
      { kind: 'hollow-rectangle', b: 300, h: 500, t: 20, idealisation: 'solid' },
    ],
    [
      'i-symmetric solid (IPE-300-Masse)',
      {
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation: 'solid',
      },
    ],
    ['t-section solid (Plattenbalken)', T_SOLID],
  ] as const satisfies readonly (readonly [string, ShapeSpec])[];

  for (const [name, shape] of shapes) {
    it(`${name}: der Fingerabdruck trifft den Formelwert`, async () => {
      const computation = await computeFESectionValues(
        geometryOf(shape),
        DEFAULT_SECTION_POLICY,
      );
      expect(computation.kind, name).toBe('solved');
      if (computation.kind !== 'solved') return;
      const { state } = computation;
      expect(state.status, name).toBe('computed');
      if (state.status !== 'computed') return;

      const formula = sectionProperties({ kind: 'shape', id: 's', shape });
      expect(formula, name).toBeDefined();
      if (formula === undefined) return;

      // DAS NETZ IST EINE NAEHERUNG DER FLAECHE, aber auf einer geradlinig
      // berandeten Figur eine exakte: es wird nichts abgeschnitten und nichts
      // hinzugefuegt. Weicht `A` hier ab, beschreibt der Umriss eine ANDERE
      // Figur als die Formel — und beide Zahlen blieben fuer sich plausibel.
      expect(Math.abs(state.fingerprint.A / formula.A - 1), name).toBeLessThan(
        1e-9,
      );
      expect(Math.abs(state.fingerprint.Iy / formula.Iy - 1), name).toBeLessThan(
        1e-6,
      );

      // Und was die Formel NICHT hat, steht jetzt da.
      expect(state.values.It, name).toBeGreaterThan(0);
    });
  }

  it('traegt der Block die Werte an sectionProperties zurueck', async () => {
    // DER GANZE UMBAU IN VIER SCHRITTEN: Form ausschreiben, rechnen, an den
    // Satz haengen, ablesen. Das T ist der Fall, an dem man es sieht — die
    // einzige unsymmetrische Form.
    const { state } = await computeFESectionValues(
      geometryOf(T_SOLID),
      DEFAULT_SECTION_POLICY,
    );
    const before = sectionProperties({ kind: 'shape', id: 't', shape: T_SOLID });
    const cs: CrossSection = {
      kind: 'shape',
      id: 't',
      shape: T_SOLID,
      feValues: state,
    };
    const after = sectionProperties(cs);
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    if (before === undefined || after === undefined) return;

    // VORHER: schubstarr, kein It, kein Schubmittelpunkt in z.
    expect(before.It).toBeUndefined();
    expect(before.zM).toBeUndefined();
    expect(before.kappaZ).toBeUndefined();
    expect(before.inverseKappaZ).toBeUndefined();

    // NACHHER: die drei stehen da — und die Werte der Umrissfigur haben sich
    // NICHT bewegt. Sie sind geschlossene Formel und das Orakel der FE.
    expect(after.A).toBe(before.A);
    expect(after.Iy).toBe(before.Iy);
    expect(after.zs).toBe(before.zs);
    expect(after.It as number).toBeGreaterThan(0);
    expect(after.zM as number).toBeGreaterThan(0);
    expect(after.inverseKappaZ?.[0] as number).toBeGreaterThan(1);

    // kappa steht weiterhin NICHT da: es haengt an ν, und das kennt der
    // Querschnitt nicht (ADR 0045) — auch die parametrische Form nicht.
    expect(after.kappaZ).toBeUndefined();

    // Der Schubmittelpunkt liegt auf der Symmetrieachse. `yM = 0` ist die
    // EXAKTE Zahl der Formel und wird vom FE-Block nicht ueberschrieben.
    expect(after.yM).toBe(0);
  });

  it('liegt zM des soliden T NICHT in der Gurtmitte', async () => {
    // Die duennwandige Antwort war `hf/2 = 100 mm` — eine Aussage ueber ZWEI
    // LINIEN, die sich in einem Punkt schneiden. Der Vollquerschnitt hat keine
    // Linien; sein Schubmittelpunkt nach Trefftz liegt woanders. Dass er es
    // tut, ist der Grund, warum die Form die duennwandige Formel nicht einfach
    // erben durfte.
    const { state } = await computeFESectionValues(
      geometryOf(T_SOLID),
      DEFAULT_SECTION_POLICY,
    );
    const properties = sectionProperties({
      kind: 'shape',
      id: 't',
      shape: T_SOLID,
      feValues: state,
    });
    expect(properties?.zM).toBeDefined();
    expect(Math.abs((properties?.zM as number) - 0.1)).toBeGreaterThan(1e-4);
  });

  it('faellt kappa des soliden T unter den Grashof-Wert', async () => {
    // DIE GEMESSENE LUECKE, in einem Satz: Grashof lag zu schubsteif
    // (`docs/messungen/t-querschnitt-grashof-gegen-fe.md`). Der alte Zweig
    // rechnete `kappaZ` aus Flaechenschnitten durch die volle Figur und kam
    // beim breiten Plattenbalken auf 0,3358; die FE rechnet die Schubenergie
    // des Feldes. Bei ν = 0 ist `kappa = 1/d0`.
    const computation = await computeFESectionValues(
      geometryOf(T_SOLID),
      DEFAULT_SECTION_POLICY,
    );
    if (computation.state.status !== 'computed') throw new Error('verweigert');
    const kappaZ = 1 / computation.state.values.inverseKappaZ[0];

    expect(kappaZ).toBeGreaterThan(0);
    expect(kappaZ).toBeLessThan(0.3358);
  });
});

/**
 * DER PRUEFSTEIN VON ADR 0064: die Bewehrung erreicht dieses Package NICHT.
 *
 * Der Satz trägt seit ADR 0064 ein Feld `reinforcement`; die Tür hier nimmt
 * eine `SectionGeometry`, EINE EBENE TIEFER, und kann es deshalb gar nicht
 * gereicht bekommen. „Die Querschnittswerte ändern sich nicht" ist damit kein
 * Versprechen, sondern der Typ.
 *
 * KEIN NEUER CODE IN DIESEM PACKAGE, nur der Beleg. Müsste hier etwas
 * angefasst werden, säße das Feld falsch — derselbe Prüfstein, an dem sich
 * schon ADR 0062 gemessen hat.
 */
describe('Die Bewehrung laesst die FE unberuehrt (ADR 0064)', () => {
  const RECHTECK: ShapeSpec = { kind: 'rectangle', b: 300, h: 500 };

  it('liefert denselben Fingerabdruck mit und ohne reinforcement', async () => {
    const rings = shapeOutline(RECHTECK);
    if (rings === undefined) throw new Error('shapeOutline lieferte undefined');
    const geometry = createSectionGeometry(
      { kind: 'outline', rings },
      DEFAULT_SECTION_POLICY,
    );

    // Der bewehrte Satz. Er reicht der Tuer NUR seine `geometry` — mehr nimmt
    // sie nicht entgegen, und genau das ist die Aussage.
    const bewehrt: CrossSection = {
      kind: 'section-geometry',
      id: 'r-300x500',
      geometry,
      reinforcement: [
        {
          id: 'unten',
          elements: [
            { id: 'u1', y: -100, z: 450, As: 4.52, Asmax: 8.04 },
            { id: 'u2', y: 0, z: 450, As: 4.52, Asmax: 8.04 },
            { id: 'u3', y: 100, z: 450, As: 4.52, Asmax: 8.04 },
          ],
        },
      ],
    };

    const computation = await computeFESectionValues(
      bewehrt.geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(computation.kind).toBe('solved');
    if (computation.kind !== 'solved') return;
    const { state } = computation;
    expect(state.status).toBe('computed');
    if (state.status !== 'computed') return;

    // Der Fingerabdruck ist der der BETONFIGUR, nicht des bewehrten
    // Querschnitts: `A = 300 · 500 mm² = 0,15 m²`.
    expect(state.fingerprint.A).toBeCloseTo(0.15, 9);

    const formula = sectionProperties(bewehrt);
    expect(formula).toBeDefined();
    if (formula === undefined) return;
    expect(Math.abs(state.fingerprint.A / formula.A - 1)).toBeLessThan(1e-9);
    expect(Math.abs(state.fingerprint.Iy / formula.Iy - 1)).toBeLessThan(1e-6);
  });
});
