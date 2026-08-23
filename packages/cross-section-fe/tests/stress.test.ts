/**
 * DIE ORAKEL DER SPANNUNGSRUECKRECHNUNG (ADR 0061).
 *
 * Sie vernetzen und loesen echt und brauchen die gebauten `pkg/`-Artefakte —
 * dieselbe Haltung wie `oracles.test.ts`.
 *
 * KEIN QUERVERGLEICH GEGEN `stressesAtPoints`. Naheliegend, weil σ dieselbe
 * Formel ist — aber er holte die Kopplung zurueck, die ADR 0061 entfernt, und
 * ein geaenderter Vorzeichenentscheid drueben liesse den FE-Test aus einem
 * Grund fallen, der mit der FE nichts zu tun hat. Stattdessen Handrechnung.
 *
 * WIE INTEGRIERT WIRD. Die Gleichgewichtsproben brauchen ein Flaechenintegral
 * ueber das zurueckgegebene Feld. Genommen wird die KNOTENFORM, interpoliert
 * mit den Tri6-Formfunktionen und integriert mit `TRIANGLE_6` (exakt bis
 * Grad 4) — derselben Regel, mit der `prepare.ts` `A`, `Iy`, `Iz` und `Iyz`
 * gewinnt. Fuer σ faellt die Identitaet damit maschinengenau heraus, weil σ
 * linear ist und ein Tri6-Feld das exakt traegt. Fuer τ nicht: dort steht die
 * GEMITTELTE Form gegen die stueckweise unstetige, aus der die Resultierende
 * exakt faellt, und der Rest ist der Glaettungsfehler.
 */

import { atOrThrow } from '@baustatik/core';
import type { Mesh2DInput } from '@baustatik/mesh-2d-wasm';
import type { SectionForces } from '@baustatik/section-forces';
import { describe, expect, it } from 'vitest';
import { computeFromMesh, type FEFields } from '../src/compute';
import { InvalidPoissonRatioError } from '../src/errors';
import { elementNodes, type FESection, prepareSection } from '../src/prepare';
import { getMesher, getSolver } from '../src/runtime';
import {
  type FEStressField,
  recoverStresses,
  type StressAtNode,
} from '../src/stress';
import { elementPoints, TRIANGLE_6 } from '../src/tri6';
import { KN_TO_N, KNM_TO_NM, M_TO_MM, PA_TO_MPA } from '../src/units';

/** Wie viele Elemente die Orakel bekommen. */
const ELEMENTS = 6000;

/** Was ein Lauf hinterlaesst: die Felder und das Netz, auf dem sie stehen. */
type Run = {
  readonly fields: FEFields;
  readonly section: FESection;
};

async function run(
  rings: Mesh2DInput['rings'],
  A: number,
  elements = ELEMENTS,
): Promise<Run> {
  const [mesher, solve] = await Promise.all([getMesher(), getSolver()]);
  const mesh = mesher({
    rings,
    element: 'tri6',
    maxElementArea: A / elements,
    switches: { quality: true },
  });
  const section = prepareSection(mesh);
  return { fields: computeFromMesh(section, solve).fields, section };
}

function rectangleRing(b: number, h: number): Float64Array {
  return Float64Array.of(
    -b / 2,
    -h / 2,
    b / 2,
    -h / 2,
    b / 2,
    h / 2,
    -b / 2,
    h / 2,
  );
}

/** Dasselbe Rechteck, um `theta` gedreht — die einfachste Figur mit `Iyz ≠ 0`. */
function tiltedRectangleRing(
  b: number,
  h: number,
  theta: number,
): Float64Array {
  const ring = rectangleRing(b, h);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const turned = new Float64Array(ring.length);
  for (let at = 0; at < ring.length; at += 2) {
    const y = atOrThrow(ring, at);
    const z = atOrThrow(ring, at + 1);
    turned[at] = y * cos - z * sin;
    turned[at + 1] = y * sin + z * cos;
  }
  return turned;
}

function discRing(a: number, segments: number): Float64Array {
  const points = new Float64Array(2 * segments);
  for (let index = 0; index < segments; index += 1) {
    const angle = (2 * Math.PI * index) / segments;
    points[2 * index] = a * Math.cos(angle);
    points[2 * index + 1] = a * Math.sin(angle);
  }
  return points;
}

/**
 * Ein L mit einer einspringenden Ecke bei `(f, f)` — die Figur, an der `τ`
 * singulaer ist und die Diagnosen deshalb NICHT konvergieren.
 */
function angleRing(size: number, f: number): Float64Array {
  return Float64Array.of(0, 0, size, 0, size, f, f, f, f, size, 0, size);
}

/** Der Stahl-T 200/15/10/200 aus `docs/messungen/t-querschnitt-grashof-gegen-fe.md`. */
function steelTeeRing(): Float64Array {
  const bf = 0.2;
  const tf = 0.015;
  const bw = 0.01;
  const h = 0.2;
  return Float64Array.of(
    -bf / 2,
    0,
    bf / 2,
    0,
    bf / 2,
    tf,
    bw / 2,
    tf,
    bw / 2,
    h,
    -bw / 2,
    h,
    -bw / 2,
    tf,
    -bf / 2,
    tf,
  );
}

/** Eine Knotengroesse zurueck in SI, indiziert wie das Netz. */
function nodal(
  field: FEStressField,
  key: 'sigma' | 'tauY' | 'tauZ',
): Float64Array {
  const values = new Float64Array(field.nodes.length);
  for (const row of field.nodes) values[row.nr] = row[key] / PA_TO_MPA;
  return values;
}

/**
 * `∫ weight(y, z)·v dA` ueber das Netz, mit `v` als Tri6-Interpolierter der
 * Knotenwerte. `TRIANGLE_6` ist exakt bis Grad 4.
 */
function integrate(
  section: FESection,
  values: Float64Array,
  weight: (y: number, z: number) => number,
): number {
  let total = 0;
  const ey = new Float64Array(6);
  const ez = new Float64Array(6);
  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      ey[i] = atOrThrow(section.y, node);
      ez[i] = atOrThrow(section.z, node);
    }
    for (const point of elementPoints(TRIANGLE_6, ey, ez)) {
      let v = 0;
      for (let i = 0; i < 6; i += 1) {
        v += atOrThrow(values, atOrThrow(nodes, i)) * atOrThrow(point.N, i);
      }
      total += weight(point.y, point.z) * v * point.weight;
    }
  }
  return total;
}

/** Der Knoten, der `pick` maximiert. */
function extreme(
  field: FEStressField,
  pick: (row: StressAtNode) => number,
): StressAtNode {
  let best = atOrThrow(field.nodes, 0);
  for (const row of field.nodes) {
    if (pick(row) > pick(best)) best = row;
  }
  return best;
}

const ONE = 1;

describe('Der gekoppelte Vorzeichentest', () => {
  it('haelt alle drei Schubgleichgewichte an einer Figur mit Iyz != 0', async () => {
    // EIN AUFRUF, ALLE SECHS SCHNITTGROESSEN. Er prueft die Rahmenalgebra,
    // beide Vorzeichen aus `theta + π/2`, die Rueckdrehung und den Weber-Abzug
    // in einem Zug — ein Vorzeichendreher an irgendeiner davon bricht eines der
    // drei Integrale um Groessenordnungen und nicht um Prozente.
    const b = 1;
    const h = 2;
    const { fields, section } = await run(
      [{ kind: 'material', coordinates: tiltedRectangleRing(b, h, Math.PI / 6) }],
      b * h,
    );
    const forces: SectionForces = {
      N: 500,
      Vy: 300,
      Vz: -700,
      My: 120,
      Mz: -80,
      Mt: 45,
    };
    const field = recoverStresses(fields, forces, 0.3);
    const tauY = nodal(field, 'tauY');
    const tauZ = nodal(field, 'tauZ');

    const Fy = integrate(section, tauY, () => ONE);
    const Fz = integrate(section, tauZ, () => ONE);
    const Mx =
      integrate(section, tauZ, (y) => y) - integrate(section, tauY, (_y, z) => z);

    expect(Fy / ((forces.Vy ?? 0) * KN_TO_N)).toBeCloseTo(1, 2);
    expect(Fz / ((forces.Vz ?? 0) * KN_TO_N)).toBeCloseTo(1, 2);
    expect(Mx / ((forces.Mt ?? 0) * KNM_TO_NM)).toBeCloseTo(1, 2);
  });
});

describe('Das Gleichgewicht von sigma', () => {
  it('gibt N, My und -Mz aus demselben Netz zurueck', async () => {
    // KEIN NETZTEST. Die Momente kommen aus demselben Netz mit derselben
    // Quadratur, mit der `prepare.ts` `A`, `Iy`, `Iz` und `Iyz` gewonnen hat —
    // die Identitaet faellt heraus. Was sie findet, ist ein Vorzeichendreher in
    // der 2x2-Aufloesung. OHNE `Mz` bliebe der ganze `Iyz`-Zweig ungeprueft.
    const b = 1;
    const h = 2;
    const { fields, section } = await run(
      [{ kind: 'material', coordinates: tiltedRectangleRing(b, h, Math.PI / 6) }],
      b * h,
    );
    const forces: SectionForces = { N: 500, My: 120, Mz: -80 };
    const field = recoverStresses(fields, forces, 0.3);
    const sigma = nodal(field, 'sigma');

    expect(integrate(section, sigma, () => ONE)).toBeCloseTo(
      (forces.N ?? 0) * KN_TO_N,
      3,
    );
    expect(integrate(section, sigma, (_y, z) => z)).toBeCloseTo(
      (forces.My ?? 0) * KNM_TO_NM,
      3,
    );
    expect(integrate(section, sigma, (y) => y)).toBeCloseTo(
      -(forces.Mz ?? 0) * KNM_TO_NM,
      3,
    );
  });
});

describe('sigma am Rechteck, gegen die Handrechnung', () => {
  it('traegt die Einheitenkette von kNm bis MPa', async () => {
    // Rechteck 200 x 300 mm: A = 60000 mm², Iy = 4,5e8 mm⁴.
    //   N  = 500 kN   -> 500000 N / 60000 mm²          =  8,3333 MPa
    //   My = 100 kNm  -> 1e8 Nmm · 150 mm / 4,5e8 mm⁴  = 33,3333 MPa
    const { fields } = await run(
      [{ kind: 'material', coordinates: rectangleRing(0.2, 0.3) }],
      0.06,
    );
    const field = recoverStresses(fields, { N: 500, My: 100 }, 0.3);

    const top = extreme(field, (row) => row.z);
    expect(top.z).toBeCloseTo(150, 9);
    expect(top.sigma).toBeCloseTo(8.3333333 + 33.3333333, 5);

    const bottom = extreme(field, (row) => -row.z);
    expect(bottom.z).toBeCloseTo(-150, 9);
    expect(bottom.sigma).toBeCloseTo(8.3333333 - 33.3333333, 5);

    // `My > 0` ist Zug auf `+z` (ADR 0060) — und das ist hier das Vorzeichen
    // und nicht nur der Betrag.
    expect(top.sigma).toBeGreaterThan(bottom.sigma);
  });
});

describe('Der Kreis unter Mt', () => {
  it('trifft tau = Mt·r/Ip nach Betrag und Richtung', async () => {
    // DAS SCHAERFSTE ORAKEL DER TORSION — und BLIND FUER ω SELBST: beim Kreis
    // ist `ω ≡ 0`. Es prueft die Formel, die Drehinvarianz und die Einheiten.
    const a = 1;
    const { fields } = await run(
      [{ kind: 'material', coordinates: discRing(a, 360) }],
      Math.PI * a * a,
    );
    const Mt = 100;
    const field = recoverStresses(fields, { Mt }, 0.3);

    const Ip = (Math.PI * a ** 4) / 2;
    const scale = ((Mt * KNM_TO_NM) / Ip) * PA_TO_MPA;
    for (const row of field.nodes) {
      const y = row.y / M_TO_MM;
      const z = row.z / M_TO_MM;
      // `τ_T = (Mt/Ip)·(−z, +y)`: senkrecht auf dem Radius, Betrag `Mt·r/Ip`.
      expect(row.tauY).toBeCloseTo(-scale * z, 4);
      expect(row.tauZ).toBeCloseTo(scale * y, 4);
    }
  });
});

describe('Das Rechteck unter Vz gegen Grashof', () => {
  it('trifft den Scheitel 1,5·V/A der Form nach', async () => {
    // NICHT ALS SCHARFE ZAHL. Grashof ist beim Rechteck nicht die exakte
    // Loesung — τ verlaeuft auch ueber die BREITE, und die Schranke unten ist
    // gemessen und nicht erfunden.
    const b = 1;
    const h = 2;
    const Vz = 100;
    const { fields, section } = await run(
      [{ kind: 'material', coordinates: rectangleRing(b, h) }],
      b * h,
    );
    const field = recoverStresses(fields, { Vz }, 0.3);

    const grashof = ((1.5 * (Vz * KN_TO_N)) / (b * h)) * PA_TO_MPA;
    // GEMESSEN 1,0384 bei `b/h = 0,5`: die exakte Loesung liegt im Scheitel
    // knapp 4 % ueber der Parabel, weil τ auch ueber die Breite verlaeuft.
    const peak = extreme(field, (row) => Math.abs(row.tauZ));
    expect(Math.abs(peak.tauZ / grashof - 1)).toBeLessThan(0.05);

    // Der Scheitel liegt auf der Nullinie und nicht am Rand.
    expect(Math.abs(peak.z)).toBeLessThan(1);

    // KEIN TORSIONSANTEIL an der doppelt symmetrischen Figur: `Mt_SV` ist
    // null, weil das Einheitsfeld kein Moment traegt. Geprueft wird das an der
    // RESULTIERENDEN und nicht punktweise — ein `τ_y` gibt es beim Rechteck
    // auch ohne Torsion, es ist nur momentenfrei.
    const Mx =
      integrate(section, nodal(field, 'tauZ'), (y) => y) -
      integrate(section, nodal(field, 'tauY'), (_y, z) => z);
    expect(Math.abs(Mx / (Vz * KN_TO_N * h))).toBeLessThan(1e-8);
  });
});

describe('Reines N', () => {
  it('liefert konstantes sigma und tau identisch null', async () => {
    // AN DER UNSYMMETRISCHEN FIGUR gefragt: nur dort ist „τ ist null" eine
    // Aussage. `Mt_SV = Mt − (Vz'·T_Z − Vy'·T_Y)` faellt hier weg, weil beide
    // Querkraefte null sind — nicht, weil die Weber-Momente es waeren.
    const { fields } = await run(
      [{ kind: 'material', coordinates: angleRing(1, 0.3) }],
      0.51,
      2000,
    );
    const N = 250;
    const field = recoverStresses(fields, { N }, 0.3);

    const sigma = (N * KN_TO_N * PA_TO_MPA) / 0.51;
    for (const row of field.nodes) {
      expect(row.sigma).toBeCloseTo(sigma, 6);
      // `Mt_SV = 0` — hier steht kein Rest aus dem Weber-Abzug.
      expect(row.tauY).toBe(0);
      expect(row.tauZ).toBe(0);
      expect(row.sigmaV).toBeCloseTo(Math.abs(sigma), 6);
    }
    // Ohne Schub gibt es keine Bezugsgroesse — beide Verhaeltnisse sind null
    // und ihre Knotennummern `-1`.
    expect(field.diagnostics.maxJump).toBe(0);
    expect(field.diagnostics.maxJumpNode).toBe(-1);
    expect(field.diagnostics.maxBoundaryTraction).toBe(0);
    expect(field.diagnostics.maxBoundaryTractionNode).toBe(-1);
  });
});

describe('Die Diagnosen bedeuten, was ihr JSDoc behauptet', () => {
  it('laesst maxJump am Kreis mit der Verfeinerung fallen', async () => {
    const a = 1;
    const A = Math.PI * a * a;
    const forces: SectionForces = { Vz: 100 };
    const coarse = await run(
      [{ kind: 'material', coordinates: discRing(a, 360) }],
      A,
      1500,
    );
    const fine = await run(
      [{ kind: 'material', coordinates: discRing(a, 360) }],
      A,
      12000,
    );
    const coarseJump = recoverStresses(coarse.fields, forces, 0.3).diagnostics
      .maxJump;
    const fineJump = recoverStresses(fine.fields, forces, 0.3).diagnostics
      .maxJump;
    expect(fineJump).toBeLessThan(coarseJump / 2);
  });

  it('laesst maxJump an der einspringenden Ecke NICHT fallen', async () => {
    // Dort ist `τ ~ r^(−1/3)` in der KONTINUIERLICHEN Loesung; der Knotenwert
    // waechst mit jeder Verfeinerung und dominiert die Diagnose. Ohne diesen
    // Test liest sich das spaeter wie ein Bug im Mitteln.
    const forces: SectionForces = { Vz: 100 };
    const coarse = await run(
      [{ kind: 'material', coordinates: angleRing(1, 0.3) }],
      0.51,
      1500,
    );
    const fine = await run(
      [{ kind: 'material', coordinates: angleRing(1, 0.3) }],
      0.51,
      12000,
    );
    const coarseJump = recoverStresses(coarse.fields, forces, 0.3).diagnostics
      .maxJump;
    const fineJump = recoverStresses(fine.fields, forces, 0.3).diagnostics
      .maxJump;
    expect(fineJump).toBeGreaterThan(coarseJump / 2);
  });

  it('benennt die eine einspringende Ecke des L und keine am Rechteck', async () => {
    const angle = await run(
      [{ kind: 'material', coordinates: angleRing(1, 0.3) }],
      0.51,
      2000,
    );
    const corners = recoverStresses(angle.fields, { Vz: 100 }, 0.3).diagnostics
      .reentrantCorners;
    expect(corners).toHaveLength(1);
    const node = atOrThrow(corners, 0);
    // Die Ecke liegt bei `(0,3 | 0,3)`, schwerpunktsbezogen gerechnet.
    expect(atOrThrow(angle.section.y, node) + angle.section.ys).toBeCloseTo(
      0.3,
      9,
    );
    expect(atOrThrow(angle.section.z, node) + angle.section.zs).toBeCloseTo(
      0.3,
      9,
    );

    const rectangle = await run(
      [{ kind: 'material', coordinates: rectangleRing(1, 2) }],
      2,
      2000,
    );
    expect(
      recoverStresses(rectangle.fields, { Vz: 100 }, 0.3).diagnostics
        .reentrantCorners,
    ).toHaveLength(0);
  });

  it('meldet eine kleine Randtraktion an der glatten Figur', async () => {
    const { fields } = await run(
      [{ kind: 'material', coordinates: rectangleRing(1, 2) }],
      2,
    );
    const diagnostics = recoverStresses(fields, { Vz: 100 }, 0.3).diagnostics;
    // `τ·n = 0` gilt exakt, die FE erfuellt es nur schwach — die Zahl ist klein
    // und nicht null, und sie wird NICHT herausprojiziert.
    expect(diagnostics.maxBoundaryTraction).toBeGreaterThan(0);
    expect(diagnostics.maxBoundaryTraction).toBeLessThan(0.05);
    expect(diagnostics.maxBoundaryTractionNode).toBeGreaterThanOrEqual(0);
  });
});

describe('Die Vorbedingung an nu', () => {
  it('wirft ausserhalb von [0, 0,5)', async () => {
    const { fields } = await run(
      [{ kind: 'material', coordinates: rectangleRing(1, 2) }],
      2,
      600,
    );
    for (const nu of [-0.01, 0.5, 0.7, 30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => recoverStresses(fields, { Vz: 1 }, nu)).toThrow(
        InvalidPoissonRatioError,
      );
    }
    // `ν = 0` ist ein zulaessiger Grenzfall und laeuft durch.
    expect(() => recoverStresses(fields, { Vz: 1 }, 0)).not.toThrow();
  });
});

describe('Der T-Querschnitt gegen die gemessene Luecke', () => {
  it('trifft Grashof im Steg und laeuft am Gurtanschluss davon', async () => {
    // REGRESSIONSNAGEL auf `docs/messungen/t-querschnitt-grashof-gegen-fe.md`.
    // Dort ist die Luecke an κ gemessen; hier steht sie an der Spannung, und
    // sie hat zwei Seiten:
    //
    //   IM STEG, an der Schwerachse, ist das Schnittmodell gueltig — dort
    //   trifft die FE `Vz·Sy/(Iy·bw)` auf 0,01 % (gemessen 0,99992).
    //
    //   AM GURTANSCHLUSS nicht. Dort springt `t` um `bf/bw = 20`, Grashof
    //   mittelt darueber hinweg, und die Figur hat an genau dieser Stelle zwei
    //   einspringende Ecken. Der Spitzenwert liegt beim 1,66-Fachen (gemessen,
    //   8000 Elemente) — und er WAECHST mit der Verfeinerung, weil τ dort
    //   singulaer ist. Deshalb steht darauf nur eine untere Schranke.
    const bf = 0.2;
    const tf = 0.015;
    const bw = 0.01;
    const h = 0.2;
    const A = bf * tf + bw * (h - tf);
    const Vz = 100;
    const { fields, section } = await run(
      [{ kind: 'material', coordinates: steelTeeRing() }],
      A,
      8000,
    );
    const field = recoverStresses(fields, { Vz }, 0.3);

    // Grashof an der Schwerachse: `τ = Vz·Sy/(Iy·bw)`, `Sy` aus dem Steg
    // unterhalb, mit `Iy` und `zs` AUS DEM NETZ.
    const zTop = h - section.zs;
    const Sy = (bw * zTop * zTop) / 2;
    const grashof =
      ((Vz * KN_TO_N * Sy) / (section.Iy * bw)) * PA_TO_MPA;

    const web = extreme(field, (row) => -(Math.abs(row.y) + Math.abs(row.z)));
    expect(web.tauZ / grashof).toBeCloseTo(1, 2);

    const peak = Math.abs(extreme(field, (row) => Math.abs(row.tauZ)).tauZ);
    expect(peak / grashof).toBeGreaterThan(1.3);

    // Die beiden Ecken, an denen das passiert, stehen in der Diagnose.
    expect(field.diagnostics.reentrantCorners).toHaveLength(2);
  });
});
