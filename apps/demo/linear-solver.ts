// [2 0; 0 3] * d = [4; 9] -> d = [2; 3]
const k = new Float64Array([2.0, 0.0, 0.0, 3.0]);
const f = new Float64Array([4.0, 9.0]);

type SolveResponse =
  | { readonly type: "solved"; readonly id: number; readonly d: Float64Array }
  | { readonly type: "failed"; readonly id: number; readonly message: string };

const worker = new Worker(new URL("./linear-solver.worker.ts", import.meta.url), {
  type: "module",
});

let nextRequestId = 0;
const pendingSolves = new Map<
  number,
  {
    resolve: (d: Float64Array) => void;
    reject: (reason: Error) => void;
  }
>();

worker.addEventListener("message", ({ data }: MessageEvent<SolveResponse>) => {
  const pending = pendingSolves.get(data.id);
  if (!pending) return;

  pendingSolves.delete(data.id);

  if (data.type === "solved") {
    pending.resolve(data.d);
  } else {
    pending.reject(new Error(data.message));
  }
});

function rejectPendingSolves(reason: Error): void {
  for (const { reject } of pendingSolves.values()) {
    reject(reason);
  }

  pendingSolves.clear();
}

worker.addEventListener("error", ({ message }: ErrorEvent) => {
  rejectPendingSolves(new Error(message || "Der Solver-Worker konnte nicht gestartet werden."));
});

worker.addEventListener("messageerror", () => {
  rejectPendingSolves(new Error("Die Nachricht des Solver-Workers ist ungültig."));
});

function solveInWorker(
  n: number,
  stiffness: Float64Array,
  load: Float64Array,
): Promise<Float64Array> {
  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    pendingSolves.set(id, { resolve, reject });
    // Die Eingaben werden übertragen statt kopiert und sind danach im Hauptthread nicht mehr nutzbar.
    worker.postMessage({ type: "solve", id, n, k: stiffness, f: load }, [
      stiffness.buffer as ArrayBuffer,
      load.buffer as ArrayBuffer,
    ]);
  });
}

const d = await solveInWorker(2, k, f);

console.log("d =", d); // erwartet: [2, 3]
