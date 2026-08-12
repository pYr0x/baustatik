/**
 * Die eine Tür zu den beiden Fassungen — und die eine Stelle, an der die
 * Löserwahl aus der Policy auf einen Port trifft.
 *
 * GEPRÜFT WIRD BEIM ERZEUGEN, nicht beim Rechnen: eine Config, die den
 * eingestellten Weg nicht bedienen kann, ist falsch verdrahtet, und das ist ein
 * Fehler des Aufrufers. Ihn erst beim dritten Lastfall zu melden hieße, dass
 * `createFEMSolver` etwas zurückgibt, das nie rechnen konnte.
 */

import { assertNever } from '@baustatik/core';
import type { LinearSolve, SparseSolve } from '../config';
import { InvalidSolverConfigError } from '../errors';
import type { LinearSystemKind } from '../policy';
import { createDenseSystemMatrix } from './dense';
import { createSparseSystemMatrix } from './sparse';
import type { SystemMatrix } from './types';

export type { SystemMatrix } from './types';

/** Die beiden Löser-Ports aus `SolverConfig`, ohne den Rest. */
export type SystemMatrixPorts = {
  readonly solveLinearSystem?: LinearSolve;
  readonly solveSparseSystem?: SparseSolve;
};

/**
 * Bindet Betriebsart und Port zu einer Fabrik über `n`.
 *
 * Eine FABRIK und keine Matrix, weil `n` erst feststeht, wenn die Knoten
 * gezählt sind — der aufgelöste Analysekontext entsteht aber schon beim
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
    default:
      // Eine dritte Betriebsart wird HIER zum Übersetzungsfehler und nicht erst
      // zu einer stillen Fabrik, die niemand gebaut hat.
      return assertNever(kind);
  }
}
