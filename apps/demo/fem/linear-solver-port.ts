/**
 * Der DICHTE Linearsolver als PORT: `K d = F` im Worker, damit der Hauptthread
 * nicht blockiert.
 *
 * Diese Datei ist die Verdrahtung, die `@baustatik/fem-solver` bewusst NICHT
 * kennt. Das Package bekommt nur die Funktion herein (`solveLinearSystem` in
 * seiner Config) und hängt dadurch weder an WASM noch an `Worker` — und bleibt
 * ohne beides testbar. Siehe ADR 0009.
 *
 * Herausgezogen aus `linear-solver.ts`, damit die Kragarm-Demo dieselbe
 * Verdrahtung benutzt statt einer zweiten Kopie. Das Drumherum — Request-Ids,
 * offene Promises, ein nicht startender Worker — teilt sie sich mit dem
 * dünnbesetzten Port in `solver-worker-channel.ts`.
 */

import type { LinearSolveOutcome } from '@baustatik/fem-solver';
import { createSolverWorkerChannel } from './solver-worker-channel';

const channel = createSolverWorkerChannel(
  () =>
    new Worker(new URL('./linear-solver.worker.ts', import.meta.url), {
      type: 'module',
    }),
  'Solver-Worker',
);

/**
 * Passt auf `LinearSolve` aus `@baustatik/fem-solver`.
 *
 * `K` und `F` werden KOPIERT, nicht übertragen. Übertragen wäre schneller, aber
 * es würde die Arrays des Aufrufers im Hauptthread unbrauchbar zurücklassen —
 * und der Port-Vertrag sagt nichts darüber aus, dass er sie verschlingen darf.
 * Bei den heutigen Modellgrößen ist die Kopie nicht messbar.
 */
export function solveLinearSystem(
  n: number,
  K: Float64Array,
  rhsColumns: number,
  F: Float64Array,
): Promise<LinearSolveOutcome> {
  return channel.solve((id) => ({
    type: 'solve',
    id,
    n,
    k: K,
    rhsColumns,
    f: F,
  }));
}
