/**
 * Die beiden WASM-Artefakte, einmal geladen.
 *
 * HIER LIEGT DER GRUND, WARUM ES DIESES PACKAGE GIBT (ADR 0047): es importiert
 * BEIDE Artefakte und ist damit der Orchestrator. `@baustatik/cross-section`
 * bleibt dadurch DURCH KONSTRUKTION frei von WASM statt durch Disziplin.
 *
 * ZWEI LAUFZEITEN, EINE TUER. Der Mesher ist Emscripten und laedt sein Modul in
 * Node wie im Browser selbst. Der Loeser ist wasm-bindgen im Web-Ziel: er holt
 * sein `.wasm` per `fetch`, und `fetch` kennt kein `file:`. In Node faellt
 * dieser Aufruf deshalb aus, und erst dann — nie im Browser — wird das Artefakt
 * ueber `node:module` von der Platte gelesen.
 */

import {
  createMesher2D,
  type Mesh2DInput,
  type Mesh2DResult,
} from '@baustatik/mesh-2d-wasm';
import init, {
  initSync,
  solve as sparseSolve,
} from '@baustatik/sparse-solver-wasm';
import type { SparseSolve } from './compute';

let mesher: Promise<(input: Mesh2DInput) => Mesh2DResult> | undefined;
let solver: Promise<SparseSolve> | undefined;

/** Der Mesher, einmal initialisiert und danach synchron. */
export async function getMesher(): Promise<
  (input: Mesh2DInput) => Mesh2DResult
> {
  mesher ??= createMesher2D().then(
    (created) => (input: Mesh2DInput) => created.generate(input),
  );
  return mesher;
}

/**
 * Der Loeser als reine Funktion.
 *
 * `SparseSolveOutcome` ist eine wasm-bindgen-Struct, also ein Zeiger in den
 * WASM-Speicher. Sie wird deshalb IN JEDEM FALL freigegeben — auch wenn
 * `unfixed` gilt oder das Kopieren wirft. Ohne das waechst der Heap mit jedem
 * Querschnitt.
 */
export async function getSolver(): Promise<SparseSolve> {
  solver ??= initialiseSolver().then(
    () =>
      (n, rows, cols, values, rhsColumns, f): Float64Array => {
        const outcome = sparseSolve(n, rows, cols, values, rhsColumns, f);
        try {
          if (outcome.unfixed) {
            throw new Error(
              'Die FE-Matrix ist nicht positiv definit — das Netz zerfaellt ' +
                `oder die Fixierung fehlt (Zeile ${outcome.singularIndex}).`,
            );
          }
          return new Float64Array(outcome.d);
        } finally {
          outcome.free();
        }
      },
  );
  return solver;
}

async function initialiseSolver(): Promise<void> {
  try {
    await init();
    return;
  } catch (error) {
    const bytes = await readSolverArtifact();
    if (bytes === undefined) throw error;
    initSync({ module: bytes });
  }
}

/**
 * Das `.wasm` des Loesers von der Platte — NUR IN NODE.
 *
 * Der Modulname steht in einer Variablen und der Aufruf traegt `@vite-ignore`:
 * so versucht kein Bundler, `node:module` in ein Browserbuendel zu ziehen.
 */
async function readSolverArtifact(): Promise<Uint8Array | undefined> {
  const nodeFs = 'node:fs/promises';
  const nodeUrl = 'node:url';
  try {
    // `import.meta.resolve` und nicht `createRequire(...).resolve`: die
    // Exportkarte des Loesers kennt nur die `import`-Bedingung, und CommonJS
    // faellt daran mit `ERR_PACKAGE_PATH_NOT_EXPORTED` aus.
    const meta = import.meta as ImportMeta & {
      readonly resolve?: (specifier: string) => string;
    };
    const entry = meta.resolve?.('@baustatik/sparse-solver-wasm');
    if (entry === undefined) return undefined;
    const { readFile } = await import(/* @vite-ignore */ nodeFs);
    const { fileURLToPath } = await import(/* @vite-ignore */ nodeUrl);
    const artifact = new URL('./sparse_solver_wasm_bg.wasm', entry);
    return await readFile(fileURLToPath(artifact));
  } catch {
    return undefined;
  }
}
