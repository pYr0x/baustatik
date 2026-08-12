import init, { solve } from "@baustatik/sparse-solver-wasm";

type SolveRequest = {
  readonly type: "solve";
  readonly id: number;
  readonly n: number;
  readonly rows: Uint32Array;
  readonly cols: Uint32Array;
  readonly values: Float64Array;
  /** Wie viele rechte Seiten in `f` stehen — `solveAll` buendelt sie. */
  readonly rhsColumns: number;
  readonly f: Float64Array;
};

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<SolveRequest>) => void,
  ): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const wasmReady = init();
const workerScope = self as unknown as WorkerScope;

workerScope.addEventListener("message", async ({ data }: MessageEvent<SolveRequest>) => {
  try {
    await wasmReady;

    // `SparseSolveOutcome` ist eine wasm-bindgen-Struct, also ein Zeiger in den
    // WASM-Speicher: sie ueberlebt kein `postMessage`. Deshalb erst die Getter
    // auslesen, dann ein einfaches Objekt schicken — und in jedem Fall `free()`,
    // sonst waechst der WASM-Heap mit jedem Loesen.
    const outcome = solve(
      data.n,
      data.rows,
      data.cols,
      data.values,
      data.rhsColumns,
      data.f,
    );
    try {
      // `unfixed` heisst in der Sprache dieses Crates „die Matrix ist nicht
      // positiv definit". Was das FUER EIN STABWERK bedeutet — Kinematik —,
      // steht nicht im Crate; die Uebersetzung macht dieser Adapter, indem er
      // dieselbe Antwort schickt wie der dichte Worker. Und wie dort ist das
      // KEIN `failed`: das Modell ist unbrauchbar, der Worker nicht.
      if (outcome.unfixed) {
        workerScope.postMessage({
          type: "singular",
          id: data.id,
          index: outcome.singularIndex,
          pivotRatio: outcome.pivotRatio,
        });
        return;
      }

      const d = outcome.d;
      workerScope.postMessage({ type: "solved", id: data.id, d }, [
        d.buffer as ArrayBuffer,
      ]);
    } finally {
      outcome.free();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerScope.postMessage({ type: "failed", id: data.id, message });
  }
});
