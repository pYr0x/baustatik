import init, { solve } from "@baustatik/linear-solver-wasm";

type SolveRequest = {
  readonly type: "solve";
  readonly id: number;
  readonly n: number;
  readonly k: Float64Array;
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

    // `SolveOutcome` ist eine wasm-bindgen-Struct, also ein Zeiger in den
    // WASM-Speicher: sie ueberlebt kein `postMessage`. Deshalb erst die Getter
    // auslesen, dann ein einfaches Objekt schicken — und in jedem Fall `free()`,
    // sonst waechst der WASM-Heap mit jedem Loesen.
    const outcome = solve(data.n, data.k, data.f);
    try {
      const singularIndex = outcome.singularIndex;

      // Kinematik ist KEIN `failed`: das Modell ist unbrauchbar, der Worker
      // nicht. Nur so bleibt ein abgestuerzter Worker davon unterscheidbar.
      if (singularIndex >= 0) {
        workerScope.postMessage({
          type: "singular",
          id: data.id,
          index: singularIndex,
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
