/**
 * Der DÜNNBESETZTE Linearsolver als PORT: `K d = F` im Worker, damit der
 * Hauptthread nicht blockiert.
 *
 * Das Gegenstück zu `linear-solver-port.ts`, und bewusst ein eigener Worker:
 * beide Wege haben ein eigenes WASM-Artefakt, und ein gemeinsamer Worker lüde
 * beide, auch wer nur einen rechnet (ADR 0042). Der Worker startet deshalb erst
 * beim ersten Aufruf — wer `linearSystem: 'sparse'` eingestellt hat, lädt den
 * dichten Löser nie.
 *
 * Das Drumherum teilen sich beide Ports (`solver-worker-channel.ts`);
 * verschieden sind nur der Worker und die Form der Anfrage.
 *
 * `@baustatik/fem-solver` kennt diese Verdrahtung nicht. Es bekommt nur die
 * Funktion herein (`solveSparseSystem` in seiner Config) und hängt dadurch
 * weder an WASM noch an `Worker` (ADR 0009).
 */

import type { LinearSolveOutcome } from '@baustatik/fem-solver';
import { createSolverWorkerChannel } from './solver-worker-channel';

const channel = createSolverWorkerChannel(
  () =>
    new Worker(new URL('./sparse-solver.worker.ts', import.meta.url), {
      type: 'module',
    }),
  'dünnbesetzte Solver-Worker',
);

/**
 * Passt auf `SparseSolve` aus `@baustatik/fem-solver`.
 *
 * Die vier Arrays werden KOPIERT, nicht übertragen — derselbe Grund wie beim
 * dichten Port: übertragen ließe sie im Hauptthread unbrauchbar zurück, und der
 * Port-Vertrag sagt nichts darüber, dass er sie verschlingen darf.
 */
export function solveSparseSystem(
  n: number,
  rows: Uint32Array,
  cols: Uint32Array,
  values: Float64Array,
  rhsColumns: number,
  F: Float64Array,
): Promise<LinearSolveOutcome> {
  return channel.solve((id) => ({
    type: 'solve',
    id,
    n,
    rows,
    cols,
    values,
    rhsColumns,
    f: F,
  }));
}
