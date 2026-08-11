/**
 * Der Round-Trip: bauen -> JSON -> parsen -> RECHNEN.
 *
 * Die anderen Tests dieses Packages pruefen die Multiplikation. Dieser prueft
 * die Kette, in der sie steht: dass ein Snapshot SELBSTTRAGEND ist. Bis
 * `schemaVersion: 1` zeigte `Beam.crossSectionId` ins Leere — ein Modell liess
 * sich speichern, laden und dann nicht rechnen, ohne dass irgendetwas den
 * fehlenden Bestandteil benannt haette.
 *
 * `@baustatik/script` und `@baustatik/fem-solver` sind hier DEV-Abhaengigkeiten.
 * Keins der beiden haengt an diesem Package, der Kreis bleibt also offen; und
 * der Test gehoert hierher, weil dieses Package das fehlende Glied IST.
 */

import type {
  CrossSection,
  SectionPolicy,
} from '@baustatik/cross-section';
import type { Beam } from '@baustatik/fem';
import {
  createAnalysisPolicy,
  createFEMSolver,
  type LinearSolveOutcome,
  type SolveResult,
} from '@baustatik/fem-solver';
import type { Material } from '@baustatik/material';
import { createFEMModelBuilder, parseFEMModelSnapshot } from '@baustatik/script';
import { describe, expect, it } from 'vitest';
import { resolveSectionStiffness } from '../src/index';

/**
 * Dichtes Gauss ohne Pivotierung — `K` ist symmetrisch positiv definit.
 *
 * `F` und `d` liegen spaltenweise flach als `n x rhsColumns` vor; hier wird
 * immer genau ein Lastfall gerechnet, die Schleife bleibt trotzdem allgemein,
 * damit die Testfassung dem Port-Vertrag entspricht.
 */
function gaussSolve(
  n: number,
  K: Float64Array,
  rhsColumns: number,
  F: Float64Array,
): LinearSolveOutcome {
  const width = n + rhsColumns;
  const a = Array.from({ length: n }, (_, r) =>
    Array.from({ length: width }, (_, c) =>
      c < n ? K[r * n + c] : F[(c - n) * n + r],
    ),
  );
  for (let col = 0; col < n; col++) {
    const pivot = a[col][col];
    if (!(Math.abs(pivot) > 1e-12)) {
      return { kind: 'singular', index: col, pivotRatio: 0 };
    }
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c < width; c++) a[row][c] -= factor * a[col][c];
    }
  }
  const d = new Float64Array(n * rhsColumns);
  for (let column = 0; column < rhsColumns; column++) {
    for (let row = n - 1; row >= 0; row--) {
      let sum = a[row][n + column];
      for (let c = row + 1; c < n; c++) sum -= a[row][c] * d[column * n + c];
      d[column * n + row] = sum / a[row][row];
    }
  }
  return { kind: 'solved', d };
}

/**
 * Die Analyse-Einstellung dieser Datei: DICHT rechnen.
 *
 * Die Voreinstellung ist seit ADR 0042 `'sparse'`, und dann verlangte die
 * Config den zweiten Port. Hier geht es um den Weg vom Snapshot zu den
 * Steifigkeiten und nicht um das Matrixformat — ein Loeser genuegt, und dieser
 * ist der von Hand nachrechenbare.
 */
const DENSE = createAnalysisPolicy({ linearSystem: 'dense' });

/** Ein Kragarm mit IPE 300 aus S235 und einer Einzellast am freien Ende. */
function buildCantilever() {
  const model = createFEMModelBuilder();
  const ipe300 = model.crossSection({ kind: 'profile', profile: 'IPE 300' });
  const s235 = model.material({ kind: 'steel', grade: 'S235' });
  const fixed = model
    .node({ x: 0, z: 0 })
    .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
  const tip = model.node({ x: 2, z: 0 });
  model.beam(fixed, tip, { crossSectionId: ipe300.id, materialId: s235.id });
  model.loadCase({ name: 'P' }).nodeLoad(tip, { fz: 10 });
  return model.finish();
}

async function solve(snapshot: {
  nodes: readonly { id: string }[];
  beams: readonly Beam[];
  crossSections: readonly CrossSection[];
  materials: readonly Material[];
  // Seit P5 gehoert sie zu `SectionModel`: der gezeichnete Wandquerschnitt
  // zerlegt seine Boegen unter DERSELBEN Toleranz wie sein Umriss.
  sectionPolicy: SectionPolicy;
  supports: readonly unknown[];
  loadCases: readonly { id: string }[];
}): Promise<SolveResult> {
  const solver = createFEMSolver({
    getNodes: () => snapshot.nodes as never,
    getBeams: () => snapshot.beams,
    getSupports: () => snapshot.supports as never,
    getLoadCases: () => snapshot.loadCases as never,
    // Der Snapshot ERFUELLT `SectionModel` strukturell: er fuehrt
    // `crossSections` und `materials`, und beide reisen mit ihm.
    getSectionStiffness: (beam) =>
      resolveSectionStiffness(beam, snapshot),
    solveLinearSystem: gaussSolve,
    analysisPolicy: DENSE,
  });
  return solver.solve(snapshot.loadCases[0].id);
}

describe('Ein Snapshot ist selbsttragend', () => {
  it('liefert nach JSON und Parsen dieselben Verformungen', async () => {
    const built = buildCantilever();
    const parsed = parseFEMModelSnapshot(JSON.parse(JSON.stringify(built)));

    const before = await solve(built);
    const after = await solve(parsed);

    expect(after.displacements.size).toBe(before.displacements.size);
    for (const [nodeId, d] of before.displacements) {
      const other = after.displacements.get(nodeId);
      expect(other, nodeId).toBeDefined();
      expect(other?.ux).toBeCloseTo(d.ux, 14);
      expect(other?.uz).toBeCloseTo(d.uz, 14);
      expect(other?.phiY).toBeCloseTo(d.phiY, 14);
    }
  });

  it('rechnet dabei den Kragarm gegen die Handrechnung', async () => {
    // Ohne diese Pruefung zeigte der Round-Trip nur, dass zweimal DASSELBE
    // herauskommt — auch wenn beide Male null herauskaeme.
    //
    // IPE 300 in S235, P = 10 kN am freien Ende, L = 2 m:
    //   A  = 53,81 cm2 = 5,381e-3 m2      Iy = 8356 cm4 = 8,356e-5 m4
    //   EI = 2,1e8 * 8,356e-5             = 17 547,6 kNm2
    //   GAs = G*Az = 8,0769e7 * 19,82e-4  =  160 084 kN
    //   w = P*L^3/(3EI) + P*L/GAs
    //     = 1,5197e-3   + 1,2493e-4       = 1,6446e-3 m
    //
    // Der Schubanteil sind 8 % — dass er DA ist und in der richtigen
    // Groessenordnung, haengt an `kappaZ` aus dem Katalog. Mit `GAs: 'rigid'`
    // bliebe genau der Biegeanteil stehen.
    const built = buildCantilever();
    const result = await solve(built);
    const tip = [...result.displacements.values()].find((d) => d.uz !== 0);

    const EI = 2.1e8 * 8.356e-5;
    const GAs = 8.0769e7 * 19.82e-4;
    const bending = (10 * 2 ** 3) / (3 * EI);
    const shear = (10 * 2) / GAs;

    expect(bending).toBeCloseTo(1.5197e-3, 7);
    expect(shear).toBeCloseTo(1.2493e-4, 8);
    expect(tip?.uz).toBeCloseTo(bending + shear, 7);
  });

  it('meldet einen Snapshot ohne Querschnitte als Modellfehler', async () => {
    // Der Gegenprobe-Fall: dieselbe Kette, aber der Querschnitt fehlt. Der
    // Bericht muss ihn nennen — nicht `solve()` ueberraschend scheitern.
    const built = buildCantilever();
    const solver = createFEMSolver({
      getNodes: () => built.nodes as never,
      getBeams: () => built.beams,
      getSupports: () => built.supports as never,
      getLoadCases: () => built.loadCases as never,
      getSectionStiffness: (beam) =>
        resolveSectionStiffness(beam, {
          crossSections: [],
          materials: built.materials,
          sectionPolicy: built.sectionPolicy,
        }),
      solveLinearSystem: gaussSolve,
      analysisPolicy: DENSE,
    });
    const report = solver.check(built.loadCases[0].id);
    expect(report.canSolve).toBe(false);
    expect(report.model.errors.map((e) => e.message).join(' ')).toContain(
      'keine Steifigkeiten',
    );
  });
});
