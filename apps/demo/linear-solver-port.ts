/**
 * Der Linearsolver als PORT: `K d = F` im Worker, damit der Hauptthread nicht
 * blockiert.
 *
 * Diese Datei ist die Verdrahtung, die `@baustatik/fem-solver` bewusst NICHT
 * kennt. Das Package bekommt nur die Funktion herein (`solveLinearSystem` in
 * seiner Config) und haengt dadurch weder an WASM noch an `Worker` — und bleibt
 * ohne beides testbar. Siehe ADR 0009.
 *
 * Herausgezogen aus `linear-solver.ts`, damit die Kragarm-Demo dieselbe
 * Verdrahtung benutzt statt einer zweiten Kopie.
 */

type SolveResponse =
  | { readonly type: 'solved'; readonly id: number; readonly d: Float64Array }
  | { readonly type: 'failed'; readonly id: number; readonly message: string };

type Pending = {
  resolve: (d: Float64Array) => void;
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
    pending.resolve(data.d);
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

  worker = new Worker(new URL('./linear-solver.worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', handleWorkerMessage);
  worker.addEventListener('error', ({ message }: ErrorEvent) => {
    rejectPendingSolves(
      new Error(message || 'Der Solver-Worker konnte nicht gestartet werden.'),
    );
  });
  worker.addEventListener('messageerror', () => {
    rejectPendingSolves(new Error('Die Nachricht des Solver-Workers ist ungültig.'));
  });

  return worker;
}

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
  F: Float64Array,
): Promise<Float64Array> {
  const id = nextRequestId++;
  const solverWorker = getWorker();

  return new Promise((resolve, reject) => {
    pendingSolves.set(id, { resolve, reject });
    solverWorker.postMessage({ type: 'solve', id, n, k: K, f: F });
  });
}
