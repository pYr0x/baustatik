/**
 * Der Nachrichtenkanal zu einem Löser-Worker — einmal, für beide Rechenwege.
 *
 * WAS HIER STEHT, IST NICHT DER LÖSER, sondern das Drumherum: Request-Ids,
 * die Zuordnung Antwort → offenes Promise, und die Frage, was passiert, wenn
 * der Worker gar nicht erst startet. Das ist bei `dense` und `sparse` Wort für
 * Wort dasselbe; verschieden sind nur der Worker und die Form der Anfrage.
 *
 * JE PORT EIN EIGENER KANAL, und das bleibt so: beide Wege haben ein eigenes
 * WASM-Artefakt, und ein gemeinsamer Worker lüde beide, auch wer nur einen
 * rechnet (ADR 0042). Der Worker startet deshalb erst beim ersten Aufruf.
 *
 * `@baustatik/fem-solver` kennt diese Verdrahtung nicht. Es bekommt nur die
 * Portfunktion herein und hängt dadurch weder an WASM noch an `Worker`
 * (ADR 0009).
 */

import type { LinearSolveOutcome } from '@baustatik/fem-solver';

/**
 * Was ein Löser-Worker zurückmeldet — für beide Fassungen gleich.
 *
 * `singular` ist ein Befund über das MODELL und deshalb kein `failed`: das
 * Modell ist unbrauchbar, der Worker nicht. Nur so bleibt ein abgestürzter
 * Worker davon unterscheidbar.
 */
export type SolveResponse =
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

export type SolverWorkerChannel = {
  /**
   * Eine Anfrage abschicken. `request` bekommt die vergebene Id und liefert
   * die Nachricht, die der Worker erwartet — die einzige Stelle, an der sich
   * die beiden Wege unterscheiden.
   */
  solve: (
    request: (id: number) => Record<string, unknown>,
  ) => Promise<LinearSolveOutcome>;
};

/**
 * Ein Kanal zu einem noch nicht gestarteten Worker.
 *
 * `startWorker` ist eine Funktion und keine URL: Vite erkennt einen Worker nur
 * an einem `new Worker(new URL('./x.worker.ts', import.meta.url))` mit
 * LITERALEM Pfad und bündelt ihn sonst nicht mit.
 *
 * `label` geht in die Fehlermeldungen ein, damit ein nicht startender Worker
 * sagt, WELCHER Rechenweg klemmt.
 */
export function createSolverWorkerChannel(
  startWorker: () => Worker,
  label: string,
): SolverWorkerChannel {
  let nextRequestId = 0;
  let worker: Worker | undefined;
  const pending = new Map<number, Pending>();

  function rejectAll(reason: Error): void {
    for (const { reject } of pending.values()) {
      reject(reason);
    }
    pending.clear();
  }

  function handleMessage({ data }: MessageEvent<SolveResponse>): void {
    const open = pending.get(data.id);
    if (!open) return;

    pending.delete(data.id);

    if (data.type === 'solved') {
      open.resolve({ kind: 'solved', d: data.d });
    } else if (data.type === 'singular') {
      // Ein Befund über das Modell, kein Fehler des Ports — deshalb `resolve`.
      // `fem-solver` macht daraus den `SingularStiffnessMatrixError`, weil nur
      // dort bekannt ist, welcher Knoten hinter der Zeile steckt.
      open.resolve({
        kind: 'singular',
        index: data.index,
        pivotRatio: data.pivotRatio,
      });
    } else {
      open.reject(new Error(data.message));
    }
  }

  function getWorker(): Worker {
    if (worker) return worker;

    worker = startWorker();
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', ({ message }: ErrorEvent) => {
      rejectAll(
        new Error(message || `Der ${label} konnte nicht gestartet werden.`),
      );
    });
    worker.addEventListener('messageerror', () => {
      rejectAll(new Error(`Die Nachricht des ${label}s ist ungültig.`));
    });

    return worker;
  }

  return {
    solve(request) {
      const id = nextRequestId++;
      const solverWorker = getWorker();

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        solverWorker.postMessage(request(id));
      });
    },
  };
}
