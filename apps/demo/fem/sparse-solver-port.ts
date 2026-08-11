/**
 * Der DUENNBESETZTE Linearsolver als PORT: `K d = F` im Worker, damit der
 * Hauptthread nicht blockiert.
 *
 * Das Gegenstueck zu `linear-solver-port.ts`, und bewusst eine eigene Datei mit
 * einem eigenen Worker. Beide Wege haben ein eigenes WASM-Artefakt; ein
 * gemeinsamer Worker laedt beide, auch wer nur einen rechnet (ADR 0042). Der
 * Worker startet deshalb erst beim ersten Aufruf — wer `linearSystem: 'sparse'`
 * eingestellt hat, laedt den dichten Loeser nie.
 *
 * `@baustatik/fem-solver` kennt diese Verdrahtung nicht. Es bekommt nur die
 * Funktion herein (`solveSparseSystem` in seiner Config) und haengt dadurch
 * weder an WASM noch an `Worker` (ADR 0009).
 */

import type { LinearSolveOutcome } from '@baustatik/fem-solver';

type SolveResponse =
  | { readonly type: 'solved'; readonly id: number; readonly d: Float64Array }
  | {
      readonly type: 'singular';
      readonly id: number;
      readonly index: number;
      readonly pivotRatio: number;
    }
  | { readonly type: 'failed'; readonly id: number; readonly message: string };

type Pending = {
  resolve: (outcome: LinearSolveOutcome) => void;
  reject: (reason: Error) => void;
};

let nextRequestId = 0;
let worker: Worker | undefined;
const pendingSolves = new Map<number, Pending>();

function handleWorkerMessage({ data }: MessageEvent<SolveResponse>): void {
  const pending = pendingSolves.get(data.id);
  if (!pending) return;

  pendingSolves.delete(data.id);

  if (data.type === 'solved') {
    pending.resolve({ kind: 'solved', d: data.d });
  } else if (data.type === 'singular') {
    // Ein Befund ueber das Modell, kein Fehler des Ports — deshalb `resolve`.
    // `fem-solver` macht daraus den `SingularStiffnessMatrixError`, weil nur
    // dort bekannt ist, welcher Knoten hinter der Zeile steckt.
    pending.resolve({
      kind: 'singular',
      index: data.index,
      pivotRatio: data.pivotRatio,
    });
  } else {
    pending.reject(new Error(data.message));
  }
}

function rejectPendingSolves(reason: Error): void {
  for (const { reject } of pendingSolves.values()) {
    reject(reason);
  }
  pendingSolves.clear();
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./sparse-solver.worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', handleWorkerMessage);
  worker.addEventListener('error', ({ message }: ErrorEvent) => {
    rejectPendingSolves(
      new Error(
        message || 'Der dünnbesetzte Solver-Worker konnte nicht gestartet werden.',
      ),
    );
  });
  worker.addEventListener('messageerror', () => {
    rejectPendingSolves(
      new Error('Die Nachricht des dünnbesetzten Solver-Workers ist ungültig.'),
    );
  });

  return worker;
}

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
  const id = nextRequestId++;
  const solverWorker = getWorker();

  return new Promise((resolve, reject) => {
    pendingSolves.set(id, { resolve, reject });
    solverWorker.postMessage({
      type: 'solve',
      id,
      n,
      rows,
      cols,
      values,
      rhsColumns,
      f: F,
    });
  });
}
