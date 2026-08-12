/**
 * Die beiden PRODUKTIVEN Löser, als Ports für die Messreihe.
 *
 * WARUM DIESE DATEI EXISTIERT: Eine Messung, die eine nachgebaute
 * Gauß-Elimination befragt, misst die nachgebaute Gauß-Elimination. Was
 * `docs/messungen/kinematik-abstand.md` belegen soll, sind aber die beiden
 * Zerlegungen, die die Anwendung wirklich rechnet — `faer`s dichtes `Llt` und
 * `faer`s dünnbesetztes Cholesky mit AMD-Umordnung. Nur die können
 * beantworten, ob die Schwelle `1e-12` für BEIDE Wege die richtige ist: AMD
 * und fill-in ändern die Reihenfolge der Operationen und damit die Rundung.
 *
 * DIE PORT-ISOLATION AUS ADR 0009 BLEIBT UNANGETASTET. `src/` sieht die beiden
 * WASM-Packages nach wie vor nicht; sie stehen als `devDependencies` da und
 * werden von genau einer Datei benutzt, und die ist ein MESSGERÄT. Fehlt das
 * gebaute `pkg/` — es ist nicht eingecheckt —, liefert `loadWasmSolvers()`
 * `undefined`, und die Messung überspringt sich. Die Regressionstests dieses
 * Packages laufen weiterhin ohne WASM-Toolchain, mit den Testfassungen aus
 * `support.ts`.
 *
 * DER NEBENKANAL: `LinearSolveOutcome` kennt im gelungenen Fall kein Pivot —
 * es interessiert die Rechnung dort nicht. Die Crates melden es trotzdem, und
 * genau dieser Wert ist der interessante. Er geht deshalb über eine `probe` an
 * der Messung vorbei am Port-Vertrag, statt ihn zu verbiegen.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LinearSolve, LinearSolveOutcome, SparseSolve } from '../src';

/** Der Nebenkanal: das kleinste skalierte Pivot der letzten Zerlegung. */
export type PivotProbe = { minPivot: number };

export type WasmSolvers = {
  readonly solveLinearSystem: LinearSolve;
  readonly solveSparseSystem: SparseSolve;
};

/**
 * Die `.wasm`-Bytes eines der beiden Packages.
 *
 * ZWEI KANDIDATEN, weil `initSync` Bytes will und keinen Modulnamen: einmal die
 * pnpm-Verknüpfung unter `node_modules`, einmal die Lage im Monorepo. Der Weg
 * über `import.meta.resolve` schiede aus — die `exports` der beiden Packages
 * kennen nur den Einstiegspunkt, nicht die Artefaktdatei daneben.
 */
function wasmBytes(pkg: string, file: string): Buffer | undefined {
  const candidates = [
    new URL(`../node_modules/@baustatik/${pkg}/pkg/${file}`, import.meta.url),
    new URL(`../../${pkg}/pkg/${file}`, import.meta.url),
  ];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    if (existsSync(path)) return readFileSync(path);
  }
  return undefined;
}

/**
 * Beide Crates, geladen und initialisiert — oder `undefined`, wenn eines der
 * `pkg/`-Artefakte fehlt.
 *
 * `undefined` statt eines Wurfs, weil „ich weiß es nicht" hier eine legitime
 * Antwort ist: ohne Rust-Toolchain und ohne Docker gibt es die Artefakte nicht,
 * und das ist kein Fehler des Aufrufers (`CODING_STANDARDS.md` §3).
 */
export async function loadWasmSolvers(
  probe: PivotProbe,
): Promise<WasmSolvers | undefined> {
  const denseBytes = wasmBytes('linear-solver-wasm', 'linear_solver_wasm_bg.wasm');
  const sparseBytes = wasmBytes(
    'sparse-solver-wasm',
    'sparse_solver_wasm_bg.wasm',
  );
  if (denseBytes === undefined || sparseBytes === undefined) return undefined;

  const dense = await import('@baustatik/linear-solver-wasm');
  const sparse = await import('@baustatik/sparse-solver-wasm');
  dense.initSync({ module: denseBytes });
  sparse.initSync({ module: sparseBytes });

  return {
    solveLinearSystem: (n, K, rhsColumns, F): LinearSolveOutcome => {
      probe.minPivot = Number.NaN;
      if (n === 0) return { kind: 'solved', d: new Float64Array(0) };

      // `SolveOutcome` ist ein Zeiger in den WASM-Speicher: erst alle Getter
      // lesen, dann `free()` — sonst wächst der Heap über den Korpus hinweg.
      const outcome = dense.solve(n, K, rhsColumns, F);
      try {
        probe.minPivot = outcome.pivotRatio;
        const singularIndex = outcome.singularIndex;
        if (singularIndex >= 0) {
          return {
            kind: 'singular',
            index: singularIndex,
            pivotRatio: outcome.pivotRatio,
          };
        }
        return { kind: 'solved', d: outcome.d };
      } finally {
        outcome.free();
      }
    },

    solveSparseSystem: (
      n,
      rows,
      cols,
      values,
      rhsColumns,
      F,
    ): LinearSolveOutcome => {
      probe.minPivot = Number.NaN;
      if (n === 0) return { kind: 'solved', d: new Float64Array(0) };

      const outcome = sparse.solve(n, rows, cols, values, rhsColumns, F);
      try {
        probe.minPivot = outcome.pivotRatio;
        // `unfixed` heißt in der Sprache dieses Crates „die Matrix ist nicht
        // positiv definit". Was das FÜR EIN STABWERK bedeutet — Kinematik —,
        // steht nicht im Crate; die Übersetzung macht dieser Adapter, genau
        // wie der Worker der Demo.
        if (outcome.unfixed) {
          return {
            kind: 'singular',
            index: outcome.singularIndex,
            pivotRatio: outcome.pivotRatio,
          };
        }
        return { kind: 'solved', d: outcome.d };
      } finally {
        outcome.free();
      }
    },
  };
}
