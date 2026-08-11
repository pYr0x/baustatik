/**
 * Die eine Tuer zu den beiden Fassungen — und die eine Stelle, an der die
 * Loeserwahl aus der Policy auf einen Port trifft.
 *
 * GEPRUEFT WIRD BEIM ERZEUGEN, nicht beim Rechnen: eine Config, die den
 * eingestellten Weg nicht bedienen kann, ist falsch verdrahtet, und das ist ein
 * Fehler des Aufrufers. Ihn erst beim dritten Lastfall zu melden hiesse, dass
 * `createFEMSolver` etwas zurueckgibt, das nie rechnen konnte.
 */

import type { LinearSolve, SparseSolve } from '../config';
import { InvalidSolverConfigError } from '../errors';
import type { LinearSystemKind } from '../policy';
import { createDenseSystemMatrix } from './dense';
import { createSparseSystemMatrix } from './sparse';
import type { SystemMatrix } from './types';

export type { SystemMatrix } from './types';

/** Die beiden Loeser-Ports aus `SolverConfig`, ohne den Rest. */
export type SystemMatrixPorts = {
  readonly solveLinearSystem?: LinearSolve;
  readonly solveSparseSystem?: SparseSolve;
};

/**
 * Bindet Betriebsart und Port zu einer Fabrik ueber `n`.
 *
 * Eine FABRIK und keine Matrix, weil `n` erst feststeht, wenn die Knoten
 * gezaehlt sind — der aufgeloeste Analysekontext entsteht aber schon beim
 * `createFEMSolver`. Der Port steckt danach in der Closure; `solve.ts` sieht
 * weder ihn noch ein Matrixformat.
 */
export function resolveSystemMatrixFactory(
  kind: LinearSystemKind,
  ports: SystemMatrixPorts,
): (n: number) => SystemMatrix {
  switch (kind) {
    case 'dense': {
      const port = ports.solveLinearSystem;
      if (port === undefined) {
        throw new InvalidSolverConfigError(kind, 'solveLinearSystem');
      }
      return (n) => createDenseSystemMatrix(n, port);
    }
    case 'sparse': {
      const port = ports.solveSparseSystem;
      if (port === undefined) {
        throw new InvalidSolverConfigError(kind, 'solveSparseSystem');
      }
      return (n) => createSparseSystemMatrix(n, port);
    }
    default: {
      const exhaustive: never = kind;
      throw new InvalidSolverConfigError(exhaustive, 'solveSparseSystem');
    }
  }
}
