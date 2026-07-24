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

    const d = solve(data.n, data.k, data.f);
    workerScope.postMessage({ type: "solved", id: data.id, d }, [
      d.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerScope.postMessage({ type: "failed", id: data.id, message });
  }
});
