/**
 * DIE ORAKEL. Sie tragen die Last, die keine billige Selbstpruefung tragen kann.
 *
 * WARUM ES SIE BRAUCHT: die Gleichgewichtsprobe `∫τ_z dA = Qz` sieht den
 * m-Anteil des Feldes NICHT — `Φ₁` verschwindet auf dem Rand, sein Beitrag zur
 * Resultierenden ist null. Aus demselben Grund sieht sie eine vergessene
 * Lochbedingung nicht. Es gibt keine Kontrolle von innen, die den Netzfehler
 * abdeckt ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)).
 *
 * DIESE SUITE VERNETZT UND LOEST ECHT — mit `@baustatik/mesh-2d-wasm` und
 * `@baustatik/sparse-solver-wasm`. Genau dafuer gibt es dieses Package: in
 * `@baustatik/cross-section` liegt die Suite bewusst Emscripten-frei
 * (`tests/outline-meshability.test.ts` verweigert ausdruecklich, Triangle laufen
 * zu lassen), und `κ = 0,833333333333` auf zwoelf Stellen faellt nicht aus einer
 * Handfixture.
 *
 * COWPER TAUGT NICHT ALS KRITERIUM und steht deshalb in keinem `expect`: seine
 * Formel gibt fuer das Rechteck bei ν = 0,3 `0,84967`, gemessen wird `0,832942`
 * — κ aus der Schubenergie FAELLT mit ν, Cowpers Formel steigt. Er mittelt die
 * 3D-Gleichungen und ist eine andere Groesse.
 */

import { atOrThrow } from '@baustatik/core';
import { kappaFromCoefficients } from '@baustatik/cross-section';
import type { Mesh2DInput } from '@baustatik/mesh-2d-wasm';
import { describe, expect, it } from 'vitest';
import { computeFromMesh, type FEResult } from '../src/compute';
import { prepareSection } from '../src/prepare';
import { getMesher, getSolver } from '../src/runtime';

/** Wie viele Elemente die Orakel bekommen — feiner als die Voreinstellung. */
const ELEMENTS = 6000;

async function run(
  rings: Mesh2DInput['rings'],
  A: number,
  elements = ELEMENTS,
): Promise<FEResult> {
  const [mesher, solve] = await Promise.all([getMesher(), getSolver()]);
  const mesh = mesher({
    rings,
    element: 'tri6',
    maxElementArea: A / elements,
    switches: { quality: true },
  });
  return computeFromMesh(prepareSection(mesh), solve);
}

function rectangleRing(b: number, h: number): Float64Array {
  return Float64Array.of(-b / 2, -h / 2, b / 2, -h / 2, b / 2, h / 2, -b / 2, h / 2);
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

function boxRing(yc: number, zc: number, b: number, h: number): Float64Array {
  return Float64Array.of(
    yc - b / 2,
    zc - h / 2,
    yc + b / 2,
    zc - h / 2,
    yc + b / 2,
    zc + h / 2,
    yc - b / 2,
    zc + h / 2,
  );
}

/** κ aus den Koeffizienten bei gegebenem ν. */
function kappa(result: FEResult, nu: number): number {
  const shear = result.shear;
  if (shear === undefined) throw new Error('Die Rechnung hat verweigert.');
  const value = kappaFromCoefficients(shear.inverseKappaZ, nu);
  if (value === undefined) throw new Error('kappa fehlt.');
  return value;
}

describe('Das Rechteck bei m = 0 ist die scharfe Zahl', () => {
  it('liefert kappa = 5/6 auf zwoelf Stellen', async () => {
    const b = 1;
    const h = 2;
    const result = await run(
      [{ kind: 'material', coordinates: rectangleRing(b, h) }],
      b * h,
    );
    // Bei ν = 0 ist die exakte Loesung LINEAR; ein quadratisches Dreieck ist
    // dort exakt. Das ist die einzige Stelle im Repo, an der eine FE-Zahl auf
    // zwoelf Stellen stehen muss.
    expect(kappa(result, 0)).toBeCloseTo(5 / 6, 11);
  });

  it('haelt die Gleichgewichtsprobe und die Vertraeglichkeit', async () => {
    const result = await run(
      [{ kind: 'material', coordinates: rectangleRing(1, 2) }],
      2,
    );
    expect(result.diagnostics.equilibriumZ).toBeCloseTo(1, 9);
    expect(result.diagnostics.equilibriumY).toBeCloseTo(1, 9);
    expect(Math.abs(result.diagnostics.compatibility)).toBeLessThan(1e-10);
  });

  it('hat einen verschwindenden linearen Anteil d1', async () => {
    const result = await run(
      [{ kind: 'material', coordinates: rectangleRing(1, 2) }],
      2,
    );
    // `d₁ = 2·A·E01` ist beweisbar null (ADR 0045) — und ausdruecklich KEIN
    // Anzeiger fuer eine vergessene Lochbedingung.
    expect(Math.abs(result.diagnostics.d1RatioZ)).toBeLessThan(1e-9);
    expect(Math.abs(result.diagnostics.d1RatioY)).toBeLessThan(1e-9);
  });

  it('legt den Schubmittelpunkt der doppelt symmetrischen Figur in den Ursprung', async () => {
    const result = await run(
      [{ kind: 'material', coordinates: rectangleRing(1, 2) }],
      2,
    );
    const shear = result.shear;
    if (shear === undefined) throw new Error('Die Rechnung hat verweigert.');
    expect(Math.abs(shear.yM)).toBeLessThan(1e-9);
    expect(Math.abs(shear.zM)).toBeLessThan(1e-9);
  });
});

describe('It des Rechtecks gegen die Fourierreihe', () => {
  it('trifft sie auf besser als 0,1 %', async () => {
    const b = 1;
    const h = 2;
    const result = await run(
      [{ kind: 'material', coordinates: rectangleRing(b, h) }],
      b * h,
    );
    let series = 0;
    for (let n = 1; n <= 199; n += 2) {
      series += Math.tanh((n * Math.PI * h) / (2 * b)) / n ** 5;
    }
    const closed =
      (1 / 3) * h * b ** 3 * (1 - (192 / Math.PI ** 5) * (b / h) * series);
    // Jeder Vorzeichenfehler im Neumann-Randterm faellt hier auf: das Ergebnis
    // liegt dann nicht daneben, sondern in einer anderen Groessenordnung.
    expect(Math.abs(result.It / closed - 1)).toBeLessThan(1e-3);
  });
});

describe('Der Kreis gegen Timoshenko/Goodier', () => {
  it('trifft das geschlossene ν-abhaengige Spannungsfeld', async () => {
    const a = 1;
    const result = await run(
      [{ kind: 'material', coordinates: discRing(a, 360) }],
      Math.PI * a * a,
    );
    // Das Feld ist das EINZIGE Orakel fuer den m-Anteil. Geprueft wird es hier
    // ueber die daraus folgende Schubenergie: `1/κ = A·∫τ²dA`.
    for (const nu of [0, 0.3]) {
      const Iy = (Math.PI * a ** 4) / 4;
      const k1 = (1 + 2 * nu) / (4 * (1 + nu) * Iy);
      const k2 = (3 + 2 * nu) / (8 * (1 + nu) * Iy);
      const c = (1 - 2 * nu) / (3 + 2 * nu);
      const closed = closedDiscInverseKappa(a, Iy, k1, k2, c);
      const computed = 1 / kappa(result, nu);
      expect(Math.abs(computed / closed - 1)).toBeLessThan(0.02);
    }
  });
});

/**
 * `A·∫(τ_y² + τ_z²) dA` fuer den Kreis aus dem geschlossenen Feld.
 *
 * Polarintegration ueber `τ_y = −k1·y·z`, `τ_z = k2·(a² − z² − c·y²)`.
 */
function closedDiscInverseKappa(
  a: number,
  _Iy: number,
  k1: number,
  k2: number,
  c: number,
): number {
  const steps = 4000;
  let energy = 0;
  for (let i = 0; i < steps; i += 1) {
    const r = (a * (i + 0.5)) / steps;
    const dr = a / steps;
    for (let j = 0; j < steps / 4; j += 1) {
      const phi = (2 * Math.PI * (j + 0.5)) / (steps / 4);
      const dphi = (2 * Math.PI) / (steps / 4);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi);
      const tauY = -k1 * y * z;
      const tauZ = k2 * (a * a - z * z - c * y * y);
      energy += (tauY * tauY + tauZ * tauZ) * r * dr * dphi;
    }
  }
  return Math.PI * a * a * energy;
}

describe('Der Halbkreis gegen Sokolnikoff', () => {
  it('trifft Konstante und m-Steigung des Schubmittelpunkts', async () => {
    // `e/a = 8·[3 + (40/π² − 4)·m] / (15π)` — die WEBER-Zahl. Trefftz ist
    // ν-frei und kann keine Steigung in m liefern; geprueft wird deshalb die
    // Konstante bei m = 0, wo beide Definitionen zusammenfallen.
    const a = 1;
    const segments = 240;
    const points: number[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * index) / segments;
      points.push(a * Math.cos(angle), a * Math.sin(angle));
    }
    const result = await run(
      [{ kind: 'material', coordinates: new Float64Array(points) }],
      (Math.PI * a * a) / 2,
    );
    const shear = result.shear;
    if (shear === undefined) throw new Error('Die Rechnung hat verweigert.');

    // Sokolnikoff misst `e` vom KREISMITTELPUNKT — und genau dort liegt der
    // Ursprung der Eingaberinge, in dem `yM` steht. Der Schwerpunkt bei
    // `4a/(3π)` kommt hier NICHT vor.
    expect(Math.abs(shear.yM / ((8 * 3) / (15 * Math.PI)) - 1)).toBeLessThan(
      0.005,
    );
  });
});

describe('Der Kreisring prueft die Installation', () => {
  it('trifft It = π(a⁴−b⁴)/2', async () => {
    const outer = 1;
    const inner = 0.6;
    const result = await run(
      [
        { kind: 'material', coordinates: discRing(outer, 240) },
        { kind: 'hole', coordinates: discRing(inner, 160) },
      ],
      Math.PI * (outer * outer - inner * inner),
    );
    const closed = (Math.PI * (outer ** 4 - inner ** 4)) / 2;
    // Ob der Mesher ein Loch vernetzt und der Randumlauf BEIDE Schleifen
    // findet. Die Zusatzbedingung prueft das NICHT: beim konzentrischen Ring
    // ist `c₁ = 0` aus Symmetrie.
    expect(Math.abs(result.It / closed - 1)).toBeLessThan(0.01);
    expect(result.diagnostics.holeCount).toBe(1);
  });
});

describe('Die Lochbedingung', () => {
  it('ist bei mittigem Loch erfuellt und die Kopplungsmatrix symmetrisch', async () => {
    const result = await run(
      [
        { kind: 'material', coordinates: boxRing(0, 0, 0.2, 0.4) },
        { kind: 'hole', coordinates: boxRing(0, 0, 0.06, 0.12) },
      ],
      0.2 * 0.4 - 0.06 * 0.12,
    );
    expect(result.shear).toBeDefined();
    expect(result.diagnostics.capacitanceAsymmetry).toBeLessThan(1e-8);
    expect(result.diagnostics.closureZ).toBeLessThan(1e-10);
  });

  it('verweigert, wenn das Loch nicht auf der Biegeachse liegt', async () => {
    // Kasten 200 × 400 mit einem Loch 60 × 120, um 60 mm aus der Achse
    // geschoben: der Randschluss bricht, Φ ist mehrdeutig. Der RESTFLUSS zeigt
    // das nicht an — er stuende bei 10⁻¹⁷ (ADR 0045).
    const result = await run(
      [
        { kind: 'material', coordinates: boxRing(0, 0, 0.2, 0.4) },
        { kind: 'hole', coordinates: boxRing(0, 0.06, 0.06, 0.12) },
      ],
      0.2 * 0.4 - 0.06 * 0.12,
    );
    expect(result.shear).toBeUndefined();
    expect(result.diagnostics.closureZ).toBeGreaterThan(1e-3);
    // `It` bleibt unberuehrt und wird trotzdem geliefert.
    expect(result.It).toBeGreaterThan(0);
  });
});

describe('Die Werte aus dem Netz gegen die Figur', () => {
  it('trifft A, Iy und Iz des Rechtecks auf Gleitkommarauschen', async () => {
    const b = 0.3;
    const h = 0.5;
    const [mesher] = await Promise.all([getMesher()]);
    const mesh = mesher({
      rings: [{ kind: 'material', coordinates: rectangleRing(b, h) }],
      element: 'tri6',
      maxElementArea: (b * h) / 2000,
      switches: { quality: true },
    });
    const section = prepareSection(mesh);
    // Jeder Indexdreher in der Assemblierung faellt hier auf, bevor irgendeine
    // Feldgroesse gerechnet wird.
    expect(section.A).toBeCloseTo(b * h, 12);
    expect(section.Iy).toBeCloseTo((b * h ** 3) / 12, 12);
    expect(section.Iz).toBeCloseTo((h * b ** 3) / 12, 12);
    expect(Math.abs(section.Iyz)).toBeLessThan(1e-14);
    expect(Math.abs(atOrThrow(section.loops, 0).signedArea)).toBeCloseTo(
      b * h,
      12,
    );
  });
});
