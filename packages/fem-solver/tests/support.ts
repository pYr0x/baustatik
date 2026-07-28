/**
 * Bausteine der Solver-Tests: ein Modell-Bauer, ein Linearsolver und eine
 * triviale Elementformulierung.
 *
 * Alle drei sind das, wofuer die Ports da sind. Ohne sie liefe jeder Test durch
 * WASM und durch echte Timoshenko-Zahlen, und ein Vorzeichenfehler in der
 * Transformation waere von einem Elementfehler nicht zu unterscheiden.
 */

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type {
  FrameElement2DFormulation,
  Matrix6,
  SectionProperties,
  Vector6,
} from '@baustatik/fem-element';
import type { FEMLoad, LoadCase } from '@baustatik/fem-loads';
import type { LinearSolveOutcome, SolverConfig } from '../src/config';
import { createAnalysisPolicy } from '../src/policy';

export const STIFF: SectionProperties = { EA: 1e6, EI: 1000, GAs: 500 };

export function node(id: string, x: number, z: number): Node {
  return { id, position: { x, z } };
}

export function beam(
  id: string,
  startNodeId: string,
  endNodeId: string,
  releases?: Beam['releases'],
): Beam {
  return {
    id,
    startNodeId,
    endNodeId,
    crossSectionId: 'default',
    materialId: 'default',
    ...(releases === undefined ? {} : { releases }),
  };
}

export function support(
  id: string,
  nodeId: string,
  ux: 'fixed' | 'free' = 'fixed',
  uz: 'fixed' | 'free' = 'fixed',
  phiY: 'fixed' | 'free' = 'fixed',
): NodeSupport {
  return { id, nodeId, ux, uz, phiY };
}

/**
 * Der Testspeicher haelt die Lasten FLACH und nicht als Lastfall.
 *
 * Fast jeder Test hier prueft Assemblierung, Randbedingungen oder Vorzeichen —
 * der Lastfall ist dabei Beiwerk. `configOver` verpackt die flache Menge in
 * genau einen Lastfall, damit die Tests sagen, worum es ihnen geht. Wer den
 * Fallfaktor prueft, setzt `factor`; wer mehrere Faelle braucht, gibt
 * `getLoadCases` als Override mit.
 */
export type Store = {
  nodes: Node[];
  beams: Beam[];
  supports: NodeSupport[];
  loads: FEMLoad[];
  /** Faktor des einen Lastfalls. Fehlt er, wirkt 1. */
  factor?: number;
};

/** Die id des Lastfalls, den `configOver` aus dem Store baut. */
export const TEST_LOAD_CASE_ID = 'lf-test';

/**
 * Dieselbe Schwelle wie `SINGULAR_PIVOT_TOLERANCE` in
 * `linear-solver-wasm/rust/src/lib.rs`. Bewusst dupliziert: die beiden Fassungen
 * teilen keinen Code, nur einen Vertrag.
 */
const SINGULAR_PIVOT_TOLERANCE = 1e-12;

/**
 * Gauss-Elimination — die Testfassung des Ports.
 *
 * MELDET KINEMATIK GENAUSO WIE DIE RUST-FASSUNG, mit derselben
 * Jacobi-Skalierung und derselben Pivot-Schwelle. Frueher tat sie das Gegenteil
 * (sie liess `Infinity`/`NaN` durchlaufen, weil `PartialPivLu` es auch tat) —
 * seit der Port das Ergebnis als `LinearSolveOutcome` liefert, waere eine
 * Testfassung ohne Erkennung schlicht vertragswidrig.
 *
 * EHRLICHE GRENZE: dass die Erkennung hier nachgebaut ist, heisst, dass diese
 * Tests NICHT beweisen, dass `faer` sie leistet. Das ist jedem Port eigen.
 * Dafuer stehen die `cargo test` in `linear-solver-wasm` und die Handrechnung
 * in `apps/demo/fem-cantilever.ts`.
 *
 * Ohne Spaltenpivotierung, anders als frueher: nach der Skalierung ist die
 * Matrix symmetrisch positiv definit mit Einsdiagonale, da ist Gauss ohne
 * Zeilentausch stabil — und nur ohne Zeilentausch sind die Pivots dieselbe
 * Groesse wie die Quadrate der Cholesky-Diagonale.
 */
export function gaussSolve(
  n: number,
  K: Float64Array,
  F: Float64Array,
): LinearSolveOutcome {
  if (n === 0) return { kind: 'solved', d: new Float64Array(0) };

  const s = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const diagonal = K[i * n + i];
    if (!(diagonal > 0) || !Number.isFinite(diagonal)) {
      return { kind: 'singular', index: i, pivotRatio: 0 };
    }
    s[i] = 1 / Math.sqrt(diagonal);
  }

  const a = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n + 1 }, (_, c) =>
      c === n ? F[r] * s[r] : K[r * n + c] * s[r] * s[c],
    ),
  );

  let minPivot = Infinity;
  for (let col = 0; col < n; col += 1) {
    const pivot = a[col][col];
    if (pivot <= SINGULAR_PIVOT_TOLERANCE) {
      return { kind: 'singular', index: col, pivotRatio: Math.max(pivot, 0) };
    }
    if (pivot < minPivot) minPivot = pivot;

    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) {
        a[row][c] -= factor * a[col][c];
      }
    }
  }

  const y = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row][n];
    for (let c = row + 1; c < n; c += 1) {
      sum -= a[row][c] * y[c];
    }
    y[row] = sum / a[row][row];
  }

  // Zurueckskalieren: `d = S y`.
  const d = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    d[i] = s[i] * y[i];
  }
  return { kind: 'solved', d };
}

/**
 * Eine Formulierung ohne Balkentheorie: Einheitssteifigkeit und ein fester
 * Lastvektor.
 *
 * Damit sind Freiheitsgrad-Nummerierung, Assemblierung, Transformation und
 * Randbedingungen mit Zahlen pruefbar, die im Kopf nachzurechnen sind.
 *
 * KENNT KEINE FREISETZUNGEN — die Einheitsmatrix hat keine Bloecke, die eine
 * Kondensation leerraeumen koennte, und die Tests, die Gelenke pruefen, laufen
 * ohnehin ueber `Timoshenko2D`. `evaluate` liefert trotzdem einen vollstaendigen
 * Zustand, damit `beamStates` und die Verlauf-API auch hier etwas vorfinden.
 */
export function fakeFormulation(
  load: Vector6 = [1, 2, 3, 4, 5, 6],
): FrameElement2DFormulation {
  const identity = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r === c ? 1 : 0)),
  ) as unknown as Matrix6;

  return {
    prepare: (props, L) => ({
      stiffness: () => identity,
      shapeFunctions: () => ({ Nu: [], Nw: [], Ntheta: [] }),
      withLoad: (elementLoad) => ({
        consistentLoad: () => load,
        evaluate: (dLocal) => ({
          L,
          endForces: dLocal.map((d, i) => d - load[i]) as unknown as Vector6,
          endDisplacements: dLocal,
          load: elementLoad,
          deformation: {
            kind: 'timoshenko-2d-iie',
            phi: 0,
            EI: props.EI,
            EA: props.EA,
          },
        }),
      }),
    }),
  };
}

/**
 * Eine Config ueber einen Store, mit den Ports vorbelegt.
 *
 * OHNE SCHUB als Voreinstellung, damit die Handrechnungen die reinen
 * Lehrbuchformeln treffen. Der Schalter kommt aus der `AnalysisPolicy` und
 * nicht mehr aus der Config; wer ihn braucht, gibt eine eigene
 * `analysisPolicy` mit.
 */
export function configOver(
  store: Store,
  overrides: Partial<SolverConfig> = {},
): SolverConfig {
  return {
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    // Je Aufruf neu gebaut, damit der PULL erhalten bleibt: ein einmal
    // erzeugter Lastfall haette eine Momentaufnahme von `store.loads`
    // festgehalten, und Tests, die nach der Verdrahtung Lasten nachschieben,
    // saehen sie nicht.
    getLoadCases: (): LoadCase[] => [
      {
        id: TEST_LOAD_CASE_ID,
        name: 'Testlastfall',
        loads: store.loads,
        ...(store.factor === undefined ? {} : { factor: store.factor }),
      },
    ],
    getSectionProperties: () => STIFF,
    solveLinearSystem: gaussSolve,
    analysisPolicy: createAnalysisPolicy({ shearDeformation: false }),
    ...overrides,
  };
}

/**
 * Die Gleichgewichtsprobe: Summe aller Kraefte und Momente muss 0 sein.
 *
 * Das Moment um das globale y (aus der Zeichenebene heraus, positiv gegen den
 * Uhrzeigersinn) einer Kraft am Ort `(x, z)` ist `z*fx - x*fz`.
 */
export function resultant(
  entries: readonly { at: { x: number; z: number }; fx: number; fz: number; my: number }[],
): { fx: number; fz: number; my: number } {
  let fx = 0;
  let fz = 0;
  let my = 0;
  for (const entry of entries) {
    fx += entry.fx;
    fz += entry.fz;
    my += entry.my + entry.at.z * entry.fx - entry.at.x * entry.fz;
  }
  return { fx, fz, my };
}
