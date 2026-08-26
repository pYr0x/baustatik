/**
 * DER TEST, DER DEN GANZEN UMBAU TRAEGT
 * ([ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)).
 *
 * Green ueber `shapeOutline(spec)` gegen `sectionProperties` derselben Form:
 * `A`, `Iy`, `Iz`, `ys`, `zs` auf `1e-12`. Stimmt er nicht, rechnet die FE eine
 * ANDERE FIGUR als die Formel — und niemand saehe es, denn beide Zahlen blieben
 * fuer sich plausibel.
 *
 * ER RECHNET UEBER ZWEI GETRENNTE WEGE. Links steht die geschlossene Formel
 * (`calculation/shapes/`), rechts das Kurvenintegral ueber den ausgeschriebenen
 * Polygonzug (`calculation/green.ts` ueber `Polygon.moments`). Kein Schritt
 * kommt in beiden vor — genau die Rolle, die `tests/oracle.ts` fuer kappa
 * spielt, nur in die andere Richtung: hier ist die FORMEL das Orakel des
 * Umrisses.
 *
 * EXAKT UND NICHT NAEHERUNGSWEISE: alle vier Figuren sind achsparallel und
 * ohne `bulge`, Green integriert ueber gerade Kanten exakt. Eine Abweichung in
 * der zwoelften Stelle waere schon ein Befund.
 */

import { describe, expect, it } from 'vitest';
import { sectionProperties, shapeOutline, type ShapeSpec } from '../src/index';
import { deriveOutlineFromRings } from '../src/geometry/outline/derive-outline-from-rings';
import { greenValues } from '../src/calculation/green';
import { DEFAULT_SECTION_POLICY } from '../src/policy';
import { CM2_TO_M2, CM4_TO_M4, CM_TO_M, MM_TO_CM } from '../src/calculation/units';

/** Die vier Formen, jede in der Idealisierung, in der sie durch die FE geht. */
const SHAPES = [
  ['rectangle 200 x 500', { kind: 'rectangle', b: 200, h: 500 }],
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
  [
    't-section solid (Plattenbalken 2000/200/250/500)',
    {
      kind: 't-section',
      bf: 2000,
      hf: 200,
      bw: 250,
      h: 500,
      idealisation: 'solid',
    },
  ],
] as const satisfies readonly (readonly [string, ShapeSpec])[];

/**
 * Green ueber den ausgeschriebenen Umriss — in SI, wie `sectionProperties`.
 *
 * Der Weg ist DERSELBE, den die FE-Tuer nimmt: Ringe hinein,
 * `deriveOutlineFromRings` zerlegt (hier ohne Bogen, also punktgleich), Green
 * integriert. Die mm der `ShapeSpec` gehen ueber `MM_TO_CM` in die
 * Katalogeinheiten, in denen das Package innen rechnet.
 */
function outlineValues(spec: ShapeSpec) {
  const rings = shapeOutline(spec);
  if (rings === undefined) throw new Error('shapeOutline lieferte undefined');
  const c = MM_TO_CM;
  const outline = deriveOutlineFromRings(rings, DEFAULT_SECTION_POLICY).map(
    (polygon) => ({
      points: polygon.points.map((point) => ({
        y: point.y * c,
        z: point.z * c,
      })),
    }),
  );
  const green = greenValues(outline);
  if (green === undefined) throw new Error('greenValues lieferte undefined');
  return {
    A: green.A * CM2_TO_M2,
    Iy: green.Iy * CM4_TO_M4,
    Iz: green.Iz * CM4_TO_M4,
    Iyz: green.Iyz * CM4_TO_M4,
    ys: green.ys * CM_TO_M,
    zs: green.zs * CM_TO_M,
  };
}

function formulaValues(spec: ShapeSpec) {
  const p = sectionProperties({ kind: 'shape', id: 's', shape: spec });
  if (p === undefined) throw new Error('sectionProperties lieferte undefined');
  return p;
}

describe('Der Umriss ist dieselbe Figur wie die Formel', () => {
  for (const [name, spec] of SHAPES) {
    it(`${name}: A, Iy, Iz, ys, zs treffen die geschlossene Formel`, () => {
      const formula = formulaValues(spec);
      const outline = outlineValues(spec);

      // RELATIV verglichen, nicht absolut: `Iz` des Plattenbalkens ist
      // 1,34e-2 m⁴, `A` des I-Profils 5,3e-3 m² — eine feste Nachkommastelle
      // waere fuer die eine Groesse blind und fuer die andere unerfuellbar.
      expect(outline.A / formula.A - 1).toBeCloseTo(0, 12);
      expect(outline.Iy / formula.Iy - 1).toBeCloseTo(0, 12);
      expect(outline.Iz / formula.Iz - 1).toBeCloseTo(0, 12);
      expect(outline.zs / formula.zs - 1).toBeCloseTo(0, 12);

      // `ys` und `Iyz` sind BEIDE null — alle vier Formen sind zur z-Achse
      // symmetrisch. Hier steht deshalb der absolute Vergleich, gegen das
      // Rauschen der Summe.
      expect(Math.abs(outline.ys)).toBeLessThan(1e-15);
      expect(Math.abs(outline.Iyz)).toBeLessThan(1e-15);
      expect(formula.ys).toBe(0);
    });
  }
});

describe('Die Ringe tragen die Windungsregel', () => {
  it('laeuft jedes Material mit signedArea > 0', () => {
    // ADR 0034: das Vorzeichen IST die Aussage „Material" oder „Loch", und
    // Green liest es. Verkehrt herum gewickelt kaeme ein negatives `A` heraus.
    for (const [name, spec] of SHAPES) {
      const rings = shapeOutline(spec);
      expect(rings, name).toBeDefined();
      expect(signedArea((rings ?? [])[0]?.vertices ?? []), name).toBeGreaterThan(
        0,
      );
    }
  });

  it('traegt der Hohlkasten ZWEI Ringe, den zweiten als Loch', () => {
    const rings = shapeOutline({
      kind: 'hollow-rectangle',
      b: 300,
      h: 500,
      t: 20,
      idealisation: 'solid',
    });
    expect(rings).toHaveLength(2);
    const [material, hole] = rings ?? [];
    expect(signedArea(material?.vertices ?? [])).toBeCloseTo(300 * 500, 9);
    // `(b−2t)·(h−2t)`, negativ — das ist die ganze Lochbehandlung.
    expect(signedArea(hole?.vertices ?? [])).toBeCloseTo(-(260 * 460), 9);
  });

  it('schreibt keine Form einen bulge', () => {
    // Alle vier Figuren sind achsparallel. Ein `bulge` hier hiesse, dass
    // jemand eine Ausrundung erfunden hat, die die Form nicht traegt — das
    // geschweisste I hat ausdruecklich keine.
    for (const [name, spec] of SHAPES) {
      for (const ring of shapeOutline(spec) ?? []) {
        for (const vertex of ring.vertices) {
          expect(vertex.bulge, name).toBeUndefined();
        }
      }
    }
  });
});

describe('Die Punktzahl steht fest', () => {
  it('liefert 4 · 8 · 12 Punkte und 4 + 4 beim Kasten', () => {
    const count = (spec: ShapeSpec) =>
      (shapeOutline(spec) ?? []).map((ring) => ring.vertices.length);
    expect(count({ kind: 'rectangle', b: 200, h: 500 })).toEqual([4]);
    expect(
      count({
        kind: 't-section',
        bf: 2000,
        hf: 200,
        bw: 250,
        h: 500,
        idealisation: 'solid',
      }),
    ).toEqual([8]);
    expect(
      count({
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation: 'solid',
      }),
    ).toEqual([12]);
    expect(
      count({
        kind: 'hollow-rectangle',
        b: 300,
        h: 500,
        t: 20,
        idealisation: 'solid',
      }),
    ).toEqual([4, 4]);
  });
});

describe('Die Gueltigkeit ist geerbt, nicht zweitgeprueft', () => {
  // Dieselbe Grenze wie bei `sectionProperties`: was dort `undefined` liefert,
  // liefert hier keinen Umriss. Eine Form, die Werte haette, aber keinen
  // Umriss (oder umgekehrt), waere genau der Riss, den ADR 0062 zumacht.
  const invalid = [
    ['b = 0', { kind: 'rectangle', b: 0, h: 500 }],
    [
      'Wandstaerke > halbe Hoehe',
      { kind: 'hollow-rectangle', b: 60, h: 60, t: 40, idealisation: 'solid' },
    ],
    [
      'Steg breiter als Gurt',
      {
        kind: 't-section',
        bf: 100,
        hf: 20,
        bw: 200,
        h: 300,
        idealisation: 'solid',
      },
    ],
    [
      'Gurte dicker als die halbe Hoehe',
      {
        kind: 'i-symmetric',
        h: 20,
        b: 100,
        tw: 5,
        tf: 20,
        idealisation: 'solid',
      },
    ],
  ] as const satisfies readonly (readonly [string, ShapeSpec])[];

  for (const [name, spec] of invalid) {
    it(`${name}: kein Umriss, und auch keine Werte`, () => {
      expect(shapeOutline(spec)).toBeUndefined();
      expect(
        sectionProperties({ kind: 'shape', id: 's', shape: spec }),
      ).toBeUndefined();
    });
  }
});

/** Die Schnuersenkelformel — unabhaengig von `Polygon.moments` hingeschrieben. */
function signedArea(
  vertices: readonly { readonly y: number; readonly z: number }[],
): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (a === undefined || b === undefined) continue;
    sum += a.y * b.z - b.y * a.z;
  }
  return sum / 2;
}
