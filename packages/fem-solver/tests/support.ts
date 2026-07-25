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
import type { FEMLoad } from '@baustatik/fem-loads';
import type { SolverConfig } from '../src/config';
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

export type Store = {
  nodes: Node[];
  beams: Beam[];
  supports: NodeSupport[];
  loads: FEMLoad[];
};

/**
 * Gauss-Elimination mit Spaltenpivotierung — die Testfassung des Ports.
 *
 * WIRFT BEI SINGULAERER MATRIX NICHT, sondern teilt durch 0 und laesst
 * `Infinity`/`NaN` durchlaufen. Genau das tut `faer`s `PartialPivLu` auch: es
 * meldet keinen Rangabfall. Eine Testfassung, die stattdessen wuerfe, wuerde
 * dem Solver eine Absicherung vortaeuschen, die er in Wahrheit selbst leisten
 * muss.
 */
export function gaussSolve(n: number, K: Float64Array, F: Float64Array): Float64Array {
  const a = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n + 1 }, (_, c) => (c === n ? F[r] : K[r * n + c])),
  );

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];

    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) {
        a[row][c] -= factor * a[col][c];
      }
    }
  }

  const d = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row][n];
    for (let c = row + 1; c < n; c += 1) {
      sum -= a[row][c] * d[c];
    }
    d[row] = sum / a[row][row];
  }
  return d;
}

/**
 * Eine Formulierung ohne Balkentheorie: Einheitssteifigkeit und ein fester
 * Lastvektor.
 *
 * Damit sind Freiheitsgrad-Nummerierung, Assemblierung, Transformation und
 * Randbedingungen mit Zahlen pruefbar, die im Kopf nachzurechnen sind.
 */
export function fakeFormulation(
  load: Vector6 = [1, 2, 3, 4, 5, 6],
): FrameElement2DFormulation {
  const identity = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r === c ? 1 : 0)),
  ) as unknown as Matrix6;

  return {
    prepare: () => ({
      stiffness: () => identity,
      consistentLoad: () => load,
      shapeFunctions: () => ({ Nu: [], Nw: [], Ntheta: [] }),
      internalForces: () => ({ N: 0, V: 0, M: 0 }),
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
    getLoads: () => store.loads,
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
